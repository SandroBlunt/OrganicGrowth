/**
 * The Library screen (issue #210, AC2/AC3): lists every Asset, sortable by Performance Score,
 * filterable by Brand, hook type, theme, Recipe, Format, and status. Pure — takes already-fetched,
 * already-filtered/sorted data and returns an HTML string; no database, no `node:fs`.
 *
 * The filter/sort controls are a plain `<form method="get">` — submitting it only ever navigates to a
 * new GET url (e.g. `/?hookType=irony&sort=performance`). There is no `<form method="post">` anywhere
 * in this module, and no endpoint on the server side interprets one — filtering a READ is still a READ
 * (AC10: "no write path at all").
 */

import { escapeHtml, formatScore, formatDate } from "./html.ts";
import type { LibraryAssetRow, LibraryFilter, LibraryFilterOptions, LibrarySort } from "../types.ts";

function optionsHtml(values: readonly { readonly value: string; readonly label: string }[], selected: string | undefined): string {
  const blank = `<option value=""${selected === undefined ? " selected" : ""}>All</option>`;
  const rest = values
    .map((v) => `<option value="${escapeHtml(v.value)}"${v.value === selected ? " selected" : ""}>${escapeHtml(v.label)}</option>`)
    .join("");
  return blank + rest;
}

/** Turns a raw snake_case enum value (hookType, theme, status) into a human-readable label — spaces
 *  instead of underscores, e.g. "counter_intuitive" -> "counter intuitive" (Task 6, audit 2026-08-18).
 *  Used ONLY for the visible label; the underlying `value` (the query-string param the filter/sort logic
 *  actually reads) always stays the raw enum value, unchanged. Shared here because it's now applied in
 *  four places on this one page — the hookType/theme filter option labels, and the hookType/theme table
 *  badges — rather than four separate `.replace(/_/g, " ")` calls. */
function humanizeLabel(value: string): string {
  return value.replace(/_/g, " ");
}

const SORT_OPTIONS: readonly { readonly value: LibrarySort; readonly label: string }[] = [
  { value: "performance", label: "Performance Score (measured)" },
  { value: "fit", label: "Fit Score (predicted)" },
  { value: "produced", label: "Produced date" },
  { value: "title", label: "Idea title" },
];

function filterFormHtml(options: LibraryFilterOptions, activeFilter: LibraryFilter, activeSort: LibrarySort): string {
  const brandOptions = optionsHtml(
    options.brands.map((b) => ({ value: b.slug, label: b.name })),
    activeFilter.brand,
  );
  const hookTypeOptions = optionsHtml(
    options.hookTypes.map((h) => ({ value: h, label: humanizeLabel(h) })),
    activeFilter.hookType,
  );
  const themeOptions = optionsHtml(
    options.themes.map((t) => ({ value: t, label: humanizeLabel(t) })),
    activeFilter.theme,
  );
  const recipeOptions = optionsHtml(
    options.recipes.map((r) => ({ value: r.slug, label: r.name })),
    activeFilter.recipe,
  );
  const formatOptions = optionsHtml(
    options.formats.map((f) => ({ value: f.slug, label: f.name })),
    activeFilter.format,
  );
  const statusOptions = optionsHtml(
    options.statuses.map((s) => ({ value: s, label: humanizeLabel(s) })),
    activeFilter.status,
  );
  const sortOptions = SORT_OPTIONS.map(
    (s) => `<option value="${s.value}"${s.value === activeSort ? " selected" : ""}>${escapeHtml(s.label)}</option>`,
  ).join("");

  return `<form class="filters" method="get" action="/">
  <div><label for="brand">Brand</label><select id="brand" name="brand">${brandOptions}</select></div>
  <div><label for="hookType">Hook type</label><select id="hookType" name="hookType">${hookTypeOptions}</select></div>
  <div><label for="theme">Theme</label><select id="theme" name="theme">${themeOptions}</select></div>
  <div><label for="recipe">Recipe</label><select id="recipe" name="recipe">${recipeOptions}</select></div>
  <div><label for="format">Format</label><select id="format" name="format">${formatOptions}</select></div>
  <div><label for="status">Status</label><select id="status" name="status">${statusOptions}</select></div>
  <div><label for="sort">Sort by</label><select id="sort" name="sort">${sortOptions}</select></div>
  <div><md-filled-button type="submit">Apply</md-filled-button> <md-text-button href="/">Reset</md-text-button></div>
</form>`;
}

