/**
 * `classifyMedia` — a produced-media filename's `asset_media.kind` + `asset_media.mime` (issue #204).
 *
 * Nothing in this repo already derives a MIME type from a filename: `src/brand-asset/store.ts`'s
 * `mediaKindForFilename` classifies `image`/`video`/`audio` alone (what the `asset_media.kind` CHECK
 * needs), and `src/asset/carousel-real-media.ts`/`src/asset/shot-list-media.ts` each carry the REVERSE
 * mapping (MIME -> extension, for naming a freshly-downloaded file). This module is the missing
 * extension -> {kind, mime} direction the importer needs to populate `asset_media`'s two NOT NULL
 * columns from a legacy `asset_paths` entry. Scoped to exactly the extensions the real ledgers carry
 * (verified: `.png`, `.jpg`/`.jpeg`, `.mp4`, `.wav` — plus `.txt`, which is deliberately UNRECOGNIZED
 * here: every `.txt` reference in the real data is one of the 8 dead media paths this ticket reports,
 * never a file the importer needs to classify into `asset_media`'s image/video/audio vocabulary).
 *
 * Pure: no disk, no network, no clock.
 */

/** One media file's SQL shape: `asset_media.kind` (the CHECK'd vocabulary) plus a real MIME string. */
export interface MediaClassification {
  readonly kind: "image" | "video" | "audio";
  readonly mime: string;
}

const EXTENSION_CLASSIFICATION: Readonly<Record<string, MediaClassification>> = {
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  mp4: { kind: "video", mime: "video/mp4" },
  wav: { kind: "audio", mime: "audio/wav" },
};

/** Classify `filename`'s produced-media kind + MIME type from its extension (case-insensitive).
 *  Returns `null` for an unrecognized or absent extension — PURE, never throws; the caller decides
 *  what an unrecognized-but-present file means (this module makes no such judgment). */
export function classifyMedia(filename: string): MediaClassification | null {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_CLASSIFICATION[ext] ?? null;
}
