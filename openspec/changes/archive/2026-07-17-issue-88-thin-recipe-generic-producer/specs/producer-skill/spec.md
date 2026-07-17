## ADDED Requirements

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
