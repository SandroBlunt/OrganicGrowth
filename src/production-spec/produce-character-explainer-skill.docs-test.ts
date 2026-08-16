import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for the `produce-character-explainer` Skill (issue #88; ADR-0018).
 * Pins the Skill's promised names/paths/STOP rules so it can never silently drift from the
 * validator/checklist/spec-store it points at, and proves it is byte-behaviour-identical to what the
 * pre-#88 monolithic `producer.md` did inline (no new procedure invented).
 *
 * Kept OUT of the unit suite (`npm test`'s glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts") — run with `npm run test:docs`. Editing the Skill's prose must never break
 * `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SKILL_PATH = join(REPO_ROOT, ".claude", "skills", "produce-character-explainer", "SKILL.md");

describe("produce-character-explainer Skill — exists, invocable by slug (issue #88)", () => {
  it("exists and is readable", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares its own slug in the front-matter `name` field", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /^name:\s*produce-character-explainer\s*$/m);
  });

  it("carries a description naming the wired Recipe and the thin Producer", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /character-explainer-with-cast/);
    assert.match(text, /Producer/);
  });
});

describe("produce-character-explainer Skill — references the correct in-repo slugs/paths (issue #88)", () => {
  it("points at the Production Spec contract + validator", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /production-spec\/contract\.ts/);
    assert.match(text, /ProductionSpec/);
    assert.match(text, /REQUIRED_CHARACTER_CONCEPTS/);
    assert.match(text, /REQUIRED_CLIPS/);
    assert.match(text, /REQUIRED_THUMBNAILS/);
    assert.match(text, /ASPECT_RATIO_LINE/);
    assert.match(text, /production-spec\/validate\.ts/);
  });

  it("points at the banned-word scan", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /brand-safety\.ts/);
    assert.match(text, /scanForBannedWords/);
  });

  it("points at the generic author-phase auditor (issue #85)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /phase-contract\.ts/);
    assert.match(text, /auditAuthorPhase/);
  });

  it("points at the spec store", async () => {
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

describe("produce-character-explainer Skill — STOP semantics stay true (issue #88)", () => {
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

describe("produce-character-explainer Skill — extracted, behaviour-identical (issue #88)", () => {
  it("states it was extracted from the pre-#88 Producer with no behaviour change", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /extracted/i);
    assert.match(text, /behaviour-identical/i);
  });

  it("carries over the exact 9:16 aspect-ratio line and the Pixar-3D character-concept craft", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /Aspect Ratio 9:16/);
    assert.match(text, /Pixar-3D/);
  });
});

describe("produce-character-explainer Skill — authors a structured companies/products list, grounded, never invented (issue #125)", () => {
  it("names the TOP-LEVEL companies field on ProductionSpec", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /TOP-LEVEL.{0,40}companies|companies.{0,40}TOP-LEVEL/is);
  });

  it("instructs populating it from the Idea brief when real companies/products are named", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /real companies\/products/i);
    assert.match(text, /Idea brief/i);
  });

  it("instructs omitting it entirely when the brief names none — never invented", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /omit(ted)? .{0,40}entirely|names none/i);
    assert.match(text, /never invent/i);
  });
});

describe("produce-character-explainer Skill — does not run the Space, pick the Cast, or compose Copy (issue #88)", () => {
  it("states it does not drive the canvas or call any Magnific tool", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /do(es)? not run the Space/i);
    assert.doesNotMatch(text, /spaces_[a-z_]+\(/, "must never itself call a spaces_* tool");
    assert.doesNotMatch(text, /creations_[a-z_]+\(/, "must never itself call a creations_* tool");
  });

  it("states it does not pin the Character or compose the Copy — the thin Producer's job", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /does not compose the Copy/i);
    assert.match(text, /pin the Operator's picked Character/i);
  });

  it("never publishes (always-rule 1 / ADR-0002)", async () => {
    const text = await readFile(SKILL_PATH, "utf8");
    assert.match(text, /never publish/i);
  });
});
