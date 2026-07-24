## MODIFIED Requirements

### Requirement: The wired Character Explainer Recipe's producer procedure exists in-repo as an invocable Skill

The system SHALL provide the *Character Explainer with Cast* Recipe's producer procedure (ADR-0018) as
a project Skill at `.claude/skills/produce-character-explainer/SKILL.md`, whose front-matter `name`
field is exactly `produce-character-explainer` — the slug the thin Producer invokes when a Production
Queue job's `recipe` is `character-explainer-with-cast`. This Skill SHALL be extracted,
**behaviour-identical**, from the authoring procedure `.claude/agents/producer.md` ran inline before
this change: the SAME Production-Spec contract (`src/production-spec/contract.ts`'s
`REQUIRED_CHARACTER_CONCEPTS`/`REQUIRED_CLIPS`/`REQUIRED_THUMBNAILS`/`ASPECT_RATIO_LINE`), the SAME
validator (`validate.ts`) and banned-word scan (`brand-safety.ts`), and the SAME author-phase checklist
(`recipe/phase-contract.ts`'s `auditAuthorPhase`, this Recipe's own `specShape`) — zero behaviour
change, only where the procedure lives has moved.

The Skill SHALL author exactly 3 character concepts, 3 narrative clips (each a Pixar-3D `image_prompt`
ending with the exact `ASPECT_RATIO_LINE` plus a `video_prompt`), and 3 top-level thumbnails; self-audit
against `auditAuthorPhase`; STOP (reject-only, never a silent rewrite) on a banned word; STOP if the
Idea brief cannot be read; and emit the Production Spec through the spec store
(`production-spec/store.ts`'s `saveSpec`/`specPathFor`). It SHALL NOT drive the Space, pin the
Character, or compose the Copy — those stay the thin Producer's own job (following this Recipe's
Execution Protocol via the generic `driveToNextGate`), unchanged from today's real behaviour.

