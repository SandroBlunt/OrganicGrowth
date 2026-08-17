/**
 * The Top 5 screen (issue #210, epic Question 1: "the top 5 Assets by Performance Score with their
 * Production Specs side by side"). Pure — no database, no `node:fs`.
 */

import { escapeHtml, formatScore, formatDate } from "./html.ts";
import type { TopAssetEntry } from "../types.ts";

function columnHtml(entry: TopAssetEntry): string {
  const { row, spec } = entry;
  const specHtml = spec === null ? `<p class="muted">No Production Spec saved.</p>` : `<pre>${escapeHtml(JSON.stringify(spec, null, 2))}</pre>`;
  return `<div class="spec-col">
    <h3><a href="/assets/${encodeURIComponent(row.assetId)}">${escapeHtml(row.ideaTitle)}</a></h3>
    <p><span class="badge">${escapeHtml(row.hookType)}</span> <span class="badge">${escapeHtml(row.theme)}</span></p>
    <p>${escapeHtml(row.recipeName)} &middot; ${escapeHtml(row.formatName)} &middot; ${escapeHtml(row.brandName)}</p>
    <p>Performance Score (measured): <strong>${formatScore(row.bestPerformanceScore)}</strong></p>
    <p>Fit Score (predicted): ${row.fitScore !== undefined ? formatScore(row.fitScore) : "—"}</p>
    <p>Produced: ${formatDate(row.producedAt)}</p>
    ${specHtml}
  </div>`;
}

/** Renders the Top-5-by-Performance-Score page body — fewer than 5 columns when fewer than 5 Assets
 *  have been scored yet (never padded to look like there were five). */
export function renderTopBody(entries: readonly TopAssetEntry[], totalScoredAssetCount: number): string {
  if (entries.length === 0) {
    return `<p class="muted">No Asset has a Performance Score yet — nothing to compare. Once <code>/track-performance</code> has run and scored at least one Post, its Asset will appear here.</p>`;
  }
  const note =
    entries.length < 5
      ? `<p>Only ${entries.length} of a possible 5 shown — only ${totalScoredAssetCount} Asset(s) in the whole database have a Performance Score yet.</p>`
      : `<p>${entries.length} Assets, ranked by Performance Score (measured), highest first.</p>`;
  return `${note}<div class="spec-grid">${entries.map(columnHtml).join("\n")}</div>`;
}
