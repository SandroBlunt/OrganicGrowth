import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SUPPORTED_RECIPE, selectEligibleAssets, type ScheduleBatchIdea } from "./eligibility.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";

function idea(id: string, assets: readonly LedgerAssetRecord[], title = `Title for ${id}`): ScheduleBatchIdea {
  return { id, title, run: "2026-W32", format: "unhypped-news", assets };
}

function asset(patch: Partial<LedgerAssetRecord> & { readonly recipe: string; readonly status: LedgerAssetRecord["status"] }): LedgerAssetRecord {
  return patch;
}

describe("eligibility — which Assets a Schedule Batch export includes (issue #145)", () => {
  it("includes a produced, un-posted, un-scheduled news-carousel Asset", () => {
    const ideas = [idea("idea-01", [asset({ recipe: SUPPORTED_RECIPE, status: "produced" })])];
    const result = selectEligibleAssets(ideas);
    assert.equal(result.eligible.length, 1);
    assert.equal(result.eligible[0]!.ideaId, "idea-01");
    assert.equal(result.skipped.length, 0);
  });

  it("skips a video (non-news-carousel) Asset with a note, e.g. the Character Explainer Reel", () => {
    const ideas = [
      idea("idea-01", [asset({ recipe: "character-explainer-with-cast", status: "produced" })]),
    ];
    const result = selectEligibleAssets(ideas);
    assert.equal(result.eligible.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0]!.reason, "video");
    assert.match(result.skipped[0]!.note, /idea-01/);
    assert.match(result.skipped[0]!.note, /character-explainer-with-cast/);
  });

  // ADR-0024, issue #188: a news-carousel Asset carrying a real video slide is a video Asset too.
  describe("a news-carousel Asset carrying a video slide (ADR-0024, issue #188)", () => {
    it("is skipped with reason 'video', the SAME mechanism as any other video Recipe's Asset", () => {
      const ideas = [
        idea("idea-01", [
          asset({ recipe: SUPPORTED_RECIPE, status: "produced", has_video_slide: true }),
        ]),
      ];
      const result = selectEligibleAssets(ideas);
      assert.equal(result.eligible.length, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0]!.reason, "video");
      assert.equal(result.skipped[0]!.recipe, SUPPORTED_RECIPE);
      assert.match(result.skipped[0]!.note, /idea-01/);
      assert.match(result.skipped[0]!.note, /video slide/);
    });

    it("a news-carousel Asset with has_video_slide false (or absent) stays eligible as normal", () => {
      const ideas = [
        idea("idea-01", [
          asset({ recipe: SUPPORTED_RECIPE, status: "produced", has_video_slide: false }),
        ]),
        idea("idea-02", [asset({ recipe: SUPPORTED_RECIPE, status: "produced" })]),
      ];
      const result = selectEligibleAssets(ideas);
      assert.equal(result.eligible.length, 2);
      assert.equal(result.skipped.length, 0);
    });
  });

  it("skips a news-carousel Asset that is not yet produced", () => {
    const ideas = [idea("idea-01", [asset({ recipe: SUPPORTED_RECIPE, status: "in_production" })])];
    const result = selectEligibleAssets(ideas);
    assert.equal(result.eligible.length, 0);
    assert.equal(result.skipped[0]!.reason, "not-produced");
  });

  it("skips a news-carousel Asset that is already posted", () => {
    const ideas = [
      idea("idea-01", [
        asset({ recipe: SUPPORTED_RECIPE, status: "posted", post_url: "https://facebook.com/x" }),
      ]),
    ];
    const result = selectEligibleAssets(ideas);
    assert.equal(result.eligible.length, 0);
    assert.equal(result.skipped[0]!.reason, "not-produced");
    assert.match(result.skipped[0]!.note, /posted/);
  });

  it("skips a news-carousel Asset that is already scheduled (re-running the export is a no-op)", () => {
    const ideas = [
      idea("idea-01", [
        asset({ recipe: SUPPORTED_RECIPE, status: "produced", scheduled_at: "2026-08-04T14:23:00Z" }),
      ]),
    ];
    const result = selectEligibleAssets(ideas);
    assert.equal(result.eligible.length, 0);
    assert.equal(result.skipped[0]!.reason, "already-scheduled");
    assert.match(result.skipped[0]!.note, /2026-08-04T14:23:00Z/);
  });

  it("evaluates each Asset of an Idea independently — one eligible, one skipped", () => {
    const ideas = [
      idea("idea-01", [
        asset({ recipe: SUPPORTED_RECIPE, status: "produced" }),
        asset({ recipe: "character-explainer-with-cast", status: "produced" }),
      ]),
    ];
    const result = selectEligibleAssets(ideas);
    assert.equal(result.eligible.length, 1);
    assert.equal(result.eligible[0]!.asset.recipe, SUPPORTED_RECIPE);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0]!.reason, "video");
  });

  it("returns an empty result for an empty run (no Ideas at all)", () => {
    const result = selectEligibleAssets([]);
    assert.equal(result.eligible.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  it("is pure — the same input always returns deep-equal output", () => {
    const ideas = [idea("idea-01", [asset({ recipe: SUPPORTED_RECIPE, status: "produced" })])];
    const a = selectEligibleAssets(ideas);
    const b = selectEligibleAssets(ideas);
    assert.deepEqual(a, b);
  });
});
