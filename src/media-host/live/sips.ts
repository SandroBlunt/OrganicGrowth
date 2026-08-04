/**
 * The `convertToJpg` half of the live Media Host adapter (issue #144): shells out to macOS's built-in
 * `sips` (scriptable image processing system) — no new npm dependency, exactly as the issue specifies.
 */

import { resolve } from "node:path";

import { execFileRunner, type CommandRunner } from "./command-runner.ts";

export interface SipsAdapterOptions {
  /** Override the `sips` binary/path. Default: `"sips"` (resolved via `PATH`). */
  readonly sipsCommand?: string | undefined;
  /** Injected in tests to prove argv construction without a real process. Default: `execFileRunner`. */
  readonly runner?: CommandRunner | undefined;
}

const DEFAULT_SIPS_COMMAND = "sips";

/**
 * Convert the PNG at `sourcePath` into a brand-new JPG file at `destPath` via
 * `sips -s format jpeg <sourcePath> --out <destPath>`. Throws WITHOUT running any command if
 * `destPath` resolves to the same file as `sourcePath` — this port never rewrites a slide's original
 * PNG in place (issue #144 acceptance criterion: "the original PNGs stay untouched").
 */
export async function convertPngToJpgViaSips(
  sourcePath: string,
  destPath: string,
  options: SipsAdapterOptions = {},
): Promise<void> {
  if (resolve(sourcePath) === resolve(destPath)) {
    throw new Error(
      `convertPngToJpgViaSips: destPath must differ from sourcePath (got "${sourcePath}") — the ` +
        "original PNG must stay untouched",
    );
  }
  const runner = options.runner ?? execFileRunner;
  const command = options.sipsCommand ?? DEFAULT_SIPS_COMMAND;
  await runner(command, ["-s", "format", "jpeg", sourcePath, "--out", destPath]);
}
