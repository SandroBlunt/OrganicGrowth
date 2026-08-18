## ADDED Requirements

### Requirement: A Brand's configured Apify actor slug is loaded straight from its own seeds.yaml, never fabricated

`loadConfiguredActorSlug(seedsPath, platform, purpose)` (`src/apify/actor-config.ts`) SHALL read the Brand's `seeds.yaml` at `seedsPath`, parse it as YAML, and resolve `apify.<platform>.<purpose>` via the existing pure `resolveApifyActor`. It SHALL return `null` — NEVER throw, never fabricate a slug — when: the file cannot be read (missing or otherwise unreadable), the file's contents cannot be parsed as YAML, there is no `apify` block at all, or `resolveApifyActor` itself returns `null` (missing platform block, missing purpose, or the `"..."` not-yet-wired placeholder).

#### Scenario: A configured actor slug resolves correctly from a real seeds.yaml file

- **GIVEN** a `seeds.yaml` file on disk with `apify.facebook.post_actor: apify/facebook-posts-scraper`
- **WHEN** `loadConfiguredActorSlug(seedsPath, "facebook", "post_actor")` is called
- **THEN** it returns `"apify/facebook-posts-scraper"`

#### Scenario: A missing seeds.yaml resolves to null, never a thrown error

- **GIVEN** a `seedsPath` pointing at a file that does not exist
- **WHEN** `loadConfiguredActorSlug(seedsPath, "facebook", "post_actor")` is called
- **THEN** it returns `null`

#### Scenario: Unparseable YAML resolves to null, never a thrown error

- **GIVEN** a `seeds.yaml` file whose contents are not valid YAML
- **WHEN** `loadConfiguredActorSlug(seedsPath, "facebook", "post_actor")` is called
- **THEN** it returns `null`

#### Scenario: A platform with no configured block resolves to null

- **GIVEN** a `seeds.yaml` file with an `apify` block that has no `facebook` entry
- **WHEN** `loadConfiguredActorSlug(seedsPath, "facebook", "post_actor")` is called
- **THEN** it returns `null`

#### Scenario: The not-yet-wired "..." placeholder resolves to null, not the literal string

- **GIVEN** a `seeds.yaml` file with `apify.linkedin.post_actor: "..."`
- **WHEN** `loadConfiguredActorSlug(seedsPath, "linkedin", "post_actor")` is called
- **THEN** it returns `null` — never the literal `"..."` string
