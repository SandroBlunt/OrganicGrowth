# copy-composition Specification

## Purpose
TBD - created by archiving change issue-58-per-recipe-spec-copy. Update Purpose after archive.
## Requirements
### Requirement: Copy is a structured, per-Recipe-shaped artifact composed outside the Space

The system SHALL define a `Copy` type (`{ caption, hashtags }`) and a `CopyShape` type (`{ maxChars,
minEmojis, maxEmojis }`) in `src/copy/contract.ts`. Copy SHALL NOT be part of the Production Spec or any
Magnific Space input — it is composed as a SEPARATE, out-of-Space step. `CopyShape`'s bounds SHALL be
supplied by the CALLER (the chosen Recipe's own `copyShape`, `src/recipe/registry.ts`), never a shared
global constant, so a different Recipe can declare different bounds.

#### Scenario: Copy has no watermark/handle field

- **GIVEN** a composed `Copy` value
- **WHEN** its fields are inspected
- **THEN** it carries only `caption` and `hashtags` — no `watermark`/`handle` field of any kind (the
  watermark stays a Space parameter, never copy)

### Requirement: Drafting is an injectable seam, exercised against a fake — never a live model

The system SHALL define an injectable `CopyDrafter` type (`(input, shape) => Copy`, `src/copy/draft.ts`)
and a deterministic default implementation, `defaultDraftCopy`, that makes no model call, no I/O, and no
clock read. `defaultDraftCopy` SHALL always produce a `Copy` that passes `validateCopy` (above) for the
SAME `CopyShape` it was drafted for, and SHALL respect an ARBITRARY `CopyShape` — not a value hard-coded
to 180 characters / 1-3 emoji. When `input.mediaContext` (free text naming what was actually produced —
e.g. a picked Character's name) is supplied, the draft SHALL be able to reference it in the caption,
proving Copy composes LATE, after the media exists; the draft SHALL join `input.title` and
`input.mediaContext` as SEPARATE SHORT SENTENCES (a period, never an em dash or other dash "tell" —
issue #108), so its own output always satisfies the dash-free rule above. Tests SHALL exercise drafting
against a deterministic FAKE drafter standing in for the producer's LLM job — never a live model call.

#### Scenario: The default drafter always satisfies its own shape

- **GIVEN** any `CopyInput` and any `CopyShape`
- **WHEN** `defaultDraftCopy(input, shape)` is called
- **THEN** the returned `Copy`'s caption is at most `shape.maxChars` characters and its emoji count is
  within `[shape.minEmojis, shape.maxEmojis]`

#### Scenario: The default drafter respects a shape different from the wired Recipe's 180/1-3

- **GIVEN** a `CopyShape` with different bounds than the wired *Character Explainer with Cast* Recipe's
  own `{ maxChars: 180, minEmojis: 1, maxEmojis: 3 }`
- **WHEN** `defaultDraftCopy` is called with that shape
- **THEN** the returned Copy conforms to THAT shape, proving the bounds are not hard-coded

#### Scenario: A fake drafter stands in for the producer's LLM job in tests

- **GIVEN** a deterministic fake `CopyDrafter` injected into `composeCopy`
- **WHEN** the Copy step is exercised in a test
- **THEN** no live model is called — the fake's fixed output drives the rest of the pipeline
  (inject/validate) deterministically

#### Scenario: The default drafter never joins title/mediaContext with a dash tell

- **GIVEN** a `CopyInput` with both `title` and `mediaContext` set
- **WHEN** `defaultDraftCopy(input, shape)` is called
- **THEN** the returned Copy's caption, scanned by `scanTextFieldsForDashes`, reports `ok: true` — no
  em dash, en dash, or spaced hyphen anywhere in the joined caption

### Requirement: A pure, hermetic, per-Recipe copy validator checks length, emoji, required parts, and banned words

The system SHALL provide `validateCopy(copy, shape, rules)` (`src/copy/validate.ts`) — pure,
deterministic, no I/O, no clock, no Space, no network — that rejects, each with an identifiable reason:
a missing/blank `caption`; a caption exceeding `shape.maxChars` characters; a caption whose emoji count
falls outside `[shape.minEmojis, shape.maxEmojis]`; a non-array `hashtags`; a caption missing
`rules.requiredCta` when one is configured; a `hashtags` list missing any of `rules.requiredHashtags`
(matched `#`-agnostically and case-insensitively); any of `rules.bannedWords` found in the caption or
any hashtag (case-insensitive, whole-word); and an em dash, en dash, or hyphen used as a sentence dash
found in the caption or any hashtag (issue #108). The banned-word check SHALL be REJECT-ONLY — it SHALL
NEVER rewrite or strip the offending text; a hit only ever fails validation. The dash check SHALL
likewise be REJECT-ONLY, sharing this SAME contract exactly: it SHALL NEVER rewrite the offending text,
via `src/production-spec/dash-safety.ts`'s `scanTextFieldsForDashes` run against the SAME `fields`
array the banned-word scan already builds (`caption` plus each `hashtags[i]`). An ordinary hyphenated
compound word (e.g. `state-of-the-art`) SHALL NOT be flagged.

#### Scenario: A well-formed Copy is accepted

- **GIVEN** a Copy whose caption is within its shape's length/emoji bounds, whose hashtags include every
  required hashtag, whose caption includes the required CTA, and which contains no banned word or dash
  tell
- **WHEN** `validateCopy(copy, shape, rules)` is called
- **THEN** it reports `ok: true` with no errors

#### Scenario: The 180-char / 1-3-emoji bounds are the wired Recipe's own params, not a global

- **GIVEN** the wired *Character Explainer with Cast* Recipe's own `copyShape` (`{ maxChars: 180,
  minEmojis: 1, maxEmojis: 3 }`, read from `src/recipe/registry.ts`) and, separately, a DIFFERENT
  `CopyShape`
- **WHEN** the SAME caption is validated against each shape
- **THEN** the result differs according to EACH shape's own bounds — proving the validator is genuinely
  parameterized per Recipe, not hard-coded to 180/1-3

#### Scenario: A missing required CTA or required hashtag is rejected

- **GIVEN** Brand rules with a configured `requiredCta` and/or `requiredHashtags`, and a Copy whose
  caption omits the CTA or whose hashtags omit a required entry
- **WHEN** `validateCopy` is called
- **THEN** it reports `ok: false` with an error identifying the missing required CTA and/or hashtag

#### Scenario: A banned word in the caption or a hashtag is rejected, never rewritten

- **GIVEN** Brand rules with a configured banned word present in the Copy's caption (and, separately, in
  one of its hashtags)
- **WHEN** `validateCopy` is called
- **THEN** it reports `ok: false` with an error naming the banned word and where it was found
- **AND** the function's result never carries a "corrected" Copy — it only ever reports the failure

#### Scenario: An em dash, en dash, or spaced hyphen in the caption or a hashtag is rejected, never rewritten

- **GIVEN** a Copy whose caption contains an em dash (and, separately, a Copy whose caption contains an
  en dash, and a Copy whose caption contains a hyphen surrounded by whitespace on both sides), and
  separately a Copy whose hashtag contains a dash tell
- **WHEN** `validateCopy` is called with each
- **THEN** it reports `ok: false` with a `dash_in_copy` error naming the exact tell and the field
  (`caption` or `hashtags[i]`) it was found in
- **AND** the function's result never carries a "corrected" Copy — it only ever reports the failure

#### Scenario: An ordinary hyphenated compound word in the caption is NOT rejected

- **GIVEN** a Copy whose caption reads "This is a state-of-the-art task-assistant" (with no other
  violation)
- **WHEN** `validateCopy` is called
- **THEN** it does NOT report a `dash_in_copy` error — neither hyphen has whitespace touching it

### Requirement: required_cta/required_hashtags are injected deterministically, appending if absent and deduping if present

The system SHALL provide `injectRequiredCta`/`injectRequiredHashtags`/`injectRequiredParts`
(`src/copy/inject.ts`) — pure, deterministic functions that bring the Brand Profile's `required_cta` and
`required_hashtags` rules LIVE. `injectRequiredCta` SHALL append the required CTA to the caption when it
is absent, and SHALL leave the caption UNCHANGED (never appended twice) when the CTA is already present
(case-insensitive substring match); a `null`/blank required CTA is a no-op. `injectRequiredHashtags`
SHALL append each missing required hashtag (normalized to carry a leading `#`) in configured order, and
SHALL leave an already-present required hashtag UNCHANGED in the list (matched `#`-agnostically and
case-insensitively) — never duplicated. `production-spec/brand-profile.ts` SHALL load these two rules
from the Brand Profile YAML (`requiredCtaFrom`, `requiredHashtagsFrom`, bundled with `banned_words` via
`loadCopyRules`), mirroring the existing defensive `bannedWordsFrom`/`loadBannedWords`.

#### Scenario: A missing required CTA is appended

- **GIVEN** a caption that does not contain the Brand's configured `required_cta`
- **WHEN** `injectRequiredCta` is applied
- **THEN** the required CTA is appended to the caption

#### Scenario: An already-present required CTA is not duplicated

- **GIVEN** a caption that already contains the Brand's configured `required_cta` (case-insensitively)
- **WHEN** `injectRequiredCta` is applied
- **THEN** the caption is returned unchanged

#### Scenario: A missing required hashtag is appended; an already-present one is not duplicated

- **GIVEN** a hashtag list missing one of the Brand's `required_hashtags` and already containing another
  (with or without its own leading `#`, in any case)
- **WHEN** `injectRequiredHashtags` is applied
- **THEN** the missing required hashtag is appended (with a leading `#`)
- **AND** the already-present required hashtag is NOT duplicated

#### Scenario: required_cta/required_hashtags load from the Brand Profile, defensively

- **GIVEN** a Brand Profile YAML with `required_cta: "Link in bio!"` and `required_hashtags:
  ["#lifehacks"]`, and separately a missing Brand Profile file
- **WHEN** `loadCopyRules(path)` is called for each
- **THEN** the first reads both rules verbatim; the second degrades to `requiredCta: null,
  requiredHashtags: []` rather than crashing

### Requirement: composeCopy wires drafting, injection, and validation into one gated step

The system SHALL provide `composeCopy(input, shape, options)` (`src/copy/compose.ts`) that drafts a Copy
(the injected `CopyDrafter`, defaulting to `defaultDraftCopy`), deterministically injects the Brand's
required CTA/hashtags (`injectRequiredParts`), then validates the result (`validateCopy`) against `shape`
and the Brand's rules (loaded via `loadCopyRules`). It SHALL return the composed Copy ONLY when
validation passes; on failure it SHALL return the specific validation errors and no Copy — mirroring
`production-spec/compose.ts`'s "nothing except a valid, brand-safe artifact is ever produced" gate.

#### Scenario: A fake-drafted Copy missing required parts is composed successfully once injected

- **GIVEN** a fake drafter whose output omits the Brand's required CTA/hashtags
- **WHEN** `composeCopy` runs against a Brand Profile configuring both
- **THEN** it returns `ok: true` with a Copy carrying the injected CTA and hashtags

#### Scenario: A fake-drafted Copy containing a banned word is refused, never returned

- **GIVEN** a fake drafter whose output contains one of the Brand's banned words
- **WHEN** `composeCopy` runs
- **THEN** it returns `ok: false` with an error identifying the banned word
- **AND** no Copy is returned

### Requirement: CopyInput carries an optional slideNarrative — the ACTUAL produced on-slide beats, once the media exists

`src/copy/draft.ts`'s `CopyInput` SHALL gain an optional field, `slideNarrative`, an array of
`CopySlideBeat` (`{ role: string, text: string, statCallout?: string, companies?: readonly string[] }`)
— the produced Production Spec's OWN per-slide `role`/`text`/`stat_callout`/`companies` values,
available only once a multi-slide Recipe's media has been authored. `companies` mirrors
`production-spec/news-carousel-contract.ts`'s `CarouselSlide.companies` — the real companies/products
named on that slide, or an empty array when the slide names none (issue #120: threading the Spec's own,
already-verified companies list one step further downstream, so a drafter can name what the post is
actually about instead of re-guessing from the brief). This field, and `companies` specifically, SHALL
be optional and additive: every existing `CopyInput`/`CopySlideBeat` caller that omits either SHALL
remain valid, and `defaultDraftCopy`'s behavior SHALL be completely unaffected by their presence or
absence.

#### Scenario: CopyInput without slideNarrative remains valid (backward compatible)

- **GIVEN** a `CopyInput` value with no `slideNarrative` field at all (every pre-existing caller's
  shape)
- **WHEN** it is passed to `defaultDraftCopy` or `composeCopy`
- **THEN** it behaves exactly as it did before this change — no error, no behavior change

#### Scenario: A CopySlideBeat's companies field is optional and purely additive

- **GIVEN** a `CopySlideBeat` with no `companies` field at all (every pre-#120 caller's shape), and
  separately the SAME beat with `companies` set (non-empty on one beat, `[]` on another)
- **WHEN** either is passed to `skillDraftCopy` or `composeCopy`
- **THEN** the call succeeds either way; the mere presence of `companies` never changes the
  deterministic drafter's own output (`skillDraftCopy`'s caption is byte-identical with vs. without the
  field on an otherwise-identical `slideNarrative`) — naming companies naturally in the caption's own
  wording is the `write-social-copy` Skill's own LLM judgment call, never a fixed template a
  deterministic drafter could be tested against

#### Scenario: A Spec whose slides all have empty companies arrays produces the same caption behavior as before this change

- **GIVEN** a News Carousel Spec whose every slide's `companies` is `[]`
- **WHEN** `newsCarouselSlideNarrative(spec)` builds its `CopyInput.slideNarrative` and it is drafted
  via `skillDraftCopy`
- **THEN** the resulting caption is byte-identical to drafting the SAME narrative with `companies`
  omitted from every beat entirely (the pre-#120 shape) — an all-empty-companies Spec never fabricates
  a mention, and changes nothing about drafting behavior

### Requirement: skillDraftCopy sharpens the produced on-slide narrative into the caption, standing in for the write-social-copy Skill

`src/copy/draft.ts` SHALL export `skillDraftCopy`, a SECOND `CopyDrafter` implementation (same
`(input, shape) => Copy` signature) standing in, deterministically, for what an LLM following the
`write-social-copy` Skill's instructions produces — mirroring exactly how `defaultDraftCopy` already
stands in for the pre-existing, unguided copy-phase prose. Like `defaultDraftCopy`, it SHALL make no
model call, no I/O, and no clock read, and SHALL always produce a `Copy` that passes `validateCopy` for
the SAME `CopyShape` it was drafted for, respecting an ARBITRARY shape. When `input.slideNarrative` is
supplied and non-empty, it SHALL weave the beats named `"hook"`, `"shift"`, and `"cta"` (when present)
into the caption's body — proving the caption is sharpened from the ACTUAL produced narrative, not
re-derived from the brief alone. When `slideNarrative` is absent or empty, it SHALL fall back to
`input.title`/`input.angle`/`input.mediaContext` (a richer fallback than `defaultDraftCopy`'s
title-only base, since a single-media Recipe has no slide narrative to draw on). It SHALL join every
part as separate sentences — never an em dash, en dash, or hyphen used as a sentence dash (issue #108),
mirroring `defaultDraftCopy`'s own existing dash-free join. `composeCopy`'s signature and
`defaultDraftCopy`'s behavior SHALL be unchanged by this addition — `skillDraftCopy` is purely
additive, selected by callers via the pre-existing `options.drafter` seam.

#### Scenario: skillDraftCopy always satisfies validateCopy for the shape it was drafted for

- **GIVEN** any `CopyInput` (with or without `slideNarrative`) and any `CopyShape`
- **WHEN** `skillDraftCopy(input, shape)` is called
- **THEN** the returned `Copy`'s caption is at most `shape.maxChars` characters and its emoji count is
  within `[shape.minEmojis, shape.maxEmojis]`

#### Scenario: skillDraftCopy sharpens the produced on-slide narrative into the caption

- **GIVEN** a `CopyInput` whose `slideNarrative` includes a `"hook"` beat and a `"cta"` beat, each with
  distinctive `text`
- **WHEN** `skillDraftCopy(input, shape)` is called with a `shape` wide enough to hold them
- **THEN** the returned caption contains both beats' own `text` — proving it drew on the ACTUAL
  produced narrative, not just `input.title`

#### Scenario: skillDraftCopy falls back cleanly when no slideNarrative is supplied (a single-media Recipe)

- **GIVEN** a `CopyInput` with `title`/`angle`/`mediaContext` set and no `slideNarrative`
- **WHEN** `skillDraftCopy(input, shape)` is called
- **THEN** it returns a valid `Copy` (passing `validateCopy` for `shape`) composed from
  `title`/`angle`/`mediaContext` — never throwing or requiring `slideNarrative`

#### Scenario: skillDraftCopy never joins its parts with a dash "tell"

- **GIVEN** a `CopyInput` with `title`, `angle`, `mediaContext`, and a `slideNarrative` all set (no
  input part itself containing a dash)
- **WHEN** `skillDraftCopy(input, shape)` is called
- **THEN** the returned Copy's caption, scanned by `scanTextFieldsForDashes`, reports `ok: true`

#### Scenario: skillDraftCopy is a drop-in CopyDrafter — composeCopy needs no change to use it

- **GIVEN** `skillDraftCopy` passed as `options.drafter` to `composeCopy`
- **WHEN** `composeCopy` runs against a Brand Profile configuring required CTA/hashtags and banned
  words, using EITHER wired Recipe's own `copyShape`
- **THEN** it returns `ok: true` with a Copy carrying the injected CTA/hashtags, for both Recipes' shapes

#### Scenario: A banned word in skillDraftCopy's output is still rejected — the checker is never bypassed

- **GIVEN** a `CopyInput` whose `slideNarrative`/`title` contains one of the Brand's configured banned
  words
- **WHEN** `composeCopy` runs with `drafter: skillDraftCopy`
- **THEN** it returns `ok: false` with an error identifying the banned word — proving `validateCopy`
  gates `skillDraftCopy`'s output exactly as it gates `defaultDraftCopy`'s

### Requirement: newsCarouselSlideNarrative threads a saved News Carousel Spec into CopyInput.slideNarrative, companies unchanged including empty arrays

The system SHALL provide `newsCarouselSlideNarrative(spec)`
(`src/copy/news-carousel-slide-narrative.ts`), a pure, deterministic function (no I/O, no model call, no
clock, never mutates its input) that maps a `NewsCarouselSpec`'s
(`production-spec/news-carousel-contract.ts`) `slides` array, in their existing order, into
`CopySlideBeat[]`: each slide's `role` and `text` carried through verbatim, `stat_callout` renamed to
`statCallout`, and `companies` passed through UNCHANGED — including an empty array, never invented,
never dropped. This is the ONE place a News Carousel Recipe's saved Spec becomes the Copy step's
`CopyInput.slideNarrative`. The *Character Explainer with Cast* Recipe has no equivalent function — it
declares no per-clip `companies` concept, and none is added for it by this change.

#### Scenario: All 7 slides map through, in order, with every field carried through exactly

- **GIVEN** a well-formed 7-slide `NewsCarouselSpec`
- **WHEN** `newsCarouselSlideNarrative(spec)` is called
- **THEN** it returns 7 `CopySlideBeat`s in the SAME order, each one's `role`/`text`/`statCallout`/
  `companies` exactly equal to its source slide's `role`/`text`/`stat_callout`/`companies`

#### Scenario: A slide's empty companies array is carried through as [], never omitted

- **GIVEN** a `NewsCarouselSpec` slide whose `companies` is `[]` (names no real company)
- **WHEN** `newsCarouselSlideNarrative(spec)` is called
- **THEN** the corresponding `CopySlideBeat.companies` is present and equal to `[]` — not `undefined`,
  not omitted from the object, and no company name is fabricated for it

#### Scenario: The function never mutates its input Spec and is deterministic

- **GIVEN** a `NewsCarouselSpec` value
- **WHEN** `newsCarouselSlideNarrative(spec)` is called once, and again with the same `spec`
- **THEN** the input `spec` is unchanged after the call, and both calls return deep-equal results

### Requirement: CopyInput carries an optional companies field — the WHOLE-Asset real companies/products, once the media exists

`src/copy/draft.ts`'s `CopyInput` SHALL gain an optional, Recipe-agnostic field, `companies?: readonly
string[]` — the real companies/products the whole Asset concerns, once the media exists. This is the
WHOLE-Asset-grain sibling of `CopySlideBeat.companies`'s per-slide/per-beat grain (issue #120): for a
single-media Recipe with no per-clip/per-beat narrative to attach a company list to (e.g. the Character
Explainer with Cast Recipe, whose 3 clips render one continuous narrative about the SAME picked
Character), the saved Production Spec's own `companies` field is threaded onto `CopyInput.companies`
directly, not onto a `slideNarrative` beat (issue #125). This field SHALL be optional and additive:
every existing `CopyInput` caller that omits it SHALL remain valid, and neither `defaultDraftCopy` nor
`skillDraftCopy`'s deterministic output SHALL be affected by its presence, emptiness, or absence.

#### Scenario: CopyInput without companies remains valid (backward compatible)

- **GIVEN** a `CopyInput` value with no `companies` field at all (every pre-#125 caller's shape)
- **WHEN** it is passed to `defaultDraftCopy`, `skillDraftCopy`, or `composeCopy`
- **THEN** it behaves exactly as it did before this change — no error, no behavior change

#### Scenario: CopyInput.companies is optional and purely additive, at every state

- **GIVEN** a `CopyInput` with no `companies` field, and separately the SAME input with `companies` set
  to a non-empty list, and separately again to an explicit empty list
- **WHEN** each is passed to `defaultDraftCopy` or `skillDraftCopy`
- **THEN** every call succeeds; the three variants produce BYTE-IDENTICAL `Copy` output — the mere
  presence, emptiness, or absence of `companies` never changes either deterministic drafter's own
  output — naming companies naturally in the caption's own wording is the `write-social-copy` Skill's
  own LLM judgment call, never a fixed template a deterministic drafter could be tested against

#### Scenario: An absent-companies Spec produces the same caption behavior as before this change

- **GIVEN** a Character Explainer Spec with no `companies` field, wired through
  `characterExplainerCompanies` into `CopyInput.companies` (normalizing to `[]`)
- **WHEN** the resulting `CopyInput` is drafted via `skillDraftCopy`
- **THEN** the resulting caption is byte-identical to drafting the SAME input with `companies` omitted
  from `CopyInput` entirely (the pre-#125 shape) — an absent-companies Spec never fabricates a mention,
  and changes nothing about drafting behavior

### Requirement: characterExplainerCompanies threads a saved Character Explainer Spec into CopyInput.companies, unchanged including an absent field

The system SHALL provide `characterExplainerCompanies(spec)`
(`src/copy/character-explainer-companies.ts`), a pure, deterministic function (no I/O, no model call, no
clock, never mutates its input) that reads a `ProductionSpec`'s
(`production-spec/contract.ts`) own top-level `companies` field and returns it UNCHANGED as `readonly
string[]`, normalized to `[]` when the Spec's own `companies` is absent (never fabricated; an absent
Spec field and an explicit empty Spec field both read the same "nothing to draw on" way at the Copy-step
boundary). This is the ONE place a Character Explainer Recipe's saved Spec becomes the Copy step's
`CopyInput.companies`. The News Carousel Recipe has no equivalent use for this function — its own
`companies` concept is per-slide, threaded instead by `newsCarouselSlideNarrative` into
`CopySlideBeat.companies`.

#### Scenario: A non-empty companies list is carried through unchanged

- **GIVEN** a `ProductionSpec` whose `companies` is `["OpenAI", "Anthropic"]`
- **WHEN** `characterExplainerCompanies(spec)` is called
- **THEN** it returns `["OpenAI", "Anthropic"]` exactly

#### Scenario: An explicit empty companies list is carried through as []

- **GIVEN** a `ProductionSpec` whose `companies` is `[]`
- **WHEN** `characterExplainerCompanies(spec)` is called
- **THEN** it returns `[]` — present, not fabricated

#### Scenario: An absent companies field normalizes to [] — never fabricated, never throws

- **GIVEN** a `ProductionSpec` with no `companies` field at all
- **WHEN** `characterExplainerCompanies(spec)` is called
- **THEN** it returns `[]` without throwing — no company name is invented for it

#### Scenario: The function never mutates its input Spec and is deterministic

- **GIVEN** a `ProductionSpec` value
- **WHEN** `characterExplainerCompanies(spec)` is called once, and again with the same `spec`
- **THEN** the input `spec` is unchanged after the call, and both calls return deep-equal results

### Requirement: A documented, per-platform CopyShape table extends the single per-Recipe CopyShape

The system SHALL provide a brand-agnostic, in-repo table of `PlatformCopyShape` bounds
(`src/copy/platform-shape.ts`) for the platforms named in issue #128 — `facebook`, `instagram`,
`linkedin`, `x`, `tiktok`, `youtube` — each declaring the base `CopyShape` fields (`maxChars`,
`minEmojis`, `maxEmojis`), a human-readable `description` citing the documented, standard platform
convention its bounds are based on, and `supportsMentions` (whether that platform's caption text uses a
typed inline `@Handle` mention, checked by `validateCopyForPlatform` below). `platformCopyShapeFor
(platform)` SHALL look this table up case- and whitespace-insensitively and SHALL return `null` — never
a fabricated bound — for a platform this table does not document (rule 8: never fabricate).
`resolveCopyShapeForPlatform(baseShape, platform)` SHALL "extend" a Recipe's own single `CopyShape`
(its `copyShape`, `src/recipe/registry.ts`) into a per-platform-aware one: it SHALL return the
platform's documented bounds when `platformCopyShapeFor` resolves one, and SHALL fall back to the
caller's own `baseShape`, UNCHANGED, for a platform this table does not document. Both functions SHALL
be pure — no I/O, no clock, never throw.

#### Scenario: Each of the six documented platforms resolves to its own, genuinely different bounds

- **GIVEN** the six platforms this table documents
- **WHEN** `platformCopyShapeFor(platform)` is called for each
- **THEN** each resolves to a non-null `PlatformCopyShape` naming that platform, with a positive
  `maxChars` and a non-empty `description`
- **AND** X's `maxChars` is materially smaller than LinkedIn's `maxChars` — proving the bounds are
  genuinely platform-specific, not one shared number

#### Scenario: An undocumented platform never fabricates bounds

- **GIVEN** a platform string this table does not document (e.g. `"mastodon"`), and separately a blank
  string
- **WHEN** `platformCopyShapeFor(platform)` is called
- **THEN** it returns `null` for each — no bound is invented

#### Scenario: resolveCopyShapeForPlatform extends a Recipe's own CopyShape, falling back when unknown

- **GIVEN** a Recipe's own base `CopyShape` (e.g. `{ maxChars: 180, minEmojis: 1, maxEmojis: 3 }`) and,
  separately, a known platform (`"x"`) and an undocumented one (`"mastodon"`)
- **WHEN** `resolveCopyShapeForPlatform(baseShape, platform)` is called for each
- **THEN** for the known platform it returns THAT platform's own documented bounds (different from
  `baseShape`)
- **AND** for the undocumented platform it returns `baseShape`, unchanged

### Requirement: validateCopy is unchanged; validateCopyForPlatform is a new, additive entry point

`validateCopy(copy, shape, rules)` (`src/copy/validate.ts`) SHALL remain byte-for-byte unchanged in
signature and behavior by this capability — every existing caller (`compose.ts`, `recipe/phase-
contract.ts`'s `auditCopyPhase`, both wired Recipes' own copy step) SHALL continue to call it with a
single `CopyShape` exactly as before, so the single-Channel production path is unaffected (issue #128
AC3). The system SHALL additionally provide `validateCopyForPlatform(copy, platform, baseShape, rules)`
— a NEW, additive function that resolves `platform`'s `CopyShape` via `resolveCopyShapeForPlatform`,
runs the SAME core checks `validateCopy` runs (length, emoji count, required CTA, required hashtags,
banned words, dash tells) against the resolved shape, and, ONLY when the resolved platform's own
`PlatformCopyShape` sets `supportsMentions: true` (today: `linkedin` alone), additionally scans the
caption for a malformed inline `@mention` via `scanAtHandleMentionSyntax`, appending a
`platform_mention_syntax` error for each violation found. `CopyValidationCode` SHALL gain this new
member, additively (a union widening — no exhaustive switch over it exists anywhere in the repo).

#### Scenario: The same caption validates differently against two different platforms' bounds

- **GIVEN** a caption between 280 and 3,000 characters long (too long for X, well within LinkedIn's
  cap), and a Recipe's own base `CopyShape`
- **WHEN** `validateCopyForPlatform(copy, "x", baseShape, rules)` and `validateCopyForPlatform(copy,
  "linkedin", baseShape, rules)` are both called
- **THEN** the `"x"` call reports `ok: false` with a `caption_length` error
- **AND** the `"linkedin"` call reports `ok: true`

#### Scenario: LinkedIn's inline @mention syntax check fires only for LinkedIn

- **GIVEN** a caption containing a malformed `@mention` (a dangling `@` immediately followed by
  whitespace)
- **WHEN** `validateCopyForPlatform` is called once with `platform: "linkedin"` and once with
  `platform: "x"`, both against the SAME text
- **THEN** the `"linkedin"` call reports a `platform_mention_syntax` error
- **AND** the `"x"` call does NOT report `platform_mention_syntax` — X's `PlatformCopyShape` does not
  set `supportsMentions`, so the check never runs there

#### Scenario: A well-formed @mention on LinkedIn passes the syntax check

- **GIVEN** a caption containing a well-formed inline mention (`@` immediately followed by a plausible
  handle, e.g. `"@Anthropic"`)
- **WHEN** `validateCopyForPlatform(copy, "linkedin", baseShape, rules)` is called
- **THEN** it does NOT report `platform_mention_syntax`

#### Scenario: The existing single-Channel wired-Recipe path is unchanged

- **GIVEN** a Brand configured with exactly ONE Channel (Facebook, `primary: true`) and the wired
  *Character Explainer with Cast* Recipe's own `copyShape` (`{ maxChars: 180, minEmojis: 1, maxEmojis:
  3 }`)
- **WHEN** a Copy is validated the way `compose.ts` already does — `validateCopy(copy, recipe.copyShape,
  rules)`, with no platform argument at all
- **THEN** the result is identical to the pre-#128 behavior: the 180-char bound is enforced exactly as
  before, and `platform-shape.ts`'s own (different) `facebook` table entry is never consulted

### Requirement: Copy carries an optional per-platform variants field, additive to the single caption/hashtags shape

The system SHALL extend `Copy` (`src/copy/contract.ts`) with an OPTIONAL `variants?: readonly
CopyVariant[]` field, where `CopyVariant` is `{ platform: string, caption: string, hashtags: readonly
string[], unresolvedMentions?: readonly string[] }`. `Copy.caption`/`Copy.hashtags` SHALL remain
required and, when `variants` is present, SHALL mirror the PRIMARY Channel's own variant — so every
existing single-variant consumer (`validateCopy`, the output bundle, `/log-post`'s surfaced Copy) keeps
working unmodified on the top-level fields alone. A Copy composed for a Brand with exactly one Channel
SHALL carry NO `variants` field at all — the exact shape `Copy` had before this capability.
`CopyVariant.unresolvedMentions` (issue #130) SHALL be present ONLY when non-empty — the plain
company/product names issue #126's LinkedIn Handle Lookup had no committed handle for, on a variant
composed for a platform whose `PlatformCopyShape` sets `supportsMentions: true` (today: `linkedin`
alone); every other variant SHALL never carry this field at all.

#### Scenario: A single-Channel Copy has no variants field

- **GIVEN** a Brand configured for exactly one Channel
- **WHEN** its Copy is composed
- **THEN** the resulting `Copy` has only `caption` and `hashtags` — no `variants` key at all

#### Scenario: A multi-Channel Copy's top-level fields mirror the primary variant

- **GIVEN** a Brand configured for more than one Channel, one marked `primary`
- **WHEN** its Copy is composed
- **THEN** `copy.caption`/`copy.hashtags` equal the PRIMARY Channel's own entry in `copy.variants`

#### Scenario: A variant with every mention resolved carries no unresolvedMentions field

- **GIVEN** a LinkedIn variant whose every Spec-recorded company/product resolves to a committed handle
- **WHEN** its `CopyVariant` is inspected
- **THEN** it carries no `unresolvedMentions` key at all — never an empty array either

#### Scenario: A non-LinkedIn variant never carries unresolvedMentions, even with the same companies data

- **GIVEN** the SAME `CopyInput` companies data composed for both a LinkedIn and a non-LinkedIn targeted
  platform, with at least one company unresolved
- **WHEN** both variants are inspected
- **THEN** the LinkedIn variant carries `unresolvedMentions` naming the unresolved company; the
  non-LinkedIn variant carries no `unresolvedMentions` field at all

### Requirement: composeCopyForChannels composes one variant per targeted Channel platform, from the same underlying material

The system SHALL provide `composeCopyForChannels(input, baseShape, channels, options)`
(`src/copy/compose.ts`), composing ONE `CopyVariant` per entry in `channels` (the Brand's FULL Channel
list — `src/production-spec/brand-profile.ts`'s `channelsFrom`/`loadChannels`, every entry's `platform`,
not just the primary), from the SAME `CopyInput` material for every platform. The PRIMARY Channel's
variant SHALL be drafted and validated against `baseShape` (the chosen Recipe's own `copyShape`) via the
SAME `validateCopy` check `composeCopy` already uses — NEVER `platform-shape.ts`'s own per-platform
bounds table, even when other Channels are also targeted. Every OTHER (non-primary) targeted Channel's
variant SHALL be drafted and validated against its own documented bounds via
`resolveCopyShapeForPlatform`/`validateCopyForPlatform` (issue #128), falling back to `baseShape` for a
platform `platform-shape.ts` does not document — never fabricating a bound (rule 8). The Brand's
required CTA/hashtags SHALL be injected into EVERY variant via `injectRequiredParts`, exactly as
`composeCopy` already does for its single variant.

For a platform whose `platformCopyShapeFor(platform)?.supportsMentions` is `true` (today: `linkedin`
alone), AFTER `injectRequiredParts` and BEFORE that variant is validated, `weaveLinkedInMentions`
(`src/copy/linkedin-mentions.ts`, issue #130) SHALL run against the injected caption, resolving every
company/product in `input`'s own structured companies data (never free prose) through issue #126's
lookup at `options.linkedInHandlesPath` (defaulting to `DEFAULT_LINKEDIN_HANDLES_PATH`). The resulting
woven caption SHALL be what that variant is validated against, and its
`unresolvedMentions` (when non-empty) SHALL be carried onto that platform's `CopyVariant`. Every OTHER
targeted platform (any platform whose `supportsMentions` is not `true`, including the primary Channel
when it is not LinkedIn) SHALL be completely unaffected by this step, even when composing the identical
`CopyInput` companies data. `composeCopy` itself SHALL remain byte-for-byte unchanged (same signature,
same body) — every existing caller keeps calling it exactly as before. A Brand with NO Channel
configured at all SHALL degrade to the exact single, unlabeled compose `composeCopy` already performs —
never crash (data-handling rule 4). A Brand with EXACTLY ONE Channel SHALL produce a result identical to
calling `composeCopy` directly with the same `baseShape` (AC1/AC5) — UNLESS that one Channel is itself a
mentions-supporting platform, in which case its own `CopyVariant`-equivalent top-level fields are still
subject to the mention-weaving step above. Every targeted platform's validation failures SHALL be
collected (never stopping at the first) and a partially-valid set of variants SHALL NEVER be surfaced —
only a fully valid `Copy` is ever returned, mirroring `composeCopy`'s own all-or-nothing contract.

#### Scenario: A single-(primary)-Channel Brand's result is identical to composeCopy's own result

- **GIVEN** a Brand configured for exactly one Channel, marked `primary`, and a Recipe's own
  `copyShape`
- **WHEN** `composeCopyForChannels(input, baseShape, [thatChannel], options)` and `composeCopy(input,
  baseShape, options)` are both called with the same `input`/`baseShape`/`options`
- **THEN** the two results are deep-equal

#### Scenario: A multi-Channel Brand composes one labeled variant per targeted platform

- **GIVEN** a Brand configured for Straw Motion's own 5-platform Channel list (facebook primary,
  instagram, linkedin, x, tiktok)
- **WHEN** `composeCopyForChannels` is called
- **THEN** the result's `copy.variants` has exactly 5 entries, one per platform, each labeled by its
  own `platform`

#### Scenario: The primary Channel's variant never consults platform-shape.ts's own bounds

- **GIVEN** the same 5-platform Brand and the wired Character Explainer with Cast Recipe's own
  `copyShape` (180 chars, 1-3 emoji)
- **WHEN** a title long enough to overflow 180 chars but well within `platform-shape.ts`'s own
  `facebook` entry (477 chars) is composed
- **THEN** the primary (facebook) variant is truncated to the Recipe's own 180-char cap and carries at
  least 1 emoji — proving the table's own, looser `facebook` bound was never consulted

#### Scenario: Each non-primary variant is validated against its own platform's bounds

- **GIVEN** the same 5-platform Brand and a caption long enough to overflow X's 280-char cap but well
  within LinkedIn's 3,000-char cap
- **WHEN** `composeCopyForChannels` is called
- **THEN** the X variant is truncated to at most 280 characters and the LinkedIn variant is materially
  longer, genuinely different caps enforced on the same underlying material

#### Scenario: Every targeted platform's failures are collected; a partially-valid Copy is never surfaced

- **GIVEN** a drafter whose fixed output is simultaneously too long for the primary Channel's own
  `copyShape`, for X, and for TikTok, but within bounds for Instagram and LinkedIn
- **WHEN** `composeCopyForChannels` is called
- **THEN** the result is `ok: false` with failures for exactly the primary/X/TikTok platforms (never
  stopping at the first) and `copy` is `undefined` — no partially-valid Copy is ever returned

#### Scenario: A malformed LinkedIn @mention fails only the LinkedIn variant

- **GIVEN** a fixed caption containing a malformed inline `@mention` (a dangling `@`)
- **WHEN** `composeCopyForChannels` is called across the 5-platform Brand
- **THEN** the result fails with exactly one platform failure, `"linkedin"`, carrying a
  `platform_mention_syntax` error — every other platform's variant is unaffected by the identical text

#### Scenario: An undocumented platform falls back to the Recipe's own baseShape, never fabricating a bound

- **GIVEN** a Channel list naming a platform `platform-shape.ts` does not document (e.g. `"mastodon"`)
  alongside the primary
- **WHEN** `composeCopyForChannels` is called
- **THEN** that platform's variant is composed and validated against the Recipe's own `baseShape`,
  identically to what `composeCopy` alone would produce for that shape — never an invented bound

#### Scenario: Every Spec-recorded company that resolves is named as @Name on the LinkedIn variant

- **GIVEN** a `CopyInput` whose `companies` names two companies, both resolving to a committed handle in
  the LinkedIn Handle Lookup at `options.linkedInHandlesPath`
- **WHEN** `composeCopyForChannels` is called across the 5-platform Brand
- **THEN** the LinkedIn variant's caption contains `@Name` for both companies, and its `CopyVariant`
  carries no `unresolvedMentions` field

#### Scenario: An unresolved company falls back to plain text and is flagged, never blocking the caption

- **GIVEN** a `CopyInput` whose `companies` names one company that resolves and one that does not
- **WHEN** `composeCopyForChannels` is called
- **THEN** the LinkedIn variant's caption contains `@Name` for the resolved company and the plain,
  un-prefixed name for the unresolved one, its `CopyVariant.unresolvedMentions` contains exactly that
  unresolved name, and the overall result is still `ok: true` — an unresolved name never fails the
  compose

#### Scenario: Zero companies produces the exact pre-#130 LinkedIn variant, byte for byte

- **GIVEN** a `CopyInput` with no `companies` and no `slideNarrative` companies at all
- **WHEN** `composeCopyForChannels` is called across the 5-platform Brand
- **THEN** the LinkedIn variant's caption and hashtags are byte-for-byte identical to what issue #129's
  pre-#130 code produced (no `Mentions:` text, no `unresolvedMentions` field)

#### Scenario: A company absent from the Spec's own companies data is never mentioned, even if the lookup would resolve it

- **GIVEN** a LinkedIn Handle Lookup with a committed entry for a company NOT present anywhere in the
  `CopyInput`'s `companies`/`slideNarrative` data
- **WHEN** `composeCopyForChannels` is called
- **THEN** that company's name never appears anywhere in the LinkedIn variant's caption — grounded,
  never invented (mirrors PR #122's rule; always-rule 8)

### Requirement: write-social-copy documents composing one Copy variant per targeted platform

`.claude/skills/write-social-copy/SKILL.md` SHALL document reading the Brand's FULL Channel list
(`channelsFrom`/`loadChannels`, ADR-0019) before drafting, and — when it targets more than one platform
— drafting a DISTINCT caption per targeted platform from the same produced material (never one shared
caption reused everywhere), checking the primary Channel's variant with `validateCopy` and every other
targeted platform's variant with `validateCopyForPlatform`/`resolveCopyShapeForPlatform`. It SHALL
state that a single-Channel Brand's instructions are unchanged (one caption, as before), and that the
saved Copy carries `variants` (`src/copy/contract.ts`'s `Copy.variants`) only when more than one
platform was targeted. It SHALL additionally document the LinkedIn mention-resolution step (issue
#130): for each company/product named in the Spec's own structured companies data, `weaveLinkedInMentions`
(`src/copy/linkedin-mentions.ts`) resolves a handle via issue #126's lookup
(`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`) and weaves the literal `@Name` text into the
LinkedIn variant's caption when resolved, or the plain name — flagged for Operator review — when not; it
SHALL state this is a deterministic step the Skill hands off to, never the Skill's own hand-written or
guessed `@mention`.

#### Scenario: The Skill instructs one distinct caption per targeted platform

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it instructs drafting a DISTINCT caption for each targeted platform from the same produced
  material, and explicitly states this is never one shared caption reused everywhere

#### Scenario: The Skill documents the deterministic LinkedIn mention-resolution step

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it names `weaveLinkedInMentions`, `resolveLinkedInHandle`, and `linkedin-handle`, states that
  a resolved company/product is woven in as `@Name`, and states that an unresolved one falls back to
  plain text, flagged for Operator review

### Requirement: linkedin-mentions.ts resolves and weaves LinkedIn @mentions from a Recipe's own structured companies data

The system SHALL provide `src/copy/linkedin-mentions.ts`, a pure deep module (mirroring
`src/copy/inject.ts`'s pure-logic shape) plus one thin async shell, resolving every company/product
named in a Recipe's own STRUCTURED companies data — `CopyInput.companies` (the Character Explainer with
Cast Recipe's whole-Asset grain, issue #125) and every `CopySlideBeat.companies` beat (the News Carousel
Recipe's per-slide grain, PR #122) — through issue #126's committed LinkedIn Handle Lookup
(`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`), and weaving the literal text the Operator
would select from LinkedIn's own compose-box dropdown into the caption.

`companiesFromCopyInput(input)` SHALL gather every name from `input.companies` and every
`input.slideNarrative[].companies` beat, in that order, deduped case-insensitively (the first-seen
casing wins). It SHALL NEVER read free-prose fields (`title`, `angle`, `mediaContext`) — only names
already present in the Spec's own structured companies data are ever considered (grounded, never
invented — mirrors PR #122's rule; always-rule 8).

`buildLinkedInMentionResolutions(companies, handles)` SHALL build one `LinkedInMentionResolution`
(`{ name, mention, resolved }`) per company from an already-resolved `name -> handle | null` map: when a
handle is present, `mention` SHALL be the literal string `"@" + name` (the plain company/product name,
NEVER the raw handle slug) and `resolved` SHALL be `true`; when no handle is present, `mention` SHALL be
`name` unchanged and `resolved` SHALL be `false`.

`injectLinkedInMentions(caption, resolutions)` SHALL deterministically weave every resolution's
`mention` into `caption`: a resolution whose `mention` (case-insensitively) already appears in `caption`
SHALL be left alone — never duplicated (mirrors `injectRequiredCta`'s dedupe-on-already-present
pattern); every other resolution SHALL be appended, in order, as one trailing sentence. An empty
`resolutions` list SHALL return `caption` COMPLETELY UNCHANGED — no trailing artifact when there is
nothing to mention.

`unresolvedMentionNames(resolutions)` SHALL return the plain `name` of every resolution whose `resolved`
is `false`, in order — the Operator-review flag list, never silently dropped.

`weaveLinkedInMentions(caption, input, linkedInHandlesPath?)` SHALL be the thin async shell:
`companiesFromCopyInput(input)`, resolve each via `resolveLinkedInHandle` (issue #126, defaulting to
`DEFAULT_LINKEDIN_HANDLES_PATH` when `linkedInHandlesPath` is omitted), weave the result into `caption`,
and return `{ caption, unresolvedMentions }`. Zero companies SHALL short-circuit BEFORE any file I/O and
return `caption` byte-for-byte unchanged.

#### Scenario: companiesFromCopyInput merges both grains, deduped, ignoring free prose

- **GIVEN** a `CopyInput` whose `companies` names one company and whose `slideNarrative` carries two
  beats each naming a different (and, on one beat, an overlapping/differently-cased) company, plus a
  distinctive `title`/`angle`/`mediaContext` that itself names yet another company-looking string
- **WHEN** `companiesFromCopyInput(input)` is called
- **THEN** the result contains every company from `companies` and every beat's `companies`, each exactly
  once (the overlapping name deduped to its first-seen casing), and contains nothing derived from
  `title`/`angle`/`mediaContext`

#### Scenario: buildLinkedInMentionResolutions marks a resolved handle as @Name, an unresolved one as plain text

- **GIVEN** a companies list `["OpenAI", "Unknown Startup"]` and a handle map resolving `"OpenAI"` to
  `"openai"` and carrying no entry for `"Unknown Startup"`
- **WHEN** `buildLinkedInMentionResolutions(companies, handles)` is called
- **THEN** it returns `{ name: "OpenAI", mention: "@OpenAI", resolved: true }` and `{ name: "Unknown
  Startup", mention: "Unknown Startup", resolved: false }` — the resolved mention is the plain name
  string prefixed with `@`, never the raw handle slug `"openai"`

#### Scenario: injectLinkedInMentions appends missing mentions, dedupes present ones, and is a no-op for zero resolutions

- **GIVEN** a caption, and separately: zero resolutions; one resolution whose mention is already present
  in the caption (case-insensitively); and one resolution whose mention is absent
- **WHEN** `injectLinkedInMentions(caption, resolutions)` is called for each
- **THEN** zero resolutions returns the caption completely unchanged; the already-present resolution is
  NOT duplicated; the absent resolution's mention text is appended to the caption

#### Scenario: weaveLinkedInMentions resolves, weaves, and reports unresolved names against the real lookup file

- **GIVEN** a committed `linkedin-handles.yaml` resolving one of two companies named in a `CopyInput`
- **WHEN** `weaveLinkedInMentions(caption, input, path)` is called
- **THEN** the returned caption contains `@Name` for the resolved company and the plain name for the
  unresolved one, and `unresolvedMentions` contains exactly the unresolved company's name

#### Scenario: weaveLinkedInMentions never touches disk for zero companies

- **GIVEN** a `CopyInput` with no `companies` and no `slideNarrative` companies at all
- **WHEN** `weaveLinkedInMentions(caption, input, "/path/that/does/not/exist.yaml")` is called
- **THEN** it resolves successfully, returning `caption` unchanged and `unresolvedMentions: []` — no
  error, even though the given path does not exist (short-circuits before any file read)

