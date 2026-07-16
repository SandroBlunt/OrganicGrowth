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

The chosen Character SHALL be enqueued onto the queue's generic NEXT LEG (issue #56) — keyed on the
composite `(brand, idea_id, recipe)`, where `recipe` is the RESOLVED Asset's OWN Recipe (never a
different Recipe's job) and the next leg's `gate` cursor is resolved from that Recipe's OWN gate list
via the Recipe registry (`null` when the Cast gate was the Recipe's last gate — today's only wired
case). When MORE THAN ONE of the Idea's Assets is simultaneously paused at the Cast gate (a future
multi-Recipe scenario), the command SHALL REFUSE — naming every gated Recipe — rather than guessing
which one the pick resolves (explicit attribution, always-rules #5); this command stays scoped to the
Cast gate specifically (generalizing to any Recipe's own pick-gate is issue #57).

#### Scenario: pick-cast selects the nth Cast member from the Recipe's Asset as the Character

- **GIVEN** an Idea that is `accepted` with one Asset `in_production`/`pending_gate: "cast"`, holding
  the candidate Cast members
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>` with a valid 1-based `<n>`
- **THEN** the nth Cast member is selected as the chosen Character to pin
- **AND** the enqueued next-leg job is stamped with that Asset's OWN Recipe

#### Scenario: pick-cast reports an out-of-range or unknown selection without crashing

- **GIVEN** an Idea whose gated Asset's `cast` has fewer than `<n>` members, or an unknown Idea id
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** it returns an identifiable message and selects no Character (no crash, no invented
  Character)

#### Scenario: pick-cast refuses a pick when no Asset is paused at the Cast gate, naming the roll-up

- **GIVEN** an Idea whose Recipe's Asset has already moved past `in_production` (e.g. `produced`)
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** it refuses the pick, names the Idea's derived roll-up status (e.g. `"produced"`) in the
  refusal message, and enqueues no next-leg job

#### Scenario: pick-cast refuses — never guesses — when TWO Assets are gated at once

- **GIVEN** an Idea with TWO Assets simultaneously `in_production`/`pending_gate: "cast"` (a future
  multi-Recipe scenario)
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** the command refuses, naming BOTH gated Recipes in its message
- **AND** no pick is recorded and no job is enqueued for either Recipe

#### Scenario: pick-cast works against a legacy, not-yet-migrated ledger record

- **GIVEN** an Idea whose raw ledger record still uses the legacy top-level shape
  (`status: "casting"`, top-level `cast` field) — the Brand's ledger has not been run through
  `ledger/migrate-assets.ts` yet
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>`
- **THEN** the command behaves exactly as it would against an already-migrated record (the reader's
  transparent normalization makes the two indistinguishable)
