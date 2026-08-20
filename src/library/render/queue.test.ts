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

const THREE_BUCKET_ROWS: readonly QueueRow[] = [
  row({ jobId: "j1", bucket: "produced", ideaTitle: "Produced One" }),
  row({ jobId: "j2", bucket: "parked", ideaTitle: "Parked One", gate: "cast" }),
  row({ jobId: "j3", bucket: "failed", ideaTitle: "Failed One" }),
];

// Captured VERBATIM from `renderQueueBody(THREE_BUCKET_ROWS)`'s output as it stood immediately before the
// Kanban-layout option was added (the one-`<table>`-per-bucket body, with no view toggle) — the golden
// value the "byte-for-byte unchanged" regression tests below compare against. Never hand-edit this
// constant to make a test pass; if the list-view body is meant to change, recapture it deliberately.
const GOLDEN_LIST_BODY =
  '<p>3 Job(s) total. <span class="badge bucket-failed">Failed: 1</span> <span class="badge bucket-parked">Parked (waiting on a human pick): 1</span> <span class="badge bucket-produced">Produced: 1</span></p>\n<h3 class="bucket-failed">Failed (1)</h3>\n<div class="table-scroll">\n<table>\n  <caption>Failed Jobs</caption>\n  <thead><tr><th scope="col">Idea</th><th scope="col">Recipe</th><th scope="col">Brand</th><th scope="col">Format</th><th scope="col">Job status</th><th scope="col">Asset status</th><th scope="col">Gate</th><th scope="col">Enqueued</th><th scope="col"></th></tr></thead>\n  <tbody><tr>\n    <td>Failed One</td>\n    <td>News Carousel</td>\n    <td>straw-motion</td>\n    <td>unhypped-news</td>\n    <td>done</td>\n    <td>produced</td>\n    <td>—</td>\n    <td>2026-08-14 09:00 UTC</td>\n    <td><a href="/assets/asset-j3" target="_blank" rel="noopener">view</a></td>\n  </tr></tbody>\n</table>\n</div>\n<h3 class="bucket-parked">Parked (waiting on a human pick) (1)</h3>\n<div class="table-scroll">\n<table>\n  <caption>Parked (waiting on a human pick) Jobs</caption>\n  <thead><tr><th scope="col">Idea</th><th scope="col">Recipe</th><th scope="col">Brand</th><th scope="col">Format</th><th scope="col">Job status</th><th scope="col">Asset status</th><th scope="col">Gate</th><th scope="col">Enqueued</th><th scope="col"></th></tr></thead>\n  <tbody><tr>\n    <td>Parked One</td>\n    <td>News Carousel</td>\n    <td>straw-motion</td>\n    <td>unhypped-news</td>\n    <td>done</td>\n    <td>produced</td>\n    <td>cast</td>\n    <td>2026-08-14 09:00 UTC</td>\n    <td><a href="/assets/asset-j2" target="_blank" rel="noopener">view</a></td>\n  </tr></tbody>\n</table>\n</div>\n<h3 class="bucket-produced">Produced (1)</h3>\n<div class="table-scroll">\n<table>\n  <caption>Produced Jobs</caption>\n  <thead><tr><th scope="col">Idea</th><th scope="col">Recipe</th><th scope="col">Brand</th><th scope="col">Format</th><th scope="col">Job status</th><th scope="col">Asset status</th><th scope="col">Gate</th><th scope="col">Enqueued</th><th scope="col"></th></tr></thead>\n  <tbody><tr>\n    <td>Produced One</td>\n    <td>News Carousel</td>\n    <td>straw-motion</td>\n    <td>unhypped-news</td>\n    <td>done</td>\n    <td>produced</td>\n    <td>—</td>\n    <td>2026-08-14 09:00 UTC</td>\n    <td><a href="/assets/asset-j1" target="_blank" rel="noopener">view</a></td>\n  </tr></tbody>\n</table>\n</div>';

