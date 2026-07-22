## MODIFIED Requirements

### Requirement: News Carousel author-phase checklist is graduated from the #77 prototype, runs as code, parameterized

The system SHALL provide `auditNewsCarouselAuthorPhase(candidateSpec, bannedWords, baseline)` in
`src/production-spec/news-carousel-author-checklist.ts`, where `baseline` is a
`NewsCarouselBaselineParams` (`{ logoReferenceName, pillText, neverAllCapsInstruction,
logoReferencePhrase, logoNameGuardrailInstruction, fixedClauses, confirmedCardStyles }`). It SHALL run
the News Carousel Recipe's FULL author-phase checklist entirely as CODE, returning a
`PhaseAuditResult` (`src/recipe/phase-contract.ts`) whose `items` carry STABLE, unique `id`s (never
selected by array position — issue #105) with exactly 11 entries (without a supplied
`baselineDocumentText`; 12 with one), covering:

1. **`slide-count-role-order`** — exactly 7 slides, in fixed role order (`hook, then, shift, proof,
   different, next, cta`) — derived from `news-carousel-validate.ts`'s `validateNewsCarouselSpec`'s
   own result codes (`slides_count`, `slide_role_order`), never re-deriving the count/order rule.
2. **`text-length`** — each slide's on-card `text` at most 140 chars — derived from the SAME
   `validateNewsCarouselSpec` result's `slide_text_too_long` code.
