/**
 * Media key derivation — pure deep module for the Schedule Batch export's hosted media (issue #145,
 * parent #140). `src/media-host/key.ts` (issue #144) enforces the ONE shared `.jpg`-suffix invariant
 * every hosted key/URL must satisfy; THIS module derives the actual key STRING a slide is hosted under,
 * mirroring the live-verified `<brand>/<run>/<idea-short-name>/<slide-base-name>.jpg` layout (the W32
 * smoke test's own manifest, e.g. `straw-motion/2026-W32/idea-01/0-hook.jpg`) — namespaced so two runs,
 * or two Ideas in the same run, never collide under the same bucket.
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
 * The S3 object key a slide is hosted under: `<brand>/<run>/<ideaShortName>/<slideBaseName>.jpg`.
 * ALWAYS ends `.jpg` (the Schedule Batch export always converts a slide to JPG before hosting it —
 * `src/media-host/port.ts`'s `convertToJpg`), regardless of the slide's own source extension.
 */
export function scheduleMediaKey(
  brand: string,
  run: string,
  ideaShortName: string,
  baseName: string,
): string {
  return `${brand}/${run}/${ideaShortName}/${baseName}.jpg`;
}
