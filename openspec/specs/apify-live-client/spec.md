# apify-live-client Specification

## Purpose
TBD - created by archiving change issue-200-apify-client-scores-baselines. Update Purpose after archive.
## Requirements
### Requirement: The Apify bearer token travels only in the Authorization header, never a URL query string

`buildApifyRunSyncRequest` (`src/apify/live/request.ts`) SHALL place the Apify bearer token ONLY in an
`Authorization: Bearer <token>` header of the request it builds. The request URL (`apifyRunSyncUrl`)
SHALL NEVER carry the token, or any other query-string parameter, as part of its construction — this
prevents the token from ever reaching shell history (a pasted/typed request with the resolved value) or
a proxy/server access log that records full request URLs, neither of which is normally scrubbed.

#### Scenario: The token appears in the Authorization header

- **GIVEN** a platform, actor slug, post URL, and token
- **WHEN** `buildApifyRunSyncRequest` is called
- **THEN** the returned request's `headers.Authorization` equals `"Bearer <token>"`

#### Scenario: The URL never contains the token, or any query string at all

- **GIVEN** the same inputs
- **WHEN** `buildApifyRunSyncRequest` is called
- **THEN** the returned request's `url` contains no `?` character and does not contain the token value
  anywhere in its text

#### Scenario: The request body never contains the token either

- **GIVEN** the same inputs
- **WHEN** `buildApifyRunSyncRequest` is called
- **THEN** the returned request's `body` does not contain the token value

### Requirement: The live client resolves the actor's per-platform request shape, routed by the platform already chosen for the source URL

