/**
 * The Library screen (issue #210, AC2/AC3): lists every Asset, sortable by Performance Score,
 * filterable by hook type, theme, Recipe, and Format. Pure — takes already-fetched, already-filtered/
 * sorted data and returns an HTML string; no database, no `node:fs`.
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

const SORT_OPTIONS: readonly { readonly value: LibrarySort; readonly label: string }[] = [
  { value: "performance", label: "Performance Score (measured)" },
  { value: "fit", label: "Fit Score (predicted)" },
  { value: "produced", label: "Produced date" },
  { value: "title", label: "Idea title" },
];

function filterFormHtml(options: LibraryFilterOptions, activeFilter: LibraryFilter, activeSort: LibrarySort): string {
  const hookTypeOptions = optionsHtml(
    options.hookTypes.map((h) => ({ value: h, label: h })),
    activeFilter.hookType,
  );
  const themeOptions = optionsHtml(
    options.themes.map((t) => ({ value: t, label: t })),
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
  const sortOptions = SORT_OPTIONS.map(
    (s) => `<option value="${s.value}"${s.value === activeSort ? " selected" : ""}>${escapeHtml(s.label)}</option>`,
  ).join("");

  return `<form class="filters" method="get" action="/">
  <div><label for="hookType">Hook type</label><select id="hookType" name="hookType">${hookTypeOptions}</select></div>
  <div><label for="theme">Theme</label><select id="theme" name="theme">${themeOptions}</select></div>
  <div><label for="recipe">Recipe</label><select id="recipe" name="recipe">${recipeOptions}</select></div>
  <div><label for="format">Format</label><select id="format" name="format">${formatOptions}</select></div>
  <div><label for="sort">Sort by</label><select id="sort" name="sort">${sortOptions}</select></div>
  <div><button type="submit">Apply</button> <a href="/">Reset</a></div>
</form>`;
}

function rowHtml(row: LibraryAssetRow): string {
  const postLinks = row.posts.length === 0
    ? "—"
    : row.posts.map((p) => `<a href="${escapeHtml(p.postUrl)}" target="_blank" rel="noopener">${escapeHtml(p.channelPlatform)}</a>`).join(", ");
  return `<tr>
    <td><a href="/assets/${encodeURIComponent(row.assetId)}">${escapeHtml(row.ideaTitle)}</a></td>
    <td><span class="badge">${escapeHtml(row.hookType)}</span></td>
    <td><span class="badge">${escapeHtml(row.theme)}</span></td>
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

  if (rows.length === 0) {
    return `${form}${countLine}<p class="muted">No Assets match this filter.</p>`;
  }

  const body = rows.map(rowHtml).join("\n");
  return `${form}${countLine}
<table>
  <thead>
    <tr>
      <th>Idea</th><th>Hook type</th><th>Theme</th><th>Recipe</th><th>Format</th><th>Brand</th>
      <th>Status</th><th>Fit Score (predicted)</th><th>Performance Score (measured)</th><th>Produced</th><th>Post(s)</th>
    </tr>
  </thead>
  <tbody>
${body}
  </tbody>
</table>`;
}
