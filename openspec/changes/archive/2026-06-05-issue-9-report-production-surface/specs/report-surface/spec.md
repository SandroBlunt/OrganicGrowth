## ADDED Requirements

### Requirement: /report surfaces production alongside predicted and measured scores

`/report` SHALL render a read-only view of the whole pipeline that lists the Ideas currently in
production — every Idea whose status is `casting` and every Idea whose status is `produced` — so the
Operator sees what is mid-pipeline at a glance. Alongside them it SHALL show this Run's **Fit Scores**
(predicted, pre-publication) and measured **Performance Scores** (post-publication). It SHALL keep the
two **strictly distinct**: a Fit Score SHALL NOT be presented as a Performance Score, nor a Performance
Score as a Fit Score (always-rules #3). An Idea that has not yet been measured SHALL show its Performance
Score as a clear placeholder — NEVER `0` and NEVER borrowed from its Fit Score. A measured Performance
Score SHALL be shown together with the **Channel baseline** it is relative to (always-rules #4), so it is
never read as an absolute count.

#### Scenario: Ideas in casting and produced are listed in a production section

- **GIVEN** a ledger with Ideas in `casting` and in `produced` (and Ideas in other states)
- **WHEN** `/report` renders
- **THEN** the output lists each `casting` Idea and each `produced` Idea, identified by id/title
- **AND** the Operator can see what is currently in production at a glance

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

### Requirement: /report is read-only over the ledger

`/report` SHALL read `data/ledger.json` (the source of truth, always-rules #7) and SHALL NOT mutate it or
any other state file. A Post SHALL be shown linked to its Idea only via the logged `post_url` (explicit
attribution, always-rules #5) — never inferred. An empty ledger SHALL render a clear note rather than
crash a Run (always-rules #8: never fabricate; degrade defensively).

#### Scenario: Rendering the report changes no state

- **GIVEN** a ledger file on disk
- **WHEN** `/report` reads and renders it
- **THEN** the ledger file is byte-for-byte unchanged after the call (no write of any kind)

#### Scenario: A Post is linked only via the logged URL

- **GIVEN** a posted Idea with a logged `post_url` and an Idea with `post_url` null
- **WHEN** `/report` renders
- **THEN** the posted Idea is shown linked to its Post via the logged `post_url`
- **AND** the Idea with no logged URL shows no Post link (attribution is never inferred)

#### Scenario: An empty ledger renders a note, not a crash

- **GIVEN** a ledger with no Ideas
- **WHEN** `/report` renders
- **THEN** it returns a clear "empty" note and does not throw

### Requirement: The Operator command surface and lifecycle are final and match the ledger

The documented Operator command surface SHALL match the shipped Producer feature. There SHALL be **no
`/produce` command** — accepting an Idea auto-enqueues it for production (ADR-0004), replacing the old
explicit kickoff. The Operator's four touches SHALL be **accept → `/pick-cast` → publish → `/log-post`**,
with **`/queue`** for backlog visibility; publishing remains the existing `/log-post` act (explicit
attribution; the Post is linked to its Idea only via the logged URL). The documented **lifecycle** SHALL
be `suggested → accepted → casting → produced → posted → tracking → scored` (or `rejected`) and SHALL
match the statuses the ledger actually records.

#### Scenario: No /produce command exists in the surface

- **GIVEN** the shipped command surface (auto-enqueue on accept)
- **WHEN** the documented commands are inspected
- **THEN** there is no `/produce` command, and `/queue`, `/pick-cast`, and `/log-post` are present
- **AND** the docs describe the four touches accept → pick-cast → publish → log-post

#### Scenario: The documented lifecycle matches the ledger

- **GIVEN** the lifecycle the ledger records (`suggested → accepted → casting → produced → posted →
  tracking → scored`, or `rejected`)
- **WHEN** the docs (CLAUDE.md) are inspected
- **THEN** they document exactly that lifecycle, with `casting` and `produced` present
- **AND** no documented status is one the ledger never records
