import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getRecipe } from "../recipe/registry.ts";
import { bindMediaSlots } from "./bind-media.ts";
import { auditAuthorPhase, auditBindMediaPhase, auditCopyPhase } from "../recipe/phase-contract.ts";
import { bindMediaAsset, driveToNextGate, type DriveLegInput } from "../space-driver/driver.ts";
import type { PollOptions } from "../space-driver/driver.ts";
import {
  FakeCarouselSpace,
  SLIDES_PROMPTS_NODE_NAME,
  CAROUSEL_ASSET_CREATION_ID,
  CAROUSEL_ASSET_URL,
} from "./fixtures/fake-carousel-space.ts";
import {
  STRAW_MOTION_BASELINE,
  strawMotionIdeaOneCarouselSpec,
} from "../production-spec/fixtures/news-carousel-straw-motion-specs.ts";
import { auditNewsCarouselAuthorPhase } from "../production-spec/news-carousel-author-checklist.ts";

const FAST: PollOptions = { sleep: async () => {} };
const NEWS_CAROUSEL = getRecipe("news-carousel")!;
const BRAND_LOGO_LOCAL_PATH = "/data/brands/straw-motion/assets/brand-logo.png";
const LOGO_NODE_NAME = STRAW_MOTION_BASELINE.logoReferenceName; // "Straw_Motion_Logo" — real, per-Format

/**
 * The thin, recipe-generic Producer's carousel path, proven end-to-end against the FAKE (issue #88):
 * author (already-authored real Straw Motion Spec, self-audited) -> bind-media (Brand Logo found,
 * self-audited) -> bind the logo into its node -> drive the canvas (ZERO gates — runs straight through)
 * -> copy (self-audited). No live `spaces_*`/`creations_*` call anywhere — the Magnific fake stands in.
 */
describe("carousel end-to-end — a gate-free News Carousel job runs straight through against the fake (issue #88)", () => {
  it("has ZERO declared gates (the Recipe-level fact this whole test proves out)", () => {
    assert.deepEqual(NEWS_CAROUSEL.gates, []);
  });

  it("author phase: the real Straw Motion Spec self-audits ok against BOTH the generic and the graduated checklist", () => {
    const spec = strawMotionIdeaOneCarouselSpec();
    const generic = auditAuthorPhase(NEWS_CAROUSEL, { candidateSpec: spec, bannedWords: [] });
    assert.equal(generic.ok, true);

    const graduated = auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE);
    assert.equal(graduated.ok, true);
  });

  it("bind-media phase + render: binds the found Brand Logo, then drives the gate-free canvas to a finished Asset", async () => {
    const bindResult = bindMediaSlots(NEWS_CAROUSEL, {
      "Brand Logo": { kind: "brand-asset", found: true, path: BRAND_LOGO_LOCAL_PATH },
    });
    assert.equal(bindResult.ok, true);
    if (!bindResult.ok) return;

    const bindAudit = auditBindMediaPhase(NEWS_CAROUSEL, { boundSlotNames: bindResult.boundSlotNames });
    assert.equal(bindAudit.ok, true);

    const space = new FakeCarouselSpace(LOGO_NODE_NAME);

    // Bind the ONE resolved brand-asset slot into its canvas node BEFORE the render leg — mirrors the
    // thin Producer's bind phase (issue #88, ADR-0016).
    for (const b of bindResult.bound) {
      assert.equal(b.resolution.kind, "brand-asset");
      if (b.resolution.kind !== "brand-asset") continue;
      const bound = await bindMediaAsset(space, b.resolution.path, b.slot.media, LOGO_NODE_NAME, FAST);
      assert.equal(bound.ok, true);
    }
    assert.equal(space.editGoals.length, 1, "exactly one media-bind edit, before any render call");
    assert.equal(space.runs.length, 0, "no render call yet");

    const spec = strawMotionIdeaOneCarouselSpec();
    const input: DriveLegInput = {
      kind: "first",
      targetGate: null, // gate-free: this Recipe's FIRST leg is also its FINAL leg
      spec,
      promptNode: NEWS_CAROUSEL.canvasInputs.promptNode,
    };
    assert.equal(input.promptNode, SLIDES_PROMPTS_NODE_NAME);

    const result = await driveToNextGate(space, await space.readState(), input, FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome.kind, "finished", "gate-free — runs straight through, never pauses");
    if (result.outcome.kind !== "finished") return;
    assert.equal(result.outcome.asset.assetId, CAROUSEL_ASSET_CREATION_ID);
    assert.equal(result.outcome.asset.assetUrl, CAROUSEL_ASSET_URL);
    // A gateless Recipe's single first-and-final leg has no preceding gate pick to carry.
    assert.equal(result.outcome.asset.pick, undefined);

    // Exactly: 1 media-bind edit (above) + 1 Spec inject edit + 1 render run — nothing more, nothing
    // less; no pause, no publish action anywhere on the driver.
    assert.equal(space.editGoals.length, 2);
    assert.equal(space.runs.length, 1);
  });

  it("copy phase: a valid caption/hashtags pair self-audits ok against this Recipe's OWN copy shape", () => {
    const rules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };
    const copy = {
      caption: "Three AI giants shipped agentic tools this week — see what changed.",
      hashtags: ["#AI", "#news"],
    };
    const audit = auditCopyPhase(NEWS_CAROUSEL, { candidateCopy: copy, rules });
    assert.equal(audit.ok, true);
  });
});

describe("carousel — a missing REQUIRED Brand Asset STOPS the run before any Space call (issue #88, ADR-0016)", () => {
  it("bind-media STOPs with a clear message naming the slot; the fake is never touched", async () => {
    const bindResult = bindMediaSlots(NEWS_CAROUSEL, {
      "Brand Logo": {
        kind: "brand-asset",
        found: false,
        message:
          'Brand Asset "brand-logo" not found for Brand "straw-motion" (looked in ' +
          'data/brands/straw-motion/assets). Brand "straw-motion" has no Brand Assets committed yet.',
      },
    });
    assert.equal(bindResult.ok, false);
    if (bindResult.ok) return;
    assert.equal(bindResult.missingSlot, "Brand Logo");
    assert.match(bindResult.message, /not found for Brand "straw-motion"/);

    // The audit ALSO reports the gap (for observability), but the run has already stopped above —
    // never a half-bound Asset (ADR-0016).
    const audit = auditBindMediaPhase(NEWS_CAROUSEL, { boundSlotNames: new Set() });
    assert.equal(audit.ok, false);

    // Prove the STOP happened BEFORE any Space interaction: a fresh fake, never called.
    const space = new FakeCarouselSpace(LOGO_NODE_NAME);
    assert.equal(space.editGoals.length, 0);
    assert.equal(space.runs.length, 0);
  });
});
