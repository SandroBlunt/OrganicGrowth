## 1. Ground the constraint before writing any code

- [x] 1.1 Read `.claude/agents/idea-strategist.md:69-74` (the rule's live wording) and #223's own
  "Known gaps, decided, not dropped" section (its stated non-decision: `createIdea` does NOT block on a
  paywalled `trendId` alone) — confirm this issue REFINES that non-decision (adds the narrower,
  own-`sourceUrls`-empty gate #223's AC4 actually asked for), never reverses it.
- [x] 1.2 Confirm the wrong constraint in explicit terms: do NOT block an Idea whose `trendId` points at
  a paywalled Trend when the Idea carries its own `sourceUrls`. Write the "accepts" test FIRST (the case
  a naive implementation breaks), before the "rejects" test.
- [x] 1.3 Confirm no schema change is needed: `trend.is_paywalled` already exists (#223,
  `src/db/schema.ts`, `MIGRATION_1`, frozen); the rule reads it via the already-existing
  `TrendStore.getTrend`.

## 2. IdeaStore — the openly-readable-source rule (test-first)

- [x] 2.1 Write failing tests (`src/idea/store.test.ts`): `createIdea` ACCEPTS a paywalled `trendId`
  when the Idea carries its own `sourceUrls` (written first); `createIdea` REJECTS a paywalled `trendId`
  when `sourceUrls` is omitted, raising `IdeaValidationError` BEFORE any write (`listIdeasForRun` stays
  `[]`); same rejection for an explicit `sourceUrls: []`; `createIdea` NEVER blocks on a non-paywalled
  `trendId` even with no `sourceUrls`; `createIdea` NEVER blocks when `trendId` is omitted entirely.
- [x] 2.2 Implement `assertOpenlyReadableSource` in `src/idea/store.ts`, called from `createIdea`
  alongside the existing `assertValidHookType`/`assertValidTheme` calls, before the `INSERT`. Reuses
  `TrendStore.getTrend` (`src/trend/store.ts`) — no new module, no schema change. An unknown `trendId`
  (no committed Trend row) is left for the schema's own FOREIGN KEY, matching the existing
  not-pre-validated convention for `runId`/`brandId`/`formatId`.
- [x] 2.3 Update `src/idea/store.ts`'s own module/function doc comments to describe the new validation
  and why the check needs one read (`getTrend`) even though "before any write" still holds.

## 3. Two QA-logged coverage gaps (test-only, both already functionally correct)

- [x] 3.1 `src/trend/store.test.ts`: add the platform-CHECK rejection test #223's `tasks.md` item 2.1
  claimed was written but was not. Mirrors `src/channel/store.test.ts`'s existing
  "rejects a platform outside KNOWN_PLATFORMS" test.
- [x] 3.2 `src/idea/store.test.ts`: add the cross-case accept/reject already-decided guard tests —
  `acceptIdea` throws for an already-REJECTED Idea (not just already-accepted); `rejectIdea` throws for
  an already-ACCEPTED Idea (not just already-rejected).

## 4. Doc + docs-test: pin idea-strategist.md's rule to IdeaStore's real behavior

- [x] 4.1 Append one new sentence to `.claude/agents/idea-strategist.md`'s existing openly-readable-
  source rule (step 6) citing the concrete enforcement (`createIdea`, `IdeaValidationError`,
  `src/idea/store.ts`, issue #228) and restating the right-way-round constraint (never merely because
  the linked Trend is paywalled). The pre-existing lines 69-74 (the issue's own citation) are left
  verbatim, unedited.
- [x] 4.2 Write `src/idea/openly-readable-source-rule.docs-test.ts`: pins the doc against STABLE,
  code-level anchors (function/error/module names it must cite, plus its historical "idea-03"/
  "2026-08-11" precedent citation) rather than a whole free-prose sentence, and separately calls the
  REAL `createIdea` against a real, throwaway SQLite database to prove the rejection AND the acceptance
  case the doc describes.

## 5. OpenSpec + full-suite green + self-review + Build Report

- [x] 5.1 Author spec deltas: `specs/idea-store` (MODIFIED — ADDED Requirement), `specs/trend-store`
  (MODIFIED — ADDED Requirement), `specs/idea-strategist-briefs` (MODIFIED — ADDED Requirement). Run
  `openspec validate --strict` until green.
- [x] 5.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 2987/762/0-fail
  baseline.
- [x] 5.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #228
  acceptance criterion maps to a specific test.
- [x] 5.4 Write the Build Report into `handoff.md`.
