/**
 * Resolves `APIFY_API_TOKEN` from the environment — the live Apify client's read-secrets-from-env
 * pattern (issue #200), following `src/media-host/live/env.ts`'s established shape (issue #144, settled
 * as the repo's convention in issue #197): reads `.env` when present but an `.env` value NEVER
 * overrides an already-set process env var, so a real shell-exported/CI `APIFY_API_TOKEN` always wins
 * over a stale `.env` copy. Reuses that SAME tiny, dependency-free loader directly (`loadEffectiveEnv`)
 * rather than duplicating it — this repo's only runtime dependency stays `yaml` (no new npm packages).
 *
 * `data-handling.md` rule 1 is upheld throughout: the token VALUE is never logged by anything in this
 * module — only whether one was found.
 */

import { loadEffectiveEnv } from "../../media-host/live/env.ts";

export interface ResolveApifyTokenOptions {
  /** A pre-resolved env (tests) — when given, `.env`/`base` are never consulted at all. */
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Override the `.env` file path (tests). Default: `.env` at the current working directory. */
  readonly envFilePath?: string | undefined;
  /** The base env `.env` fills gaps in, when `options.env` is not given. Default: `process.env`
   *  (tests pass `{}` to isolate the file-read path from the real shell's own environment). */
  readonly base?: NodeJS.ProcessEnv | undefined;
}

/**
 * Resolve `APIFY_API_TOKEN` from `options.env` (if given) or the effective `.env`-merged environment.
 * Returns the trimmed token, or `null` when it is absent/blank — never fabricated, never throws.
 */
export async function resolveApifyToken(
  options: ResolveApifyTokenOptions = {},
): Promise<string | null> {
  const env =
    options.env ?? (await loadEffectiveEnv({ envFilePath: options.envFilePath, base: options.base }));
  const raw = env.APIFY_API_TOKEN;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
