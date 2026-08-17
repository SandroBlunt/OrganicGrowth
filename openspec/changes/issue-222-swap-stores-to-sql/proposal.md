## Why

Issue #202 ("every store swaps files for SQL, and the Idea finally gets one") covers two jobs of very
different shape and was split at triage: a genuinely new `IdeaStore`, and a mechanical substitution
across every store that already exists. This ticket is the second half — the wide, mechanical one — and
goes FIRST, so it establishes the `{ db }` option shape and the transaction helper `IdeaStore` (issue
#223) then reuses, instead of inventing a pattern that has to be retrofitted to seven callers afterward.

Every store today takes an explicit option (mostly `{ ledgerPath }`, sometimes a bare path string, and
in three cases — Format, Brand Asset, Mention Handle — no injected persistence option at all, because
they were always read-only file readers) and owns its own I/O. This ticket adds the SAME-named,
SAME-shaped `{ db }` capability alongside the file-based one wherever it applies, so a caller that wants
SQL persistence for the Asset, Production Spec, Brand, Channel, Format, or Brand Asset entities can get
it, without breaking a single existing caller.

## What Changes

- **A shared transaction helper** (`src/db/transaction.ts`'s `withTransaction`) — the ONE place a
  multi-row write is wrapped in `BEGIN`/`COMMIT`/`ROLLBACK`, factored out of `migrate.ts`'s own inline
  pattern so every store (and `IdeaStore` after it) gets the same atomicity guarantee from one tested
  seam. Proven with a test where a two-row write fails on the second row and leaves NOTHING behind —
  not merely that a transaction was opened.
- **`AssetStore` (`src/asset/store.ts`) gains a `{ db }`-backed branch**, additive to its existing
  `{ ledgerPath }`/`ledgerPath`-string branch via TypeScript overloads on the SAME exported function
  names (`loadIdeaAssets`, `writeAsset`) — no existing caller (four real production modules, plus every
  producer end-to-end test) changes at all. The SQL-backed return shape (`DbAssetRecord`) is narrower
  than the file-based `LedgerAssetRecord` by design, not oversight — see "Known gaps, decided, not
  dropped" below.
- **`asset_media` and `copy_variant` become real, insertable/queryable rows.** `addAssetMedia`/
  `addAssetMediaBatch`/`listAssetMedia` (in `src/asset/store.ts`, reusing `src/db/media-ref.ts`'s
  `insertAssetMedia`) replace the file branch's `asset_paths`/`asset_url` fields. A brand-new
  `src/copy/store.ts` (`upsertCopyVariant`/`upsertCopyVariants`/`listCopyVariants`/
  `getCopyVariantForChannel`) replaces the file branch's nested `Copy.variants[]`, keyed to a real
  `channel_id` instead of a bare platform string. Both batch-write entry points are proven atomic:
  a failing item partway through a multi-row batch leaves the WHOLE batch unwritten.
- **`src/production-spec/store.ts` gains `saveProductionSpec`/`loadProductionSpec`** — the Production
  Spec has no table of its own; it lives inline on `asset.spec_json` (the same column `AssetStore`'s
  `{ db }` branch writes), so these are a narrower, assetId-keyed sibling for a caller that already has
  an Asset row in hand.
- **Two genuinely NEW stores**, `{ db }`-only from the start (there was no pre-existing `{ ledgerPath }`
  option to port — Brand Profile YAML and a Brand's Channel list were always read ad hoc):
  `src/brand/store.ts` (`createBrand`/`getBrandBySlug`/`getBrandById`/`listBrands`/`updateBrand`) and
  `src/channel/store.ts` (`createChannel`/`getChannel`/`getChannelByPlatform`/`listChannelsForBrand`/
  `getPrimaryChannel`/`setPrimaryChannel` — the last one atomic: demoting the old primary and promoting
  the new one is a two-row write that can never land half-done).
- **`src/format/store.ts` gains a `{ db }`-backed CRUD layer**, additive to its existing YAML-file
  reader (`loadFormat`/`listFormatSlugs`/`parseFormatFile`, untouched): `createFormat`/`getFormatBySlug`/
  `getFormatById`/`listFormatsForBrand`/`updateFormat`. Format's YAML file stays the Operator-authored
  document (ADR-0029: "documents a human authors or reads directly stay files"), but `format` is also a
  real, REFERENCED SQL table — `run`, `idea`, and `baseline_prompt` all foreign-key into it — so a
  `format` row is required plumbing for the rest of the schema to be usable at all, not an optional
  convenience.
- **`src/brand-asset/store.ts` gains a `{ db }`-backed CRUD layer**, additive to its existing directory
  listing (`listBrandAssets`/`getBrandAsset`, untouched): `createBrandAsset`/`getBrandAssetByKey`/
  `listBrandAssetsForBrand`. `createBrandAsset` delegates to `src/db/media-ref.ts`'s `insertBrandAsset`
  — becoming the typed `BrandAssetStore` that module's own doc comment named this ticket as the one to
  build, rather than re-implementing the storage-key guard a second time.
- **Rule 7 (`.claude/rules/always/organicgrowth-rules.md`) and its docs-conformance check are updated**
  to state accurately which stores are now SQL-backed and that no existing production caller has been
  switched over yet — `ledger.json` stays the source of truth the live pipeline actually reads and
  writes, until Idea moves to SQL too (issue #223 and later).

## Known gaps, decided, not dropped

- **`ledger.json`-reading production callers are NOT rewired in this ticket.** `AssetStore`'s file-based
  branch stays the one 14 real production modules (`track-performance.ts`, `export-schedule.ts`,
  `schedule-via-zoho-mcp.ts`, `upload-camera-hub-scripts.ts`, `report.ts`, `pick-cast.ts`, `ledger.ts`,
  and others) actually call. `asset` rows key on `idea_id`, and `IdeaStore` (issue #223) — the thing
  that would let these callers read/write an Idea's SQL row at all — does not exist yet. Forcing these
  callers onto `{ db }` today would either break their still-file-based Idea reads or force a
  half-migrated dual-write nobody asked for. This is the literal, load-bearing reading of "no caller
  above the store boundary changes shape": not one caller's shape changes, because not one caller is
  touched.
- **`cast`/`character`/`has_video_slide`/`metrics`/`tracked_at`/`history`/`post_url`/`posted_at`/
  `performance_score` have no column on `asset`** (`src/db/schema.ts`, frozen from issue #201). The
  performance/post fields move OFF the Asset entirely under ADR-0028, onto `post`/`metric_snapshot`/
  `performance_score` (keyed by Channel) — building that is explicitly deferred work (ADR-0028's own
  Consequences section: "expected to land alongside issue #202's store swap", not committed to THIS
  half of it), and no "Post store"/"Performance store" is named in issue #222's own acceptance criteria.
  `cast`/`character` (the *Character Explainer with Cast* Recipe's own gate-local fields) and
  `has_video_slide` (the News Carousel Recipe's own extension flag) were never named by CONTEXT.md or
  the epic's own schema section either, and the epic's own Further Notes flags the Character Explainer
  Recipe's survival as an explicitly OPEN question. `DbAssetRecord` is honest about this: it is a
  narrower shape than `LedgerAssetRecord`, not a silent truncation — every dropped field is documented
  in `src/asset/store.ts`'s own module doc comment.
- **Mention Handle is NOT migrated to SQL.** There is no `mention_handle` table in the schema
  (`ENTITY_TABLES`), it is absent from CONTEXT.md's glossary and from the epic's own schema section, and
  nothing else foreign-keys into it — unlike Format, there is no structural need for it to exist
  relationally. Its own module doc already states it is "Operator-maintained, NOT a live lookup" — a
  hand-edited global YAML file, matching ADR-0029's "documents a human authors... stay files" principle
  precisely. Issue #222's own AC lists it among the seven stores to swap; this ticket concludes that
  listing was imprecise (the module doesn't even take a `{ ledgerPath }` option today) and reports the
  conclusion here rather than inventing an unneeded table.
- **`production-queue/store.ts` is NOT touched.** Real job claiming (an atomic, owner-and-expiry
  `UPDATE ... RETURNING`) is explicitly issue #203's job per the epic's own Implementation Decisions
  ("Claiming a job uses ... an equivalent atomic claim-with-owner-and-expiry UPDATE ... RETURNING ...
  The lock field inside queue.json is deleted, not ported") — a materially different, concurrency-safety
  problem from the mechanical substitution this ticket performs.

## Capabilities

### Added Capabilities

- `brand-store`: `src/brand/store.ts`'s SQL-backed `brand` table CRUD — genuinely new.
- `channel-store`: `src/channel/store.ts`'s SQL-backed `channel` table CRUD, including the atomic
  `setPrimaryChannel` — genuinely new.
- `copy-variant-store`: `src/copy/store.ts`'s SQL-backed `copy_variant` table CRUD, keyed to a Channel —
  genuinely new.

### Modified Capabilities

- `sqlite-foundation`: gains the shared `withTransaction` helper as a Requirement of its own.
- `asset-store`: `AssetStore`'s typed read/write boundary Requirement gains the `{ db }`-backed branch;
  new Requirements cover `asset_media` as rows and the narrower SQL-backed return shape.
- `production-spec`: the "compose and persist" Requirement gains the SQL-backed
  `saveProductionSpec`/`loadProductionSpec` sibling.
- `format-store`: gains a new Requirement for the `{ db }`-backed CRUD layer, additive to the existing
  YAML-file Requirements (unchanged).
- `brand-asset-store`: gains a new Requirement for the `{ db }`-backed CRUD layer, additive to the
  existing directory-listing Requirements (unchanged).

## Impact

- **New code:** `src/db/transaction.ts` (+`.test.ts`), `src/brand/store.ts` (+`.test.ts`),
  `src/channel/store.ts` (+`.test.ts`), `src/copy/store.ts` (+`.test.ts`),
  `src/format/db-store.test.ts`, `src/brand-asset/db-store.test.ts`,
  `src/asset/db-store.test.ts`, `src/production-spec/db-store.test.ts`.
- **Modified code:** `src/asset/store.ts`, `src/format/store.ts`, `src/brand-asset/store.ts`,
  `src/production-spec/store.ts`, `.claude/rules/always/organicgrowth-rules.md`,
  `src/db/adr.docs-test.ts`.
- **Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (MIGRATION_1/MIGRATION_2 stay
  byte-for-byte frozen, per this ticket's own brief), `src/mention-handle/store.ts`,
  `src/production-queue/store.ts`, every real production caller of the file-based stores.
- **Hermetic, no live Space or Zoho MCP calls.** Every new/changed test opens a REAL, empty, throwaway
  SQLite file per test (`src/db/test-support.ts`'s `withTempDb`, never `:memory:`), mirroring #201's own
  Testing Decisions. No `magnific`/Zoho MCP tool is imported or called by any file this slice touches —
  this ticket never reaches the Magnific fake either, since it never touches Space-facing code.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics code —
  generate-never-publish/public-metrics-only/relative-not-absolute/explicit-attribution are untouched by
  construction. Ledger-as-source-of-truth is explicitly PRESERVED, not violated: `ledger.json` stays the
  one thing every real production command actually reads/writes; the new `{ db }` branches are additive
  and unused by any of them until issue #223 and later.
