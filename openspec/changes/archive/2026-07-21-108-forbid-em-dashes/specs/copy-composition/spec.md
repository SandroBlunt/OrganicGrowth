## MODIFIED Requirements

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
