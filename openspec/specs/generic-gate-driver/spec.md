# generic-gate-driver Specification

## Purpose
TBD - created by archiving change issue-57-generic-gate-driver. Update Purpose after archive.
## Requirements
### Requirement: driveToNextGate drives one leg of a Recipe's Execution Protocol, generically

The system SHALL provide a single generic function, `driveToNextGate(port, spaceState, input, poll)`
(`src/space-driver/driver.ts`), that drives ONE leg of a Recipe's Execution Protocol and REPLACES the
old fixed two-phase `composeAndCast`/`pickAndRender` split (ADR-0010). `input` SHALL be either a
**first** leg (`kind: "first"`, no preceding gate has resolved — carries the Production Spec to inject)
or a **resumed** leg (`kind: "resumed"`, a preceding gate's pick has resolved — carries that pick and the
Recipe-declared node name to pin it into). Every leg SHALL name its `targetGate: string | null` — the
gate this leg's run-point pauses at, or `null` for the FINAL leg (no further gate; it renders the
Asset). The function SHALL resolve the run-point whose `gate` matches `targetGate` by NAME from the
parsed Execution Protocol (`execution-protocol/parse.ts`), never hard-coded, and run it. When
`targetGate` is non-null and the run succeeds, the driver SHALL PAUSE and return that gate's candidate
creations for the Operator; when `targetGate` is `null`, the driver SHALL resolve the single produced
Asset creation and FINISH. The driver SHALL depend only on the narrow injected `SpaceMcpPort`, never the
live Space, and SHALL take no publish action (generate-never-publish).

#### Scenario: A first leg targeting a gate injects the Spec, runs the resolved run-point, and PAUSES

- **GIVEN** a fake Space and a validated Production Spec
- **WHEN** `driveToNextGate` is called with `{ kind: "first", targetGate: <a gate name>, spec }`
- **THEN** it injects the Spec into the Space, resolves and runs the run-point whose `gate` matches
  `<a gate name>`, and PAUSES, returning that gate's candidate creations

#### Scenario: A resumed leg pins the resolved pick, runs the next resolved run-point, and PAUSES again

- **GIVEN** a fake Space with a prior gate's candidates already produced, and the Operator's resolved
  pick from that gate
- **WHEN** `driveToNextGate` is called with `{ kind: "resumed", targetGate: <the NEXT gate name>, pick,
  pinnedReferenceNodeName }`
- **THEN** it pins `pick` into `pinnedReferenceNodeName`, resolves and runs the run-point whose `gate`
  matches the next gate name, and PAUSES again, returning that gate's candidates

#### Scenario: A resumed leg targeting `null` pins the resolved pick, runs the final run-point, and FINISHES

- **GIVEN** a fake Space with a prior gate's candidates already produced, and the Operator's resolved
  pick from that (last) gate
- **WHEN** `driveToNextGate` is called with `{ kind: "resumed", targetGate: null, pick,
  pinnedReferenceNodeName }`
- **THEN** it pins `pick`, resolves and runs the run-point whose `gate` is `null`, and FINISHES,
  returning the rendered Asset's creation id and media URL, carrying `pick` on the result

### Requirement: The wired *Character Explainer with Cast* Recipe behaves identically under the generic engine

Driving the wired *Character Explainer with Cast* Recipe through `driveToNextGate` SHALL produce the
SAME observable outcomes its predecessor (`composeAndCast`/`pickAndRender`) produced: a first leg
targeting gate `"cast"` SHALL inject the Spec, run the cast run-point, and pause with the SAME 6 Cast
candidate `{identifier, url}` pairs; a resumed leg targeting `null` SHALL pin the chosen Character into
the `Character #2` node, run the clip run-point, and finish with the SAME rendered Asset id/URL. No
existing acceptance criterion or observable behavior of the wired Recipe's production path SHALL regress.

#### Scenario: The wired Recipe's first leg pauses with the same 6 Cast candidates as before

- **GIVEN** the fake Space modelling the wired *Character Explainer with Cast* Recipe's Space, and a
  validated Production Spec
