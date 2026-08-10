## ADDED Requirements

### Requirement: News Short Script Production Spec validation (issue #174)

`validateNewsShortScriptSpec` (`src/production-spec/news-short-script-validate.ts`) SHALL validate a
candidate News Short Script Production Spec (`{ beats: [{ role, text, source_url, media_url?,
show_cue }] }`, `src/production-spec/news-short-script-contract.ts`'s `NewsShortScriptSpec`): `beats`
SHALL be a non-empty array whose first entry's `role` is `"hook"`, whose last entry's `role` is `"cta"`,
and whose every entry between them has `role: "story"` (at least `MIN_STORY_BEATS`, default 1); every
beat SHALL carry a non-empty `text`/`source_url`/`show_cue`, an `source_url` that looks like an http(s)
URL, and — when present — a `media_url` that also looks like an http(s) URL; and the WHOLE Spec's total
word count (summed across every beat's `text`) SHALL fall in `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`
(120-150, the issue's own "~120-150 words" 45-60-second target). Never throws on shape; every failure is
returned as `{ code, message }`.

#### Scenario: A well-formed Spec (hook, one-or-more story beats, cta, 120-150 words total) validates ok

- **GIVEN** a Spec with a `"hook"` beat, two `"story"` beats, and a `"cta"` beat, totaling 123 words
  across their `text` fields
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
