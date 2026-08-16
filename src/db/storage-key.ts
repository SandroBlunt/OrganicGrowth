/**
 * Storage-key validation — the enforcement half of "media is referenced by a root-relative storage
 * key" (issue #201, epic #195 stories 23/26).
 *
 * The ledgers hold 191 absolute `/Users/CaxtonTaylor/...` paths (verified at epic-triage time) — every
 * one of them welds a record to one specific laptop. Going forward, EVERY place this schema stores a
 * pointer to a media file (`brand_asset.storage_key`, `asset_media.storage_key`) stores a
 * **root-relative** key instead: joined against a Brand's own `media_root` (configuration, not a
 * column value baked into the key itself) at READ time by whatever later code resolves it. This module
 * is the one place that rule is ENFORCED, not merely documented — `src/db/media-ref.ts`'s insert
 * helpers call it before every write that carries a `storage_key`, so an absolute path is rejected AT
 * the store boundary, never merely discouraged in a comment.
 *
 * Pure: no disk, no network, no clock.
 */

/** Thrown when a value is not usable as a root-relative storage key. */
export class StorageKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`Invalid storage key ${JSON.stringify(key)}: ${reason}. A storage key must be a non-empty, root-relative path — never absolute, never a home-directory shorthand, never containing a ".." segment.`);
    this.name = "StorageKeyError";
  }
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC = /^\\\\/;

/**
 * Validates `key` is a well-formed root-relative storage key and returns it unchanged. Throws
 * `StorageKeyError` (never silently coerces/strips) for: an empty string; a POSIX absolute path
 * (leading `/`); a Windows absolute path (a drive letter, or a UNC `\\host\share` path); a
 * home-directory shorthand (leading `~`); or any path containing a `..` segment (which could resolve
 * outside the configured media root once joined).
 */
export function assertRootRelativeStorageKey(key: string): string {
  if (key.length === 0) {
    throw new StorageKeyError(key, "must not be empty");
  }
  if (key.startsWith("/")) {
    throw new StorageKeyError(key, "must not be a POSIX absolute path");
  }
  if (key.startsWith("~")) {
    throw new StorageKeyError(key, "must not be a home-directory shorthand");
  }
  if (WINDOWS_ABSOLUTE.test(key) || WINDOWS_UNC.test(key)) {
    throw new StorageKeyError(key, "must not be a Windows absolute path");
  }
  const segments = key.split(/[\\/]/);
  if (segments.some((segment) => segment === "..")) {
    throw new StorageKeyError(key, 'must not contain a ".." segment (path traversal)');
  }
  return key;
}