const LIST_TOGGLE = '<p class="view-toggle"><a href="/queue?view=list" class="active" aria-current="true">List view</a> &middot; <a href="/queue?view=kanban">Board view</a></p>';
const KANBAN_TOGGLE = '<p class="view-toggle"><a href="/queue?view=list">List view</a> &middot; <a href="/queue?view=kanban" class="active" aria-current="true">Board view</a></p>';

describe("renderQueueBody — produced/parked/failed, without reading JSON (AC6)", () => {
  it("renders an empty-queue message when there are no rows", () => {
    assert.match(renderQueueBody([]), /queue is empty/);
  });

  it("groups rows by bucket, with a per-bucket count in the summary", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS);
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

  it("opens the view link in a new tab, safely (target=_blank + rel=noopener) — matches the Library screen's link behavior", () => {
    const rows = [row({ jobId: "j1" })];
    const html = renderQueueBody(rows);
    assert.match(html, /<a href="\/assets\/asset-j1" target="_blank" rel="noopener">view<\/a>/);
  });

  it("wraps each bucket's table in a .table-scroll container, so a narrow viewport scrolls the table, not the whole page (Task 4, audit 2026-08-18)", () => {
    const rows = [row({ jobId: "j1", bucket: "produced" })];
    const html = renderQueueBody(rows);
    assert.match(html, /<div class="table-scroll">\s*<table>/);
  });

  it("gives each bucket's table a <caption> and scope=\"col\" on every header cell (Task 12, audit 2026-08-18)", () => {
    const rows = [
      row({ jobId: "j1", bucket: "produced" }),
      row({ jobId: "j2", bucket: "parked", gate: "cast" }),
    ];
    const html = renderQueueBody(rows);
    const tableCount = (html.match(/<table>/g) ?? []).length;
    assert.equal(tableCount, 2, "one table per populated bucket");
    const captionCount = (html.match(/<caption>[^<]+<\/caption>/g) ?? []).length;
    assert.equal(captionCount, 2, "every table must have its own caption");
    const thCount = (html.match(/<th[ >]/g) ?? []).length;
    const scopedThCount = (html.match(/<th scope="col">/g) ?? []).length;
    assert.ok(thCount > 0, "expected at least one <th>");
    assert.equal(scopedThCount, thCount, "every <th> must carry scope=\"col\", including the unlabeled action column");
  });
});

describe("renderQueueBody — view toggle (Kanban layout option)", () => {
  it("default (no view arg) renders the list-view toggle plus the EXACT pre-Kanban stacked-table body, byte-for-byte (regression guard)", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS);
    assert.equal(html, `${LIST_TOGGLE}${GOLDEN_LIST_BODY}`);
  });

  it('?view=list explicitly produces byte-for-byte the same output as the default (no view arg)', () => {
    assert.equal(renderQueueBody(THREE_BUCKET_ROWS, "list"), renderQueueBody(THREE_BUCKET_ROWS));
  });

  it("an unrecognized view value falls back to the list layout, byte-for-byte identical to the default", () => {
    assert.equal(renderQueueBody(THREE_BUCKET_ROWS, "grid"), renderQueueBody(THREE_BUCKET_ROWS));
    assert.equal(renderQueueBody(THREE_BUCKET_ROWS, ""), renderQueueBody(THREE_BUCKET_ROWS));
  });

  it("renders two plain GET links, /queue?view=list and /queue?view=kanban, marking whichever is active", () => {
    const listHtml = renderQueueBody(THREE_BUCKET_ROWS, "list");
    assert.match(listHtml, /<a href="\/queue\?view=list" class="active" aria-current="true">List view<\/a>/);
    assert.match(listHtml, /<a href="\/queue\?view=kanban">Board view<\/a>/);

    const kanbanHtml = renderQueueBody(THREE_BUCKET_ROWS, "kanban");
    assert.match(kanbanHtml, /<a href="\/queue\?view=list">List view<\/a>/);
    assert.match(kanbanHtml, /<a href="\/queue\?view=kanban" class="active" aria-current="true">Board view<\/a>/);
  });

  it("never uses aria-current=\"page\" for the view toggle (reserved for the shared nav's own current-page link)", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS, "kanban");
    assert.doesNotMatch(html, /aria-current="page"/);
  });
});

