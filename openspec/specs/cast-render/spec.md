# cast-render Specification

## Purpose
TBD - created by archiving change issue-6-producer-space-driver-cast. Update Purpose after archive.
## Requirements
### Requirement: Inject the Production Spec into JSON Master via the Fallback Protocol and confirm by readback

The Space driver SHALL inject a validated Production Spec into the `JSON Master` text node via the
**Fallback Protocol** — a natural-language `spaces_edit` delegated to the Space's in-canvas agent — then
**read back** the node and confirm the text **changed** (ADR-0003; `docs/producer-spikes-results.md`
Spike 1). The driver SHALL poll the edit to terminal before reading back. If the readback shows the text
did not change, the driver SHALL report an identifiable failure rather than proceeding as if the inject
succeeded. The driver SHALL depend only on a narrow injected Magnific port, never on the live Space.

#### Scenario: Injecting the Spec changes the JSON Master text

- **GIVEN** a fake Space whose `JSON Master` node holds placeholder content and a validated Production Spec
- **WHEN** the driver injects the Spec
- **THEN** it issues a natural-language edit targeting `JSON Master` (the Fallback Protocol)
- **AND** after polling the edit to terminal it reads back the `JSON Master` node
- **AND** the readback text differs from the pre-inject content (the change is confirmed)

#### Scenario: An inject whose readback is unchanged is reported as a failure

- **GIVEN** a fake Space whose edit does not actually change the `JSON Master` text
- **WHEN** the driver injects the Spec and reads back
- **THEN** it reports an identifiable failure rather than treating the inject as successful

### Requirement: Running the cast run-point yields the Cast and stops at the Cast

The Space driver SHALL run the cast run-point (`Character Variants Generator`, mode `downstream`) by
starting a `spaces_run` at the resolved node ID, polling the run to terminal, and returning which nodes
fired and which creations were produced. The run SHALL stop cleanly at the Cast: it SHALL yield exactly
the **6 Cast-phase creations** and SHALL fire **no** clip or video nodes (no clip image generators, no
video generators, no Video Combiner) — the human Character pin is the natural cut between Phase A and
Phase B (`docs/producer-spikes-results.md` Spike 2). The cast run-point SHALL be resolved by name from
the parsed Execution Protocol (the run-point whose gate is the Cast gate), never hard-coded.

#### Scenario: The cast run yields the 6 Cast creations

- **GIVEN** a fake Space with the Spec injected and the cast run-point resolved from the Execution Protocol
- **WHEN** the driver runs the cast run-point `downstream` and polls to terminal
- **THEN** it returns 6 candidate Cast creations

#### Scenario: The cast run fires no clip or video nodes

- **GIVEN** the same cast run
- **WHEN** the run reaches terminal
- **THEN** none of the fired nodes is a clip generator, a video generator, or the Video Combiner

### Requirement: The Cast URLs are surfaced and the Idea transitions to casting

The Space driver SHALL surface the candidate **Cast** image URLs to the Operator and, on a successful
Phase-A completion, the producer SHALL transition the Idea `accepted → casting` and populate the ledger
Idea's `cast` field with the candidate identifiers/URLs (ADR-0003). The status and the `cast` field SHALL
be written to the Brand's `data/brands/<slug>/ledger.json`, which remains the source of truth (the values are written from the
Phase-A completion, never inferred). The driver SHALL NOT publish anything — Phase A pauses for a human
(generate-never-publish).

#### Scenario: A successful Phase A returns the Cast image URLs

- **GIVEN** a fake Space and a validated Production Spec
- **WHEN** the driver composes and casts (inject → run cast → fetch Cast)
- **THEN** it returns the candidate Cast image URLs for the Operator to judge

#### Scenario: The ledger records casting and the cast candidates

- **GIVEN** a ledger whose Idea is `accepted` and the Cast candidates from a successful Phase A
- **WHEN** the casting transition is written
- **THEN** the Idea's status reads `casting`
- **AND** the Idea's `cast` field holds the candidate Cast identifiers/URLs
- **AND** no other Idea and no unrelated field is changed

### Requirement: A missing or stale cast run-point falls back to the in-canvas agent

