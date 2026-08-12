## MODIFIED Requirements

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

## ADDED Requirements

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

`auditNewsShortScriptAuthorPhase` (`src/production-spec/news-short-script-author-checklist.ts`) SHALL
audit a candidate News Short Script Production Spec, mirroring `auditNewsCarouselAuthorPhase`'s own
graduated pattern: it SHALL REFERENCE — never duplicate — `validateNewsShortScriptSpec` (the structural
gate, including the beat-shape/role-order/word-count/Curiosity-Queries checks) and
`scanNewsShortScriptForBannedWords`, and SHALL layer two NEW mechanical items on top:

- **no-calendar-dates** — `scanTextFieldsForDates`, scoped to ONLY each beat's SPOKEN `text` field
  (`beats[i].text`) — never `source_url`/`media_url` (which legitimately carry a publication date as
  part of their own URL path) and never `show_cue` (a document annotation, not spoken content).
  REJECT-ONLY: a hit fails the item and the overall `ok`.
- **shot-list-variety** — `checkShotListVariety`: no two beats' `source_url` SHALL share the same
  site/host (the registrable hostname, lowercased, with a leading `www.` stripped) — mirroring the News
  Carousel Recipe's own `placement-variety` item (issue #106), but needing NO per-Format parameters,
  since "no repeated source site" is a fixed, universal rule rather than something a Baseline Prompt
  tunes. A beat whose `source_url` doesn't parse as a URL contributes nothing to compare (never throws).

The function SHALL return a `PhaseAuditResult` (`recipe: "news-short-script"`, `phase: "author"`) whose
overall `ok` is `true` only when the structural validator passes AND every mechanical item passes; it
SHALL never throw for any input shape.

#### Scenario: A baseline-adherent Spec (distinct source sites, 3-5 Curiosity Queries per beat, no dates) passes every mechanical item

- **GIVEN** a well-formed Spec whose every beat carries 3-5 Curiosity Queries, no beat's `text` states an
  explicit calendar date, and no two beats' `source_url` share a site
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `true` and every mechanical item's `ok` is `true`

#### Scenario: A beat missing, or short on, Curiosity Queries fails ONLY the curiosity-queries item

- **GIVEN** a Spec whose ONE mutation is a beat with fewer than 3 Curiosity Queries (or none at all)
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, [])` is called
- **THEN** the `curiosity-queries` item's `ok` is `false`, the overall `ok` is `false`, and the
  `no-calendar-dates`/`shot-list-variety` items' `ok` stay `true`

#### Scenario: A beat's spoken text stating an explicit calendar date fails ONLY the no-calendar-dates item

- **GIVEN** a Spec whose ONE mutation is a beat's `text` gaining an explicit calendar date (e.g.
  `"It shipped on August 11th, 2026."`)
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, [])` is called
- **THEN** the `no-calendar-dates` item's `ok` is `false`, naming the beat and the matched date substring,
  and the `curiosity-queries`/`shot-list-variety` items' `ok` stay `true`

#### Scenario: Two beats' source_url sharing the same site fails ONLY the shot-list-variety item

- **GIVEN** a Spec whose ONE mutation is a second beat's `source_url` pointing at the SAME site/host as
  another beat's (a different page on that site, or the exact same page)
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, [])` is called
- **THEN** the `shot-list-variety` item's `ok` is `false`, naming the shared site and both beat indices,
  and the `no-calendar-dates`/`curiosity-queries` items' `ok` stay `true`

#### Scenario: A banned word fails ONLY the banned-words item — referencing, not duplicating, the existing scanner

- **GIVEN** a Spec whose ONE mutation is a beat's `text` containing a Brand-configured banned word
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, bannedWords)` is called
- **THEN** the `banned-words` item's `ok` is `false`, and every OTHER item's `ok` stays `true`

#### Scenario: The function never throws on a wildly malformed candidate Spec

- **GIVEN** `null`, a bare string, or `{ beats: "nope" }` as the candidate Spec
- **WHEN** `auditNewsShortScriptAuthorPhase` is called with it
- **THEN** it returns a `PhaseAuditResult` without throwing, and `ok` is `false`

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
