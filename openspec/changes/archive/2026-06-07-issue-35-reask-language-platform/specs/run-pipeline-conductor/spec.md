## MODIFIED Requirements

### Requirement: The new-Brand interview SHALL be staged with pre-scout fields only before scouting

The staged interview SHALL ask ONLY the fields required before Trend Research can proceed:
- Brand name (from which the slug is derived and validated)
- Niche
- Voice
- Language and region
- Platform (facebook | instagram | linkedin)
- At least one seed Page URL

The following fields are DEFERRED — they SHALL NOT be asked before scouting:
- Channel URL
- Banned words
- Required CTA
- Required hashtags

The conductor SHALL NOT invent values for any field. Every field in the scaffolded Brand Profile
SHALL reflect only what the Operator supplied in the interview.

**Language collection**: if the Operator's answer is empty or blank, the conductor SHALL re-ask
rather than substituting a default language code. The re-ask loop SHALL be bounded by an attempt
cap of 3 (matching the Brand-name loop). If the cap is exceeded, the conductor SHALL stop cleanly
with a clear message and `done: true`, and SHALL NOT call `scaffoldBrand` — no Brand directory is
created.

**Platform collection**: if the Operator's answer is empty, OR is not one of `"facebook"`,
`"instagram"`, or `"linkedin"` (case-insensitive), the conductor SHALL re-ask with a message that
names the accepted values and notes that Facebook is the only fully wired platform today. The
re-ask loop SHALL be bounded by an attempt cap of 3. If the cap is exceeded, the conductor SHALL
stop cleanly with a clear message and `done: true`, and SHALL NOT call `scaffoldBrand` — no Brand
directory is created. A valid answer is accepted on the first attempt that produces a recognised
value.

Region is unchanged — it is already captured verbatim and may legitimately be empty.

#### Scenario: Pre-scout interview asks exactly the required fields

- **GIVEN** the staged interview has begun
- **WHEN** the conductor runs the pre-scout interview
- **THEN** it asks for: brand name, niche, voice, language/region, platform, and seed pages
- **AND** it does NOT ask for: Channel URL, banned words, required CTA, or required hashtags

#### Scenario: The scaffolded brand-profile contains exactly the Operator's answers

- **GIVEN** the Operator supplied specific values for niche, voice, language, region, platform,
  and seed pages
- **WHEN** the interview completes and `scaffoldBrand` is called
- **THEN** the written `brand-profile.yaml` contains exactly those values
- **AND** no other brand facts are present (no invented niche, voice, seeds, or URLs)

#### Scenario: Empty Language triggers a re-ask rather than a silent default

- **GIVEN** the interview has reached the Language question
- **WHEN** the Operator submits an empty answer
- **THEN** the conductor re-asks for the language code (does NOT use `"en"` as a default)
- **AND** the Brand Profile's `language` field reflects the Operator's eventual non-empty answer

#### Scenario: Language cap exceeded stops the conductor with no Brand directory created

- **GIVEN** the interview has reached the Language question
- **WHEN** the Operator submits an empty answer on each of the 3 attempts
- **THEN** the conductor stops with a clear message and `done: true`
- **AND** no Brand directory is created under the brands root

#### Scenario: Empty Platform triggers a re-ask rather than a silent default

- **GIVEN** the interview has reached the Platform question
- **WHEN** the Operator submits an empty answer
- **THEN** the conductor re-asks for the platform (does NOT use `"facebook"` as a default)

#### Scenario: Unrecognised Platform triggers a re-ask naming the accepted values

- **GIVEN** the interview has reached the Platform question
- **WHEN** the Operator submits a non-empty but unrecognised value (e.g. `"fb"` or `"tiktok"`)
- **THEN** the conductor re-asks with a message that names the accepted values
  (`facebook`, `instagram`, `linkedin`) and notes Facebook is the only fully wired platform today
- **AND** the unrecognised value is NOT silently mapped to `"facebook"`

#### Scenario: Valid Platform answer (case-insensitive) is accepted on the first valid entry

- **GIVEN** the interview has reached the Platform question
- **AND** one or more empty/unrecognised answers precede a valid one
- **WHEN** the Operator supplies `"Facebook"` (or any case variant of a recognised value)
- **THEN** the conductor accepts it and advances to the next question
- **AND** the Brand Profile's `platform` field holds the lowercase canonical value

#### Scenario: Platform cap exceeded stops the conductor with no Brand directory created

- **GIVEN** the interview has reached the Platform question
- **WHEN** the Operator submits an unrecognised value on each of the 3 attempts
- **THEN** the conductor stops with a clear message and `done: true`
- **AND** no Brand directory is created under the brands root

---

### Requirement: The conductor SHALL never invent brand facts

The conductor SHALL strictly relay the Operator's answers through the pure builders to the write
shell. It SHALL NOT supply default niche text, invented seed pages, placeholder voice copy, or
any other brand fact that the Operator did not explicitly provide. Only the Apify actor slugs (a
technical default, not a brand fact) and the standard seeds default fields (lookback_days,
format_focus, ideas_per_run, overperformance_only) are set by the builder without Operator input.

In particular, the conductor SHALL NOT fabricate a Language code (e.g. `"en"`) or a Platform
value (e.g. `"facebook"`) when the Operator's answer is absent or unrecognised — it SHALL re-ask
instead.

#### Scenario: Scaffolded brand-profile reflects only Operator answers

- **GIVEN** the Operator provided niche `"Home tips"`, voice `"Friendly and direct"`, language
  `"en"`, region `"US"`, platform `"facebook"`, and seed page `"https://fb.com/peer1"`
- **WHEN** the interview completes and the Brand is scaffolded
- **THEN** `brand-profile.yaml` contains exactly those values
- **AND** `channel.url` is `""` (the Operator did not provide it)
- **AND** `banned_words` is `[]` (the Operator did not provide it)

#### Scenario: Brand Profile language reflects the Operator's supplied language, not a fabricated default

- **GIVEN** the Operator eventually supplies language code `"pt"` (after one or more re-asks)
- **WHEN** the interview completes and the Brand is scaffolded
- **THEN** `brand-profile.yaml` has `language: "pt"`
- **AND** it does NOT have `language: "en"` (the fabricated default that was removed)
