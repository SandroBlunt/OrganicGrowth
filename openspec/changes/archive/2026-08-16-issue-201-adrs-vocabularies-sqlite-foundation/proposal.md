## Why

Epic #195's whole rebuild — every store swap (#202), real job claiming (#203), the one-shot importer
(#204), the typed command surface (#205), the worker (#208), and the local read-only Library (#210) —
inherits whatever schema and vocabulary this ticket lands. Two prior decisions have to be reversed IN
WRITING first, or every later slice silently contradicts them: ADR-0011 declined a separate Post record
(kept `post_url`/`posted_at`/`performance_score` as scalar fields on the Asset); ADR-0014 put canonical
state in files. This ticket reverses the first on an explicit Operator decision (2026-08-16) and
FULFILS the second's own store-boundary principle by moving the backing to local SQL — ADR-0014 already
named this exact move ("one new adapter behind the same stores") and deliberately deferred it; the
trade-off it deferred on has now inverted (concurrent-session data loss, 191 machine-welded absolute
paths, no version stamps anywhere, three genuinely relational questions the Operator cannot answer).

Separately, hook type exists ONLY as free prose inside a Brief markdown heading, spelled two different
ways across the two Brands ("Hook concept" / "Hook Concept") — an open `hook_type` text field on the new
`idea` table would just move that exact problem into the database. Closing it needs a genuinely CLOSED
vocabulary, decided once, not an open field with good intentions.

## What Changes

- **Two new ADRs.** `docs/adr/0028` records the Post-becomes-its-own-record reversal (partially
  supersedes ADR-0011 — the per-Recipe Asset grain, its six-stage lifecycle, and `(Idea, Recipe)`
  attribution are explicitly KEPT, not reversed). `docs/adr/0029` records local SQLite behind the SAME
  store boundary (supersedes ADR-0014's "keep files for the MVP" choice while explicitly KEEPING and
  FULFILLING its store-boundary/relational-modeling/stable-id principles). Both ADRs are dated to the
  2026-08-16 Operator decision. `docs/adr/0011` and `docs/adr/0014` each gain a forward-pointer
  blockquote (the repo's established pattern — see how ADRs 0015–0018 point back at 0010/0013/0014),
  never silently contradicted.
- **Two new closed vocabularies** (`src/vocabulary/hook-type.ts`'s `HOOK_TYPES`, ten values;
  `src/vocabulary/theme.ts`'s `THEMES`, nine values), each a pure TS array of `{ value, meaning }`,
  calibrated against a real sample of both Brands' Briefs. `CONTEXT.md` defines both as new glossary
  terms, term-for-term identical to these arrays — asserted by a docs-test that reads BOTH the array and
  the doc, so they cannot drift apart.
- **`CONTEXT.md`'s Recipe entry is corrected**: "two Recipes are wired" (with News Short Script still
  marked "build pending") becomes "three Recipes are wired", citing `src/recipe/registry.ts`'s
  `listWiredRecipeSlugs()` as the source of truth — the registry has wired all three since issue #174;
  CONTEXT.md's own count was stale. `CONTEXT.md`'s Post entry is updated to state it is now keyed
  `(Asset, Channel)` (ADR-0028), not a scalar on the Asset.
- **One SQLite database schema** (`src/db/schema.ts`), covering all 18 entities CONTEXT.md names —
  `brand`, `channel`, `format`, `baseline_prompt`, `brand_asset`, `run`, `trend`, `idea`, `idea_recipe`,
  `asset`, `asset_media`, `copy_variant`, `job`, `gate_request`, `post`, `metric_snapshot`,
  `performance_score`, `channel_baseline` — every one carrying `id`, `created_at`, `updated_at`, and a
  `schema_version`. Three closed vocabularies are modeled as SEEDED REFERENCE TABLES with real foreign
  keys (`hook_type_vocabulary`, `theme_vocabulary`, `recipe_vocabulary`) rather than static CHECK lists,
  seeded directly from `src/vocabulary/hook-type.ts`, `src/vocabulary/theme.ts`, and
  `src/recipe/registry.ts`'s `listWiredRecipeSlugs()` — never a second, hand-copied list. Exactly one
  primary Channel per Brand is enforced by a partial unique index (ADR-0019). `job` gains
  `attempt`/`idempotency_key`/`locked_by`/`locked_until` columns issue #203's real claiming will use, but
  does not itself implement claiming.
- **A migration runner** (`src/db/migrate.ts`) that creates the schema from empty, records which version
  a database is at (`schema_migrations`), applies each migration inside its own transaction (rolled back
  cleanly on any failure), and is idempotent.
- **A storage-key store boundary** (`src/db/storage-key.ts`'s `assertRootRelativeStorageKey`, wired into
  real inserts by `src/db/media-ref.ts`): an absolute path (POSIX, Windows drive-letter, Windows UNC,
  home-directory shorthand) or a `..`-traversal segment is REJECTED before any row is written — proven
  against a real SQLite database, not merely a standalone unit test.
- **`node:sqlite`, not a native module.** Node 22's built-in `node:sqlite` is used (present and usable,
  with only a cosmetic experimental-feature warning, on the `v22.23.0` this repo's `package.json`
  already requires `>=22` for). `@types/node@20.19.x` predates its type declarations, so a minimal,
  scoped ambient declaration (`src/db/node-sqlite.d.ts`, covering only the surface this codebase calls)
  fills the gap without bumping the shared `@types/node` devDependency — see Known Limits.

## Non-Goals (explicitly out of scope for this slice)

- **Swapping any existing store's backing.** Every store (`ledger.ts`, `AssetStore`, `QueueStore`,
  `FormatStore`, …) still reads/writes plain files after this slice; `{ ledgerPath }` becoming `{ db }`
  is issue #202.
