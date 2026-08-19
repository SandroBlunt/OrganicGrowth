import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateNewsCarouselSpec } from "./news-carousel-generate.ts";
import { validateNewsCarouselSpec } from "./news-carousel-validate.ts";
import { scanNewsCarouselForBannedWords } from "./news-carousel-brand-safety.ts";
import { CAROUSEL_ROLES, CAROUSEL_SLIDE_COUNT, CAROUSEL_TEXT_MAX_CHARS } from "./news-carousel-contract.ts";
import type { Brief } from "./generate.ts";

const BRIEF: Brief = { id: "idea-01", run: "2026-W33", title: "A brand new headline about real news" };

describe("generateNewsCarouselSpec — a deterministic stand-in for the news-carousel producer Skill (ADR-0031, issue #264)", () => {
  it("produces exactly 7 slides, in fixed role order, each with slide_index matching its position", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    assert.equal(spec.slides.length, CAROUSEL_SLIDE_COUNT);
    spec.slides.forEach((slide, i) => {
      assert.equal(slide.role, CAROUSEL_ROLES[i]);
      assert.equal(slide.slide_index, i);
    });
  });

  it("every slide carries a non-empty card_style/stat_callout/image_prompt and text at most 140 chars", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    for (const slide of spec.slides) {
      assert.ok(slide.card_style.length > 0);
      assert.ok(slide.stat_callout.length > 0);
      assert.ok(slide.image_prompt.length > 0);
      assert.ok(slide.text.length > 0);
      assert.ok(slide.text.length <= CAROUSEL_TEXT_MAX_CHARS);
      assert.ok(Array.isArray(slide.companies));
    }
  });

  it("passes validateNewsCarouselSpec — the SAME contract this Recipe's specShape.validate enforces", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    const result = validateNewsCarouselSpec(spec);
    assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  });

  it("passes scanNewsCarouselForBannedWords when the Brand configures no banned words", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    const result = scanNewsCarouselForBannedWords(spec, []);
    assert.equal(result.ok, true);
  });

  it("carries a banned word through to the Spec when the Brief's title carries one — proves the Spec is grounded in the Brief, not a fixed template", () => {
    const spec = generateNewsCarouselSpec({ ...BRIEF, title: "VERBOTEN word in the headline" });
    const result = scanNewsCarouselForBannedWords(spec, ["VERBOTEN"]);
    assert.equal(result.ok, false);
  });

  it("is deterministic: the SAME Brief always produces a deep-equal Spec", () => {
    const first = generateNewsCarouselSpec(BRIEF);
    const second = generateNewsCarouselSpec(BRIEF);
    assert.deepEqual(first, second);
  });

  it("threads the Brief's companies through unchanged, when present", () => {
    const spec = generateNewsCarouselSpec({ ...BRIEF, companies: ["OpenAI", "Anthropic"] });
    for (const slide of spec.slides) {
      assert.deepEqual(slide.companies, ["OpenAI", "Anthropic"]);
    }
  });

  it("defaults to an empty companies array when the Brief names none", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    for (const slide of spec.slides) {
      assert.deepEqual(slide.companies, []);
    }
  });

  // --- issue #273 regression proofs: the stand-in used to be OBVIOUS filler (one card_style for all 7
  // slides, a spaced em dash joining every slide's on-card text) that no accept-time self-check caught.
  it("issue #273: varies card_style across the 7 slides — never one style repeated on every slide", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    const distinct = new Set(spec.slides.map((s) => s.card_style));
    assert.ok(distinct.size >= 2, `expected >= 2 distinct card_style values, got ${JSON.stringify([...distinct])}`);
  });

  it("issue #273: never joins on-card text with a spaced em dash, en dash, or hyphen (the AI-writing \"tell\" issue #108 forbids)", () => {
    const spec = generateNewsCarouselSpec(BRIEF);
    for (const slide of spec.slides) {
      assert.doesNotMatch(slide.text, /—|–|\s-\s/, `slide "${slide.role}" text carries a dash tell: ${slide.text}`);
      assert.doesNotMatch(slide.stat_callout, /—|–|\s-\s/);
    }
  });

  it("issue #273: when the Brief names companies, every slide's image_prompt cites them", () => {
    const spec = generateNewsCarouselSpec({ ...BRIEF, companies: ["OpenAI", "Anthropic"] });
    for (const slide of spec.slides) {
      assert.match(slide.image_prompt, /OpenAI/);
      assert.match(slide.image_prompt, /Anthropic/);
    }
  });
});
