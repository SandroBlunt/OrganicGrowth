## ADDED Requirements

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
