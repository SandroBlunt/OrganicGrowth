# docs-conformance Specification

## Purpose
TBD - created by archiving change issue-59-docs-present-tense. Update Purpose after archive.
## Requirements
### Requirement: The engineering documentation set describes the built attended, multi-format flow in present tense

The engineering documentation set SHALL describe capabilities that are actually built and green on
`main` in present tense — `CLAUDE.md`, the content-agent definitions (`.claude/agents/*.md`), and the
command definitions (`.claude/commands/*.md`) — never marked `Target (…)`, "not yet wired", "not built
yet", or "being migrated onto that model" once the capability is shipped. Conversely, a capability that
is genuinely NOT built (e.g. a
second wired Recipe beyond the one *Character Explainer with Cast* entry) SHALL NOT be described as if it
already exists. Concretely: `CLAUDE.md`'s pipeline steps SHALL document `/run-trends <brand> <format>`
(Format-scoped Runs, ADR-0013), Review picking Recipes (ADR-0009), the Production Queue keyed
`(brand, idea, recipe)`, the generic `/pick` command alongside its `/pick-cast` alias (ADR-0010), and
`/log-post <brand> <idea-id> <recipe> <post-url>` (Recipe-explicit attribution, ADR-0011) — none of these
behind a `Target`/`not built yet` marker.

#### Scenario: CLAUDE.md carries no future-tense scaffolding for shipped capabilities

- **GIVEN** `CLAUDE.md` as shipped in this repository
- **WHEN** it is searched for `Target (`, `not yet`, `not built`, `being migrated`, or `single-recipe`
- **THEN** no match describes the multi-format model, the per-Recipe Production Queue, or the per-Asset
  ledger grain as future/unbuilt — those capabilities are described as they run today

#### Scenario: CLAUDE.md documents the ADR-0011 split lifecycle, not the retired flat one

- **GIVEN** `CLAUDE.md`'s `## State` section
- **WHEN** it is read
- **THEN** it states the Idea's own lifecycle is `suggested / accepted / rejected`
- **AND** it states each chosen Recipe's Asset separately moves through
  `queued → in_production → produced → posted → tracking → scored`
- **AND** it does NOT claim the Idea itself carries a flat `casting`/`produced`/`posted` status (that
  status moved onto the Asset in ADR-0011)

#### Scenario: producer.md's queue-job schema description matches the live schema, not the retired one

- **GIVEN** `.claude/agents/producer.md`'s "Queue jobs follow the store schema" guardrail
- **WHEN** it is compared against `src/production-queue/queue.ts`'s exported `QueueJob`/`JobStatus` types
- **THEN** it names the CURRENT fields (`recipe`, `gate`, `status` including `awaiting_pick`, and the
  optional `pick`)
- **AND** it does NOT name the retired `phase: cast|render` field or the retired `awaiting_cast` status

#### Scenario: pick-cast.md documents the Asset-grain Cast-gate lifecycle, not the retired flat Idea status

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** it is read
- **THEN** it states the Idea's own status is untouched by a pick (stays `accepted` throughout)
- **AND** it states it is the Asset that pauses `in_production` (with `pending_gate: "cast"`) at the Cast
  gate and, after the pick, moves `in_production → produced`
- **AND** it does NOT claim the Idea's own status chain runs `casting → produced`, and does NOT claim "a
  `casting` Idea is paused at the Cast gate" (both are the retired flat Idea-status model ADR-0011
  replaced — QA Round-1 defect QA-1 found this exact regression)

#### Scenario: A doc never claims a second Recipe is wired

- **GIVEN** any of `CLAUDE.md`, `.claude/agents/producer.md`, `.claude/commands/run-pipeline.md`
- **WHEN** they describe the Recipe registry
- **THEN** they state exactly one Recipe is wired today (*Character Explainer with Cast*) and that the
  registry is multi-Recipe-ready — never implying a second Recipe already exists (that is issue #60,
  explicitly future work)