- **WHEN** `driveToNextGate` drives the first leg with `targetGate: "cast"`
- **THEN** it PAUSES with exactly 6 candidate `{identifier, url}` pairs matching the fake's Cast
  creations, having injected the Spec and run only the cast run-point (no clip/video node fired)

#### Scenario: The wired Recipe's resumed leg finishes with the same rendered Asset as before

- **GIVEN** the fake Space and the Operator's chosen Character (a Cast candidate identifier)
- **WHEN** `driveToNextGate` drives the resumed leg with `targetGate: null`, that `pick`, and
  `pinnedReferenceNodeName: "Character #2"`
- **THEN** it pins the Character, runs the clip run-point, and FINISHES with the rendered Asset's
  creation id and media URL, taking no publish action

### Requirement: Fallback-Protocol recovery applies only to a Recipe's first leg

`driveToNextGate` SHALL recover via the **Fallback Protocol** — delegating to the Space's in-canvas
agent with a natural-language run-by-goal edit — when a FIRST leg's target run-point cannot be resolved
from the parsed Execution Protocol, or the run reports its start node missing/stale (ADR-0003; PRD #1
story 27); the fallback SHALL still surface that leg's candidates (or, for a gateless first leg, the
rendered Asset). A RESUMED leg's target run-point failing to resolve SHALL fail directly with an
identifiable `run_point_unresolved` error — NO Fallback-Protocol recovery SHALL be attempted for a
resumed leg (mirroring the predecessor `pickAndRender`'s Phase-B behavior, which never recovered a
missing clip run-point either). An empty candidate/Asset result from either a named run or the agent
fallback SHALL fail the op (`candidates_empty` / `run_failed`) rather than return ok with nothing to
show.

#### Scenario: A first leg recovers via the agent when its run-point is missing/stale

- **GIVEN** a fake Space whose target run-point for a first leg is missing/stale (the run reports the
  start node gone, or it cannot be resolved from the Execution Protocol at all)
- **WHEN** `driveToNextGate` drives that first leg
- **THEN** it falls back to the in-canvas agent with a natural-language run-by-goal edit instead of
  hard-failing, and still surfaces that gate's candidates (or the rendered Asset, for a gateless leg)

#### Scenario: A resumed leg's unresolved run-point fails directly, with no recovery attempt

- **GIVEN** a fake Space and a resumed leg whose `targetGate` matches no run-point in the parsed
  Execution Protocol
- **WHEN** `driveToNextGate` drives that resumed leg
- **THEN** it fails with `run_point_unresolved`
- **AND** no natural-language run-by-goal fallback edit is issued and no run is started

#### Scenario: An empty result fails the op instead of returning ok with nothing to show

- **GIVEN** a fake Space whose named run (or agent fallback) succeeds but surfaces zero creations
- **WHEN** `driveToNextGate` resolves that leg's result
- **THEN** it fails the op (`candidates_empty` for a paused leg, `run_failed` for the final leg) rather
  than returning `ok: true` with an empty candidate/Asset result

### Requirement: pinPick generalizes the pin step over an explicit, Recipe-declared node name

The system SHALL provide `pinPick(port, pick, nodeName, poll)`, generalizing the predecessor
`pinCharacter`: it pins a resolved pick into `nodeName` via the Fallback Protocol (a natural-language
`edit`), polls to terminal, and confirms the pin through `port.verifyPinned(pick)` — the port owns "is
this pick pinned?", never a fake-only marker. `nodeName` SHALL be supplied by the CALLER (a Recipe's own
`space.nodes.pinnedReference`, `src/recipe/registry.ts`) and SHALL NEVER be hard-coded inside the driver.

#### Scenario: pinPick pins into the caller-supplied node name, not a hard-coded constant

- **GIVEN** a fake implementing the Magnific port and TWO different candidate node names
- **WHEN** `pinPick` is called once for each node name with a resolved pick
- **THEN** each pin edit names its OWN caller-supplied node name in its natural-language goal — neither
  call references a node name the driver itself chose

#### Scenario: An unconfirmed pin is reported as a failure through the port

