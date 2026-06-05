## ADDED Requirements

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
transition (never inferred), and the status and Asset fields SHALL be written to `data/ledger.json`,
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

The `/pick-cast <idea-id> <n>` command SHALL select the **nth** Cast member (1-based `<n>`) from the
Idea's ledger `cast` array — the chosen candidate's identifier IS the **Character** to pin — and SHALL
resume production by handing that Character to the Space driver's Phase-B render. An out-of-range `<n>` or
an unknown Idea SHALL return an identifiable, non-crashing message rather than throwing or inventing a
Character.

#### Scenario: pick-cast selects the nth Cast member as the Character

- **GIVEN** an Idea at the Cast gate whose ledger `cast` holds the candidate Cast members
- **WHEN** the Operator runs `/pick-cast <idea-id> <n>` with a valid 1-based `<n>`
- **THEN** the nth Cast member is selected as the chosen Character to pin

#### Scenario: pick-cast reports an out-of-range or unknown selection without crashing

- **GIVEN** an Idea whose ledger `cast` has fewer than `<n>` members, or an unknown Idea id
- **WHEN** the Operator runs `/pick-cast <idea-id> <n>`
- **THEN** it returns an identifiable message and selects no Character (no crash, no invented Character)

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
