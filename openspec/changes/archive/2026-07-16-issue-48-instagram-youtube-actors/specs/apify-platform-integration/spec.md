## ADDED Requirements

### Requirement: A URL's Apify platform is detected from its own domain, never assumed

`detectPlatformFromUrl` SHALL derive the platform used to pick an Apify actor from a URL's own
hostname (`facebook.com`/`fb.com`/`fb.watch` → facebook; `instagram.com` → instagram;
`youtube.com`/`youtu.be` → youtube; `linkedin.com` → linkedin) — for a peer/competitor source (Trend
Research) or a logged Post (Performance) alike, never assumed from the Format's, the Idea's, or the
Brand's Channel platform (`brand-profile.yaml`). A Format's peer sources, or a Brand's own Posts, MAY
span more than one platform even though a Brand has exactly one Channel platform.

#### Scenario: Facebook, Instagram, and YouTube domains are detected correctly

- **GIVEN** the URLs `https://www.facebook.com/SomePage`, `https://www.instagram.com/someaccount/`,
  and `https://www.youtube.com/@somechannel`
- **WHEN** `detectPlatformFromUrl` is called on each
- **THEN** it returns `"facebook"`, `"instagram"`, and `"youtube"` respectively

#### Scenario: An unrecognised domain or unparseable URL returns null, never a guess

- **GIVEN** the URL `https://www.tiktok.com/@someone` (unrecognised platform) and the string
  `"not a url"` (unparseable)
- **WHEN** `detectPlatformFromUrl` is called on each
- **THEN** it returns `null` for both — never a fabricated platform guess

### Requirement: Apify actor slugs are resolved defensively, never fabricated

`resolveApifyActor(apifyConfig, platform, purpose)` SHALL read `apify.<platform>.<purpose>` from an
already-YAML-parsed `seeds.yaml` value and return the trimmed actor slug when present and real. It
SHALL return `null` — never a fabricated or literal placeholder slug — when: the platform has no
block, the purpose key is missing or not a string, the value is the `"..."` not-yet-wired placeholder,
or `apifyConfig` itself is not an object (garbled `seeds.yaml`).

#### Scenario: A verified actor slug resolves correctly

- **GIVEN** a `seeds.yaml` `apify` block with `instagram.trends_actor: "apify/instagram-scraper"`
- **WHEN** `resolveApifyActor(apify, "instagram", "trends_actor")` is called
- **THEN** it returns `"apify/instagram-scraper"`

#### Scenario: A not-yet-wired platform's placeholder resolves to null, not the literal string

- **GIVEN** a `seeds.yaml` `apify` block with `linkedin.trends_actor: "..."`
- **WHEN** `resolveApifyActor(apify, "linkedin", "trends_actor")` is called
- **THEN** it returns `null` — never the literal `"..."` string

### Requirement: youtube is an accepted platform value, with a verified Apify actor pair; Instagram's actor pair is also verified

`BrandInterviewAnswers.platform` SHALL accept `"youtube"` alongside `"facebook"`, `"instagram"`, and
`"linkedin"`. `buildSeeds` SHALL emit a verified (non-placeholder) Apify actor pair for `facebook`,
`instagram`, and `youtube`; `linkedin` SHALL remain the `"..."` placeholder (no actor verified for it
in this slice — never-fabricate). `buildBrandProfile` SHALL accept and store `channel.platform:
"youtube"` verbatim. The `/run-pipeline` new-Brand onboarding conductor's platform prompt SHALL accept
`facebook | instagram | linkedin | youtube` (case-insensitive), and the skeleton templates
(`brand-profile.yaml`, `seeds.yaml`) SHALL document all four platform values / the three wired actor
pairs the same way Facebook's has always been documented.

#### Scenario: buildSeeds returns the verified Instagram actor pair, not a placeholder

- **GIVEN** interview answers with `platform: "instagram"`
- **WHEN** `buildSeeds(answers)` is called
- **THEN** `seeds.apify.instagram` is `{ trends_actor: "apify/instagram-scraper", post_actor:
  "apify/instagram-post-scraper" }` — not the `"..."` placeholder

#### Scenario: buildSeeds returns the verified YouTube actor pair

- **GIVEN** interview answers with `platform: "youtube"`
- **WHEN** `buildSeeds(answers)` is called
- **THEN** `seeds.apify.youtube` is `{ trends_actor: "streamers/youtube-scraper", post_actor:
  "streamers/youtube-scraper" }`

#### Scenario: buildBrandProfile stores channel.platform: youtube verbatim

- **GIVEN** interview answers with `platform: "youtube"`
- **WHEN** `buildBrandProfile(answers)` is called
- **THEN** `profile.channel.platform` equals `"youtube"`

#### Scenario: The onboarding conductor's platform prompt accepts youtube

- **GIVEN** the `/run-pipeline` new-Brand interview's platform question
- **WHEN** the Operator answers `"youtube"` (any case)
- **THEN** the conductor accepts it and scaffolds `channel.platform: youtube` with the verified
  `apify.youtube` actor pair in the new Brand's `seeds.yaml` — no re-ask, no cap exceeded