The Skill SHALL additionally author an OPTIONAL, TOP-LEVEL `companies` field on the Production Spec
(`src/production-spec/contract.ts`'s `ProductionSpec.companies`, issue #125): when the Idea brief names
real companies/products, list them there, as written, grounded in the brief — never invented, never a
generic placeholder standing in for a real company. When the brief names none, the Skill SHALL OMIT the
field entirely — it SHALL NEVER fabricate a company/product to fill it.

#### Scenario: The Skill file exists and declares its own slug

- **GIVEN** the repo at this change's state
- **WHEN** `.claude/skills/produce-character-explainer/SKILL.md` is read
- **THEN** the file exists, is non-empty, and its front-matter `name` field is exactly
  `produce-character-explainer`

#### Scenario: The Skill references the exact contract/validator/checklist/store modules, never re-deriving them

- **GIVEN** the Skill's document body
- **WHEN** it is inspected
- **THEN** it names `production-spec/contract.ts`'s `ProductionSpec`/`REQUIRED_CHARACTER_CONCEPTS`/
  `REQUIRED_CLIPS`/`REQUIRED_THUMBNAILS`/`ASPECT_RATIO_LINE`, `production-spec/validate.ts`,
  `production-spec/brand-safety.ts`'s `scanForBannedWords`, `recipe/phase-contract.ts`'s
  `auditAuthorPhase`, and `production-spec/store.ts`'s `saveSpec`/`specPathFor` by exact name

#### Scenario: The Skill states it does not run the Space, pin the Character, or compose the Copy

- **GIVEN** the Skill's document body
- **WHEN** it is inspected
- **THEN** it states it does not run the Space or call any `spaces_*`/`creations_*` tool, does not pin
  the Operator's picked Character, and does not compose the Copy — all three are the thin Producer's
  own job

#### Scenario: The Skill treats a banned word as reject-only and never publishes

- **GIVEN** the Skill's document body
- **WHEN** it is inspected
- **THEN** it states a banned word is REJECT-ONLY (STOP and report, never a silent swap) and that it
  never publishes anything (always-rule 1 / ADR-0002)

#### Scenario: The Skill names the TOP-LEVEL companies field it authors

- **GIVEN** the Skill's document body
- **WHEN** it is inspected
- **THEN** it names `companies` as a TOP-LEVEL field on `ProductionSpec`

#### Scenario: The Skill instructs populating companies from the Idea brief, grounded, never invented

- **GIVEN** the Skill's document body
- **WHEN** it is inspected
- **THEN** it instructs populating `companies` from real companies/products the Idea brief actually
  names

#### Scenario: The Skill instructs omitting companies entirely when the brief names none

- **GIVEN** the Skill's document body
- **WHEN** it is inspected
- **THEN** it instructs omitting the `companies` field entirely when the brief names no real company,
  and states one is never invented to fill it

### Requirement: The shared copy step's producer procedure exists in-repo as an invocable, swappable Skill

The system SHALL provide the shared, out-of-canvas copy step's producer procedure (ADR-0012, mirroring
ADR-0018's per-Recipe media-authoring Skills) as a project Skill at
`.claude/skills/write-social-copy/SKILL.md`, whose front-matter `name` field is exactly
`write-social-copy` — the slug `Recipe.copySkill` (`src/recipe/registry.ts`) names for both wired
Recipes today. The Skill SHALL document composing the caption + hashtags from the Brand's hard rules,
the resolved Format's voice, the Idea's material, and the chosen Recipe's own `copyShape`, and SHALL
document sharpening the ACTUAL produced narrative (a multi-slide Recipe's per-slide
`role`/`text`/`stat_callout`/`companies`, once the media exists) into the caption's own plain-language
recap, rather than re-deriving a caption from the brief alone. It SHALL document naming the real
companies/products drawn from `companies` data (issue #120) wherever the Format's voice naturally
allows it — grounded in what the Production Spec actually recorded, the SAME "grounded, never invented"
standard the News Carousel author phase's own `companies-cited` checklist item already holds the
on-slide `image_prompt` to — and SHALL state that empty or absent `companies` contributes NO
company/product mention: never invented, never re-guessed from other material when the produced Spec
doesn't name one.

The Skill SHALL additionally document reading and drawing on `CopyInput.companies` (issue #125) — the
Character Explainer with Cast Recipe's own WHOLE-Asset-grain companies data, threaded through by
`character-explainer-companies.ts`'s `characterExplainerCompanies` — the SAME way it already documents
drawing on `CopySlideBeat.companies` for the News Carousel Recipe: name the real companies/products it
records, grounded, never invented; empty or absent contributes no mention, at EITHER grain.

#### Scenario: The Skill file exists and declares its own slug

- **GIVEN** the repo at this change's state
- **WHEN** `.claude/skills/write-social-copy/SKILL.md` is read
- **THEN** the file exists, is non-empty, and its front-matter `name` field is exactly
  `write-social-copy`

#### Scenario: The Skill documents sharpening the produced on-slide narrative into the caption

- **GIVEN** the Skill's documented steps
- **WHEN** they are read
- **THEN** they state that, once the media exists, a multi-slide Recipe's ACTUAL produced per-slide
  narrative is pulled forward and sharpened into the caption's own plain-language recap — never a
  generic restatement of the brief alone

#### Scenario: The Skill names companies as part of the produced-narrative input it reads

- **GIVEN** the Skill's documented Inputs section
- **WHEN** it is read
- **THEN** it names `companies` and `CopySlideBeat` alongside the pre-existing `role`/`text`/
  `stat_callout` fields as part of the produced on-slide narrative it draws on

#### Scenario: The Skill instructs naming real companies/products from that field, grounded in the Spec

- **GIVEN** the Skill's documented drafting step
- **WHEN** it is read
- **THEN** it instructs naming the real companies/products the data actually records, grounded in what
  the Production Spec recorded — never a re-guess from the brief's prose

#### Scenario: The Skill states an empty or absent companies field contributes no mention

- **GIVEN** the Skill's documented drafting step
- **WHEN** it is read
- **THEN** it states that companies being empty or absent contributes NO company/product mention, and
  that one is never invented or re-guessed from other material

#### Scenario: The Skill names CopyInput.companies and characterExplainerCompanies for the Character Explainer Recipe

- **GIVEN** the Skill's documented Inputs section
- **WHEN** it is read
- **THEN** it names `CopyInput.companies`, `characterExplainerCompanies`, and
  `character-explainer-companies.ts`, and names the *Character Explainer with Cast* Recipe by name

#### Scenario: The Skill instructs naming real companies/products at either grain

- **GIVEN** the Skill's documented drafting step
- **WHEN** it is read
- **THEN** it instructs grounded, never-invented company naming "at either grain" — covering both the
  per-beat `CopySlideBeat.companies` (multi-slide Recipes) and the per-Asset `CopyInput.companies`
  (single-media Recipes)
