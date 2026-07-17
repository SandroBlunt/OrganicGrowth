import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for the `produce-news-carousel` Skill (issue #87; ADR-0018,
 * ADR-0015). Pins the Skill's promised names/paths/STOP rules so it can never silently drift from
 * the validator/checklist/spec-store/baseline-prompt-loader it points at.
 *
 * Kept OUT of the unit suite (`npm test`'s glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts") — run with `npm run test:docs`. Editing the Skill's prose must never break
 * `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SKILL_PATH = join(REPO_ROOT, ".claude", "skills", "produce-news-carousel", "SKILL.md");

describe("produce-news-carousel Skill — exists, invocable by slug (issue #87 AC1)", () => {
  it("exists and is readable", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares its own slug in the front-matter `name` field", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /^name:\s*produce-news-carousel\s*$/m);
  });

  it("carries a description naming the news-carousel Recipe and the thin Producer", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-carousel/);
    assert.match(text, /Producer/);
  });
});

describe("produce-news-carousel Skill — references the correct in-repo slugs/paths (issue #87 AC1)", () => {
  it("points at the #81 spec shape + validator", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-carousel-contract\.ts/);
    assert.match(text, /NewsCarouselSpec/);
    assert.match(text, /news-carousel-validate\.ts/);
    assert.match(text, /validateNewsCarouselSpec/);
    assert.match(text, /CAROUSEL_ROLES/);
    assert.match(text, /CAROUSEL_TEXT_MAX_CHARS/);
  });

  it("points at the #85 author-phase checklist", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /news-carousel-author-checklist\.ts/);
    assert.match(text, /auditNewsCarouselAuthorPhase/);
    assert.match(text, /NewsCarouselBaselineParams/);
  });

  it("points at the #83 baseline-prompt pointer + loader", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /format\/store\.ts/);
    assert.match(text, /loadFormat/);
    assert.match(text, /format\/baseline-prompt\.ts/);
    assert.match(text, /loadBaselinePrompt/);
  });

  it("points at the spec store (issue #87's own AC: emit through the spec store)", async () => {
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
});

describe("produce-news-carousel Skill — STOP semantics stay true (issue #87)", () => {
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

describe("produce-news-carousel Skill — grounded-not-invented leading idea (issue #87)", () => {
  it("states every slide names real products/logos/actions where it reports something real", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /grounded, not invented/i);
    assert.match(text, /never invent a UI/i);
  });
});

describe("produce-news-carousel Skill — does not run the Space (issue #87 hard rule)", () => {
  it("states it does not drive the canvas or call any Magnific tool", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /do(es)? not run the Space/i);
    assert.doesNotMatch(text, /spaces_[a-z_]+\(/, "must never itself call a spaces_* tool");
    assert.doesNotMatch(text, /creations_[a-z_]+\(/, "must never itself call a creations_* tool");
  });

  it("never publishes (always-rule 1 / ADR-0002)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /never publish/i);
  });
});

describe("produce-news-carousel Skill — nothing Brand/Format-specific is hardcoded (ADR-0015, issue #87)", () => {
  it("never hardcodes Straw Motion's own pill text, logo reference name, or Format name", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.doesNotMatch(text, /Unhypped News/, "must not hardcode any one Brand/Format's pill text");
    assert.doesNotMatch(
      text,
      /Straw_Motion_Logo|Brand_Logo/,
      "must not hardcode any one Brand/Format's logo reference name",
    );
  });

  it("instead describes the logo/pill/card-style values as read from the document, generically", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /document's own logo reference name/i);
    assert.match(text, /document's own\s*\*{0,2}confirmed/i);
    assert.match(text, /the document's pill\/eyebrow text/i);
  });
});
