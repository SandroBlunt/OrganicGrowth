## 1. Scope audit — before writing any code

- [x] 1.1 Read #222's own `proposal.md`/`handoff.md` (archived) and confirm the `{ db }` option shape,
  the `withTransaction` helper, and the genuinely-new-store convention (plain `db: DatabaseSync` first
  positional arg — no options-object bridge needed, since there is no pre-existing Idea/Trend
  `{ ledgerPath }` API to keep compiling).
- [x] 1.2 Grep the tracked issue list (#197–#212) for any other ticket naming a "Trend store" — none
  found; conclude a minimal `TrendStore` belongs in this ticket, scoped to exactly what #202's AC4 and
  `IdeaStore`'s own tests need (`createTrend`/`getTrend`/`listTrendsForRun`/`listBriefableTrends`), not a
  general-purpose store.
- [x] 1.3 Read `src/db/schema.ts`'s `idea`/`idea_recipe`/`trend` DDL (frozen from #201) end-to-end; confirm
  no `CHECK` exists on `fit_score`/`relevance`/`momentum`/`brand_fit` (so no range validation is added —
  would need a new migration, not asked for) and that `idea.trend_id` is nullable (so `TrendStore`/
  `IdeaStore` never force a Trend to exist).
- [x] 1.4 Confirm `src/vocabulary/hook-type.ts`/`theme.ts` already export `isHookType`/`isTheme` — the
  exact store-boundary validators this ticket's AC asks for; reuse them rather than re-deriving a second
  Set from `HOOK_TYPES`/`THEMES`.

## 2. TrendStore (test-first, { db }-only)

- [x] 2.1 Write failing tests (`src/trend/store.test.ts`): `createTrend` with only the required fields
  defaults `sourceUrls` to `[]`, `isPaywalled` to `false`, and leaves `momentum`/`platform` absent;
  `createTrend` stores every optional field when given; an unknown `runId` is rejected (FOREIGN KEY); an
  out-of-`KNOWN_PLATFORMS` `platform` is rejected (CHECK); `getTrend` null-for-unknown; `listTrendsForRun`
  orders by `momentum DESC` (a momentum-less Trend sorts last) and is scoped to its own Run;
  `listBriefableTrends` returns only `isPaywalled: false` rows, `[]` when every Trend for a Run is
  paywalled.
- [x] 2.2 Implement `src/trend/store.ts`.

## 3. IdeaStore — creation + reads (test-first)

- [x] 3.1 Write failing tests (`src/idea/store.test.ts`): `createIdea` with only the required fields
  (`runId`, `brandId`, `formatId`, `title`, `brief`, `hookType`, `theme`) defaults `sourceUrls` to `[]`,
  leaves `trendId`/`fitScore`/`relevance`/`momentum`/`brandFit`/`rejectionReason` absent, and always
  starts at `status: 'suggested'`; `createIdea` stores every optional field (including a real `trendId`)
  when given; an out-of-vocabulary `hookType` throws `IdeaValidationError` BEFORE any row is written,
  naming every legal value, for BOTH `hookType` and `theme` independently; `unclassified` is accepted for
  both, like any other closed-vocabulary member; an unknown `runId`/`brandId`/`formatId` is rejected
  (FOREIGN KEY, not pre-validated — mirrors the existing FK-bubbling convention). `getIdea` null-for-
  unknown. `listIdeasForRun` returns every Idea for a Run in creation order, `[]` for a Run with none.
- [x] 3.2 Implement `createIdea`/`getIdea`/`listIdeasForRun` in `src/idea/store.ts`.

## 4. IdeaStore — Review: acceptIdea / rejectIdea (test-first)

- [x] 4.1 Write failing tests: `acceptIdea` moves a `suggested` Idea to `accepted`, changing nothing
  else; `acceptIdea` throws (naming the Idea and its current status), changing nothing, for an Idea that
  is already `accepted` or `rejected`, and for an unknown `ideaId`; `rejectIdea` moves a `suggested` Idea
  to `rejected` and records `rejectionReason` verbatim; `rejectIdea` throws `IdeaValidationError` for a
  blank/whitespace-only `rejectionReason` BEFORE touching the row; `rejectIdea` throws (same
  already-decided/unknown guards as `acceptIdea`), changing nothing.
- [x] 4.2 Implement `acceptIdea`/`rejectIdea`.

## 5. IdeaStore — Recipe selection: selectIdeaRecipes / listIdeaRecipes (test-first)

- [x] 5.1 Write failing tests: `selectIdeaRecipes` writes one `idea_recipe` row per offered item
  (`chosen: true` with no `declineReason`, `chosen: false` with a `declineReason`), all inside ONE
  transaction; calling it again for the SAME `(idea, recipe)` UPDATES in place, never duplicating
  (`UNIQUE (idea_id, recipe_slug)`); a `chosen: false` item with a blank/absent `declineReason` throws
  `IdeaValidationError` for the WHOLE call BEFORE any row is written (pre-check, not a DB round-trip); an
  unwired `recipe_slug` inside an otherwise-valid batch throws a FOREIGN KEY error and leaves NOTHING
  behind — not even the earlier, individually-valid items in the same batch (the transaction-atomicity
  proof this ticket's own AC names). `listIdeaRecipes` reads every offered row back, in write order.
- [x] 5.2 Implement `selectIdeaRecipes`/`listIdeaRecipes`, wrapping the batch in `withTransaction`
  (`src/db/transaction.ts`, #222) — reused unchanged, never a second BEGIN/COMMIT pattern.

## 6. Docs accuracy: rule 7, its docs-test, and the stale project.md

- [x] 6.1 Update `.claude/rules/always/organicgrowth-rules.md`'s rule 7: add "Idea" to the list of
  `{ db }`-backed stores, and correct the forward-pointer to name #204 (the one-shot importer) as the
  next thing that actually wires a real production caller onto SQL — `ledger.json` still stays canonical
  until then.
- [x] 6.2 Update `src/db/adr.docs-test.ts`'s Rule 7 assertions to match the corrected wording (add an
  assertion the doc now names Idea, alongside the existing checks).
- [x] 6.3 Correct `openspec/project.md`'s stale "Tech stack" paragraph (unedited since #201, verified by
  `git log -- openspec/project.md`) — it still claims the SQLite foundation backs no store at all, false
  since #222 merged.
- [x] 6.4 Add two small, ADR/issue-cited CONTEXT.md clarifications (no new terms, no vocabulary change):
  Fit Score's entry gains one sentence naming its three recorded explanatory components
  (`relevance`/`momentum`/`brand_fit`); Trend's entry gains one sentence naming the `is_paywalled` data
  fact. Both cite this issue; neither touches the closed-vocabulary bullet lists `context-md.docs-test.ts`
  already pins.

## 7. OpenSpec + full-suite green + self-review + Build Report

- [x] 7.1 Author spec deltas: `specs/idea-store` (ADDED), `specs/trend-store` (ADDED). Run
  `openspec validate --strict` until green.
- [x] 7.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 2956/753/0-fail
  baseline.
- [x] 7.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #223
  acceptance criterion maps to a specific test.
- [x] 7.4 Write the Build Report into `handoff.md`.
