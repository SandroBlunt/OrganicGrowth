# Slice Handoff — issue #204: the importer, its rehearsals, and the real run

Bidirectional document. developer's Build Report is below; qa appends its Verdict beneath, in a new
section — nothing here is overwritten.

## Build Report (Round 1)

### What changed

A test-first, two-phase, one-shot importer (`src/importer/`) that migrates both real Brands'
`ledger.json`/`data/queue.json` file state into the SQLite foundation (issue #201, ADR-0029), reading
exclusively through the existing loaders/normalisers this repo already ships.

**Phase one — `planImport`** (`src/importer/plan.ts`) reads everything and either returns a fully
validated `ImportPlan` or a complete list of every problem found across BOTH Brands. It **never writes**.
It composes: `src/ledger/ledger.ts`'s new `loadFullIdeas` (additive — the SAME `normalizeIdeaStatus`
normalizer `loadIdeas`/`loadReport` already use, just a richer projection); `src/format/store.ts`'s
`listFormatSlugs`/`loadFormat`; `src/format/brief-path.ts`'s existing `resolveBriefPathCandidates`
(wrapped by the new `loadBrief`); `src/production-spec/brand-profile.ts`'s `loadZohoConfig`/
`loadCopyRules`/`loadWatermarkHandle`; and `src/production-queue/store.ts`'s `loadQueue` (wrapped by the
new `loadQueueStrict`, which turns that loader's own tolerant "drop with a `console.warn`" behavior into
a hard, named refusal). Every legacy `asset_paths` entry is relativized (`relativizeLegacyPath`), checked
for existence, classified, and checksummed (`planAssetMedia`); every Idea is resolved to a Format (with
MundoTip's sole-Format fallback for its 10 pre-Format records), a canonical status
(`resolveIdeaStatus` — including the real `idea-2026-08-11-12` shape, Assets already populated but a
stale legacy top-level status), and a set of `sourceUrls` extracted from its Brief's `## Source(s)`
section (`extractSourceUrls` — links, never editorial notes).

**Phase two — `executeImport`** (`src/importer/execute.ts`) takes an already-validated plan and writes
it, in dependency order (Brand → Format → Run → Trend → Idea (+ Review decision) → Asset (+ media) →
Job), entirely through the typed command surface (`src/command-surface/`) — never a store directly.
Every queue Job reaches its real historical status via the SAME legal transitions a live run would use
(`enqueueJob` → `claimJob` → `releaseJob`), never a raw status write.

**Reconciliation** (`src/importer/reconcile.ts`) computes, per Brand and in total, counts-in (from the
plan) vs counts-out (a REAL query against the database after `executeImport` ran — never an echo of the
plan's own numbers), plus the two report-only categories.

**The single command** (`src/importer/cli.ts`, `npm run import-data --`) plans, executes, and reconciles
in one call, and refuses to run against a non-empty target database (the import is one-shot, not
incremental — no source file carries `updated_at`, a version, or an etag).

Two command-surface gaps this ticket needed and #205 did not build (its own eight named operations did
not include tenancy/config creation): `createBrand`/`createFormat`/`createRun`
(`src/command-surface/tenancy.ts`, new, backed by a genuinely new `RunStore` — `src/run/store.ts`, the
store #223's own `tasks.md` named as missing), `createTrend` (added to `trends.ts`), and
`getAssetByRecipe` (added to `assets.ts` — a read, needed because `saveAsset` returns `void`).

**Real, evidenced findings from the actual data, each handled explicitly (never guessed):**
- `idea-2026-08-11-12` (Straw Motion) — Assets already populated, but a stale legacy top-level
  `status: "produced"`. `resolveIdeaStatus` coerces this to `accepted` (an Idea cannot have Assets
  without having been accepted).
- `idea-2026-W22-09`/`idea-2026-W22-10` (MundoTip, both rejected) — `trend: "PROSPECTIVE"`, a
  documented idea-strategist sentinel ("no peer evidence, brand-fit-only"), never a resolvable Trend id.
  Stripped explicitly (`stripProspectiveSentinel`).
- The 8 dead media paths are all real: four `2026-08-14` Ideas' `news-short-script` Assets reference
  `script.txt`/`shot-list.txt` under `unhypped-daily/2026-W33/friday-14-august/...output/`, which never
  actually got rendered there (the Run's own id stayed the flat `"2026-08-14"`; only `brief_path`
  points into the nested folder).
- The 12 duplicate `(brand, idea_id, recipe)` groups: 10 are legitimate two-leg Cast-gate pairs
  (`gate: "cast"` then `gate: null` with a resolved `pick`); 2 (`idea-02`/`idea-03` news-carousel) are
  genuine re-runs. This importer reports all 12 identically, without trying to tell them apart — that
  judgment is the Operator's, per the issue's own instruction.

### Files touched

New (`src/importer/`, all with a co-located `.test.ts`): `plan.ts`, `execute.ts`, `reconcile.ts`,
`cli.ts`, `plan-idea.ts`, `plan-asset-media.ts`, `source-urls.ts`, `media-classify.ts`,
`storage-key-from-legacy-path.ts`, `idea-status.ts`, `brand-fields.ts`, `load-brief.ts`,
`load-queue-strict.ts`, `load-trends.ts`, `resolve-trend-info.ts`, plus `golden-shapes.test.ts` (no
matching `.ts` — it tests the composition of several modules against real records).

New elsewhere: `src/run/store.ts` (+`.test.ts`), `src/command-surface/tenancy.ts` (+`.test.ts`).

Modified: `src/ledger/ledger.ts` (additive `loadFullIdeas`; `loadIdeas`/`loadReport` untouched — verified
by the full existing `ledger.test.ts` suite passing unchanged), `src/command-surface/trends.ts` (adds
`createTrend`), `src/command-surface/assets.ts` (adds `getAssetByRecipe`), `src/command-surface/index.ts`
(re-exports), `src/fs-boundary/allow-list.ts` (the importer's own five `node:fs`-touching modules),
`package.json` (`import-data` script), `openspec/project.md` (Tech-stack paragraph corrected).

Untouched (deliberately, verified by `git diff`): `src/db/schema.ts`, `src/db/migrate.ts` (no new
migration — `MIGRATION_1`/`MIGRATION_2` stay byte-for-byte frozen), every store #201/#222/#223/#203
shipped, `data/brands/*/ledger.json`, `data/queue.json` (the rehearsal ran against a COPY, never these
real files).

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-204-importer-and-rehearsals
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.build.json --noEmit
npm test                                        # 3218 / 841 suites / 0 fail (baseline: 3100/800/0 fail)
npx openspec validate issue-204-importer-and-rehearsals --strict
npx openspec validate --all --strict            # 59 passed, 0 failed (baseline: 57)
```

Just this ticket's new suites:
```
node --import tsx --test src/importer/*.test.ts src/run/store.test.ts \
  src/command-surface/tenancy.test.ts src/command-surface/assets.test.ts src/command-surface/trends.test.ts \
  src/ledger/load-full-ideas.test.ts
```

The single command (a rehearsal — point `--checkout-root`/`--db` at a scratch copy):
```
npm run import-data -- \
  --checkout-root <scratch-copy-of-the-repo-root> \
  --db <scratch-copy>/organicgrowth.db \
  --legacy-prefix /Users/CaxtonTaylor/Developer/OrganicGrowth \
  --reconciliation-out <scratch-copy>/reconciliation.md
```

### Acceptance-criteria self-assessment

- **"The importer reads through the existing loaders and normalisers, never raw JSON."** Proven by
  `src/ledger/load-full-ideas.test.ts`'s `"still runs every record through normalizeIdeaStatus..."` test
  (reuses the SAME normalizer `loadIdeas` uses) and `src/importer/plan.test.ts`'s real-data smoke test
  (succeeds reading both real ledgers via `loadFullIdeas`, both real Format files via `loadFormat`, the
  real Brand Profiles via `loadZohoConfig`/`loadCopyRules`, and the real `data/queue.json` via
  `loadQueueStrict`).
- **"Anything it cannot parse causes a refusal with a report naming the record."** `src/importer/
  plan.test.ts`'s `"planImport — refuses..."` describe block: a missing Brief, an unresolvable Trend, a
  foreign absolute path, a malformed `queue.json` job, and an unresolvable job each their own test,
  every one asserting the specific record is NAMED in `problems`. `src/importer/plan-idea.test.ts`'s
  rejected-Idea-with-no-reason test proves this catches what would otherwise be an execution-time
  `rejectIdea` throw.
- **"The importer runs against a copy of `data/` and is re-runnable from an empty database."**
  `src/importer/cli.test.ts`'s `"succeeds, writes the database..."` (a fresh db) and `"refuses to run
  against a non-empty database..."` (a second call against the SAME db throws, naming why) — plus the
  real rehearsal itself (below), which ran against a full copy of `data/`, never the live checkout.
- **"Golden-file tests cover every legacy shape with its own fixture."** `src/importer/
  golden-shapes.test.ts` — 11 tests, each naming one real record: MundoTip's pre-Format shape, all
  three Straw Motion ID schemes, all three Straw Motion Idea shapes, all four real folder layouts (the
  nested-daily one proven live via `idea-2026-08-14-01`'s own `brief_path`, which points into the
  nested `2026-W33/friday-14-august` folder even though its Run id stays the flat `"2026-08-14"`).
- **"The 12 duplicate job identity keys are reported explicitly ... not resolved."**
  `src/importer/plan.test.ts`'s real-data smoke test asserts `duplicateJobKeys.length === 12` exactly;
  `src/importer/execute.test.ts`'s `"creates two job rows for a duplicate identity key..."` proves both
  still land as separate rows, never merged.
- **"The 8 dead media paths are reported explicitly ... never silently nulled."**
  `src/importer/plan-asset-media.test.ts`'s `"marks a missing file as dead — no media row, no
  problem"`; the real rehearsal reported exactly 8, matching the ticket's own count and naming.
- **"The 191 absolute paths are converted to root-relative storage keys; no absolute path survives."**
  `src/importer/storage-key-from-legacy-path.test.ts` (the pure conversion), `plan.test.ts`'s real-data
  smoke test's own `"no absolute path anywhere in a storage key"` loop, and a direct SQL check against
  the rehearsed database (`SELECT COUNT(*) FROM asset_media WHERE storage_key LIKE '/%'` → `0`).
- **"Every imported record carries `created_at`, `updated_at` and a schema version."** Structural —
  every `ENTITY_TABLES` column (`src/db/schema.ts`, frozen) already enforces `NOT NULL DEFAULT` on all
  three; no store this importer calls can insert a row without them. Not separately re-tested here.
- **"The run ends with a per-entity reconciliation: counts in versus counts out, for both Brands."**
  `src/importer/reconcile.test.ts` (both the matching and the deliberately-mismatched case);
  `formatReconciliationMarkdown`'s Markdown output is what was posted on the issue.
- **"At least one full rehearsal against a copy is completed and its reconciliation posted on this
  issue before the real run."** Done — see "Rehearsal, run" below.
- **"The real import runs; its reconciliation is posted and committed."** **NOT done, deliberately.**
  This is AC11, explicitly Operator-gated per the task instructions ("Do NOT run the real import"). The
  single command that will run it (`npm run import-data --`, unchanged) is built, tested, and already
  proven against the real corpus via the rehearsal.
- **"The reconciliation accounts for all 54 Assets, all 61 Briefs and all 66 queue jobs."** The
  rehearsal's own reconciliation shows exactly `idea=61 (in=out), asset=54 (in=out), job=66 (in=out)` —
  see below.

### Rehearsal, run (AC10)

Copied the live `data/` directory (813 MB, read-only source — never written to) into a scratch
location, and ran `npm run import-data --` against that copy into a fresh SQLite database:

```
# Import reconciliation — 2026-08-17T11:37:58.509Z

| Brand | Ideas (Briefs) in | out | Assets in | out | Jobs in | out |
| --- | --- | --- | --- | --- | --- | --- |
| mundotip | 10 | 10 (OK) | 0 | 0 (OK) | 0 | 0 (OK) |
| straw-motion | 51 | 51 (OK) | 54 | 54 (OK) | 66 | 66 (OK) |
| **Totals** | **61** | **61** (OK) | **54** | **54** (OK) | **66** | **66** (OK) |

## Dead media paths (8)
[the 4 W33-Friday Ideas' script.txt + shot-list.txt pairs — see the full report on the issue]

## Duplicate job identity keys (12)
[the 10 legitimate two-leg pairs + the 2 real re-runs — see the full report on the issue]
```

Posted in full on issue #204: https://github.com/SandroBlunt/OrganicGrowth/issues/204#issuecomment-5315532402

Cross-checked directly against the resulting SQLite database (raw `SELECT COUNT(*)` per table, bypassing
the importer's own reporting entirely, as an independent check): `brand=2, format=3, run=6, trend=45,
idea=61, idea_recipe=54, asset=54, asset_media=259, job=66`. `asset_media` (259) + the 8 dead paths = 267
— matches the epic's own recorded "267 media paths recorded in the ledger" exactly. Job status
distribution: `done=63, queued=3` — matches the epic's own recorded fact exactly (never `running`, never
`awaiting_pick`). Brand `name`/`timezone`: Straw Motion correctly resolved to `"Straw Motion"`/
`"Europe/Berlin"` from its real Zoho Social Brand config; MundoTip (no `zoho` block) fell back to the
documented default `"Mundotip"`/`"UTC"`.

**AC11 (the real import) was deliberately NOT run**, per the task's own explicit instruction — that is
an Operator-approved action. The scratch database and the 813 MB scratch copy of `data/` have both been
deleted after this rehearsal; nothing from it was committed or left behind.

### Fakes / fixtures used

- **The Magnific fake is not used and not needed.** This slice never touches Space-facing code — no
  file under `src/space-driver/`/`src/producer/` is imported by anything this change added (verified:
  none of the 47 changed/added files import from either directory). No `magnific`/Zoho MCP tool is
  reachable from anything this ticket built.
- `src/db/test-support.ts`'s `withTempDb` — a real, throwaway SQLite file per test, never `:memory:`,
  exactly as this epic's own Testing Decisions require. Used throughout `src/run/store.test.ts`,
  `src/command-surface/*.test.ts`, `src/importer/execute.test.ts`, `src/importer/reconcile.test.ts`,
  `src/importer/cli.test.ts`.
- Hand-built "mini repo" fixtures (`mkdtemp` + `writeFile`, mirroring `src/ledger/ledger.test.ts`'s own
  established convention) for every fast, deterministic test — the happy path, every named refusal, and
  MundoTip's pre-Format shape end-to-end (`plan.test.ts`), the executor's write semantics
  (`execute.test.ts`), and the CLI (`cli.test.ts`).
- **Real, read-only fixtures**: `data/brands/mundotip/ledger.json` and
  `data/brands/straw-motion/ledger.json`, read directly (never written to) by `plan.test.ts`'s
  structural smoke test and every test in `golden-shapes.test.ts` — mirrors
  `src/ledger/migrate-assets.test.ts`'s own established "round-trip against the REAL ledgers" pattern.
- **The rehearsal's own fixture is the real `data/` directory itself**, copied (read-only source) to a
  scratch location outside the repo, then deleted after the rehearsal completed and was verified.

### Self-review notes

- Found and fixed a real bug while wiring the real-data test: Spec-file reads (`asset.spec_path`) were
  resolved relative to the process's CWD instead of the configured `checkoutRoot` — invisible in every
  hand-built fixture test (which happened to run from the repo root) but would have silently produced
  `spec: undefined` for every real Asset in a rehearsal run from a different working directory. Fixed
  by making `defaultLoadSpec` a factory closed over `checkoutRoot` (`makeDefaultLoadSpec`).
- Refactored `plan-asset-media.ts`/`plan-idea.ts`/`plan.ts`'s single conflated `repoRoot` parameter into
  two distinct concepts (`legacyAbsolutePrefix`, the FIXED historical prefix baked into old data; and
  `checkoutRoot`, where THIS run actually reads files from) before writing the real-data smoke test —
  the conflation would have silently broken every absolute-path conversion the moment a rehearsal ran
  against a copy at a different location, which is the exact scenario this ticket exists to rehearse.
  Caught by design review, not by a failing test (no test yet existed that used two different roots) —
  documented explicitly in both modules' own doc comments so it cannot regress unnoticed.
- Removed a duplicate `planAssetMedia` call in `plan-idea.ts`'s `planOneAsset` (computed the same result
  twice — once for the planned Asset, once again just to collect its `problems`) once the golden-shape
  and real-data tests were both green, folding both uses into one call.
- Added a planning-time guard for a rejected Idea with no `rejection_reason` after noticing
  `rejectIdea`'s own store-level `IdeaValidationError` would otherwise surface as a raw execution-time
  throw mid-import — verified true of every real rejected Idea today, but this ticket's own standard is
  "refusal, not a crash," so it is caught at the earlier, correct layer regardless.

### Known limits

- **AC11 (the real import) is Operator-gated and not run by this slice** — by explicit instruction. The
  single command that runs it is built and rehearsed; only `--checkout-root`/`--db` need to change.
- **Channel, Brand Asset, Baseline Prompt, Copy Variant, and Post are not imported.** No AC/reconciliation
  target in this issue names them, and nothing in this change's scope (`idea`/`idea_recipe`/`asset`/
  `asset_media`/`job`) references `channel` as a foreign key. A later ticket owns porting the epic's own
  "7 posted Assets with a `post_url`" fact.
- **`fit_basis` (the Fit Score's free-text rationale) is not imported** — no column exists for it in the
  frozen schema, and `relevance`/`momentum`/`brand_fit` stay `NULL` (no real record stores them as
  separate numbers, only inside `fit_basis`'s prose). `fit_score` itself (the one clean numeric field)
  is imported. `MIGRATION_1`/`MIGRATION_2` stay byte-for-byte frozen — this change adds no migration.
- **Cast/Character fields (`cast[]`, `character`) and a Job's `pick` field are not carried onto SQL.**
  Both are pre-existing narrowings (`src/asset/store.ts`'s `DbAssetRecord`, and `job`'s frozen schema
  from #201/#203 respectively) this change does not reopen. Nothing is lost irrecoverably — the source
  `ledger.json`/`queue.json` are untouched by this change.
- **`## Source(s)` editorial notes are dropped, not kept in a separate field.** No schema field exists
  for them and no acceptance criterion asks for one; documented explicitly in
  `src/importer/source-urls.ts`'s own doc comment and this proposal's "What Changes" section.
- **A Trend's `is_paywalled` is always imported as `false`.** No real `trends.json`/ledger record
  carries this fact (`is_paywalled` is a new, #201/#219 schema concept with no legacy on-disk
  representation) — never guessed from prose.
- **MundoTip's Brand display name falls back to a title-cased slug (`"Mundotip"`)**, not the real
  `"MundoTip"` capitalization — no field anywhere in this repo's real data names it (MundoTip has no
  `zoho` block, the one real source this importer found for Straw Motion's own exact name). Documented
  explicitly in `src/importer/brand-fields.ts`'s own doc comment.
