/**
 * `createBrand` / `createFormat` / `createRun` / `createChannel` — the typed command surface's
 * tenancy/config operations (issue #204 — thin orchestration shells over `src/brand/store.ts`/
 * `src/format/store.ts`/`src/run/store.ts`; `createChannel` added by issue #240, over
 * `src/channel/store.ts`).
 *
 * Not part of issue #205's own eight named runtime-pipeline operations — #205 scoped itself to
 * listing Trends, creating an Idea, recording a Review decision, enqueuing/claiming jobs, saving an
 * Asset, logging a Post, and reading Performance. The one-shot importer (#204) is the first caller that
 * needs to create Brand/Format/Run rows at all (nothing above the store layer created any of these
 * three before this ticket), and "route every write through the command surface, never directly
 * through a store" means the importer cannot legally reach `createBrand`/`createFormat`/`createRun`
 * directly — so this module adds the three thin shells, following #205's own established pattern.
 *
 * `createChannel` follows the SAME pattern: issue #240 found the importer had never created a single
 * `channel` row (#204's own `handoff.md` named this a known gap — importing `post` needs a `channel`
 * row to key against), so this is the first caller that needs Channel creation at all.
 */

import type { DatabaseSync } from "node:sqlite";

import { createBrand as createBrandRow, type BrandInput, type BrandRecord } from "../brand/store.ts";
import { createFormat as createFormatRow, type FormatDbInput, type FormatDbRecord } from "../format/store.ts";
import { createRun as createRunRow, type RunInput, type RunRecord } from "../run/store.ts";
import { createChannel as createChannelRow, type ChannelInput, type ChannelRecord } from "../channel/store.ts";

export type { BrandInput, BrandRecord, FormatDbInput, FormatDbRecord, RunInput, RunRecord, ChannelInput, ChannelRecord };

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

/** Creates one Channel for a Brand. Returns its generated id. Throws (SQLite FOREIGN KEY error) for an
 *  unknown `brandId`, (CHECK error) for a `platform` outside `KNOWN_PLATFORMS`, (UNIQUE error) for a
 *  second `isPrimary: true` Channel on the same Brand. See `src/channel/store.ts`'s `createChannel` for
 *  the full contract. */
export function createChannel(db: DatabaseSync, input: ChannelInput, now?: () => string): string {
  return now === undefined ? createChannelRow(db, input) : createChannelRow(db, input, now);
}