`buildApifyRunSyncRequest`/`apifyRunSyncInput` SHALL build a `startUrls: [{ url }]` body for `facebook`
and `youtube`, and a `username: [url]` body for `instagram` (its actor's input field is named
`username` even though the value is a post URL — verified live, issue #48). `apifyRunSyncUrl` SHALL
convert a `seeds.yaml`-shaped actor slug (`"owner/actor-name"`) into Apify's REST path segment
(`"owner~actor-name"`), replacing only the first `/`. `linkedin` has no verified actor input shape yet
— `apifyRunSyncInput` SHALL throw rather than fabricate one (data-handling rule 8). None of this
re-decides WHICH platform to use — that remains `detectPlatformFromUrl`'s job (issue #48), called by
`trackPerformanceCommand` before `LiveApifyClient.scrapePost` is ever reached with a platform.

#### Scenario: Facebook and YouTube build a startUrls body

- **GIVEN** `platform: "facebook"` or `platform: "youtube"` and a post URL
- **WHEN** `apifyRunSyncInput` is called
- **THEN** it returns `{ startUrls: [{ url: postUrl }] }`

#### Scenario: Instagram builds a username-named body carrying the post URL

- **GIVEN** `platform: "instagram"` and a post URL
- **WHEN** `apifyRunSyncInput` is called
- **THEN** it returns `{ username: [postUrl] }`

#### Scenario: linkedin throws rather than fabricate an input shape

- **GIVEN** `platform: "linkedin"`
- **WHEN** `apifyRunSyncInput` is called
- **THEN** it throws, naming linkedin, rather than returning a guessed shape

#### Scenario: An actor slug's first slash becomes the URL path tilde

- **GIVEN** the actor slug `"apify/facebook-post-scraper"`
- **WHEN** `apifyRunSyncUrl` is called
- **THEN** it returns `"https://api.apify.com/v2/acts/apify~facebook-post-scraper/run-sync-get-dataset-items"`

### Requirement: The live client's response parsing never fabricates a score from a garbled or empty response

`parseRunSyncDatasetItems` (`src/apify/live/response.ts`) SHALL return the first item of a non-empty
JSON array response body, and `null` for an empty array (a routine "the actor found nothing", never an
error — data-handling rule 8). It SHALL throw for a response body that is not valid JSON, or valid JSON
that is not an array — a genuinely garbled/error response, distinguishable from "no data" so a caller
never conflates the two.

#### Scenario: A non-empty array yields its first item

- **GIVEN** a response body `[{"likes":40},{"likes":999}]`
- **WHEN** `parseRunSyncDatasetItems` is called
- **THEN** it returns `{"likes":40}`

#### Scenario: An empty array yields null, not an error

- **GIVEN** a response body `[]`
- **WHEN** `parseRunSyncDatasetItems` is called
- **THEN** it returns `null`

#### Scenario: Invalid JSON or a non-array value throws rather than silently returning null

- **GIVEN** a response body that is not valid JSON, or is valid JSON but not an array (e.g. an error
  object)
- **WHEN** `parseRunSyncDatasetItems` is called
- **THEN** it throws

### Requirement: The live client resolves APIFY_API_TOKEN from the environment, an already-set shell/CI value always winning over .env

`resolveApifyToken` (`src/apify/live/token.ts`) SHALL resolve `APIFY_API_TOKEN` from a pre-resolved env
(when given) or the effective `.env`-merged environment (`src/media-host/live/env.ts`'s
`loadEffectiveEnv`, reused rather than duplicated) — an already-set base/shell/CI env value SHALL always
win over a value from `.env`. A missing or blank/whitespace-only value SHALL resolve to `null`, never a
fabricated or empty-string token.

#### Scenario: A directly-given env value resolves, trimmed

- **GIVEN** `options.env` carrying `APIFY_API_TOKEN: "  a-token  "`
- **WHEN** `resolveApifyToken` is called
- **THEN** it returns `"a-token"`

#### Scenario: A missing token resolves to null, never fabricated

- **GIVEN** an env with no `APIFY_API_TOKEN` key at all
- **WHEN** `resolveApifyToken` is called
- **THEN** it returns `null`

#### Scenario: An already-set base env value wins over a value in .env

- **GIVEN** a `.env` file setting `APIFY_API_TOKEN` to one value, and `options.base` already carrying a
  DIFFERENT value for the same key
- **WHEN** `resolveApifyToken` is called with that `.env` file and `base`
- **THEN** it returns the `base` value, never the `.env` file's

### Requirement: LiveApifyClient implements PerformanceScrapePort against an injectable HTTP transport, never a real network call in a test

`LiveApifyClient` (`src/apify/live/client.ts`) SHALL implement `PerformanceScrapePort.scrapePost` by:
resolving the token (throwing `ApifyTokenMissingError`, and calling its `fetchImpl` ZERO times, when
none resolves); building the request via `buildApifyRunSyncRequest`; calling its injectable `fetchImpl`
(default: the real global `fetch`); throwing `ApifyRequestError` on a non-ok HTTP response; and parsing
the response body via `parseRunSyncDatasetItems`. Every test of this class SHALL inject a fake
`fetchImpl` — the real global `fetch` default SHALL never be exercised by any test in this repository.

#### Scenario: A successful scrape returns the first dataset item, with the token only in the header

- **GIVEN** a `LiveApifyClient` constructed with a token and a fake `fetchImpl` that records the call
  and returns a non-empty dataset array
- **WHEN** `scrapePost` is called
- **THEN** it returns that array's first item
- **AND** the recorded call's `Authorization` header carries the token as a Bearer token
- **AND** the recorded call's URL contains neither the token value nor a `?` query string

#### Scenario: No resolvable token makes zero requests

- **GIVEN** a `LiveApifyClient` constructed with an empty env and no token option
- **WHEN** `scrapePost` is called
- **THEN** it rejects with `ApifyTokenMissingError`
- **AND** the injected `fetchImpl` was never called

#### Scenario: An empty dataset returns null, never fabricated

- **GIVEN** a fake `fetchImpl` returning an empty array body
- **WHEN** `scrapePost` is called
- **THEN** it resolves to `null`

#### Scenario: A non-ok HTTP response throws ApifyRequestError

- **GIVEN** a fake `fetchImpl` returning `ok: false`
- **WHEN** `scrapePost` is called
- **THEN** it rejects with `ApifyRequestError`

#### Scenario: An explicit token option is used without ever consulting env resolution

- **GIVEN** a `LiveApifyClient` constructed with BOTH an explicit `token` option and a DIFFERENT
  `APIFY_API_TOKEN` in its `env` option
- **WHEN** `scrapePost` is called
- **THEN** the request's `Authorization` header carries the explicitly-given token, never the env one

