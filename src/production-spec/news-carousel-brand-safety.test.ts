import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanNewsCarouselForBannedWords } from "./news-carousel-brand-safety.ts";
import { loadBannedWords } from "./brand-profile.ts";
import { validCarouselSpec } from "./fixtures/news-carousel-specs.ts";
import type { CarouselSlide } from "./news-carousel-contract.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");

describe("scanNewsCarouselForBannedWords", () => {
  const banned = ["cure", "miracle", "guaranteed"];

  it("passes a clean carousel Spec (no banned words)", () => {
    const result = scanNewsCarouselForBannedWords(validCarouselSpec(), banned);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("passes any Spec when no banned words are configured", () => {
    const result = scanNewsCarouselForBannedWords(validCarouselSpec(), []);
    assert.equal(result.ok, true);
  });

  it("closes the issue-60 gap: a banned word in image_prompt is rejected and named clearly", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as CarouselSlide[];
    slides[3] = {
      ...slides[3]!,
      image_prompt: "A photograph of a miracle cure product on a desk, softly lit.",
    };
    const result = scanNewsCarouselForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "miracle" && h.field === "slides[3].image_prompt"));
    assert.ok(result.hits.some((h) => h.word === "cure" && h.field === "slides[3].image_prompt"));
  });

  it("also scans the on-card text field, not only image_prompt", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as CarouselSlide[];
    slides[0] = { ...slides[0]!, text: "This guaranteed result changes everything." };
    const result = scanNewsCarouselForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "guaranteed" && h.field === "slides[0].text"));
  });

  it("also scans stat_callout", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as CarouselSlide[];
    slides[5] = { ...slides[5]!, stat_callout: "A miracle number." };
    const result = scanNewsCarouselForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "miracle" && h.field === "slides[5].stat_callout"));
  });

  it("matches case-insensitively", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as CarouselSlide[];
    slides[1] = { ...slides[1]!, image_prompt: "A GUARANTEED outcome, photographed at dawn." };
    const result = scanNewsCarouselForBannedWords(spec, banned);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.word === "guaranteed"));
  });

  it("does not match a banned word embedded inside an unrelated word", () => {
    const spec = validCarouselSpec();
    const slides = spec.slides as CarouselSlide[];
    // "secure" contains "cure" but is not the banned word "cure" — whole-word match only.
    slides[2] = { ...slides[2]!, text: "Feel secure about this shift." };
    const result = scanNewsCarouselForBannedWords(spec, banned);
    assert.equal(result.ok, true);
  });

  it("reads the SAME banned-words fixture the wired Recipe's brand-safety tests use", async () => {
    const words = await loadBannedWords(BANNED_PROFILE);
    assert.deepEqual(words, ["cure", "miracle", "guaranteed"]);
  });
});
