/**
 * Library — the pure shapes behind Elgato Camera Hub's on-disk teleprompter content library (issue
 * #189, `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`), proven by the 2026-08-12
 * smoke test: one JSON file per script (`Texts/<GUID>.json`) plus a flat GUID pointer list in
 * `AppSettings.json` (`applogic.prompter.libraryList`) — writing the Texts file alone does nothing; a
 * script only appears once its GUID is ALSO appended to that pointer list.
 *
 * PURE, Recipe-agnostic — this file knows nothing about the News Short Script Recipe or Assets; the I/O
 * (reading/writing the two files, the quit/backup/relaunch sequence) lives in `upload.ts`.
 */

import { randomUUID } from "node:crypto";
import { splitChapters } from "./chapters.ts";

/** The `AppSettings.json` key whose flat GUID array is what actually makes a script show up in Camera
 *  Hub's teleprompter panel (2026-08-12 smoke test's "critical gotcha"). */
export const LIBRARY_LIST_KEY = "applogic.prompter.libraryList";

/** One script's `Texts/<GUID>.json` record — byte-for-byte the shape the smoke test captured. */
export interface TeleprompterScriptRecord {
  readonly GUID: string;
  readonly chapters: readonly string[];
  readonly friendlyName: string;
  readonly index: number;
}

/** Standard UUID shape, uppercase, hyphenated 8-4-4-4-12 — the GUID format Camera Hub expects, and
 *  which MUST match its own `Texts/<GUID>.json` filename. */
const GUID_PATTERN = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

/** Pure predicate: does `value` match Camera Hub's expected GUID shape? */
export function isValidTeleprompterGuid(value: string): boolean {
  return GUID_PATTERN.test(value);
}

/** Generate a fresh Camera Hub GUID: a standard UUID (`node:crypto`'s `randomUUID`), uppercased — already
 *  the exact 8-4-4-4-12 hyphenated shape Camera Hub expects. */
export function newScriptGuid(): string {
  return randomUUID().toUpperCase();
}

/** Build one script's `Texts/<GUID>.json` record: `chapters` is derived from `bodyText` via
 *  `splitChapters` (blank-line paragraphs, internal newlines collapsed). `index` is the caller's own
 *  order hint (the smoke test: "safe to set to `len(existing library)` at write time"). */
export function buildScriptRecord(
  guid: string,
  friendlyName: string,
  bodyText: string,
  index: number,
): TeleprompterScriptRecord {
  return { GUID: guid, chapters: splitChapters(bodyText), friendlyName, index };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the existing pointer list off a raw, already-parsed `AppSettings.json` value — `[]` for any
 *  missing/malformed shape (a non-object `raw`, a missing key, a non-array value, or non-string
 *  entries are silently dropped rather than throwing). */
export function existingLibraryGuids(raw: unknown): string[] {
  if (!isPlainObject(raw)) return [];
  const list = raw[LIBRARY_LIST_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter((g): g is string => typeof g === "string");
}

/**
 * Return a NEW settings object with `guids` appended to the existing pointer list — every other key of
 * `raw` is preserved untouched (never a blind overwrite of the whole file). A non-object/malformed
 * `raw` degrades to a fresh `{}` (never throws); a malformed existing pointer-list value is replaced
 * with just `guids` (never crashes on a garbled prior write).
 */
export function appendLibraryGuids(raw: unknown, guids: readonly string[]): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(raw) ? { ...raw } : {};
  const existing = existingLibraryGuids(raw);
  return { ...base, [LIBRARY_LIST_KEY]: [...existing, ...guids] };
}
