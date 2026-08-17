## 1. Scope audit — what "swap { ledgerPath } for { db }" actually means per store (before writing code)

- [x] 1.1 Grep every production (non-test) file for `ledgerPath` and for `from ".../asset/store.ts"` to
  find the REAL blast radius of changing `AssetStore`'s exported function signatures — 4 production
  callers (`track-performance.ts`, `export-schedule.ts`, `schedule-via-zoho-mcp.ts`,
  `upload-camera-hub-scripts.ts`), all of which ALSO depend on the still-file-based `ledger.json` for
  Idea-level data.
- [x] 1.2 Read ADR-0028's Consequences section and the epic's own schema/store-layer sections to
  determine what the frozen `asset` table (issue #201) does and does not carry, and conclude that
  `cast`/`character`/`has_video_slide`/`metrics`/`tracked_at`/`history`/`post_url`/`posted_at`/
  `performance_score` are genuinely out of THIS ticket's scope (no column, no AC, no named store).
  Documented in `proposal.md`'s "Known gaps" section rather than silently narrowed.
- [x] 1.3 Confirm `Mention Handle` has no `mention_handle` table in `ENTITY_TABLES`, no CONTEXT.md
  glossary entry, and no other table foreign-keying into it — conclude it stays file-based, matching
  ADR-0029's "documents a human authors... stay files" principle, and report the conclusion rather than
  inventing a table `schema.ts`'s own MIGRATIONS array never named.
- [x] 1.4 Confirm `production-queue/store.ts` is explicitly issue #203's job (real job claiming via an
  atomic, owner-and-expiry `UPDATE ... RETURNING`) per the epic's own Implementation Decisions — not
  touched by this ticket.

## 2. The shared transaction helper (test-first)

- [x] 2.1 Write failing tests (`src/db/transaction.test.ts`): commits every write on success; returns
  the callback's value; a multi-row write that fails on its SECOND row leaves NOTHING behind (not even
  the first, individually-valid row); rolls back a raw `db.exec` failure, not just a prepared-statement
  one; re-throws the ORIGINAL error unchanged; nesting throws loudly (SQLite's own `BEGIN`-inside-a-
  transaction rejection) rather than silently starting a second transaction.
