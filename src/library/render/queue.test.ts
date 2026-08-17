import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderQueueBody } from "./queue.ts";
import type { QueueRow } from "../types.ts";

function row(overrides: Partial<QueueRow> & { readonly jobId: string }): QueueRow {
  return {
    jobStatus: "done",
    enqueuedAt: "2026-08-14T09:00:00.000Z",
    assetId: `asset-${overrides.jobId}`,
    assetStatus: "produced",
    ideaTitle: overrides.jobId,
    recipeSlug: "news-carousel",
    recipeName: "News Carousel",
    brandSlug: "straw-motion",
    formatSlug: "unhypped-news",
    bucket: "produced",
    ...overrides,
  };
}

describe("renderQueueBody — produced/parked/failed, without reading JSON (AC6)", () => {
  it("renders an empty-queue message when there are no rows", () => {
    assert.match(renderQueueBody([]), /queue is empty/);
  });

  it("groups rows by bucket, with a per-bucket count in the summary", () => {
    const rows = [
      row({ jobId: "j1", bucket: "produced", ideaTitle: "Produced One" }),
      row({ jobId: "j2", bucket: "parked", ideaTitle: "Parked One", gate: "cast" }),
      row({ jobId: "j3", bucket: "failed", ideaTitle: "Failed One" }),
    ];
    const html = renderQueueBody(rows);
    assert.match(html, /Produced One/);
    assert.match(html, /Parked One/);
    assert.match(html, /Failed One/);
    assert.match(html, /Failed.*: 1/);
    assert.match(html, /Parked.*: 1/);
    assert.match(html, /Produced.*: 1/);
  });

  it("shows the pause gate name for a parked row", () => {
    const rows = [row({ jobId: "j1", bucket: "parked", gate: "cast" })];
    const html = renderQueueBody(rows);
    assert.match(html, /cast/);
  });

  it("links each row to its Asset page", () => {
    const rows = [row({ jobId: "j1" })];
    const html = renderQueueBody(rows);
    assert.match(html, /href="\/assets\/asset-j1"/);
  });
});