#### Scenario: LinkedIn still carries the unverified placeholder end-to-end

- **GIVEN** interview answers with `platform: "linkedin"`
- **WHEN** `buildSeeds(answers)` is called
- **THEN** `seeds.apify.linkedin` is `{ trends_actor: "...", post_actor: "..." }` — never a fabricated
  slug

### Requirement: Instagram and YouTube Apify items are mapped defensively into the four Performance metrics

`mapInstagramItem` and `mapYoutubeItem` SHALL map one raw Apify dataset item (from
`apify/instagram-scraper`/`apify/instagram-post-scraper`, and `streamers/youtube-scraper`
respectively) into `{ url, postedAt, shares, comments, reactions, views, notes }`. `shares` SHALL
always be `0` for both platforms (neither publicly exposes a share count), recorded as a note rather
than silently omitted. Any other missing/invalid numeric field SHALL default to `0` and be recorded in
`notes` (data-handling rule 4 — "missing → 0, note it"). Neither function SHALL throw on `null`,
`undefined`, or non-object input.

#### Scenario: A non-video Instagram post maps views to 0 without an error (not "missing")

- **GIVEN** a real captured Instagram profile-post item of `type: "Sidecar"` (a carousel/image post,
  no `videoPlayCount`/`videoViewCount`)
- **WHEN** `mapInstagramItem` maps it
- **THEN** `reactions`/`comments` map from `likesCount`/`commentsCount`, `views` is `0`, and `shares`
  is `0` with a note explaining Instagram does not publicly expose a share count

#### Scenario: A video Instagram post maps views from videoPlayCount

- **GIVEN** a real captured Instagram item of `type: "Video"` with a populated `videoPlayCount`
- **WHEN** `mapInstagramItem` maps it
- **THEN** `views` equals that `videoPlayCount` value

#### Scenario: A YouTube video item maps reactions/comments/views from likes/commentsCount/viewCount

- **GIVEN** a real captured `streamers/youtube-scraper` item (from either a channel-video-list run or
  a single-video run)
- **WHEN** `mapYoutubeItem` maps it
- **THEN** `reactions` equals `likes`, `comments` equals `commentsCount`, `views` equals `viewCount`,
  and `shares` is `0` with a note explaining YouTube does not publicly expose a share count

#### Scenario: A garbled/empty item never throws and defaults every numeric field to 0, noted

- **GIVEN** `{}`, `null`, `undefined`, or a non-object value
- **WHEN** `mapInstagramItem` or `mapYoutubeItem` maps it
- **THEN** it does not throw; `shares`/`comments`/`reactions`/`views` are all `0`; `url`/`postedAt` are
  `null`; and `notes` records which fields were defaulted

### Requirement: trend-scout and performance-tracker document per-URL platform detection and the verified Instagram/YouTube actors

`trend-scout.md` SHALL document that peer sources can be on Facebook, Instagram, or YouTube; that each
source's platform is detected from its own URL (never assumed from the Format's or Channel's
platform); the verified `apify/instagram-scraper` and `streamers/youtube-scraper` actor invocations;
and the defensive field mapping (including the shares-always-0 note for both platforms). It SHALL
still require skipping (never scraping/fabricating) a source on a platform with no wired actor.
`performance-tracker.md` SHALL document the equivalent for a logged `post_url`, including the verified
`apify/instagram-post-scraper` actor and its input field's `username`-named-but-URL-valued quirk.

#### Scenario: trend-scout.md documents per-source platform detection and the verified actors

- **GIVEN** the `trend-scout` agent documentation
- **WHEN** its peer-scrape Process section is read
- **THEN** it names `apify/instagram-scraper` and `streamers/youtube-scraper`, states the platform is
  detected per source URL (never assumed from the Format's/Channel's own platform), and documents that
  a source on a not-yet-wired platform is reported as not-yet-scrapable and skipped

#### Scenario: performance-tracker.md documents per-post platform detection and the verified actors

- **GIVEN** the `performance-tracker` agent documentation
- **WHEN** its Process section is read
- **THEN** it names `apify/instagram-post-scraper` and `streamers/youtube-scraper`, states the
  platform is detected from `post_url` (never assumed from the Brand's Channel platform), and
  documents that a post on a not-yet-wired platform is reported as not-yet-trackable and skipped

### Requirement: templates/brand-skeleton/seeds.yaml documents the Instagram and YouTube actors the same way it documents Facebook's

The skeleton `seeds.yaml` template SHALL carry uncommented `apify.instagram` and `apify.youtube`
blocks with the verified actor slugs, in the same active (non-commented) form as its existing
`apify.facebook` block. `apify.linkedin` SHALL remain commented out as a roadmap placeholder (no
verified actor).

#### Scenario: The template's Instagram and YouTube blocks are active, not commented placeholders

- **GIVEN** `templates/brand-skeleton/seeds.yaml`
- **WHEN** its `apify` block is read
- **THEN** `instagram:` and `youtube:` are uncommented keys carrying `apify/instagram-scraper` /
  `apify/instagram-post-scraper` / `streamers/youtube-scraper`, and `linkedin:` is still commented out