- [x] 2.2 Implement `src/db/transaction.ts` (`withTransaction`) — factored out of `migrate.ts`'s own
  inline `BEGIN`/`COMMIT`/`ROLLBACK` pattern, reusable by every store this ticket touches and by
  `IdeaStore` (issue #223) after it.

## 3. Two genuinely new stores: Brand and Channel (test-first, { db }-only)

- [x] 3.1 Write failing tests (`src/brand/store.test.ts`): `createBrand` with defaults and with every
  optional field; a duplicate slug rejected; `getBrandBySlug`/`getBrandById` null-for-unknown;
  `listBrands` sorted by slug, `[]` for empty; `updateBrand` merges a patch, bumps `updated_at` only,
  throws a clear error for an unknown id.
- [x] 3.2 Implement `src/brand/store.ts`.
- [x] 3.3 Write failing tests (`src/channel/store.test.ts`): `createChannel` with defaults; an
  out-of-`KNOWN_PLATFORMS` platform rejected (CHECK); an unknown `brandId` rejected (FOREIGN KEY); a
  second primary Channel on the same Brand rejected (the schema's own partial unique index);
  `getChannel`/`getChannelByPlatform` scoped correctly per Brand; `listChannelsForBrand` sorted, scoped;
  `getPrimaryChannel` null when none set; `setPrimaryChannel` atomically demotes the old primary and
  promotes the new one, and throws (changing nothing) for an unknown channel id.
- [x] 3.4 Implement `src/channel/store.ts` — `setPrimaryChannel` wrapped in `withTransaction`.

## 4. AssetStore's SQL-backed branch, additive via overloads (test-first)

- [x] 4.1 Write failing tests (`src/asset/db-store.test.ts`): `loadIdeaAssets(ideaId, { db })` null for
  an unknown Idea, `[]` for a known Idea with none; `writeAsset(..., { db })` creates, updates in place
  (never duplicates the `(idea_id, recipe_slug)` row), leaves a sibling Asset's fields untouched, leaves
  the database untouched for an unknown Idea (mirrors the file branch), round-trips `spec` (JSON) and
  `zoho_schedule_reference` (verbatim, string or array) via the existing `parseZohoScheduleReference`,
  rejects an unwired `recipe_slug` (the same FK `idea_recipe` already trusts).
- [x] 4.2 Implement the `{ db }` overloads on `loadIdeaAssets`/`writeAsset` in `src/asset/store.ts` —
  same exported names, additive TypeScript overloads distinguishing the branch by the second/fourth
  argument's shape (`string`/`{ ledgerPath }` vs `{ db }`); zero changes to the existing file-based
  branch's code path. `DbAssetRecord`/`DbAssetPatch` are the narrower SQL-backed shape (see proposal's
  "Known gaps").
- [x] 4.3 Write failing tests (same file) for `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia`: adds
  and lists in ordinal order; rejects an absolute storage key before writing any row; a batch with a
  duplicate `ordinal` partway through leaves NOTHING behind (the transaction-atomicity proof, AC); a
  fully-valid batch commits every row.
- [x] 4.4 Implement `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia`, reusing
  `src/db/media-ref.ts`'s `insertAssetMedia` rather than re-implementing the storage-key guard.
- [x] 4.5 Confirm the EXISTING `src/asset/store.test.ts` (file-based) suite passes byte-for-byte
  unchanged — no caller above the store boundary changes shape.

## 5. Copy Variant store — new, keyed to a Channel (test-first)

- [x] 5.1 Write failing tests (`src/copy/store.test.ts`): `upsertCopyVariant` creates then updates the
  SAME `(asset_id, channel_id)` row rather than duplicating; carries `unresolvedMentions` into
  `mentions_json` when present; rejects an unknown `channelId` (FOREIGN KEY); `listCopyVariants`/
  `getCopyVariantForChannel` read correctly; `upsertCopyVariants` (batch) commits every variant when
  valid, and a failure partway through (an unknown channel in the batch) leaves NOTHING behind — the
  SECOND transaction-atomicity proof, tied directly to Copy composing one variant per targeted Channel.
- [x] 5.2 Implement `src/copy/store.ts`.

## 6. Production Spec's SQL-backed sibling (test-first)

- [x] 6.1 Write failing tests (`src/production-spec/db-store.test.ts`): `loadProductionSpec` null before
  any save; `saveProductionSpec`/`loadProductionSpec` round-trip verbatim; a second save overwrites the
  first; `saveProductionSpec` throws a clear error for an unknown Asset id; `loadProductionSpec` returns
  `null` (not a throw) for an unknown Asset id.
- [x] 6.2 Implement `saveProductionSpec`/`loadProductionSpec` in `src/production-spec/store.ts`, writing/
  reading the SAME `asset.spec_json` column `AssetStore`'s `{ db }` branch also writes. The existing
  `specPathFor`/`saveSpec`/`briefShortName` file-based functions are untouched.

## 7. Format and Brand Asset gain a { db }-backed CRUD layer, additive (test-first)

- [x] 7.1 Write failing tests (`src/format/db-store.test.ts`): `createFormat` with defaults and with
  every optional field; a duplicate `(brandId, slug)` rejected; an unknown `brandId` rejected;
  `getFormatBySlug`/`getFormatById`/`listFormatsForBrand` scoped and sorted correctly; `updateFormat`
  merges a patch, throws a clear error for an unknown id.
- [x] 7.2 Implement the additions to `src/format/store.ts` — the existing `loadFormat`/`listFormatSlugs`/
  `parseFormatFile` YAML-reading functions and their own test suite (`store.test.ts`) stay untouched.
- [x] 7.3 Write failing tests (`src/brand-asset/db-store.test.ts`): `createBrandAsset` with a
  root-relative key; an absolute storage key rejected BEFORE any row is written; a duplicate
  `(brandId, key)` rejected; `listBrandAssetsForBrand` scoped and sorted; `getBrandAssetByKey` null for
  unknown.
- [x] 7.4 Implement the additions to `src/brand-asset/store.ts`, delegating to `src/db/media-ref.ts`'s
  `insertBrandAsset` rather than re-implementing the storage-key guard — the existing
  `listBrandAssets`/`getBrandAsset` file-based functions and their own test suite stay untouched.

## 8. Docs accuracy: Rule 7 no longer overclaims OR underclaims the store swap

- [x] 8.1 Update `.claude/rules/always/organicgrowth-rules.md`'s rule 7: state which stores are now
  SQL-backed (Asset, Production Spec, Brand, Channel, Format, Brand Asset), that no existing production
  caller has been switched over yet, and that `ledger.json` still stays the source of truth the live
  pipeline actually reads and writes.
- [x] 8.2 Update `src/db/adr.docs-test.ts`'s Rule 7 assertions to match the corrected wording (was:
  asserting the now-FALSE "not yet the backing of any store").

## 9. OpenSpec + full-suite green + self-review + Build Report

- [x] 9.1 Author spec deltas: `specs/sqlite-foundation` (MODIFIED — the transaction-helper Requirement),
  `specs/asset-store` (MODIFIED — the `{ db }` branch, `asset_media` rows, the narrower SQL shape),
  `specs/production-spec` (MODIFIED — the SQL-backed sibling), `specs/format-store` (MODIFIED — the
  additive CRUD layer), `specs/brand-asset-store` (MODIFIED — the additive CRUD layer),
  `specs/brand-store` (ADDED — new capability), `specs/channel-store` (ADDED — new capability),
  `specs/copy-variant-store` (ADDED — new capability). Run `openspec validate --strict` until green.
- [x] 9.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, above the 2853/724/0-fail
  baseline.
- [x] 9.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #222
  acceptance criterion maps to a specific test.
- [x] 9.4 Write the Build Report into `handoff.md`.