- **GIVEN** a fake Space whose pin edit does not actually pin the resolved pick
- **WHEN** `pinPick` pins and reads back
- **THEN** it reports an identifiable `pin_unconfirmed` failure rather than treating the pin as
  successful

### Requirement: A zero-gate Recipe drives straight through with no pause

A Recipe with an empty declared gate list (`Recipe.gates: []`) SHALL drive its single run-point as a
FIRST leg with `targetGate: null` — `driveToNextGate` SHALL inject the Spec, run that single run-point,
and FINISH directly with the rendered Asset, with NO pause and no pick required at any point.

#### Scenario: A single gateless run-point runs straight through to a finished Asset

- **GIVEN** a test-only fake Space configured with exactly ONE run-point whose `gate` is `null`
- **WHEN** `driveToNextGate` drives the first leg with `targetGate: null`
- **THEN** it injects the Spec, runs that one run-point, and FINISHES with the rendered Asset's id/URL
- **AND** no pin edit was issued and the result carries no `pick` (there was nothing to pick)

### Requirement: A multi-gate Recipe pauses and resumes at each declared gate in order

A Recipe with several declared gates SHALL drive one leg per gate (plus one final leg): the FIRST leg
targets the Recipe's first declared gate; each RESUMED leg targets the NEXT gate in the Recipe's own
declared order, pinning the pick from the gate just cleared into that gate's own Recipe-declared node
name; the LAST resumed leg targets `null` and FINISHES with the rendered Asset. `driveToNextGate` itself
SHALL carry no dependency on the Recipe registry — the caller/orchestration shell resolves each leg's
`targetGate` from `Recipe.gates` and supplies it explicitly.

#### Scenario: A 2-gate Recipe pauses at gate A, resumes to pause at gate B, then resumes to finish

- **GIVEN** a test-only fake Space configured with 3 run-points: gate `"gateA"`, gate `"gateB"`, and a
  final gateless run-point
- **WHEN** three legs are driven in order — first (`targetGate: "gateA"`), resumed
  (`targetGate: "gateB"`, pinning gate A's pick into gate A's own node), resumed (`targetGate: null`,
  pinning gate B's pick into gate B's own node)
- **THEN** the first two legs PAUSE with their own gate's candidates and the third leg FINISHES with the
  rendered Asset, carrying gate B's resolved pick
- **AND** each resumed leg's pin edit named its OWN gate's Recipe-declared node — never a shared or
  hard-coded one

### Requirement: A generic pick/resume command submits a resolved pick for any wired Recipe's any gate

The system SHALL provide `pickCommand(brand, ideaId, recipe, gate, pick, options)`
(`src/commands/pick.ts`, exposed as `/pick <brand> <idea-id> <recipe> <gate> <pick>`): it SHALL resolve
the gate AFTER `gate` in the named Recipe's own declared `gates` list (`nextGateAfter` — `null` when
`gate` was the Recipe's last one, or when the Recipe is unwired/unknown, defensively), enqueue the
Production Queue's generic next leg (`enqueueNextLeg`, issue #56) for `(brand, idea_id, recipe)` carrying
`pick`, and clear `gate` (`markPickConsumed`). This command SHALL NEVER read the ledger and SHALL NEVER
attempt to resolve which candidate the Operator means — `pick` is supplied ALREADY RESOLVED by the
caller. A next-leg job already queued for the resolved target gate SHALL be left untouched
(idempotent — no duplicate, no claimed change). An empty `pick` value SHALL be refused without touching
the queue.

#### Scenario: /pick enqueues the generic next leg and clears the resolved gate, for any Recipe/gate

