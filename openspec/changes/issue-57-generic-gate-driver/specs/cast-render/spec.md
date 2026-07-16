## MODIFIED Requirements

### Requirement: A missing or stale cast run-point falls back to the in-canvas agent

The Space driver SHALL recover via the **Fallback Protocol** — delegating to the Space's in-canvas agent
with a natural-language run-by-goal `spaces_edit` — rather than hard-failing when the named cast run-point
cannot be resolved (it is absent or ambiguous in the parsed Execution Protocol) or the run reports the
start node missing/stale (ADR-0003; PRD #1 story 27). The fallback SHALL still surface a Cast. This
recovery is the *Character Explainer with Cast* Recipe's own instance of the GENERIC first-leg recovery
`driveToNextGate` provides for any Recipe (`generic-gate-driver`'s "Fallback-Protocol recovery applies
only to a Recipe's first leg" requirement, ADR-0010, issue #57) — the Cast gate is this Recipe's first
(and only) declared gate.

#### Scenario: A missing/stale cast run-point recovers via the agent fallback

- **GIVEN** a fake Space whose cast run-point is missing/stale (the run reports the start node gone, or it
  cannot be resolved from the Execution Protocol)
- **WHEN** the driver drives the first leg toward the Cast gate (`driveToNextGate` with
  `targetGate: "cast"`)
- **THEN** it falls back to the in-canvas agent with a natural-language run-by-goal edit (the Fallback
  Protocol) instead of hard-failing
- **AND** a Cast is still surfaced

### Requirement: The driver depends only on a narrow injected Magnific port

The Space driver SHALL depend only on a narrow injected port for the exact Magnific operations it needs —
read state, natural-language edit + poll edit-status to terminal, run + poll run-status to terminal, and
fetch creations. It SHALL NOT call the live Magnific MCP tools directly. Each driver operation
(`injectSpec`, `runRunPoint`, `fetchCast`) SHALL be unit-testable against a fake implementing that port,
with no credits spent, no board mutation, and no network. The live adapter implementing the port is
deferred to a later slice.

#### Scenario: injectSpec issues the edit and verifies via the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `injectSpec` runs
- **THEN** it issues the edit and polls edit-status to terminal through the port, then reads back to verify
- **AND** it makes no call outside the injected port

#### Scenario: runRunPoint polls a run to terminal through the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `runRunPoint` runs the cast run-point
- **THEN** it starts the run and polls run-status to terminal through the port, returning the run result

#### Scenario: fetchCast returns the expected creations through the port

- **GIVEN** a fake implementing the Magnific port holding the 6 Cast creations
- **WHEN** `fetchCast` is called with the Cast creation identifiers
- **THEN** it returns the 6 Cast image URLs through the port

### Requirement: Pin the chosen Character via the Fallback Protocol and confirm by readback

On the Operator's Character pick, the Space driver SHALL pin the chosen **Character** (a Cast candidate
identifier) into the Space via the **Fallback Protocol** — a natural-language `spaces_edit` delegated to
the Space's in-canvas agent (re-pinning the `Character` creation node, confirmed feasible in Spike 1) —
then **read back** the Space and confirm the chosen `Character` creation node is pinned (ADR-0003). The
driver SHALL poll the edit to terminal before reading back. If the readback does not confirm the pin, the
driver SHALL report an identifiable failure rather than proceeding as if the pin succeeded. The driver
SHALL depend only on the narrow injected Magnific port, never on the live Space. This pin is the
*Character Explainer with Cast* Recipe's own instance of the GENERIC `pinPick(port, pick, nodeName, poll)`
(ADR-0010, issue #57): the target node name (`"Character #2"`) is this Recipe's own
`space.nodes.pinnedReference` value, supplied explicitly by the caller — the driver itself hard-codes no
node name.

#### Scenario: Pinning the chosen Character is confirmed by readback

- **GIVEN** a fake Space at the Cast gate and a chosen Character (a Cast candidate identifier)
- **WHEN** the driver pins the Character into the `"Character #2"` node (`pinPick`)
- **THEN** it issues a natural-language edit naming the chosen Character (the Fallback Protocol)
- **AND** after polling the edit to terminal it reads back the Space
- **AND** the readback confirms the chosen `Character` creation node is pinned

#### Scenario: A pin whose readback is unconfirmed is reported as a failure

- **GIVEN** a fake Space whose pin edit does not actually pin the chosen Character
- **WHEN** the driver pins the Character and reads back
- **THEN** it reports an identifiable failure rather than treating the pin as successful

### Requirement: Phase B fits the existing narrow Magnific port

The Phase-B operations SHALL use the **existing** narrow injected `SpaceMcpPort` without extending it:
pinning a Character is a natural-language `edit` polled to terminal (the Fallback Protocol's transport,
via the generic `pinPick`); running the clip run-point is `run` + poll `runStatus` to terminal; fetching
the finished Asset is `fetchCreations`. Each Phase-B driver operation (`pinPick`, the clip `runRunPoint`,
`fetchAsset`) SHALL be unit-testable against a fake implementing that port, with no credits spent, no
board mutation, and no network. The live adapter implementing the port is deferred to a later slice.

#### Scenario: pinPick issues the edit and verifies via the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `pinPick` runs
- **THEN** it issues the edit and polls edit-status to terminal through the port, then reads back to
  confirm the pin
- **AND** it makes no call outside the injected port

#### Scenario: the clip runRunPoint polls a run to terminal through the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `runRunPoint` runs the clip run-point
- **THEN** it starts the run and polls run-status to terminal through the port, returning the run result

#### Scenario: fetchAsset returns the finished Asset URL through the port

- **GIVEN** a fake implementing the Magnific port holding the finished Asset creation
- **WHEN** `fetchAsset` is called with the Asset creation identifier
- **THEN** it returns the Asset's media URL through the port

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
which one the pick resolves (explicit attribution, always-rules #5). As of issue #57, `/pick-cast` is a
**thin alias**: it keeps this Cast-gate-specific ledger-reading half UNCHANGED, but its queue-resume
mechanics (resolving the next gate, enqueueing the next leg, clearing the gate) SHALL be performed by
`resumeGate` — the SAME generic primitive the standalone `/pick <brand> <idea-id> <recipe> <gate>
<pick>` command uses for ANY wired Recipe's ANY declared gate (`generic-gate-driver`) — so the two
commands can never drift on how a pick resumes production.

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

#### Scenario: pick-cast's queue-resume matches calling the generic resumeGate directly

- **GIVEN** an Idea at the Cast gate and a valid 1-based `<n>` the Operator picks
- **WHEN** `/pick-cast` resumes production
- **THEN** the resulting queue state is IDENTICAL to what calling `resumeGate(brand, ideaId, recipe,
  "cast", <resolved Character>, queuePath, now)` directly would produce — the next-leg job's `brand`,
  `recipe`, `gate`, `pick`, and `enqueued_at`, and the cleared gate's `done` status