### Requirement: Docs-conformance tests pin the CURRENT reality, never a superseded honesty disclaimer

The `*.docs-test.ts` suite (`npm run test:docs`) SHALL assert claims that are true of the code as it
stands on `main` today. A subtest SHALL NOT require a doc to carry a "not yet wired"/"not yet
operational"/audit-finding-citation disclaimer once the described capability is actually wired and
tested — doing so would force the doc to say something false to keep the test green. Where a prior
disclaimer is retired, the replacement assertion SHALL still pin a real, checkable claim (not merely
assert the disclaimer's absence with nothing to replace it) wherever a meaningful positive claim is
available.

#### Scenario: report.docs-test.ts asserts pick-cast.md's attended-runtime claim, not the retired disclaimer

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc states the render runs in the Operator's session, that there is no
  unattended background worker, and that it cites ADR-0008
- **AND** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT
- **AND** the suite still asserts the doc promises the command records the Character correctly (the
  positive claim carried over unchanged)

#### Scenario: run-pipeline.docs-test.ts asserts the attended runtime and per-Recipe gates, not "not built yet"

- **GIVEN** `.claude/commands/run-pipeline.md` as shipped
- **WHEN** `src/commands/run-pipeline.docs-test.ts` reads it
- **THEN** the suite asserts the doc names the attended runtime, cites ADR-0008, and states production
  runs "in your session"
- **AND** the suite asserts the doc describes gates as per-Recipe (ADR-0009) without calling the
  multi-format model unbuilt (no "being migrated"/"single-recipe build" wording)

#### Scenario: producer-agent.docs-test.ts asserts the live queue schema instead of the retired "not yet wired" claim

- **GIVEN** `.claude/agents/producer.md` as shipped
- **WHEN** `src/production-spec/producer-agent.docs-test.ts` reads it
- **THEN** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT, that the doc cites
  ADR-0008, and that it states it runs attended in the Operator's own session
- **AND** the suite asserts the doc's queue-job schema description names the CURRENT `recipe` field and
  `awaiting_pick` status, and does NOT name the retired `awaiting_cast` status — a real, checkable pin
  against production code that replaces the retired assertion, not a rubber stamp

#### Scenario: report.docs-test.ts pins pick-cast.md's Asset-grain status vocabulary (QA-1 regression guard)

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc names the Asset's `in_production` status and `pending_gate` field
- **AND** the suite asserts the doc does NOT claim the Idea's own status chain runs `casting → produced`
- **AND** the suite asserts the doc does NOT claim "a `casting` Idea is paused" at the Cast gate
- **AND** these two negative guards are verified (not merely asserted) to fail against the exact
  pre-fix doc text that caused QA Round-1's defect QA-1, so the guard is a genuine regression test, not
  a rubber stamp

### Requirement: The repository retains no dead ADR-0004 unattended-background-worker code

ADR-0008 superseded ADR-0004's unattended, background Production Queue worker; that code SHALL NOT be
present or referenced. `src/production-queue/scheduler.ts` is NOT part of that dead code — it is the
LIVE decision logic the generic gate-resume flow (`/pick`, `/pick-cast`) drives (issue #57) — and SHALL
be retained.

#### Scenario: worker.ts is absent and unreferenced

- **GIVEN** the repository as shipped
- **WHEN** it is searched for `src/production-queue/worker.ts` and any import of it
- **THEN** no such file and no such import exists

#### Scenario: scheduler.ts is retained because it is live, not dead

- **GIVEN** the repository as shipped
- **WHEN** `src/commands/pick.ts` is inspected
- **THEN** it imports `markPickConsumed` from `src/production-queue/scheduler.ts`
- **AND** `scheduler.ts` and its test file are present (not deleted)

### Requirement: producer.md is a thin, recipe-generic conductor with no recipe-specific procedure

`.claude/agents/producer.md` SHALL describe the Producer as a thin conductor that resolves every
Recipe-specific fact — gates, the Magnific Space it drives (and the on-canvas node NAMES it touches),
its Production-Spec shape, its copy shape, its typed canvas media slots, and its six ordered Phase
Contracts — from `src/recipe/registry.ts`'s `getRecipe(job.recipe)`, and that runs that Recipe's own
producer Skill BY SLUG (`.claude/skills/produce-*/`) for the author phase. It SHALL NOT hard-code any
one Recipe's own canvas node names (e.g. `"Character Variants Generator"`, `"Selected Character"`)
anywhere in its prose. It SHALL describe resolving the Idea's Format from the ledger record via
`resolveIdeaFormat` (STOPping, never guessing, when absent), binding media slots via `bindMediaSlots`
(STOPping on a missing required slot, ADR-0016), self-auditing each phase via
`auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase` (ADR-0017) before advancing, and driving the
canvas via the generic `driveToNextGate`, pausing ONLY at that Recipe's own declared `gates`. It SHALL
NOT read `production.space_id` (or any other Brand Profile field) to resolve a Space id — that field
is retired; the canvas id comes ONLY from the resolved Recipe's own `space.id`.

#### Scenario: producer.md resolves every Recipe-specific fact from the registry, never hard-coding one Recipe's shape

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `src/recipe/registry.ts`'s `getRecipe(job.recipe)` as the source of a job's gates/
  canvas/Spec-and-copy-shapes/phase contracts, and states it is a "thin, recipe-generic conductor"

#### Scenario: producer.md never reads production.space_id from a Brand Profile

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is searched for `production.space_id`
- **THEN** there is no match — the doc instead states the canvas id comes from the Recipe and that no
  Brand Profile field is ever read for it

#### Scenario: producer.md never hard-codes the wired Recipe's own canvas node names

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is searched for `"Character Variants Generator"` and `"Selected Character"`
- **THEN** there is no match — those node names are the wired Recipe's own data, living on the Recipe
  registry and its Skill, never in the generic conductor's own prose

#### Scenario: producer.md describes running a Recipe's producer Skill by slug

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names both `produce-character-explainer` and `produce-news-carousel` as the Skill slugs
  it invokes for the author phase, dispatched by the queue job's `recipe` field

### Requirement: producer.md restores the watermark-@handle step, as a generic Recipe-declared step (QA-1)

`.claude/agents/producer.md` SHALL describe setting the Brand's watermark `@handle`
(`src/production-spec/brand-profile.ts`'s `loadWatermarkHandle`) onto a Recipe-declared
`watermarkNode` (`Recipe.space.nodes.watermarkNode`) via `src/space-driver/driver.ts`'s
`setWatermarkHandle`, BEFORE that leg's render — as a GENERIC step that only runs at all for a Recipe
that declares a `watermarkNode`, skipping cleanly when the Brand's handle is blank (never failing the
run over an unset optional field). It SHALL state the watermark `@handle` is NOT part of the Asset's
Copy (ADR-0012). This restores, generically, the pre-#88 doc's `replace_text`/`"Watermark
instructions"`/`@handle` instruction that Round 1 of this slice silently dropped (QA-1).

#### Scenario: producer.md describes the watermark step, generically, naming the exact primitives

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it mentions `watermarkNode`, `Recipe.space.nodes.watermarkNode`, `setWatermarkHandle`
  (`src/space-driver/driver.ts`), and `loadWatermarkHandle` (`src/production-spec/brand-profile.ts`)

#### Scenario: producer.md states the watermark step is skipped cleanly when the Brand's handle is blank

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states a blank/unconfigured watermark handle is skipped cleanly, never failing the run

#### Scenario: producer.md states the watermark @handle is not part of the Asset's Copy

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the watermark `@handle` is NOT part of the Asset's Copy, citing ADR-0012

