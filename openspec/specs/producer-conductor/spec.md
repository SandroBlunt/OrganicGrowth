# producer-conductor Specification

## Purpose
TBD - created by archiving change issue-88-thin-recipe-generic-producer. Update Purpose after archive.
## Requirements
### Requirement: resolveIdeaFormat resolves an Idea's Format from its ledger record, defensively

The system SHALL provide `resolveIdeaFormat(idea, ideaId)` (`src/producer/resolve-format.ts`), a pure
function that resolves the Format slug governing an Idea's production from the ledger's
`LedgerIdea.format` field (`src/ledger/ledger.ts`). When `idea.format` is a non-empty, non-blank
string, it SHALL return `{ ok: true, format }` (trimmed). When `idea.format` is absent, blank, or not
a string — the expected shape for an Idea recorded before multi-format existed — it SHALL return
`{ ok: false, message }`, where `message` names `ideaId` and explains the Idea carries no Format,
never a fabricated/guessed default. The function SHALL never throw for any input shape.

`src/ledger/ledger.ts`'s `LedgerIdea` SHALL carry an optional `format?: string` field, read through
UNCHANGED by `loadIdeas` (mirroring how `recipes` is already carried through): a well-formed string is
included; a missing, non-string, or blank raw value is OMITTED entirely (never included as
`undefined`, never fabricated) — an old ledger record with no `format` at all continues to load
without error.

#### Scenario: An Idea with a recorded Format resolves ok

- **GIVEN** a ledger Idea record whose `format` is `"unhypped-news"`
- **WHEN** `resolveIdeaFormat(idea, "idea-01")` is called
- **THEN** it returns `{ ok: true, format: "unhypped-news" }`

#### Scenario: An Idea with no Format recorded (a pre-multi-format record) STOPs, never crashes

- **GIVEN** a ledger Idea record with no `format` field at all
- **WHEN** `resolveIdeaFormat(idea, "idea-01")` is called
- **THEN** it returns `{ ok: false, message }` where `message` names `"idea-01"` and states the Idea
  carries no Format, and the call does not throw

#### Scenario: loadIdeas carries a recorded format through; omits a missing/garbled one entirely

- **GIVEN** a ledger with one Idea record carrying `format: "unhypped-news"` and another with no
  `format` field
- **WHEN** `loadIdeas(path)` is called
- **THEN** the first Idea's `format` is `"unhypped-news"` and the second Idea's `format` is
  `undefined` (the key entirely absent from the returned object, mirroring how `recipes` is omitted)

### Requirement: bindMediaSlots resolves a Recipe's declared media slots, STOPping on a missing REQUIRED one

The system SHALL provide `bindMediaSlots(recipe, resolutions)` (`src/producer/bind-media.ts`), a pure
function that walks `recipe.canvasInputs.mediaSlots` (`src/recipe/registry.ts`) against an
already-looked-up `MediaSlotResolutions` map (slot name -> `{ kind, found, ... }`, supplied by the
caller — this module performs no I/O, no `BrandAssetStore` call, no Magnific call itself). For each
slot: a `found: true` resolution is BOUND (added to the result's `bound` list and `boundSlotNames`
set); a REQUIRED slot with no resolution, or a `found: false` one, SHALL STOP the entire bind
immediately, returning `{ ok: false, missingSlot, message }` — `message` SHALL be the looked-up
resolution's own `message` when supplied (e.g. `BrandAssetStore.getBrandAsset`'s own hint), or a
generic ADR-0016 message naming the slot and Recipe otherwise. An OPTIONAL slot with no resolution
SHALL simply be skipped, never blocking. The function SHALL NEVER return `ok: true` with a required
slot left unbound (ADR-0016: never bind a half-complete Asset).

#### Scenario: A found brand-asset slot binds; the bound-slot-names set is ready for auditBindMediaPhase

