## Why

No file this repo has ever written carries `updated_at`, a version, or an etag — and none of the three
can be backfilled onto the real corpus after the fact. That single fact makes the migration from the
file ledgers (`data/brands/<slug>/ledger.json`, `data/queue.json`) to the SQLite foundation (issue #201,
ADR-0029) fundamentally **one shot**: there is no way to import incrementally, detect what changed since
a prior partial run, or resume. And the failure mode is not a crash — it is a **silent success that
loses data**: a laptop tool may drop a bad record with a warning; a one-shot migration doing that
silently loses a paid-for Asset with nobody noticing for months. The only thing that makes a one-shot
migration safe is making it **rehearsable**, and making every refusal loud.

Both real Brands carry genuine shape drift the schema (frozen since #201) was never asked to tolerate at
the file layer: MundoTip's 10 Ideas predate the Format concept entirely (no `format` field — current
runtime code treats that as a hard stop); Straw Motion carries three distinct Idea shapes, three ID
schemes, and four real folder layouts for where a Brief actually lives on disk. 191 ledger values are
absolute `/Users/CaxtonTaylor/...` paths, welding the record to one laptop; the store boundary
(`src/db/storage-key.ts`) already refuses an absolute path outright, so converting every one of them is
this change's own job. 12 `(brand, idea, recipe)` job-identity groups in `data/queue.json` are genuinely
ambiguous (mostly legitimate two-leg pairs from the Cast gate, two are real re-runs) and 8 legacy media
references point at files that no longer exist — both are named here explicitly, for the Operator to
decide, never resolved or silently dropped by this change.

## What Changes

- **A test-first importer** (`src/importer/`) that reads exclusively through the existing loaders and
  normalisers — `src/ledger/ledger.ts`'s `loadFullIdeas` (a new, additive read projection on the SAME
  module `loadIdeas`/`loadReport` already use, reusing the SAME `normalizeIdeaStatus` normalizer —
  never a second, raw-JSON reader), `src/format/store.ts`'s `listFormatSlugs`/`loadFormat`,
  `src/format/brief-path.ts`'s `resolveBriefPathCandidates`, `src/production-spec/brand-profile.ts`'s
  `loadZohoConfig`/`loadCopyRules`/`loadWatermarkHandle`, and `src/production-queue/store.ts`'s
  `loadQueue` (wrapped by a new `loadQueueStrict`, which turns that loader's own tolerant
  drop-with-a-`console.warn` behavior into a hard, named refusal — the ONE gap between "the existing
  loader's contract" and this ticket's own stronger "never a silent drop" bar).
- **Two-phase design.** `planImport` (`src/importer/plan.ts`) is a deep module that reads everything and
  either returns a fully-validated `ImportPlan` or a complete list of every problem found across BOTH
  Brands — it **never writes**. `executeImport` (`src/importer/execute.ts`) is a thin orchestration shell
  that takes an already-validated plan and writes it, in dependency order (Brand → Format → Run → Trend
  → Idea → Asset → Asset Media → Job), entirely through the typed command surface
  (`src/command-surface/`) — never a store directly.
- **Command-surface additions** the importer needed and #205 did not build (its own eight named runtime
  operations did not include tenancy/config creation): `createBrand`/`createFormat`/`createRun`
  (`src/command-surface/tenancy.ts`, new), `createTrend` (added to the existing `trends.ts`), and
  `getAssetByRecipe` (added to `assets.ts` — a read, needed because `saveAsset` returns `void` and the
  importer needs an Asset's real id before it can attach its media). A genuinely new, minimal `RunStore`
  (`src/run/store.ts`) backs `createRun` — no ticket before this one built one (`#223`'s own `tasks.md`
  named this gap explicitly and left it for whoever needed it first).
- **Every named refusal category is a real, tested code path**, not prose: a missing Brief file, a Trend
  reference that resolves to no label, an absolute path under a foreign root this ticket cannot safely
  relativize, a `data/queue.json` job the tolerant loader would have dropped, a queue job that does not
  resolve to any planned Asset, and a rejected Idea with no `rejection_reason` (which `rejectIdea` would
  otherwise throw on mid-execution — caught here, at planning time, instead).
- **Two report-only categories, never blocking, never resolved by this importer**: the 12 duplicate job
  identity keys and the 8 dead media paths are both carried onto the plan and the final reconciliation
  verbatim, for the Operator to decide — this change explicitly does not merge, dedupe, or null either.
- **`unclassified` for every imported Idea's `hook_type`/`theme`**, always — never inferred from the
  Brief's own `## Hook concept`/`Hook Concept` prose. Backfilling the 51 readable Briefs' real
  classification is issue #206's job (Operator decision recorded on this issue's comment thread,
  2026-08-17): a guess written here would be indistinguishable from a real classification later.
- **`## Source(s)` parsing extracts links, not lines** (`src/importer/source-urls.ts`): every
  `https?://` URL substring found anywhere in a Brief's `## Source(s)` section is kept; a bullet that is
  a pure editorial/verification note (no URL at all) is dropped — a documented decision, not a silent
  one, with no schema field to hold the note text separately and no acceptance criterion asking for one.
- **A real, evidenced Idea-status coercion**: `idea-2026-08-11-12` (a real Straw Motion record) has its
  Assets already populated at the canonical grain but a stale, retired top-level `status: "produced"` —
  `normalizeIdeaStatus` deliberately passes this through unchanged (its own existing contract). This
  change's `resolveIdeaStatus` (`src/importer/idea-status.ts`) coerces any non-canonical status to
  `accepted` exactly when Assets already exist — the only state a non-canonical status can legally mean,
  since an Idea cannot have Assets without having been accepted (CONTEXT.md "Review").
