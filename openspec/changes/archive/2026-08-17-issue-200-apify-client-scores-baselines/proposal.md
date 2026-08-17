## Why

Issue #200 (parent #195, blocked by #197 — merged). Across both Brands there are 54 Assets, 7 with a
`post_url`, and **0 with a Performance Score**. Both Channel baselines are still `updated_at: null`.
Because nothing has ever been measured, the Fit Score's Relevance term — worth about half the score,
"how much does this resemble what worked before" — falls back to a neutral `0.5` on every Idea; 31
Ideas record exactly that in their own `fit_basis`. Ranking runs on novelty and voice-fit alone, with no
memory of what worked.

`PerformanceScrapePort` (issue #84) has existed since the per-Asset grain landed, but its runtime
default has always been a stub that returns `null` and is never exercised — the live Apify HTTP call
was explicitly deferred. Meanwhile `.claude/agents/performance-tracker.md`'s own hand-driven `curl`
fallback puts the Apify bearer token in the URL as a `?token=...` query string — a real leak: a token in
a URL reaches shell history (a pasted/typed command with the resolved value) and any proxy or server
access log that records full request URLs, neither of which anybody thinks to scrub.

This closes the loop on what already exists, before any schema work (a database full of empty scores
solves nothing): write the live Apify client behind `PerformanceScrapePort`, fix the token leak, then
scrape and score the 7 posted Assets and compute each Channel's baseline from the results.

**Scope split (the issue's own instruction):** this slice builds and tests the client entirely
hermetically — no test may make a network call or spend an Apify credit, that is an explicit acceptance
criterion. Verifying the Facebook mapping against a real scrape, scraping the 7 posted Assets for real,
and quoting a prediction/outcome pair are real-world actions that spend real Apify credits — the
`developer` build agent never spends a credit, so those are the Operator's own actions, documented here
as a precise runbook (see the Build Report / `handoff.md`) rather than faked into looking "done".

## What Changes

- **A live Apify client** (`src/apify/live/`) implementing `PerformanceScrapePort` for real:
  - `request.ts` — a PURE request builder. The Apify bearer token is placed ONLY in an
    `Authorization: Bearer <token>` header; the request URL (`apifyRunSyncUrl`) never carries a token or
    any other query-string parameter. This is the actual security fix — proven by a test that asserts on
    the concrete request the client builds (URL has no `?`, no `token` substring, no token value; the
    header carries it), not merely that some header exists somewhere.
  - `token.ts` — resolves `APIFY_API_TOKEN` from `.env`/the shell, reusing
    `src/media-host/live/env.ts`'s already-established, dependency-free `.env` loader (the
    read-secrets-from-env pattern issue #197 settled as this repo's convention) rather than duplicating
    it. An already-set shell/CI env var always wins over a stale `.env` copy.
  - `response.ts` — parses the `run-sync-get-dataset-items` response body into the first dataset item,
    or `null` for an empty array (a routine "no data", never fabricated); throws for genuinely garbled
    JSON so that outcome is distinguishable from "no data".
  - `client.ts` — `LiveApifyClient`, a thin class (mirrors `LiveMediaHost`'s shape) wiring the above
    together, with an injectable `fetchImpl` (default: the real global `fetch`) so its OWN tests prove
    request construction against a fake transport, never a real network call.
  - `smoke.ts` — a manual, one-off script (mirrors `media-host/live/smoke.ts`'s and
    `space-driver/live/smoke.ts`'s shape; never run by `npm test`) that makes exactly ONE real Apify call
    against a Facebook post URL the Operator supplies, and prints the raw item next to what
    `mapFacebookItem` makes of it — the tool for the Operator's Facebook-mapping verification step.
- **The actor is chosen per source URL's own platform**, unchanged — this slice reuses the existing
  `detectPlatformFromUrl`/`resolveApifyActor` (issue #48) exactly as `track-performance.ts` already does;
  no change to that logic.
- **`track-performance.ts`'s default port is now the live client**, not the always-`null` stub. Every
  existing and new test still injects an explicit fake `PerformanceScrapePort` (already true of every
  test in this repository), so `npm test` remains fully hermetic — the live client's default `fetchImpl`
  (the real `fetch`) is never reached from any test.
- **Docs updated to match**: `.claude/commands/track-performance.md` and
  `.claude/agents/performance-tracker.md` now state the live client is the sanctioned way to pull real
  metrics, and the doc's own `curl` fallback examples switch from `?token=` to
  `-H "Authorization: Bearer ..."`. `track-performance.docs-test.ts` is updated to pin the new, true
  facts (the live client exists; the token travels in a header) rather than the retired "deferred"
  claim.

## Non-Goals (explicitly out of scope for this slice)

- **A live scrape of any kind, from this build.** The `developer` agent has no network access to Apify
  and never spends a credit — every test drives the client through a fake `fetchImpl`/injected token.
- **Correcting `mapFacebookItem`'s field mapping**, if the live verification turns up a mismatch. This
  build cannot perform that verification (see above); a correction, if any, is the Operator's own
  follow-up once they've run the runbook.
- **Scraping/scoring the 7 posted Assets and computing the Straw Motion Channel baseline for real.**
  Precisely the Operator's action this slice's Build Report hands off as a runbook.
- **A per-Channel baseline (ADR-0019's tracked-Channel future epic).** Out of scope; unchanged — there
  remains exactly one Channel baseline per Brand's ledger.
- **Any change to the Performance Score formula, maturity rule, or selection logic** (`src/performance/`)
  — all untouched; this slice is purely "wire a real Apify client behind the existing port".

## Capabilities

### Added Capabilities

- `apify-live-client`: the live Apify HTTP client behind `PerformanceScrapePort` — pure request
  building (header-only auth), response parsing, token resolution, and the thin adapter class.

### Modified Capabilities

- `performance-tracking`: the "hermetic build" requirement is updated — the default runtime port is no
  longer a deferred stub; it is now the real live client, and hermeticity is upheld because every test
  still injects a fake port (never relying on the default).

## Impact

- **New code:** `src/apify/live/request.ts` (+`.test.ts`), `src/apify/live/response.ts` (+`.test.ts`),
  `src/apify/live/token.ts` (+`.test.ts`), `src/apify/live/client.ts` (+`.test.ts`),
  `src/apify/live/smoke.ts` (manual only, never run by `npm test`).
- **Modified code:** `src/commands/track-performance.ts` (default port wiring + docstring),
  `package.json` (new `apify-smoke` script), `.claude/commands/track-performance.md`,
  `.claude/agents/performance-tracker.md`, `src/commands/track-performance.docs-test.ts`.
- **Hermetic, no live Apify calls anywhere in `npm test`.** Every test in `src/apify/live/**` injects a
  fake `fetchImpl`/token; every test in `src/commands/track-performance*.test.ts` and
  `src/producer/two-recipes-end-to-end.test.ts` injects an explicit fake `PerformanceScrapePort` (already
  true before this slice — unchanged).
- **Always-rules upheld:** public-metrics-only and relative-not-absolute are untouched (no change to
  `src/performance/score.ts`/`metrics.ts`); explicit-attribution is untouched (selection/writing still
  keyed `(Idea, Recipe)`, `src/performance/selection.ts` unchanged); ledger-as-source-of-truth is
  untouched (`AssetStore.writeAsset`/`writeBaseline` unchanged) — this slice only replaces WHAT scrapes,
  never WHERE the result is written or WHAT it means.
