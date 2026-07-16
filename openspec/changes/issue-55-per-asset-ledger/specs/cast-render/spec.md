## MODIFIED Requirements

### Requirement: /pick-cast records the chosen Character and resumes production

The `/pick-cast <brand> <idea-id> <n>` command SHALL select the **nth** Cast member (1-based `<n>`)
from the *Character Explainer with Cast* Recipe's Asset `cast` field (ADR-0011: Cast candidates are
now Recipe-local data carried on that Asset, not a top-level `idea.cast` scalar) — the chosen
candidate's identifier IS the **Character** to pin — and SHALL resume production by handing that
Character to the Space driver's Phase-B render. The command SHALL refuse the pick, naming the Idea's
derived roll-up status, unless the Idea has an Asset that is `in_production` with
`pending_gate: "cast"` (`ideaAtGate`) — the Asset-grain replacement for the retired
`idea.status === "casting"` check. An out-of-range `<n>` or an unknown Idea SHALL return an
identifiable, non-crashing message rather than throwing or inventing a Character. Because
`ledger.ts`'s reader transparently normalizes a not-yet-migrated Idea on every read, this holds
whether or not the Brand's ledger has been run through the one-time migration.

#### Scenario: pick-cast selects the nth Cast member from the Recipe's Asset as the Character

- **GIVEN** an Idea that is `accepted` with one Asset `in_production`/`pending_gate: "cast"`, holding
  the candidate Cast members
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>` with a valid 1-based `<n>`
- **THEN** the nth Cast member is selected as the chosen Character to pin

#### Scenario: pick-cast reports an out-of-range or unknown selection without crashing

- **GIVEN** an Idea whose gated Asset's `cast` has fewer than `<n>` members, or an unknown Idea id
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** it returns an identifiable message and selects no Character (no crash, no invented
  Character)

#### Scenario: pick-cast refuses a pick when no Asset is paused at the Cast gate, naming the roll-up

- **GIVEN** an Idea whose Recipe's Asset has already moved past `in_production` (e.g. `produced`)
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** it refuses the pick, names the Idea's derived roll-up status (e.g. `"produced"`) in the
  refusal message, and enqueues no render

#### Scenario: pick-cast works against a legacy, not-yet-migrated ledger record

- **GIVEN** an Idea whose raw ledger record still uses the legacy top-level shape
  (`status: "casting"`, top-level `cast` field) — the Brand's ledger has not been run through
  `ledger/migrate-assets.ts` yet
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** the command behaves exactly as it would against an already-migrated record (the reader's
  transparent normalization makes the two indistinguishable)
