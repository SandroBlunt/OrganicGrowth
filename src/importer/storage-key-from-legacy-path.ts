/**
 * `relativizeLegacyPath` — converts one legacy ledger path (already root-relative, OR absolute under a
 * known repo root) into a root-relative storage key (issue #204).
 *
 * The ledgers hold 191 absolute `/Users/CaxtonTaylor/...` paths mixed with relative ones — "two
 * conventions inside the same records" (epic #195). `src/db/storage-key.ts`'s
 * `assertRootRelativeStorageKey` already REJECTS an absolute path at the store boundary; this module is
 * what makes a legacy absolute path convertible in the first place, one level up, before that boundary
 * is ever reached. Every real absolute path in this repo's data shares the SAME literal prefix (the
 * checkout's own absolute path) — this module strips exactly that prefix, given explicitly by the
 * caller (never inferred/guessed), and REFUSES (rather than guesses) anything it cannot safely
 * relativize: an absolute path under a DIFFERENT root, a bare `/`, or a path that still contains a `..`
 * segment after stripping (path traversal).
 *
 * Pure: no disk, no network, no clock.
 */

/** The result of attempting to relativize one legacy path. `ok: false` names WHY — the caller (the
 *  importer's planner) turns this into a named refusal, never a silent drop or a guessed key. */
export type RelativizeResult = { readonly ok: true; readonly key: string } | { readonly ok: false; readonly reason: string };

function hasDotDotSegment(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment === "..");
}

/**
 * Converts `rawPath` to a root-relative storage key.
 *
 * - Already relative (does not start with `/`): returned as-is, after confirming it carries no `..`
 *   segment.
 * - Absolute, and starts with `repoRoot`: the `repoRoot` prefix (plus the separating `/`) is stripped.
 * - Absolute, under any other root, or a bare `/`, or empty: refused (`ok: false`), naming why.
 */
export function relativizeLegacyPath(rawPath: string, repoRoot: string): RelativizeResult {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "path is empty" };
  }

  const normalizedRoot = repoRoot.endsWith("/") ? repoRoot.slice(0, -1) : repoRoot;

  if (!trimmed.startsWith("/")) {
    if (hasDotDotSegment(trimmed)) {
      return { ok: false, reason: `relative path "${trimmed}" contains a ".." segment` };
    }
    return { ok: true, key: trimmed };
  }

  const prefix = `${normalizedRoot}/`;
  if (!trimmed.startsWith(prefix)) {
    return {
      ok: false,
      reason: `absolute path "${trimmed}" is not under the expected repo root "${normalizedRoot}" — cannot safely relativize`,
    };
  }

  const key = trimmed.slice(prefix.length);
  if (key.length === 0) {
    return { ok: false, reason: `absolute path "${trimmed}" resolves to an empty key after stripping the repo root` };
  }
  if (hasDotDotSegment(key)) {
    return { ok: false, reason: `path "${trimmed}" contains a ".." segment after stripping the repo root` };
  }
  return { ok: true, key };
}