- **The one-shot importer** against the real ~813 MB `data/` corpus — issue #204.
- **Real job claiming** (`SELECT … FOR UPDATE SKIP LOCKED`-equivalent atomic claim-with-owner-and-expiry)
  — issue #203; this slice only adds the columns that decision needs room for.
- **Backfilling `hook_type`/`theme`** onto the 61 existing Briefs — issue #206.
- **`account`, `user`, `connection` tables** — deliberately not built (epic #195's own instruction); the
  schema is shaped so a future migration can add them without reshaping `brand`.

## Capabilities

### Added Capabilities

- `sqlite-foundation`: the schema (every entity table + the three seeded vocabulary/reference tables),
  the migration runner, the storage-key validator and its wired enforcement points, and the ambient
  `node:sqlite` type declaration.
- `domain-vocabulary`: the closed `HOOK_TYPES`/`THEMES` TS arrays and their `isHookType`/`isTheme` type
  guards — the single source of truth both `CONTEXT.md` and the seeded reference tables derive from.

### Modified Capabilities (additive only — no existing Requirement is changed)

- `docs-conformance`: new Requirements pinning `CONTEXT.md`'s Hook Type/Theme glossary entries, the
  corrected Recipe wired-count, the Post entry's ADR-0028 citation, the two new ADRs' cross-references,
  and rule 7's ADR-0029 citation.

## Impact

- **New code:** `src/vocabulary/hook-type.ts` (+`.test.ts`), `src/vocabulary/theme.ts` (+`.test.ts`),
  `src/vocabulary/context-md.docs-test.ts`; `src/db/node-sqlite.d.ts`, `src/db/schema.ts`
  (+`.test.ts`), `src/db/connection.ts`, `src/db/migrate.ts` (+`.test.ts`), `src/db/storage-key.ts`
  (+`.test.ts`), `src/db/media-ref.ts` (+`.test.ts`), `src/db/test-support.ts`, `src/db/adr.docs-test.ts`;
  `src/recipe/registry-wired-count.docs-test.ts`; `docs/adr/0028-post-is-its-own-record.md`,
  `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`.
- **Modified code:** `CONTEXT.md` (Hook Type + Theme entries added; Recipe entry corrected; Post entry
  updated), `docs/adr/0011-*.md` and `docs/adr/0014-*.md` (forward-pointer blockquotes added, no existing
  decision text edited), `.claude/rules/always/organicgrowth-rules.md` (rule 7 gains an ADR-0029
  citation), `openspec/project.md` (Tech stack section updated to describe the new, not-yet-wired SQLite
  foundation).
- **Hermetic, no live Space or Zoho MCP calls anywhere.** Every test opens a REAL, empty, throwaway
  SQLite file per test (`src/db/test-support.ts`'s `withTempDb`) and drops it in a `finally` block — no
  in-memory database double anywhere, per this epic's own Testing Decisions. No `magnific`/Zoho MCP tool
  is imported or called by any file this slice adds.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics code — 
  generate-never-publish/public-metrics-only/relative-not-absolute are untouched by construction.
  Explicit-attribution is STRENGTHENED (ADR-0028 gives Post its own `(Asset, Channel)` key, never
  inferred). Ledger-as-source-of-truth is untouched: the file ledger stays canonical until issue #202
  swaps any store's backing — this slice's database is not read or written by any existing command.
