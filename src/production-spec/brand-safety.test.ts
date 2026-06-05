import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanForBannedWords } from "./brand-safety.ts";
import { loadBannedWords, bannedWordsFrom } from "./brand-profile.ts";
import { validSpec } from "./fixtures/specs.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");

describe("loadBannedWords / bannedWordsFrom (defensive)", () => {
  it("reads banned words from a fixture brand profile", async () => {
    const banned = await loadBannedWords(BANNED_PROFILE);
    assert.deepEqual(banned, ["cure", "miracle", "guaranteed"]);
  });

  it("returns [] for a missing brand-profile file", async () => {
    const banned = await loadBannedWords(join(HERE, "fixtures", "nope.yaml"));
    assert.deepEqual(banned, []);
  });

  it("returns [] when banned_words is absent or empty (the real profile shape)", () => {
    assert.deepEqual(bannedWordsFrom({ niche: "x" }), []);
    assert.deepEqual(bannedWordsFrom({ banned_words: [] }), []);
    assert.deepEqual(bannedWordsFrom(null), []);
  });

  it("drops non-string and blank entries defensively", () => {
    assert.deepEqual(bannedWordsFrom({ banned_words: ["cure", 7, "", "  ", "miracle"] }), [
      "cure",
      "miracle",
    ]);
  });
});

describe("scanForBannedWords", () => {
  const banned = ["cure", "miracle", "guaranteed"];

  it("passes a clean Spec (no banned words)", () => {
    const result = scanForBannedWords(validSpec(), banned);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("passes any Spec when no banned words are configured", () => {
    const result = scanForBannedWords(validSpec(), []);
    assert.equal(result.ok, true);
  });

  it("rejects a Spec whose post_copy contains a banned word and names the word", () => {
    const spec = validSpec();
    spec.post_copy = "This miracle trick changes your morning ☀️☕";
    const result = scanForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "miracle"));
  });

  it("matches case-insensitively", () => {
    const spec = validSpec();
    spec.post_copy = "A GUARANTEED morning boost ☀️☕";
    const result = scanForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "guaranteed"));
  });

  it("scans clip prompts and thumbnails, not just post_copy", () => {
    const spec = validSpec();
    (spec.clips as Record<string, unknown>[])[0]!.image_prompt =
      "Pixar 3D the clock with a miracle glow. Aspect Ratio 9:16.";
    const result = scanForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "miracle"));
  });

  it("scans character_concepts", () => {
    const spec = validSpec();
    (spec.character_concepts as string[])[0] = "A cure-themed anthropomorphic mug";
    const result = scanForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "cure"));
  });

  it("does not match a banned word embedded inside an unrelated word", () => {
    const spec = validSpec();
    // "secure" contains "cure" but is not the banned word "cure" — whole-word match only.
    spec.post_copy = "Feel secure every morning ☀️☕";
    const result = scanForBannedWords(spec, banned);
    assert.equal(result.ok, true);
  });
});