describe("renderQueueBody — ?view=kanban: one column per non-empty bucket, side by side", () => {
  it("renders one <h3> column heading per non-empty bucket, in BUCKET_ORDER, with the same label+count the list view uses, and NO <table> at all", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS, "kanban");

    assert.doesNotMatch(html, /<table>/, "the Kanban board must not render a full 9-column table");
    assert.doesNotMatch(html, /<caption>/);

    const failedIndex = html.indexOf('<h3 class="bucket-failed">Failed (1)</h3>');
    const parkedIndex = html.indexOf('<h3 class="bucket-parked">Parked (waiting on a human pick) (1)</h3>');
    const producedIndex = html.indexOf('<h3 class="bucket-produced">Produced (1)</h3>');
    assert.ok(failedIndex !== -1 && parkedIndex !== -1 && producedIndex !== -1, "every non-empty bucket must have a column heading");
    assert.ok(failedIndex < parkedIndex && parkedIndex < producedIndex, "columns must appear in BUCKET_ORDER (failed, parked, ..., produced)");
  });

  it("omits a column entirely for a bucket with zero rows, exactly like the list view omits its table", () => {
    const rows = [row({ jobId: "j1", bucket: "produced" })];
    const html = renderQueueBody(rows, "kanban");
    assert.doesNotMatch(html, /bucket-failed/);
    assert.doesNotMatch(html, /bucket-parked/);
    assert.match(html, /bucket-produced/);
  });

  it("shows each row as a compact card: Idea title, Recipe, gate (when present), enqueued date, and the Asset link", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS, "kanban");

    assert.match(html, /<p class="kanban-card-title">Parked One<\/p>/);
    assert.match(html, /<p class="kanban-card-meta">News Carousel<\/p>/);
    assert.match(html, /<p class="kanban-card-meta">Gate: cast<\/p>/);
    assert.match(html, /Enqueued 2026-08-14 09:00 UTC/);
    assert.match(html, /<a href="\/assets\/asset-j2" target="_blank" rel="noopener">view<\/a>/);

    // A row with no gate must not render a stray "Gate:" line.
    assert.doesNotMatch(html, /<p class="kanban-card-title">Produced One<\/p>\s*<p class="kanban-card-meta">News Carousel<\/p>\s*<p class="kanban-card-meta">Gate:/);
  });

  it("wraps the whole board in a .table-scroll container, so a narrow viewport scrolls the board, not the page", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS, "kanban");
    assert.match(html, /<div class="table-scroll">\s*<div class="kanban-board">/);
  });

  it("keeps every card's Idea title as an <h3> per column, not the individual cards, so a screen reader still gets a clear per-bucket structure without a <table>", () => {
    const html = renderQueueBody(THREE_BUCKET_ROWS, "kanban");
    const h3Count = (html.match(/<h3[ >]/g) ?? []).length;
    assert.equal(h3Count, 3, "one <h3> per non-empty bucket column");
  });
});

describe("renderQueueBody — empty queue behaves sensibly in both views", () => {
  it("shows the same 'queue is empty' message, prefixed by the toggle, for the default (list) view", () => {
    const html = renderQueueBody([]);
    assert.equal(html, `${LIST_TOGGLE}<p class="muted">The queue is empty.</p>`);
  });

  it("shows the same 'queue is empty' message for ?view=kanban too — no empty board markup", () => {
    const html = renderQueueBody([], "kanban");
    assert.equal(html, `${KANBAN_TOGGLE}<p class="muted">The queue is empty.</p>`);
    assert.doesNotMatch(html, /kanban-board/);
  });
});
