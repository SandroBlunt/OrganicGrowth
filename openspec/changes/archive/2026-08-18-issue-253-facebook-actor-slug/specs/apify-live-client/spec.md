## ADDED Requirements

### Requirement: The Facebook smoke script distinguishes an actor/request failure from a routine no-data result

`describeActorRequestFailure(err, actorSlug)` (`src/apify/live/smoke-diagnose.ts`) SHALL return a diagnostic message when `err` is an `ApifyRequestError` — naming the actor slug, the HTTP status and status text, and a slash-to-tilde-converted `curl` command the Operator can run to independently verify the slug — and SHALL return `null` for any other error shape. Its message SHALL NEVER read as, or be confusable with, "no data for this URL" — an actor/request rejection (e.g. a 404 for a dead or wrong actor slug) is a fundamentally different failure than an actor that ran successfully and simply found nothing. `src/apify/live/smoke.ts` SHALL call this function from its own catch block around `LiveApifyClient.scrapePost`, printing its message and exiting distinctly when non-null, and re-throwing (falling through to its existing generic top-level error handler) when null.

#### Scenario: An ApifyRequestError produces a message naming the slug, status, and a verification command

- **GIVEN** an `ApifyRequestError` with `status: 404` and `statusText: "Not Found"`, and the actor slug
  `"apify/facebook-post-scraper"` (the real dead slug the #253 investigation found)
- **WHEN** `describeActorRequestFailure(err, "apify/facebook-post-scraper")` is called
- **THEN** the returned message is non-null
- **AND** it names the actor slug, `404`, and `Not Found`
- **AND** it does NOT read as, or match, a "no data for this URL" message

#### Scenario: The verification command converts the slug's slash to a tilde

- **GIVEN** the same `ApifyRequestError` and actor slug as above
- **WHEN** `describeActorRequestFailure` is called
- **THEN** the returned message contains `apify~facebook-post-scraper` (the Apify REST path form)

#### Scenario: A non-ApifyRequestError returns null, so the caller falls back to generic handling

- **GIVEN** an error that is NOT an `ApifyRequestError` (e.g. `ApifyTokenMissingError`, a plain `Error`,
  or a non-Error thrown value)
- **WHEN** `describeActorRequestFailure(err, actorSlug)` is called
- **THEN** it returns `null`
