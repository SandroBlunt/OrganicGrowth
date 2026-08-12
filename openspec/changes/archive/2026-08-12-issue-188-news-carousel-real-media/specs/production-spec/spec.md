## MODIFIED Requirements

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
