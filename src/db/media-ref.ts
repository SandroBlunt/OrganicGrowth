/**
 * The store-boundary enforcement point for media references (issue #201 AC10) — the concrete site
 * where `assertRootRelativeStorageKey` (`storage-key.ts`) is actually WIRED to a real write, proving an
 * absolute path is rejected at the boundary itself, not merely in a standalone unit test.
 *
 * `brand_asset` and `asset_media` are the schema's two media-reference tables (a Brand's reusable
 * media, and one produced Asset's rendered media — CONTEXT.md "Brand Asset" / "Media Slot"). This
 * module is deliberately MINIMAL — it is not the future typed `BrandAssetStore`/`AssetMediaStore` that
 * issue #202 builds when every store's backing swaps from files to this database; it exists only to
 * demonstrate, against a REAL SQLite database, that the storage-key rule is enforced where a write
 * actually happens.
 */

import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { assertRootRelativeStorageKey } from "./storage-key.ts";

/** The fields `insertAssetMedia` requires, minus id/timestamps (assigned by this function). */
export interface AssetMediaInput {
  readonly assetId: string;
  readonly ordinal: number;
  readonly kind: "image" | "video" | "audio";
  readonly storageKey: string;
  readonly mime: string;
  readonly bytes: number;
  readonly checksum: string;
  readonly magnificCreationId?: string;
}

/** The fields `insertBrandAsset` requires, minus id/timestamps (assigned by this function). */
export interface BrandAssetInput {
  readonly brandId: string;
  readonly key: string;
  readonly storageKey: string;
  readonly mime: string;
  readonly bytes: number;
  readonly checksum: string;
}

/**
 * Validates `input.storageKey` (throws `StorageKeyError` for an absolute path — never silently
 * accepted) and, only if it passes, inserts one `asset_media` row. Returns the generated row id.
 */
export function insertAssetMedia(
  db: DatabaseSync,
  input: AssetMediaInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const storageKey = assertRootRelativeStorageKey(input.storageKey);
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO asset_media
       (id, asset_id, ordinal, kind, storage_key, mime, bytes, checksum, magnific_creation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.assetId,
    input.ordinal,
    input.kind,
    storageKey,
    input.mime,
    input.bytes,
    input.checksum,
    input.magnificCreationId ?? null,
    timestamp,
    timestamp,
  );
  return id;
}

/**
 * Validates `input.storageKey` (throws `StorageKeyError` for an absolute path — never silently
 * accepted) and, only if it passes, inserts one `brand_asset` row. Returns the generated row id.
 */
export function insertBrandAsset(
  db: DatabaseSync,
  input: BrandAssetInput,
  now: () => string = () => new Date().toISOString(),
): string {
  const storageKey = assertRootRelativeStorageKey(input.storageKey);
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO brand_asset (id, brand_id, key, storage_key, mime, bytes, checksum, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.brandId, input.key, storageKey, input.mime, input.bytes, input.checksum, timestamp, timestamp);
  return id;
}
