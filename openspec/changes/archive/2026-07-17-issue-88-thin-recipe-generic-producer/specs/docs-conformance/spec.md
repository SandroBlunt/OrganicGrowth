## ADDED Requirements

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