function rowHtml(row: LibraryAssetRow): string {
  const postLinks = row.posts.length === 0
    ? "—"
    : row.posts.map((p) => `<a href="${escapeHtml(p.postUrl)}" target="_blank" rel="noopener">${escapeHtml(p.channelPlatform)}</a>`).join(", ");
  return `<tr>
    <td><a class="idea-title-link" href="/assets/${encodeURIComponent(row.assetId)}" target="_blank" rel="noopener" title="${escapeHtml(row.ideaTitle)}">${escapeHtml(row.ideaTitle)}</a></td>
    <td><span class="badge">${escapeHtml(humanizeLabel(row.hookType))}</span></td>
    <td><span class="badge">${escapeHtml(humanizeLabel(row.theme))}</span></td>
    <td>${escapeHtml(row.recipeName)}</td>
    <td>${escapeHtml(row.formatName)}</td>
    <td>${escapeHtml(row.brandName)}</td>
    <td>${escapeHtml(row.status)}${row.pendingGate !== undefined ? ` (${escapeHtml(row.pendingGate)})` : ""}</td>
    <td>${row.fitScore !== undefined ? formatScore(row.fitScore) : "—"}</td>
    <td>${formatScore(row.bestPerformanceScore)}</td>
    <td>${formatDate(row.producedAt)}</td>
    <td>${postLinks}</td>
  </tr>`;
}

/** Renders the Library screen's body (nav/page shell is added by `html.ts`'s `page`). */
export function renderLibraryBody(
  rows: readonly LibraryAssetRow[],
  options: LibraryFilterOptions,
  activeFilter: LibraryFilter,
  activeSort: LibrarySort,
  totalAssetCount: number,
): string {
  const form = filterFormHtml(options, activeFilter, activeSort);
  const countLine =
    rows.length === totalAssetCount
      ? `<p>${rows.length} Asset(s).</p>`
      : `<p>${rows.length} of ${totalAssetCount} Asset(s) match the current filter. <a href="/">Clear filters</a>.</p>`;
  // AC8 disclosure (issue #210 QA round 1, defect 3): this list, and every filter below, is
  // ASSET-scoped — an Idea that was rejected, or accepted but never produced an Asset for the chosen
  // Recipe, never appears here, even under a hook-type/theme filter that would otherwise match it.
  // Stated plainly on every render so a "0 of N" result is never misread as "no Idea ever used this
  // hook type."
  const scopeNote = `<p class="muted">Asset-scoped: an Idea that was rejected, or accepted but never produced an Asset, will not appear here or under any filter below.</p>`;

  if (rows.length === 0) {
    return `${form}${scopeNote}${countLine}<p class="muted">No Assets match this filter.</p>`;
  }

  const body = rows.map(rowHtml).join("\n");
  return `${form}${scopeNote}${countLine}
<div class="table-scroll">
<table>
  <caption>Assets matching the current filter</caption>
  <thead>
    <tr>
      <th scope="col">Idea</th><th scope="col">Hook type</th><th scope="col">Theme</th><th scope="col">Recipe</th><th scope="col">Format</th><th scope="col">Brand</th>
      <th scope="col">Status</th><th scope="col">Fit Score (predicted)</th><th scope="col">Performance Score (measured)</th><th scope="col">Produced</th><th scope="col">Post(s)</th>
    </tr>
  </thead>
  <tbody>
${body}
  </tbody>
</table>
</div>`;
}
