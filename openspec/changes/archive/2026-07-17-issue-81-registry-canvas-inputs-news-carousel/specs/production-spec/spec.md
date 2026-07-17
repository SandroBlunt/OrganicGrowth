## ADDED Requirements

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

## MODIFIED Requirements

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
