## ADDED Requirements

### Requirement: CopyInput carries an optional slideNarrative — the ACTUAL produced on-slide beats, once the media exists

`src/copy/draft.ts`'s `CopyInput` SHALL gain an optional field, `slideNarrative`, an array of
`CopySlideBeat` (`{ role: string, text: string, statCallout?: string }`) — the produced Production
Spec's OWN per-slide `role`/`text`/`stat_callout` values, available only once a multi-slide Recipe's
media has been authored. This field SHALL be optional and additive: every existing `CopyInput` caller
that omits it SHALL remain valid, and `defaultDraftCopy`'s behavior SHALL be completely unaffected by
its presence or absence.

#### Scenario: CopyInput without slideNarrative remains valid (backward compatible)

- **GIVEN** a `CopyInput` value with no `slideNarrative` field at all (every pre-existing caller's
  shape)
- **WHEN** it is passed to `defaultDraftCopy` or `composeCopy`
- **THEN** it behaves exactly as it did before this change — no error, no behavior change

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
