/**
 * Documentation-conformance suite for issue #246 (Round 2's fix for QA Round-1 defects 1 and 2; Round
 * 3's fix for QA Round-2 defect 5).
 *
 * Round 1 shipped two brand-new invariants across the six `.claude/agents/*.md` files with NO test
 * pinning either: (a) `idea-strategist.md` carries no `Bash` grant at all, and (b) no agent's
 * `description:` field names the Operator's own Brand. QA's Round-1 Verdict flagged both as
 * silently regressable. This file closes that gap, and ALSO pins the Round-2 fix itself: every
 * `Bash`-retaining agent's `tools:` frontmatter grants only SCOPED `Bash(<pattern>)` entries — never a
 * bare, unscoped `Bash` — so a future edit that widens any of these back to a blanket `Bash` fails the
 * build instead of passing quietly.
 *
 * Round 2 shipped `trend-scout.md`/`performance-tracker.md` with `Bash(set -a *)` — a pattern that reads
 * as a correct scope but is, empirically, non-functional: Claude Code hard-blocks ANY wildcard `Bash`
 * grant anchored on `set` (it mutates shell option state), so every real invocation of the `.env`-load
 * step would have hit an unexpected manual-approval prompt. QA's Round-2 Verdict caught this live, and
 * it was independently reproduced during Round 3 (see this issue's `handoff.md`). The fix — the exact,
 * literal, full command with NO wildcard — is pinned below (a STATIC check: no wildcard-anchored-on-`set`
 * pattern is granted anywhere). **What this suite deliberately does NOT and CANNOT prove: that the
 * exact-match grant actually authorises the command at runtime.** That requires a live Claude Code
 * permission call (as both QA and this round's own verification used) — outside what a hermetic,
 * no-live-call suite can exercise. This is stated here plainly rather than implied as covered; the
 * regression this suite DOES catch is a future edit re-introducing the wildcard shape that is already
 * known, empirically, not to work.
 *
 * Kept as a `*.docs-test.ts` (run by `npm run test:docs`, and by `npm test`'s combined glob), matching
 * the naming convention every other suite pinning `.claude/agents/*.md` content already uses.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");

const ALL_AGENT_FILES = [
  "developer.md",
  "idea-strategist.md",
  "performance-tracker.md",
  "producer.md",
  "qa.md",
  "trend-scout.md",
] as const;

const BASH_RETAINING_AGENT_FILES = [
  "developer.md",
  "performance-tracker.md",
  "producer.md",
  "qa.md",
  "trend-scout.md",
] as const;

async function readAgent(file: string): Promise<string> {
  return readFile(join(AGENTS_DIR, file), "utf8");
}

/** Pulls the raw value of the `tools:` frontmatter line (everything after `tools:`, one physical line). */
function extractToolsLine(doc: string): string {
  const match = doc.match(/^tools:\s*(.*)$/m);
  assert.ok(match, "every agent file must declare a tools: frontmatter line");
  return match![1]!.trim();
}

/**
 * Splits a `tools:` line into individual comma-separated entries. A `Bash(<pattern>)` entry's own
 * pattern can itself contain characters that look like separators (spaces, wildcards) but never a
 * literal comma in any pattern used across these six files today, so a plain comma-split is safe and
 * exactly mirrors how Claude Code itself parses this same frontmatter field.
 */
