# Slice Handoff — issue #201: Two superseding ADRs, the closed vocabularies, and the SQLite foundation

## Build Report (developer, Round 1)

### What changed

This is the foundation slice epic #195's whole rebuild stands on. It lands four things, and
deliberately nothing more:

1. **Two ADRs** (`docs/adr/0028`, `docs/adr/0029`) recording the Operator's 2026-08-16 decisions:
   Post becomes its own record (partially superseding ADR-0011 — the per-Recipe Asset grain, its
   six-stage lifecycle, and `(Idea, Recipe)` attribution are explicitly KEPT); canonical relational
   state moves to local SQLite (superseding ADR-0014's "keep files for the MVP" choice while explicitly
   KEEPING and FULFILLING its store-boundary/relational/stable-id principles). Both ADR-0011 and
   ADR-0014 gain a forward-pointer blockquote, mirroring how ADRs 0015–0018 point back at
   0010/0013/0014 — no existing decision text was edited.
2. **Two closed vocabularies** (`src/vocabulary/hook-type.ts`'s ten `HOOK_TYPES`,
   `src/vocabulary/theme.ts`'s nine `THEMES`), calibrated against a real sample of both Brands' Briefs.
   `CONTEXT.md` defines both, term-for-term identical to the TS source, and its Recipe entry is
   corrected from a stale "two Recipes are wired" to the registry's real "three Recipes are wired"
   (News Short Script has been wired since issue #174; `CONTEXT.md`'s own count had gone stale). Its
   Post entry is updated to reflect the ADR-0028 reversal.
3. **The SQLite schema and migration runner** (`src/db/schema.ts`, `src/db/migrate.ts`,
   `src/db/connection.ts`): all 18 CONTEXT.md entities, each with `id`/`created_at`/`updated_at`/
   `schema_version`; three closed vocabularies modeled as SEEDED REFERENCE TABLES with real foreign
   keys (`hook_type_vocabulary`, `theme_vocabulary`, `recipe_vocabulary`) rather than static CHECK
   lists — seeded directly from the TypeScript source arrays and from
   `src/recipe/registry.ts`'s `listWiredRecipeSlugs()`/`getRecipe()`, so nothing is a second,
   hand-copied list; a partial unique index enforcing exactly one primary Channel per Brand
   (ADR-0019); `job` gains the columns issue #203's real claiming needs room for
   (`attempt`/`idempotency_key`/`locked_by`/`locked_until`) without implementing claiming itself;
   `account`/`user`/`connection` are deliberately NOT built.
4. **The storage-key store boundary** (`src/db/storage-key.ts`'s `assertRootRelativeStorageKey`,
   wired into real inserts by `src/db/media-ref.ts`'s `insertAssetMedia`/`insertBrandAsset`): an
   absolute path (POSIX, Windows drive-letter, Windows UNC, home-directory shorthand) or a
   `..`-traversal segment is rejected BEFORE any row is written, proven against a real database.

This slice deliberately does **not** swap any existing store's backing (issue #202), does not run the
importer (issue #204), and does not implement real job claiming (issue #203) — it only lands the
foundation those slices build on.

### Files touched

**New:**
- `src/vocabulary/hook-type.ts`, `.test.ts`
- `src/vocabulary/theme.ts`, `.test.ts`
- `src/vocabulary/context-md.docs-test.ts`
- `src/db/node-sqlite.d.ts` (ambient `node:sqlite` type declaration)
- `src/db/schema.ts`, `.test.ts`
- `src/db/connection.ts`, `.test.ts`
- `src/db/migrate.ts`, `.test.ts`
- `src/db/storage-key.ts`, `.test.ts`
- `src/db/media-ref.ts`, `.test.ts`
- `src/db/test-support.ts`, `.test.ts`
- `src/db/adr.docs-test.ts`
- `src/recipe/registry-wired-count.docs-test.ts`
- `docs/adr/0028-post-is-its-own-record.md`
- `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`
- `openspec/changes/issue-201-adrs-vocabularies-sqlite-foundation/` (this change: `proposal.md`,
  `tasks.md`, `specs/sqlite-foundation/spec.md`, `specs/domain-vocabulary/spec.md`,
  `specs/docs-conformance/spec.md`, `handoff.md`)

**Modified:**
- `CONTEXT.md` (Hook Type + Theme glossary entries added; Recipe entry corrected; Post entry updated)
- `docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` (forward-pointer blockquote only)
- `docs/adr/0014-canonical-state-in-files-behind-store-boundary.md` (forward-pointer blockquote only)
- `.claude/rules/always/organicgrowth-rules.md` (rule 7 gains an ADR-0029 citation)
- `openspec/project.md` (Tech stack section describes the new, not-yet-wired SQLite foundation)

No `package.json` change — `node:sqlite` is a Node built-in; see "Fakes / fixtures used" below for why
a scoped ambient `.d.ts` was written instead of bumping the shared `@types/node` devDependency.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-201-adrs-vocabularies-sqlite-foundation
npx tsc -p tsconfig.json --noEmit          # typecheck — clean
npm test                                   # 2454 tests / 613 suites / 0 fail (baseline: 2411 / 598)
npm run test:docs                          # 275 tests / 75 suites / 0 fail (baseline: 259 / 66)
npx openspec validate --all --strict       # 44 passed, 0 failed
```

To run just this slice's own tests:
```
node --import tsx --test src/vocabulary/*.test.ts src/vocabulary/*.docs-test.ts \
  src/db/*.test.ts src/db/*.docs-test.ts src/recipe/registry-wired-count.docs-test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | An ADR supersedes ADR-0011, records the Post-becomes-its-own-entity reversal, with the Operator decision date | `docs/adr/0028-post-is-its-own-record.md` itself; `src/db/adr.docs-test.ts` — "ADR-0028 records the Post-becomes-its-own-entity reversal (AC1)" (both `it`s: supersession + date, and the `(asset_id, channel_id)` table-shape claim) |
| 2 | An ADR supersedes ADR-0014, keeps its store-boundary principle, records local SQLite (not hosted/Postgres/multi-tenant) with reasoning | `docs/adr/0029-local-sqlite-behind-the-store-boundary.md` itself; `src/db/adr.docs-test.ts` — "ADR-0029 records the local-SQLite decision (AC2)" (all three `it`s: supersession+date, "never hosted/Postgres/multi-tenant" + `node:sqlite`, "KEPT and FULFILLED") |
| 3 | CONTEXT.md defines closed `hook_type` and `theme` vocabularies, each term with a one-line meaning | `src/vocabulary/hook-type.test.ts` + `theme.test.ts` (the vocabularies themselves are closed, 10/9 distinct non-empty values); `src/vocabulary/context-md.docs-test.ts` (CONTEXT.md states "closed" and lists every value with its EXACT meaning, derived from the same source array) |
| 4 | Doc-conformance checks assert both vocabularies and both ADRs, so they cannot drift | `src/vocabulary/context-md.docs-test.ts` (vocabularies) + `src/db/adr.docs-test.ts` (both ADRs, their forward-pointers, rule 7, CONTEXT.md's Post entry) + `src/recipe/registry-wired-count.docs-test.ts` (the related Recipe-count correction) — all run under `npm run test:docs` |
| 5 | One SQLite database under `data/`, opened in-process by Node; no service/API/container/cloud DB | `src/db/connection.test.ts` ("creates the database file and any missing parent directories"; "enables PRAGMA foreign_keys = ON"); `src/db/schema.ts`/`migrate.ts`'s doc comments and `docs/adr/0029` state the no-service constraint explicitly (asserted by `adr.docs-test.ts`) |
| 6 | Schema covers every entity: brand, channel, format, baseline_prompt, brand_asset, run, trend, idea, idea_recipe, asset, asset_media, copy_variant, job, gate_request, post, metric_snapshot, performance_score, channel_baseline | `src/db/migrate.test.ts` — "creates every entity table AND every vocabulary table" iterates `ENTITY_TABLES` (all 18, exported from `schema.ts`) against a real migrated database |
| 7 | Three Recipes treated as wired — trust the registry, not CONTEXT.md's stale count of two | `src/db/migrate.test.ts` — "seeds recipe_vocabulary... including the third wired Recipe"; `src/db/schema.test.ts` — "asset.recipe_slug trusts the registry (AC7)" (accepts all three real slugs incl. `news-short-script`, rejects an unwired one); `src/recipe/registry-wired-count.docs-test.ts` (CONTEXT.md corrected) |
| 8 | Every table carries id, created_at, updated_at, and a schema version | `src/db/migrate.test.ts` — "every entity table carries id, created_at, updated_at, and schema_version columns" (via `PRAGMA table_info`, generic over `ENTITY_TABLES`); "a freshly-written row's schema_version defaults to CURRENT_SCHEMA_VERSION" |
| 9 | A migration runner creates and upgrades the schema and records which version a database is at | `src/db/migrate.test.ts` — "a fresh database starts at schema version 0"; "running migrations brings a fresh database to CURRENT_SCHEMA_VERSION"; "is idempotent"; "a failed migration rolls back cleanly and leaves the database at its pre-migration version" |
| 10 | Media referenced by root-relative storage key with mime/bytes/checksum; media root is configuration | `src/db/schema.ts`'s `asset_media`/`brand_asset` DDL (`storage_key`, `mime`, `bytes`, `checksum` columns) and `brand.media_root`; `src/db/media-ref.test.ts` inserts and reads back all four fields on both tables |
| 11 | An absolute storage-key path is rejected at the store boundary, not merely discouraged, with a test | `src/db/storage-key.test.ts` (the pure validator: POSIX/Windows/UNC/home-shorthand/empty/`..`-traversal, all throw `StorageKeyError` naming the key); `src/db/media-ref.test.ts` — "rejects an absolute storage key BEFORE any row is written" / "rejects a home-directory-shorthand storage key" (against a REAL database, with a `COUNT(*)` check proving no partial insert) |
| 12 | Tests open a real, empty SQLite file per test, dropped afterwards — no in-memory double | `src/db/test-support.ts`'s `withTempDb` (never `:memory:`) is the ONLY way every `src/db/**` test opens a database; `src/db/test-support.test.ts` explicitly proves the file is real (not `:memory:`), the temp directory is removed after return, and removed even when the callback throws |
| 13 | Schema leaves room for account/user/connection without reshaping brand, but does not build them | `src/db/migrate.test.ts` — "does NOT create account, user, or connection... (epic #195 AC12)"; `docs/adr/0029`'s Decision section states the reasoning |

### Fakes / fixtures used

- **The Magnific fake is NOT used and NOT needed.** This slice touches no Space interaction, no
  Production Spec generation, no Execution Protocol, and no Recipe run-time driving — it is schema and
  vocabulary only. No file in this slice imports `src/space-driver/fixtures/fake-space.ts`, calls any
  `spaces_*`/`creations_*` MCP tool, or is driven by any port/fixture in `src/space-driver/`. The one
  place the word "magnific" appears anywhere in this slice's new code is the SCHEMA COLUMN NAME
  `asset_media.magnific_creation_id` (`src/db/schema.ts`, `src/db/media-ref.ts`) — an opaque string
  column that would eventually hold a real Magnific creation identifier once #202/#208 wire an actual
  Space run into it; no test in this slice ever calls a live or fake Magnific tool to populate it (every
  test passes it as an ordinary optional string, or omits it).
- **The real database fake/fixture is `src/db/test-support.ts`'s `withTempDb`** — per this epic's own
  Testing Decisions, this is deliberately a REAL, empty, throwaway SQLite file per test (mkdtemp'd,
  closed and removed in a `finally`), never an in-memory double. This is the seam this ticket itself
  introduces, not a stand-in for an external service.
- No live filesystem outside temp directories is touched by any test — confirmed via `git status
  --porcelain data/` returning empty both before and after the full suite run.

### Self-review notes

- Replaced the first draft's fixed char-count window (`doc.slice(start, start + 2000)`) in
  `context-md.docs-test.ts` with a heading-line-anchored `extractGlossaryEntry` parser after it produced
  two real failures while authoring the test: a naive `doc.indexOf("**Theme**")` matched the Hook Type
  entry's own INLINE cross-reference ("alongside **Theme** below") rather than the real Theme heading,
  grabbing the wrong term's body; separately, a fixed 2000-char window silently truncated the Theme
  list's last two values. Both are now structurally impossible (the parser finds a heading only at the
  start of a line, and reads to the next such heading rather than a magic-number cutoff).
- Applied the same `collapseWhitespace` treatment to the ADR/rule-7 docs-test after CONTEXT.md's/rule
  7's own markdown line-wrapping broke a literal multi-word substring match mid-sentence.
- Chose seeded REFERENCE TABLES with real foreign keys (`hook_type_vocabulary`, `theme_vocabulary`,
  `recipe_vocabulary`) over static `CHECK (col IN (...))` lists for the three closed vocabularies —
  gives genuine referential integrity (defense in depth alongside the future TS-level `IdeaStore`
  validation issue #202 will add), and lets a future local Library viewer (#210) query the vocabulary's
  own one-line meanings straight out of the database rather than hardcoding them into HTML.
- Added `src/db/connection.test.ts` and `src/db/test-support.test.ts` (not in the original plan) once it
  became clear those two files' own behavior — creating parent directories, enabling FK enforcement,
  and actually cleaning up a temp directory including on throw — were asserted by NO test otherwise,
  despite being exactly the kind of "new machinery" this epic's Testing Decisions call out.
- Added the `account`/`user`/`connection`-absence test and its matching spec Requirement after
  reviewing the acceptance criteria a second time and finding AC13 ("leaves room... but does not build
  them") had no test proving the "does not build them" half.
- No dead code found to remove — this is a from-scratch addition, not a refactor of existing code.

### Known limits

- **`@types/node` is not bumped.** This repo's pinned `@types/node@20.19.x` predates `node:sqlite`'s
  type declarations. Rather than bump the shared devDependency — which would touch the `node_modules`
  physically shared (via a local symlink) with sibling in-flight worktrees (#199, #207) building
  concurrently — I wrote a minimal, scoped ambient declaration (`src/db/node-sqlite.d.ts`) covering only
  the surface this codebase calls, verified correct in an isolated throwaway project first. This file
  becomes deletable the day `@types/node` is bumped past ~22.5. Flagged here for whichever slice next
  touches `package.json`'s devDependencies.
- **`node:sqlite` remains Node's own "experimental feature"** — every test run prints one cosmetic
  `ExperimentalWarning` line to stderr; it does not affect exit codes or fail anything. Not suppressed,
  since doing so would mean touching the shared `npm test`/`npm run test:docs` scripts.
- **No production code calls this database yet.** `src/db/*` is entirely new, self-contained
  infrastructure — no existing store, command, or agent instruction references it. That wiring is
  issue #202 (stores) and issue #205 (the typed command surface), not this ticket.
- **The file ledger is untouched and still canonical.** `AssetStore`, `QueueStore`, `FormatStore`, and
  every other existing store still read/write plain files exactly as before; `ledger-as-source-of-truth`
  is upheld by construction (nothing in this slice reads OR writes any Brand's real `ledger.json` or the
  real `data/queue.json`).
- **The `hook_type`/`theme` vocabularies and the `theme` set's granularity are a genuine product design
  choice made by me (the developer), not handed down by the issue** — calibrated against a real sample
  of both Brands' existing Briefs but not reviewed by the Operator. If the Operator later wants
  different categories, widening either set is a new migration plus a `CONTEXT.md` edit, not a rewrite
  (the seeded-table design was chosen partly to make that cheap).
- **Backfilling `hook_type`/`theme` onto the 61 existing Briefs** is explicitly issue #206's job, not
  this ticket's.
