/**
 * Media key derivation — pure deep module for the Schedule Batch export's hosted media (issue #145,
 * parent #140). `src/media-host/key.ts` (issue #144) enforces the ONE shared `.jpg`-suffix invariant
 * every hosted key/URL must satisfy; THIS module derives the actual key STRING a slide is hosted under,
 * namespaced so two runs, or two Ideas in the same run, never collide under the same bucket.
 *
 * Since issue #198, every key also folds in a caller-supplied, unguessable `token` (AC2 — "knowing the
 * Brand, week, Idea number and slide name is not enough to construct a key"). `scheduleMediaKey` stays
 * PURE — it never generates the token itself; the orchestration shell mints a fresh one per slide via
 * `src/media-host/token.ts`'s `randomMediaKeyToken` (the one place real randomness enters this path) and
 * passes it in explicitly, exactly like every other caller-supplied non-determinism in this codebase
 * (the clock, `now`). The resulting layout is
 * `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg` — before issue #198 the token segment
 * did not exist and the key was fully deterministic from its other four components alone (the W32 smoke
 * test's own manifest, e.g. `straw-motion/2026-W32/idea-01/0-hook.jpg`).
 */

import { basename, extname } from "node:path";

/** The slide's bare base name (no directory, no extension) — e.g. `"/a/0-hook.png"` -> `"0-hook"`.
 *  Works regardless of the source file's own extension (a produced slide may already be `.jpg` when
 *  the Space happened to render one directly, or `.png` otherwise). */
export function slideBaseName(slidePath: string): string {
  const name = basename(slidePath);
  const ext = extname(name);
  return ext.length > 0 ? name.slice(0, -ext.length) : name;
}

/**
 * The S3 object key a slide is hosted under:
 * `<brand>/<run>/<ideaShortName>/<token>/<slideBaseName>.jpg`. ALWAYS ends `.jpg` (the Schedule Batch
 * export always converts a slide to JPG before hosting it — `src/media-host/port.ts`'s `convertToJpg`),
 * regardless of the slide's own source extension. `token` MUST be non-empty (issue #198 AC2) — thrown
 * BEFORE any key is built, never silently producing a key with an empty/guessable segment.
 */
export function scheduleMediaKey(
  brand: string,
  run: string,
  ideaShortName: string,
  baseName: string,
  token: string,
): string {
  if (token.length === 0) {
    throw new Error("schedule-batch: scheduleMediaKey requires a non-empty unguessable token.");
  }
  return `${brand}/${run}/${ideaShortName}/${token}/${baseName}.jpg`;
}
