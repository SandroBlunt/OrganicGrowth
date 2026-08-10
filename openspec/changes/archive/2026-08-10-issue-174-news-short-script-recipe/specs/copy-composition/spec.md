## ADDED Requirements

### Requirement: Copy gains an optional title + description shape, opt-in via CopyShape.titleMaxChars (issue #174)

`Copy` and `CopyShape` (`src/copy/contract.ts`) SHALL both gain an OPTIONAL field: `Copy.title?: string`
and `CopyShape.titleMaxChars?: number`. `validateCopy` (`src/copy/validate.ts`) SHALL check `title`
(required, non-empty, at most `shape.titleMaxChars` characters — new `"title_missing"`/`"title_length"`
error codes) ONLY when `shape.titleMaxChars` is defined; when it is undefined (both existing wired
Recipes), a present or absent `title` is NEVER checked or required — a complete no-op, byte-for-byte
unchanged behavior. When `title` is present it SHALL also be scanned for banned words and dash "tells"
(issue #108), through the SAME `scanTextFields`/`scanTextFieldsForDashes` core every other Copy field
already goes through. `injectRequiredParts` (`src/copy/inject.ts`) SHALL preserve an input `title`
through unchanged — it only ever touches `caption`/`hashtags`, never silently dropping any other field.
`copy/platform-shape.ts`'s documented `youtube` entry SHALL declare `titleMaxChars: 100` (YouTube's real
video-title limit) — the ONE documented platform that declares it; `validateCopyForPlatform` enforces it
via `resolveCopyShapeForPlatform`'s inherited field whenever `platform` is `"youtube"`.

#### Scenario: validateCopy requires a title when titleMaxChars is declared

- **GIVEN** a `CopyShape` with `titleMaxChars: 100` and a candidate Copy with no `title` field
- **WHEN** `validateCopy` is called
- **THEN** it returns `{ ok: false }` with a `"title_missing"` error

#### Scenario: validateCopy rejects a title over titleMaxChars

- **GIVEN** a `CopyShape` with `titleMaxChars: 100` and a candidate Copy whose `title` is 101 characters
- **WHEN** `validateCopy` is called
- **THEN** it returns `{ ok: false }` with a `"title_length"` error

#### Scenario: A present title is scanned for banned words and dash tells, reject-only

- **GIVEN** a `CopyShape` with `titleMaxChars` set and a candidate Copy whose `title` contains a banned
  word or an em dash
- **WHEN** `validateCopy` is called
- **THEN** it returns `{ ok: false }` with a `"banned_word"` or `"dash_in_copy"` error naming the
  `title` field

#### Scenario: A shape with no titleMaxChars is a COMPLETE no-op — title is never checked or required

- **GIVEN** a `CopyShape` with no `titleMaxChars` field and a candidate Copy that DOES carry a (stray)
  `title` value
- **WHEN** `validateCopy` is called
- **THEN** the result is identical to validating the same Copy with `title` omitted — the field is never
  inspected

#### Scenario: injectRequiredParts preserves an input title through unchanged

- **GIVEN** a Copy carrying `{ caption, hashtags, title: "A punchy title" }`
- **WHEN** `injectRequiredParts` is called
- **THEN** the returned Copy's `title` is `"A punchy title"`, unchanged — only `caption`/`hashtags` are
  ever modified by this step

#### Scenario: YouTube's documented platform bounds declare titleMaxChars: 100; no other platform does

- **GIVEN** `copy/platform-shape.ts`'s `platformCopyShapeFor("youtube")` and every OTHER documented
  platform's own entry
- **WHEN** each entry's `titleMaxChars` field is inspected
- **THEN** YouTube's is `100`; every other documented platform's is `undefined`

#### Scenario: validateCopyForPlatform enforces the 100-char title bound for youtube

- **GIVEN** a candidate Copy whose `title` is 101 characters, and a Recipe's own `baseShape` with no
  `titleMaxChars` of its own
- **WHEN** `validateCopyForPlatform(copy, "youtube", baseShape, rules)` is called
- **THEN** it returns `{ ok: false }` with a `"title_length"` error, resolved from
  `resolveCopyShapeForPlatform`'s YouTube entry

### Requirement: A dedicated, deterministic drafter composes a title + description Copy (issue #174)

`newsShortScriptDraftCopy` (`src/copy/news-short-script-draft.ts`) SHALL be a `CopyDrafter`-shaped
function that, given a `CopyInput`/`CopyShape`, derives `title` from `input.title` (truncated to
`shape.titleMaxChars`, falling back to a documented default when the caller omits it) and a description
(stored in `caption`, reusing `draft.ts`'s shared `assembleCaption` envelope) from `input.angle`/
`input.mediaContext`, joined as separate short sentences (never a dash — issue #108), falling back to
`input.title` when neither is supplied. It SHALL always produce a `Copy` that passes `validateCopy` for
the SAME `CopyShape` it was drafted for — mirroring `defaultDraftCopy`/`skillDraftCopy`'s own guarantee.
Deterministic: no model call, no I/O, no clock.

#### Scenario: newsShortScriptDraftCopy always produces a Copy passing validateCopy for its own shape

- **GIVEN** any `CopyInput` and a `CopyShape` declaring `titleMaxChars`
- **WHEN** `newsShortScriptDraftCopy(input, shape)` is called, then the result is passed to
  `validateCopy(result, shape, rules)` with no Brand rules configured
- **THEN** `validateCopy`'s result is `{ ok: true }`

#### Scenario: A too-long title is truncated to titleMaxChars, never exceeding the bound

- **GIVEN** a `CopyInput.title` longer than `shape.titleMaxChars`
- **WHEN** `newsShortScriptDraftCopy` is called
- **THEN** the returned `title`'s character count is exactly `shape.titleMaxChars`

#### Scenario: The description falls back to the Idea's own title when angle/mediaContext are both absent

- **GIVEN** a `CopyInput` with only `title` set (no `angle`, no `mediaContext`)
- **WHEN** `newsShortScriptDraftCopy` is called
- **THEN** the returned `caption` (the description body) contains the Idea's own title text
