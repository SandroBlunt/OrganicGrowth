## 1. Ground the build — read before writing any code

- [x] 1.1 Read issue #204's body and its own comment thread (three findings established after the issue
  was written: the openly-readable-source check's real gap, `unclassified`'s honest-default status, the
  dangling-`trendId` FK convention).
- [x] 1.2 Verify every blocker (#197, #202, #203) is closed.
- [x] 1.3 Survey the real data directly: both ledgers' shapes, `data/queue.json`'s 66 jobs and 12
  duplicate `(brand, idea, recipe)` groups, the 191 (184 in this checkout — see `handoff.md`) absolute
  paths' one field of origin (`assets[].asset_paths[]`), the 8 dead media paths' real cause (a
  ledger `run`/`brief_path` mismatch for four `2026-08-14` Ideas whose files actually live under the
  nested `2026-W33/friday-14-august` folder).
- [x] 1.4 Read every existing loader/store this change reuses: `src/ledger/ledger.ts`,
  `src/asset/migrate.ts`'s `normalizeIdeaStatus`, `src/format/store.ts`, `src/format/brief-path.ts`,
  `src/production-spec/brand-profile.ts`, `src/production-queue/store.ts`, every `{ db }` store #201/
  #222/#223/#203 shipped, and the existing `src/command-surface/` modules.

## 2. Foundational store/command-surface gaps the importer needs (test-first)

- [x] 2.1 `src/run/store.ts` (+`.test.ts`) — `createRun`/`getRun`/`getRunByKey`, the store #223's own
  `tasks.md` named as missing.
- [x] 2.2 `src/command-surface/tenancy.ts` (+`.test.ts`) — `createBrand`/`createFormat`/`createRun`.
- [x] 2.3 `src/command-surface/trends.ts` — add `createTrend` alongside the existing `listTrends`.
- [x] 2.4 `src/command-surface/assets.ts` — add `getAssetByRecipe` (a read `saveAsset`'s `void` return
  makes necessary before `attachAssetMedia` can be called).
- [x] 2.5 `src/command-surface/index.ts` — re-export everything above.

## 3. Pure deep modules (test-first)

- [x] 3.1 `src/importer/source-urls.ts` — `extractSourceUrls`: links, not lines, out of a Brief's
  `## Source(s)` section.
- [x] 3.2 `src/importer/media-classify.ts` — filename extension → `{ kind, mime }`.
- [x] 3.3 `src/importer/storage-key-from-legacy-path.ts` — `relativizeLegacyPath`: legacy path →
  root-relative storage key, refusing anything it cannot safely convert.
- [x] 3.4 `src/importer/idea-status.ts` — `resolveIdeaStatus`: the SQL `idea.status` value, including
  the real `idea-2026-08-11-12` shape (Assets populated, stale legacy top-level status).
- [x] 3.5 `src/importer/brand-fields.ts` — `deriveBrandDisplayFields`: a Brand's name/timezone from its
  real Zoho Social Brand config, falling back to a documented default (MundoTip has none).

## 4. Loader extensions and new thin I/O shells (test-first)

- [x] 4.1 `src/ledger/ledger.ts` — `loadFullIdeas`, additive, reusing `normalizeIdeaStatus`; MundoTip's
  `trend` short-code field folded in as a `trendId` fallback alongside `trend_id`.
- [x] 4.2 `src/importer/load-brief.ts` — thin shell over the existing `resolveBriefPathCandidates`.
- [x] 4.3 `src/importer/load-queue-strict.ts` — wraps the existing `loadQueue`, capturing any
  `console.warn` it emits so a would-be silent drop becomes a named, reportable event.
- [x] 4.4 `src/importer/load-trends.ts` — new parser for a Run's `trends.json` (no pre-existing loader).
- [x] 4.5 `src/importer/resolve-trend-info.ts` — Straw Motion's inline `trend_label` (no I/O), or
  MundoTip's `trends.json` lookup (its only real case, since it always uses the legacy-flat layout).

## 5. Per-Asset and per-Idea planning (test-first)

- [x] 5.1 `src/importer/plan-asset-media.ts` — `planAssetMedia`: relativize → check existence → classify
  → checksum-or-mark-dead, per `asset_paths` entry, injectable file ops.
- [x] 5.2 `src/importer/plan-idea.ts` — `planIdea`: composes status resolution, source-URL extraction,
  recipe-selection shaping, and per-Asset media planning into one Idea decision; refuses a missing Brief
  and a rejected Idea with no `rejection_reason`.

## 6. The top-level planner, golden-file coverage, and the executor (test-first)

- [x] 6.1 `src/importer/plan.ts` — `planImport`: Brand → Format (MundoTip's sole-Format fallback) → Run
  → Trend (before Idea, per #228's FK convention) → Idea → Asset, plus `data/queue.json` job planning
  (resolve, group duplicates). Two real, evidenced edge cases found and fixed while wiring the REAL data
  through this: Spec-file reads resolved against the wrong root, and the `"PROSPECTIVE"` sentinel.
- [x] 6.2 `src/importer/plan.test.ts` — a hand-built mini-repo (happy path + every named refusal) plus a
  structural smoke test against the REAL `data/brands/mundotip`/`data/brands/straw-motion`.
- [x] 6.3 `src/importer/golden-shapes.test.ts` — one test per named legacy shape (AC4), each pointing at
  a specific real record: MundoTip's pre-Format shape, all three Straw Motion ID schemes, all three
  Straw Motion Idea shapes, all four real folder layouts.
- [x] 6.4 `src/importer/execute.ts` (+`.test.ts`) — `executeImport`: writes an already-validated plan
  through the command surface, in dependency order, including an end-to-end test chaining
  `planImport` → `executeImport`.

## 7. Reconciliation and the single command

- [x] 7.1 `src/importer/reconcile.ts` (+`.test.ts`) — `buildReconciliation`/`formatReconciliationMarkdown`:
  counts in (the plan) vs counts out (a real query against the database, not an echo).
- [x] 7.2 `src/importer/cli.ts` (+`.test.ts`) — `importCommand`: plan → execute → reconcile in one call;
  refuses a non-empty target database with a clear, actionable message. Wired as `npm run import-data --`.
- [x] 7.3 `src/fs-boundary/allow-list.ts` — audit and allow-list the importer's five `node:fs`-touching
  modules (issue #205/#233's ratchet guard).

## 8. The rehearsal (AC10)

- [x] 8.1 Copy the live `data/` directory (813 MB, read-only source) into a scratch location — never
  writing back to the real checkout.
- [x] 8.2 Run `npm run import-data --` against the scratch copy into a fresh SQLite database.
- [x] 8.3 Cross-check the resulting database directly (`brand`/`format`/`run`/`trend`/`idea`/
  `idea_recipe`/`asset`/`asset_media`/`job` row counts, zero absolute `storage_key`s, job-status
  distribution) against the reconciliation report and the epic's own recorded facts.
- [x] 8.4 Post the reconciliation on issue #204.

## 9. OpenSpec + full-suite green + self-review + Build Report

- [x] 9.1 Author `proposal.md`, this `tasks.md`, and the `importer` capability's spec deltas. Run
  `openspec validate --strict` until green.
- [x] 9.2 Run `npx tsc -p tsconfig.json --noEmit` and `npm test` — green, at/above the 3100/800/0-fail
  baseline.
- [x] 9.3 Self-review pass: confirm every AC1–AC10 maps to a specific test; AC11 explicitly marked
  Operator-gated, not built by this change.
- [x] 9.4 Write the Build Report into `handoff.md`.
