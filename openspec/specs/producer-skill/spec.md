# producer-skill Specification

## Purpose
TBD - created by archiving change issue-87-produce-news-carousel-skill. Update Purpose after archive.
## Requirements
### Requirement: The News Carousel Recipe's producer procedure exists in-repo as an invocable Skill

The system SHALL provide the News Carousel Recipe's producer procedure (ADR-0018) as a project
Skill at `.claude/skills/produce-news-carousel/SKILL.md`, whose front-matter `name` field is exactly
`produce-news-carousel` — the slug the thin Producer invokes when a Production Queue job's `recipe`
is `news-carousel`.

#### Scenario: The Skill file exists and declares its own slug

- **GIVEN** the repo at this change's state
- **WHEN** `.claude/skills/produce-news-carousel/SKILL.md` is read
- **THEN** the file exists, is non-empty, and its front-matter `name` field is exactly
  `produce-news-carousel`

### Requirement: The Skill's inputs, steps, and STOP semantics are documented and stable

The Skill SHALL document loading exactly three inputs before authoring anything — the Brand's hard
rules, the Format's Baseline Prompt document (for the `news-carousel` Recipe), and the Idea's
brief — and SHALL STOP (never author from memory, never invent a substitute) when either the
Baseline Prompt document is not found (for any of `format/baseline-prompt.ts`'s three typed
reasons — `"not-declared"`, `"malformed"`, `"dangling"`) or the Idea brief cannot be read. It SHALL
document a banned word as REJECT-ONLY — STOP and report, never a silent swap (always-rule 6/9). It
SHALL document its four production steps (derive the 7-slide narrative in fixed role order; assemble
each slide's `image_prompt` from the Baseline Prompt's own template, keeping every fixed clause
verbatim; self-audit against the author-phase checklist; emit the Production Spec through the spec
store) and its "leading idea" — every slide names real products/logos/actions where it reports
something real, and never invents a UI presented as a real product's actual screen.

#### Scenario: STOP semantics for a missing Baseline Prompt document or a missing brief are documented

- **GIVEN** the Skill's documented Inputs section
- **WHEN** it is read
- **THEN** it states the Skill STOPs on each of `format/baseline-prompt.ts`'s three not-found
  reasons (`"not-declared"`, `"malformed"`, `"dangling"`) and on an unreadable Idea brief

#### Scenario: A banned word is REJECT-only, never a silent swap

- **GIVEN** the Skill's documented self-audit step
- **WHEN** it is read
- **THEN** it states a banned word STOPs the run and is reported, and explicitly rules out silently
  swapping the offending word

#### Scenario: The grounded-not-invented leading idea is documented

- **GIVEN** the Skill's documented leading idea
- **WHEN** it is read
- **THEN** it states every slide names a real product/logo/action where it reports something real,
  and that an invented UI must never be presented as a real product's actual screen

### Requirement: The Skill references the exact modules/functions it points at (never a stale name)

The Skill SHALL name, by exact module path and exported symbol, every piece of already-landed code
its steps point at: `news-carousel-contract.ts`'s `NewsCarouselSpec`/`CAROUSEL_ROLES`/
`CAROUSEL_TEXT_MAX_CHARS` (#81); `news-carousel-validate.ts`'s `validateNewsCarouselSpec` (#81);
`news-carousel-author-checklist.ts`'s `auditNewsCarouselAuthorPhase`/`NewsCarouselBaselineParams`
(#85); `format/store.ts`'s `loadFormat` and `format/baseline-prompt.ts`'s `loadBaselinePrompt` (#83);
`production-spec/store.ts`'s `saveSpec`/`specPathFor`; `production-spec/brand-profile.ts`'s
`loadBannedWords`.

#### Scenario: Every referenced module/function is named exactly

- **GIVEN** the Skill's documented steps
- **WHEN** it is read
- **THEN** it names `news-carousel-contract.ts`, `news-carousel-validate.ts`,
  `news-carousel-author-checklist.ts`, `format/store.ts`, `format/baseline-prompt.ts`,
  `production-spec/store.ts`, and `production-spec/brand-profile.ts`, plus the exact function names
  `validateNewsCarouselSpec`, `auditNewsCarouselAuthorPhase`, `loadFormat`, `loadBaselinePrompt`,
  `saveSpec`, `specPathFor`, and `loadBannedWords`

### Requirement: The Skill does not run the Space and never publishes

The Skill SHALL state that it does not run the Magnific Space, drive the canvas, or call any
`spaces_*`/`creations_*` tool — that is the thin Producer's job (issue #88) — and SHALL contain no
literal `spaces_*(`/`creations_*(` call anywhere in its own text. It SHALL state that it never
publishes (always-rule 1; ADR-0002).

#### Scenario: The Skill states it does not run the Space and contains no Magnific tool call

- **GIVEN** the Skill's documented scope
- **WHEN** it is read
- **THEN** it states it does not run the Space, and no substring matching a `spaces_*(` or
  `creations_*(` call appears anywhere in the file

#### Scenario: The Skill states it never publishes

- **GIVEN** the Skill's documented scope
- **WHEN** it is read
- **THEN** it states it never publishes

### Requirement: Nothing Brand- or Format-specific is hardcoded in the Skill (ADR-0015)

The Skill SHALL NOT contain, as a literal string anywhere in its own text, any one (Brand × Format)
pair's own pill/eyebrow text or logo reference-image name (e.g. Straw Motion's `"Unhypped News"` or
`"Straw_Motion_Logo"`) — it SHALL instead describe reading those values FROM whichever Baseline
Prompt document the current run resolves.

#### Scenario: The Skill never hardcodes Straw Motion's own strings

- **GIVEN** the Skill's full text
- **WHEN** it is scanned for the literal strings `"Unhypped News"`, `"Straw_Motion_Logo"`, and
  `"Brand_Logo"`
- **THEN** none of them appear anywhere in the file

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

