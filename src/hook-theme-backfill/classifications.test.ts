/**
 * Tests for `BRIEF_CLASSIFICATIONS` (`classifications.ts`, issue #206) — the static, hand-read
 * classification data for the 51 real Briefs that carry a `## Hook concept`/`## Hook Concept` heading.
 *
 * The critical test here (`"every classified entry's briefSha256 matches the REAL Brief file on disk"`)
 * ties this data to the actual repo content: if a Brief file is ever edited, its recorded hash stops
 * matching and this test fails LOUDLY, rather than the backfill silently applying a stale classification
 * to content nobody re-read. This is the one place this module touches disk — a test path, exempt from
 * the `node:fs` boundary guard by this repo's own convention (`isTestPath`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isHookType } from "../vocabulary/hook-type.ts";
import { isTheme } from "../vocabulary/theme.ts";

import { BRIEF_CLASSIFICATIONS } from "./classifications.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

/** The 10 real MundoTip Briefs with neither a hook heading nor a `format` field (issue #206's own read
 *  of the data, matching #219's problem statement exactly) — this module must classify NONE of them. */
const KNOWN_HEADINGLESS_BRIEF_PATHS = [
  "data/brands/mundotip/ideas/2026-W22/idea-01.md",
  "data/brands/mundotip/ideas/2026-W22/idea-02.md",
  "data/brands/mundotip/ideas/2026-W22/idea-03.md",
  "data/brands/mundotip/ideas/2026-W22/idea-04.md",
  "data/brands/mundotip/ideas/2026-W22/idea-05.md",
  "data/brands/mundotip/ideas/2026-W22/idea-06.md",
  "data/brands/mundotip/ideas/2026-W22/idea-07.md",
  "data/brands/mundotip/ideas/2026-W22/idea-08.md",
  "data/brands/mundotip/ideas/2026-W22/idea-09.md",
  "data/brands/mundotip/ideas/2026-W22/idea-10.md",
];

async function sha256OfFile(relativePath: string): Promise<string> {
  const content = await readFile(join(REPO_ROOT, relativePath), "utf8");
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

describe("BRIEF_CLASSIFICATIONS — exactly the 51 readable Briefs, each proven against real content (issue #206)", () => {
  it("carries exactly 51 entries — the measured split (39 'Hook concept' + 12 'Hook Concept')", () => {
    assert.equal(BRIEF_CLASSIFICATIONS.length, 51);
  });

  it("every briefSha256 is unique — no Brief classified twice", () => {
    const hashes = BRIEF_CLASSIFICATIONS.map((e) => e.briefSha256);
    assert.equal(new Set(hashes).size, hashes.length);
  });

  it("every classified entry's briefSha256 matches the REAL Brief file on disk, byte for byte", async () => {
    for (const entry of BRIEF_CLASSIFICATIONS) {
      if (entry.kind !== "classified") continue;
      const actual = await sha256OfFile(entry.briefPath);
      assert.equal(
        actual,
        entry.briefSha256,
        `${entry.briefPath}: recorded hash is stale — the Brief's content has changed since this classification was made`,
      );
    }
  });

  it("every classified entry's hookType/theme is a real, closed-vocabulary member — never 'unclassified' (that is the importer's job, not this classifier's)", () => {
    for (const entry of BRIEF_CLASSIFICATIONS) {
      if (entry.kind !== "classified") continue;
      assert.ok(isHookType(entry.hookType), `${entry.briefPath}: "${entry.hookType}" is not a real hook_type`);
      assert.notEqual(entry.hookType, "unclassified", `${entry.briefPath}: a real classification must never be "unclassified"`);
      assert.ok(isTheme(entry.theme), `${entry.briefPath}: "${entry.theme}" is not a real theme`);
      assert.notEqual(entry.theme, "unclassified", `${entry.briefPath}: a real classification must never be "unclassified"`);
    }
  });

  it("every entry's hookTypeSource/themeSource is 'heading' or 'inferred'", () => {
    for (const entry of BRIEF_CLASSIFICATIONS) {
      if (entry.kind !== "classified") continue;
      assert.ok(["heading", "inferred"].includes(entry.hookTypeSource));
      assert.ok(["heading", "inferred"].includes(entry.themeSource));
    }
  });

  it("every classified entry carries a non-blank rationale — reviewability, not just a bare value", () => {
    for (const entry of BRIEF_CLASSIFICATIONS) {
      if (entry.kind !== "classified") continue;
      assert.ok(entry.rationale.trim().length > 0, `${entry.briefPath}: must carry a rationale`);
    }
  });

  it("none of the 10 known-headingless MundoTip Briefs are classified here — they stay the importer's own 'unclassified' default", async () => {
    const classifiedHashes = new Set(BRIEF_CLASSIFICATIONS.map((e) => e.briefSha256));
    for (const path of KNOWN_HEADINGLESS_BRIEF_PATHS) {
      const hash = await sha256OfFile(path);
      assert.equal(classifiedHashes.has(hash), false, `${path} must not be classified — it carries no hook heading`);
    }
  });

  it("this batch reports zero out-of-vocabulary Briefs — every one of the 51 genuinely fits the closed set (the 'reported, not forced' mechanism itself is proven separately, in backfill.test.ts, with synthetic data)", () => {
    const reported = BRIEF_CLASSIFICATIONS.filter((e) => e.kind === "reported");
    assert.deepEqual(reported, []);
  });

  it("counts every hook_type and theme used, for the Operator's own sanity check", () => {
    const hookTypeCounts: Record<string, number> = {};
    const themeCounts: Record<string, number> = {};
    for (const entry of BRIEF_CLASSIFICATIONS) {
      if (entry.kind !== "classified") continue;
      hookTypeCounts[entry.hookType] = (hookTypeCounts[entry.hookType] ?? 0) + 1;
      themeCounts[entry.theme] = (themeCounts[entry.theme] ?? 0) + 1;
    }
    const hookTotal = Object.values(hookTypeCounts).reduce((a, b) => a + b, 0);
    const themeTotal = Object.values(themeCounts).reduce((a, b) => a + b, 0);
    assert.equal(hookTotal, 51);
    assert.equal(themeTotal, 51);
  });
});