3. **`logo-reference`** (REWORKED, issue #110) — each `image_prompt` references the connected logo —
   via `baseline.logoReferenceName` OR `baseline.logoReferencePhrase` (either is acceptable; the raw,
   underscored reference name is no longer required on its own) — AND carries
   `baseline.logoNameGuardrailInstruction` verbatim. Forcing the raw name into every prompt
   unconditionally was the ROOT CAUSE of epic #106 item 5's reproduction: the image model sometimes
   printed that odd, filename-like token as visible on-image text instead of using it as a bare
   reference identifier.
4. **`logo-name-not-as-text`** (NEW, issue #110) — the logo reference name never appears QUOTED
   anywhere in the `image_prompt` (this same document's own convention for literal on-image text, e.g.
   `"Unhypped News"`) — REJECT-ONLY, mirroring `no-dash-tells`/`banned-words`'s "report, never
   rewrite" contract. A reference name inside quotes is the specific, checkable anti-pattern of
   telling the model to DRAW that string rather than use it as a bare identifier.
5. **`pill-text-caps`** — each `image_prompt` contains `baseline.pillText` AND
   `baseline.neverAllCapsInstruction`.
6. **`fixed-clauses`** — each `image_prompt` keeps every clause in `baseline.fixedClauses` verbatim.
7. **`grounded-subject`** — real product/logo/action, or an intentional photographic scene; never an
   invented UI shown as a real product's own screen — `kind: "agent-judged"`, `ok: null`, never
   computed, never blocking the overall result.
8. **`card-style-stat-callout`** — `card_style` is one of `baseline.confirmedCardStyles`;
   `stat_callout` is non-empty.
9. **`companies-cited`** — every company named in a slide's `companies` field is cited, as a
   standalone token (never a bare substring), in that same slide's own `image_prompt` (a slide naming
   no real company skips the logo row entirely — issue #102 finding #1).
10. **`banned-words`** — no banned word in any field — derived from
    `news-carousel-brand-safety.ts`'s `scanNewsCarouselForBannedWords`'s own result, REJECT-only
    (never a silent swap, always-rule 9).
11. **`no-dash-tells`** — no em dash, en dash, or hyphen used as a sentence dash in any slide's
    `stat_callout`/`text` (issue #108), REJECT-only, via `dash-safety.ts`'s
    `scanTextFieldsForDashes`. Deliberately does NOT scan `image_prompt`. An ordinary hyphenated
    compound word (e.g. `state-of-the-art`) is NOT flagged.

When `baselineDocumentText` is supplied, a 12th item, **`baseline-doc-verified`**, additionally
verifies every hand-copied fact in `baseline` (including the two new #110 fields) is a genuine,
verbatim substring of that raw document text.

The overall `ok` SHALL be `true` iff `validateNewsCarouselSpec(candidateSpec).ok` is `true` AND no item
above is `ok: false` (the referenced structural validator is the authoritative gate for shape/count/
order/length). The function SHALL never throw, for any input shape.

#### Scenario: A baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed

- **GIVEN** a well-formed 7-slide Spec whose every `image_prompt` carries (`baseline.logoReferenceName`
  OR `baseline.logoReferencePhrase`), `baseline.logoNameGuardrailInstruction`, `baseline.pillText`,
  `baseline.neverAllCapsInstruction`, and every clause in `baseline.fixedClauses`, whose `card_style`s
  are each one of `baseline.confirmedCardStyles`, and whose `stat_callout`/`text` fields carry no dash
  tell and whose `image_prompt`s never quote the reference name
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `11`, exactly one item (`id:
  "grounded-subject"`) is `kind: "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item
  is `ok: true`

#### Scenario: A short Spec fails the slide-count-role-order item by referencing validateNewsCarouselSpec, not duplicating it

- **GIVEN** a Spec with only 6 slides
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and the item with `id: "slide-count-role-order"` has `ok: false`

#### Scenario: A prompt missing the raw reference name still passes logo-reference, as long as the generic phrase and the guardrail are present

- **GIVEN** a baseline-adherent Spec with `baseline.logoReferenceName` removed from every
  `image_prompt` (the generic `baseline.logoReferencePhrase` and
  `baseline.logoNameGuardrailInstruction` both remain)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's item with `id: "logo-reference"` has `ok: true` — the raw, underscored
  reference name is never required on its own (issue #110)

#### Scenario: A prompt carrying the raw reference name but missing the negative guardrail fails logo-reference

- **GIVEN** a baseline-adherent Spec with `baseline.logoNameGuardrailInstruction` removed from every
  `image_prompt` (the raw `baseline.logoReferenceName` remains)
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it and the SAME `baseline`
- **THEN** the result's `ok` is `false` and the item with `id: "logo-reference"` has `ok: false` —
  every OTHER mechanical item remains `ok: true`

#### Scenario: A prompt referencing the logo by neither the raw name nor the generic phrase fails logo-reference

- **GIVEN** a baseline-adherent Spec with BOTH `baseline.logoReferenceName` and
  `baseline.logoReferencePhrase` removed from every `image_prompt`
- **WHEN** `auditNewsCarouselAuthorPhase` is called with it
- **THEN** the result's `ok` is `false` and the item with `id: "logo-reference"` has `ok: false` — the
  item is never vacuously true

#### Scenario: A prompt rendering the reference name as quoted, literal on-image text fails the new logo-name-not-as-text item, isolated from every other item

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

### Requirement: The graduated Skill's target output is proven on-contract against a real (Brand x Format)

The system SHALL provide a committed fixture demonstrating that the `produce-news-carousel` Skill's
promised output — the map-#77 prototype's 7 on-contract carousel prompts for idea-01 — is genuinely
on-contract for a REAL Brand and Format, not only for the stand-in `TEST_BASELINE` issue #85 already
proved parameterization with. `src/production-spec/fixtures/news-carousel-straw-motion-specs.ts`
SHALL export `STRAW_MOTION_BASELINE` (a `NewsCarouselBaselineParams` built from Straw Motion's real,
committed `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`: its logo
reference name, its pill text, its never-all-caps instruction, its name-free logo reference phrase and
its negative-prompt logo guardrail instruction (both issue #110), five of its fixed clauses verbatim,
and its two confirmed card styles) and `strawMotionIdeaOneCarouselSpec()` (idea-01's 7-slide authored
Spec). Every slide's `stat_callout`/`text` SHALL itself be dash-tell-free (issue #108), and every
slide's `image_prompt` SHALL carry the negative guardrail instruction verbatim (issue #110) — the
fixture is a genuinely on-contract example, not merely a structurally-valid one.

#### Scenario: The committed fixture passes the #81 structural validator

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`
- **WHEN** `validateNewsCarouselSpec` is called with it
- **THEN** the result's `ok` is `true` and `errors` is empty

#### Scenario: The committed fixture passes the #85/#110 author-phase checklist, parameterized with Straw Motion's real strings

- **GIVEN** `strawMotionIdeaOneCarouselSpec()` and `STRAW_MOTION_BASELINE`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `11`, exactly one item (`id:
  "grounded-subject"`) is `kind: "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item
  is `ok: true` (including `no-dash-tells`, issue #108, and `logo-name-not-as-text`, issue #110)

#### Scenario: STRAW_MOTION_BASELINE's own strings are genuinely present in the real, committed document

- **GIVEN** the real Format loaded via `loadFormat("straw-motion", "unhypped-news")` and its
  Baseline Prompt for `"news-carousel"` loaded via `loadBaselinePrompt`
- **WHEN** the document's content is normalized (blockquote markers stripped, lines joined, repeated
  whitespace collapsed) and checked for substring containment
- **THEN** it contains `STRAW_MOTION_BASELINE.logoReferenceName`, `.pillText`,
  `.neverAllCapsInstruction`, `.logoReferencePhrase`, `.logoNameGuardrailInstruction` (both issue
  #110), and every entry of `.fixedClauses` — none of these strings are asserted by fiat; each is
  verified against the real document's own prose

#### Scenario: STRAW_MOTION_BASELINE is genuinely a different baseline than the stand-in TEST_BASELINE

- **GIVEN** `STRAW_MOTION_BASELINE` and issue #85's stand-in `TEST_BASELINE`
- **WHEN** their `logoReferenceName` and `pillText` fields are compared
- **THEN** they differ, proving this fixture is not the stand-in fixture renamed
