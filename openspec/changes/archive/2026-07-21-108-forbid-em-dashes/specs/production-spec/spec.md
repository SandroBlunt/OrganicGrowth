## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: News Carousel author-phase checklist is graduated from the #77 prototype, runs as code, parameterized

The system SHALL provide `auditNewsCarouselAuthorPhase(candidateSpec, bannedWords, baseline)` in
`src/production-spec/news-carousel-author-checklist.ts`, where `baseline` is a
`NewsCarouselBaselineParams` (`{ logoReferenceName, pillText, neverAllCapsInstruction, fixedClauses,
confirmedCardStyles }`). It SHALL run the News Carousel Recipe's FULL author-phase checklist entirely
as CODE, returning a `PhaseAuditResult` (`src/recipe/phase-contract.ts`) with exactly 9 `items`, in
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
9. No em dash, en dash, or hyphen used as a sentence dash in any slide's `stat_callout`/`text` — a NEW
   check (issue #108), REJECT-only (never a silent swap), via `dash-safety.ts`'s
   `scanTextFieldsForDashes`. Deliberately does NOT scan `image_prompt`: the Baseline Prompt's own
   FIXED, verbatim-required clauses legitimately contain em dashes, and `image_prompt` is a media
   instruction fed to the image model, never itself reader-facing "Copy" (CONTEXT.md "Copy"). An
   ordinary hyphenated compound word (e.g. `state-of-the-art`) is NOT flagged — only a hyphen with
   whitespace on both sides counts as a "used as a dash" tell.

The overall `ok` SHALL be `true` iff `validateNewsCarouselSpec(candidateSpec).ok` is `true` AND no item
above is `ok: false` (the referenced structural validator is the authoritative gate for shape/count/
order/length). The function SHALL never throw, for any input shape.

#### Scenario: A baseline-adherent Spec passes every mechanical item; the agent-judged item is flagged, not failed

- **GIVEN** a well-formed 7-slide Spec whose every `image_prompt` carries `baseline.logoReferenceName`,
  `baseline.pillText`, `baseline.neverAllCapsInstruction`, and every clause in `baseline.fixedClauses`,
  whose `card_style`s are each one of `baseline.confirmedCardStyles`, and whose `stat_callout`/`text`
  fields carry no dash tell
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `9`, exactly one item is `kind:
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

#### Scenario: A slide's on-card text containing an em dash fails item 9, reject-only, isolated from every other item

- **GIVEN** a baseline-adherent Spec whose "cta" slide's `text` contains an em dash ("—")
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the result's `ok` is `false`, the `no-dash-tells` item's `ok` is `false` and its `detail`
  names the em dash and the specific `slides[N].text` field it was found in
- **AND** every OTHER mechanical item (e.g. the banned-word item) remains `ok: true`
- **AND** no rewritten/corrected Spec is ever returned alongside the result

#### Scenario: A slide's stat_callout/text using an ordinary hyphenated word is NOT flagged by item 9

- **GIVEN** a baseline-adherent Spec whose "hook" slide's `text` reads "This is a state-of-the-art
  task-assistant."
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], baseline)` is called
- **THEN** the `no-dash-tells` item's `ok` is `true` — an ordinary hyphenated compound word is never a
  false positive

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
authored Spec). Every slide's `stat_callout`/`text` SHALL itself be dash-tell-free (issue #108) — the
fixture is a genuinely on-contract example, not merely a structurally-valid one.

#### Scenario: The committed fixture passes the #81 structural validator

- **GIVEN** `strawMotionIdeaOneCarouselSpec()`
- **WHEN** `validateNewsCarouselSpec` is called with it
- **THEN** the result's `ok` is `true` and `errors` is empty

#### Scenario: The committed fixture passes the #85 author-phase checklist, parameterized with Straw Motion's real strings

- **GIVEN** `strawMotionIdeaOneCarouselSpec()` and `STRAW_MOTION_BASELINE`
- **WHEN** `auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE)` is called
- **THEN** the result's `ok` is `true`, `items.length` is `9`, exactly one item is `kind:
  "agent-judged"` with `ok: null`, and every `kind: "mechanical"` item is `ok: true` (including the
  `no-dash-tells` item, issue #108)

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
