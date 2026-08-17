## Why

"Show me every Idea that used hook-type X" is impossible today: hook type lives as free prose inside 61
Brief markdown files, under two different heading spellings (`Hook concept`, `Hook Concept`). Answering
it means an agent re-reading 61 files and inventing a category scheme on the spot — a different answer
every time it is asked.

Issue #201 gave `idea.hook_type`/`idea.theme` a closed vocabulary and made them `NOT NULL`; issue #219
added an explicit `unclassified` member so the one-shot importer (#204) could populate every existing
Idea honestly without guessing. #204 has now run for real: all 61 Ideas are imported, every one
currently `unclassified` for both columns. This ticket is the classifier #219 always deferred to: it
reads the 51 Briefs that actually carry a hook heading and assigns each a real `hook_type`/`theme`,
leaving the 10 headingless MundoTip Briefs exactly as the importer already left them.

**This is a genuine classification job, not a schema detail** — assigning categories to the Operator's
own editorial work. An automated keyword classifier would be confident either way, and a library that
answers questions wrongly is worse than one that cannot answer them yet. So every one of the 51
classifications below was read and decided by hand (by the engineering agent building this slice,
working from the issue's own instruction to optimise for reviewability over throughput), never generated
by a matcher — and the Operator's own added condition applies: every classification records **how** it
was arrived at (parsed from the hook heading, or inferred from the Brief as a whole), queryable, and a
sample spread across hook types (biased toward the least-confident, `"inferred"`, ones) is surfaced for
the Operator to sanity-check in `handoff.md` before being treated as final.

The acceptance criterion that matters most: a Brief that genuinely fits no closed Hook Type or Theme is
**reported**, never forced into the nearest term. Every one of the 51 real Briefs read for this ticket
did fit — unsurprising, since the Theme vocabulary was itself calibrated against a sample of these same
real Briefs at authoring time — but the reporting mechanism is real, tested code (with synthetic data),
not a theoretical escape hatch.

## What Changes

- **A fourth, additive schema migration** (`src/db/schema.ts`'s `MIGRATION_4`) adds `idea.hook_type_source`
  and `idea.theme_source` — nullable, two-value (`'heading'` | `'inferred'`) `CHECK`-constrained columns.
  `NULL` means "no provenance recorded" (every pre-existing row, honestly); this is the queryable
  provenance field the Operator's added condition requires. Migrations 1–3 are untouched.
- **`IdeaStore` gains three new functions**: `classifyIdea` (the ONE write this backfill makes — updates
  an existing Idea's `hook_type`/`theme`/provenance, validated against the closed vocabularies and the
  provenance set before any write), `listAllIdeas` (every Idea across every Run — the backfill needs the
  whole table, not one Run's slice), and `listIdeasByHookType` (the concrete query issue #206's own
  acceptance criterion names: "a query for a single hook type returns the expected Ideas").
- **The typed command surface gains `classifyIdea`**, wrapping `IdeaStore.classifyIdea` exactly like
  every other command-surface write wraps its store. `src/store-write-boundary/scan.ts`'s
  `STORE_WRITE_FUNCTIONS` names it, so any future direct import outside the command surface fails the
  existing guard.
- **A new `src/hook-theme-backfill/` module**: `classifications.ts` (the 51 hand-read classifications,
  each keyed by the SHA-256 of its Brief's exact content — never a reconstructed file path — with a
  plain-English rationale and a `"heading"`/`"inferred"` provenance per field), `backfill.ts` (the pure
  `planBackfill` decision core: match by content hash, decide `toUpdate` / `alreadyCorrect` / `reported`
  / `noEntry`, idempotent), and `report.ts` (a Markdown report: what changed, plus final per-hook-type
  and per-theme counts across every Idea).
- **`src/commands/backfill-hook-theme.ts`** — the thin orchestration shell (`npm run
  backfill-hook-theme`): reads every Idea, plans, writes every planned update through the command
  surface's `classifyIdea`, prints the report. Re-runnable by construction — `alreadyCorrect` means a
  second run against an already-backfilled database applies zero writes and reports zero updated.

## Non-Goals (explicitly out of scope for this slice)

- **Classifying the 10 headingless MundoTip Briefs.** There is nothing to read; they stay `unclassified`
  exactly as issue #204's importer already left them — inferring a value to make a row look complete is
  precisely the failure mode this whole epic has been catching in other forms.
- **Running the real backfill against the Operator's live database.** This slice builds and tests the
  job against a real, throwaway, migrated SQLite file (`withTempDb`) and against the real Brief files on
  disk (for the classification data's own hash-matching test) — the real run against
  `data/organicgrowth.db` is a separate, Operator-gated step, mirroring #204's own "the real run stays
  Operator-gated" precedent.
- **Auto-applying a vocabulary addition from a `"reported"` Brief.** Reporting a mismatch is this
  classifier's job; deciding whether to widen a vocabulary or accept `unclassified` is the Operator's
  call (mirrors issue #219's own decision process), and moot here since no real Brief triggers it.

## Capabilities

### Modified Capabilities

- `sqlite-foundation`: a fourth migration exists (`idea.hook_type_source`/`idea.theme_source`),
  additive, `CURRENT_SCHEMA_VERSION` becomes `4`.
- `idea-store`: `classifyIdea`, `listAllIdeas`, `listIdeasByHookType` are added to the typed SQL
  boundary.
- `command-surface`: `classifyIdea` is added to the operations the typed command surface exposes.

### Added Capabilities

- `hook-theme-backfill`: the classification data, the pure planning core, the report, and the
  orchestration shell that together perform and can re-perform the backfill.

## Impact

- **New code:** `openspec/changes/issue-206-backfill-hook-theme/` (this change);
  `src/hook-theme-backfill/{classifications,backfill,report}.ts` (+`.test.ts`);
  `src/commands/backfill-hook-theme.ts` (+`.test.ts`).
- **Modified code:** `src/db/schema.ts` (+`.test.ts`), `src/db/migrate.test.ts`, `src/idea/store.ts`
  (+`.test.ts`), `src/command-surface/ideas.ts` (+`.test.ts`), `src/command-surface/index.ts`,
  `src/store-write-boundary/scan.ts` (+`.test.ts`), `package.json` (new `backfill-hook-theme` script).
- **Hermetic, no live Space or Zoho MCP calls.** Every new/changed test opens a REAL, empty, throwaway
  SQLite file per test (`withTempDb`, never `:memory:`); the one place this slice touches disk at all is
  `classifications.test.ts` reading the real, already-committed Brief markdown files under
  `data/brands/**` to prove the classification data has not drifted — no Magnific/Zoho MCP tool is
  imported or called anywhere in this slice.
- **Always-rules upheld:** `classifyIdea` is the ONLY write path this slice adds, routed through the
  typed command surface exactly like every other write (ledger-as-source-of-truth's own "state lives
  behind a store boundary" rule, extended to the not-yet-live SQL side). This slice generates nothing to
  publish, reads no private metrics, makes no relative/absolute performance comparison, and attributes
  nothing to a Post — the other four always-rules are untouched by construction.
