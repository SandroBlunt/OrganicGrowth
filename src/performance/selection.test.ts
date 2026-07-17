import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectTrackableAssets } from "./selection.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";

const RECIPE = "character-explainer-with-cast";
const RECIPE_2 = "carousel";

describe("selectTrackableAssets — one selection PER (Idea, Recipe) Asset, never per Idea", () => {
  it("selects a posted Asset with a post_url", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: "u1" }] },
    ];
    const picks = selectTrackableAssets(ideas);
    assert.equal(picks.length, 1);
    assert.equal(picks[0]!.ideaId, "idea-A");
    assert.equal(picks[0]!.asset.recipe, RECIPE);
  });

  it("selects a tracking Asset too (still climbing, re-pulled by default)", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "tracking", post_url: "u1" }] },
    ];
    assert.equal(selectTrackableAssets(ideas).length, 1);
  });

  it("does NOT select a scored Asset by default (settled)", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "scored", post_url: "u1" }] },
    ];
    assert.equal(selectTrackableAssets(ideas).length, 0);
  });

  it("does NOT select an Asset without a post_url, regardless of status", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] },
    ];
    assert.equal(selectTrackableAssets(ideas).length, 0);
  });

  it("selects EACH of an Idea's several Recipes' Assets independently", () => {
    const ideas: LedgerIdea[] = [
      {
        id: "idea-A",
        status: "accepted",
        assets: [
          { recipe: RECIPE, status: "posted", post_url: "u1" },
          { recipe: RECIPE_2, status: "tracking", post_url: "u2" },
        ],
      },
    ];
    const picks = selectTrackableAssets(ideas);
    assert.equal(picks.length, 2);
    assert.deepEqual(picks.map((p) => p.asset.recipe).sort(), [RECIPE, RECIPE_2].sort());
  });

  it("selects across MULTIPLE Ideas by default", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: "u1" }] },
      { id: "idea-B", status: "accepted", assets: [{ recipe: RECIPE, status: "tracking", post_url: "u2" }] },
    ];
    const picks = selectTrackableAssets(ideas);
    assert.equal(picks.length, 2);
    assert.deepEqual(picks.map((p) => p.ideaId).sort(), ["idea-A", "idea-B"]);
  });

  it("forced (idea-id given): selects ONLY that Idea's Assets, ignoring other Ideas", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: "u1" }] },
      { id: "idea-B", status: "accepted", assets: [{ recipe: RECIPE, status: "tracking", post_url: "u2" }] },
    ];
    const picks = selectTrackableAssets(ideas, { ideaId: "idea-A" });
    assert.equal(picks.length, 1);
    assert.equal(picks[0]!.ideaId, "idea-A");
  });

  it("forced (idea-id given): re-selects an already-scored Asset", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "scored", post_url: "u1" }] },
    ];
    const picks = selectTrackableAssets(ideas, { ideaId: "idea-A" });
    assert.equal(picks.length, 1);
  });

  it("forced (idea-id given): still requires a post_url — never scores an unposted Asset", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] },
    ];
    assert.equal(selectTrackableAssets(ideas, { ideaId: "idea-A" }).length, 0);
  });

  it("returns [] for an Idea with no Assets", () => {
    const ideas: LedgerIdea[] = [{ id: "idea-A", status: "accepted" }];
    assert.equal(selectTrackableAssets(ideas).length, 0);
  });

  it("does not mutate its input", () => {
    const ideas: LedgerIdea[] = [
      { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "posted", post_url: "u1" }] },
    ];
    const snapshot = JSON.stringify(ideas);
    selectTrackableAssets(ideas);
    assert.equal(JSON.stringify(ideas), snapshot);
  });
});
