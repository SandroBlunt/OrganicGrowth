/**
 * `createBrand` / `createFormat` / `createRun` — the typed command surface's tenancy/config operations
 * (issue #204 — thin orchestration shells over `src/brand/store.ts`/`src/format/store.ts`/
 * `src/run/store.ts`).
 *
 * Not part of issue #205's own eight named runtime-pipeline operations — #205 scoped itself to
 * listing Trends, creating an Idea, recording a Review decision, enqueuing/claiming jobs, saving an
 * Asset, logging a Post, and reading Performance. The one-shot importer (#204) is the first caller that
 * needs to create Brand/Format/Run rows at all (nothing above the store layer created any of these
 * three before this ticket), and "route every write through the command surface, never directly
 * through a store" means the importer cannot legally reach `createBrand`/`createFormat`/`createRun`
 * directly — so this module adds the three thin shells, following #205's own established pattern.
 */

import type { DatabaseSync } from "node:sqlite";

import { createBrand as createBrandRow, type BrandInput, type BrandRecord } from "../brand/store.ts";
import { createFormat as createFormatRow, type FormatDbInput, type FormatDbRecord } from "../format/store.ts";
import { createRun as createRunRow, type RunInput, type RunRecord } from "../run/store.ts";

export type { BrandInput, BrandRecord, FormatDbInput, FormatDbRecord, RunInput, RunRecord };

/** Creates one Brand. Returns its generated id. Throws (SQLite UNIQUE error) for a `slug` already
 *  committed. See `src/brand/store.ts`'s `createBrand` for the full contract. */
export function createBrand(db: DatabaseSync, input: BrandInput, now?: () => string): string {
  return now === undefined ? createBrandRow(db, input) : createBrandRow(db, input, now);
}

/** Creates one Format for a Brand. Returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 *  unknown `brandId`, (UNIQUE error) for a `(brandId, slug)` pair already committed. See
 *  `src/format/store.ts`'s `createFormat` for the full contract. */
export function createFormat(db: DatabaseSync, input: FormatDbInput, now?: () => string): string {
  return now === undefined ? createFormatRow(db, input) : createFormatRow(db, input, now);
}

/** Creates one Run for a Brand/Format. Returns its generated id. Throws (SQLite FOREIGN KEY error) for
 *  an unknown `brandId`/`formatId`, (UNIQUE error) for a `(formatId, runKey)` pair already committed.
 *  See `src/run/store.ts`'s `createRun` for the full contract. */
export function createRun(db: DatabaseSync, input: RunInput, now?: () => string): string {
  return now === undefined ? createRunRow(db, input) : createRunRow(db, input, now);
}
