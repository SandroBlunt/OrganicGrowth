## MODIFIED Requirements

### Requirement: /report surfaces production alongside predicted Fit and a best-of-N measured Performance summary

`/report` SHALL render a read-only view of the whole pipeline that lists the Ideas currently in
production — every Idea whose DERIVED ROLL-UP status (ADR-0011: the earliest stage across an
`accepted` Idea's Assets, `deriveIdeaRollup`) is `in_production` and every Idea whose roll-up is
`produced` — so the Operator sees what is mid-pipeline at a glance. An Idea's roll-up is computed by
`loadReport` from its (possibly un-migrated) ledger record via the same transparent normalization
`loadIdeas` uses, so this holds regardless of whether the Brand's ledger has been run through the
one-time migration (`ledger/migrate-assets.ts`) yet.

Alongside them it SHALL show this Run's **Fit Scores** (predicted, pre-publication — ONE per Idea) and
a **best-of-N measured Performance summary** (issue #56): with one Idea now able to yield SEVERAL
Assets/Posts (one per chosen Recipe, ADR-0009), `loadReport`'s `ReportIdea` carries a per-Recipe
`assets` breakdown (`recipe`, `status`, `performance_score`, `post_url`) plus
`best_performance_score` — the BEST `performance_score` among that Idea's Assets, or `null` if none is
measured. The summary column SHALL present this as an EXPLICIT 1:N comparison against the single
`fit_score` (labelled "best of N Posts") — it SHALL NEVER be presented as if the Fit Score judged one
specific Post (always-rules #3; ADR-0011 "Fit vs Performance"). An Idea with nothing measured yet SHALL
show a placeholder — NEVER `0` and NEVER borrowed from its Fit Score. A measured Performance Score
SHALL be shown together with the ONE Channel baseline it is relative to (always-rules #4) — there SHALL
be no per-Recipe baseline.

#### Scenario: Ideas rolled up to in_production and produced are listed in a production section

- **GIVEN** a ledger with one `accepted` Idea whose Asset is `in_production` and one `accepted` Idea
  whose Asset is `produced` (and Ideas in other states)
- **WHEN** `/report` renders
- **THEN** the output lists each `in_production`-rolled-up Idea and each `produced`-rolled-up Idea,
  identified by id/title
- **AND** the Operator can see what is currently in production at a glance

#### Scenario: An un-migrated ledger's legacy casting Idea still appears in the production section

- **GIVEN** a Brand's ledger that has never been run through the migration, with an Idea whose raw
  top-level `status` is still the legacy `"casting"`
- **WHEN** `/report` renders
- **THEN** that Idea's roll-up resolves to `"in_production"` and it appears in the production section
  exactly as it would after migration (reader tolerance)

#### Scenario: Fit Score and the best-of-N Performance summary are kept distinct

- **GIVEN** an Idea with a Fit Score (predicted) and no Asset measured yet
- **WHEN** `/report` renders that Idea
- **THEN** the Fit Score appears only in the predicted/Fit-Score column
- **AND** the Performance summary column shows a placeholder (not `0`, and not the Fit Score's value)
- **AND** neither is ever presented as the other

#### Scenario: With two measured Assets, the summary shows the BEST score, labelled as a 1:N comparison

- **GIVEN** one Idea with two scored Assets, Performance Scores `0.3` and `0.9`
- **WHEN** `/report` renders that Idea's summary row
- **THEN** the Performance summary cell reads `0.90` labelled "best of 2 Posts" — never the average,
  never the first, and never presented as a 1:1 judgement of the single Fit Score

#### Scenario: A measured score is shown relative to the ONE Channel baseline

- **GIVEN** an Idea with a measured Performance Score
- **WHEN** `/report` renders
- **THEN** the Channel baseline (and when it was last updated, or a "not yet measured" note when absent)
  is shown so the measured score is read relative to the baseline, never as an absolute count
- **AND** exactly one Channel baseline is shown regardless of how many Recipes/Assets exist

### Requirement: /report is read-only over the ledger, attributing each Post to its (Idea, Recipe) Asset

`/report` SHALL read the Brand's `data/brands/<slug>/ledger.json` (the source of truth, always-rules
#7) and SHALL NOT mutate it or any other state file. A Post SHALL be shown linked to its Idea only via
the logged `post_url` on the SPECIFIC Recipe's Asset that carries it (explicit attribution,
always-rules #5) — never inferred, and never collapsed onto a bare per-Idea link when an Idea has
several Recipes/Posts. The per-Recipe Post breakdown SHALL be shown in a dedicated Posts section, one
row per `(Idea, Recipe)` that has a logged Post. An empty ledger SHALL render a clear note rather than
crash a Run (always-rules #8: never fabricate; degrade defensively).

#### Scenario: Rendering the report changes no state

- **GIVEN** a ledger file on disk
- **WHEN** `/report` reads and renders it
- **THEN** the ledger file is byte-for-byte unchanged after the call (no write of any kind)

#### Scenario: A Post is linked only via the logged URL, attributed to its own Recipe

- **GIVEN** an Idea with a Post logged on its `character-explainer-with-cast` Asset and no Post on any
  other Asset
- **WHEN** `/report` renders
- **THEN** the Posts section shows that Post linked to the Idea AND named as
  `character-explainer-with-cast`'s Post
- **AND** an Idea/Asset with no logged URL shows no Post link (attribution is never inferred)

#### Scenario: Two Recipes of one Idea each show their own Post, never collapsed onto one row

- **GIVEN** one Idea with logged Posts on BOTH its `character-explainer-with-cast` Asset and its
  `carousel` Asset
- **WHEN** `/report` renders
- **THEN** the Posts section shows TWO rows for that Idea, one per Recipe, each with its own URL

#### Scenario: An empty ledger renders a note, not a crash

- **GIVEN** a ledger with no Ideas
- **WHEN** `/report` renders
- **THEN** it returns a clear "empty" note and does not throw

## RENAMED Requirements

- FROM: `### Requirement: /report surfaces production alongside predicted and measured scores`
- TO: `### Requirement: /report surfaces production alongside predicted Fit and a best-of-N measured Performance summary`
- FROM: `### Requirement: /report is read-only over the ledger`
- TO: `### Requirement: /report is read-only over the ledger, attributing each Post to its (Idea, Recipe) Asset`
