/**
 * The Run & queue state screen (issue #210, AC6): what is produced, parked, or failed — without reading
 * `data/queue.json`. Pure — no database, no `node:fs`.
 */

import { escapeHtml, formatDate } from "./html.ts";
import type { QueueRow, QueueBucket } from "../types.ts";

const BUCKET_ORDER: readonly QueueBucket[] = ["failed", "parked", "running", "queued", "produced", "done"];
const BUCKET_LABEL: Readonly<Record<QueueBucket, string>> = {
  failed: "Failed",
  parked: "Parked (waiting on a human pick)",
  running: "Running",
  queued: "Queued",
  produced: "Produced",
  done: "Done (Job finished, Asset not yet produced)",
};

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
    <td><a href="/assets/${encodeURIComponent(row.assetId)}">view</a></td>
  </tr>`;
}

/** Renders the Run & queue screen's body, grouped by bucket with a per-bucket count so the three states
 *  AC6 names (produced / parked / failed) are visible at a glance, never requiring a JSON read. */
export function renderQueueBody(rows: readonly QueueRow[]): string {
  if (rows.length === 0) {
    return `<p class="muted">The queue is empty.</p>`;
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

  const sections = BUCKET_ORDER.filter((b) => byBucket.has(b))
    .map((bucket) => {
      const bucketRows = byBucket.get(bucket)!.map(rowHtml).join("\n");
      return `<h3 class="bucket-${bucket}">${BUCKET_LABEL[bucket]} (${byBucket.get(bucket)!.length})</h3>
<table>
  <thead><tr><th>Idea</th><th>Recipe</th><th>Brand</th><th>Format</th><th>Job status</th><th>Asset status</th><th>Gate</th><th>Enqueued</th><th></th></tr></thead>
  <tbody>${bucketRows}</tbody>
</table>`;
    })
    .join("\n");

  return `<p>${rows.length} Job(s) total. ${summary}</p>\n${sections}`;
}
