/**
 * The Run & queue state screen (issue #210, AC6): what is produced, parked, or failed — without reading
 * `data/queue.json`. Pure — no database, no `node:fs`.
 *
 * Two read-only layouts over the SAME `QueueRow[]` data (issue: Kanban-style layout for /queue):
 *   - `"list"` (default) — the original one-`<table>`-per-bucket, stacked vertically.
 *   - `"kanban"` — one column per non-empty bucket, side by side, each row shown as a compact card.
 * Which one renders is chosen by a plain `?view=list` / `?view=kanban` GET link (`viewToggleHtml`) —
 * there is no `<form method="post">`, no client-side JS, and nothing here reorders, drags, or writes
 * anything: it is strictly a different arrangement of the same read.
 */

import { escapeHtml, formatDate } from "./html.ts";
import type { QueueRow, QueueBucket, QueueView } from "../types.ts";

const BUCKET_ORDER: readonly QueueBucket[] = ["failed", "parked", "running", "queued", "produced", "done"];
const BUCKET_LABEL: Readonly<Record<QueueBucket, string>> = {
  failed: "Failed",
  parked: "Parked (waiting on a human pick)",
  running: "Running",
  queued: "Queued",
  produced: "Produced",
  done: "Done (Job finished, Asset not yet produced)",
};

const VIEW_LABEL: Readonly<Record<QueueView, string>> = {
  list: "List view",
  kanban: "Board view",
};

/** Any `view` value other than the literal `"kanban"` — including `undefined` (no query param at all)
 *  and any unrecognized string — resolves to `"list"`, the original behavior. Strictly additive: nobody
 *  who isn't already passing `?view=kanban` sees a different layout than before this feature existed. */
function resolveView(view: string | undefined): QueueView {
  return view === "kanban" ? "kanban" : "list";
}

/** The two plain GET links that switch between layouts — `/queue?view=list` / `/queue?view=kanban`.
 *  Matches this app's existing all-HTML, no-JS interaction style (the Library screen's filter form).
 *  Marks the active choice with `class="active"` and `aria-current="true"` (NOT `"page"` — that reserved
 *  value already marks the shared nav's own current-page link, `render/html.ts`'s `page()`; using it a
 *  second time here for a same-page view toggle would make TWO `aria-current="page"` elements coexist,
 *  breaking `server.test.ts`'s "exactly one" nav assertion and misusing the token besides). */
function viewToggleHtml(view: QueueView): string {
  const links = (["list", "kanban"] as const)
    .map((v) => {
      const isActive = v === view;
      const attrs = isActive ? ` class="active" aria-current="true"` : "";
      return `<a href="/queue?view=${v}"${attrs}>${VIEW_LABEL[v]}</a>`;
    })
    .join(" &middot; ");
  return `<p class="view-toggle">${links}</p>`;
}

function rowHtml(row: QueueRow): string {
  return `<tr>
    <td>${escapeHtml(row.ideaTitle)}</td>
    <td>${escapeHtml(row.recipeName)}</td>
    <td>${escapeHtml(row.brandSlug)}</td>
    <td>${escapeHtml(row.formatSlug)}</td>
    <td>${escapeHtml(row.jobStatus)}</td>
    <td>${escapeHtml(row.assetStatus)}</td>
    <td>${row.gate !== undefined ? escapeHtml(row.gate) : "—"}</td>
    <td>${formatDate(row.enqueuedAt)}</td>
    <td><a href="/assets/${encodeURIComponent(row.assetId)}" target="_blank" rel="noopener">view</a></td>
  </tr>`;
}

/** One bucket's rows as a stacked, captioned `<table>` — the original (list-view) presentation,
 *  unchanged since before the Kanban option existed. */
function bucketTableHtml(bucket: QueueBucket, rows: readonly QueueRow[]): string {
  const bucketRows = rows.map(rowHtml).join("\n");
  return `<h3 class="bucket-${bucket}">${BUCKET_LABEL[bucket]} (${rows.length})</h3>
<div class="table-scroll">
<table>
  <caption>${BUCKET_LABEL[bucket]} Jobs</caption>
  <thead><tr><th scope="col">Idea</th><th scope="col">Recipe</th><th scope="col">Brand</th><th scope="col">Format</th><th scope="col">Job status</th><th scope="col">Asset status</th><th scope="col">Gate</th><th scope="col">Enqueued</th><th scope="col"></th></tr></thead>
  <tbody>${bucketRows}</tbody>
</table>
</div>`;
}

