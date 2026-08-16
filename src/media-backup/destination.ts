/**
 * Backup destination resolution (issue #197) — pure, no I/O, no hardcoded personal path anywhere.
 *
 * Precedence: an explicit CLI argument wins, then the `MEDIA_BACKUP_DEST` env var, then the default
 * `~/OrganicGrowth-Backups`. `~` is expanded against the CALLER-SUPPLIED home directory (never
 * `os.homedir()` read directly in here) — every value this module needs is a plain argument, so a
 * test never touches the real filesystem or the real `$HOME`.
 */

import { join } from "node:path";

/** Expand a leading `~` (or `~/...`) against `homeDir`. Any other value (absolute or relative) is
 *  returned unchanged — this module never validates that a relative path is a good idea; the caller
 *  decides. */
export function expandTilde(rawPath: string, homeDir: string): string {
  if (rawPath === "~") return homeDir;
  if (rawPath.startsWith("~/")) return join(homeDir, rawPath.slice(2));
  return rawPath;
}

export interface ResolveBackupDestinationOptions {
  /** An explicit CLI argument, if the caller passed one. */
  readonly argDest?: string;
  /** The process environment to read `MEDIA_BACKUP_DEST` from. */
  readonly env?: NodeJS.ProcessEnv;
  /** The home directory `~` expands against. */
  readonly homeDir: string;
}

/** The default backup destination, before `~` expansion: a sibling of the Operator's home directory,
 *  never inside this repository's working folder (issue #197: "outside this working folder"). */
const DEFAULT_BACKUP_DEST_UNDER_HOME = "OrganicGrowth-Backups";

/**
 * Resolve the backup destination: `argDest` (if non-blank) > `env.MEDIA_BACKUP_DEST` (if non-blank) >
 * `~/OrganicGrowth-Backups`. The winning value is `~`-expanded against `homeDir` and returned as an
 * absolute-or-as-given path — never validated against the filesystem here (the backup runner creates
 * it as needed).
 */
export function resolveBackupDestination(options: ResolveBackupDestinationOptions): string {
  const { argDest, env, homeDir } = options;
  if (argDest !== undefined && argDest.trim().length > 0) {
    return expandTilde(argDest, homeDir);
  }
  const fromEnv = env?.MEDIA_BACKUP_DEST;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return expandTilde(fromEnv, homeDir);
  }
  return join(homeDir, DEFAULT_BACKUP_DEST_UNDER_HOME);
}
