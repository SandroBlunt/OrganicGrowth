## 1. The two closed vocabularies — pure (test-first)

- [x] 1.1 Write failing tests (`hook-type.test.ts`): exactly ten distinct, non-empty, snake_case values,
  each with a non-empty meaning; `isHookType` recognizes every value and rejects an outside one
  (case-sensitively).
- [x] 1.2 Implement `src/vocabulary/hook-type.ts` (`HOOK_TYPES`, `HookType`, `isHookType`).
- [x] 1.3 Write failing tests (`theme.test.ts`): the identical shape of assertions for the nine Theme
  values.
- [x] 1.4 Implement `src/vocabulary/theme.ts` (`THEMES`, `Theme`, `isTheme`), calibrated against a real
  sample of both Brands' Briefs (`data/brands/straw-motion/ideas/**`, `data/brands/mundotip/ideas/**`).

## 2. `node:sqlite` — confirm availability, ambient types

- [x] 2.1 Confirm `node:sqlite` (`DatabaseSync`/`StatementSync`) is importable and usable, with only a
  cosmetic experimental-feature warning, on the Node version `package.json`'s `engines.node` already
  requires (`>=22`) — verified against `v22.23.0`.
- [x] 2.2 Confirm `@types/node@20.19.x` (this repo's pinned devDependency) has NO `node:sqlite` type
  declarations, so a plain `import { DatabaseSync } from "node:sqlite"` fails `tsc --noEmit`.
- [x] 2.3 Write `src/db/node-sqlite.d.ts`: a minimal ambient declaration scoped to only the surface this
  codebase calls (verified against the real runtime API via
  `Object.getOwnPropertyNames(DatabaseSync.prototype)`), proven to satisfy `tsc --noEmit` in an isolated
  throwaway project before adding it to this repo.

## 3. The SQLite schema — pure DDL-text builder (test-first)

- [x] 3.1 Design the full DDL for all 18 CONTEXT.md entities plus three seeded vocabulary/reference
  tables (`hook_type_vocabulary`, `theme_vocabulary`, `recipe_vocabulary`), sourcing every closed-set
  CHECK/seed from existing TypeScript constants (`HOOK_TYPES`, `THEMES`,
  `listWiredRecipeSlugs()`/`getRecipe()`, `KNOWN_PLATFORMS`) — never a second, hand-copied list.
- [x] 3.2 Implement `src/db/schema.ts` (`MIGRATIONS`, `CURRENT_SCHEMA_VERSION`, `ENTITY_TABLES`,
  `VOCABULARY_TABLES`) — pure: builds SQL text only, opens no connection.
- [x] 3.3 Implement `src/db/connection.ts` (`openDatabase`) — the one place `PRAGMA foreign_keys = ON` is
  set, verified this pragma is required (SQLite does not enforce FKs by default).
- [x] 3.4 Implement `src/db/test-support.ts` (`withTempDb`) — a REAL, empty SQLite file per test
  (mkdtemp'd, closed + removed in a `finally`), mirroring `src/asset/store.test.ts`'s existing
  `withLedger` pattern. No in-memory database double anywhere (this epic's own Testing Decisions).
- [x] 3.5 Write failing tests (`migrate.test.ts`) for `runMigrations`/`getSchemaVersion`: a fresh database
  starts at version 0; migrating reaches `CURRENT_SCHEMA_VERSION`; re-running is idempotent; every entity
  table AND every vocabulary table exists after migration; every entity table carries
  `id`/`created_at`/`updated_at`/`schema_version` (asserted generically over `ENTITY_TABLES`, via
  `PRAGMA table_info`); a freshly-written row's `schema_version` defaults to `CURRENT_SCHEMA_VERSION`;
  `hook_type_vocabulary`/`theme_vocabulary`/`recipe_vocabulary` are seeded verbatim from their TS source
  arrays (including the third wired Recipe, `news-short-script`); a migration that fails partway rolls
  back cleanly and is not recorded as applied.
- [x] 3.6 Implement `src/db/migrate.ts` (`runMigrations`, `getSchemaVersion`) — each migration inside its
  own `BEGIN`/`COMMIT`, rolled back on failure.
- [x] 3.7 Write failing tests (`schema.test.ts`) for the constraints themselves, against a REAL migrated
  database: a foreign key is enforced (an unknown `brand_id` on `channel` throws); exactly one primary
  Channel per Brand (a partial unique index — a second primary for the SAME brand throws, a non-primary
  sibling and a primary on a DIFFERENT brand both succeed); `idea.hook_type`/`idea.theme` are real foreign
  keys into the seeded vocabulary tables (a value outside the closed set throws); `idea_recipe.recipe_slug`
  accepts every one of the registry's three real wired slugs and rejects an unwired one; `channel.platform`
  is checked against `KNOWN_PLATFORMS`.
- [x] 3.8 These tests pass against the schema/migration-runner implementation from 3.2–3.6 (no additional
  implementation needed — the constraints are declared as part of the DDL itself).

## 4. The storage-key store boundary (test-first)

- [x] 4.1 Write failing tests (`storage-key.test.ts`) for `assertRootRelativeStorageKey`: a well-formed
  root-relative key is returned unchanged; a POSIX absolute path, a Windows drive-letter path, a Windows
  UNC path, a home-directory-shorthand path, an empty string, and a path containing a `..` segment
  (including nested) all throw `StorageKeyError`; the thrown error names the rejected key.
- [x] 4.2 Implement `src/db/storage-key.ts` (`StorageKeyError`, `assertRootRelativeStorageKey`) — pure.
- [x] 4.3 Write failing tests (`media-ref.test.ts`) proving the rule is enforced AT THE STORE BOUNDARY,
  against a real database: `insertAssetMedia`/`insertBrandAsset` succeed with a well-formed key; an
  absolute/home-shorthand key is rejected BEFORE any row is written (a `COUNT(*)` check proves no
  partial insert).
- [x] 4.4 Implement `src/db/media-ref.ts` (`insertAssetMedia`, `insertBrandAsset`) — calls
  `assertRootRelativeStorageKey` before every write that carries a `storage_key`.

## 5. The two superseding ADRs

- [x] 5.1 Write `docs/adr/0028-post-is-its-own-record.md`: supersedes ADR-0011's Post-as-scalar-fields
  choice ONLY (the per-Recipe Asset grain, its six-stage lifecycle, and `(Idea, Recipe)` attribution are
  explicitly KEPT); records the 2026-08-16 Operator decision date; states the new `post` table's shape
  and its `(asset_id, channel_id)` key; states what it does NOT change (the file ledger, `/log-post`'s
  current signature).
- [x] 5.2 Write `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`: supersedes ADR-0014's
  "keep files for the MVP" choice while explicitly stating ADR-0014's store-boundary/relational/
  stable-id principles are KEPT and FULFILLED; states local SQLite via `node:sqlite`, never hosted,
  never Postgres, never multi-tenant; records the 2026-08-16 Operator decision date; states this ticket
  lands the database only — no store swap (#202), no importer (#204).
- [x] 5.3 Add a forward-pointer blockquote to `docs/adr/0011` (mirroring the existing
  0015–0018-point-back-at-0010/0013/0014 pattern) — no existing decision text edited.
- [x] 5.4 Add a forward-pointer blockquote to `docs/adr/0014` — no existing decision text edited.

## 6. CONTEXT.md, always-rules, and openspec/project.md

- [x] 6.1 Add **Hook Type** and **Theme** as new glossary terms, term-for-term (value + exact meaning
  sentence) identical to `HOOK_TYPES`/`THEMES`, each framed explicitly as a CLOSED vocabulary with an
  `_Avoid_` line.
- [x] 6.2 Correct the **Recipe** entry: "two Recipes are wired" (News Short Script "build pending")
  becomes "three Recipes are wired", citing `src/recipe/registry.ts` as the source of truth.
- [x] 6.3 Update the **Post** entry to state it is its own record keyed `(Asset, Channel)` (ADR-0028),
  not a scalar on the Asset — the count claim narrows from "at most one Post" to "at most one Post per
  Channel".
- [x] 6.4 Update `.claude/rules/always/organicgrowth-rules.md` rule 7: cite `docs/adr/0029`, stating the
  SQLite foundation exists but is NOT yet the backing of any store (no overclaiming the store swap).
- [x] 6.5 Update `openspec/project.md`'s Tech stack section to describe the new, not-yet-wired SQLite
  foundation alongside the existing plain-file state.

## 7. Doc-conformance tests, so the vocabularies and the two ADRs cannot drift (test-first)

- [x] 7.1 Write `src/vocabulary/context-md.docs-test.ts`: `CONTEXT.md`'s Hook Type and Theme entries each
  carry a "closed" framing and list EVERY value from `HOOK_TYPES`/`THEMES` with its EXACT meaning
  sentence — extracted via a heading-line-anchored parser (`extractGlossaryEntry`), not a fixed
  char-count window or a naive `indexOf` (both caused real, caught failures while authoring this test:
  an inline cross-reference to `**Theme**` inside the Hook Type entry's own prose fooled `indexOf`; a
  fixed 2000-char window silently truncated the Theme list's last two values).
- [x] 7.2 Write `src/recipe/registry-wired-count.docs-test.ts`: `CONTEXT.md` states "Today three Recipes
  are wired", names all three (including News Short Script), no longer calls it "build pending", and
  cites `registry.ts` as the source of truth.
- [x] 7.3 Write `src/db/adr.docs-test.ts`: both new ADRs exist, cite what they supersede, record the
  Operator decision date, and state their core shape; `docs/adr/0011`/`docs/adr/0014` carry their
  forward-pointers; rule 7 cites ADR-0029 without overclaiming; `CONTEXT.md`'s Post entry cites ADR-0028.

## 8. OpenSpec + full-suite green + self-review + Build Report

- [x] 8.1 Author spec deltas: `specs/sqlite-foundation` (new capability), `specs/domain-vocabulary` (new
  capability), `specs/docs-conformance` (additive `## ADDED Requirements` only — no existing Requirement
  text touched, avoiding the MODIFIED-header archive trap). Run `openspec validate --strict` until green.
- [x] 8.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs` — all green, above both
  baselines (2411→2454 unit tests / 598→613 suites; 259→275 docs tests / 66→75 suites).
- [x] 8.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #201
  acceptance criterion maps to a specific test.
- [x] 8.4 Write the Build Report into `handoff.md`.
