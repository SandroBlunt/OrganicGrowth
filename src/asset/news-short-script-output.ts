/**
 * News Short Script output rendering — this Recipe's own extension of the shared `.output/` bundle
 * conventions (issue #112, issue #174).
 *
 * Every Asset's `.output/` bundle already carries the downloaded media, a paste-ready `caption.txt`
 * (`output-bundle.ts`'s `captionText`), and `post.json`. The News Short Script Recipe's Asset ALSO
 * carries the teleprompter script itself — issue #174's own requirement that it be "a single
 * copy-paste-ready file" — kept SEPARATE from `caption.txt` (the YouTube title + description, a
 * different artifact) and separate from a Shot List manifest naming each beat's show cue, source, and
 * collected-media outcome (CONTEXT.md "Shot List": "The Operator records and edits against it").
 *
 * `scriptText`/`shotListText` are pure renderers (mirrors `output-bundle.ts`'s own
 * pure-render-then-thin-write-shell split); `writeScriptText`/`writeShotListText` are the thin disk
 * writers, using the SAME atomic writer every other bundle file uses.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../fs/safe-io.ts";
import type {
  NewsShortScriptBeat,
  NewsShortScriptSpec,
} from "../production-spec/news-short-script-contract.ts";
import type { ShotListBeatResult } from "./shot-list-media.ts";

// ---------------------------------------------------------------------------
// scriptText — the single, copy-paste-ready teleprompter file
// ---------------------------------------------------------------------------

/**
 * The document-only marker `scriptText` inserts BETWEEN two consecutive beats' spoken lines — never
 * inside a beat's own `text` field, and never itself spoken aloud (CONTEXT.md "Shot List": "The
 * produced script marks each beat's pairing inline with a `[Next shot]` annotation — never spoken, a
 * document marker only", 2026-08-12 grilling; issue #187). It makes the beat-to-Shot-List-entry pairing
 * that already exists in the underlying data (one beat, one Shot List entry) visible when reading the
 * file — a rendering concern only, so a beat's own `text` is never touched by it.
 */
export const NEXT_SHOT_MARKER = "[Next shot]";

/**
 * Render the Spec's beats as ONE clean teleprompter text: each beat's `text`, in order, separated by a
 * `NEXT_SHOT_MARKER` line (one between every pair of consecutive beats — issue #187) — spoken words
 * only, no beat-role labels, show cues, or URLs (those belong in the Shot List manifest, `shotListText`,
 * a separate file). The marker is a document annotation, never part of any beat's own `text`; the
 * Operator never reads it aloud when copy-pasting this file into a teleprompter app. This is what the
 * Operator uses to read the script AND see where each beat's paired Shot List entry (source, show cue,
 * media) changes.
 */
export function scriptText(spec: NewsShortScriptSpec): string {
  const lines = spec.beats.map((b) => b.text.trim()).filter((t) => t.length > 0);
  return `${lines.join(`\n\n${NEXT_SHOT_MARKER}\n\n`)}\n`;
}

// ---------------------------------------------------------------------------
// shotListText — the human-readable Shot List manifest
// ---------------------------------------------------------------------------

/** One line describing a beat's collected-media outcome, for the Shot List manifest. */
function mediaLine(result: ShotListBeatResult | undefined): string {
  if (result === undefined) return "media: not collected";
  const media = result.media;
  if (media.kind === "downloaded") {
    return `media: downloaded -> ${media.filename}`;
  }
  const why = media.reason === "download_failed" ? "download failed" : "no specific media identified";
  return `media: link only (${why}) -> ${media.url}`;
}

/** One line listing a beat's Curiosity Queries (CONTEXT.md "Curiosity Queries") — the research aid
 *  helping the Operator find better real source material for this beat; never spoken, never itself the
 *  beat's own source/media (issue #187). */
function queriesLine(beat: NewsShortScriptBeat): string {
  return `queries: ${beat.curiosity_queries.join(" | ")}`;
}

/**
 * Render a human-readable Shot List manifest (CONTEXT.md "Shot List"): for each beat, its role, show
 * cue, source page, Curiosity Queries, and how its media resolved (a downloaded local filename, or a
 * clearly-marked link and why). `results` is OPTIONAL — when collection hasn't run yet (or a beat's
 * result is missing for any reason), that beat's media line reads `"not collected"` rather than the
 * render crashing.
 */
export function shotListText(
  spec: NewsShortScriptSpec,
  results: readonly ShotListBeatResult[] = [],
): string {
  const byIndex = new Map(results.map((r) => [r.beatIndex, r]));
  const blocks = spec.beats.map((beat, i) => {
    return [
      `[${beat.role.toUpperCase()}]`,
      `show: ${beat.show_cue}`,
      `source: ${beat.source_url}`,
      queriesLine(beat),
      mediaLine(byIndex.get(i)),
    ].join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Shell: write to disk
// ---------------------------------------------------------------------------

/** Write `script.txt` (`scriptText(spec)`) into `dir`, creating it if absent. Returns the written path. */
export async function writeScriptText(dir: string, spec: NewsShortScriptSpec): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "script.txt");
  await writeFileAtomic(path, scriptText(spec));
  return path;
}

/** Write `shot-list.txt` (`shotListText(spec, results)`) into `dir`, creating it if absent. Returns the
 *  written path. */
export async function writeShotListText(
  dir: string,
  spec: NewsShortScriptSpec,
  results: readonly ShotListBeatResult[] = [],
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "shot-list.txt");
  await writeFileAtomic(path, shotListText(spec, results));
  return path;
}