- **GIVEN** the seeded `news-carousel` Recipe (one required `"Brand Logo"` brand-asset slot) and a
  resolution `{ "Brand Logo": { kind: "brand-asset", found: true, path } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `{ ok: true, bound: [{ name: "Brand Logo", ... }], boundSlotNames: Set(["Brand Logo"]) }`

#### Scenario: A found idea-pick slot binds — the character Recipe's Selected Character

- **GIVEN** the seeded `character-explainer-with-cast` Recipe (one required `"Selected Character"`
  idea-pick slot) and a resolution `{ "Selected Character": { kind: "idea-pick", found: true, pick } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `ok: true` with that slot bound, carrying the resolved `pick`

#### Scenario: A missing REQUIRED brand-asset slot STOPs with the store's own clear message

- **GIVEN** the seeded `news-carousel` Recipe and a resolution `{ "Brand Logo": { kind: "brand-asset", found: false, message: "Brand Asset \"brand-logo\" not found for Brand \"straw-motion\" ..." } }`
- **WHEN** `bindMediaSlots(recipe, resolutions)` is called
- **THEN** it returns `{ ok: false, missingSlot: "Brand Logo", message }` where `message` is exactly
  the supplied lookup message — never a generic placeholder that discards the real reason

#### Scenario: A REQUIRED slot with NO resolution supplied at all STOPs with a generic ADR-0016 message

- **GIVEN** the seeded `news-carousel` Recipe and an EMPTY resolutions map
- **WHEN** `bindMediaSlots(recipe, {})` is called
- **THEN** it returns `ok: false`, `missingSlot: "Brand Logo"`, and `message` mentions the slot is
  REQUIRED, cites ADR-0016, and states a half-complete Asset is never bound

### Requirement: A gate-free Recipe (News Carousel) runs end-to-end against a second, purpose-built Magnific fake

The system SHALL provide a SECOND Magnific fake, `FakeCarouselSpace`
(`src/producer/fixtures/fake-carousel-space.ts`), implementing the SAME narrow `SpaceMcpPort`
(`src/space-driver/port.ts`) as the character-Recipe's existing `FakeSpace`, but modelling the News
Carousel Recipe's genuinely different canvas shape — REBUILT to the REAL, captured single-lane shape
(issue #86/#89, see the new Requirement below): a `"JSON Master"` node that is simultaneously the
prompt node and the sole gateless run-point, plus a named `"Brand_Logo"` reference node — never reusing
the character-Recipe fake's hard-coded node names. Driving a News Carousel job's FIRST (and only) leg
through `driveToNextGate` against this fake SHALL bind the `"Brand_Logo"` media slot (via
`bindMediaAsset`), inject the authored Spec into the Recipe's OWN `canvasInputs.promptNode`, run the
Recipe's sole run-point, and FINISH with the rendered Asset — with NO pause anywhere, since this Recipe
declares zero gates (`Recipe.gates` is `[]`).

#### Scenario: A gate-free News Carousel job runs straight through to a finished Asset

- **GIVEN** the seeded `news-carousel` Recipe (zero declared gates), a `FakeCarouselSpace`, a found
  `Brand_Logo` resolution, and the real, committed Straw Motion carousel Spec fixture (issue #87)
- **WHEN** the `Brand_Logo` slot is bound via `bindMediaAsset`, then `driveToNextGate` is called with
  `{ kind: "first", targetGate: null, spec, promptNode: recipe.canvasInputs.promptNode }`
- **THEN** the result is `ok: true` with `outcome.kind === "finished"`, carrying the rendered Asset's
  id and URL, and the fake recorded exactly one media-bind edit, one Spec-inject edit, and one render
  run — no pause, no publish action anywhere

#### Scenario: A missing required Brand Asset STOPs the run before any Space call

- **GIVEN** the seeded `news-carousel` Recipe and a `found: false` `Brand_Logo` resolution
- **WHEN** `bindMediaSlots` is called with that resolution
- **THEN** it returns `ok: false` naming the `"Brand_Logo"` slot, and a freshly-constructed
  `FakeCarouselSpace` for the same scenario records ZERO edit goals and ZERO runs — the STOP happens
  before any Space interaction is even attempted

### Requirement: The FakeCarouselSpace replays the live Carrousel capture's exact node inventory

The system SHALL prove `FakeCarouselSpace`'s node inventory matches the sanctioned live capture of the
real "Carrousel" Space (issue #86,
`src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json`) exactly — never a
hand-typed approximation that could silently drift. A test SHALL parse the capture file directly and
compare it against the fake's exported, typed inventory constants: the 7 node names + their real
Magnific element `type`s (in capture order), the 5 connections (source/target node names + ports + data
type, resolved from the capture's raw element ids), the Producer Protocol node's parsed `run_points`
(equal to `canonicalCarouselProtocol()`: `start: "JSON Master"`, zero gates), the Image Generator's real
settings (`imagen-nano-banana-2-flash` mode, `3:4` aspect ratio, `1k` resolution — the Operator confirmed
flash-vs-non-flash 2026-07-18, no canvas change), and the 7 real slide creation identifiers from the
capture's "Generated slides" list. The test SHALL also assert the OLD placeholder names
(`"Slides Prompts"`, `"Brand Logo"`) are NOT present on the real captured canvas at all.

#### Scenario: The fake's node inventory equals the capture's elements, name-for-name and type-for-type

- **GIVEN** `FakeCarouselSpace`'s exported `CARROUSEL_NODE_INVENTORY` and the parsed capture file
- **WHEN** they are compared
- **THEN** they are deep-equal: 7 entries, same names, same Magnific element types, same order

#### Scenario: The fake's connections equal the capture's wiring, resolved from element ids to names

- **GIVEN** `FakeCarouselSpace`'s exported `CARROUSEL_CONNECTIONS` and the capture's `connections` array
  (with `sourceElementId`/`targetElementId` resolved to node names via the capture's own elements)
- **WHEN** they are compared
- **THEN** they are deep-equal: 5 entries, same source/target names, same ports, same data type

#### Scenario: The capture's Producer Protocol node holds the SAME run_points canonicalCarouselProtocol() declares

- **GIVEN** the capture's `"Producer Protocol"` node's `data.text`, JSON-parsed
- **WHEN** it is compared to `canonicalCarouselProtocol()`
- **THEN** they are deep-equal — one run-point, `start: "JSON Master"`, `gate: null`

#### Scenario: The old placeholder node names are absent from the real captured canvas

- **GIVEN** the capture's 7 element names
- **WHEN** they are checked for `"Slides Prompts"` and `"Brand Logo"`
- **THEN** neither is present — the earlier placeholders named no real canvas node at all

### Requirement: producer.md loads the Skill named by Recipe.copySkill for the shared copy phase

`.claude/agents/producer.md`'s Copy-phase section SHALL document loading the copywriting Skill named by
the resolved Recipe's `copySkill` field (`src/recipe/registry.ts`), via the Skill tool
(`.claude/skills/<slug>/SKILL.md`), and following it as the producer's own writing instructions for the
caption — exactly mirroring how the Author phase already loads that Recipe's own media-authoring Skill
by the job's Recipe slug. This SHALL NOT hard-code a single copy-Skill name as the only possibility: the
doc SHALL resolve it from the Recipe's own field, so a future Recipe naming a different `copySkill`
requires no edit to this agent's own prose. The doc SHALL still state that, once the media exists, the
producer sharpens the ACTUAL produced on-slide narrative into the caption (for a multi-slide Recipe),
and SHALL retain every pre-existing reference this phase already documents:
`src/copy/inject.ts`'s `injectRequiredParts`, `src/copy/validate.ts`'s `validateCopy`, `auditCopyPhase`,
and ADR-0012.

#### Scenario: The Copy-phase section resolves the Skill from Recipe.copySkill, never a hard-coded name

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it names `Recipe.copySkill` (or `copySkill`) and `src/recipe/registry.ts`, and states the
  Skill is loaded via the Skill tool

#### Scenario: The doc's own example copySkill slug matches the LIVE registry's real value

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section, and the live registry's
  `getRecipe("news-carousel")!.copySkill` / `getRecipe("character-explainer-with-cast")!.copySkill`
- **WHEN** the doc's own example slug is compared against BOTH
- **THEN** they are equal — a future rename of `copySkill` in the registry, without a matching doc
  update, fails this scenario loudly rather than drifting silently

#### Scenario: The Copy-phase section still documents sharpening the produced on-slide narrative

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it states that, once the media exists, the producer sharpens the ACTUAL produced on-slide
  narrative into the caption for a multi-slide Recipe

#### Scenario: Every pre-existing Copy-phase reference is retained

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it still names `src/copy/inject.ts`, `injectRequiredParts`, `src/copy/validate.ts`,
  `validateCopy`, `auditCopyPhase`, and `ADR-0012`

### Requirement: The Save phase writes the Asset's self-contained .output/ bundle, never the retired .assets/ name

`.claude/agents/producer.md`'s Save phase SHALL compute the downloaded-media destination directory via
`src/asset/output-bundle.ts`'s `outputDirFor(ideaId, run, ideasRoot, recipe)` — `idea-NN.<recipe>
.output/`, replacing the retired `idea-NN.<recipe>.assets/` name — download every finished creation's
bytes there (`downloadAssetFiles`, unchanged mechanism), write `caption.txt` from the composed Copy
(`writeCaptionText`), write the Asset to the Brand's ledger exactly as ADR-0011 already shapes it
(`asset_paths` pointing into that SAME `.output/` directory, in slide order), and — AFTER that ledger
write — call `refreshOutputBundle(brand, ideaId, recipe, { ledgerPath })` to write the initial
`post.json`. It SHALL also state, in plain terms, that an Asset produced BEFORE this slice keeps
whatever `.assets/`-named directory its `asset_paths` already point into — the Save phase never renames
an existing directory, and `refreshOutputBundle` keeps refreshing `post.json` there in place.

#### Scenario: producer.md documents the .output/ destination, caption.txt, and the post-write refresh

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Save phase section is read
- **THEN** it names `outputDirFor` and the `.output/` directory (not `.assets/`) as the download
  destination for a NEW Asset, names `writeCaptionText`/`caption.txt`, and states that
  `refreshOutputBundle` is called AFTER the ledger write to produce the initial `post.json`

#### Scenario: producer.md states the backward-compat rule for an already-produced Asset

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Save phase section is read
- **THEN** it states that an Asset produced before this slice keeps its existing `.assets/`-named
  directory (never renamed), and that `post.json` still refreshes there

#### Scenario: Every pre-existing pinned fact in producer.md survives this rewrite

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** it is checked against every substring `src/production-spec/producer-agent.docs-test.ts`
  already pinned before this slice (Production Spec, never publish, ADR-0008, `awaiting_pick`, no
  `awaiting_cast`, the thin/recipe-generic-conductor phrase, `bindMediaSlots`/ADR-0016,
  `auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase`/ADR-0017, `driveToNextGate`/`Recipe.gates`,
  the watermark-step block, and the absence of "Selected Character"/"Character Variants
  Generator"/"Slides Prompts"/quoted "Brand Logo")
- **THEN** every one of those pins still holds

### Requirement: producer.md documents downloading a paused leg's candidates to a local .cast/ folder before recording the pause

`.claude/agents/producer.md`'s "Drive the canvas" section SHALL document that, for ANY leg that PAUSES
(`DriveOutcome.kind === "paused"`), the Producer downloads every one of that leg's rendered candidates
via `src/asset/cast-candidates.ts`'s `downloadCastCandidates(destDir, candidates)` into
`castCandidatesDirFor(ideaId, run, ideasRoot, recipe)`'s folder — `idea-NN.<recipe>.cast/`, distinct from
`.output/` and `.spec.json` — and writes the Idea's Asset to the ledger with the downloaded `cast`
(each candidate carrying `path` alongside its existing `identifier`/`url`) in the SAME write that records
`pending_gate`. This SHALL be documented as GENERIC to any Recipe with a gated first leg, never hard-coded
to the one wired *Character Explainer with Cast* Recipe. It SHALL also document that `/pick-cast`'s own
output then names the picked candidate's local `path` when present, falling back to its `url` otherwise.

#### Scenario: producer.md names the download primitives and the .cast/ destination

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it names `castCandidatesDirFor`, `downloadCastCandidates`, and the `.cast/` folder as the
  download destination for a paused leg's candidates

#### Scenario: producer.md states the step generalizes to any gated Recipe, never hard-coded

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it names `DriveOutcome.kind === "paused"` as the trigger and states the step is never
  hard-coded to one Recipe

#### Scenario: producer.md states the download happens in the SAME ledger write that records the pause

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it states the downloaded `cast` (carrying `LedgerCastCandidate.path`) is written in the SAME
  ledger write that records the gate pause

#### Scenario: producer.md states /pick-cast surfaces the local path, falling back to the remote url

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it states `/pick-cast`'s output names the picked candidate's local `path` when present,
  falling back to its `url` for a legacy/un-downloaded candidate

#### Scenario: Every pre-existing pinned fact in producer.md survives this addition

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** it is checked against every substring `src/production-spec/producer-agent.docs-test.ts`
  already pinned before this slice (Production Spec, never publish, ADR-0008, `awaiting_pick`, the
  thin/recipe-generic-conductor phrase, `driveToNextGate`/`Recipe.gates`, the watermark-step block, and
  the Save-phase `.output/`/`outputDirFor`/`refreshPostJson` block)
- **THEN** every one of those pins still holds

### Requirement: producer.md documents composing one Copy variant per targeted Channel platform

`.claude/agents/producer.md`'s Copy-phase section SHALL document reading the Brand's FULL Channel list
(`loadChannels`, ADR-0019) before drafting — every entry's `platform`, not just the primary — and, when
more than one platform is targeted, drafting ONE variant per targeted platform from the SAME produced
material (never one shared caption). It SHALL state that the primary Channel's variant is checked with
`validateCopy` against the Recipe's own `copyShape`, never `platform-shape.ts`'s own bounds, while every
other targeted platform's variant is checked with `validateCopyForPlatform`. It SHALL state that a
single-Channel Brand keeps drafting just the one caption, unchanged, and that the saved Asset carries
`copy.variants` (`src/copy/contract.ts`'s `Copy.variants`) only when more than one platform was
targeted. The output-bundle description SHALL state that `caption.txt` renders every variant, labeled by
platform, when more than one is targeted.

#### Scenario: The Copy-phase section reads the Brand's full Channel list before drafting

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it names `loadChannels`, `ADR-0019`, and states this covers every Channel entry, not just
  the primary

#### Scenario: The Copy-phase section instructs one variant per targeted platform, and states the single-Channel case is unchanged

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it instructs drafting one variant per targeted platform from the same produced material,
  and separately states a single-Channel Brand keeps drafting just the one caption, unchanged

#### Scenario: The Copy-phase section names the two per-variant checkers

- **GIVEN** `.claude/agents/producer.md`'s Copy-phase section
- **WHEN** it is read
- **THEN** it names `validateCopyForPlatform` for every non-primary targeted platform, and states the
  primary Channel never consults `platform-shape.ts`'s own bounds

#### Scenario: The output bundle description states caption.txt labels every variant by platform

- **GIVEN** `.claude/agents/producer.md`'s Save-phase / output-bundle description
- **WHEN** it is read
- **THEN** it states that, when more than one platform is targeted, `caption.txt` renders every
  variant, each under its own `=== PLATFORM ===` label

