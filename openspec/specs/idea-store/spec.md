# idea-store Specification

## Purpose
TBD - created by archiving change issue-223-ideastore. Update Purpose after archive.
## Requirements
### Requirement: IdeaStore is the typed SQL boundary for idea creation, genuinely new

`src/idea/store.ts`'s `createIdea` SHALL be the typed write boundary for the `idea` table, taking an
already-open, already-migrated `DatabaseSync` as a plain positional argument (`{ db }`-only, mirroring
`src/brand/store.ts`/`src/channel/store.ts`/`src/copy/store.ts` — genuinely new, no pre-existing
`{ ledgerPath }`-taking "Idea store" to bridge via an overload). `createIdea` SHALL default
`sourceUrls` to `[]` when omitted, leave `trendId`/`fitScore`/`relevance`/`momentum`/`brandFit` absent
(never a fabricated `0`/`null` masquerading as a real value) when omitted, and SHALL always create the
row at `status: 'suggested'` — an Idea is never created already `accepted`/`rejected` (CONTEXT.md
"Idea"/"Review": trend-scout and idea-strategist only ever produce SUGGESTED Ideas; the transition to
`accepted`/`rejected` happens at Review, a separate operation).

#### Scenario: createIdea with only the required fields defaults the optional ones

- **GIVEN** an `IdeaInput` carrying only `runId`, `brandId`, `formatId`, `title`, `brief`, `hookType`,
  and `theme`
- **WHEN** `createIdea` is called, then the row is read back by `getIdea`
- **THEN** `status` is `"suggested"`, `sourceUrls` is `[]`, and `trendId`/`fitScore`/`relevance`/
  `momentum`/`brandFit`/`rejectionReason` are all absent from the returned record

#### Scenario: createIdea stores every optional field when given

- **GIVEN** an `IdeaInput` carrying a real `trendId` (a Trend already committed for the same Run) plus
  `sourceUrls`, `fitScore`, `relevance`, `momentum`, and `brandFit`
- **WHEN** `createIdea` is called, then the row is read back by `getIdea`
- **THEN** every one of those fields round-trips verbatim

#### Scenario: an unknown runId/brandId/formatId is rejected by the schema's own foreign keys

- **GIVEN** an `IdeaInput` naming a `runId` (or `brandId`, or `formatId`) with no committed row
- **WHEN** `createIdea` is called
- **THEN** it throws a foreign-key error, and no `idea` row is created

### Requirement: hook_type and theme are required and validated against the closed vocabularies at the store boundary

