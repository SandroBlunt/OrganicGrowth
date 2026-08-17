## ADDED Requirements

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
