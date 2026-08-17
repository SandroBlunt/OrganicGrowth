## MODIFIED Requirements

### Requirement: The build is hermetic — every test drives Apify through a fake port, never the live API

Every test SHALL drive Apify through a fake, never the live API: a fake `PerformanceScrapePort` (`src/commands/track-performance-port.ts`) in `src/performance/**`/`src/commands/track-performance*.test.ts`, or an injected fake HTTP transport (`ApifyFetch`) in the live client's own `src/apify/live/**` tests — no test SHALL make a network call, spend an Apify credit, or depend on a real `APIFY_API_TOKEN` value. The default runtime port (`DEFAULT_PERFORMANCE_SCRAPE_PORT`) is now a REAL live Apify client (`LiveApifyClient`, `src/apify/live/client.ts`, issue #200) — no longer a stub that always returns `null` — but it SHALL still NEVER be exercised by a test: every `trackPerformanceCommand` call in the suite passes an explicit fake `apify` option, so the live client's own default `fetchImpl` (the real global `fetch`) is never reached from `npm test`.

#### Scenario: The full test suite passes with zero live Apify calls

- **GIVEN** the full `npm test` run
- **THEN** every `trackPerformanceCommand` invocation in the suite is given an explicit fake
  `PerformanceScrapePort`
- **AND** every `LiveApifyClient` test in `src/apify/live/client.test.ts` injects a fake `fetchImpl`,
  never the real global `fetch`
- **AND** no test reads a real `APIFY_API_TOKEN` or performs a network request

#### Scenario: The live client is real, but its default fetch transport is unreached by the suite

- **GIVEN** `track-performance.ts`'s `DEFAULT_PERFORMANCE_SCRAPE_PORT`, now `new LiveApifyClient()`
- **WHEN** the full `npm test` suite runs
- **THEN** no test exercises this default instance's `scrapePost` — every test explicitly overrides
  `options.apify` with a fake port instead
