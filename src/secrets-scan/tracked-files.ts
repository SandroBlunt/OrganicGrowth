/**
 * Tracked-files I/O shell for the credential scanner (issue #197).
 *
 * The scanner's whole point is to answer "does anything GIT WILL ACTUALLY PUBLISH carry a secret" —
 * so it must enumerate files via `git ls-files` (the tracked index), never a raw directory walk of
 * the working tree. A raw walk would also see gitignored/untracked files (a real, unpublished `.env`,
 * a locally-downloaded media file, a scratch note) and either miss the point (those are never
 * pushed) or produce false alarms about files nobody is about to commit. `git ls-files` is exactly
 * "what would `git push` publish", which is exactly the question this scanner answers.
 *
 * No allowlist of any kind lives here or in `scanner.ts` — every tracked file, in every directory, is
 * read and scanned the same way. A binary file (detected via `isBinaryContent`, the same NUL-byte
 * sniff Git itself uses) is skipped because decoding it as UTF-8 text would either throw or produce
 * meaningless garbage to scan — never because of its location.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { findCredentialShapedStrings, isBinaryContent } from "./scanner.ts";
import type { CredentialFinding, ScannableFile } from "./scanner.ts";

/** Tracked text files above this size are skipped (never expected for source/state files in this
 *  repository; guards against pathologically scanning something huge that slipped into git). */
const MAX_SCANNABLE_BYTES = 5 * 1024 * 1024;

/**
 * List every file `git` currently tracks at `repoRoot`, as repo-relative paths (`git ls-files -z`,
 * NUL-separated so filenames containing unusual characters are never mis-split). Empty array if
 * `repoRoot` is not (or is no longer) a git working tree — this is a build-time developer check, not
 * something that should crash a caller.
 */
export async function listTrackedFiles(repoRoot: string): Promise<string[]> {
  let stdout: string;
  try {
    stdout = await new Promise<string>((resolvePromise, reject) => {
      execFile(
        "git",
        ["ls-files", "-z"],
        { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
        (error, out) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise(out);
        },
      );
    });
  } catch {
    return [];
  }
  return stdout.split("\0").filter((p) => p.length > 0);
}

/**
 * Read every named tracked file (repo-relative paths, as returned by `listTrackedFiles`) into
 * `{ path, content }` pairs ready for `findCredentialShapedStrings`. Skips (never throws for):
 *   - a file that no longer exists on disk (tracked but deleted in the working tree — a caller
 *     scanning HEAD via a temp checkout would never hit this; a caller scanning the live working
 *     tree might, mid-edit),
 *   - binary content (`isBinaryContent`),
 *   - anything larger than `MAX_SCANNABLE_BYTES`.
 */
export async function readScannableFiles(
  repoRoot: string,
  paths: readonly string[],
): Promise<ScannableFile[]> {
  const files: ScannableFile[] = [];
  for (const relPath of paths) {
    let buf: Buffer;
    try {
      buf = await readFile(join(repoRoot, relPath));
    } catch {
      continue;
    }
    if (buf.length > MAX_SCANNABLE_BYTES) continue;
    if (isBinaryContent(buf)) continue;
    files.push({ path: relPath, content: buf.toString("utf8") });
  }
  return files;
}

/**
 * The whole shell, composed: list tracked files, read the scannable ones, run the pure scanner.
 * This is the ONE function a "does this repository carry a credential right now" check needs.
 */
export async function scanRepo(repoRoot: string): Promise<readonly CredentialFinding[]> {
  const tracked = await listTrackedFiles(repoRoot);
  const scannable = await readScannableFiles(repoRoot, tracked);
  return findCredentialShapedStrings(scannable);
}
