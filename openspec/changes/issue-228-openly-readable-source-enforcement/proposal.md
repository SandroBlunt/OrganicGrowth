## Why

Issue #223 built `IdeaStore.createIdea` and, in the same slice, made a considered non-decision (recorded
in its own "Known gaps, decided, not dropped" section): `createIdea` does NOT block/refuse a paywalled
Trend. That reasoning still holds for the constraint it actually ruled out — refusing an Idea merely
because its `trendId` points at a paywalled Trend, which would break the intended workflow (an Idea
legitimately citing a paywalled Trend as a momentum signal while carrying its own openly readable
source). But #223's AC4 asked for something narrower and more specific than that non-decision covers:
"a Trend records ... an `is_paywalled` flag, so the openly-readable-source rule is enforced by data
rather than by prose." What #223 shipped — `TrendStore.listBriefableTrends`, a plain `WHERE is_paywalled
= 0` read — makes the fact QUERYABLE, but enforces nothing: nothing is obliged to call it. A view an
agent has to remember to use is still prose-shaped enforcement, exactly as brittle as the rule living
only in `.claude/agents/idea-strategist.md`'s prose (which is what actually happened once already — a
live Idea, idea-03 of the first daily Run, was rejected at Review for paywall-only sourcing, which is
why the rule was written down at all, 2026-08-11).

This issue builds the actual store-boundary gate: reject at `createIdea` when an Idea's `trendId` points
at a paywalled Trend AND the Idea's own `sourceUrls` is empty — the genuinely unbriefable case — while
continuing to accept an Idea that cites a paywalled Trend as a momentum signal but carries its own
openly readable source. It also closes two test-coverage gaps QA logged against #223 (both already
functionally correct — missing tests, not defects), and pins the rule's prose in
`.claude/agents/idea-strategist.md` to the store's real behavior with a docs-test, so the two cannot
silently drift apart the way `listBriefableTrends` already did once.

## What Changes

- **`createIdea` (`src/idea/store.ts`) gains one new store-boundary validation**, run alongside the
  existing `hookType`/`theme` checks, before the `INSERT` is ever issued: when `input.trendId` is given
  and the database holds a committed Trend for it with `isPaywalled: true`, AND `input.sourceUrls` is
  omitted or `[]`, `createIdea` throws the store's EXISTING `IdeaValidationError` — never a new error
  type. An unset `trendId`, an unknown `trendId` (left to the schema's own FOREIGN KEY, matching the
  existing not-pre-validated convention for `runId`/`brandId`/`formatId`), a non-paywalled Trend, or any
  Idea carrying at least one `sourceUrls` entry of its own is NEVER blocked by this rule.
- **Two test-coverage gaps closed, both proven functionally correct already, not defects:**
  `src/trend/store.test.ts` gains the platform-CHECK rejection test #223's own `tasks.md` claimed (item
  2.1) but never actually wrote; `src/idea/store.test.ts` gains the cross-case accept/reject
  already-decided guard tests — accepting an already-REJECTED Idea, and rejecting an already-ACCEPTED
  one (the existing tests only proved the same-state repeat: accept-then-accept, reject-then-reject).
- **`.claude/agents/idea-strategist.md`'s existing openly-readable-source rule** (step 6, lines ~69-79,
  unchanged verbatim) gains one new sentence, appended after its existing text, citing the concrete
  store-boundary enforcement this issue adds (`createIdea`, `IdeaValidationError`, `src/idea/store.ts`,
  issue #228) — so an agent (or a future reader) sees this is no longer prose alone to remember.
- **A new docs-test** (`src/idea/openly-readable-source-rule.docs-test.ts`) pins the doc's wording to the
  store's real behavior. It deliberately does NOT pin a whole free-prose sentence (which would rot the
  first time someone rewords it, per this repo's own established `producer-agent.docs-test.ts`
  registry-backed pattern) — instead it anchors on stable, code-level identifiers the doc must keep
  citing (`createIdea`/`IdeaValidationError`/`src/idea/store.ts`) plus the rule's own historical
  precedent citation ("idea-03", "2026-08-11", a factual reference far less prone to casual rewording
  than descriptive prose), and separately calls the REAL `createIdea` against a real, throwaway SQLite
  database (`withTempDb`, never `:memory:`) to prove both the rejection and the acceptance case the doc
  describes.

## Non-Goals (explicitly out of scope for this slice)

- **Blocking an Idea whose linked Trend is merely paywalled.** Explicitly the WRONG constraint (see
  "Why") — never built here.
- **No schema change.** `MIGRATION_1`/`MIGRATION_2` (`src/db/schema.ts`) stay byte-for-byte frozen; this
  rule needs no new column, CHECK, or migration — it reads the already-existing `trend.is_paywalled`
  flag `createTrend` already writes (#223) via the already-existing `TrendStore.getTrend`.
- **No change to `TrendStore`.** `listBriefableTrends` is untouched; this issue adds enforcement at
  `IdeaStore`'s own boundary, not a second read-side helper.
- **No production caller wired.** `src/ledger/ledger.ts` stays canonical; `IdeaStore`/`TrendStore` remain
  unused by any real command until issue #204's importer, unchanged by this slice.

## Capabilities

### Modified Capabilities

- `idea-store`: `createIdea` gains the openly-readable-source store-boundary validation.
- `trend-store`: gains the documented (previously undocumented) platform-CHECK-rejection Requirement,
  proven by a real test.
- `idea-strategist-briefs`: the openly-readable-source rule's prose is now pinned to `IdeaStore`'s real
  enforcement by a docs-test.

## Impact

- **New code:** `src/idea/openly-readable-source-rule.docs-test.ts`,
  `openspec/changes/issue-228-openly-readable-source-enforcement/` (this change).
- **Modified code:** `src/idea/store.ts` (+`.test.ts`), `src/trend/store.test.ts`,
  `.claude/agents/idea-strategist.md`.
- **Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (no new migration),
  `src/trend/store.ts` (no behavior change — only its already-shipped `is_paywalled` field/`getTrend`
  read are reused), `src/ledger/ledger.ts` and every real production caller, `src/production-queue/**`
  (issue #203, a sibling in-flight slice — untouched), `docs/adr/0029` (issue #226, another sibling
  in-flight slice — untouched).
- **Hermetic, no live Space or Zoho MCP calls.** Every new/changed test opens a REAL, empty, throwaway
  SQLite file per test (`src/db/test-support.ts`'s `withTempDb`, never `:memory:`), mirroring #223's own
  Testing Decisions. No `magnific`/Zoho MCP tool is imported or called by anything this slice touches.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics code —
  generate-never-publish/public-metrics-only/relative-not-absolute/explicit-attribution are untouched by
  construction. Ledger-as-source-of-truth is preserved: `ledger.json` stays canonical; `IdeaStore` is
  additive and unused by any real command until #204.
