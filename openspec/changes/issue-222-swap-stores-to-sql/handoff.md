# Slice Handoff — issue #222: swap the seven existing stores from ledger files to SQL

Bidirectional document. developer's Build Report is below; qa appends its Verdict beneath, in a new
section — nothing here is overwritten.

## Build Report (Round 1)

### What changed

This is the "wide, mechanical" first half of #202 (split at triage from the "genuinely new IdeaStore"
half, #223). It gives six of the seven named stores (Asset, Production Spec, Brand, Channel, Format,
Brand Asset) a `{ db }`-backed way to persist, and lands the shared transaction helper #223 is expected
to reuse. The seventh named store, Mention Handle, and `production-queue/store.ts` (raised by the brief
as "check whether it's in scope") are both concluded OUT of scope, with the reasoning below.

**The framing that matters most:** for six of the seven, this is genuinely additive, not a rewrite of an
existing exported function's contract. Only `AssetStore` had a real pre-existing `{ ledgerPath }`-taking
API; I gave `loadIdeaAssets`/`writeAsset` a second, `{ db }`-backed overload on the SAME exported names,
leaving the file-based branch's code path completely untouched — because `asset` rows key on `idea_id`,
and `IdeaStore` (issue #223) — the thing that would let `asset`'s real production callers actually read/
write an Idea via SQL — does not exist yet. Rewiring those four callers today would have forced either a
broken Idea-side read or an unwanted half-migrated dual-write. This is the literal reading of "no caller
above the store boundary changes shape" I chose: not one caller's shape changes, because not one
caller is touched. Full reasoning is in `proposal.md`'s "Known gaps, decided, not dropped" section — I
read it before touching any code, and it should be read before reviewing the diff.

For Brand and Channel, there was no pre-existing store module at all (`brand-profile.yaml` was read ad
hoc) — these are genuinely new, `{ db }`-only stores that establish the pattern, per the brief's own
framing that this ticket's `{ db }` shape and transaction helper are the template #223 inherits. For
Format and Brand Asset, the existing modules were always READ-ONLY file readers with no injected
persistence option to "swap" at all — I added a `{ db }`-only CRUD layer alongside them, untouched. For
Production Spec, `saveSpec`/`specPathFor` never took an option object either (`saveSpec(spec, path)`,
positional) — I added `saveProductionSpec`/`loadProductionSpec`, writing the SAME column
(`asset.spec_json`) `AssetStore`'s SQL branch writes.

### Files touched

New:
- `src/db/transaction.ts` (+`.test.ts`) — the shared `withTransaction` helper.
- `src/brand/store.ts` (+`.test.ts`) — new BrandStore.
- `src/channel/store.ts` (+`.test.ts`) — new ChannelStore, including the atomic `setPrimaryChannel`.
- `src/copy/store.ts` (+`.test.ts`) — new Copy Variant store, keyed to a Channel.
- `src/asset/db-store.test.ts` — tests for AssetStore's new `{ db }` overloads and `asset_media` rows.
- `src/production-spec/db-store.test.ts` — tests for the new `saveProductionSpec`/`loadProductionSpec`.
- `src/format/db-store.test.ts` — tests for Format's new `{ db }`-backed CRUD layer.
- `src/brand-asset/db-store.test.ts` — tests for Brand Asset's new `{ db }`-backed CRUD layer.
- `openspec/changes/issue-222-swap-stores-to-sql/` (this change).

Modified:
- `src/asset/store.ts` — `loadIdeaAssets`/`writeAsset` gain additive `{ db }` overloads;
  `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia` added. File-based branch's code path unchanged.
- `src/format/store.ts` — `createFormat`/`getFormatBySlug`/`getFormatById`/`listFormatsForBrand`/
  `updateFormat` added. YAML-reading functions unchanged.
- `src/brand-asset/store.ts` — `createBrandAsset`/`getBrandAssetByKey`/`listBrandAssetsForBrand` added
  (delegating to `src/db/media-ref.ts`'s `insertBrandAsset`). Directory-listing functions unchanged.
- `src/production-spec/store.ts` — `saveProductionSpec`/`loadProductionSpec` added. File-based functions
  unchanged.
- `.claude/rules/always/organicgrowth-rules.md` — rule 7 corrected: states which stores are now
  SQL-backed and that no production caller has been switched over yet.
- `src/db/adr.docs-test.ts` — its Rule 7 assertions updated to match the corrected wording.

Untouched (deliberately, and verified by `git status`/`git diff`):
- `src/db/schema.ts`, `src/db/migrate.ts` — `MIGRATION_1`/`MIGRATION_2` stay byte-for-byte frozen.
- `src/mention-handle/store.ts`, `src/production-queue/store.ts`.
- Every real production caller of the file-based stores; `src/asset/store.test.ts` (the existing
  file-based AssetStore suite) — zero source changes.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-222-swap-stores-to-sql
npx tsc -p tsconfig.json --noEmit
npm test                                  # 2921 / 746 suites / 0 fail (baseline: 2853 / 724 / 0 fail)
npx openspec validate issue-222-swap-stores-to-sql --strict
npx openspec validate --all --strict      # 48 passed, 0 failed (baseline: 47)
```

To run just this ticket's new suites:
```
node --import tsx --test src/db/transaction.test.ts src/brand/store.test.ts src/channel/store.test.ts \
  src/format/db-store.test.ts src/brand-asset/db-store.test.ts src/asset/db-store.test.ts \
  src/copy/store.test.ts src/production-spec/db-store.test.ts
```

### Acceptance-criteria self-assessment

- **"Asset, Production Spec, Brand, Channel, Format, Brand Asset and Mention Handle stores each keep
  their name, their operations and their return shapes, and swap `{ ledgerPath }` for `{ db }`."**
  - Asset: `src/asset/db-store.test.ts` — `loadIdeaAssets`/`writeAsset` proven against `{ db }`, same
    exported names, same null-vs-`[]` convention, same upsert-not-duplicate semantics as the file branch
    (compare `writeAsset({ db }) — upserts...` describe block against the untouched
    `src/asset/store.test.ts`'s own `writeAsset` describe block — same scenarios, `{ db }` instead of
    `{ ledgerPath }`). Return shape (`DbAssetRecord`) is DELIBERATELY narrower than
    `LedgerAssetRecord` — see "Known limits" below; this is a documented finding, not an oversight.
  - Production Spec: `src/production-spec/db-store.test.ts` — `saveProductionSpec`/`loadProductionSpec`
    round-trip verbatim against `asset.spec_json`.
  - Brand: `src/brand/store.test.ts` — full CRUD, genuinely new store (`{ db }`-only from the start).
  - Channel: `src/channel/store.test.ts` — full CRUD plus the atomic `setPrimaryChannel`.
  - Format: `src/format/db-store.test.ts` — CRUD additive to the untouched YAML reader
    (`src/format/store.test.ts` still passes, 58 tests, zero changes).
  - Brand Asset: `src/brand-asset/db-store.test.ts` — CRUD additive to the untouched directory listing
    (`src/brand-asset/store.test.ts` still passes, 45 tests total incl. the new file, zero changes to
    the old one).
  - Mention Handle: **concluded out of scope.** No `mention_handle` table exists in `ENTITY_TABLES`
    (`src/db/schema.ts`, frozen from #201), no CONTEXT.md glossary entry names it, no other table
    foreign-keys into it, and its own module doc already states "Operator-maintained, NOT a live
    lookup" — a hand-edited global YAML file matching ADR-0029's "documents a human authors... stay
    files" principle exactly, the SAME principle that keeps Format YAML and Brand Profile as files. It
    also never took a `{ ledgerPath }` option to begin with. I judged the issue's own listing here to be
    imprecise rather than a deliberate design call, and report the conclusion instead of inventing a
    table `schema.ts`'s own frozen migrations never named. **Flag for the Operator**: if Mention Handle
    genuinely IS meant to move to SQL, that needs a new migration (additive, not touching
    MIGRATION_1/2) — a small follow-up, not a blocker to this ticket's other six stores.
- **"`asset_media` and `copy_variant` are stored as rows, with Copy variants keyed to a Channel."**
  Proven by `src/asset/db-store.test.ts`'s `addAssetMedia`/`addAssetMediaBatch`/`listAssetMedia`
  describe block, and `src/copy/store.test.ts` in full — every variant keyed to a real `channel_id` FK,
  not a bare platform string.
- **"Every existing store test suite passes against a real throwaway database, with only the injected
  option changed."** Literally true only for `AssetStore` — the ONE store that had both (a) a
  pre-existing suite and (b) an actual `{ ledgerPath }` option to swap. That suite
  (`src/asset/store.test.ts`) is untouched and green; `src/asset/db-store.test.ts` is its `{ db }`
  sibling, hand-mirrored scenario-for-scenario. For Format/Brand Asset/Production Spec, the pre-existing
  suites test operations that never took an injected persistence option (plain YAML/file readers) — those
  suites are untouched and green, and the NEW `{ db }` operations get their OWN new suite, since there
  was no prior `{ db }`-shaped test to port from. For Brand/Channel/Copy Variant, there was no
  pre-existing suite at all. Every suite — old and new — runs against `withTempDb`'s real, throwaway
  SQLite file, never `:memory:`.
- **"Writes run in transactions, so a partial write cannot land. Prove a failed multi-row write leaves
  nothing behind."** `src/db/transaction.test.ts`'s "a multi-row write that fails PARTWAY THROUGH leaves
  NOTHING behind" is the generic proof (a 2-row Channel insert where the second violates the
  one-primary-per-Brand index — neither row survives). Two MORE proofs tied directly to the concrete
  Asset/Copy shapes the AC names: `src/asset/db-store.test.ts`'s "addAssetMediaBatch: a failure partway
  through a multi-row batch leaves NOTHING behind" (3-item batch, 3rd item's duplicate ordinal rolls back
  all 3), and `src/copy/store.test.ts`'s "a failure partway through a multi-channel batch leaves NOTHING
  behind" (2-item batch, 2nd item's unknown channel rolls back both).
- **"No caller above the store boundary changes shape."** Verified two ways: (1) `git status`/`git diff`
  show zero changes to any of the 4 real production modules that import `writeAsset`
  (`track-performance.ts`, `export-schedule.ts`, `schedule-via-zoho-mcp.ts`,
  `upload-camera-hub-scripts.ts`), and zero changes to `src/asset/store.test.ts`. (2) The full suite
  (2921 tests) is green, which would fail loudly (a `tsc --noEmit` error, first thing `npm test` runs)
  if any caller's compile-time shape had actually changed.

### Fakes / fixtures used

- `src/db/test-support.ts`'s `withTempDb` — a real, throwaway SQLite file per test, mkdtemp'd and
  removed in a `finally`, exactly as #201 established. No `:memory:` anywhere in this slice.
- No fixture data files added; every test seeds its own minimal Brand/Channel/Format/Run/Idea/Asset
  chain directly via `createBrand`/`createChannel`/`createFormat` (this ticket's own new stores) plus a
  raw `idea`/`run` INSERT (since `IdeaStore` doesn't exist yet — issue #223), mirroring
  `schema.test.ts`'s own established fixture-seeding convention.
- **The Magnific fake is not used and not needed.** This slice never touches Space-facing code
  (`src/space-driver/`, `src/producer/`) — confirmed by `git status`: no file under either directory is
  touched. No live `spaces_*`/`creations_*` MCP call is possible from anything this ticket added.

### Self-review notes

- Removed an accidental empty `it()` block (a placeholder comment with no assertion) from a first draft
  of `src/db/adr.docs-test.ts`'s Rule 7 update — folded into two real, distinctly-named assertions
  instead.
- Fixed 4 `openspec validate --strict` failures caused by a mid-sentence markdown line-wrap that pushed
  a Requirement's `SHALL` past the validator's first-line check — reworded the 4 opening sentences so
  the function list and `SHALL` sit on the same source line.
- Considered, and rejected, replacing `src/asset/store.ts`'s existing `{ ledgerPath }` branch in place
  (a literal reading of "swap") — that would have forced editing 4 live production command modules whose
  Idea-side migration is out of scope, and risked subtle behavior drift in code this ticket has no way to
  test against a live Space. The additive-overload bridge achieves the same `{ db }` capability with zero
  blast radius; documented as a deliberate call in `proposal.md`, not a silent narrowing.
- Reused `src/db/media-ref.ts`'s `insertAssetMedia`/`insertBrandAsset` rather than re-implementing the
  `assertRootRelativeStorageKey` guard a second time in `src/asset/store.ts`/`src/brand-asset/store.ts` —
  that module's own doc comment named this ticket as the one that would build the "future typed
  BrandAssetStore/AssetMediaStore"; reusing it keeps the guard in exactly one place.
- Reused `src/asset/asset.ts`'s existing `parseZohoScheduleReference` for the SQL branch's read path,
  rather than writing a second parser for the identical "string or array of strings, verbatim" rule.

### Known limits

- **`DbAssetRecord` is narrower than `LedgerAssetRecord`.** No column exists for `cast`/`character` (the
  *Character Explainer with Cast* Recipe's own gate-local fields — that Recipe's survival is an
  explicitly OPEN epic question), `has_video_slide` (the News Carousel Recipe's own extension flag), or
  `metrics`/`tracked_at`/`history`/`post_url`/`posted_at`/`performance_score` (ADR-0028 moves these onto
  new `post`/`metric_snapshot`/`performance_score` tables, keyed by Channel — not built by this ticket;
  ADR-0028's own Consequences section says this work is "expected to land alongside issue #202's store
  swap" without saying which half, and no Post/Performance store is named in #222's own AC, so I treated
  it as out of scope here). This is documented in `src/asset/store.ts`'s own module doc comment and in
  the `asset-store` spec delta's "SQL-backed Asset shape" Requirement — a real gap for whoever builds
  Post/Performance persistence next, not a silent one.
- **Mention Handle stays file-based** (see acceptance-criteria section above) — a flagged finding, not a
  quiet drop.
- **`production-queue/store.ts` is untouched** — real job claiming (an atomic, owner-and-expiry
  `UPDATE ... RETURNING`) is explicitly issue #203's job per the epic's own Implementation Decisions,
  and is a materially different concurrency-safety problem from this ticket's mechanical substitution.
- **No existing production caller has been switched onto any `{ db }` branch.** That is deliberate (see
  "What changed" above), and is itself the biggest open item for whichever ticket follows #223: once
  `IdeaStore` exists, the 4 real `writeAsset` callers (plus `ledger.ts`, `report.ts`, `pick-cast.ts`, and
  others) still need to be individually rewired — that work is NOT done here.
- **`setPrimaryChannel`'s two-row demote/promote is transaction-safe against a crash, but not against a
  concurrent second writer** (no row-level locking) — matches the epic's own scoping: real concurrent-
  claim safety is issue #203's job, not this ticket's.
