## ADDED Requirements

### Requirement: Slug validation rejects names that produce an empty slug

The system SHALL expose a `validateSlug(slug: string)` function that checks whether a derived slug
is usable as a filesystem directory name. The only rejection case today is an **empty slug** (which
occurs when `slugify` strips all characters from an all-non-alphanumeric Brand name). A rejected
slug SHALL produce an `{ ok: false; reason: string }` result with a clear, human-readable message
explaining why the name is not usable. A valid (non-empty) slug SHALL produce `{ ok: true }`.

`validateSlug` is pure: no I/O, no filesystem access, deterministic.

#### Scenario: A normal Brand name produces a valid slug

- **GIVEN** a Brand name such as `"MundoTip"` or `"Acme Corp"`
- **WHEN** `slugify` is called and the result is passed to `validateSlug`
- **THEN** `validateSlug` returns `{ ok: true }`

#### Scenario: An all-non-alphanumeric name produces an empty slug that is rejected

- **GIVEN** a Brand name consisting entirely of non-alphanumeric characters (e.g. `"!!!"`)
- **WHEN** `slugify` is called on it (yields `""`) and the result is passed to `validateSlug`
- **THEN** `validateSlug` returns `{ ok: false, reason: <message> }` where `<message>` is a
  non-empty, human-readable explanation
- **AND** no Brand directory is created

#### Scenario: A long name is truncated to 64 characters and still valid

- **GIVEN** a Brand name of 100+ characters that contains alphanumeric content
- **WHEN** `slugify` truncates it to 64 characters and the result is passed to `validateSlug`
- **THEN** `validateSlug` returns `{ ok: true }`

---

### Requirement: Pure builders produce a brand-profile, seeds, and empty ledger from interview answers

The system SHALL expose three pure builder functions that accept `BrandInterviewAnswers` (or no
arguments for the ledger) and return serialisable data structures:

- `buildBrandProfile(answers)` — maps interview answers to the brand-profile YAML shape.
- `buildSeeds(answers)` — maps interview answers to the seeds YAML shape.
- `buildEmptyLedger()` — returns the canonical empty ledger shape.

All three functions SHALL be **pure**: no I/O, no filesystem access, no random values, no clock
access. Same inputs ALWAYS produce the same outputs.

The builders SHALL **never invent brand facts**: every field in the output that derives from the
Operator's answers SHALL be taken verbatim from `answers`; every field not supplied by the
Operator SHALL be absent or set to an appropriate empty default (e.g. `[]`, `""`). The conductor
SHALL NOT supply placeholder text, inferred values, or fabricated seeds on behalf of the Operator.

#### Scenario: buildBrandProfile maps every supplied answer field to the correct output key

- **GIVEN** a `BrandInterviewAnswers` object with `name`, `niche`, `voice`, `language`, `region`,
  `platform`, `seedPages`, and no deferred fields
- **WHEN** `buildBrandProfile(answers)` is called
- **THEN** the result contains:
  - `channel.name` equal to `answers.name`
  - `channel.platform` equal to `answers.platform`
  - `channel.url` equal to `""` (empty, since `channelUrl` was not supplied)
  - `niche` equal to `answers.niche`
  - `voice` equal to `answers.voice`
  - `language` equal to `answers.language`
  - `region` equal to `answers.region`
  - `banned_words` equal to `[]` (empty, since `bannedWords` was not supplied)
  - `required_cta` equal to `""` (empty)
  - `required_hashtags` equal to `[]`

#### Scenario: buildBrandProfile includes deferred fields when supplied

- **GIVEN** a `BrandInterviewAnswers` object that includes `channelUrl`, `bannedWords`,
  `requiredCta`, and `requiredHashtags`
- **WHEN** `buildBrandProfile(answers)` is called
- **THEN** the result contains:
  - `channel.url` equal to `answers.channelUrl`
  - `banned_words` equal to `answers.bannedWords`
  - `required_cta` equal to `answers.requiredCta`
  - `required_hashtags` equal to `answers.requiredHashtags`

