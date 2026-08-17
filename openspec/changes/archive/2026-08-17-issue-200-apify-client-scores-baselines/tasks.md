## 1. Pure request builder — the security fix itself (test-first)

- [x] 1.1 Write failing tests (`request.test.ts`) for `actorUrlSegment` (slash → tilde, only the first
  one), `apifyRunSyncUrl` (never contains `?` or `token`), `apifyRunSyncInput` (per-platform body
  shapes; linkedin throws), and `buildApifyRunSyncRequest` — the security-critical proof: the token is
  in the `Authorization` header, the URL never contains the token value or a query string, the body
  never contains the token, per-platform routing is correct.
- [x] 1.2 Implement `src/apify/live/request.ts` — pure, no I/O.

## 2. Response parsing (test-first)

- [x] 2.1 Write failing tests (`response.test.ts`) for `parseRunSyncDatasetItems`: first item of a
  non-empty array; `null` for an empty array (never fabricated); throws for invalid JSON; throws for a
  non-array JSON value.
- [x] 2.2 Implement `src/apify/live/response.ts` — pure, no I/O.

## 3. Token resolution from env (test-first)

- [x] 3.1 Write failing tests (`token.test.ts`) for `resolveApifyToken`: null when absent; returns a
  trimmed value from a directly-given env; null for blank/whitespace; reads a real temp `.env` file
  (hermetic, isolated from the real shell env via an explicit `base`); an already-set base env value
  wins over `.env`; null when the file is missing and no base value exists.
- [x] 3.2 Implement `src/apify/live/token.ts`, reusing `src/media-host/live/env.ts`'s
  `loadEffectiveEnv` rather than duplicating it.

## 4. The live client (test-first)

- [x] 4.1 Write failing tests (`client.test.ts`) for `LiveApifyClient.scrapePost`, driven entirely
  through an injected fake `fetchImpl` (never the real global `fetch`): sends the token only in the
  Authorization header for a real end-to-end call; resolves the token from an injected env; throws
  `ApifyTokenMissingError` with zero requests sent when no token resolves; returns `null` for an empty
  dataset; throws `ApifyRequestError` on a non-ok response; routes each platform (facebook/instagram/
  youtube) to its own actor URL and input body; an explicit `token` option wins over env resolution.
- [x] 4.2 Implement `src/apify/live/client.ts` implementing `PerformanceScrapePort`.

## 5. Wire the live client as the default runtime port

- [x] 5.1 Replace `track-performance.ts`'s always-`null` `DEFAULT_PERFORMANCE_SCRAPE_PORT` stub with
  `new LiveApifyClient()`. Confirm every existing test still passes an explicit fake `apify` option
  (grepped — all 24 calls in `track-performance.test.ts` plus the 1 in
  `two-recipes-end-to-end.test.ts` already do), so the live default is never reached by `npm test`.
- [x] 5.2 Update the module docstring (no longer "deferred"; the live client is real and hermetic tests
  still fake it).

## 6. The manual live-verification smoke script

- [x] 6.1 Write `src/apify/live/smoke.ts` (not a `*.test.ts` file, never run by `npm test`): takes a
  Facebook post URL argument, makes ONE real `scrapePost` call, prints the raw item next to
  `mapFacebookItem`'s output, and prints the exact next-step runbook (post the pair on issue #200, then
  run the full batch, then quote the Fit/Performance pair).
- [x] 6.2 Add the `apify-smoke` npm script (`package.json`), mirroring `media-host-smoke`/
  `space-driver-smoke`.

## 7. Docs — retire the query-string curl examples, state the new sanctioned path

- [x] 7.1 Update `.claude/commands/track-performance.md`: the live client is real and is the sanctioned
  way to pull real metrics; the token travels in a header, never a URL query string.
- [x] 7.2 Update `.claude/agents/performance-tracker.md`: retire the `?token=` curl examples in favor
  of `-H "Authorization: Bearer ${APIFY_API_TOKEN}"`; note `npm run track-performance <brand>` is now
  the sanctioned real-metrics path; add the header-not-query-string guardrail; point at
  `npm run apify-smoke` for the Facebook-mapping verification step.
- [x] 7.3 Update `src/commands/track-performance.docs-test.ts` to pin the new true facts (the live
  client exists at `src/apify/live/client.ts`; the token travels in a header) instead of the retired
  "deferred" claim.

## 8. OpenSpec

- [x] 8.1 Author `proposal.md`, this `tasks.md`, and spec deltas (`specs/apify-live-client/spec.md`
  ADDED; `specs/performance-tracking/spec.md` MODIFIED).
- [x] 8.2 `openspec validate issue-200-apify-client-scores-baselines --strict` green.

## 9. Self-review + handoff

- [x] 9.1 Full suite green (`npm test`), `openspec validate --all --strict` green.
- [x] 9.2 Simplify pass; map every issue acceptance criterion to its proving test (or, for the 4 that
  require a live scrape, to the Operator runbook) in `handoff.md`'s Build Report.

## 10. Deliberately NOT done by this build (the Operator's own actions — see handoff.md's runbook)

- [ ] 10.1 Run `npm run apify-smoke <a real Straw Motion Facebook post URL>`; verify `mapFacebookItem`
  against the raw response; post the raw/normalized pair on issue #200; correct the mapping if needed.
- [ ] 10.2 Run `npm run track-performance straw-motion` for real — scrapes and scores all 7 posted
  Assets, computes the Straw Motion Channel baseline (`updated_at` no longer `null`).
- [ ] 10.3 Run `npm run report straw-motion`; quote one Idea's Fit Score next to its Performance Score
  as a comment on issue #200.
