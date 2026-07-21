# production-spec Specification

## Purpose
TBD - created by archiving change issue-3-producer-production-spec. Update Purpose after archive.
## Requirements
### Requirement: Production Spec contract is sourced without the truncated canvas node

The Production Spec contract (the shape and style rules the Space's `JSON master` node enforces) SHALL
be sourced **without** depending on reading the Space's system-prompt text node from the canvas, because
the Magnific read API truncates large text nodes at ~1,900 chars and cuts the system prompt off
mid-section (see `docs/producer-spikes-results.md`, Spike 3). The contract SHALL instead be encoded as a
compact, documented schema/style summary in code that the validator enforces, and the chosen sourcing
path SHALL be documented in the module.

#### Scenario: Contract enforcement does not read the canvas system-prompt node

- **GIVEN** the Producer composing a Production Spec
- **WHEN** the contract is consulted to build and validate the Spec
- **THEN** the contract comes from the in-code schema/style summary
- **AND** no canvas system-prompt text node is read (no live Space call, no WebFetch in tests)

### Requirement: Production Spec validation

The system SHALL provide a pure `validate(spec)` function that returns whether a Production Spec
conforms to the Character Explainer with Cast Recipe's contract and, when it does not, the specific
reasons it failed. A well-formed Spec SHALL be accepted. A malformed Spec SHALL be rejected before it
could reach the Space (so a bad Spec never wastes a run or credits). The Spec is MEDIA INSTRUCTIONS
ONLY (ADR-0012) — it carries no `post_copy` field; a stray `post_copy` field present on a candidate
object is simply not read/checked (it is not part of the contract). Validation SHALL reject, each with
an identifiable reason:

- `character_concepts` whose length is not exactly 3;
- `clips` whose length is not exactly 3;
- a missing `thumbnails` field;
- a `thumbnails` field nested inside a `clip` (or elsewhere) instead of at the TOP LEVEL of the Spec.

Its error type, `ValidationError`, SHALL type `code` as plain `string` (not narrowed to this
contract's own closed `ValidationCode` union) so the SAME `ValidationResult`/`ValidationError` shape is
reusable by a DIFFERENT Recipe's OWN validator (e.g. the News Carousel Recipe's
`validateNewsCarouselSpec`) with its own error-code vocabulary — `validate()` itself is unaffected and
continues to only ever produce `ValidationCode` values (a subtype of `string`).

#### Scenario: A well-formed Spec is accepted

- **GIVEN** a Production Spec with exactly 3 `character_concepts`, exactly 3 `clips`, and a top-level
  `thumbnails` of 3 image prompts
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` with no errors

#### Scenario: Wrong number of character_concepts is rejected

- **GIVEN** a Production Spec with 4 `character_concepts`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying `character_concepts` count

#### Scenario: Wrong number of clips is rejected

- **GIVEN** a Production Spec with 2 `clips`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying `clips` count

#### Scenario: Missing thumbnails is rejected

- **GIVEN** a Production Spec with no `thumbnails` field
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the missing `thumbnails`

#### Scenario: Nested thumbnails is rejected

- **GIVEN** a Production Spec whose `thumbnails` appears inside a `clip` instead of at the top level
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error identifying that the field must be top-level

#### Scenario: post_copy is no longer part of the contract

- **GIVEN** a Production Spec that is otherwise well-formed but carries a stray top-level `post_copy`
  field (of any length or emoji count)
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` — the stray field is simply not checked, since Copy is composed
  separately, outside the Spec (`copy-composition`, ADR-0012)

#### Scenario: A DIFFERENT Recipe's validator can reuse the SAME ValidationResult/ValidationError shape

- **GIVEN** `validateNewsCarouselSpec`, a validator for a completely different Recipe's contract
- **WHEN** its return value's `errors[].code` values (e.g. `"slides_count"`, `"slide_role_order"`) are
  inspected against the `ValidationError` type
- **THEN** they type-check as valid `ValidationError.code` values, proving the shared shape is
  Recipe-agnostic

### Requirement: Brand-safety hard filter on the Production Spec

A generated or validated Production Spec SHALL honor the `brand-profile.yaml` hard filters: a Spec that
contains a banned word (in any text field — concepts, clip prompts, or thumbnails) SHALL be rejected, so
a banned word never survives into a saved Spec (production must not reintroduce anything Review would
have filtered). The banned-word match SHALL be case-insensitive. When the brand profile defines no
banned words, the filter SHALL pass any Spec. The Spec's own scan no longer reads a `post_copy` field
(retired — ADR-0012); the composed Copy's OWN banned-word scan is a separate requirement
(`copy-composition`'s "A pure, hermetic, per-Recipe copy validator..."), sharing the SAME underlying
`scanTextFields` matching core so the two can never drift on the word-boundary/case-insensitivity rule.

#### Scenario: A Spec containing a banned word is rejected

- **GIVEN** a brand profile that defines banned words and a Production Spec whose clip prompt contains
  one of them
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec is rejected and the banned word is named in the reason
- **AND** the Spec is not written to disk

#### Scenario: A clean Spec passes the brand-safety filter

- **GIVEN** a brand profile that defines banned words and a Production Spec that contains none of them
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec passes

#### Scenario: A stray post_copy field is not scanned

- **GIVEN** a Production Spec carrying a stray top-level `post_copy` field containing a banned word
- **WHEN** the brand-safety filter is applied
- **THEN** the Spec passes — the stray field is not collected/scanned, since `post_copy` is retired from
  the Spec entirely

### Requirement: Producer agent definition

OrganicGrowth SHALL define a content `producer` agent (model Opus) joining trend-scout /
idea-strategist / performance-tracker. Its definition SHALL describe the Producer's role per CLAUDE.md
and CONTEXT.md: it drives a pre-defined Magnific Space — generates a Production Spec from an accepted
Brief, runs the cast stage, pauses at the Cast gate, and renders the Asset after the Operator picks the
Character — and it **generates, never publishes**.

#### Scenario: The producer agent definition exists and is Opus

- **GIVEN** the repository's agent definitions
- **WHEN** the `producer` agent definition is read
- **THEN** it specifies model `opus`
- **AND** it describes generating a Production Spec and that the Producer generates but never publishes

### Requirement: Compose and persist a Production Spec beside the Brief, segmented by Recipe

The Producer SHALL compose a contract-conformant Production Spec from an accepted Brief and persist it
to the Brand's `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` (the machine-readable
sibling of the Brief, now segmented by the chosen Recipe — ADR-0011, issue #56), so the Operator can
inspect exactly what will drive a render and so a SECOND chosen Recipe for the same Idea gets its OWN
Spec file rather than overwriting the first Recipe's. `recipe` SHALL be a required, explicit parameter
(never defaulted or inferred) to both `specPathFor` and `composeSpec`'s options. The persisted Spec
SHALL pass `validate()` and the brand-safety filter; a Spec that fails either SHALL NOT be written.

#### Scenario: Composing an accepted Idea writes a valid, Recipe-segmented Spec beside the Brief

- **GIVEN** an accepted Brief for Idea `idea-NN` in run `<run>`, composed for Recipe `<recipe>`
- **WHEN** the Producer composes its Production Spec
- **THEN** a file `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` is written
- **AND** the written Spec passes `validate()` and the brand-safety filter

#### Scenario: Two Recipes of one Idea each get their own Spec file

- **GIVEN** one accepted Idea with TWO chosen Recipes, `character-explainer-with-cast` and `carousel`
- **WHEN** a Production Spec is composed and saved for each Recipe
- **THEN** the two Specs are written to two DIFFERENT paths, each segmented by its own Recipe
- **AND** neither Spec overwrites the other

#### Scenario: A failing Spec is refused, not written

- **GIVEN** a candidate Spec that fails validation or contains a banned word
- **WHEN** persistence is attempted
- **THEN** no `idea-NN.<recipe>.spec.json` is written and the failure is reported

### Requirement: News Carousel Production Spec validation (map ticket #77's decided shape)

The system SHALL provide a pure `validateNewsCarouselSpec(spec)` function that returns whether a News
Carousel Production Spec conforms to its OWN contract (distinct from the Character Explainer with
Cast Recipe's) and, when it does not, the specific reasons it failed. The contract SHALL be: a
top-level `slides` array of EXACTLY 7 entries; each slide an object carrying `slide_index` (an
integer), `role` (a string), `card_style` (a non-empty string), `stat_callout` (a non-empty string),
`text` (a non-empty string of at most 140 chars), and `image_prompt` (a non-empty string); `role`
values SHALL appear in the FIXED order `hook, then, shift, proof, different, next, cta`, one per
position; `slide_index` values SHALL equal each slide's 0-based position (`0..6`). The Spec is MEDIA
INSTRUCTIONS ONLY (ADR-0012) — it carries no `post_copy` field.

#### Scenario: A well-formed 7-slide Spec is accepted

- **GIVEN** a News Carousel Production Spec with exactly 7 slides, in fixed role order, each slide's
  `text` within 140 chars
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: true` with no errors

#### Scenario: A slide count other than 7 is rejected

- **GIVEN** a News Carousel Production Spec with 6 slides (or with 8 slides)
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the wrong `slides` count

#### Scenario: Slides out of the fixed role order are rejected

- **GIVEN** a News Carousel Production Spec whose first two slides' `role` values are swapped (`"then"`
  before `"hook"`)
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the role-order violation

#### Scenario: A slide_index that doesn't match its position is rejected

- **GIVEN** a News Carousel Production Spec whose `slide_index` values are shifted by one (`1..7`
  instead of `0..6`)
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the `slide_index` misalignment

#### Scenario: A slide's on-card text over 140 chars is rejected

- **GIVEN** a News Carousel Production Spec whose one slide's `text` is 141 chars long
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the text-length violation

#### Scenario: A slide missing a required field is rejected

- **GIVEN** a News Carousel Production Spec whose one slide is missing its `image_prompt`
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: false` with an error identifying the malformed slide

### Requirement: Brand-safety hard filter on the News Carousel Production Spec covers EVERY slide text field

A generated or validated News Carousel Production Spec SHALL honor the `brand-profile.yaml` hard
banned-word filter: a Spec that contains a banned word in ANY slide text field — `role`, `card_style`,
`stat_callout`, `text`, or `image_prompt` — SHALL be rejected, naming the matched word and the specific
field it was found in. This closes a gap the issue-60 salvage build report flagged: the wired Recipe's
shared banned-word scanner did not know a carousel Spec's `slides[]` fields existed, so a banned word
in an `image_prompt` was never scanned. The News Carousel scan SHALL share the SAME underlying
word-boundary/case-insensitivity matching core (`scanTextFields`) the wired Recipe's own scanner uses,
so the two can never drift on that rule. The match SHALL be case-insensitive and whole-word (a banned
word embedded inside an unrelated word, e.g. "cure" inside "secure", SHALL NOT match). When the brand
profile defines no banned words, the filter SHALL pass any Spec.

#### Scenario: A banned word in image_prompt is rejected and named, closing the issue-60 gap

- **GIVEN** a brand profile that defines banned words and a News Carousel Production Spec whose one
  slide's `image_prompt` contains one of them
- **WHEN** the News Carousel banned-word scan is applied
- **THEN** the Spec is rejected, naming the banned word and the specific `slides[N].image_prompt` field
  it was found in

#### Scenario: A banned word in any other slide text field is also rejected

- **GIVEN** a brand profile that defines banned words and a News Carousel Production Spec whose one
  slide's `text` (or `stat_callout`) contains one of them
- **WHEN** the News Carousel banned-word scan is applied
- **THEN** the Spec is rejected, naming the banned word and the specific field it was found in

#### Scenario: A clean News Carousel Spec passes the brand-safety filter

- **GIVEN** a brand profile that defines banned words and a News Carousel Production Spec that
  contains none of them
- **WHEN** the News Carousel banned-word scan is applied
- **THEN** the Spec passes

#### Scenario: A banned word embedded inside an unrelated word does not false-positive

- **GIVEN** a banned word `"cure"` and a News Carousel Production Spec slide whose text reads "Feel
  secure about this shift."
- **WHEN** the News Carousel banned-word scan is applied
- **THEN** the Spec passes — "secure" is not a whole-word match for "cure"

### Requirement: News Carousel author-phase checklist is graduated from the #77 prototype, runs as code, parameterized

The system SHALL provide `auditNewsCarouselAuthorPhase(candidateSpec, bannedWords, baseline)` in
`src/production-spec/news-carousel-author-checklist.ts`, where `baseline` is a
`NewsCarouselBaselineParams` (`{ logoReferenceName, pillText, neverAllCapsInstruction, fixedClauses,
confirmedCardStyles }`). It SHALL run the News Carousel Recipe's FULL author-phase checklist entirely
as CODE, returning a `PhaseAuditResult` (`src/recipe/phase-contract.ts`) with exactly 8 `items`, in
this order:

1. Exactly 7 slides, in fixed role order (`hook, then, shift, proof, different, next, cta`) — derived
   from `news-carousel-validate.ts`'s `validateNewsCarouselSpec`'s own result codes (`slides_count`,
   `slide_role_order`), never re-deriving the count/order rule.
2. Each slide's on-card `text` at most 140 chars — derived from the SAME `validateNewsCarouselSpec`
   result's `slide_text_too_long` code.
3. Each `image_prompt` references `baseline.logoReferenceName` — a NEW check, parameterized (never a
   hardcoded literal).
4. Each `image_prompt` contains `baseline.pillText` AND `baseline.neverAllCapsInstruction` — a NEW
   check, parameterized.
5. Each `image_prompt` keeps every clause in `baseline.fixedClauses` verbatim — a NEW check,
   parameterized.
6. Grounded subject (real product/logo/action, or an intentional photographic scene; never an
   invented UI shown as a real product's own screen) — `kind: "agent-judged"`, `ok: null`, never
   computed, never blocking the overall result.
7. `card_style` is one of `baseline.confirmedCardStyles`; `stat_callout` is non-empty — a NEW check,
   parameterized (the card-style membership check; `stat_callout` non-emptiness is additionally
   guaranteed by item 1's referenced structural validator).
8. No banned word in any field — derived from `news-carousel-brand-safety.ts`'s
   `scanNewsCarouselForBannedWords`'s own result, REJECT-only (never a silent swap, always-rule 9).

The overall `ok` SHALL be `true` iff `validateNewsCarouselSpec(candidateSpec).ok` is `true` AND no item
above is `ok: false` (the referenced structural validator is the authoritative gate for shape/count/
order/length). The function SHALL never throw, for any input shape.

#### Scenario: A baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed

- **GIVEN** a well-formed 7-slide Spec whose every `image_prompt` carries `baseline.logoReferenceName`,
  `baseline.pillText`, `baseline.neverAllCapsInstruction`, and every clause in `baseline.fixedClauses`,
  and whose `card_style`s are each one of `baseline.confirmedCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `8`, exactly one item is `kind:
  "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item is `ok: true`

#### Scenario: A short Spec fails item 1 by referencing validateNewsCarouselSpec, not duplicating it

- **GIVEN** a Spec with only 6 slides
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and `items[0].ok` is `false`

#### Scenario: A Spec missing the parameterized logo reference name fails item 3 only

- **GIVEN** a baseline-adherent Spec with `baseline.logoReferenceName` removed from every
  `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false`, `items[2].ok` is `false`, and every OTHER mechanical item
  (e.g. `items[3]`, the pill-text/caps-guard item) remains `ok: true`

#### Scenario: A Spec missing the pill text or the never-all-caps instruction fails item 4

- **GIVEN** a baseline-adherent Spec with either `baseline.pillText` or
  `baseline.neverAllCapsInstruction` removed from every `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and `items[3].ok` is `false`

#### Scenario: A Spec missing one fixed baseline clause fails item 5

- **GIVEN** a baseline-adherent Spec with one entry of `baseline.fixedClauses` removed from every
  `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and `items[4].ok` is `false`

#### Scenario: A Spec using an unconfirmed card_style fails item 7

- **GIVEN** a baseline-adherent Spec whose first slide's `card_style` is not a member of
  `baseline.confirmedCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and `items[6].ok` is `false`

#### Scenario: A banned word fails item 8, reject-only, and is named — never rewritten

- **GIVEN** a baseline-adherent Spec containing the word `"miracle"` and a `bannedWords` list of
  `["miracle"]`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, ["miracle"], baseline)` is called
- **THEN** the result's `ok` is `false`, `items[7].ok` is `false`, its `detail` names `"miracle"`, and
  no rewritten/corrected Spec is ever returned alongside the result

#### Scenario: The checklist is genuinely parameterized — different (Brand x Format) strings change the outcome

- **GIVEN** a Spec authored to carry one `NewsCarouselBaselineParams`'s strings verbatim (a
  test-fixture baseline, deliberately different from any one real Brand/Format's own strings)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with that SAME Spec but a DIFFERENT
  `NewsCarouselBaselineParams` (e.g. a different `logoReferenceName`/`pillText`)
- **THEN** the result's `ok` is `false` — proving no Brand/Format-specific string is hardcoded inside
  the checked module (issue #85's core ask)

#### Scenario: The function never throws on a malformed or non-object Spec

- **GIVEN** `null`, `{}`, or any other malformed candidate Spec
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** it returns a `PhaseAuditResult` with `ok: false` rather than throwing

### Requirement: The graduated Skill's target output is proven on-contract against a real (Brand x Format)

The system SHALL provide a committed fixture demonstrating that the `produce-news-carousel` Skill's
promised output — the map-#77 prototype's 7 on-contract carousel prompts for idea-01 — is genuinely
on-contract for a REAL Brand and Format, not only for the stand-in `TEST_BASELINE` issue #85 already
proved parameterization with. `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`
SHALL export `STRAW_MOTION_BASELINE` (a `NewsCarouselBaselineParams` built from Straw Motion's real,
committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`: its logo
reference name, its pill text, its never-all-caps instruction, five of its fixed clauses verbatim,
and its two confirmed card styles) and `strawMotionIdeaOneCarouselSpec()` (idea-01's 7-slide
authored Spec).

#### Scenario: The committed fixture passes the #81 structural validator

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`
- **WHEN** `validateNewsCarouselSpec` is called with it
- **THEN** the result's `ok` is `true` and `errors` is empty

#### Scenario: The committed fixture passes the #85 author-phase checklist, parameterized with Straw Motion's real strings

- **GIVEN** `strawMotionIdeaOneCarouselSpec()` and `STRAW_MOTION_BASELINE`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `8`, exactly one item is `kind:
  "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item is `ok: true`

#### Scenario: STRAW_MOTION_BASELINE's own strings are genuinely present in the real, committed document

- **GIVEN** the real Format loaded via `loadFormat("straw-motion", "unhypped-news")` and its
  Baseline Prompt for `"news-carousel"` loaded via `loadBaselinePrompt`
- **WHEN** the document's content is normalized (blockquote markers stripped, lines joined, repeated
  whitespace collapsed) and checked for substring containment
- **THEN** it contains `STRAW_MOTION_BASELINE.logoReferenceName`, `.pillText`,
  `.neverAllCapsInstruction`, and every entry of `.fixedClauses` — none of these strings are
  asserted by fiat; each is verified against the real document's own prose

#### Scenario: STRAW_MOTION_BASELINE is genuinely a different baseline than the stand-in TEST_BASELINE

- **GIVEN** `STRAW_MOTION_BASELINE` and issue #85's stand-in `TEST_BASELINE`
- **WHEN** their `logoReferenceName` and `pillText` fields are compared
- **THEN** they differ, proving this fixture is not the stand-in fixture renamed

### Requirement: The Brand Profile reader exposes the watermark @handle, defensively (QA-1)

`src/production-spec/brand-profile.ts` SHALL provide `watermarkHandleFrom(raw)` (pure) and
`loadWatermarkHandle(path)` (the async I/O shell), reading `production.watermark_handle` from
already-parsed / on-disk Brand Profile data respectively. This is a DIFFERENT per-Brand parameter than
Copy (`BrandCopyRules`): the thin Producer sets it onto a Recipe's declared `watermarkNode`
(`src/recipe/registry.ts`) before the final render — it SHALL NEVER be folded into the composed Copy's
caption or hashtags (ADR-0012). Both functions SHALL be defensive, mirroring `requiredCtaFrom`: a
missing file, a missing `production` block, a non-object `production` value, or a missing/non-string/
blank `watermark_handle` SHALL all degrade to `""` (never `null`/`undefined`, never a thrown error) —
the real profile's default shape (not yet configured).

#### Scenario: watermarkHandleFrom reads a configured handle, trimmed

- **GIVEN** `{ production: { watermark_handle: "  @strawmotion  " } }`
- **WHEN** `watermarkHandleFrom(raw)` is called
- **THEN** it returns `"@strawmotion"`

#### Scenario: watermarkHandleFrom returns '' for the real profile's default shape and any malformed input

- **GIVEN** any of: no `production` block, `production: {}`, `production.watermark_handle: ""`,
  `production: "not an object"`, `production.watermark_handle: 7`, or `raw` itself being `null`
- **WHEN** `watermarkHandleFrom(raw)` is called
- **THEN** it returns `""` in every case — never throws, never returns `null`/`undefined`

#### Scenario: loadWatermarkHandle reads '' for a missing Brand Profile file

- **GIVEN** a path with no file on disk
- **WHEN** `loadWatermarkHandle(path)` is called
- **THEN** it resolves to `""`, never rejecting

### Requirement: News Carousel author-phase checklist gains a mechanical placement-variety item, parameterized from the Baseline Prompt

`auditNewsCarouselAuthorPhase` (`src/production-spec/news-carousel-author-checklist.ts`) SHALL include a
`placement-variety` `ChecklistItemAudit` with `kind: "mechanical"`, computed from the candidate Spec's 7
slides' own `card_style` values against two fields of the `baseline` argument (a
`NewsCarouselBaselineParams`): `topRegionCardStyles` (which of `confirmedCardStyles` sit in the frame's
top region) and `minDistinctCardStyles` (the minimum count of distinct placements to count as "spread
across the vertical range"). The item's `ok` SHALL be `false` when EITHER of two conditions holds — the
count of distinct `card_style` values across the 7 slides is below `minDistinctCardStyles`, OR none of
the 7 slides' `card_style` values is a member of `topRegionCardStyles` — and `true` only when neither
holds. Neither `topRegionCardStyles` nor `minDistinctCardStyles` SHALL be a literal string/number
hardcoded inside the checked module (ADR-0015) — both come from the `baseline` argument, exactly as
`confirmedCardStyles` already does. The item SHALL participate in the checklist's overall `ok` (a
mechanical item, never merely flagged — ADR-0017), and the function SHALL never throw for any input
shape.

#### Scenario: A Spec whose 7 slides use only bottom/lower-region placements fails the item — the idea-01 pattern

- **GIVEN** a well-formed, otherwise baseline-adherent 7-slide Spec whose `card_style` values are all
  drawn from `baseline`'s non-top-region confirmed styles (reproducing straw-motion idea-01's actual
  reported pattern: plenty of distinct bottom placements, zero top-region cards)
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `false`, the `placement-variety` item is present with `kind:
  "mechanical"` and `ok: false`, and every OTHER mechanical item still reports `ok: true`

#### Scenario: A Spec whose placements spread across the vertical range and include a top-region card passes the item

- **GIVEN** a well-formed, baseline-adherent 7-slide Spec whose `card_style` values use at least
  `baseline.minDistinctCardStyles` distinct values, including at least one member of
  `baseline.topRegionCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true` and the `placement-variety` item's `ok` is `true`

#### Scenario: A Spec with a top-region card but too few distinct placements still fails the item

- **GIVEN** a 7-slide Spec whose `card_style` values use only 2 distinct values (fewer than
  `baseline.minDistinctCardStyles`), one of which IS a member of `baseline.topRegionCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the `placement-variety` item's `ok` is `false` — the presence of a top-region card alone does
  not satisfy the distinct-count half of the check

#### Scenario: The rule is genuinely parameterized — a different NewsCarouselBaselineParams changes the outcome for the SAME Spec

- **GIVEN** a 7-slide Spec that fails `placement-variety` under one `NewsCarouselBaselineParams`
  (because none of its `card_style` values is in that baseline's `topRegionCardStyles`)
- **WHEN** `auditNewsCarouselAuthorPhase` is called again with the SAME, unmodified Spec but a DIFFERENT
  `NewsCarouselBaselineParams` whose `topRegionCardStyles` includes one of the styles the Spec actually
  uses, and whose `minDistinctCardStyles` is low enough to already be satisfied
- **THEN** the `placement-variety` item's `ok` flips to `true` — proving neither "top region" nor the
  distinct-count threshold is a literal baked into the checked module

#### Scenario: The function never throws on a malformed or non-object Spec, and the item fails cleanly

- **GIVEN** `null` or `{}` as the candidate Spec
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** it returns a `PhaseAuditResult` without throwing, and the `placement-variety` item's `ok` is
  `false`

### Requirement: Straw Motion's real Baseline Prompt document actively instructs placement spread, subject-type variety, and real-named-people balance

`data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`'s "Card style" bullet SHALL
actively instruct spreading card placements across the vertical range, slide to slide, and SHALL state
that every carousel MUST use at least one top-region ("top card, photo below") placement alongside its
bottom/lower placements. Its "Subject" bullet SHALL actively instruct varying the subject TYPE slide to
slide (not leaning on the same product-screen motif for every slide) and reaching for the real, named
person when a story is clearly theirs, balanced against product shots across the carousel. No existing
locked clause (the logo rule, the pill rule, the 7-slide narrative formulas, the reusable template, or
the worked Examples) SHALL be altered.

#### Scenario: The document's Card-style guidance requires at least one top-region placement, actively

- **GIVEN** the real, committed Baseline Prompt document, loaded via `loadFormat("straw-motion",
  "unhypped-news")` then `loadBaselinePrompt(brand, format, "news-carousel")` and normalized (blockquote
  markers stripped, lines joined, whitespace collapsed)
- **WHEN** its Card-style guidance is inspected
- **THEN** it states placements are actively spread and that every carousel MUST use at least one top
  card / "top card, photo below" placement

#### Scenario: The document's Subject guidance instructs subject-type variety and reaching for the real named person

- **GIVEN** the same normalized document
- **WHEN** its Subject guidance is inspected
- **THEN** it instructs varying the subject TYPE slide to slide and balancing real, named people against
  product shots across the carousel

#### Scenario: idea-01's ACTUAL reported card_style pattern, checked against the real Straw Motion baseline, is flagged

- **GIVEN** a 7-slide Spec carrying idea-01's actual reported `card_style` sequence (`full_width,
  floating_toast, small_badge, full_width_inset, floating_toast, small_badge_inset, full_width`) and
  otherwise baseline-adherent image prompts
- **WHEN** `auditNewsCarouselAuthorPhase` is called with `STRAW_MOTION_BASELINE`
- **THEN** the result's `ok` is `false` and the `placement-variety` item's `ok` is `false`, while every
  other mechanical item remains `ok: true`

#### Scenario: A genuinely varied 7-slide spread against the real Straw Motion baseline passes

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`, whose `card_style` values spread across at least
  `STRAW_MOTION_BASELINE.minDistinctCardStyles` distinct placements including at least one of
  `STRAW_MOTION_BASELINE.topRegionCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with `STRAW_MOTION_BASELINE`
- **THEN** the result's `ok` is `true` and the `placement-variety` item's `ok` is `true`