- **A real, evidenced sentinel**: two MundoTip records (`idea-09`/`idea-10`, both rejected) carry the
  literal string `"PROSPECTIVE"` as their `trend` field — idea-strategist's own documented "no peer
  evidence, brand-fit-only" convention, verbatim in both records' own `fit_basis`. Never a resolvable
  Trend id; stripped explicitly (`stripProspectiveSentinel`), not guessed.
- **A rehearsal, run and reconciled** (AC10): a full read-only copy of the live `data/` directory (813
  MB) into a scratch location, imported into a fresh SQLite database via the single command
  `npm run import-data --`. Its reconciliation — `brand=2, format=3, run=6, trend=45, idea=61,
  idea_recipe=54, asset=54, asset_media=259, job=66`, zero absolute paths surviving, 8 dead media paths,
  12 duplicate job identity keys — matches this ticket's own stated ground truth exactly and is posted
  on issue #204.
- **The real import (AC11) is explicitly out of scope for this change.** It is Operator-gated by design
  — the Operator brings the rehearsal reconciliation to the Operator first. `npm run import-data --`
  (unchanged) is the single command that will run it; only the `--checkout-root`/`--db` arguments
  differ between the rehearsal already run and the real run still to come.

## Known gaps, decided, not dropped

- **Channel, Brand Asset, Baseline Prompt, Copy Variant, and Post are NOT imported by this change.**
  Nothing in `idea`/`idea_recipe`/`asset`/`asset_media`/`job` (this change's scope) references `channel`
  as a foreign key, and none of AC1–AC12's reconciliation targets (Assets, Briefs, queue jobs) require
  them. The epic's own "7 posted Assets with a `post_url`" fact stays in the file ledger, ported by a
  later ticket — importing `post`/`copy_variant` needs a `channel` row to key against, which needs a
  scope decision (which of a Brand's several Channels) this ticket was not asked to make.
- **`fit_basis` (the free-text Fit Score rationale) has no column in the frozen schema and is not
  imported.** `idea.fit_score` (the one clean, always-numeric field) is; `relevance`/`momentum`/
  `brand_fit` stay `NULL` — no real ledger record stores these three as separate numbers, only as prose
  inside `fit_basis`, and parsing free text into three trusted floats is not asked for by any acceptance
  criterion. `MIGRATION_1`/`MIGRATION_2` (`src/db/schema.ts`) stay byte-for-byte frozen; this change adds
  no migration.
- **Recipe-local Cast/Character fields (`cast[]`, `character`) are not imported.** `src/asset/store.ts`'s
  own SQL-backed `DbAssetRecord` already narrows these out (issue #222, an EXPLICITLY open epic
  question: "does the Character Explainer Recipe survive?") — this change does not reopen that decision;
  the source `cast[].path` values are already root-relative in the real data regardless (verified), so
  nothing is lost that could not already be recovered from the untouched `ledger.json`.
- **A queue Job's `pick` field (the Operator's resolved Cast gate pick) has no column on `job`.** The
  frozen schema (issue #201/#203) reserved room for claiming (`locked_by`/`locked_until`) but not for
  this Recipe-local value. Every legacy job still imports; only this one field is not carried onto the
  SQL row — the source `data/queue.json` is untouched by this change, so it is not unrecoverable.

## Capabilities

### Added Capabilities

- `importer`: `src/importer/`'s two-phase, test-first, rehearsable one-shot migration from the file
  ledgers/queue to the SQLite foundation — reads exclusively through existing loaders/normalisers,
  refuses (never drops) anything unparseable, reports (never resolves) duplicate job identity keys and
  dead media paths, converts every absolute legacy path to a root-relative storage key, and ends every
  run with a per-entity reconciliation.

## Impact

- **New code:** `src/importer/**` (planner, executor, reconciliation, CLI, and every deep module each
  composes — see `handoff.md`'s Files Touched for the full list), `src/run/store.ts` (+`.test.ts`),
  `src/command-surface/tenancy.ts` (+`.test.ts`).
- **Modified code:** `src/ledger/ledger.ts` (additive `loadFullIdeas`, `loadIdeas`/`loadReport`
  untouched), `src/command-surface/trends.ts`/`assets.ts`/`index.ts` (additive exports),
  `src/fs-boundary/allow-list.ts` (the importer's own five `node:fs`-touching modules, individually
  audited — this IS the "read through the existing loaders" boundary itself, not a bypass of it),
  `package.json` (`import-data` script), `openspec/project.md` (the Tech-stack paragraph, corrected —
  the importer now exists and has been rehearsed; the real corpus import stays Operator-gated).
- **Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (no new migration), every store
  built by #201/#222/#223/#203, `data/brands/*/ledger.json` and `data/queue.json` (read-only throughout
  — the rehearsal ran against a COPY; the real files are untouched by this change).
- **Hermetic.** No `magnific`/Zoho MCP tool is imported or called anywhere in this change — the importer
  never goes near `src/space-driver/`/`src/producer/`. Every test opens a real, throwaway SQLite file
  (`withTempDb`, never `:memory:`). The rehearsal read a COPY of `data/`, never the live checkout, and
  wrote only to a scratch database file outside the repo.
- **Always-rules upheld:** generate-never-publish/public-metrics-only/relative-not-absolute are
  untouched by construction (no content-generation or publication code here). Explicit-attribution is
  preserved: a Post is not imported by this change at all (see Known gaps), so no attribution can be
  mis-keyed. Ledger-as-source-of-truth is explicitly preserved during this change:
  `data/brands/*/ledger.json`/`data/queue.json` stay the one thing every real production command
  actually reads/writes; the SQLite database this change populates is additive infrastructure until a
  later ticket rewires a real caller onto it (mirrors #222/#223's own stated position).