/** One row, condensed to a Kanban card: Idea title, Recipe, gate (if any), enqueued date, and the same
 *  `target="_blank"` Asset link the list view's table already uses — never a full 9-column table, which
 *  would defeat the point of a compact board. */
function kanbanCardHtml(row: QueueRow): string {
  const gateLine = row.gate !== undefined ? `<p class="kanban-card-meta">Gate: ${escapeHtml(row.gate)}</p>` : "";
  return `<div class="kanban-card">
    <p class="kanban-card-title">${escapeHtml(row.ideaTitle)}</p>
    <p class="kanban-card-meta">${escapeHtml(row.recipeName)}</p>
    ${gateLine}
    <p class="kanban-card-meta">Enqueued ${formatDate(row.enqueuedAt)}</p>
    <p class="kanban-card-link"><a href="/assets/${encodeURIComponent(row.assetId)}" target="_blank" rel="noopener">view</a></p>
  </div>`;
}

/** One Kanban column — a plain `<h3>` (same label + bucket color class the list view's own heading
 *  uses, so the structure reads the same way to a screen reader even without a `<table>`'s
 *  `<caption>`/`scope="col"` scaffolding) followed by that bucket's cards. */
function kanbanColumnHtml(bucket: QueueBucket, rows: readonly QueueRow[]): string {
  const cards = rows.map(kanbanCardHtml).join("\n");
  return `<div class="kanban-column">
  <h3 class="bucket-${bucket}">${BUCKET_LABEL[bucket]} (${rows.length})</h3>
  ${cards}
</div>`;
}

/** The whole board: one column per non-empty bucket, in `BUCKET_ORDER`, wrapped in `.table-scroll` so a
 *  narrow viewport scrolls the board itself horizontally rather than the whole page (the same pattern
 *  already used for every wide `<table>` on this screen and the Asset page's Spec columns). */
function kanbanBoardHtml(byBucket: ReadonlyMap<QueueBucket, readonly QueueRow[]>): string {
  const columns = BUCKET_ORDER.filter((b) => byBucket.has(b))
    .map((b) => kanbanColumnHtml(b, byBucket.get(b)!))
    .join("\n");
  return `<div class="table-scroll">
<div class="kanban-board">
${columns}
</div>
</div>`;
}

/** Renders the Run & queue screen's body, grouped by bucket with a per-bucket count so the three states
 *  AC6 names (produced / parked / failed) are visible at a glance, never requiring a JSON read.
 *
 *  `view` is the raw `?view=` query-string value (or `undefined` when absent) — `server.ts` passes it
 *  through unparsed; this function is the one place that decides what it means. Anything other than the
 *  literal `"kanban"` renders the original stacked-table layout, so a caller that never passes `view` at
 *  all (e.g. every pre-existing call site and test) sees byte-for-byte the same output as before this
 *  option existed, aside from the new view-toggle links every state of this page now carries. */
export function renderQueueBody(rows: readonly QueueRow[], view?: string): string {
  const resolvedView = resolveView(view);
  const toggle = viewToggleHtml(resolvedView);

  if (rows.length === 0) {
    return `${toggle}<p class="muted">The queue is empty.</p>`;
  }

  const byBucket = new Map<QueueBucket, QueueRow[]>();
  for (const row of rows) {
    const list = byBucket.get(row.bucket) ?? [];
    list.push(row);
    byBucket.set(row.bucket, list);
  }

  const summary = BUCKET_ORDER.filter((b) => byBucket.has(b))
    .map((b) => `<span class="badge bucket-${b}">${BUCKET_LABEL[b]}: ${byBucket.get(b)!.length}</span>`)
    .join(" ");

  const countLine = `<p>${rows.length} Job(s) total. ${summary}</p>`;

  if (resolvedView === "kanban") {
    return `${toggle}${countLine}\n${kanbanBoardHtml(byBucket)}`;
  }

  const sections = BUCKET_ORDER.filter((b) => byBucket.has(b))
    .map((bucket) => bucketTableHtml(bucket, byBucket.get(bucket)!))
    .join("\n");

  return `${toggle}${countLine}\n${sections}`;
}