`createIdea` SHALL treat `hookType` and `theme` as REQUIRED — not nullable conveniences — and SHALL
validate each against `src/vocabulary/hook-type.ts`'s `isHookType`/`src/vocabulary/theme.ts`'s `isTheme`
BEFORE issuing any SQL, throwing a new `IdeaValidationError` (naming the invalid value and listing every
legal member of the closed set) rather than surfacing SQLite's own raw FOREIGN KEY error for this
specific pair of columns. The explicit `unclassified` member (issue #219) SHALL be accepted exactly like
any other closed-vocabulary member — this store validates ONLY "is this one of the closed set", never
"is this a real, classified value" (that stronger judgment belongs to the classifier, issue #206, never
to this store).

#### Scenario: an out-of-vocabulary hookType is rejected before any write

- **GIVEN** an `IdeaInput` with `hookType: "not_a_real_hook_type"` and an otherwise-valid `theme`
- **WHEN** `createIdea` is called
- **THEN** it throws `IdeaValidationError` naming `"not_a_real_hook_type"` and listing the eleven legal
  Hook Type values, and no `idea` row is created

#### Scenario: an out-of-vocabulary theme is rejected before any write

- **GIVEN** an `IdeaInput` with `theme: "not_a_real_theme"` and an otherwise-valid `hookType`
- **WHEN** `createIdea` is called
- **THEN** it throws `IdeaValidationError` naming `"not_a_real_theme"` and listing the ten legal Theme
  values, and no `idea` row is created

#### Scenario: unclassified is accepted for both hookType and theme

- **GIVEN** an `IdeaInput` with `hookType: "unclassified"` and `theme: "unclassified"`
- **WHEN** `createIdea` is called
- **THEN** the Idea is created successfully, with both fields stored verbatim as `"unclassified"`

### Requirement: Idea lookups are null-for-unknown/empty-for-none, never a throw

`getIdea` SHALL return `null` for an id with no committed Idea — never throw. `listIdeasForRun` SHALL
return every Idea for a Run, in creation order, and `[]` for a Run with none (or an unknown Run).

#### Scenario: getIdea returns null for an unknown id

- **GIVEN** an empty database
- **WHEN** `getIdea` is called with any id
- **THEN** it returns `null`

#### Scenario: listIdeasForRun returns [] for a Run with no Ideas yet

- **GIVEN** a committed Run with zero Ideas
- **WHEN** `listIdeasForRun` is called with that Run's id
- **THEN** it returns `[]`

#### Scenario: listIdeasForRun returns every Idea for a Run in creation order

- **GIVEN** a Run with two Ideas created in sequence, A then B
- **WHEN** `listIdeasForRun` is called with that Run's id
- **THEN** the returned array is ordered `[A, B]`

### Requirement: acceptIdea and rejectIdea are the two Review outcomes, each guarding the suggested-only precondition

`acceptIdea` SHALL move a `suggested` Idea to `accepted`; `rejectIdea` SHALL move a `suggested` Idea to
`rejected` and record a REQUIRED, non-blank `rejectionReason` verbatim (CONTEXT.md "Rejection Reason":
always captured at Review, logged verbatim — never optional, never silently blank). Both SHALL throw a
clear error naming the Idea and its current status, changing nothing, when called on an Idea that is
NOT currently `suggested` (already decided once, by either path) or on an unknown `ideaId`.
`rejectIdea` SHALL throw `IdeaValidationError` for a blank/whitespace-only `rejectionReason` BEFORE
touching the row at all — even before checking the Idea's current status.

#### Scenario: acceptIdea moves a suggested Idea to accepted

- **GIVEN** an Idea at `status: 'suggested'`
- **WHEN** `acceptIdea` is called with its id
- **THEN** `getIdea` returns `status: 'accepted'`, every other field unchanged

#### Scenario: acceptIdea throws, changing nothing, for an already-decided Idea

- **GIVEN** an Idea already `accepted` (or already `rejected`)
- **WHEN** `acceptIdea` is called again with its id
- **THEN** it throws, naming the Idea and its current status, and `getIdea` still returns the SAME
  status as before the call

#### Scenario: rejectIdea moves a suggested Idea to rejected and records the reason verbatim

- **GIVEN** an Idea at `status: 'suggested'`
- **WHEN** `rejectIdea` is called with `rejectionReason: "Too close to last week's Idea 04"`
- **THEN** `getIdea` returns `status: 'rejected'` and `rejectionReason: "Too close to last week's Idea
  04"` verbatim

#### Scenario: rejectIdea rejects a blank rejectionReason before touching the row

- **GIVEN** an Idea at `status: 'suggested'`
- **WHEN** `rejectIdea` is called with `rejectionReason: "   "` (whitespace only)
- **THEN** it throws `IdeaValidationError`, and `getIdea` still returns `status: 'suggested'`

### Requirement: selectIdeaRecipes records every offered Recipe — chosen or declined-with-reason — atomically

`selectIdeaRecipes` SHALL write one `idea_recipe` row per item in the given selection — every Recipe
OFFERED at Review, whether the Operator kept it (`chosen: true`) or declined it (`chosen: false`, with a
REQUIRED, non-blank `declineReason` — the Recipe-level sibling of an Idea's own Rejection Reason) —
inside ONE transaction (`withTransaction`, issue #222). A `chosen: false` item with a blank/absent
`declineReason` SHALL be rejected for the WHOLE call, BEFORE any row is written (a pre-check, not a
partial DB round-trip). Calling `selectIdeaRecipes` again for the SAME `(idea, recipe)` pair SHALL
UPDATE that row in place — never duplicate it — mirroring `upsertCopyVariant`'s own keyed-upsert
convention (issue #222) against the schema's own `UNIQUE (idea_id, recipe_slug)`. An unwired
`recipe_slug` SHALL be rejected by the schema's own FOREIGN KEY into `recipe_vocabulary` (the SAME
registry-trusted convention `AssetStore`'s `{ db }` branch already uses, issue #222) — and, when it
occurs partway through a multi-item batch, SHALL roll back the WHOLE batch, including items that
individually would have succeeded. `listIdeaRecipes` SHALL read every offered-Recipe row for one Idea
back.

#### Scenario: selectIdeaRecipes writes one row per offered item, chosen and declined together

- **GIVEN** an Idea and two wired Recipe slugs
- **WHEN** `selectIdeaRecipes` is called with `[{ recipe: "news-carousel", chosen: true }, { recipe:
  "news-short-script", chosen: false, declineReason: "Not enough footage this week" }]`
- **THEN** `listIdeaRecipes` returns two rows: `news-carousel` with `chosen: true` and no
  `declineReason`, `news-short-script` with `chosen: false` and `declineReason: "Not enough footage this
  week"`

#### Scenario: calling selectIdeaRecipes again for the same (idea, recipe) updates in place

- **GIVEN** an Idea with `news-carousel` already recorded as `chosen: false` (declined)
- **WHEN** `selectIdeaRecipes` is called again with `[{ recipe: "news-carousel", chosen: true }]`
- **THEN** `listIdeaRecipes` still returns exactly ONE row for `news-carousel`, now `chosen: true` with
  no `declineReason`

#### Scenario: a declined item with no declineReason is rejected before any row is written

- **GIVEN** an Idea and a selection `[{ recipe: "news-carousel", chosen: true }, { recipe:
  "news-short-script", chosen: false }]` (the second item has NO `declineReason`)
- **WHEN** `selectIdeaRecipes` is called with that selection
- **THEN** it throws `IdeaValidationError`, and `listIdeaRecipes` returns `[]` — not even the first,
  individually-valid item survives

#### Scenario: an unwired recipe_slug inside an otherwise-valid batch rolls back the whole batch

- **GIVEN** an Idea and a selection where the FIRST item names a real, wired Recipe and the SECOND names
  an unwired slug (`"not-a-real-recipe"`)
- **WHEN** `selectIdeaRecipes` is called with that selection
- **THEN** it throws a foreign-key error, and `listIdeaRecipes` returns `[]` — the first item's row does
  NOT survive even though it would individually have succeeded

#### Scenario: listIdeaRecipes returns [] for an Idea with no Recipe selection yet

- **GIVEN** an Idea that has never had `selectIdeaRecipes` called for it
- **WHEN** `listIdeaRecipes` is called with that Idea's id
- **THEN** it returns `[]`

### Requirement: createIdea enforces the openly-readable-source rule at the store boundary, not merely by agent memory

`createIdea` SHALL reject an `IdeaInput` whose `trendId` points at a Trend committed with
`isPaywalled: true` when the Idea's OWN `sourceUrls` holds no non-blank entry (omitted, `[]`, or every
entry blank/whitespace-only after trimming), raising the store's EXISTING `IdeaValidationError` — never
a new error type — before the `INSERT` is issued. This is the Operator rule already documented as prose
in `.claude/agents/idea-strategist.md` (step 6, lines ~69-79, 2026-08-11 — idea-03 of the first daily
Run was rejected exactly for this): a paywalled feed item (FT, NYT, WIRED) is a momentum signal, never a
citation on its own — a story needs a source a human could actually open before it can be briefed. Issue
#223 made the paywalled-visibility fact QUERYABLE (`TrendStore.listBriefableTrends`) but enforced
nothing; this Requirement is the actual store-boundary gate #223's own AC4 asked for.

A blank (`""`) or whitespace-only (`"   "`) `sourceUrls` entry SHALL be treated as ABSENT, never as
satisfying the rule (QA round-1 finding on this Requirement: the rule is "there is a source a human
could actually open," not merely "the array is non-empty"). `createIdea` SHALL NOT additionally require
a non-blank entry be URL-shaped (no scheme/format check) — a review of the real Briefs under every
Brand's `ideas` directory found the "## Source(s)" section legitimately carries non-URL editorial and
verification notes alongside clean links, and no other `{ db }` store in this codebase validates URL
format/content; inventing that check here, ahead of issue #204's importer (the thing that will actually
populate `sourceUrls` from real data) and unasked by any acceptance criterion, is explicitly out of
scope for this Requirement.

This Requirement SHALL NOT block an Idea merely because its `trendId` is paywalled: an Idea legitimately
citing a paywalled Trend as a momentum signal, while carrying at least one non-blank `sourceUrls` entry
of its own, SHALL be accepted — that is the intended workflow, never a loophole. An Idea whose `trendId`
is omitted, or whose `trendId` points at a Trend that is NOT paywalled, SHALL NEVER be rejected by this
rule regardless of `sourceUrls`. An Idea whose `trendId` names no committed Trend row SHALL NOT be
rejected by this rule either — that case is left to the schema's own FOREIGN KEY, mirroring `createIdea`'s
existing not-pre-validated convention for `runId`/`brandId`/`formatId`.

#### Scenario: createIdea accepts a paywalled trendId when the Idea carries its own sourceUrls (the case a naive implementation breaks)

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and
  `sourceUrls: ["https://an-open-source.example/article"]`
- **THEN** the Idea is created successfully, `trendId` and `sourceUrls` both stored verbatim

#### Scenario: createIdea rejects a paywalled trendId when the Idea's own sourceUrls is empty

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and `sourceUrls` omitted (or `[]`)
- **THEN** it throws `IdeaValidationError`, and no `idea` row is created

#### Scenario: createIdea rejects a paywalled trendId when every sourceUrls entry is blank or whitespace-only

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and `sourceUrls: [""]` (or
  `["   "]`, or `["", "   ", ""]`)
- **THEN** it throws `IdeaValidationError`, and no `idea` row is created — a blank/whitespace-only entry
  is treated exactly as if `sourceUrls` were empty

#### Scenario: createIdea accepts a paywalled trendId when sourceUrls mixes one blank entry with one real entry

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and
  `sourceUrls: ["   ", "https://an-open-source.example/article"]`
- **THEN** the Idea is created successfully — only ONE non-blank entry is required, and blank entries
  elsewhere in the array do not cancel it out

#### Scenario: createIdea never blocks on a non-paywalled trendId, even with no sourceUrls

- **GIVEN** a Trend committed with `isPaywalled: false`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and `sourceUrls` omitted
- **THEN** the Idea is created successfully — this rule is about the Idea's OWN sources, never the
  Trend's paywall status alone

#### Scenario: createIdea never blocks when trendId is omitted entirely

- **GIVEN** an `IdeaInput` with no `trendId` at all
- **WHEN** `createIdea` is called, regardless of `sourceUrls`
- **THEN** the Idea is created successfully

#### Scenario: createIdea never pre-validates a dangling trendId — it falls through to the schema's own FOREIGN KEY

- **GIVEN** a `trendId` naming no committed Trend row
- **WHEN** `createIdea` is called with that `trendId`
- **THEN** it throws a foreign-key error (never `IdeaValidationError`) — this rule is deliberately NOT
  pre-validated, mirroring `createIdea`'s existing not-pre-validated convention for
  `runId`/`brandId`/`formatId`

### Requirement: classifyIdea updates an existing Idea's hook_type/theme plus their provenance, validated before any write

`src/idea/store.ts`'s `classifyIdea(db, ideaId, { hookType, theme, hookTypeSource, themeSource })` SHALL
be the ONLY sanctioned way to change an already-created Idea's `hook_type`/`theme` after `createIdea` —
the Hook Type / Theme backfill classifier (issue #206) SHALL make no other write. It SHALL validate
`hookType`/`theme` against the closed vocabularies (`assertValidHookType`/`assertValidTheme`, the SAME
checks `createIdea` already runs) and `hookTypeSource`/`themeSource` against the two-value provenance set
(`'heading'` | `'inferred'`), throwing `IdeaValidationError` naming the invalid value BEFORE any SQL
runs. It SHALL throw a clear error naming `ideaId` for an unknown Idea. Calling it again for the SAME
Idea SHALL overwrite in place (an `UPDATE`, never a second row) — this is what makes a backfill re-run
idempotent at the database level.

#### Scenario: classifyIdea updates hook_type, theme, and both provenance columns, readable back by getIdea

- **GIVEN** an Idea created with `hookType: "unclassified"`, `theme: "unclassified"`
- **WHEN** `classifyIdea` is called with `{ hookType: "reframe", theme: "product_or_tool", hookTypeSource: "heading", themeSource: "inferred" }`
- **THEN** `getIdea` returns `hookType: "reframe"`, `theme: "product_or_tool"`, `hookTypeSource:
  "heading"`, `themeSource: "inferred"`

#### Scenario: a freshly created Idea carries no provenance until classifyIdea is called

- **GIVEN** an Idea just created via `createIdea`
- **WHEN** `getIdea` is called
- **THEN** `hookTypeSource` and `themeSource` are both ABSENT from the returned record — never a
  fabricated value standing in for "not yet classified"

#### Scenario: calling classifyIdea again for the same Idea overwrites in place, never a second row

- **GIVEN** an Idea already classified once via `classifyIdea`
- **WHEN** `classifyIdea` is called again for the SAME `ideaId` with different values
- **THEN** exactly one `idea` row still exists for that id, now carrying the SECOND call's values

#### Scenario: an out-of-vocabulary hookType, theme, hookTypeSource, or themeSource is rejected before any write

- **GIVEN** an otherwise-valid `classifyIdea` call where ONE of `hookType`/`theme`/`hookTypeSource`/
  `themeSource` is outside its own closed set
- **WHEN** `classifyIdea` is called
- **THEN** it throws `IdeaValidationError` naming the invalid value, and the Idea's existing
  `hook_type`/`theme`/provenance are UNCHANGED

#### Scenario: classifyIdea throws a clear error, naming the Idea, for an unknown ideaId

- **GIVEN** an `ideaId` with no committed Idea
- **WHEN** `classifyIdea` is called with that id
- **THEN** it throws an error whose message names the unknown id

### Requirement: listAllIdeas and listIdeasByHookType support the Hook Type / Theme backfill's queries

`listAllIdeas(db)` SHALL return every Idea in the database, across every Run/Brand/Format, in creation
order — `[]` for an empty database. This is what lets the backfill classifier (issue #206) scan the
whole `idea` table, since the 61 real Briefs it upgrades span many Runs. `listIdeasByHookType(db,
hookType)` SHALL return every Idea CURRENTLY at that `hook_type`, in creation order, reflecting the
Idea's live `hook_type` (not a point-in-time snapshot) — the concrete query issue #206's own acceptance
criterion asks for: "a query for a single hook type returns the expected Ideas."

#### Scenario: listAllIdeas returns every Idea across multiple Runs, in creation order

- **GIVEN** two Ideas created under two DIFFERENT Runs, A then B
- **WHEN** `listAllIdeas` is called
- **THEN** it returns `[A, B]` — both Ideas, in creation order, regardless of which Run each belongs to

#### Scenario: listIdeasByHookType returns only the Ideas currently at that hook_type

- **GIVEN** two Ideas classified `hookType: "irony"` and one Idea classified `hookType: "reframe"`
- **WHEN** `listIdeasByHookType(db, "irony")` is called
- **THEN** it returns exactly the two `"irony"` Ideas, and does NOT include the `"reframe"` one

#### Scenario: listIdeasByHookType returns [] for a hook type no Idea currently carries

- **GIVEN** a database where no Idea is classified `"irony"`
- **WHEN** `listIdeasByHookType(db, "irony")` is called
- **THEN** it returns `[]`

