## ADDED Requirements

### Requirement: The conductor SHALL offer to create a Brand when given an unknown slug

The conductor SHALL offer to create that Brand when `/run-pipeline <brand>` is invoked with a slug
that does not exist on disk, rather than stopping with a hard error. The offer message SHALL name
the slug. If the Operator accepts, the conductor starts the staged new-Brand interview. If the
Operator declines, the conductor stops with a clear message and sets `done: true`.

#### Scenario: Unknown slug triggers an offer-to-create prompt

- **GIVEN** a Brand slug `"newbrand"` that does NOT exist in the brands root
- **WHEN** `/run-pipeline newbrand` is invoked
- **THEN** the conductor outputs a message offering to create the Brand, naming `"newbrand"`
- **AND** the conductor prompts the Operator to accept or decline

#### Scenario: Operator accepts — interview runs and Brand is scaffolded

- **GIVEN** the offer-to-create prompt has been shown for slug `"newbrand"`
- **AND** the Operator types `"yes"` (or equivalent)
- **WHEN** the conductor processes the acceptance
- **THEN** the staged interview begins (asking niche, voice, language/region, platform, seed pages)
- **AND** after the interview, the Brand is scaffolded (`data/brands/newbrand/` is created)
- **AND** the pipeline proceeds normally for the new Brand

#### Scenario: Operator declines — conductor stops cleanly

- **GIVEN** the offer-to-create prompt has been shown
- **AND** the Operator types `"no"` (or equivalent)
- **WHEN** the conductor processes the decline
- **THEN** the conductor outputs a message acknowledging the decline
- **AND** it stops with `done: true`
- **AND** no Brand directory is created

---

### Requirement: The conductor SHALL ask new-vs-existing and list existing Brands when given no argument

The conductor SHALL ask the Operator whether they are starting a new Brand or working an existing
one when `/run-pipeline` is invoked with no argument. The prompt SHALL list the existing Brand slugs
(from `listBrands()`). If the Operator picks an existing Brand, the conductor continues with that
slug as if it had been passed as an argument. If the Operator chooses to create a new Brand, the
staged interview begins.

#### Scenario: No argument triggers the new-vs-existing prompt with existing Brands listed

- **GIVEN** at least one Brand exists (e.g. `"mundotip"`)
- **AND** `/run-pipeline` is invoked with no argument
- **WHEN** the conductor starts
- **THEN** it outputs a message listing the existing Brand slugs
- **AND** it asks whether to start a new Brand or work an existing one

#### Scenario: No argument with no existing Brands goes directly to new-Brand interview

- **GIVEN** no Brands exist in the brands root
- **AND** `/run-pipeline` is invoked with no argument
- **WHEN** the conductor starts
- **THEN** it notes there are no existing Brands
- **AND** it begins the new-Brand interview directly

#### Scenario: Operator picks an existing Brand — pipeline continues normally

- **GIVEN** Brands `"mundotip"` and `"acme"` exist
- **AND** the Operator types `"mundotip"` in response to the new-vs-existing prompt
- **WHEN** the conductor processes the choice
- **THEN** it continues with `"mundotip"` as the Brand slug
- **AND** proceeds through the normal pipeline flow (readiness, rename hint, phase resolution, etc.)

---

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

---

### Requirement: Slug derivation and validation SHALL be applied before scaffolding

The conductor SHALL derive a filesystem-safe slug from the Operator-supplied Brand name using
`slugify`, then validate it with `validateSlug`. If the derived slug is empty (all-non-alphanumeric
name), the conductor SHALL reject the name with a clear message and re-ask for the name. No Brand
directory SHALL be created for an invalid name.

#### Scenario: A normal Brand name yields a valid slug and proceeds

- **GIVEN** the Operator supplies a Brand name like `"Acme Corp"`
- **WHEN** the conductor derives and validates the slug (`"acme-corp"`)
- **THEN** `validateSlug` returns `{ ok: true }`
- **AND** scaffolding proceeds with slug `"acme-corp"`

#### Scenario: An all-non-alphanumeric name is rejected with a clear message

- **GIVEN** the Operator supplies a Brand name like `"???"`
- **WHEN** the conductor derives and validates the slug (empty string)
- **THEN** `validateSlug` returns `{ ok: false, reason: <message> }`
- **AND** the conductor outputs a clear error message naming the invalid input
- **AND** no Brand directory is created

---

### Requirement: The conductor SHALL never invent brand facts

The conductor SHALL strictly relay the Operator's answers through the pure builders to the write
shell. It SHALL NOT supply default niche text, invented seed pages, placeholder voice copy, or
any other brand fact that the Operator did not explicitly provide. Only the Apify actor slugs (a
technical default, not a brand fact) and the standard seeds default fields (lookback_days,
format_focus, ideas_per_run, overperformance_only) are set by the builder without Operator input.

#### Scenario: Scaffolded brand-profile reflects only Operator answers

- **GIVEN** the Operator provided niche `"Home tips"`, voice `"Friendly and direct"`, language
  `"en"`, region `"US"`, platform `"facebook"`, and seed page `"https://fb.com/peer1"`
- **WHEN** the interview completes and the Brand is scaffolded
- **THEN** `brand-profile.yaml` contains exactly those values
- **AND** `channel.url` is `""` (the Operator did not provide it)
- **AND** `banned_words` is `[]` (the Operator did not provide it)
