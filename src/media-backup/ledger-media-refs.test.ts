import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { collectLedgerMediaRefs } from "./ledger-media-refs.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";

describe("collectLedgerMediaRefs — folds asset_paths + cast paths off an already-loaded ledger (issue #197)", () => {
  it("collects every asset_paths entry, tagged with brand/idea/recipe", () => {
    const ideas: LedgerIdea[] = [
      {
        id: "idea-01",
        status: "accepted",
        assets: [
          {
            recipe: "news-carousel",
            status: "produced",
            asset_paths: ["data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png"],
          },
        ],
      },
    ];
    const refs = collectLedgerMediaRefs(ideas, "acme");
    assert.equal(refs.length, 1);
    assert.deepEqual(refs[0], {
      brand: "acme",
      ideaId: "idea-01",
      recipe: "news-carousel",
      path: "data/brands/acme/ideas/2026-W01/idea-01.news-carousel.output/0-hook.png",
      source: "asset_paths",
    });
  });

  it("collects cast candidate paths, skipping a candidate with no local path", () => {
    const ideas: LedgerIdea[] = [
      {
        id: "idea-02",
        status: "accepted",
        assets: [
          {
            recipe: "character-explainer-with-cast",
            status: "in_production",
            pending_gate: "cast",
            cast: [
              { identifier: "abc", url: "https://example.com/a.jpg", path: "data/brands/acme/ideas/x.cast/2-a.jpg" },
              { identifier: "def", url: "https://example.com/b.jpg" }, // no local path yet
            ],
          },
        ],
      },
    ];
    const refs = collectLedgerMediaRefs(ideas, "acme");
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.source, "cast_path");
    assert.equal(refs[0]?.path, "data/brands/acme/ideas/x.cast/2-a.jpg");
  });

  it("collects both asset_paths AND cast paths across multiple Assets on one Idea", () => {
    const ideas: LedgerIdea[] = [
      {
        id: "idea-03",
        status: "accepted",
        assets: [
          {
            recipe: "news-carousel",
            status: "produced",
            asset_paths: ["a.png", "b.png"],
          },
          {
            recipe: "character-explainer-with-cast",
            status: "in_production",
            cast: [{ identifier: "x", url: "https://x", path: "c.jpg" }],
          },
        ],
      },
    ];
    const refs = collectLedgerMediaRefs(ideas, "acme");
    assert.deepEqual(
      refs.map((r) => r.path),
      ["a.png", "b.png", "c.jpg"],
    );
  });

  it("returns [] for an Idea with no assets, and for an empty ideas list", () => {
    assert.deepEqual(collectLedgerMediaRefs([{ id: "idea-04", status: "suggested" }], "acme"), []);
    assert.deepEqual(collectLedgerMediaRefs([], "acme"), []);
  });

  it("preserves duplicate paths rather than deduplicating (caller's job)", () => {
    const ideas: LedgerIdea[] = [
      {
        id: "idea-05",
        status: "accepted",
        assets: [{ recipe: "news-carousel", status: "produced", asset_paths: ["same.png", "same.png"] }],
      },
    ];
    assert.equal(collectLedgerMediaRefs(ideas, "acme").length, 2);
  });
});