The Space driver SHALL recover via the **Fallback Protocol** — delegating to the Space's in-canvas agent
with a natural-language run-by-goal `spaces_edit` — rather than hard-failing when the named cast run-point
cannot be resolved (it is absent or ambiguous in the parsed Execution Protocol) or the run reports the
start node missing/stale (ADR-0003; PRD #1 story 27). The fallback SHALL still surface a Cast.

#### Scenario: A missing/stale cast run-point recovers via the agent fallback

- **GIVEN** a fake Space whose cast run-point is missing/stale (the run reports the start node gone, or it
  cannot be resolved from the Execution Protocol)
- **WHEN** the driver composes and casts
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
SHALL depend only on the narrow injected Magnific port, never on the live Space.

#### Scenario: Pinning the chosen Character is confirmed by readback

- **GIVEN** a fake Space at the Cast gate and a chosen Character (a Cast candidate identifier)
- **WHEN** the driver pins the Character
- **THEN** it issues a natural-language edit naming the chosen Character (the Fallback Protocol)
- **AND** after polling the edit to terminal it reads back the Space
- **AND** the readback confirms the chosen `Character` creation node is pinned

#### Scenario: A pin whose readback is unconfirmed is reported as a failure

- **GIVEN** a fake Space whose pin edit does not actually pin the chosen Character
- **WHEN** the driver pins the Character and reads back
- **THEN** it reports an identifiable failure rather than treating the pin as successful

### Requirement: Running the clip run-point renders the clip chain to one Asset unattended

After the Character is pinned, the Space driver SHALL run the **clip** run-point (`Clip extractor`, mode
`downstream`) by resolving it **by name** from the parsed Execution Protocol — the run-point that is
**not** the Cast gate (`gate: null`) — and SHALL drive the clip → Video Combiner → Final Output chain to
exactly **one** combined **Asset** creation with **no further Operator input** (ADR-0003 Phase B;
`docs/producer-spikes-results.md`). The clip run-point SHALL be resolved by name, never hard-coded. Every
clip and thumbnail SHALL render against the pinned Character.

#### Scenario: The clip run renders the chain to one combined Asset

- **GIVEN** a fake Space with the Character pinned and the clip run-point resolved from the Execution
  Protocol
- **WHEN** the driver runs the clip run-point `downstream` and polls to terminal
- **THEN** the Video Combiner and Final Output nodes fire (the render chain runs)
- **AND** exactly one combined Asset creation is produced, with no further Operator input

#### Scenario: The clip run-point is resolved by name as the non-cast-gate run-point

- **GIVEN** the parsed Execution Protocol with a cast run-point (`gate: "cast"`) and a clip run-point
  (`gate: null`)
- **WHEN** the driver resolves the clip run-point
- **THEN** it selects the run-point whose gate is `null` (the clip run-point), resolved by node name to
  the current Space's node ID, never hard-coded

### Requirement: The Asset is persisted and the Idea transitions to produced

On a successful Phase-B render, the Space driver SHALL surface the finished **Asset**'s media URL, and the
producer SHALL transition the Idea `casting → produced` and record `character` (the chosen Character),
`asset_url` (the finished Asset's URL), and `produced_at` (an injected ISO-8601 timestamp) onto the
ledger Idea record (ADR-0003). The status SHALL be **derived** from the queue's `render → done`
transition (never inferred), and the status and Asset fields SHALL be written to the Brand's `data/brands/<slug>/ledger.json`,
which remains the source of truth. `produced_at` SHALL be injected, never read from the clock inside a
pure function.

#### Scenario: A successful Phase B returns the finished Asset URL

- **GIVEN** a fake Space and a pinned Character
- **WHEN** the driver picks and renders (pin → run clip → fetch Asset)
- **THEN** it returns the finished Asset's media URL

#### Scenario: The ledger records the Asset fields and the produced status

- **GIVEN** a ledger whose Idea is `casting` and a finished Asset from a successful Phase B
- **WHEN** the produced transition is written
- **THEN** the Idea's status reads `produced`
- **AND** the Idea's record holds `character`, `asset_url`, and the injected `produced_at`
- **AND** no other Idea and no unrelated field is changed

### Requirement: Phase B publishes nothing

The Space driver SHALL render the **Asset** and **stop** for the Operator — it SHALL NOT publish, post to
Facebook, or take any publication action (generate-never-publish; ADR-0002). The finished Asset SHALL
wait for the Operator to publish it; the producer SHALL only persist and link the Asset, never post it.

#### Scenario: The Producer renders the Asset and takes no publish action

- **GIVEN** a fake Space and a chosen Character
- **WHEN** the driver picks and renders to a finished Asset
- **THEN** it returns the Asset for the Operator
- **AND** it takes no publish or Facebook action (there is no publish path in the driver or command)

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

### Requirement: Phase B fits the existing narrow Magnific port

The Phase-B operations SHALL use the **existing** narrow injected `SpaceMcpPort` without extending it:
pinning a Character is a natural-language `edit` polled to terminal (the Fallback Protocol's transport);
running the clip run-point is `run` + poll `runStatus` to terminal; fetching the finished Asset is
`fetchCreations`. Each Phase-B driver operation (`pinCharacter`, the clip `runRunPoint`, `fetchAsset`)
SHALL be unit-testable against a fake implementing that port, with no credits spent, no board mutation,
and no network. The live adapter implementing the port is deferred to a later slice.

#### Scenario: pinCharacter issues the edit and verifies via the port

- **GIVEN** a fake implementing the Magnific port
- **WHEN** `pinCharacter` runs
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

