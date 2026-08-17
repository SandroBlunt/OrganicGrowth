/**
 * `convertPngToJpg` — the cross-platform replacement for shelling out to macOS's `sips` (issue #209).
 *
 * Pure Node + `jpeg-js`: read the source PNG, `decodePng` it (`./png-decode.ts`, zero new dependencies),
 * `encodeJpeg` the result (`./jpeg-encode.ts`, the one new dependency this ticket adds), write the JPEG
 * bytes to `destPath`. No subprocess, no shelled-out binary of any kind — this is what unpins the worker
 * from "must run on this specific Mac" (epic #195, issue #209's own brief): it runs identically on any
 * host Node runs on, CI included.
 *
 * Same contract as the `sips`-backed function it replaces (`convertPngToJpgViaSips`, deleted by this
 * ticket): `sourcePath` is read but never modified, and converting in place (`destPath === sourcePath`)
 * is refused BEFORE any file is touched.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { decodePng } from "./png-decode.ts";
import { encodeJpeg } from "./jpeg-encode.ts";

export interface ConvertPngToJpgOptions {
  /** `jpeg-js`'s own 0–100 quality scale. Defaults to `encodeJpeg`'s own default (90). */
  readonly quality?: number;
}

/**
 * Convert the PNG at `sourcePath` into a brand-new JPG file at `destPath`. Throws WITHOUT reading
 * anything if `destPath` resolves to the same file as `sourcePath` — the source PNG must stay untouched.
 */
export async function convertPngToJpg(
  sourcePath: string,
  destPath: string,
  options: ConvertPngToJpgOptions = {},
): Promise<void> {
  if (resolve(sourcePath) === resolve(destPath)) {
    throw new Error(
      `convertPngToJpg: destPath must differ from sourcePath (got "${sourcePath}") — the original PNG ` +
        "must stay untouched",
    );
  }
  const pngBytes = await readFile(sourcePath);
  const { width, height, rgba } = decodePng(pngBytes);
  const jpegBytes = encodeJpeg(rgba, width, height, options.quality);
  await writeFile(destPath, jpegBytes);
}
