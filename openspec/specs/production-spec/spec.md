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

`ProductionSpec` (`src/production-spec/contract.ts`) SHALL additionally carry an OPTIONAL, TOP-LEVEL
`companies` field, `readonly string[]` — the real companies/products this Asset concerns, mirroring
`news-carousel-contract.ts`'s per-slide `CarouselSlide.companies` but at the WHOLE-Asset grain, since
this Recipe's 3 clips render one continuous narrative about the SAME picked Character rather than 7
independently-labeled slides (issue #125). `validate()` SHALL NOT require this field to be present — a
Spec authored before this change, or an Idea naming no real company, is still a well-formed Spec. WHEN
`companies` is present, `validate()` SHALL require it to be an array whose every entry is a non-empty
string (the array itself MAY be empty), and SHALL reject it, with an identifiable reason (a new
`ValidationCode`, `"companies_shape"`), otherwise.

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

#### Scenario: A Spec with no companies field at all is accepted (issue #125, backward compatible)

- **GIVEN** an otherwise well-formed Production Spec with no `companies` field
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` — `companies` is never required

#### Scenario: A Spec with a non-empty companies list is accepted

- **GIVEN** an otherwise well-formed Production Spec whose top-level `companies` is
  `["OpenAI", "Anthropic"]`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true`

#### Scenario: A Spec with an explicit empty companies list is accepted

- **GIVEN** an otherwise well-formed Production Spec whose top-level `companies` is `[]`
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: true` — an explicit empty list is a valid, passing state, not an error

#### Scenario: A companies field that is present but not an array is rejected

- **GIVEN** an otherwise well-formed Production Spec whose `companies` field is the string `"OpenAI"`
  (not an array)
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error whose `code` is `"companies_shape"`

#### Scenario: A companies array containing a blank entry is rejected

- **GIVEN** an otherwise well-formed Production Spec whose `companies` array contains a blank/
  whitespace-only string entry
- **WHEN** `validate(spec)` is called
- **THEN** it reports `ok: false` with an error whose `code` is `"companies_shape"`

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
and CONTEXT.md: it drives a pre-defined Magnific Space — reads the Production Spec Review already
authored and self-checked at accept time (ADR-0031), runs the cast stage, pauses at the Cast gate, and
renders the Asset after the Operator picks the Character — and it **generates, never publishes**.

#### Scenario: The producer agent definition exists and is Opus

- **GIVEN** the repository's agent definitions
- **WHEN** the `producer` agent definition is read
- **THEN** it specifies model `opus`
- **AND** it describes reading an already-authored Production Spec (ADR-0031) and that the Producer
  generates but never publishes

### Requirement: News Carousel Production Spec validation (map ticket #77's decided shape)

The system SHALL provide a pure `validateNewsCarouselSpec(spec)` function that returns whether a News
Carousel Production Spec conforms to its OWN contract (distinct from the Character Explainer with
Cast Recipe's) and, when it does not, the specific reasons it failed. The contract SHALL be: a
top-level `slides` array of EXACTLY 7 entries; each slide an object carrying `slide_index` (an
integer), `role` (a string), `card_style` (a non-empty string), `stat_callout` (a non-empty string),
`text` (a non-empty string of at most 140 chars), `image_prompt` (a non-empty string), `companies`
(an array of non-empty strings, possibly empty), and OPTIONAL `kind` (`"generated"` | `"image"` |
`"video"`, ADR-0024, issue #188) and `source_url` fields; `role` values SHALL appear in the FIXED
order `hook, then, shift, proof, different, next, cta`, one per position; `slide_index` values SHALL
equal each slide's 0-based position (`0..6`). The Spec is MEDIA INSTRUCTIONS ONLY (ADR-0012) — it
carries no `post_copy` field.

A slide's `kind` field is OPTIONAL and BACKWARD COMPATIBLE: a Spec carrying no `kind` at all (every
Spec authored before issue #188) SHALL be treated exactly as `"generated"`
(`news-carousel-contract.ts`'s `slideKind`) and SHALL validate exactly as before this change. When
`kind` is present it SHALL be one of `"generated"`/`"image"`/`"video"`, rejected otherwise with
`"slide_kind_invalid"`. `source_url` SHALL be required and SHALL look like an http(s) URL exactly
when the slide's EFFECTIVE kind is `"image"` or `"video"`, rejected otherwise with
`"slide_source_url_invalid"` — this check runs as its OWN top-level pass (mirroring how
`slide_text_too_long`/`slide_role_order`/`slide_index_invalid` are each their own code), not folded
into the generic `slide_shape` bucket.

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

#### Scenario: A Spec with no kind field at all is accepted — backward compatible (issue #188)

- **GIVEN** a well-formed News Carousel Production Spec whose slides carry no `kind` field at all
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: true` — every slide is treated as `"generated"`

#### Scenario: An image/video-kind slide with a well-formed source_url is accepted

- **GIVEN** a well-formed Spec whose one slide carries `kind: "image"` (or `"video"`) and a
  `source_url` that looks like an http(s) URL
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: true`

#### Scenario: A slide whose kind is outside generated/image/video is rejected

- **GIVEN** a Spec whose one slide's `kind` is `"gif"`
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: false` with a `"slide_kind_invalid"` error

#### Scenario: An image/video-kind slide missing source_url, or with a malformed one, is rejected

- **GIVEN** a Spec whose one slide is `kind: "image"` and carries no `source_url` at all, and
  separately one whose `source_url` is `"not-a-url"`
- **WHEN** `validateNewsCarouselSpec(spec)` is called with each
- **THEN** both report `ok: false` with a `"slide_source_url_invalid"` error

#### Scenario: A generated-kind slide never requires a source_url

- **GIVEN** a well-formed Spec whose one slide is explicitly `kind: "generated"` and carries no
  `source_url`
- **WHEN** `validateNewsCarouselSpec(spec)` is called
- **THEN** it reports `ok: true`

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
`NewsCarouselBaselineParams` (`{ logoReferenceName, pillText, neverAllCapsInstruction,
logoReferencePhrase, logoNameGuardrailInstruction, fixedClauses, heroLogoClauses, confirmedCardStyles,
topRegionCardStyles, minDistinctCardStyles, heroTextCardMinPctClause, standardTextCardMinPctClause,
realImageFrameClause, realVideoWindowClause }` — the last four added issue #188/ADR-0024). It SHALL run
the News Carousel Recipe's FULL author-phase checklist entirely as CODE, returning a
`PhaseAuditResult` (`src/recipe/phase-contract.ts`) whose `items` carry STABLE, unique `id`s (never
selected by array position — issue #105) with exactly 15 entries (without a supplied
`baselineDocumentText`; 16 with one), covering:

1. **`slide-count-role-order`** — exactly 7 slides, in fixed role order (`hook, then, shift, proof,
   different, next, cta`) — derived from `news-carousel-validate.ts`'s `validateNewsCarouselSpec`'s
   own result codes (`slides_count`, `slide_role_order`), never re-deriving the count/order rule.
2. **`text-length`** — each slide's on-card `text` at most 140 chars — derived from the SAME
   `validateNewsCarouselSpec` result's `slide_text_too_long` code.
3. **`text-card-size`** (NEW, issue #188) — each HERO slide's (hook/cta, `CAROUSEL_HERO_ROLES`)
   `image_prompt` states `baseline.heroTextCardMinPctClause` verbatim; every OTHER slide states
   `baseline.standardTextCardMinPctClause` verbatim — replacing the old, role-blind ~25-30% card.
4. **`slide-kind-source`** (NEW, issue #188) — derived from the SAME `validateNewsCarouselSpec`
   result's `slide_kind_invalid`/`slide_source_url_invalid` codes, surfaced granularly (mirrors how
   `text-length` surfaces `slide_text_too_long`).
5. **`logo-reference`** (REWORKED, issues #110/#188) — a HERO slide's (hook/cta) `image_prompt`
   references the connected logo — via `baseline.logoReferenceName` OR `baseline.logoReferencePhrase`
   (either is acceptable; the raw, underscored reference name is no longer required on its own) —
   carries `baseline.logoNameGuardrailInstruction` verbatim, AND carries every entry of
   `baseline.heroLogoClauses` verbatim; every OTHER slide's `image_prompt` references the logo
   NOWHERE at all (neither the raw name nor the generic phrase) — the logo is scoped to the two hero
   slides only. Forcing the raw name into every prompt unconditionally was the ROOT CAUSE of epic
   #106 item 5's reproduction: the image model sometimes printed that odd, filename-like token as
   visible on-image text instead of using it as a bare reference identifier.
6. **`logo-name-not-as-text`** (issue #110) — the logo reference name never appears QUOTED
   anywhere in the `image_prompt` (this same document's own convention for literal on-image text, e.g.
   `"Unhypped News"`) — REJECT-ONLY, mirroring `no-dash-tells`/`banned-words`'s "report, never
   rewrite" contract. A reference name inside quotes is the specific, checkable anti-pattern of
   telling the model to DRAW that string rather than use it as a bare identifier.
7. **`pill-text-caps`** — each `image_prompt` contains `baseline.pillText` AND
   `baseline.neverAllCapsInstruction`.
8. **`fixed-clauses`** (NARROWED, issue #188) — each `image_prompt` keeps every clause in
   `baseline.fixedClauses` verbatim — now the clauses that apply to EVERY slide uniformly (the two
   logo-specific clauses that used to live here moved to `heroLogoClauses`, checked as part of item 5
   above, since a middle slide carries neither).
9. **`real-media-composited`** (NEW, issue #188/ADR-0024) — an `image`-kind slide's `image_prompt`
   states `baseline.realImageFrameClause` verbatim; a `video`-kind slide's states
   `baseline.realVideoWindowClause` verbatim; a `generated`-kind slide (or one with no `kind` at all)
   carries neither requirement.
10. **`grounded-subject`** — real product/logo/action, or an intentional photographic scene; never an
    invented UI shown as a real product's own screen — `kind: "agent-judged"`, `ok: null`, never
    computed, never blocking the overall result.
11. **`card-style-stat-callout`** — `card_style` is one of `baseline.confirmedCardStyles`;
    `stat_callout` is non-empty.
12. **`placement-variety`** (issue #106) — the 7 slides' `card_style` values are spread, not monotone:
    at least `baseline.minDistinctCardStyles` DISTINCT values AND at least one member of
    `baseline.topRegionCardStyles` — `kind: "mechanical"`, both bars read from
    `NewsCarouselBaselineParams` (ADR-0015), never a hardcoded literal. Fully specified in its own
    Requirement below.
13. **`companies-cited`** — every company named in a slide's `companies` field is cited, as a
    standalone token (never a bare substring), in that same slide's own `image_prompt` (a slide naming
    no real company skips the logo row entirely — issue #102 finding #1).
14. **`banned-words`** — no banned word in any field — derived from
    `news-carousel-brand-safety.ts`'s `scanNewsCarouselForBannedWords`'s own result, REJECT-only
    (never a silent swap, always-rule 9).
15. **`no-dash-tells`** — no em dash, en dash, or hyphen used as a sentence dash in any slide's
    `stat_callout`/`text` (issue #108), REJECT-only, via `dash-safety.ts`'s
    `scanTextFieldsForDashes`. Deliberately does NOT scan `image_prompt`. An ordinary hyphenated
    compound word (e.g. `state-of-the-art`) is NOT flagged.

When `baselineDocumentText` is supplied, a 16th item, **`baseline-doc-verified`**, additionally
verifies every hand-copied fact in `baseline` (including `heroLogoClauses` and the four issue #188
additions) is a genuine, verbatim substring of that raw document text.

The overall `ok` SHALL be `true` iff `validateNewsCarouselSpec(candidateSpec).ok` is `true` AND no item
above is `ok: false` (the referenced structural validator is the authoritative gate for shape/count/
order/length). The function SHALL never throw, for any input shape.

#### Scenario: A baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed

- **GIVEN** a well-formed 7-slide Spec whose hero slides (hook/cta) carry (`baseline.logoReferenceName`
  OR `baseline.logoReferencePhrase`), `baseline.logoNameGuardrailInstruction`, and every entry of
  `baseline.heroLogoClauses`; whose EVERY slide carries `baseline.pillText`,
  `baseline.neverAllCapsInstruction`, every clause in `baseline.fixedClauses`, and its
  role-appropriate text-card-size clause; whose `card_style`s are each one of
  `baseline.confirmedCardStyles`; and whose `stat_callout`/`text` fields carry no dash tell and whose
  `image_prompt`s never quote the reference name
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `15`, exactly one item (`id:
  "grounded-subject"`) is `kind: "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item
  is `ok: true`

#### Scenario: A short Spec fails the slide-count-role-order item by referencing validateNewsCarouselSpec, not duplicating it

- **GIVEN** a Spec with only 6 slides
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and the item with `id: "slide-count-role-order"` has `ok: false`

#### Scenario: A prompt missing the raw reference name still passes logo-reference, as long as the generic phrase and the guardrail are present

- **GIVEN** a baseline-adherent Spec with `baseline.logoReferenceName` removed from every HERO slide's
  `image_prompt` (the generic `baseline.logoReferencePhrase` and
  `baseline.logoNameGuardrailInstruction` both remain)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's item with `id: "logo-reference"` has `ok: true` — the raw, underscored
  reference name is never required on its own (issue #110)

#### Scenario: A prompt carrying the raw reference name but missing the negative guardrail fails logo-reference

- **GIVEN** a baseline-adherent Spec with `baseline.logoNameGuardrailInstruction` removed from every
  HERO slide's `image_prompt` (the raw `baseline.logoReferenceName` remains)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and the item with `id: "logo-reference"` has `ok: false` —
  every OTHER mechanical item remains `ok: true`

#### Scenario: A prompt referencing the logo by neither the raw name nor the generic phrase fails logo-reference

- **GIVEN** a baseline-adherent Spec with BOTH `baseline.logoReferenceName` and
  `baseline.logoReferencePhrase` removed from every HERO slide's `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and the item with `id: "logo-reference"` has `ok: false` — the
  item is never vacuously true

#### Scenario: A prompt rendering the reference name as quoted, literal on-image text fails the logo-name-not-as-text item, isolated from every other item

- **GIVEN** a baseline-adherent Spec whose "hook" slide's `image_prompt` additionally renders
  `baseline.logoReferenceName` wrapped in double quotes (mirroring how this same document quotes
  literal on-image text, e.g. the pill text)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false`, the item with `id: "logo-name-not-as-text"` has `ok: false`
  and its `detail` names the specific slide field the quoted occurrence was found in
- **AND** the item with `id: "logo-reference"` remains `ok: true` — the plain, unquoted reference is
  untouched by this mutation

#### Scenario: A Spec missing the pill text or the never-all-caps instruction fails pill-text-caps

- **GIVEN** a baseline-adherent Spec with either `baseline.pillText` or
  `baseline.neverAllCapsInstruction` removed from every `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and the item with `id: "pill-text-caps"` has `ok: false`

#### Scenario: A Spec missing one fixed baseline clause fails fixed-clauses

- **GIVEN** a baseline-adherent Spec with one entry of `baseline.fixedClauses` removed from every
  `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and the item with `id: "fixed-clauses"` has `ok: false`

#### Scenario: A Spec using an unconfirmed card_style fails card-style-stat-callout

- **GIVEN** a baseline-adherent Spec whose first slide's `card_style` is not a member of
  `baseline.confirmedCardStyles`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and the item with `id: "card-style-stat-callout"` has
  `ok: false`

#### Scenario: A banned word fails banned-words, reject-only, and is named — never rewritten

- **GIVEN** a baseline-adherent Spec containing the word `"miracle"` and a `bannedWords` list of
  `["miracle"]`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, ["miracle"], baseline)` is called
- **THEN** the result's `ok` is `false`, the item with `id: "banned-words"` has `ok: false`, its
  `detail` names `"miracle"`, and no rewritten/corrected Spec is ever returned alongside the result

#### Scenario: A slide's on-card text containing an em dash fails no-dash-tells, reject-only, isolated from every other item

- **GIVEN** a baseline-adherent Spec whose "cta" slide's `text` contains an em dash ("—")
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `false`, the item with `id: "no-dash-tells"` has `ok: false` and its
  `detail` names the em dash and the specific `slides[N].text` field it was found in
- **AND** every OTHER mechanical item (e.g. `banned-words`) remains `ok: true`

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

#### Scenario: A STANDARD slide (then/shift/proof/different/next) wrongly referencing the logo fails logo-reference (issue #188)

- **GIVEN** a baseline-adherent Spec whose one STANDARD slide's `image_prompt` additionally references
  `baseline.logoReferenceName`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and the item with `id: "logo-reference"` has `ok: false` —
  every OTHER mechanical item (e.g. `pill-text-caps`, `text-card-size`) remains `ok: true`

#### Scenario: A slide missing its role-appropriate text-card-size clause fails text-card-size, isolated (issue #188)

- **GIVEN** a baseline-adherent Spec with both `baseline.heroTextCardMinPctClause` and
  `baseline.standardTextCardMinPctClause` removed from every `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false`, the item with `id: "text-card-size"` has `ok: false`, and the
  item with `id: "logo-reference"` remains `ok: true`

#### Scenario: An image-kind slide reserving the frame passes real-media-composited; one that doesn't fails it, isolated (issue #188/ADR-0024)

- **GIVEN** a baseline-adherent Spec whose one slide is `kind: "image"` with a well-formed
  `source_url`, whose `image_prompt` states `baseline.realImageFrameClause` verbatim, and SEPARATELY
  the SAME Spec with that clause removed
- **WHEN** `auditNewsCarouselAuthorPhase` is called with each
- **THEN** the first's `real-media-composited` item is `ok: true` and overall `ok` is `true`; the
  second's `real-media-composited` item is `ok: false` while `slide-kind-source` remains `ok: true`
  (the structural kind/source_url shape is fine — only the compositing clause is missing)

#### Scenario: A video-kind slide reserving the window and stating the calmer background passes real-media-composited; one that doesn't fails it (issue #188/ADR-0024)

- **GIVEN** a baseline-adherent Spec whose one slide is `kind: "video"` with a well-formed
  `source_url`, whose `image_prompt` states `baseline.realVideoWindowClause` verbatim, and SEPARATELY
  the SAME Spec with that clause removed
- **WHEN** `auditNewsCarouselAuthorPhase` is called with each
- **THEN** the first's `real-media-composited` item is `ok: true`; the second's is `ok: false`

#### Scenario: A slide with an invalid kind, or an image/video-kind slide missing source_url, fails slide-kind-source (issue #188)

- **GIVEN** a baseline-adherent Spec whose one slide's `kind` is `"gif"`, and SEPARATELY one whose one
  slide is `kind: "image"` with no `source_url` at all
- **WHEN** `auditNewsCarouselAuthorPhase` is called with each
- **THEN** both report `ok: false` with the item `id: "slide-kind-source"` at `ok: false`

#### Scenario: A Spec with no kind field at all passes slide-kind-source and real-media-composited cleanly (backward compatible, issue #188)

- **GIVEN** a baseline-adherent Spec whose slides carry no `kind` field at all
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** both `id: "slide-kind-source"` and `id: "real-media-composited"` are `ok: true`

### Requirement: The graduated Skill's target output is proven on-contract against a real (Brand x Format)

The system SHALL provide a committed fixture demonstrating that the `produce-news-carousel` Skill's
promised output — the map-#77 prototype's 7 on-contract carousel prompts for idea-01 — is genuinely
on-contract for a REAL Brand and Format, not only for the stand-in `TEST_BASELINE` issue #85 already
proved parameterization with. `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`
SHALL export `STRAW_MOTION_BASELINE` (a `NewsCarouselBaselineParams` built from Straw Motion's real,
committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`: its logo
reference name, its pill text, its never-all-caps instruction, its name-free logo reference phrase and
its negative-prompt logo guardrail instruction (both issue #110), three of its fixed clauses verbatim
(uniform across every slide), its two hero-only logo-render clauses (`heroLogoClauses`, issue #188), its
two confirmed card styles, and its four issue #188/ADR-0024 clauses (`heroTextCardMinPctClause`,
`standardTextCardMinPctClause`, `realImageFrameClause`, `realVideoWindowClause`)) and
`strawMotionIdeaOneCarouselSpec()` (idea-01's 7-slide authored Spec, `kind`-absent throughout — a
historical, all-generated fixture). Every slide's `stat_callout`/`text` SHALL itself be dash-tell-free
(issue #108); every HERO slide's (hook/cta) `image_prompt` SHALL carry the negative guardrail
instruction verbatim (issue #110) and the logo reference at its OWN existing scale (~⅓ hook, ~⅙ cta);
every OTHER slide's `image_prompt` SHALL carry NO logo reference at all (issue #188) — the fixture is a
genuinely on-contract example, not merely a structurally-valid one.

#### Scenario: The committed fixture passes the #81 structural validator

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`
- **WHEN** `validateNewsCarouselSpec` is called with it
- **THEN** the result's `ok` is `true` and `errors` is empty

#### Scenario: The committed fixture passes the #85/#110/#188 author-phase checklist, parameterized with Straw Motion's real strings

- **GIVEN** `strawMotionIdeaOneCarouselSpec()` and `STRAW_MOTION_BASELINE`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `15`, exactly one item (`id:
  "grounded-subject"`) is `kind: "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item
  is `ok: true` (including `no-dash-tells`, issue #108, `logo-name-not-as-text`, issue #110,
  `placement-variety`, issue #106, and `text-card-size`/`logo-reference`/`slide-kind-source`/
  `real-media-composited`, issue #188)

#### Scenario: Every HERO slide (hook/cta) carries the negative guardrail and its own scale; every other slide carries no logo reference at all (issue #188)

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`
- **WHEN** each slide's `image_prompt` is inspected against its `role`
- **THEN** the hook and cta slides' `image_prompt`s both include `STRAW_MOTION_BASELINE
  .logoNameGuardrailInstruction` and `.logoReferencePhrase`; every other slide's `image_prompt`
  includes NEITHER

#### Scenario: STRAW_MOTION_BASELINE's own strings are genuinely present in the real, committed document

- **GIVEN** the real Format loaded via `loadFormat("straw-motion", "unhypped-news")` and its
  Baseline Prompt for `"news-carousel"` loaded via `loadBaselinePrompt`
- **WHEN** the document's content is normalized (blockquote markers stripped, lines joined, repeated
  whitespace collapsed) and checked for substring containment
- **THEN** it contains `STRAW_MOTION_BASELINE.logoReferenceName`, `.pillText`,
  `.neverAllCapsInstruction`, `.logoReferencePhrase`, `.logoNameGuardrailInstruction` (both issue
  #110), every entry of `.fixedClauses`, every entry of `.heroLogoClauses`, `.heroTextCardMinPctClause`,
  `.standardTextCardMinPctClause`, `.realImageFrameClause`, and `.realVideoWindowClause` (issue #188)
  — none of these strings are asserted by fiat; each is verified against the real document's own prose

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

### Requirement: A pure, reusable dash "tell" scanner rejects em dashes, en dashes, and spaced hyphens

The system SHALL provide `scanTextFieldsForDashes(fields)` in `src/production-spec/dash-safety.ts` —
pure, deterministic, no I/O, no clock, no Brand configuration — generic over the SAME `TextField[]`
shape (`{ field, text }`) `brand-safety.ts`'s `scanTextFields` (the banned-word core) already shares
between the News Carousel Spec-shape scan and the composed-Copy scan. It SHALL flag, per field: an em
dash ("—"); an en dash ("–"); and a hyphen-minus with whitespace on BOTH sides (" - ", the
typewriter-era stand-in for an em dash). It SHALL NOT flag an ordinary hyphenated compound word (no
whitespace touches its hyphen, e.g. `state-of-the-art`, `task-assistant`) nor a bare negative number
(nothing follows its hyphen but a digit, e.g. `-3.7x`). The function SHALL be REJECT-ONLY: it SHALL
NEVER rewrite or strip the offending text — a hit only ever fails the scan, mirroring
`scanTextFields`'s own "report, never rewrite" contract exactly.

#### Scenario: An em dash, an en dash, and a spaced hyphen are each flagged

- **GIVEN** three separate text fields, one containing an em dash, one an en dash, and one a hyphen
  surrounded by whitespace on both sides (" - ")
- **WHEN** `scanTextFieldsForDashes` is called with all three
- **THEN** the result's `ok` is `false` and `hits` names all three fields, one hit each

#### Scenario: An ordinary hyphenated compound word is never flagged

- **GIVEN** a text field reading "This is a state-of-the-art task-assistant."
- **WHEN** `scanTextFieldsForDashes` is called with it
- **THEN** the result's `ok` is `true` — neither hyphen has whitespace touching it, so neither is a
  "used as a dash" tell

#### Scenario: A bare negative number is never flagged

- **GIVEN** a text field reading "Distribution was -3.7x the baseline."
- **WHEN** `scanTextFieldsForDashes` is called with it
- **THEN** the result's `ok` is `true` — the hyphen has no whitespace immediately after it

#### Scenario: A dash-free field passes; an empty fields list always passes

- **GIVEN** a text field with no dash of any kind, and separately an empty `fields` list
- **WHEN** `scanTextFieldsForDashes` is called with each
- **THEN** both report `ok: true` with no hits

#### Scenario: The scanner never rewrites — the result carries only hits, never a corrected text

- **GIVEN** a text field containing an em dash
- **WHEN** `scanTextFieldsForDashes` is called with it
- **THEN** the result reports `ok: false` with a hit naming the field and the exact tell matched
- **AND** the result carries no "corrected"/rewritten text of any kind

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

### Requirement: The Brand Profile reader exposes the Brand's Channel list and its ONE primary entry, defensively (ADR-0019)

`src/production-spec/brand-profile.ts` SHALL provide `channelsFrom(raw)` and `primaryChannelFrom(raw)`
(pure) plus `loadChannels(path)` and `loadPrimaryChannel(path)` (the async I/O shell), reading the
Brand Profile's `channel` field from already-parsed / on-disk data respectively. Per ADR-0019, `channel`
is a LIST of entries shaped `{ platform, url?, primary? }` — a Brand may publish to several platforms,
and exactly one entry carries `primary: true`: the entry the Channel performance-tracker, the baseline,
readiness checks, and ledger attribution all key off (unchanged machinery from the pre-list
single-Channel behavior — per-Channel tracking for the rest is a deliberate future epic, not built by
this Requirement). There is NO `handle` field on a Channel entry — LinkedIn `@mention` tagging is a
separate lookup (issue #126).

This is a migrate-in-place change with NO back-compat shim for the pre-ADR-0019 single-object shape
(`channel: { name, platform, url }`): `channelsFrom` SHALL treat any `channel` value that is not an
array — including that old object shape — the same as a missing `channel` key, yielding `[]`.

Both reader functions SHALL be defensive (data-handling rule 4 — never let one malformed record crash a
Run): a list entry that is not an object, or whose `platform` is missing, blank, or non-string, SHALL be
dropped rather than crashing the whole Run; a malformed/absent `url` on a surviving entry SHALL default
to `""` (never `null`/`undefined`); a malformed/absent `primary` SHALL default to `false`.
`primaryChannelFrom` SHALL return `null` when no surviving entry is marked `primary: true`. If more than
one surviving entry is (mis)configured `primary: true`, `primaryChannelFrom` SHALL deterministically
return the FIRST such entry — never throw, never pick arbitrarily.

#### Scenario: channelsFrom reads a multi-Channel list with one primary entry

- **GIVEN** `{ channel: [{ platform: "facebook", url: "https://fb.example/page", primary: true },
  { platform: "instagram", url: "" }] }`
- **WHEN** `channelsFrom(raw)` is called
- **THEN** it returns both entries, `platform`/`url` trimmed, the facebook entry's `primary` is
  `true` and the instagram entry's `primary` is `false`

#### Scenario: channelsFrom returns [] for the pre-ADR-0019 single-object channel shape — no back-compat shim

- **GIVEN** `{ channel: { name: "TestBrand", platform: "facebook", url: "https://x.test" } }` (the old
  single-Channel object shape)
- **WHEN** `channelsFrom(raw)` is called
- **THEN** it returns `[]` — the old shape is NOT reinterpreted as a one-entry Channel list

#### Scenario: channelsFrom drops malformed entries without crashing

- **GIVEN** a `channel` list containing one well-formed entry alongside `null`, a number, a string, an
  empty object, an entry with a blank `platform`, an entry with a non-string `url`, and an entry with a
  non-boolean `primary`
- **WHEN** `channelsFrom(raw)` is called
- **THEN** the malformed entries are dropped or defensively coerced (non-string `url` → `""`,
  non-boolean `primary` → `false`) rather than throwing, and the well-formed entry is still present in
  the result

#### Scenario: primaryChannelFrom returns the one primary entry, or null when none/multiple are marked

- **GIVEN** a Channel list with exactly one entry marked `primary: true`
- **WHEN** `primaryChannelFrom(raw)` is called
- **THEN** it returns that entry
- **GIVEN** a Channel list with NO entry marked `primary: true`
- **WHEN** `primaryChannelFrom(raw)` is called
- **THEN** it returns `null`
- **GIVEN** a Channel list with MORE THAN ONE entry marked `primary: true`
- **WHEN** `primaryChannelFrom(raw)` is called
- **THEN** it deterministically returns the FIRST such entry — never throws

#### Scenario: loadChannels / loadPrimaryChannel degrade to [] / null for a missing file, never crash

- **GIVEN** a path with no file on disk
- **WHEN** `loadChannels(path)` and `loadPrimaryChannel(path)` are called
- **THEN** they resolve to `[]` and `null` respectively, never rejecting

### Requirement: The Brand Profile reader exposes per-Brand Zoho Social Brand config, defensively (issue #143)

`src/production-spec/brand-profile.ts` SHALL provide `zohoConfigFrom(raw, brand)` (pure) and
`loadZohoConfig(path, brand)` (the async I/O shell), reading an OPTIONAL top-level `zoho` field from
already-parsed / on-disk Brand Profile data respectively. `brand` SHALL be an explicit, caller-supplied
identity string (the Brand's slug or display name) used to name that Brand in the returned
message/result — this module does no Brand-existence validation of its own.

The `zoho` field's shape, when present, SHALL be `{ brands: ZohoSocialBrand[] }`, where each
`ZohoSocialBrand` entry represents one **Zoho Social Brand** (Zoho's own container of connected
accounts, distinct from an OrganicGrowth **Brand**) and SHALL carry: an OPTIONAL `name` (a
human-readable label, defaulting to `""` when absent — never itself a validation problem); a REQUIRED
`timezone` (a non-empty string that SHALL be a timezone identifier `Intl.DateTimeFormat` accepts — the
standard-library IANA timezone database check, no new dependency); and a REQUIRED, non-empty `channels`
array of `{ platform, label }` entries, where `platform` is the OrganicGrowth Channel platform key (a
free string, matching `Channel.platform`'s own convention — NOT cross-validated against the Brand's own
`channel` list) and `label` is the EXACT string Zoho's bulk uploader matches for that platform's
connected account, read and passed through VERBATIM — never normalized, guessed, or title-cased (e.g. a
personal LinkedIn profile's label is `"LinkedInProfile"`, a DIFFERENT Zoho channel than the company-Page
`"LinkedIn"`).

Both functions SHALL NEVER throw, for any input shape, and SHALL always return one of exactly two typed
results (mirroring `src/format/baseline-prompt.ts`'s `BaselinePromptLookup` never-throwing convention):

- `{ configured: true, brand, zohoBrands }` — the `zoho` field was present and every entry validated
  cleanly.
- `{ configured: false, brand, reason, message, errors }` — with `reason` either:
  - `"not_configured"` — the raw profile data (or the file at `path`, including a missing file) carries
    NO `zoho` key at all. This is the ORDINARY, expected outcome for a Brand that has not wired Schedule
    Batch yet (e.g. MundoTip) — NOT an error; `errors` SHALL be `[]`.
  - `"malformed"` — a `zoho` key IS present but fails validation. `errors` SHALL be non-empty and SHALL
    name EVERY problem found across the whole structure (never only the first, never a partial
    best-effort result) — including (each independently, all collected together when several occur at
    once): `zoho` itself not being an object; `zoho.brands` missing, not an array, or empty; a
    `zoho.brands` entry not being an object; that entry's `timezone` missing, blank, or not a string; a
    present `timezone` string that is not a recognized IANA identifier; that entry's `channels` missing,
    not an array, or empty; a `channels` entry not being an object; a `channels` entry's `platform` or
    `label` missing, blank, or not a string; and the SAME `platform` value appearing under more than one
    Zoho Social Brand entry (each platform SHALL map to exactly one CSV file).

  In both `reason` cases, `message` SHALL name `brand` explicitly (e.g.
  `Brand "mundotip" has no "zoho" config...`).

Every string field read (`name`, `timezone`, `platform`, `label`) SHALL be trimmed of surrounding
whitespace before being placed on the returned `ZohoSocialBrand`/`ZohoChannelMapping`.

#### Scenario: A Brand with no zoho key gets a clear not-configured result, naming the Brand

- **GIVEN** an already-parsed Brand Profile with no `zoho` key (e.g. MundoTip's real, committed
  profile)
- **WHEN** `zohoConfigFrom(raw, "mundotip")` (or `loadZohoConfig` against that file) is called
- **THEN** it returns `configured: false`, `reason: "not_configured"`, `errors: []`, and a `message`
  naming `"mundotip"` and stating it is not configured for Schedule Batch
- **AND** it never throws

#### Scenario: A well-formed two-Zoho-Brand config is read in full

- **GIVEN** a `zoho.brands` list of two well-formed entries — one grouping `facebook`/`instagram`/
  `tiktok` with labels `Facebook`/`Instagram`/`TikTok`, one grouping `linkedin`/`x` with labels
  `LinkedInProfile`/`X` — both carrying the same `timezone`
- **WHEN** `zohoConfigFrom(raw, brand)` is called
- **THEN** it returns `configured: true` with `zohoBrands` deep-equal to the two entries exactly as
  configured, each `platform`/`label` trimmed

#### Scenario: A missing name defaults to '' without being a validation problem

- **GIVEN** a `zoho.brands` entry with a well-formed `timezone` and `channels` but no `name` field
- **WHEN** `zohoConfigFrom(raw, brand)` is called
- **THEN** it returns `configured: true` with that entry's `name` equal to `""`

#### Scenario: A non-object zoho value is malformed, naming the Brand

- **GIVEN** an already-parsed Brand Profile whose `zoho` field is a string (not an object)
- **WHEN** `zohoConfigFrom(raw, "straw-motion")` is called
- **THEN** it returns `configured: false`, `reason: "malformed"`, a non-empty `errors` list, and a
  `message` naming `"straw-motion"`

#### Scenario: Missing or empty zoho.brands is malformed

- **GIVEN** `zoho: {}` (no `brands` key) and separately `zoho: { brands: [] }` (an empty list)
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** both return `configured: false, reason: "malformed"`

#### Scenario: A missing or unrecognized timezone is malformed

- **GIVEN** a `zoho.brands` entry with no `timezone` field, and separately one whose `timezone` is
  `"Not/AZone"` (not a recognized IANA identifier)
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** both return `configured: false, reason: "malformed"`, with `errors` naming the specific
  entry (by index) and, for the unrecognized case, the bad timezone string itself

#### Scenario: Missing or empty channels, or a channel missing platform/label, is malformed

- **GIVEN** a `zoho.brands` entry with no `channels` field, one with `channels: []`, one whose one
  channel entry has no `platform`, and one whose one channel entry has no `label`
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** every case returns `configured: false, reason: "malformed"`

#### Scenario: A platform assigned to more than one Zoho Social Brand is malformed, naming the platform

- **GIVEN** a `zoho.brands` list whose two entries both declare a channel mapping for the SAME
  `platform` value (e.g. `"facebook"` in both)
- **WHEN** `zohoConfigFrom(raw, "straw-motion")` is called
- **THEN** it returns `configured: false, reason: "malformed"`, with `errors` naming `"facebook"` and
  stating each platform must map to exactly one CSV file

#### Scenario: Multiple independent problems are ALL reported, never just the first

- **GIVEN** a `zoho.brands` entry with BOTH a missing `timezone` AND an empty `channels` list
- **WHEN** `zohoConfigFrom(raw, brand)` is called
- **THEN** it returns `configured: false, reason: "malformed"` with `errors` containing at least two
  distinct problems (never short-circuiting after the first)

#### Scenario: The function never throws for any malformed shape

- **GIVEN** any of `null`, `undefined`, `{}`, `{ zoho: null }`, `{ zoho: 7 }`, or
  `{ zoho: { brands: "nope" } }`
- **WHEN** `zohoConfigFrom(raw, brand)` is called with each
- **THEN** it returns a typed result without throwing

#### Scenario: loadZohoConfig degrades a missing file to not_configured, never crashes

- **GIVEN** a `path` with no file on disk
- **WHEN** `loadZohoConfig(path, brand)` is called
- **THEN** it resolves to `configured: false, reason: "not_configured"`, naming `brand` — it never
  rejects

#### Scenario: Straw Motion's real, committed Brand Profile carries the real grouping, labels, and clock

- **GIVEN** the real, committed `data/brands/straw-motion/brand-profile.yaml`
- **WHEN** `loadZohoConfig(path, "straw-motion")` is called against it
- **THEN** it returns `configured: true` with exactly two Zoho Social Brands: one grouping
  `facebook`/`instagram`/`tiktok` (the main file), one grouping `linkedin`/`x` (the second file)
- **AND** the `linkedin` entry's `label` is EXACTLY `"LinkedInProfile"` — never `"LinkedIn"`
- **AND** both Zoho Social Brands share the same, non-empty `timezone` (the Operator's own clock)

#### Scenario: MundoTip's real, committed Brand Profile is not configured for Schedule Batch

- **GIVEN** the real, committed `data/brands/mundotip/brand-profile.yaml` (deliberately left
  untouched by this change — MundoTip's actual Zoho wiring is a separate, later task)
- **WHEN** `loadZohoConfig(path, "mundotip")` is called against it
- **THEN** it returns `configured: false, reason: "not_configured"`, naming `"mundotip"`

### Requirement: News Short Script Production Spec validation (issue #174)

`validateNewsShortScriptSpec` (`src/production-spec/news-short-script-validate.ts`) SHALL validate a
candidate News Short Script Production Spec (`{ beats: [{ role, text, source_url, media_url?, show_cue,
curiosity_queries }] }`, `src/production-spec/news-short-script-contract.ts`'s `NewsShortScriptSpec`):
`beats` SHALL be a non-empty array whose first entry's `role` is `"hook"`, whose last entry's `role` is
`"cta"`, and whose every entry between them has `role: "story"` (at least `MIN_STORY_BEATS`, default 1);
every beat SHALL carry a non-empty `text`/`source_url`/`show_cue`, a `source_url` that looks like an
http(s) URL, and — when present — a `media_url` that also looks like an http(s) URL; and the WHOLE Spec's
total word count (summed across every beat's `text`) SHALL fall in `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`
(120-150, the issue's own "~120-150 words" 45-60-second target). Every beat SHALL ALSO carry a
`curiosity_queries` array (CONTEXT.md "Curiosity Queries") of `MIN_CURIOSITY_QUERIES`(3)-
`MAX_CURIOSITY_QUERIES`(5) entries, every entry a non-empty string — otherwise rejected with a
`"curiosity_queries_invalid"` error (issue #187). Never throws on shape; every failure is returned as
`{ code, message }`.

#### Scenario: A well-formed Spec (hook, one-or-more story beats, cta, 120-150 words total) validates ok

- **GIVEN** a Spec with a `"hook"` beat, two `"story"` beats, and a `"cta"` beat, totaling 123 words
  across their `text` fields, every beat carrying 3-5 Curiosity Queries
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: true, errors: [] }`

#### Scenario: A Spec whose first beat is not hook, or whose last beat is not cta, is rejected

- **GIVEN** a Spec whose first beat's `role` is `"story"` (not `"hook"`)
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: false }` with a `"beat_role_order"` error naming `beats[0]`

#### Scenario: A Spec with no story beat between hook and cta is rejected

- **GIVEN** a Spec with only a `"hook"` beat and a `"cta"` beat, no `"story"` beat between them
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: false }` with a `"beat_role_order"` error

#### Scenario: A beat's source_url or media_url that doesn't look like a URL is rejected

- **GIVEN** a Spec whose first beat's `source_url` is `"not-a-url"`
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: false }` with a `"source_url_invalid"` error

#### Scenario: A beat's media_url is optional — its absence never fails validation

- **GIVEN** a well-formed Spec whose second beat carries no `media_url` field at all
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: true }`

#### Scenario: A total word count outside 120-150 is rejected

- **GIVEN** a well-formed Spec whose every beat's `text` is reduced to one word (well under 120 total)
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: false }` with a `"word_count_out_of_range"` error

#### Scenario: A beat with fewer than 3, or more than 5, Curiosity Queries is rejected (issue #187)

- **GIVEN** a well-formed Spec whose second beat's `curiosity_queries` has 2 entries, or 6 entries
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: false }` with a `"curiosity_queries_invalid"` error

#### Scenario: A beat with a blank Curiosity Query entry, or with curiosity_queries missing entirely, is rejected (issue #187)

- **GIVEN** a well-formed Spec whose second beat's `curiosity_queries` contains a whitespace-only entry,
  OR carries no `curiosity_queries` field at all
- **WHEN** `validateNewsShortScriptSpec` is called
- **THEN** it returns `{ ok: false }` with a `"curiosity_queries_invalid"` error

### Requirement: Brand-safety hard filter on the News Short Script Production Spec covers EVERY beat text field (issue #174)

`scanNewsShortScriptForBannedWords` (`src/production-spec/news-short-script-brand-safety.ts`) SHALL scan
a candidate News Short Script Spec for the Brand's banned words across EVERY beat text field — `text`,
`source_url`, `media_url` (when present), and `show_cue` — reusing `brand-safety.ts`'s shared
`scanTextFields` core (case-insensitive, whole-word) so the matching rule can never drift from any other
Recipe's own scanner. When the Brand defines no banned words the scan always passes. Never throws on
shape.

#### Scenario: A banned word in a beat's text is caught

- **GIVEN** a Spec whose first beat's `text` contains the banned word "miracle"
- **WHEN** `scanNewsShortScriptForBannedWords(spec, ["miracle"])` is called
- **THEN** it returns `{ ok: false }` with a hit naming `beats[0].text`

#### Scenario: A banned word in a beat's show_cue, source_url, or media_url is also caught

- **GIVEN** a Spec whose first beat's `show_cue` contains the banned word "miracle"
- **WHEN** `scanNewsShortScriptForBannedWords(spec, ["miracle"])` is called
- **THEN** it returns `{ ok: false }` with a hit naming `beats[0].show_cue`

#### Scenario: An empty banned-words list always passes, regardless of content

- **GIVEN** any Spec and an empty `bannedWords` list
- **WHEN** `scanNewsShortScriptForBannedWords` is called
- **THEN** it returns `{ ok: true, hits: [] }`

### Requirement: A universal calendar-date "tell" scanner (issue #187)

`scanTextFieldsForDates` (`src/production-spec/calendar-date-scan.ts`) SHALL scan a flat list of
`{ field, text }` pairs (`brand-safety.ts`'s shared `TextField` shape) and report every calendar-date
"tell" found, mirroring `dash-safety.ts`'s own reject-only, never-rewrite contract (`{ ok, hits }`, never
a `"corrected"` text). It SHALL catch: a month name (full or standard abbreviation) followed by a day,
with an optional ordinal suffix and/or a year (`"August 11"`, `"August 11th, 2026"`, `"Aug. 11"`); a day
followed by `"of"` and a month name, with an optional year (`"the 11th of August"`); an ISO date
(`"2026-08-11"`); and a numeric slash date (`"8/11/2026"`). Month names SHALL be matched
CASE-SENSITIVELY (capitalized) so an unrelated lowercase word sharing a month's spelling (`"may"`,
`"march"`) is never false-flagged. This module carries NO Brand configuration — the rule is universal,
like the dash-tell rule, never per-Brand.

#### Scenario: A month name + day, with or without an ordinal suffix and a year, is caught

- **GIVEN** text containing `"August 11"`, or `"August 11th, 2026"`, or an abbreviated `"Aug. 11"`
- **WHEN** `scanTextFieldsForDates` is called
- **THEN** it returns `{ ok: false }` with a hit whose `match` is the date-shaped substring found

#### Scenario: A day-of-month phrasing, an ISO date, and a numeric slash date are each caught

- **GIVEN** text containing `"the 11th of August"`, or `"2026-08-11"`, or `"8/11/2026"`
- **WHEN** `scanTextFieldsForDates` is called
- **THEN** it returns `{ ok: false }` with a matching hit, for each case independently

#### Scenario: A lowercase month-shaped word used as an ordinary verb is never flagged

- **GIVEN** text containing `"You may want to march forward on this one."`
- **WHEN** `scanTextFieldsForDates` is called
- **THEN** it returns `{ ok: true, hits: [] }`

#### Scenario: An empty fields list always passes; the result never carries a rewritten text

- **GIVEN** an empty `fields` array, or a field containing a date-shaped substring
- **WHEN** `scanTextFieldsForDates` is called
- **THEN** an empty list returns `{ ok: true, hits: [] }`; in either case the result never carries a
  `"corrected"`/rewritten text field — reject-only, mirroring `scanTextFieldsForDashes`

### Requirement: News Short Script author-phase checklist is graduated: Curiosity Queries, no calendar dates, and Shot List source variety (issue #187)

`src/production-spec/news-short-script-author-checklist.ts`'s `auditNewsShortScriptAuthorPhase` SHALL
layer a FOURTH new mechanical item, `no-repeated-phrases`, on top of the three issue #187 already added
(`curiosity-queries`, `no-calendar-dates`, `shot-list-variety`): `ok: true` iff no beat's own spoken
`text` repeats the same 4-word phrase more than once, via the new, exported `checkNoRepeatedPhrases`
(reject-only, mirroring `checkShotListVariety`'s own contract — report, never rewrite). This catches
issue #273 round 2's live reproduction: `news-short-script-generate.ts`'s stand-in used to pad a short
Brief title out to the "story" beat's 90-word target with a small, fixed `FILLER_WORDS` list, which — for
any real, few-word title — meant the SAME ~20-word filler phrase got concatenated ~4 times over.

#### Scenario: A beat padding itself out with the SAME phrase repeated fails ONLY no-repeated-phrases

- **GIVEN** an otherwise well-formed, banned-word-clean News Short Script Spec whose "story" beat's own
  `text` concatenates one ~11-word phrase 3 times over (keeping the WHOLE Spec's total word count inside
  120-150, isolating this one failure)
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `false`, the `no-repeated-phrases` item's `ok` is `false` (naming the
  repeated phrase and the beat), and `role-order-word-count`/`no-calendar-dates`/`shot-list-variety` all
  stay `ok: true`

### Requirement: Straw Motion's real News Short Script Baseline Prompt document rewrites its Sign-off family (issue #187)

`data/brands/straw-motion/baseline-prompts/unhypped-daily/news-short-script.md` SHALL NOT state the old,
generic "Follow Straw Motion" Sign-off family anywhere in the document. Its Sign-off guidance (CONTEXT.md
"Sign-off") SHALL instruct inviting a comment/question about the viewer's OWN life and how AI is
affecting them, and SHALL still instruct rotating within a small, fixed family rather than inventing a
new close per script (ritual repetition is unchanged — CONTEXT.md "Sign-off": "a daily show earns
recognition through ritual repetition"). Its worked Sign-off family SHALL carry at least 3 sample lines,
each within the beat map's own 6-11 word Sign-off budget.

#### Scenario: The document never states the old Follow-Straw-Motion family

- **GIVEN** the real, committed document, loaded via `loadFormat("straw-motion", "unhypped-daily")` then
  `loadBaselinePrompt(brand, format, "news-short-script")`
- **WHEN** its full text is inspected
- **THEN** it does not match `/Follow Straw Motion/`

#### Scenario: The document's Sign-off guidance names the viewer's own life and how AI is affecting it, and keeps the rotate-within-a-fixed-family instruction

- **GIVEN** the real, committed document, normalized (blockquote markers stripped, lines joined,
  whitespace collapsed)
- **WHEN** its Sign-off guidance is inspected
- **THEN** it states the Sign-off invites a comment/question tied to the viewer's OWN life and how AI is
  affecting them, and it still instructs rotating within the family (ritual repetition)

#### Scenario: The worked Sign-off family's sample lines each fall inside the 6-11 word budget

- **GIVEN** the real, committed document's worked Sign-off family (its bulleted sample lines)
- **WHEN** each sample line's word count is measured
- **THEN** every sample line falls within 6-11 words

### Requirement: A SQL-backed sibling persists the Production Spec on asset.spec_json

`src/production-spec/store.ts` SHALL expose `saveProductionSpec(db, assetId, spec)` and `loadProductionSpec(db, assetId)` as an ADDITIVE, `{ db }`-only sibling to the existing
`specPathFor`/`saveSpec`/`briefShortName` file-based functions (unchanged by this Requirement) — the
Production Spec has no table of its own; it lives inline as `asset.spec_json`, the SAME column
`AssetStore`'s `{ db }`-backed `writeAsset`/`DbAssetPatch.spec` also writes. `saveProductionSpec` SHALL
throw a clear, actionable error naming the id when `assetId` does not exist — a genuinely missing Asset
id is a caller bug, distinct from `loadProductionSpec`, which SHALL return `null` (never throw) both
when the Asset does not exist and when it exists but carries no Spec yet, since from a caller's point of
view both mean "no Spec available".

#### Scenario: loadProductionSpec returns null before any Spec is saved

- **GIVEN** a real, migrated database with a valid Asset that has never had a Spec saved
- **WHEN** `loadProductionSpec` is called
- **THEN** it returns `null`

#### Scenario: saveProductionSpec/loadProductionSpec round-trip a Spec verbatim, and a second save overwrites the first

- **GIVEN** a real, migrated database with a valid Asset
- **WHEN** `saveProductionSpec` is called with a Spec object, then called AGAIN with a different Spec
  object, then `loadProductionSpec` is called
- **THEN** the second Spec is returned, unchanged in shape, and the first is gone

#### Scenario: saveProductionSpec throws for an unknown Asset id

- **GIVEN** an `assetId` with no committed Asset row
- **WHEN** `saveProductionSpec` is called with that id
- **THEN** it throws an error naming the id

#### Scenario: loadProductionSpec returns null, not a throw, for an unknown Asset id

- **GIVEN** an `assetId` with no committed Asset row
- **WHEN** `loadProductionSpec` is called with that id
- **THEN** it returns `null`

### Requirement: A deterministic Spec author exists for every wired Recipe, mirroring the Copy step's own drafter seam

For every wired Recipe, a deterministic, hermetic function (no model call, no I/O, no clock) SHALL exist
that authors a candidate Production Spec conformant with that Recipe's own `specShape.validate` from a
minimal Brief (`id`, `run`, `title`, and optionally `angle`/`companies`) — mirroring
`src/copy/draft.ts`'s `CopyDrafter`/`skillDraftCopy` pattern, which already stands in for a Recipe's
copywriting Skill the same way. `src/production-spec/generate.ts`'s existing `generate` is this author
for `character-explainer-with-cast`; `src/production-spec/news-carousel-generate.ts`'s
`generateNewsCarouselSpec` is this author for `news-carousel`;
`src/production-spec/news-short-script-generate.ts`'s `generateNewsShortScriptSpec` is this author for
`news-short-script`. Each stands in, deterministically, for that Recipe's own `producerSkill` (an LLM
authoring step that runs interactively) — a real model call is never made by this module or any of its
callers.

#### Scenario: generateNewsCarouselSpec always produces a Spec its own Recipe accepts

- **GIVEN** any well-formed minimal Brief (a non-empty `id`/`run`/`title`)
- **WHEN** `generateNewsCarouselSpec(brief)` is called
- **THEN** the result has exactly 7 slides in the fixed role order `hook -> then -> shift -> proof ->
  different -> next -> cta`, each with a non-empty `card_style`/`stat_callout`/`text` (at most 140 chars)/
  `image_prompt`, and `validateNewsCarouselSpec(result).ok` is `true`

#### Scenario: generateNewsShortScriptSpec always produces a Spec whose total word count is in range

- **GIVEN** any well-formed minimal Brief
- **WHEN** `generateNewsShortScriptSpec(brief)` is called
- **THEN** the result's `beats` is `hook` first, `cta` last, with at least one `story` beat between them;
  each beat carries a well-formed `source_url`, a non-empty `show_cue`, and 3-5 `curiosity_queries`; the
  summed word count across every beat's `text` falls inside `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`; and
  `validateNewsShortScriptSpec(result).ok` is `true`

### Requirement: authorSpecForRecipe authors a candidate Spec and self-checks it against auditAuthorPhase in one call

`src/production-spec/author-at-review.ts`'s `authorSpecForRecipe(recipe, brief, bannedWords, authors?)` SHALL look up `recipe.slug`'s default author (from `DEFAULT_SPEC_AUTHORS`, overridable via the optional
`authors` parameter for tests), author a candidate Spec, then self-check it via
`auditAuthoredSpec(recipe, candidateSpec, bannedWords)`. `auditAuthoredSpec` SHALL run that Recipe's own
registered refinement from `AUTHOR_PHASE_REFINERS` (a Recipe-specific, standalone-runnable author-phase
auditor — one that needs no input beyond the candidate Spec and the Brand's banned words) when one is
registered for `recipe.slug`, else the generic, cross-Recipe `src/recipe/phase-contract.ts`'s
`auditAuthorPhase`. `AUTHOR_PHASE_REFINERS` SHALL register `news-carousel` ->
`auditNewsCarouselStandaloneAuthorPhase` and `news-short-script` ->
`auditNewsShortScriptAuthorPhase`; `character-explainer-with-cast` SHALL have no entry (unchanged
generic-only check). `command-surface/worker.ts`'s `runOneJob` SHALL call the SAME `auditAuthoredSpec`
for its own (defense-in-depth) author-phase check, so the accept-time self-check and the unattended
worker's own safety net are never two independently-drifting bars.
`authorSpecForRecipe` SHALL return `{ ok: true, spec, audit }` when the audit passes, or `{ ok: false,
audit }` (naming every failing checklist item) when it does not. A Recipe slug with no registered
author SHALL still return `{ ok: false }` naming the gap — never throw and never silently skip
authorship.

#### Scenario: A well-formed News Carousel Brief authors successfully, and the widened checklist's items are present

- **GIVEN** the `news-carousel` Recipe, a well-formed Brief, and no banned words
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called
- **THEN** it returns `{ ok: true }` carrying a Spec that ALSO passes `recipe.specShape.validate`
  directly (the same Spec the audit just checked, never a second, re-derived copy), and `audit.items`
  includes a `card-style-distinctness` item with `ok: true`

#### Scenario: A banned word in the Brief's title fails authorship loudly

- **GIVEN** the `news-carousel` Recipe, a Brief whose `title` contains a word later configured as banned
- **WHEN** `authorSpecForRecipe(recipe, brief, ["<that word>"])` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `banned-words` check failed, with a
  detail naming the exact hit

#### Scenario: A News Carousel author producing a filler Spec (one card_style on every slide) is rejected loudly, not silently persisted (issue #273)

- **GIVEN** the `news-carousel` Recipe and an injected author whose candidate Spec is structurally
  well-formed and banned-word-clean, but sets the exact SAME `card_style` on all 7 slides
- **WHEN** `authorSpecForRecipe(recipe, brief, [], { "news-carousel": fillerAuthor })` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `card-style-distinctness` item
  failed

#### Scenario: A News Short Script author whose beats all cite the same source host is rejected loudly (issue #273)

- **GIVEN** the `news-short-script` Recipe and an injected author whose candidate Spec is
  structurally well-formed and banned-word-clean, but whose beats' `source_url` all share one host
- **WHEN** `authorSpecForRecipe(recipe, brief, [], { "news-short-script": collidingAuthor })` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `shot-list-variety` item failed

#### Scenario: A Recipe with no registered refinement keeps the plain generic check, unchanged

- **GIVEN** the `character-explainer-with-cast` Recipe (no entry in `AUTHOR_PHASE_REFINERS`)
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called
- **THEN** the returned `audit.items` are exactly the two generic `auditAuthorPhase` items
  (`spec-shape`, `banned-words`) — no Recipe-specific item is added

#### Scenario: A title-only Brief (round 1's own residual gap) is REJECTED loudly, not silently authored as filler (issue #273 round 2)

- **GIVEN** the `news-carousel` Recipe and a Brief carrying only `id`/`run`/`title` (no `talkingPoints`) —
  the EXACT shape `accept-idea.ts` built before this round, and the shape it still falls back to when no
  Brief markdown can be found
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called (the DEFAULT author, never an injected
  synthetic one)
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `slide-text-variety` item failed —
  the generator has nothing but the bare headline to repeat across its 7 slides

#### Scenario: A title-only Brief fails News Short Script authorship on no-repeated-phrases, for the same reason (issue #273 round 2)

- **GIVEN** the `news-short-script` Recipe and the SAME title-only Brief
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called (the DEFAULT author)
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `no-repeated-phrases` item failed —
  the "story" beat's 90-word target has nothing real to draw from besides repeated filler padding

### Requirement: The file-backed Production Spec is located and persisted beside its Brief, segmented by Recipe

`src/production-spec/store.ts`'s `specPathFor(ideaId, run, ideasRoot, recipe, cadence?)` and `saveSpec(spec, path)` SHALL locate and write a Production Spec beside its Brief, at
`data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` — the machine-readable sibling of the Brief
(`idea-NN.md`) — so a SECOND chosen Recipe for the same Idea gets its OWN Spec file rather than
overwriting the first Recipe's. `recipe` SHALL be a required, explicit parameter (never defaulted or
inferred) — today's caller (`src/commands/accept-idea.ts`'s `acceptIdeaCommand`, via
`src/command-surface/production-spec.ts`'s `refreshSpecFile`, ADR-0031) always knows it explicitly, as
Review's own chosen-Recipe selection.

`specPathFor` SHALL accept an OPTIONAL `cadence` (`FormatCadence`, ADR-0023, issue #185) parameter,
DEFAULTING to `"weekly"` when omitted — so every call site that predates cadence-awareness keeps
producing the exact same flat `<ideasRoot>/<run>/idea-NN.<recipe>.spec.json` path, byte-for-byte
unchanged. WHEN `cadence` is `"daily"`, the `<run>` segment SHALL instead expand to
`runPathSegments(run, "daily")` (`src/format/run-id.ts`) — the Run's ISO week, then its
weekday-DD-month leaf — nesting the Spec under
`<ideasRoot>/<ISO-week>/<weekday>-<DD>-<month>/idea-NN.<recipe>.spec.json`.

`src/production-spec/generate.ts`'s `generate` — the `character-explainer-with-cast` Recipe's
deterministic Spec author (ADR-0031's "A deterministic Spec author exists for every wired Recipe"
Requirement) — SHALL accept a `Brief` carrying an OPTIONAL `companies` field, `readonly string[]`. WHEN
`Brief.companies` is supplied (non-empty OR an explicit `[]`), `generate()` SHALL carry it through
UNCHANGED onto the generated Spec's own top-level `companies` field. WHEN `Brief.companies` is
`undefined`, the generated Spec SHALL carry NO `companies` field at all (never invented to fill it).

#### Scenario: Two Recipes of one Idea each get their own Spec file

- **GIVEN** one Idea, one Run, and TWO Recipe slugs (`character-explainer-with-cast` and `carousel`)
- **WHEN** `specPathFor` is called once per Recipe with the same Idea/Run/root
- **THEN** the two calls return two DIFFERENT paths
- **AND** saving a Spec to each via `saveSpec` writes two DIFFERENT files — neither overwrites the other

#### Scenario: Omitting cadence is byte-identical to specPathFor's pre-ADR-0023 behavior

- **GIVEN** `specPathFor("idea-2026-W22-01", "2026-W22", "root", "news-carousel")` (no 5th argument)
- **WHEN** compared against `specPathFor("idea-2026-W22-01", "2026-W22", "root", "news-carousel",
  "weekly")` (explicit weekly)
- **THEN** the two calls return the identical string

#### Scenario: A daily cadence nests the Spec under its ISO week + weekday-DD-month leaf (issue #185)

- **GIVEN** `specPathFor("idea-01", "2026-08-12", "root", "news-carousel", "daily")`
- **WHEN** the path is computed
- **THEN** it returns `"root/2026-W33/wednesday-12-august/idea-01.news-carousel.spec.json"`

#### Scenario: A Brief naming real companies yields a Spec whose companies list matches exactly (issue #125)

- **GIVEN** a Brief whose `companies` field is `["OpenAI", "Anthropic"]`
- **WHEN** `generate(brief)` is called (the `character-explainer-with-cast` Recipe's deterministic author)
- **THEN** the resulting Spec's `companies` field deep-equals `["OpenAI", "Anthropic"]`

#### Scenario: A Brief naming no companies yields a Spec with no companies field — never fabricated

- **GIVEN** a Brief with no `companies` field at all
- **WHEN** `generate(brief)` is called
- **THEN** the resulting Spec has no `companies` field at all

### Requirement: News Carousel author-phase checklist gains a Baseline-Prompt-INDEPENDENT standalone subset, runnable before a Format's Baseline Prompt document is resolved

`src/production-spec/news-carousel-author-checklist.ts` SHALL expose
`auditNewsCarouselStandaloneAuthorPhase(candidateSpec, bannedWords): PhaseAuditResult` — the subset of
`auditNewsCarouselAuthorPhase`'s full checklist that needs NO `NewsCarouselBaselineParams` argument (no
Format-specific literal is read), so it can run BEFORE a Format's Baseline Prompt document has been
resolved (e.g. at Review/accept time). It SHALL include `spec-shape` (referencing
`validateNewsCarouselSpec`), `banned-words` (referencing `scanNewsCarouselForBannedWords`),
`no-dash-tells` (referencing `scanTextFieldsForDashes` over each slide's `stat_callout`/`text`), and
`companies-cited` (referencing the SAME per-slide company-citation check the full checklist uses) — each
REFERENCING the SAME underlying check the full checklist already uses, never re-implementing it — PLUS
two genuinely NEW, universally-computable items: `card-style-distinctness` (issue #273 round 1), `ok:
true` iff the 7 slides' `card_style` values include at least `min(2, slide count)` distinct values; and
`slide-text-variety` (issue #273 round 2, QA round 1's own finding), `ok: true` iff (a) at most 3 content
words (>= 4 chars, case-insensitive) are common to EVERY one of the 7 slides' own `text`, AND (b) no two
slides' `text` share a verbatim leading substring of 20+ characters — a Spec whose slides all repeat the
same headline/sentence (round 1's own fix still let this happen: every slide carried the Brief's bare
`title` verbatim, just re-punctuated) fails one or both of these; grounding each slide in genuinely
different material (a distinct Talking Point per slide) fails neither. The function SHALL never throw for
any input shape, and its overall `ok` SHALL be `false` whenever the referenced structural validator fails
OR any item's `ok` is `false`.

#### Scenario: A baseline-adherent Spec passes every item without a NewsCarouselBaselineParams argument

- **GIVEN** a well-formed, genuinely varied 7-slide News Carousel Spec (distinct `card_style`s, no dash
  tells, every named company cited in its own slide's `image_prompt`)
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `true` and every item's `ok` is `true`

#### Scenario: A Spec whose 7 slides all share ONE card_style fails ONLY the new card-style-distinctness item (issue #273's live reproduction)

- **GIVEN** an otherwise well-formed, banned-word-clean, dash-clean 7-slide Spec whose `card_style` is
  the exact same string on every one of the 7 slides
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `false`, the `card-style-distinctness` item's `ok` is `false`, and every
  OTHER item's `ok` is `true`

#### Scenario: The new floor is weaker than the Format-tuned placement-variety item — 2 distinct styles is enough here even when it is not enough for the full checklist

- **GIVEN** a 7-slide Spec using exactly 2 distinct `card_style` values (below a Format's own
  `minDistinctCardStyles` of 3, so it would fail `auditNewsCarouselAuthorPhase`'s `placement-variety`
  item under that Format's `NewsCarouselBaselineParams`)
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the `card-style-distinctness` item's `ok` is `true` and the result's `ok` is `true`

#### Scenario: A Spec whose 7 slides all repeat the SAME headline verbatim fails ONLY the new slide-text-variety item (issue #273 round 2's live reproduction)

- **GIVEN** an otherwise well-formed, banned-word-clean, dash-clean, card-style-varied 7-slide Spec whose
  `text` is the SAME headline sentence on every slide (differing only by a short role-label suffix — the
  EXACT pattern round 1's own fix still produced)
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `false`, the `slide-text-variety` item's `ok` is `false` (naming the
  shared content words and/or the shared leading substring), and every OTHER item's `ok` stays `true`

### Requirement: Deterministic Spec-author stand-ins ground their output in the Brief's own real story content, not just its bare title

`generateNewsCarouselSpec` (`news-carousel-generate.ts`) SHALL vary `card_style` across its 7 slides
(never one hardcoded value for every slide), SHALL never join a slide's on-card `text` with a spaced em
dash, en dash, or hyphen-as-dash, and SHALL, when `brief.companies` is non-empty, cite every named
company in every slide's own `image_prompt` (issue #273 round 1). **Issue #273 round 2 (QA round 1's own
finding — round 1 alone was insufficient):** the "hook" slide's `text` SHALL be the Brief's own `title`;
every OTHER slide's `text` SHALL be drawn from a DISTINCT entry of `brief.talkingPoints` (the Brief's own
real `## Talking Points` bullets, `src/idea/brief-content.ts`), prefixed with that slide's own role label
so two slides that legitimately reuse the SAME point (a real Brief commonly carries fewer than the 6
non-hook slots need) never end up verbatim-identical or sharing a long leading substring. Only when the
Brief carries NO `talkingPoints` at all SHALL this generator fall back to the OLD, title-grounded
template — a structurally valid Spec `slide-text-variety` (above) correctly rejects, rather than this
generator ever inventing content it was never given.

`generateNewsShortScriptSpec` (`news-short-script-generate.ts`) SHALL vary each beat's `source_url` host
across a small, fixed cycle of distinct hosts (never one colliding host for every beat) as a FALLBACK,
preferring a real, distinct-site URL from `brief.sourceUrls` first when available (issue #273 round 1 +
round 2). **Issue #273 round 2:** the "story" beat's spoken `text` SHALL draw its words from
`brief.talkingPoints` (concatenated in order) FIRST when the Brief has any, falling back to the fixed
`FILLER_WORDS` padding cycle only for whatever real content doesn't cover; "hook"/"cta" stay
title-grounded (their 20-word targets never need more real words than a real headline already supplies).

Both remain deterministic, hermetic templates (no model call, no I/O, no clock) — this Requirement fixes
mechanically-detectable degeneracy AND threads real, per-story Brief content through when it is available
(round 2); it is not a claim that either stand-in's output is real, grounded news content when the Brief
itself carries none.

#### Scenario: generateNewsCarouselSpec's output passes auditNewsCarouselStandaloneAuthorPhase when the Brief carries real Talking Points

- **GIVEN** a well-formed Brief carrying a `title` and 4+ distinct `talkingPoints`, and no banned words
- **WHEN** `generateNewsCarouselSpec(brief)`'s result is passed to
  `auditNewsCarouselStandaloneAuthorPhase(result, [])`
- **THEN** the result's `ok` is `true`

#### Scenario: generateNewsCarouselSpec's output FAILS auditNewsCarouselStandaloneAuthorPhase when the Brief carries no Talking Points at all (issue #273 round 2)

- **GIVEN** a Brief carrying only `id`/`run`/`title` (no `talkingPoints`)
- **WHEN** `generateNewsCarouselSpec(brief)`'s result is passed to
  `auditNewsCarouselStandaloneAuthorPhase(result, [])`
- **THEN** the result's `ok` is `false`, naming `slide-text-variety` — the generator degrades to the
  title-grounded fallback, which the checklist correctly rejects, rather than silently authoring filler

#### Scenario: generateNewsShortScriptSpec's output passes auditNewsShortScriptAuthorPhase when the Brief carries real Talking Points totaling enough real words

- **GIVEN** a well-formed Brief carrying a `title`, `talkingPoints` totaling comfortably more than the
  "story" beat's 90-word target, and no banned words
- **WHEN** `generateNewsShortScriptSpec(brief)`'s result is passed to
  `auditNewsShortScriptAuthorPhase(result, [])`
- **THEN** the result's `ok` is `true`

#### Scenario: generateNewsShortScriptSpec's output FAILS auditNewsShortScriptAuthorPhase when the Brief carries no Talking Points at all (issue #273 round 2)

- **GIVEN** a Brief carrying only `id`/`run`/`title` (no `talkingPoints`)
- **WHEN** `generateNewsShortScriptSpec(brief)`'s result is passed to
  `auditNewsShortScriptAuthorPhase(result, [])`
- **THEN** the result's `ok` is `false`, naming `no-repeated-phrases` — the "story" beat has nothing real
  to draw from besides the fixed filler cycle, repeated

### Requirement: A pure Brief-content parser extracts the real story material a Brief's markdown actually carries

`src/idea/brief-content.ts` SHALL expose `parseBriefContent(markdown: string): { angle?, talkingPoints,
sourceUrls }` — PURE (no I/O, no clock), parsing one Idea's Brief markdown content (the SAME string
`src/importer/load-brief.ts`'s `loadBrief` already reads off disk) into: `talkingPoints` (via the new,
exported `extractTalkingPoints` — every bullet under a `## Talking Points`/`## Talking points` heading,
trimmed, deduplicated, a wrapped continuation line folded into the previous bullet, `[]` when the Brief
has no such section), `angle` (via the new, exported `extractAngle` — the `## Angle` section's own
paragraph, whitespace-collapsed, `undefined` when absent or blank), and `sourceUrls` (REFERENCING —
never re-implementing — `src/importer/source-urls.ts`'s existing `extractSourceUrls`). A markdown Brief
missing any given section SHALL simply omit/empty that field — never fabricated, never guessed. This
module SHALL never throw for any string input.

#### Scenario: A realistic Brief yields all three fields

- **GIVEN** a Brief markdown carrying an `## Angle` paragraph, a `## Talking Points` section with 4
  bullets (one wrapping onto a second physical line), and a `## Source(s)` section with 2 URLs
- **WHEN** `parseBriefContent(markdown)` is called
- **THEN** it returns `angle` as the whitespace-collapsed paragraph, `talkingPoints` as the 4 bullets (the
  wrapped one folded into ONE logical point), and `sourceUrls` as the 2 URLs, in each section's own order

#### Scenario: A title-only Brief yields no angle and empty talkingPoints/sourceUrls — never fabricated

- **GIVEN** a Brief markdown carrying only a title heading, no other section
- **WHEN** `parseBriefContent(markdown)` is called
- **THEN** it returns `angle: undefined`, `talkingPoints: []`, and `sourceUrls: []`

