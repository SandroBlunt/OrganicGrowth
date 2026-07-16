## MODIFIED Requirements

### Requirement: /report surfaces production alongside predicted and measured scores

`/report` SHALL render a read-only view of the whole pipeline that lists the Ideas currently in
production — every Idea whose DERIVED ROLL-UP status (ADR-0011: the earliest stage across an
`accepted` Idea's Assets, `deriveIdeaRollup`) is `in_production` and every Idea whose roll-up is
`produced` — so the Operator sees what is mid-pipeline at a glance. An Idea's roll-up is computed by
`loadReport` from its (possibly un-migrated) ledger record via the same transparent normalization
`loadIdeas` uses, so this holds regardless of whether the Brand's ledger has been run through the
one-time migration (`ledger/migrate-assets.ts`) yet. Alongside them it SHALL show this Run's **Fit
Scores** (predicted, pre-publication) and measured **Performance Scores** (post-publication).
It SHALL keep the two **strictly distinct**: a Fit Score SHALL NOT be presented as a Performance
Score, nor a Performance Score as a Fit Score (always-rules #3). An Idea that has not yet been
measured SHALL show its Performance Score as a clear placeholder — NEVER `0` and NEVER borrowed from
its Fit Score. A measured Performance Score SHALL be shown together with the **Channel baseline** it
is relative to (always-rules #4), so it is never read as an absolute count.

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

#### Scenario: Fit Score and Performance Score are kept distinct

- **GIVEN** an Idea with a Fit Score (predicted) and no measured Performance Score yet
- **WHEN** `/report` renders that Idea
- **THEN** the Fit Score appears only in the predicted/Fit-Score column
- **AND** the Performance Score column shows a placeholder (not `0`, and not the Fit Score's value)
- **AND** neither score is ever presented as the other

#### Scenario: A measured score is shown relative to the Channel baseline

- **GIVEN** an Idea with a measured Performance Score
- **WHEN** `/report` renders
- **THEN** the Channel baseline (and when it was last updated, or a "not yet measured" note when absent)
  is shown so the measured score is read relative to the baseline, never as an absolute count