#### Scenario: buildBrandProfile round-trips through YAML serialization

- **GIVEN** a `BrandInterviewAnswers` object
- **WHEN** `buildBrandProfile(answers)` is called, the result is serialized to YAML with `stringify`,
  then parsed back with `parse`
- **THEN** the parsed result has the same key/value pairs as the original builder output
  (string fields match exactly; array fields have equal length and same elements)

#### Scenario: buildSeeds maps seed pages and selects the correct Apify actor block

- **GIVEN** a `BrandInterviewAnswers` with `platform: "facebook"` and `seedPages: ["https://www.facebook.com/peer1"]`
- **WHEN** `buildSeeds(answers)` is called
- **THEN** the result contains:
  - `seed_pages` equal to `["https://www.facebook.com/peer1"]`
  - `language` equal to `answers.language`
  - `region` equal to `answers.region`
  - `apify.facebook.trends_actor` set to the standard Facebook trends actor slug

#### Scenario: buildSeeds round-trips through YAML serialization

- **GIVEN** a `BrandInterviewAnswers` object
- **WHEN** `buildSeeds(answers)` is called, the result is serialized to YAML and parsed back
- **THEN** the parsed result has the same seed_pages array and the same apify block

#### Scenario: buildEmptyLedger returns the canonical empty shape

- **GIVEN** no arguments
- **WHEN** `buildEmptyLedger()` is called
- **THEN** the result has:
  - `ideas` equal to `[]`
  - `baseline.updated_at` equal to `null`
  - `baseline.shares` equal to `null`
  - `baseline.comments` equal to `null`
  - `baseline.reactions` equal to `null`
  - `baseline.views` equal to `null`

---

### Requirement: scaffoldBrand materialises a Brand directory from the skeleton template

The system SHALL expose a `scaffoldBrand(slug, content, options)` thin write shell that:

1. Verifies the Brand directory does not already exist; throws with a clear message if it does.
2. Copies the directory structure from `templates/brand-skeleton/` (recursively).
3. Writes the Operator-supplied `brand-profile.yaml`, `seeds.yaml`, and `ledger.json` over the
   template files.
4. Creates any subdirectories required by the skeleton (e.g. `ideas/`, `your-data/`).

After `scaffoldBrand` completes, the new Brand SHALL appear in `listBrands(brandsRoot)`.

`scaffoldBrand` is the thin write shell — it contains no business logic; all content decisions
are made by the pure builders before it is called.

#### Scenario: scaffoldBrand creates the expected directory structure

- **GIVEN** a `slug` not present in `brandsRoot` and a valid `content` object (built by the pure builders)
- **WHEN** `scaffoldBrand(slug, content, options)` is called with a temp brandsRoot and templatePath
- **THEN** `data/brands/<slug>/brand-profile.yaml` exists and contains the profile content
- **AND** `data/brands/<slug>/seeds.yaml` exists and contains the seeds content
- **AND** `data/brands/<slug>/ledger.json` exists and contains the ledger content
- **AND** `data/brands/<slug>/ideas/` directory exists
- **AND** `data/brands/<slug>/your-data/` directory exists

#### Scenario: After scaffolding, the Brand appears in listBrands

- **GIVEN** an empty brandsRoot
- **WHEN** `scaffoldBrand` is called for slug `"newbrand"`
- **THEN** `listBrands(brandsRoot)` returns an array that includes `"newbrand"`

#### Scenario: scaffoldBrand throws when the Brand directory already exists

- **GIVEN** a Brand directory for slug `"existingbrand"` already exists in `brandsRoot`
- **WHEN** `scaffoldBrand("existingbrand", content, options)` is called
- **THEN** it throws an error with a message that names the slug
- **AND** the existing directory is not modified