function splitToolEntries(toolsLine: string): string[] {
  return toolsLine.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** Pulls the raw value of the `description:` frontmatter line (one physical line, YAML-quoted). */
function extractDescription(doc: string): string {
  const match = doc.match(/^description:\s*(.*)$/m);
  assert.ok(match, "every agent file must declare a description: frontmatter line");
  return match![1]!;
}

describe("issue #246 Round 2 — no agent tools: list carries a bare, unscoped Bash entry", () => {
  it("idea-strategist carries no Bash entry of any kind", async () => {
    const entries = splitToolEntries(extractToolsLine(await readAgent("idea-strategist.md")));
    assert.ok(
      !entries.some((entry) => entry === "Bash" || entry.startsWith("Bash(")),
      "idea-strategist.md must grant zero Bash entries, scoped or otherwise — it performs no shell-out",
    );
  });

  for (const file of BASH_RETAINING_AGENT_FILES) {
    it(`${file} grants no bare, unscoped Bash entry`, async () => {
      const entries = splitToolEntries(extractToolsLine(await readAgent(file)));
      const bareBash = entries.filter((entry) => entry === "Bash");
      assert.equal(
        bareBash.length,
        0,
        `${file} must not grant a bare "Bash" — every Bash grant must be a scoped "Bash(<pattern>)" entry`,
      );
    });

    it(`${file} grants at least one scoped Bash(<pattern>) entry (it genuinely needs shell access)`, async () => {
      const entries = splitToolEntries(extractToolsLine(await readAgent(file)));
      const scopedBash = entries.filter((entry) => entry.startsWith("Bash(") && entry.endsWith(")"));
      assert.ok(scopedBash.length > 0, `${file} must grant at least one Bash(<pattern>) entry`);
    });

    it(`${file} grants no wildcard Bash pattern anchored on an environment-mutating shell builtin (set)`, async () => {
      const entries = splitToolEntries(extractToolsLine(await readAgent(file)));
      const unsafeWildcard = entries.filter(
        (entry) => /^Bash\(\s*set\b.*\*\s*\)$/.test(entry),
      );
      assert.equal(
        unsafeWildcard.length,
        0,
        `${file} must not grant a wildcard Bash(set...*) entry — Claude Code hard-blocks any wildcard ` +
          `grant anchored on "set" (it mutates shell option state), regardless of the wildcard's suffix; ` +
          `an environment-mutating builtin must be granted as the exact, literal, full command only`,
      );
    });
  }
});

describe("issue #246 Round 2 — each Bash-retaining agent's scoped grants cover its own documented need", () => {
  it("developer can run git inspection/staging/committing, read-only gh, the test/build/validate commands, and its two code-running tools", async () => {
    const toolsLine = extractToolsLine(await readAgent("developer.md"));
    for (const pattern of [
      "Bash(git status *)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git show *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git branch *)",
      "Bash(gh issue view *)",
      "Bash(npm test)",
      "Bash(npm run build)",
      "Bash(npm run test:docs)",
      "Bash(npx tsx *)",
      "Bash(node --import tsx --test *)",
      "Bash(openspec validate *)",
    ]) {
      assert.ok(toolsLine.includes(pattern), `developer.md's tools: line must include "${pattern}"`);
    }
    assert.ok(!toolsLine.includes("Bash(git push"), "developer.md must never be granted git push");
    assert.ok(!toolsLine.includes("Bash(gh pr"), "developer.md must never be granted any gh pr subcommand");
  });

  it("qa can run npm test, npm run test:docs, openspec validate, and read-only git/gh — nothing that writes", async () => {
    const toolsLine = extractToolsLine(await readAgent("qa.md"));
    for (const pattern of [
      "Bash(npm test)",
      "Bash(npm run test:docs)",
      "Bash(openspec validate *)",
      "Bash(git status *)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git show *)",
      "Bash(gh issue view *)",
    ]) {
      assert.ok(toolsLine.includes(pattern), `qa.md's tools: line must include "${pattern}"`);
    }
    assert.ok(!toolsLine.includes("Bash(git commit"), "qa.md must never be granted a write git command");
    assert.ok(!toolsLine.includes("Bash(npm install"), "qa.md must never be granted npm install");
  });

  it("qa's one file-write tool is path-scoped to a handoff.md under openspec/changes/, never a bare Edit or Write", async () => {
    const entries = splitToolEntries(extractToolsLine(await readAgent("qa.md")));
    assert.ok(
      entries.includes("Edit(openspec/changes/**/handoff.md)"),
      "qa.md's tools: line must grant exactly Edit(openspec/changes/**/handoff.md)",
    );
    assert.ok(!entries.includes("Edit"), "qa.md must not grant a bare, unscoped Edit");
    assert.ok(!entries.includes("Write"), "qa.md must not grant Write at all");
  });

  const ENV_LOAD_EXACT_GRANT = "Bash(set -a; [ -f .env ] && . ./.env; set +a)";

  it("trend-scout can load .env (exact-match, no wildcard) and run curl, for the Apify scrape calls", async () => {
    const toolsLine = extractToolsLine(await readAgent("trend-scout.md"));
    assert.ok(
      toolsLine.includes(ENV_LOAD_EXACT_GRANT),
      `trend-scout.md's tools: line must include "${ENV_LOAD_EXACT_GRANT}"`,
    );
    assert.ok(toolsLine.includes("Bash(curl *)"), "trend-scout.md's tools: line must include \"Bash(curl *)\"");
  });

  it("performance-tracker can run the sanctioned track-performance/apify-smoke commands and the manual-debug curl fallback", async () => {
    const toolsLine = extractToolsLine(await readAgent("performance-tracker.md"));
    for (const pattern of [
      "Bash(npm run track-performance *)",
      "Bash(npm run apify-smoke *)",
      "Bash(npx tsx src/apify/live/smoke.ts *)",
      ENV_LOAD_EXACT_GRANT,
      "Bash(curl *)",
    ]) {
      assert.ok(toolsLine.includes(pattern), `performance-tracker.md's tools: line must include "${pattern}"`);
    }
  });

  it("producer can run exactly the Camera Hub upload and export-schedule fallback invocations", async () => {
    const toolsLine = extractToolsLine(await readAgent("producer.md"));
    assert.ok(
      toolsLine.includes("Bash(npx tsx src/commands/upload-camera-hub-scripts.ts *)"),
      "producer.md's tools: line must include the Camera Hub upload invocation",
    );
    assert.ok(
      toolsLine.includes("Bash(npm run export-schedule *)"),
      "producer.md's tools: line must include the export-schedule fallback invocation",
    );
  });
});

describe("issue #246 Round 2 — no agent description carries the Operator's brand name", () => {
  for (const file of ALL_AGENT_FILES) {
    it(`${file}'s description: field names no Operator brand`, async () => {
      const description = extractDescription(await readAgent(file));
      assert.doesNotMatch(
        description,
        /mundotip/i,
        `${file}'s description: field must not name the Operator's Brand (mundotip)`,
      );
      assert.doesNotMatch(
        description,
        /straw motion/i,
        `${file}'s description: field must not name the Operator's Brand (Straw Motion)`,
      );
    });
  }
});
