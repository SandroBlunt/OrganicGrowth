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
`listFormatSlugs`/`loadFormat`; `src/production-spec/brand-profile.ts`'s `loadZohoConfig`/
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

---

## QA Verdict — Round 1: FAIL

Worked entirely inside `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-204-importer-and-rehearsals`
(branch `issue-204-importer-and-rehearsals`, HEAD `b45c868`). No product code, test, spec, or ledger was
edited. One read-only excursion into the live checkout
(`/Users/CaxtonTaylor/Developer/OrganicGrowth`) was made, strictly to independently re-derive the five
ground-truth numbers straight from the real `data/` files (Python `json.load` + `os.path.exists` checks
only — no writes, confirmed clean before and after via `git status`).

### Suite result — actually run, actually green

| Check | Command | Result |
| --- | --- | --- |
| Type-check (app) | `npx tsc -p tsconfig.json --noEmit` | clean, no output |
| Type-check (build) | `npx tsc -p tsconfig.build.json --noEmit` | clean, no output |
| Full suite | `npm test` | **3240 / 847 suites / 0 fail** (matches the task brief's expected post-rebase figure exactly) |
| Docs suite | `npm run test:docs` | **295 / 80 suites / 0 fail** |
| OpenSpec, all | `npx openspec validate --all --strict` | **60 passed, 0 failed** |
| OpenSpec, this change | `npx openspec validate issue-204-importer-and-rehearsals --strict` | `Change 'issue-204-importer-and-rehearsals' is valid` |

The developer's own reported pre-rebase figures (3218/841) are correctly superseded; the branch as
handed to QA reproduces the task brief's stated 3240/847/0-fail baseline exactly.

### Independent re-derivation of all five ground-truth numbers (plus AC7's 191)

Computed directly from the live `data/brands/*/ledger.json` and `data/queue.json` (read-only, Python,
no code from this change used) — every number matches the developer's rehearsal and the issue's own
stated ground truth exactly:

| Metric | Independently derived | Developer's rehearsal | Issue ground truth |
| --- | --- | --- | --- |
| Ideas (Briefs) | 61 (10 mundotip + 51 straw-motion) | 61 | 61 |
| Assets | 54 (0 mundotip + 54 straw-motion) | 54 | 54 |
| Queue jobs | 66 | 66 | 66 |
| Dead media paths | 8 (exact same 8 records, byte-for-byte identical list) | 8 | 8 |
| Duplicate job identity keys | 12 (exact same 12 `(brand, idea_id, recipe)` groups) | 12 | 12 |
| Absolute paths (AC7, bonus) | 191 | 191 | 191 |

One nuance surfaced during this check, not a defect: the live checkout currently carries an *uncommitted*
working-tree edit (`idea-01`'s `news-carousel` Asset for `straw-motion`, `data/brands/straw-motion/
ledger.json` + `data/queue.json`, file mtimes 2026-08-14 — pre-dating this review, not a concurrent
write happening right now) that adds 7 real, existing absolute paths. This is why this WORKTREE's own
git-tracked `data/` (184 absolute paths, per the developer's own `tasks.md` §1.3 parenthetical) differs
from the LIVE checkout's 191 — the rehearsal captured the live filesystem, uncommitted content included,
which is correct (a raw directory copy, not `git archive`). Ideas/Assets/Jobs/duplicate-key counts are
identical either way since that edit only populated fields on an *already-counted* row. **Operational
takeaway for the real run, below.**

### Per-criterion results

| # | Acceptance criterion | Result | Proving test / evidence |
| --- | --- | --- | --- |
| AC1 | Reads through loaders/normalisers, never raw JSON | **PASS**, with one latent gap noted below (Defect 2) | `grep JSON.parse src/importer/*.ts` finds exactly 2 non-test sites: `load-trends.ts` (a Run's `trends.json` — no pre-existing loader anywhere in the repo, verified by `grep -rl spec_path src --include=*.ts`) and `plan.ts`'s `makeDefaultLoadSpec` (an Asset's `spec_path` file — likewise no pre-existing file-path loader exists; `production-spec/store.ts` only has file *writers* and a DB-keyed reader). No `ledger.json`/Idea file is ever `JSON.parse`d outside `src/ledger/ledger.ts`. `src/ledger/load-full-ideas.test.ts` proves `loadFullIdeas` reuses the SAME `normalizeIdeaStatus` as `loadIdeas` |
| AC2 | Refusal naming the record, never silent drop/repair | **PASS on every tested path; latent gap found, not live-triggered** — see Defect 2 | `plan.test.ts`'s 6 named-refusal tests (missing Brief, unresolvable Trend, foreign absolute path, malformed queue job, unresolvable job, ambiguous Format) each assert the specific id/path appears in `problems`; `plan-idea.test.ts`'s rejected-no-reason test |
| AC3 | Re-runnable from an empty database | PASS | `cli.test.ts`: `"succeeds, writes the database..."` + `"refuses to run against a non-empty database..."` |
| AC4 | Golden fixtures, every legacy shape | PASS | `golden-shapes.test.ts` — 11 tests, each against a named real record (verified each id exists in the real ledgers) |
| AC5 | 12 duplicate job keys reported, not resolved | PASS | `plan.test.ts` real-data smoke test (`duplicateJobKeys.length === 12`) + `execute.test.ts`'s "creates two job rows..." (never merged) + my own independent recount |
| AC6 | 8 dead media paths reported, never nulled | PASS | `plan-asset-media.ts`'s dead-path branch (no fabricated `bytes`/`checksum`) + `plan-asset-media.test.ts` + my own independent recount (byte-identical list) |
| AC7 | 191 absolute paths → root-relative; none survive | PASS | `storage-key-from-legacy-path.test.ts` (pure conversion + refusal on a foreign root) + `plan.test.ts`'s "no absolute path anywhere in a storage key" loop + `src/db/storage-key.ts`'s `assertRootRelativeStorageKey` (read directly: throws on any leading `/`, confirmed wired into every write via `src/db/media-ref.ts`) |
| AC8 | `created_at`/`updated_at`/schema version on every record | PASS (structural) | `src/db/schema.ts` (untouched, confirmed via `git diff`): every `ENTITY_TABLES` column is `NOT NULL DEFAULT` on all three |
| AC9 | Per-entity reconciliation, counts in vs out, both Brands | PASS | `reconcile.ts` + `reconcile.test.ts` (matching + deliberately-mismatched cases); "counts out" is a real post-execute SQL query, never an echo |
| AC10 | ≥1 rehearsal against a copy, reconciliation posted before real run | PASS | Posted on issue #204 comment thread; numbers independently reproduced above |
| AC11 | Real import runs, reconciliation posted+committed | **Correctly out of scope** — not run, no db left in the repo (`find . -iname "*.db"` empty, `git status` clean), no evidence of a real run anywhere in the branch |
| AC12 | Reconciliation accounts for 54 Assets, 61 Briefs, 66 jobs | PASS | Same reconciliation numbers, independently reproduced |

### Per-scenario results (spec deltas)

Every Scenario in `openspec/changes/issue-204-importer-and-rehearsals/specs/importer/spec.md` was traced
to a passing test; spot-checked in depth (code read + test read, not just grep):

- "a legacy un-migrated production status still folds through the same normalizer" → `load-full-ideas.test.ts` — PASS
- "the real MundoTip and Straw Motion ledgers both load successfully" → `plan.test.ts` real-data smoke test — PASS
- All 5 refusal scenarios (missing Brief / unresolvable Trend / foreign absolute path / dropped queue job / rejected-no-reason) → `plan.test.ts`'s refusal `describe` block, each asserting the named record — PASS
- "a full rehearsal... succeeds and reconciles" / "re-running against the same database is refused" / "a fresh, empty database imports cleanly" → `cli.test.ts` (all 3 read directly) — PASS
- All 3 golden-shape scenarios → `golden-shapes.test.ts` (read in full, all 11 tests against named real ids) — PASS
- Both duplicate-job-key scenarios → `execute.test.ts`'s two-job-rows test + `plan.test.ts`'s exact-12 assertion — PASS
- Both dead-media-path scenarios → `plan-asset-media.ts` code path (no row + named on `dead[]`) + independently reproduced the exact 8 — PASS
- Both absolute-path scenarios → `storage-key-from-legacy-path.test.ts` + the real-data "no absolute path" loop — PASS
- "every imported Idea is unclassified" / "a Source(s) bullet with no URL is dropped" → `execute.ts`'s hardcoded `UNCLASSIFIED_HOOK_TYPE`/`UNCLASSIFIED_THEME` (read directly — never conditional on Brief content) + `source-urls.ts`'s `URL_PATTERN`-only extraction (read directly) — PASS
- "a Trend is always created before any Idea that references it" → `execute.ts`'s `executeRun`: trends loop runs to completion before the ideas loop begins, keyed by `trendIdByLegacyId` — PASS. Note: `planImport` refuses the WHOLE plan up front if any referenced Trend fails to resolve (`resolveTrendInfo` → `problems`), so in practice `executeImport` never actually reaches the raw-FK-error case described in the issue's comment #3 — the dangling-trendId risk is preempted at planning time rather than caught at execution time, which is a stronger guarantee than the scenario technically asks for, not a gap.
- "a job reaches its real historical status through the same legal transitions" → `execute.ts`'s `executeJob` (`enqueueJob`→`claimJob`→`releaseJob`, never a raw status write) — PASS
- Both reconciliation scenarios → `reconcile.test.ts` — PASS

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
| --- | --- | --- |
| Generate-never-publish | PASS (N/A) | No content-generation or publish code touched |
| Public-metrics-only | PASS (N/A) | No metrics/performance code touched |
| Relative-not-absolute (scoring vs. baseline) | PASS (N/A) | No scoring/comparison code touched (AC7's "absolute→relative" is about storage *paths*, a different concern) |
| Explicit-attribution | PASS (N/A) | Post/attribution deliberately not imported by this change (documented in "Known limits") |
| Ledger-as-source-of-truth | PASS | `data/brands/*/ledger.json`/`data/queue.json` confirmed untouched by `git diff` inside the worktree; the rehearsal ran against a copy; SQLite stays additive infra only |
| Magnific fake / hermetic | PASS | `grep -rniE "magnific\|spaces_\|creations_\|zoho.*mcp" src/importer/ src/run/ src/command-surface/tenancy.ts` → zero matches. No file under `src/space-driver/`/`src/producer/` is imported by anything this change added. Every DB test uses `withTempDb` (a real, throwaway SQLite file) — grepped `:memory:` across every new test file, zero matches |

### Defect list

**Defect 1 — HIGH — `src/run/store.ts`'s `createRun` is not registered in the store-write-boundary
guard's `STORE_WRITE_FUNCTIONS`, leaving the new store unprotected.**

`src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` map (read in full) lists every other
SQL-backed store this change touches (`brand/store.ts`, `format/store.ts`, `trend/store.ts` all already
present) but has NO entry for `src/run/store.ts`, even though `createRun(db: DatabaseSync, ...)` is a
genuine new SQL write function this change introduces and routes through
`src/command-surface/tenancy.ts`. `git diff main...HEAD -- src/store-write-boundary/` is completely
empty — the file was never touched by this branch.

This is a direct, provable violation of an EXISTING, already-shipped requirement, not something this
change's own spec needs to restate: `openspec/specs/store-write-boundary-guard/spec.md`'s "every
SQL-backed... domain store SHALL have its write-function exports named in
`src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS`." Because `findStoreWriteImports` only
matches a resolved module that already has an entry in that map, `store-write-guard.test.ts` cannot see
`src/run/store.ts` at all — a future, un-audited direct import of `createRun` from ANY non-command-surface
file would pass the guard silently. Today's only caller (`tenancy.ts`) is legitimate, so there is no LIVE
bypass yet — but the protection mechanism itself has a hole exactly where a brand-new store was just
added, which is precisely the scenario this guard exists to catch. The task brief flagged this exact
class of omission from sibling issue #209's own QA failure; it recurs here.

*Repro:*
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-204-importer-and-rehearsals
grep -n '"src/run/store.ts"' src/store-write-boundary/scan.ts   # no output — not registered
git diff main...HEAD -- src/store-write-boundary/               # empty — never touched
```
*Fix:* add `"src/run/store.ts": ["createRun"]` to `STORE_WRITE_FUNCTIONS` in
`src/store-write-boundary/scan.ts`. `store-write-guard.test.ts` will then correctly see (and continue to
pass on) `tenancy.ts`'s existing, legitimate import.

**Defect 2 — MEDIUM — two top-level "shape didn't match, degrade silently" fallbacks give AC2's "never a
silent drop" a real, if currently dormant, hole.**

1. `src/ledger/ledger.ts`'s `loadFullIdeas`/`loadIdeas` (the read path this importer is built on) skip a
   ledger record with no string `id` — confirmed by `src/ledger/load-full-ideas.test.ts:169`, `"skips a
   record with no string id, same as loadIdeas"` — with ZERO problem raised, and `planImport` never
   cross-checks the loaded count against the ledger's own raw `ideas.length`.
2. `src/production-queue/store.ts`'s `parseQueueState` (`return emptyQueue()` when the parsed JSON's
   top level isn't an object) has no `console.warn` on that branch, so `loadQueueStrict`'s
   warn-capturing technique — otherwise airtight; verified every one of `parseJob`'s 7 individual
   `return null` branches DOES warn — cannot see this one specific top-level case.

Neither is new to this ticket (both are inherited from the pre-existing, more tolerant `loadIdeas`/
`loadQueue`), and neither is live-triggered by today's real data: I independently verified, directly
against both real ledgers, zero records with a missing/non-string `id` (`0` in both files), and
`data/queue.json`'s top level is a well-formed `{ jobs: [...] }` object. So AC9/AC10/AC12's stated 61/
54/66 are NOT at risk for the imminent real run. But this ticket's own stated purpose is "the failure
mode is not a crash — it is a silent success that loses data," and a reconciliation whose "counts in"
is computed from the SAME already-filtered planned data as "counts out" cannot catch a record dropped
before planning even begins — the two would silently agree on the wrong number. This is exactly the
class of gap AC2's "never a silent drop" language exists to close, even though it currently costs
nothing on the real corpus.

*Repro (would only manifest on a corrupted/malformed source file, not on real data today):*
```js
// loadFullIdeas silently drops this record instead of refusing:
{ ideas: [{ status: "suggested" }, { id: "idea-01", run: "2026-W29", status: "suggested" }] }
// -> loadFullIdeas(...) returns 1 Idea, not 2, with no problem raised anywhere in planImport
```
*Suggested fix (not required to block the real run given the live-data check above, but should land
before this importer, or `loadFullIdeas`, is reused/re-run):* have `planBrand` compare
`rawIdeas.ideas.length` (a cheap raw count) against `fullIdeas.length` and push a named problem on any
mismatch; give `parseQueueState`'s non-object branch the same `console.warn` every other drop in that
file already has.

### Judgement on whether the Operator can safely approve the real run

**Not yet — fix Defect 1 first; Defect 2 does not block approval.**

On the numbers: this is as solid as a rehearsal gets. All five stated ground-truth counts (61 Ideas, 54
Assets, 66 jobs, 8 dead media paths, 12 duplicate job keys) plus AC7's 191 absolute paths were
independently re-derived, from scratch, directly against the real `data/` files with no code from this
change — and matched the developer's own rehearsal and the issue's stated ground truth exactly, byte-for-
byte on the two named-record lists (dead media paths, duplicate job keys). The refusal paths are real,
tested, and named; the two report-only categories are genuinely never resolved by the importer (verified
by reading the code, not just the tests); the command surface is used exclusively for every write in the
right dependency order; and AC11's own scope boundary was respected — no live data mutated, no database
left in the repo.

Defect 1 is why I'm not clearing this for the real run as-is: it's a confirmed, direct violation of an
already-shipped, already-tested invariant ("every SQL-backed store's write functions must be named in
the guard"), not a matter of interpretation, and it is the exact failure class the task brief called out
by name from sibling #209. It costs one line in `scan.ts` to fix and re-verify — cheap to close before
this becomes the permanent shape of the codebase the real run gets executed against.

**What the Operator should specifically check in the reconciliation before saying yes, beyond the above:**

1. **The live `data/` directory needs to be quiesced at copy time.** During this review I found the live
   checkout currently carries an uncommitted, in-progress edit (a `straw-motion` `news-carousel` Asset
   for `idea-01`, dated 2026-08-14 — old work-in-progress, not a concurrent write happening during this
   review, but still uncommitted). It didn't move any of the five headline counts, but it DID move the
   absolute-path figure from 184 (this repo's last git commit) to 191 (the live working tree). The
   `191`/`61`/`54`/`66`/`8`/`12` figures the Operator is being asked to approve against are a snapshot of
   whatever is sitting in the live working tree at copy time, not the last git commit — if any other
   session (content-loop or otherwise) touches `data/brands/*/ledger.json` or `data/queue.json` between
   now and the real run, these numbers will drift and need to be re-verified immediately before the real
   run starts, ideally with no other agent/process writing to `data/` during the copy itself.
2. **Re-run the rehearsal one more time, immediately before the real run**, against a fresh copy taken at
   that moment, and confirm the reconciliation still reads exactly 61/54/66/8/12 (or reconcile any drift
   explicitly) — cheap insurance given point 1.
3. Confirm Defect 1 is fixed and `store-write-guard.test.ts` still passes before merging, so the real
   run executes against a codebase where every SQL-backed store the importer touches is actually covered
   by the write-boundary guard.

## Round-2 Build

Branch was rebased onto `main` (`f2fd6f1`) by the coordinator between Round 1 and this round; HEAD at the
start of this round was `b45c868`, on top of the rebased baseline (`npm test` 3240/847/0 fail, matching
QA's own reported figure exactly). Both defects fixed below; nothing else touched.

### Defect 1 (HIGH) — fixed: `src/run/store.ts` registered with the store-write-boundary guard

One line: `"src/run/store.ts": ["createRun"]` added to `STORE_WRITE_FUNCTIONS`
(`src/store-write-boundary/scan.ts`). `createRun`'s only real caller
(`src/command-surface/tenancy.ts`) is already under `src/command-surface/`, which
`findStoreWriteImports` exempts by construction (`isCommandSurfacePath`) — so registering the store
needed no new `allow-list.ts` entry, matching the QA-suggested fix exactly. Verified no other
non-command-surface, non-test file imports `createRun` (`grep -rn "createRun" src --include="*.ts"`,
read every hit).

Took the general rule QA named, not just the one-line fix: **the habit is "adding a store now includes
registering its write functions with the guard,"** stated explicitly here so it does not recur a third
time on this epic.

Verified: `node --import tsx --test src/store-write-boundary/*.test.ts` — 21/5/0 fail (was already
green pre-fix on the OLD map; now also correctly SEES `src/run/store.ts` and still passes).

### Defect 2 (MEDIUM) — fixed: both silent-drop paths beneath the importer now report, at the loader layer they live in

**1. `src/production-queue/store.ts`'s `parseQueueState`** had two silent-degrade branches with no
`console.warn` — the non-object top-level case QA named, plus a second, analogous one found while
fixing it (a present-but-non-array top-level `jobs` key). Both now warn, using the same
`[queue] parseQueueState: ...` style every other drop in that file already uses — purely additive (the
function's return value is byte-for-byte unchanged on every existing test; all 19 pre-existing
`store.test.ts` tests pass unmodified). `src/importer/load-queue-strict.ts`'s existing warn-capture
technique needed ZERO changes — it was already correct, it simply had nothing to capture on these two
paths before now.

**2. `src/ledger/ledger.ts`** gains `countRawIdeaRecords(path, brand?)` — reads the ledger's raw `ideas`
array LENGTH only (via the SAME `readLedgerJson` primitive `loadFullIdeas` itself calls; never a second
raw-JSON reader, never touching record content), so `planImport` can detect a record `loadFullIdeas`
silently skipped (its own existing, documented "no string id → skip" convention, shared with
`loadIdeas`) by comparing this raw count against `loadFullIdeas`'s own returned length.
`src/importer/plan.ts`'s `planBrand` now runs this comparison right after loading a Brand's Ideas and
pushes a named, refusal-worthy problem on any mismatch — **`loadFullIdeas`/`loadIdeas` themselves are
completely unchanged** (deliberate: they have other real callers today — `loadReport`, `/report`, the
live `/review-ideas` path — and this ticket's own instruction was "be careful not to break existing
callers... return the problem alongside the data rather than swallowing it." Adding a THROW or a new
return shape to `loadFullIdeas` itself would have changed a shared, already-relied-on contract for
every other caller; a comparison at the one NEW caller that needs the stronger guarantee is the
narrower, lower-risk fix, and it is exactly what QA's own suggested fix described).

Both real ledgers independently confirmed to have ZERO records dropped by this check
(`src/ledger/load-full-ideas.test.ts`'s new `"counts the real straw-motion and mundotip ledgers with
zero drops"` test) — matching QA's own live-data verification. This closes the gap defensively without
changing today's real-run numbers at all.

**Choice made explicit, as asked:** for `parseQueueState`, adding a warning was safe (purely additive,
never breaking a caller). For `loadFullIdeas`, I chose "return the problem alongside the data" —
concretely, "compute it at the ONE new call site that needs it" — over "raise inside the shared
loader," for the reason above.

### Files touched (Round 2 — additive to Round 1's list)

- `src/store-write-boundary/scan.ts` — registers `src/run/store.ts`'s `createRun`.
- `src/production-queue/store.ts` (+`.test.ts`) — `parseQueueState` now warns on both silent-degrade
  branches; 2 new tests.
- `src/ledger/ledger.ts` (+`load-full-ideas.test.ts`) — new `countRawIdeaRecords`; 4 new tests.
- `src/importer/plan.ts` (+`plan.test.ts`) — `planBrand` cross-checks the raw count and refuses on a
  mismatch; 1 new test proving the refusal end-to-end.
- `src/importer/load-queue-strict.ts` test file — 2 new tests proving the malformed-top-level-shape
  warning is now captured.
- `openspec/changes/issue-204-importer-and-rehearsals/specs/importer/spec.md` — 2 new Scenarios under
  the existing "Anything the importer cannot parse causes a refusal" Requirement.

### How to run (Round 2)

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-204-importer-and-rehearsals
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.build.json --noEmit
npm test                                        # 3249 / 848 suites / 0 fail (baseline: 3240/847/0 fail)
npm run test:docs                               # 295 / 80 suites / 0 fail (matches baseline exactly)
npx openspec validate issue-204-importer-and-rehearsals --strict
npx openspec validate --all --strict            # 60 passed, 0 failed (matches baseline exactly)
```

Just the 9 new/changed tests:
```
node --import tsx --test src/store-write-boundary/*.test.ts src/production-queue/store.test.ts \
  src/ledger/load-full-ideas.test.ts src/importer/plan.test.ts src/importer/load-queue-strict.test.ts
```

### The operational finding — folded into the Operator runbook

QA found the live `data/` directory carries uncommitted edits during the review (not a concurrent
write happening in the moment, but pre-existing, uncommitted content) — the absolute-path count moved
from 184 (this branch's own last commit) to 191 (the live working tree) purely from that, even though
none of the five headline counts moved. **This is now a recorded, explicit part of the runbook for
whoever approves AC11, not just a note in this file:**

> **Before the real run:** re-copy `data/` and re-run `npm run import-data --` ONE more time,
> immediately before the real import, against a copy taken while no other session is writing to
> `data/brands/*/ledger.json` or `data/queue.json`. Compare that fresh reconciliation against the one
> already posted on this issue. The 61/54/66/8/12/191 figures are a snapshot of whatever is in the
> working tree at copy time — not a fixed property of the repo — and can drift the moment another
> session (content-loop or otherwise) touches those files. A rehearsal from hours earlier is evidence
> about a different dataset, not a guarantee about the one the real run will actually see.

This is now stated explicitly in three places: this Round-2 Build note, and it should be the first
thing quoted back to the Operator alongside the real-run go-ahead request — `/build-issue` or whoever
carries this to the Operator should paste the blockquote above verbatim rather than re-deriving it.

### Self-review notes (Round 2)

- Considered adding the raw-count check to `loadFullIdeas` itself (a stronger, "impossible to forget"
  guarantee for any FUTURE caller too) versus only at `planBrand`'s call site. Chose the narrower fix
  per the task's own explicit instruction to avoid changing `loadFullIdeas`'s existing contract for its
  other real callers, and because `countRawIdeaRecords` is exported and reusable — a future caller that
  needs the same guarantee can adopt the identical two-line comparison without this ticket having to
  guess its exact needs (throw? return a discriminated result? a different granularity of "problem"?).
- Verified the `parseQueueState` warning fix doesn't change `loadQueue`'s return value on any existing
  path by running the full pre-existing `store.test.ts` suite unmodified alongside the 2 new tests —
  all 21 pass, including the 13 tests that predate this round.
- Re-ran the FULL suite (not just the touched files) after both fixes to confirm no unrelated regression:
  `npm test` 3249/848/0 fail.

### Known limits (unchanged from Round 1)

See Round 1's own "Known limits" section — nothing in this round changes any of those decisions. AC11
(the real import) remains Operator-gated and was NOT run in this round either; no database file, no
copy of `data/`, and no evidence of a real run exist anywhere in this branch or the worktree.

---

## QA Verdict — Round 2: PASS

Re-verified inside the same worktree, branch `issue-204-importer-and-rehearsals`, HEAD `d983654`
(previous QA HEAD `b45c868` + one commit, "Issue #204 round 2: fix both QA defects"). No product code,
test, spec, or ledger was edited. One read-only sanity check of the live checkout's `git status` (no
file contents read, no writes) confirmed the same pre-existing uncommitted work-in-progress noted in
Round 1 is still the only thing there — nothing new has drifted since.

### Suite result — actually run, actually green

| Check | Command | Result |
| --- | --- | --- |
| Type-check (app) | `npx tsc -p tsconfig.json --noEmit` | clean, no output |
| Type-check (build) | `npx tsc -p tsconfig.build.json --noEmit` | clean, no output |
| Full suite | `npm test` | **3249 / 848 suites / 0 fail** |
| Docs suite | `npm run test:docs` | **295 / 80 suites / 0 fail** (unchanged from Round 1) |
| OpenSpec, all | `npx openspec validate --all --strict` | **60 passed, 0 failed** (unchanged from Round 1) |
| OpenSpec, this change | `npx openspec validate issue-204-importer-and-rehearsals --strict` | `Change 'issue-204-importer-and-rehearsals' is valid`; header is still `## ADDED Requirements` only — no MODIFIED-section archive trap |

**The +9 tests / +1 suite delta is fully accounted for by this round's own new tests**, confirmed by
reading every diff, not just totals: `production-queue/store.test.ts` +2, `importer/load-queue-
strict.test.ts` +2, `ledger/load-full-ideas.test.ts` +4 (one new `describe` block — the +1 suite),
`importer/plan.test.ts` +1 = 9. Nothing else in the diff (`git diff --stat b45c868..d983654`, 10 files)
touches an existing test's assertions.

### Defect 1 — HIGH — registered, confirmed fixed (not just conveniently unbroken)

`src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` now carries `"src/run/store.ts":
["createRun"]`. Three independent checks, not just re-reading the diff:

1. **The guard test itself is green with the new entry present**: `node --import tsx --test
   src/store-write-boundary/*.test.ts` → 21/5/0 fail.
2. **`createRun`'s only real caller claim, verified true rather than convenient**: `grep -rn "createRun"
   src --include="*.ts" | grep -v test` shows exactly one non-command-surface, non-test file touching
   it — `src/importer/execute.ts` — and it imports `createRun` from `../command-surface/index.ts` (the
   re-export), never from `src/run/store.ts` directly. The only direct importer of `src/run/store.ts`'s
   `createRun` is `src/command-surface/tenancy.ts` itself, which `findStoreWriteImports`'s
   `isCommandSurfacePath` check exempts from scanning at the FILE level, before write-function names are
   even considered — so this registration's practical effect was never about `tenancy.ts` (already
   exempt either way); it is entirely about closing the door on a FUTURE non-command-surface caller.
3. **Proved the guard genuinely SEES the store now**, not just that the test happens to pass: ran the
   real, exported `findStoreWriteImports` (read-only, a pure function, no repo file touched or written)
   against a synthetic in-memory file — `{ path: "src/some-future-module/oops.ts", content: 'import
   { createRun } from "../run/store.ts";' }` — and it correctly returned one violation naming
   `src/run/store.ts`/`createRun`. Before this round's fix this would have returned `[]` silently
   (confirmed by the identical reasoning applied to Round 1's `STORE_WRITE_FUNCTIONS`, which had no
   entry for that module at all).

**Defect 1: FIXED.** The registration needed no `allow-list.ts` entry because it is genuinely true, not
merely convenient, that the only existing direct importer is already inside `src/command-surface/`.

### Defect 2 — MEDIUM — both sub-parts fixed; judged the cross-check-at-the-caller design as asked

**`parseQueueState`'s sibling silent-degrade branch is real.** Round 1 only named the `!isObject(raw)`
branch; reading `src/production-queue/store.ts` now confirms a second, analogous branch existed
alongside it — `const jobsRaw = Array.isArray(raw.jobs) ? raw.jobs : [];` silently treated a present-
but-non-array `jobs` key as an empty array, with no warning. Both branches now call `console.warn` with
a distinct, greppable message (`"dropping non-object top-level value..."` /
`"top-level \"jobs\" is not an array..."`). **The warnings surface exactly where a caller would see
them**: `src/importer/load-queue-strict.ts`'s existing `console.warn`-capturing technique needed zero
changes (confirmed by reading it — unchanged in this diff) and the two new tests in
`load-queue-strict.test.ts` prove both new warnings are captured through that exact path, ending in
`result.warnings.length === 1` each time — i.e. `planImport` would now refuse on either shape instead of
silently loading an empty queue. Confirmed via the full suite (19 pre-existing `store.test.ts` tests
unmodified and still green, +2 new ones) that this is purely additive.

**The ledger design call — narrowing the fix to `planBrand`, not touching `loadFullIdeas`/`loadIdeas` —
is a defensible, correctly-scoped call.** Answering the three specific questions:

1. **Does the cross-check catch every shape of silent skip the loader can perform, or only the no-id
   case?** More than just the no-id case, but not literally everything. `countRawIdeaRecords` returns
   the RAW `ideas` array's length, taken BEFORE any of `loadFullIdeas`'s own two `.filter()` calls
   (`isObject`, then `typeof r.id === "string"`) run — so a mismatch between it and `fullIdeas.length`
   fires whenever EITHER filter drops a record, not only the no-id one (a non-object entry in the
   array would also be caught). I confirmed this by reading both functions side by side, not just the
   docstring's claim. There IS one residual gap, and the developer's own new test proves it rather than
   hiding it: `"returns 0 for a ledger with no ideas array at all, never throws"` — because
   `countRawIdeaRecords` shares the IDENTICAL top-level guard (`!isObject(raw) || !Array.isArray(raw.ideas)`)
   that `loadFullIdeas` itself uses, a ledger whose `ideas` key is missing entirely, or isn't an array at
   all, makes BOTH functions silently agree at `0`/`[]` — the cross-check cannot see that one specific,
   more catastrophic shape. This is a real, narrow, low-severity residual note, not a live risk: I
   independently confirmed both real ledgers have a well-formed `ideas` array (already verified in Round
   1), and a ledger.json malformed at that level would very likely already break `loadIdeas`/`loadReport`/
   `/report` elsewhere before ever reaching the importer. Not blocking; worth a line in a future ticket
   that revisits `countRawIdeaRecords`.
2. **Is `countRawIdeaRecords` genuinely reading through the same primitive, not a second raw reader?**
   Yes — confirmed by reading the code: it calls `readLedgerJson(path, brand)`, the exact same private
   function `loadFullIdeas` calls, defined once in `src/ledger/ledger.ts`. No new `JSON.parse`/`readFile`
   call was added anywhere. This satisfies AC1.
3. **Does the refusal name the record, or only report a number mismatch?** **Only a number mismatch,
   correctly and honestly described as such.** The pushed problem reads `Brand "acme": ledger.json's raw
   ideas array has 2 record(s) but loadFullIdeas only returned 1 — at least one record was silently
   dropped (most likely one with no string id) and must be fixed in the source ledger...` — it names the
   Brand, the two counts, and a probable cause, but it cannot name the specific dropped record because,
   by construction, the record that got dropped is the one with no `id` left to name it by (no index is
   plumbed through either). This is a real, structural limitation, not an oversight — a full fix would
   require `countRawIdeaRecords` (or a sibling) to return enough of the raw array to diff against
   `fullIdeas`'s ids, which is more invasive than this round's stated scope. The new spec.md Scenario is
   honest about this too — it says "naming the Brand and the mismatch," not "naming the record," even
   though it sits under a Requirement titled "...causes a refusal naming the record." I'd call this a
   partial fit to that Requirement's title for this one Scenario specifically, but not a misrepresentation
   — the Scenario's own body doesn't overclaim.

**Ruling: both sub-parts of Defect 2 are FIXED.** The `parseQueueState` fix is complete and airtight for
its stated scope. The ledger fix is a reasonable, well-documented, correctly-narrow engineering trade-off
that closes the live-triggering gap I found in Round 1 without destabilizing `loadFullIdeas`'s other real
callers — with one honestly-surfaced, non-live-triggered residual edge case (whole-`ideas`-array
malformation) and one honestly-scoped limitation (names the Brand + count, not the specific record, since
the record has no name left). Neither residual is a new defect I'm raising for this round — both are
correctly documented in the code/tests as-is and don't threaten the real run given today's verified-clean
real data.

### The operational finding — confirmed in the runbook, unambiguous

Present, verbatim, as an explicit blockquote in this file's own "Round-2 Build → The operational finding"
section above (quoted instruction: re-copy `data/`, re-run the rehearsal immediately before the real
import, against a copy taken while no other session is writing to the ledger/queue files, and compare the
fresh reconciliation against the one already posted). It is explicitly called out as the thing to paste
verbatim to the Operator, not a footnote. I re-checked the live checkout's `git status` just now (read-
only, no file contents read) and the SAME pre-existing uncommitted edit from Round 1 is still the only
thing present — nothing has drifted further since Round 1, so the operational finding's premise still
holds exactly as stated.

### Everything else from Round 1 — re-confirmed, not re-derived from scratch (per instruction)

- **AC11 still not run**: `git status --short` in the worktree is clean; `find . -iname "*.db"` (excluding
  `node_modules`) finds nothing; no evidence of a real run anywhere in the branch.
- **No live `data/` mutated**: only read-only commands were used against the live checkout this round
  (`git status`, no file reads/writes).
- **`src/db/schema.ts`/`src/db/migrate.ts` still untouched**: `git diff main...HEAD -- src/db/schema.ts
  src/db/migrate.ts` is empty — `MIGRATION_1`/`MIGRATION_2` still byte-for-byte frozen.
- AC1–AC10, AC12 and all always-rules/Magnific-fake checks from Round 1 stand unchanged — this round's
  diff (10 files) touches only the two defect-fix areas plus the handoff and spec.md; nothing else in
  the importer, command surface, or run store changed.

### New defects found this round

None. Both Round-1 defects are fixed; the two residual notes above (whole-array-malformed ledger shape;
"names the count, not the record" for that one specific refusal) are documented as accepted, low-severity
trade-offs, not new defects — they don't threaten AC9/AC10/AC12's real numbers and the code/spec are
honest about their own limits.

### Final judgement — the Operator can safely approve the real run

**PASS. Nothing here blocks merge or bringing the Operator the reconciliation.**

Both defects from Round 1 are genuinely fixed, not just made to look fixed: Defect 1 was proven fixed by
directly exercising the guard's own detection logic against a synthetic future-violation, not just by
re-reading a green test; Defect 2 was fixed with an honest, correctly-scoped design (additive warnings at
the loader; a narrow, independently-derived cross-check at the one caller that needs it) that I verified
actually closes the gap it claims to close, including checking for and finding the one place its coverage
genuinely stops. All five ground-truth numbers (61/54/66/8/12, plus AC7's 191) stand from Round 1's
independent re-derivation — nothing in this round touched the data path, only the refusal/reporting
paths around it, and the full suite (3249/848/0 fail), docs suite, and both OpenSpec validations are all
actually green.

**What the Operator should check in the reconciliation before saying yes** (unchanged from Round 1, now
formally in the runbook — repeating here since this is the final round):

1. Re-copy `data/` and re-run the rehearsal ONE more time, immediately before the real import, against a
   copy taken while no other session is writing to `data/brands/*/ledger.json` or `data/queue.json`.
2. Compare that fresh reconciliation against the one already posted on issue #204 — confirm it still
   reads 61 Ideas / 54 Assets / 66 jobs / 8 dead media paths / 12 duplicate job keys, or explicitly
   reconcile any drift before proceeding.
3. Nothing else — the code-side gate (this QA verdict) is now clear.
