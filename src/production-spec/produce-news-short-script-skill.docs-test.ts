import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for the `produce-news-short-script` Skill (issue #174; ADR-0018,
 * ADR-0021). Pins the Skill's promised names/paths/STOP rules so it can never silently drift from the
 * validator/checklist/spec-store/baseline-prompt-loader it points at. Mirrors
 * `produce-news-carousel-skill.docs-test.ts`'s own structure exactly.
 *
 * Kept OUT of the unit suite (`npm test`'s glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts") — run with `npm run test:docs`. Editing the Skill's prose must never break
 * `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SKILL_PATH = join(REPO_ROOT, ".claude", "skills", "produce-news-short-script", "SKILL.md");

describe("produce-news-short-script Skill — exists, invocable by slug (issue #174)", () => {
  it("exists and is readable", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares its own slug in the front-matter `name` field", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /^name:\s*produce-news-short-script\s*$/m);
  });

  it("carries a description naming the news-short-script Recipe and the thin Producer", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-short-script/);
    assert.match(text, /Producer/);
  });
});

describe("produce-news-short-script Skill — references the correct in-repo slugs/paths (issue #174)", () => {
  it("points at the Spec shape + validator", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-short-script-contract\.ts/);
    assert.match(text, /NewsShortScriptSpec/);
    assert.match(text, /news-short-script-validate\.ts/);
    assert.match(text, /validateNewsShortScriptSpec/);
    assert.match(text, /NEWS_SHORT_SCRIPT_ROLES/);
  });

  it("points at the banned-word scan", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-short-script-brand-safety\.ts/);
    assert.match(text, /scanNewsShortScriptForBannedWords/);
  });

  it("points at the baseline-prompt pointer + loader", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /format\/store\.ts/);
    assert.match(text, /loadFormat/);
    assert.match(text, /format\/baseline-prompt\.ts/);
    assert.match(text, /loadBaselinePrompt/);
  });

  it("points at the spec store (emit through the spec store)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /production-spec\/store\.ts/);
    assert.match(text, /saveSpec/);
    assert.match(text, /specPathFor/);
  });

  it("points at the Brand hard-rules reader", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /brand-profile\.ts/);
    assert.match(text, /loadBannedWords/);
  });

  it("points at the Producer's own render step — Shot List media collection", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /shot-list-media\.ts/);
    assert.match(text, /collectShotListMedia/);
  });
});

describe("produce-news-short-script Skill — STOP semantics stay true (issue #174)", () => {
  it("STOPs when the Baseline Prompt document is missing (any of the three not-found reasons)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /STOP/);
    assert.match(text, /found:\s*false/);
    assert.match(text, /"not-declared"/);
    assert.match(text, /"malformed"/);
    assert.match(text, /"dangling"/);
  });

  it("STOPs when the Idea brief cannot be read", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /brief cannot be read.{0,40}STOP|STOP.{0,80}brief/is);
  });

  it("treats a banned word as REJECT-only — STOP, never a silent swap (always-rule 6/9)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /banned word is REJECT-ONLY/i);
    assert.match(text, /STOP and report/i);
    assert.match(text, /never silently swap/i);
  });
});

describe("produce-news-short-script Skill — the required beat shape (hook -> story* -> cta) is documented (issue #174)", () => {
  it("states the fixed role order and the total word-count band", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /hook/);
    assert.match(text, /story/);
    assert.match(text, /cta/);
    assert.match(text, /120-150/);
  });

  it("states media_url is left unset rather than guessed when nothing specific is identifiable", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /never guess/i);
  });
});

describe("produce-news-short-script Skill — does not run a Space (ADR-0021, issue #174)", () => {
  it("states this Recipe has no Space at all and never calls a Magnific tool", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /ADR-0021/);
    assert.match(text, /no Space at all/i);
    assert.doesNotMatch(text, /spaces_[a-z_]+\(/, "must never itself call a spaces_* tool");
    assert.doesNotMatch(text, /creations_[a-z_]+\(/, "must never itself call a creations_* tool");
  });

  it("never publishes (always-rule 1 / ADR-0002)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /never publish/i);
  });
});

describe("produce-news-short-script Skill — nothing Brand/Format-specific is hardcoded (ADR-0015, issue #174)", () => {
  it("never hardcodes Straw Motion's own required CTA or a specific Format's own name", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.doesNotMatch(text, /Unhypped Daily/, "must not hardcode any one Brand/Format's own name");
    assert.doesNotMatch(text, /Link in bio!/, "must not hardcode any one Brand's required CTA");
  });
});

describe("produce-news-short-script Skill — the graduated author-phase checklist runs Curiosity Queries, no-calendar-dates, and Shot List variety as code (issue #187)", () => {
  it("points at the graduated checklist module, not the bare validator/scanner pair alone", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-short-script-author-checklist\.ts/);
    assert.match(text, /auditNewsShortScriptAuthorPhase/);
  });

  it("documents Curiosity Queries: 3-5 per beat, a research aid never spoken", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /curiosity_queries/);
    assert.match(text, /Curiosity Queries/);
    assert.match(text, /3-5/);
    assert.match(text, /never spoken/i);
  });

  it("documents the calendar-date ban across the whole spoken body, reject-only", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /explicit calendar date/i);
    assert.match(text, /not just the hook\/intro/i);
  });

  it("documents no two beats' source_url repeating the same site/company", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /same source page or the same site\/company/i);
    assert.match(text, /issue #106/);
  });

  it("documents the closing cta beat as the Sign-off, picked from the Baseline Prompt's fixed rotating family", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /Sign-off/);
    assert.match(text, /rotating Sign-off family/i);
    assert.match(text, /never invent a new one per script/i);
    assert.doesNotMatch(text, /follow us/i, "must not itself hardcode the old generic follow-us direction");
  });
});
