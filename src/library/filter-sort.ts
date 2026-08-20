/**
 * Pure filter/sort logic for the Library screen (issue #210) — deliberately separated from
 * `read-model.ts` (which touches the database) so this module is provable with plain in-memory
 * fixtures, no `DatabaseSync`, no socket. Mirrors `src/claude-skills/reference-citation-scan.ts`'s own
 * split: the deep, pure logic here, a thin impure shell (`read-model.ts`/`server.ts`) around it.
 *
 * The one rule every sort here honors: an Asset/Idea with NO value on the sorted dimension (no
 * Performance Score yet, no Fit Score, never produced) sorts LAST, never as if it were a real `0` —
 * rule 8 ("never fabricate") applies to ORDERING, not just to displayed numbers. A missing value is a
 * different fact than a low one.
 */

import type { LibraryAssetRow, LibraryFilter, LibraryFilterOptions, LibrarySort } from "./types.ts";

/** `true` when `row` matches every field `filter` actually sets (an absent filter field imposes no
 *  constraint on that dimension). */
export function matchesLibraryFilter(row: LibraryAssetRow, filter: LibraryFilter): boolean {
  if (filter.hookType !== undefined && row.hookType !== filter.hookType) return false;
  if (filter.theme !== undefined && row.theme !== filter.theme) return false;
  if (filter.recipe !== undefined && row.recipeSlug !== filter.recipe) return false;
  if (filter.format !== undefined && row.formatSlug !== filter.format) return false;
  if (filter.brand !== undefined && row.brandSlug !== filter.brand) return false;
  if (filter.status !== undefined && row.status !== filter.status) return false;
  return true;
}

/** Filters `rows` down to those matching every set field of `filter`. */
export function applyLibraryFilter(rows: readonly LibraryAssetRow[], filter: LibraryFilter): readonly LibraryAssetRow[] {
  return rows.filter((row) => matchesLibraryFilter(row, filter));
}

/** The distinct filter option values actually present in `rows`, each sorted for a stable, predictable
 *  control order — so the Library screen's filters never offer a choice that would return zero rows. */
export function deriveFilterOptions(rows: readonly LibraryAssetRow[]): LibraryFilterOptions {
  const hookTypes = [...new Set(rows.map((r) => r.hookType))].sort();
  const themes = [...new Set(rows.map((r) => r.theme))].sort();
  const statuses = [...new Set(rows.map((r) => r.status))].sort();

  const recipeMap = new Map<string, string>();
  const formatMap = new Map<string, string>();
  const brandMap = new Map<string, string>();
  for (const row of rows) {
    recipeMap.set(row.recipeSlug, row.recipeName);
    formatMap.set(row.formatSlug, row.formatName);
    brandMap.set(row.brandSlug, row.brandName);
  }
  const recipes = [...recipeMap.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.slug.localeCompare(b.slug));
  const formats = [...formatMap.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.slug.localeCompare(b.slug));
  const brands = [...brandMap.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.slug.localeCompare(b.slug));

  return { hookTypes, themes, recipes, formats, brands, statuses };
}

/** A stable, deterministic secondary tie-break so two rows sharing a primary sort value (all the way
 *  up to and including two rows that are BOTH missing that value) always land in the SAME order on
 *  every call — never left to `Array.prototype.sort`'s own unspecified-for-ties behavior. */
function tieBreak(a: LibraryAssetRow, b: LibraryAssetRow): number {
  const byTitle = a.ideaTitle.localeCompare(b.ideaTitle);
  if (byTitle !== 0) return byTitle;
  return a.assetId.localeCompare(b.assetId);
}

/** Orders `rows` by `sort`. Returns a NEW array — never mutates `rows`. */
export function sortLibraryRows(rows: readonly LibraryAssetRow[], sort: LibrarySort): readonly LibraryAssetRow[] {
  const copy = [...rows];
  switch (sort) {
    case "performance":
      copy.sort((a, b) => {
        if (a.bestPerformanceScore === undefined && b.bestPerformanceScore === undefined) return tieBreak(a, b);
        if (a.bestPerformanceScore === undefined) return 1;
        if (b.bestPerformanceScore === undefined) return -1;
        if (a.bestPerformanceScore !== b.bestPerformanceScore) return b.bestPerformanceScore - a.bestPerformanceScore;
        return tieBreak(a, b);
      });
      return copy;
    case "fit":
      copy.sort((a, b) => {
        if (a.fitScore === undefined && b.fitScore === undefined) return tieBreak(a, b);
        if (a.fitScore === undefined) return 1;
        if (b.fitScore === undefined) return -1;
        if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
        return tieBreak(a, b);
      });
      return copy;
    case "produced":
      copy.sort((a, b) => {
        if (a.producedAt === undefined && b.producedAt === undefined) return tieBreak(a, b);
        if (a.producedAt === undefined) return 1;
        if (b.producedAt === undefined) return -1;
        if (a.producedAt !== b.producedAt) return a.producedAt < b.producedAt ? 1 : -1;
        return tieBreak(a, b);
      });
      return copy;
    case "title":
      copy.sort(tieBreak);
      return copy;
  }
}

/** The top `n` Assets by `bestPerformanceScore` (DESC, ties broken by `tieBreak`) — Assets with NO
 *  score are excluded entirely, never padded in to fill out the count (Question 1: "top 5 Assets by
 *  Performance Score" means five SCORED Assets, not five arbitrary ones). Returns fewer than `n` when
 *  fewer than `n` Assets are scored — the caller states that count plainly, never pretends there were
 *  five. */
export function topAssetsByPerformance(rows: readonly LibraryAssetRow[], n: number): readonly LibraryAssetRow[] {
  const scored = rows.filter((r) => r.bestPerformanceScore !== undefined);
  return sortLibraryRows(scored, "performance").slice(0, n);
}
