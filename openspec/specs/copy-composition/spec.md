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