- **GIVEN** an arbitrary wired-or-unwired Recipe slug and gate name (not tied to the *Character
  Explainer with Cast* Recipe's Cast gate) and a resolved pick value
- **WHEN** `/pick <brand> <idea-id> <recipe> <gate> <pick>` is run
- **THEN** the Production Queue gains a `queued` next-leg job for `(brand, idea_id, recipe)` carrying
  `pick`, targeting the resolved next gate (or `null`)
- **AND** an `awaiting_pick` job at `<gate>` for that triple, if any, moves to `done`

#### Scenario: /pick is idempotent per resolved next gate

- **GIVEN** `/pick` has already been run once for a given `(brand, idea, recipe)` resolving to a
  specific next gate
- **WHEN** `/pick` is run again for the SAME `(brand, idea, recipe)` targeting the SAME resolved next
  gate, with a DIFFERENT pick value
- **THEN** no second job is enqueued, the output reports no change, and the FIRST resolved pick still
  stands on the queue

#### Scenario: /pick refuses an empty pick value without touching the queue

- **GIVEN** an empty or whitespace-only pick value
- **WHEN** `/pick <brand> <idea-id> <recipe> <gate> <pick>` is run
- **THEN** it refuses with an identifiable message and the Production Queue is unchanged

### Requirement: injectSpec injects into the Recipe's OWN prompt node, never a hard-coded one

`injectSpec(port, spec, promptNode, poll)` (`src/space-driver/driver.ts`) SHALL inject a Production
Spec into the on-canvas text node named by the CALLER-supplied `promptNode` argument — the Recipe's
own `canvasInputs.promptNode` (`src/recipe/registry.ts`) — via the Fallback Protocol, then read back
THAT SAME node and confirm the text changed. It SHALL NOT hard-code `"JSON Master"` (or any other
fixed node name) internally: `promptNode` is a required parameter, so the SAME function correctly
injects into `"JSON Master"` for the wired *Character Explainer with Cast* Recipe and into
`"Slides Prompts"` for the *News Carousel* Recipe. `injectGoal(spec, promptNode)` SHALL build the
inject goal naming `promptNode`. A missing target node for readback SHALL fail with the
`prompt_node_missing` error code (renamed from the retired `json_master_missing`, since the missing
node is no longer always `JSON Master`).

`DriveLegInput`'s `"first"` variant SHALL carry a required `promptNode: string` field;
`driveToNextGate`'s first-leg branch SHALL call `injectSpec(port, input.spec, input.promptNode, poll)`
— the Recipe's own prompt node, resolved by the CALLER from `Recipe.canvasInputs.promptNode`, never
assumed by the driver itself.

#### Scenario: injectSpec injects into a Recipe-supplied prompt node other than JSON Master

- **GIVEN** a fake Space whose sole text node is named `"Slides Prompts"` (no `"JSON Master"` node
  exists at all) and a candidate Spec
- **WHEN** `injectSpec(port, spec, "Slides Prompts", poll)` is called
- **THEN** it issues an edit naming `"Slides Prompts"`, confirms the readback changed, and returns
  `{ ok: true, text }` — proving the function is not hard-coded to any one node name

#### Scenario: The wired Character Explainer Recipe's behaviour is byte-identical (JSON Master, same value)

- **GIVEN** the character-Recipe fake Space and a candidate Spec
- **WHEN** `injectSpec(port, spec, "JSON Master", poll)` is called (the SAME literal value the driver
  used internally before this change)
- **THEN** the observable behaviour (edit goal content, readback confirmation, error codes) is
  identical to before this change — proven by the pre-existing `driver.test.ts` assertions passing
  unmodified apart from the added explicit `promptNode` argument

#### Scenario: A missing prompt node for readback fails with prompt_node_missing

- **GIVEN** a fake Space with no node matching the supplied `promptNode`
- **WHEN** `injectSpec(port, spec, promptNode, poll)` is called
- **THEN** it returns `{ ok: false, error: { code: "prompt_node_missing", ... } }`

### Requirement: bindMediaAsset binds a Brand Asset's local media into a named node via the Fallback Protocol

The system SHALL provide `bindMediaAsset(port, path, media, nodeName, poll)`
(`src/space-driver/driver.ts`) — binding a Brand Asset's LOCAL media file (image/video/audio) into a
named on-canvas reference node (a Recipe's brand-asset media slot target, ADR-0016's bind phase).
It SHALL issue exactly one natural-language edit (`bindMediaGoal(path, media, nodeName)`, naming the
path, the media kind, and the target node) via `port.edit`, poll it to terminal, and confirm the bind
via `port.verifyPinned(path)` — REUSING the SAME port primitives `pinPick` already uses to confirm a
Character pin, so NO new `SpaceMcpPort` method is introduced. A failed edit SHALL return
`{ ok: false, error: { code: "media_bind_edit_failed", ... } }`; an unconfirmed bind SHALL return
`{ ok: false, error: { code: "media_bind_unconfirmed", ... } }`; success SHALL return
`{ ok: true, pick: path }`.

#### Scenario: bindMediaAsset issues one edit and confirms via port.verifyPinned

- **GIVEN** a fake Space that confirms any bound value via `verifyPinned`
- **WHEN** `bindMediaAsset(port, "/tmp/brand-logo.png", "image", "Brand Logo", poll)` is called
- **THEN** it returns `{ ok: true, pick: "/tmp/brand-logo.png" }`, and exactly one edit was issued,
  naming `"Brand Logo"`

#### Scenario: bindMediaAsset fails media_bind_edit_failed when the bind edit itself fails

- **GIVEN** a fake Space whose edit reports a terminal `failed` status
- **WHEN** `bindMediaAsset` is called
- **THEN** it returns `{ ok: false, error: { code: "media_bind_edit_failed" } }`

#### Scenario: bindMediaAsset fails media_bind_unconfirmed when the port cannot confirm the bind

- **GIVEN** a fake Space whose `verifyPinned` always returns `false`
- **WHEN** `bindMediaAsset` is called
- **THEN** it returns `{ ok: false, error: { code: "media_bind_unconfirmed" } }`

### Requirement: setWatermarkHandle sets the Brand's @handle onto a Recipe-declared node, surgically (QA-1)

The system SHALL provide `setWatermarkHandle(port, handle, nodeName, poll)`
(`src/space-driver/driver.ts`) — restoring, generically, the pre-#88 watermark-`@handle` step
(`replace_text` on the real, captured `"Watermark instructions"` node,
`src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt`). It SHALL issue exactly
one natural-language edit (`watermarkGoal(handle, nodeName)`, naming the handle and the target node,
stating that ONLY the `@handle` placeholder changes and every other word of the node's existing text
stays untouched) via `port.edit`, poll it to terminal, then read back `nodeName` and confirm its text
now includes `handle`. A failed edit SHALL return
`{ ok: false, error: { code: "watermark_edit_failed", ... } }`; a missing target node for readback
SHALL return `{ ok: false, error: { code: "watermark_node_missing", ... } }`; an unconfirmed apply
SHALL return `{ ok: false, error: { code: "watermark_unconfirmed", ... } }`; success SHALL return
`{ ok: true, text }` (the confirmed new node text). This is a GENERIC primitive: it never assumes
which Recipe or node it is called for — only a Recipe that declares
`space.nodes.watermarkNode` (`src/recipe/registry.ts`) is ever driven through it, by the caller.

#### Scenario: setWatermarkHandle issues one edit and confirms the readback now carries the handle

- **GIVEN** a fake Space whose node's text already carries a bare `@handle` placeholder
- **WHEN** `setWatermarkHandle(port, "@strawmotion", "Watermark instructions", poll)` is called
- **THEN** it returns `{ ok: true, text }` where `text` includes `"@strawmotion"`, and exactly one
  edit was issued naming both the handle and `"Watermark instructions"`

#### Scenario: setWatermarkHandle fails watermark_edit_failed when the edit itself fails

- **GIVEN** a fake Space whose edit reports a terminal `failed` status
- **WHEN** `setWatermarkHandle` is called
- **THEN** it returns `{ ok: false, error: { code: "watermark_edit_failed" } }`

#### Scenario: setWatermarkHandle fails watermark_unconfirmed when the readback never shows the handle applied

- **GIVEN** a fake Space whose edit succeeds but the node's text never actually changes
- **WHEN** `setWatermarkHandle` is called
- **THEN** it returns `{ ok: false, error: { code: "watermark_unconfirmed" } }`

#### Scenario: setWatermarkHandle fails watermark_node_missing when the target node cannot be read back

- **GIVEN** a fake Space with no node matching the supplied `nodeName`
- **WHEN** `setWatermarkHandle` is called
- **THEN** it returns `{ ok: false, error: { code: "watermark_node_missing" } }`

