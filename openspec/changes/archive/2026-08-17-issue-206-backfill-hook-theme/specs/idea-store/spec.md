## ADDED Requirements

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
