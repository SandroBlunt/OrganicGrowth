## 1. The Asset pure deep module (test-first)

- [x] 1.1 Write failing tests (`asset/asset.test.ts`): `AssetStatus`/stage ordering
  (`isAssetStatus`, `earlierAssetStatus`); defensive parsing (`parseCastCandidate`, `parseCastArray`,
  `parseAssetRecord`, `parseAssetsArray` — never throw on garbled input); pure lookup/update
  (`findAsset`, `upsertAsset` — insert-or-update keyed by recipe, pure, preserves siblings); the
  Idea-level roll-up (`rollupAssetStatus`, `deriveIdeaRollup` — earliest stage wins, `accepted` with
  no Assets stays `accepted`, `suggested`/`rejected` pass through); the gate-folding helpers
  (`ideaAtGate`, `ideaHasAssetStatus`, `pendingGateNames`).
- [x] 1.2 Implement `src/asset/asset.ts`: `AssetStatus`, `LedgerCastCandidate`, `LedgerAssetRecord`,
  and every function from 1.1.

## 2. Legacy → Asset-grain normalizer (test-first)

- [x] 2.1 Write failing tests (`asset/migrate.test.ts`): `DEFAULT_ASSET_RECIPE` names a REAL wired
  Recipe slug (cross-checked against `listWiredRecipeSlugs()`); `isLegacyProductionStatus` recognizes
  exactly the five retired statuses; `normalizeIdeaStatus` — canonical records pass through with
  `assets: []` added; each of the five legacy statuses (`casting`/`produced`/`posted`/`tracking`/
  `scored`) folds onto one Asset at the matching stage, carrying every populated scalar field
  (`cast`, `character`, `asset_url`, `produced_at`, `post_url`, `posted_at`, `performance_score`);
  `recipes[0]` is used over the default when the Idea recorded a Recipe selection (issue #54); a
  missing/garbled status degrades to `suggested`, no assets (never crashes); idempotent — normalizing
  its OWN output changes nothing.
- [x] 2.2 Implement `src/asset/migrate.ts`: `DEFAULT_ASSET_RECIPE`, `isLegacyProductionStatus`,
  `normalizeIdeaStatus`.

## 3. AssetStore — the typed store boundary (test-first, ADR-0014)

- [x] 3.1 Write failing tests (`asset/store.test.ts`): `loadIdeaAssets` — returns the canonical
  assets for a migrated Idea, transparently normalizes an un-migrated legacy Idea, `null` for an
  unknown Idea, `[]` for a known Idea with none yet; `writeAsset` — inserts a new Recipe's Asset,
  updates an existing one in place (merge) while preserving sibling Assets and unrelated Idea/ledger
  fields, no-ops for an unknown Idea, normalizes a not-yet-migrated Idea onto the grain BEFORE
  upserting (never silently drops legacy production data).
- [x] 3.2 Implement `src/asset/store.ts`: `loadIdeaAssets`, `writeAsset` — own file I/O via
  `fs/safe-io.ts` (mirrors `ledger.ts`'s Cast/Asset write-shell pattern; no stray I/O elsewhere).

## 4. One-time idempotent migration (test-first)

- [x] 4.1 Write failing tests (`ledger/migrate-assets.test.ts`): `migrateIdeaRecord` — a canonical
  record only gains `assets: []`; an accepted record's inert `post_url`/`posted_at`/
  `performance_score` nulls are left UNTOUCHED (only a genuinely folded legacy status strips them);
  an already-migrated record reports `changed: false`; each legacy status folds AND strips its
  redundant top-level scalar keys; a garbled non-object entry passes through untouched, never
  fabricated; running it TWICE on the same record converges to `changed: false`.
  `migrateLedgerObject` — migrates every Idea, counts changes, returns the SAME object reference when
  nothing changed. `migrateLedgerFile` — the on-disk shell: writes only when something changed,
  reports `changed`/`ideasChanged`, a second run is byte-identical.
- [x] 4.2 Write failing tests: round-trip against COPIES of the two REAL Brand ledgers
  (`data/brands/mundotip/ledger.json`, `data/brands/straw-motion/ledger.json`) — every Idea gains
  `assets: []`, id/status/title set preserved 1:1 (no live Idea has a legacy production status to
  remap), and a second run against the migrated copy is byte-identical.
- [x] 4.3 Implement `src/ledger/migrate-assets.ts`: `migrateIdeaRecord`, `migrateLedgerObject`,
  `migrateLedgerFile`, `migrateAllBrandLedgers`, the `<brand>|--all` CLI entry.
- [x] 4.4 Run the migration against BOTH real Brand ledgers (`npx tsx src/ledger/migrate-assets.ts
  --all`); run it a SECOND time and confirm both report "already up to date (no-op)" with no further
  `git diff`.

## 5. Re-grain the ledger reader/writer (test-first)

- [x] 5.1 Write failing tests (`ledger/ledger.test.ts`): `loadIdeas` — a canonical Idea passes
  through with `assets: []`; a legacy un-migrated `casting`/`produced` Idea is transparently
  normalized (reader tolerance); a record with no status at all degrades to `suggested`, never
  dropped; an already-migrated Idea's `assets` reads through unchanged; read-only (never mutates the
  file). `loadReport` — `status` is the derived roll-up for an `accepted` Idea with Assets in flight,
  stays `accepted` with none yet, and a legacy status still rolls up correctly. Confirm
  `applyIdeaRecipeSelection`/`writeIdeaRecipeSelection` (issue #54) are unaffected.
- [x] 5.2 Implement: narrow `IdeaStatus` to `suggested`/`accepted`/`rejected`; `LedgerIdea` gains
  `assets?`; `loadIdeas`/`loadReport` call `normalizeIdeaStatus` on every raw record; `loadReport`'s
  `status` uses `deriveIdeaRollup`. Remove the 9 dead ADR-0004 exports (`ledgerStatusForTransition`,
  `applyIdeaStatus`, `writeIdeaStatus`, `applyIdeaCast`, `writeIdeaCast`, `applyIdeaAsset`,
  `writeIdeaAsset`, `LedgerIdeaWithCast`, `LedgerIdeaWithAsset`, `loadIdeaCast`) — confirmed dead (only
  their own tests + `worker.ts`'s decoupled TYPE-only import called them). Re-export
  `LedgerCastCandidate`/keep `LedgerAsset` (legacy scalar) so `production-queue/worker.ts` keeps
  compiling untouched.

## 6. Fold Assets in phase-resolver (test-first)

- [x] 6.1 Rewrite `phase-resolver/resolve.test.ts`'s fixtures to the new grain (`status: "accepted",
  assets: [...]` instead of a flat `casting`/`produced`/`posted`/`tracking`/`scored` status),
  preserving every existing scenario's assertions; add a new scenario for one Idea with TWO Assets at
  different stages (both gates surface; the earlier phase wins).
- [x] 6.2 Implement: `resolvePhase` switches on `suggested`/`accepted`/`rejected` only; for
  `accepted`, an Idea with no Assets keeps the pre-slice stranded-via-queue-liveness check; an Idea
  WITH Assets folds every one of them (`foldAssetIntoPhase`) into the phase/gate computation.

## 7. Re-grain /report, /pick-cast, /run-pipeline

- [x] 7.1 `commands/report.ts`: `PRODUCTION_STATES` becomes `["casting", "in_production",
  "produced"]`; add tests proving a migrated ledger's rolled-up `in_production`/`produced` status
  renders correctly through `reportCommand`. Confirm every pre-existing `report.test.ts` assertion
  passes UNCHANGED (the un-migrated fixtures there are the reader-tolerance case).
- [x] 7.2 `commands/pick-cast.ts`: gate check becomes `ideaAtGate(idea, "cast")`; Cast candidates come
  from the gated (or last-`cast`-carrying) Asset; the refusal message names the derived roll-up.
  Add tests for a canonical (already-migrated) ledger shape. Confirm every pre-existing
  `pick-cast.test.ts` assertion passes UNCHANGED (proves the single-recipe path stays green).
- [x] 7.3 `commands/run-pipeline.ts`: "waiting to be queued" becomes `accepted` with no Assets yet
  (mutually exclusive with "at the Cast gate," which the flat-status model got for free); "at the
  Cast gate" becomes `ideaAtGate`; "produced" becomes `ideaHasAssetStatus(idea, "produced")`. Confirm
  `run-pipeline.test.ts` passes UNCHANGED.

## 8. OpenSpec

- [x] 8.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `asset-store`; MODIFIED
  `phase-resolver`, `report-surface`, `cast-render`.
- [x] 8.2 `npx openspec validate issue-55-per-asset-ledger --strict` green.

## 9. Self-review

- [x] 9.1 `npm test` green (type-check + full suite); confirm the pre-slice 795 tests are all still
  present and passing, plus every new test this slice adds.
- [x] 9.2 Simplify / dead-code pass; confirm every issue #55 acceptance criterion maps to a named
  test; confirm `production-queue/**`/`space-driver/**`/`production-spec/**`/`recipe/**`/`format/**`
  are byte-for-byte untouched (`git diff --stat`).
- [x] 9.3 Write the Build Report into `handoff.md`, explicitly flagging that this slice makes zero
  live Magnific Space calls, and listing Non-Goals/Known Limits transparently.
