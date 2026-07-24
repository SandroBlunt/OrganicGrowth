import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for the `write-social-copy` Skill (issue #111; ADR-0012, mirroring
 * ADR-0018's per-Recipe author Skills). Pins the Skill's promised names/paths/STOP rules so it can
 * never silently drift from the checker (`injectRequiredParts`/`validateCopy`) or the swappable
 * `Recipe.copySkill` field it is resolved by.
 *
 * Kept OUT of the unit suite (`npm test`'s glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts") — run with `npm run test:docs`. Editing the Skill's prose must never break
 * `npm test`. Mirrors `produce-news-carousel-skill.docs-test.ts`'s own structure exactly.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SKILL_PATH = join(REPO_ROOT, ".claude", "skills", "write-social-copy", "SKILL.md");

describe("write-social-copy Skill — exists, invocable by slug (issue #111 AC2)", () => {
  it("exists and is readable", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares its own slug in the front-matter `name` field", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /^name:\s*write-social-copy\s*$/m);
  });

  it("carries a description naming the copy step and the thin Producer", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /copy/i);
    assert.match(text, /Producer/);
  });
});

describe("write-social-copy Skill — references the correct in-repo slugs/paths (issue #111 AC2)", () => {
  it("points at the copy contract + drafting seam", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /copy\/contract\.ts/);
    assert.match(text, /copy\/draft\.ts/);
    assert.match(text, /skillDraftCopy/);
  });

  it("points at the deterministic checker it hands off to", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /copy\/inject\.ts/);
    assert.match(text, /injectRequiredParts/);
    assert.match(text, /copy\/validate\.ts/);
    assert.match(text, /validateCopy/);
  });

  it("points at the Brand hard-rules reader", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /brand-profile\.ts/);
    assert.match(text, /loadCopyRules/);
  });

  it("states it is resolved via the swappable Recipe.copySkill field", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /copySkill/);
    assert.match(text, /recipe\/registry\.ts/);
    assert.match(text, /swappable/i);
  });
});

describe("write-social-copy Skill — STOP semantics stay true (issue #111)", () => {
  it("treats a banned word as REJECT-only — STOP, never a silent swap (always-rule 6/9)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /banned word.{0,40}REJECT-ONLY|REJECT-ONLY.{0,40}banned word/is);
    assert.match(text, /STOP/);
    assert.match(text, /never (a )?silent(ly)? swap/i);
  });

  it("treats a dash tell the same reject-only way (issue #108)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /dash/i);
    assert.match(text, /em dash/i);
    assert.match(text, /en dash/i);
  });
});

describe("write-social-copy Skill — sharpens the produced on-slide narrative into the caption (issue #111)", () => {
  it("states it pulls forward the ACTUAL produced narrative once the media exists, not the brief alone", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /sharpen/i);
    assert.match(text, /produced on-slide narrative|actual produced narrative/i);
    assert.match(text, /once the media exists/i);
  });
});

describe("write-social-copy Skill — draws on each slide's companies field, grounded, never invented (issue #120)", () => {
  it("names CopySlideBeat.companies as part of the produced-narrative input", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /companies/);
    assert.match(text, /CopySlideBeat/);
  });

  it("instructs naming the real companies/products from that field, grounded in the Spec", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /real companies\/products/i);
    assert.match(text, /grounded/i);
  });

  it("states an empty/absent companies field contributes NO mention — never invented or re-guessed", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /companies.{0,20}(is )?empty or absent/i);
    assert.match(text, /never invent|never fabricat/i);
  });
});

describe("write-social-copy Skill — draws on the Character Explainer Recipe's own companies field too, the SAME way it already does for News Carousel (issue #125)", () => {
  it("names CopyInput.companies and characterExplainerCompanies as part of the produced-narrative input", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /CopyInput\.companies/);
    assert.match(text, /characterExplainerCompanies/);
    assert.match(text, /character-explainer-companies\.ts/);
  });

  it("names the Character Explainer with Cast Recipe alongside its companies wiring", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /Character Explainer with Cast/);
  });

  it("instructs naming real companies/products from CopyInput.companies too, grounded, at either grain", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /at either grain/i);
  });
});

describe("write-social-copy Skill — does not run the Space or publish (issue #111 hard rule)", () => {
  it("states it does not run the Space or drive the canvas", async () => {
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

describe("write-social-copy Skill — composes one variant per targeted Channel platform (issue #129)", () => {
  it("names channelsFrom/loadChannels and reading the Brand's FULL Channel list, not just the primary", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /channelsFrom/);
    assert.match(text, /loadChannels/);
    assert.match(text, /not just the.{0,20}primary/i);
    assert.match(text, /ADR-0019/);
  });

  it("instructs a distinct caption per targeted platform, never one shared caption reused everywhere", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /DISTINCT caption for EACH targeted\s+platform/);
    assert.match(text, /never one shared caption/);
  });

  it("names the two checkers: validateCopy for the primary, validateCopyForPlatform for every other targeted platform", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /validateCopyForPlatform/);
    assert.match(text, /resolveCopyShapeForPlatform/);
    assert.match(text, /composeCopyForChannels/);
  });

  it("names Copy.variants and states a single-Channel Brand's Copy carries no variants field, unchanged", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /Copy\.variants/);
    assert.match(text, /single-Channel\s+Brand's saved Copy carries no.{0,20}variants.{0,20}field/i);
  });

  it("resolves LinkedIn @mentions via issue #126's lookup, deterministically (issue #130)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /#130/);
    assert.match(text, /weaveLinkedInMentions/);
    assert.match(text, /resolveLinkedInHandle/);
    assert.match(text, /linkedin-handle/);
  });

  it("states an unresolved company/product falls back to plain text, flagged for Operator review", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /unresolvedMentions/);
    assert.match(text, /flagged.{0,40}Operator review|Operator review/i);
  });
});

describe("write-social-copy Skill — nothing Brand/Format-specific is hardcoded (issue #111)", () => {
  it("never hardcodes Straw Motion's own pill text, logo reference name, or required CTA", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.doesNotMatch(text, /Unhypped News/, "must not hardcode any one Brand/Format's pill text");
    assert.doesNotMatch(
      text,
      /Straw_Motion_Logo/,
      "must not hardcode any one Brand/Format's logo reference name",
    );
    assert.doesNotMatch(text, /Link in bio!/, "must not hardcode any one Brand's required CTA");
  });
});
