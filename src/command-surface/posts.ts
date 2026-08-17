/**
 * `logPost` — the typed command surface's Post-logging operation (issue #205 AC1, epic #195's "logging
 * a Post" — a thin orchestration shell over `src/post/store.ts`).
 *
 * Attribution stays explicit (always-rule 5): `logPost` only ever writes what the Operator gives it — an
 * `(assetId, channelId, postUrl, postedAt)` — never infers which Asset a URL belongs to.
 */

import type { DatabaseSync } from "node:sqlite";

import { recordPost, type PostInput } from "../post/store.ts";

export type { PostInput };

/**
 * Records (or, for the SAME `(assetId, channelId)`, updates in place — a corrected URL) one Post.
 * Returns its id. Throws (SQLite FOREIGN KEY error) for an unknown `assetId`/`channelId`.
 */
export function logPost(
  db: DatabaseSync,
  input: PostInput,
  now: () => string = () => new Date().toISOString(),
): string {
  return recordPost(db, input, now);
}
