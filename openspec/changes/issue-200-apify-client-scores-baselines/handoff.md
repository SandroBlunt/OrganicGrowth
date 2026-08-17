# Slice Handoff — issue #200: real Apify client, the 7 posted Assets scored, each Channel's baseline set

Bidirectional document: the `developer` Build Report below, then `qa`'s Verdict appended beneath it.
Nothing here is ever overwritten; a retry round appends a new `Round-N Build` block.

## Build Report (Round 1)

### What changed

`PerformanceScrapePort` (issue #84) has existed since the per-Asset grain landed, but its runtime
default was always a stub returning `null`, never exercised. This slice writes the REAL live Apify
client behind it, fixes the token-in-URL leak the agent's own hand-driven `curl` fallback carried, and
hands the Operator a precise runbook for the four live-only acceptance criteria this build cannot
perform itself (no network access, no credits — CLAUDE.md).

1. **A live Apify client** (`src/apify/live/`), built as pure/injectable pieces wired by a thin class
   (mirrors `LiveMediaHost`'s shape):
   - `request.ts` — the security fix itself. `buildApifyRunSyncRequest` places the Apify bearer token
     ONLY in an `Authorization: Bearer <token>` header; `apifyRunSyncUrl` never receives it or any other
     query-string parameter. Also builds the per-platform actor input body (`startUrls` for
     facebook/youtube, the oddly-named `username` field for instagram — verified live, issue #48) and
     converts a `seeds.yaml` actor slug (`"owner/actor"`) into Apify's REST path segment
     (`"owner~actor"`).
   - `response.ts` — `parseRunSyncDatasetItems`: first item of a non-empty dataset array, `null` for an
     empty one (never fabricated), throws for genuinely garbled JSON so that's distinguishable from "no
     data".
   - `token.ts` — `resolveApifyToken` reuses `src/media-host/live/env.ts`'s already-established,
     dependency-free `.env` loader (the read-secrets-from-env pattern issue #197 settled as this repo's
     convention) rather than duplicating it. An already-set shell/CI env value always wins over `.env`.
   - `client.ts` — `LiveApifyClient implements PerformanceScrapePort`, with an injectable `fetchImpl`
     (default: the real global `fetch`) so its own tests prove request construction against a fake
     transport, never a real network call. Throws `ApifyTokenMissingError` (zero requests sent) when no
     token resolves, `ApifyRequestError` on a non-ok HTTP response — both already handled gracefully by
     `trackPerformanceCommand`'s existing try/catch (reported as SKIPPED, never crashes the run).
   - `smoke.ts` — a manual, one-off script (mirrors `media-host/live/smoke.ts`'s shape; not a
     `*.test.ts` file, imported by nothing, never run by `npm test`) that makes exactly ONE real Apify
     call against a Facebook post URL the Operator supplies, and prints the raw item next to what
     `mapFacebookItem` makes of it — the tool for the Facebook-mapping verification step, and the
     Operator runbook below.
2. **The actor is chosen per source URL's own platform, unchanged.** This slice reuses the existing
   `detectPlatformFromUrl`/`resolveApifyActor` (issue #48) exactly as `track-performance.ts` already
   did — no change to that logic; `LiveApifyClient.scrapePost` only ever receives the platform/actor
   `trackPerformanceCommand` already resolved per Asset's own `post_url`.
3. **`track-performance.ts`'s default port is now `new LiveApifyClient()`**, not the always-`null`
   stub. Verified every existing test still injects an explicit fake `apify` option (grep — all 24
   calls in `track-performance.test.ts` plus the 1 in `two-recipes-end-to-end.test.ts` already did, and
   still do), so the live default's real `fetchImpl` is never reached from `npm test`.
4. **Docs updated to match reality**: `.claude/commands/track-performance.md` and
   `.claude/agents/performance-tracker.md` now state the live client is real and is the sanctioned way
   to pull real metrics; the doc's own `curl` fallback examples switch from `?token=${APIFY_API_TOKEN}`
   in the URL to `-H "Authorization: Bearer ${APIFY_API_TOKEN}"`. `track-performance.docs-test.ts` is
   updated to pin the new, true facts (the live client exists at `src/apify/live/client.ts`; the token
   travels in a header) instead of the retired "the live Apify HTTP call is deferred" claim.
5. **`package.json`** gains an `apify-smoke` script, mirroring `media-host-smoke`/`space-driver-smoke`.

**What this build deliberately did NOT do** (spends real Apify credits — the Operator's own action, see
the runbook below): verify the Facebook mapping against a live scrape, scrape/score the 7 posted
Assets, compute the Straw Motion Channel baseline for real, or quote a Fit/Performance pair on the
issue.

### Files touched

New (all under `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-200-apify-client-scores-baselines/`):
- `src/apify/live/request.ts` + `request.test.ts`
- `src/apify/live/response.ts` + `response.test.ts`
- `src/apify/live/token.ts` + `token.test.ts`
- `src/apify/live/client.ts` + `client.test.ts`
- `src/apify/live/smoke.ts` (manual only, never run by `npm test`)
- `openspec/changes/issue-200-apify-client-scores-baselines/` (proposal.md, tasks.md,
  `specs/apify-live-client/spec.md`, `specs/performance-tracking/spec.md`, this file)

Modified:
- `src/commands/track-performance.ts` — default port wiring (`LiveApifyClient` replaces the always-null
  stub) + module docstring update
- `src/commands/track-performance.docs-test.ts` — pins the new true facts instead of "deferred"
- `.claude/commands/track-performance.md` — live client is real, header-not-query-string documented
- `.claude/agents/performance-tracker.md` — curl examples switched to header auth; live client is now
  the sanctioned real-metrics path
- `package.json` — new `apify-smoke` script

Untouched (verified): `src/apify/platform.ts`, `src/apify/normalize-metrics.ts`,
`src/performance/score.ts`/`metrics.ts`/`maturity.ts`/`selection.ts`,
`src/commands/track-performance-port.ts`, `src/ledger/ledger.ts`, `src/asset/store.ts` — this slice only
replaces WHAT scrapes (the port's implementation), never WHERE the result is written, WHAT platform is
chosen, or WHAT the score means.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-200-apify-client-scores-baselines
npx tsc -p tsconfig.json --noEmit          # typecheck
npm test                                    # full suite (hermetic — no live Apify calls)
npm run test:docs                           # docs-conformance suite alone
npx openspec validate issue-200-apify-client-scores-baselines --strict
npx openspec validate --all --strict        # whole-repo sanity
```

Results: `npm test` → **2881 tests / 729 suites / 0 fail** (baseline on `main` at `50805d0` was
2846/722/0 — +35 tests / +7 suites: 34 tests / 7 suites from the four new `src/apify/live/*.test.ts`
files, +1 test for the new docs-test assertion on the header-not-query-string doc fact). `npm run
test:docs` → **280 tests / 75 suites / 0 fail**. `openspec validate issue-200-apify-client-scores-baselines
--strict` → valid. `openspec validate --all --strict` → **48/48 pass** (47 pre-existing + this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #200) | Status | Proof |
|---|---|---|---|
| 1 | A live Apify client implements `PerformanceScrapePort` and is used by `npm run track-performance` in place of hand-driven scraping | **Done** | `LiveApifyClient implements PerformanceScrapePort` (`src/apify/live/client.ts`); `track-performance.ts`'s `DEFAULT_PERFORMANCE_SCRAPE_PORT = new LiveApifyClient()`; `client.test.ts` (9 tests) proves `scrapePost` end-to-end against a fake `fetchImpl`. |
| 2 | The Apify token is sent in a header, never a URL query string | **Done** | `request.test.ts`'s "the security-critical proof" describe block (5 tests): Authorization header carries `Bearer <token>`; URL contains no `?`, no `token` substring, no token value; body carries no token value either. `client.test.ts`'s first test proves the SAME thing end-to-end through the real client, not just the pure builder. |
| 3 | The actor is chosen per source URL's own platform, as the existing platform detection already does | **Done (unchanged, reused)** | `track-performance.ts` still calls `detectPlatformFromUrl`/`resolveApifyActor` before ever calling `apify.scrapePost` — zero lines changed in `src/apify/platform.ts`; `client.test.ts`'s per-platform routing tests confirm `LiveApifyClient` only ever builds the request for the platform/actor it's given, never re-decides it. |
| 4 | The Facebook metric mapping is verified against one live scrape — the primary Channel is not the one platform whose mapping was never checked — and any correction is applied. The verification is posted on this issue | **Operator-only, not done by this build** | See "Known limits" and the runbook below — this build has no network access to Apify (CLAUDE.md) and cannot perform a live scrape. `src/apify/live/smoke.ts` is the tool built for this step. |
| 5 | All 7 posted Assets are scraped and their raw metrics stored | **Operator-only, not done by this build** | Same reason. `npm run track-performance straw-motion` (now backed by the real live client from AC1) is the exact command that does this for real — see the runbook. |
| 6 | Each Channel's baseline is computed from those results; `updated_at` is no longer null | **Operator-only, not done by this build** | Same command call computes it — `trackPerformanceCommand`'s existing (unchanged) baseline-recompute step, now fed real metrics instead of fake ones. |
| 7 | Each of the 7 Assets carries a Performance Score relative to its own Channel's baseline | **Operator-only, not done by this build** | Same run — `computePerformanceScore` (unchanged) is exercised with real inputs once AC5/AC6 happen. |
| 8 | At least one Asset shows a Fit Score prediction and a Performance outcome together, and the pair is quoted on this issue | **Operator-only, not done by this build** | `npm run report straw-motion` already surfaces `fit_score` next to `best_performance_score` per Idea (unchanged, pre-existing `/report` behavior) — the Operator quotes one row after AC5/AC6/AC7 land for real. |
| 9 | The client is exercised in tests through the port's fake; no test spends Apify credits | **Done** | Every `trackPerformanceCommand` test injects an explicit fake `PerformanceScrapePort` (unchanged from before this slice — confirmed by grep, 25 call sites). `LiveApifyClient`'s OWN tests (`client.test.ts`) inject a fake `fetchImpl`; `globalThis.fetch` appears in exactly one place in `src/apify/**` (`client.ts`'s default), never called by any test. |

Acceptance criteria 4–8 are, by the issue's own explicit split, the Operator's live actions — this build
provides everything needed to perform them in one clean pass (the client, the smoke-verification tool,
and the pre-existing report command), documented precisely below.

### Fakes / fixtures used

- **The Magnific fake** — N/A. This slice touches no `space-driver`/Magnific code at all; the
  `developer` build agent was never given the `magnific` MCP tools and never reached for them (`grep -rn
  "mcp__magnific" src` → zero hits, unchanged by this slice).
- **`PerformanceScrapePort` fakes** (`src/commands/track-performance.test.ts`'s `fakePort`,
  `src/producer/two-recipes-end-to-end.test.ts`'s inline fake) — pre-existing, unmodified by this slice;
  every `trackPerformanceCommand` test still injects one. **Flag: this is the sanctioned hermetic
  boundary for the orchestration shell; no live Apify call reachable through it.**
- **`ApifyFetch` fakes** (`client.test.ts`'s `fakeFetch` helper) — hand-rolled, in-memory, records every
  call and returns a canned response; NEVER the real global `fetch`. **Flag: this is the sanctioned
  hermetic boundary for the live client's OWN request-construction tests — no network, no credentials,
  no Apify account needed to run this suite.**
- **Temp `.env` files** (`token.test.ts`) — real local temp directories/files (`mkdtemp`), read once and
  deleted in a `finally`; no network involved, mirrors `src/media-host/live/env.test.ts`'s own pattern.
- **Fake token values** — every token literal in test source is prefixed `test-fake-apify-token-` and
  built by string concatenation (never one contiguous literal), matching
  `src/secrets-scan/scanner.test.ts`'s own established convention; confirmed the credential scanner
  (`src/secrets-scan/`, part of `npm test`) passes with zero findings against every new file.

None of the above ever calls a live Apify HTTP endpoint. This build agent does not have network access
to Apify and never reached for one.

### The two-part live picture, stated plainly

**(a) Covered by the fake/injected harness (this build, `npm test`):** request construction (header not
query string, per-platform routing, actor-slug-to-URL conversion), response parsing (first item, empty
→ null, garbled → throw), token resolution (env, `.env` file, precedence), the full `LiveApifyClient`
pipeline end-to-end against a fake HTTP transport (token-missing refusal with zero requests sent, a
non-ok response, an empty dataset, an explicit token overriding env). Every one of these tests is
deterministic, offline, and spends nothing.

**(b) The Operator's own manual live steps (never in the suite) — the exact runbook:**

1. Ensure `.env` carries a real `APIFY_API_TOKEN` (copy `.env.example` if you haven't already).
2. **Verify the Facebook mapping (AC4).** Pick one of Straw Motion's 7 posted Assets' URLs, e.g.:
   ```
   npx tsx src/apify/live/smoke.ts \
     "https://www.facebook.com/permalink.php?story_fbid=pfbid0VMYBWhDbQHhQfyckAVFPwutpKJEM38fNySUqpNFXU4WZbWnENWHMjfdw1wACunR6l&id=61591885769033"
   ```
   (or `npm run apify-smoke -- "<url>"`). This spends ONE real Apify credit. It prints the RAW dataset
   item next to what `mapFacebookItem` makes of it. **What a PASS looks like:** the raw item's
   `likes`/`comments`/`shares`/`viewsCount`/`time` fields are present and line up with the normalized
   output shown (no field is silently defaulted to 0 that the raw item clearly carries under a
   different name). **What a FAIL looks like:** a `notes` entry flags a defaulted field that the raw
   item DOES carry, just under a different key — that's a real mapping bug; fix
   `mapFacebookItem` in `src/apify/normalize-metrics.ts` before proceeding, then re-run this script to
   confirm the fix. Either way, **post the raw/normalized JSON pair as a comment on issue #200** — that
   IS the required verification.
3. **Scrape and score all 7 posted Assets, compute the baseline (AC5/AC6/AC7).**
   ```
   npm run track-performance straw-motion
   ```
   This spends up to 7 real Apify credits (one per posted Asset — all 7 are Straw Motion/Facebook/
   `news-carousel`, posted 2026-08-04 through 2026-08-10, so all are already 7+ days old as of today and
   will land straight at `scored`, not `tracking`). **What a PASS looks like:** the printed report shows
   7 non-SKIPPED lines, each with a `metrics=`/`score=` — and `data/brands/straw-motion/ledger.json`'s
   `baseline.updated_at` is no longer `null`. **What a FAIL looks like:** any SKIPPED line for a Facebook
   Asset with a real `post_url` (check the printed reason — a still-missing/blocked actor, or a scrape
   error — and fix per the guardrails already documented in `.claude/agents/performance-tracker.md`),
   or a `baseline.updated_at` that stays `null` after a run that scored at least one Asset.
4. **Quote a Fit/Performance pair (AC8).**
   ```
   npm run report straw-motion
   ```
   Pick any one Idea's row (all 7 have real `fit_score`s already in the ledger, e.g. `idea-2026-W32-01`
   at `0.72`) and **post its Fit Score next to its (now real) best Performance Score as a comment on
   issue #200** — e.g. "`idea-2026-W32-01`: Fit Score 0.72, Performance Score 0.XX (from the news-carousel
   Asset posted 2026-08-04)."
5. Mundotip has zero posted Assets today (confirmed by reading its ledger — `post_url` is unset on
   every Idea's Asset), so its Channel baseline correctly stays `updated_at: null` after this run — that
   is honest, not a bug; nothing to scrape there yet.

### Self-review notes

- Considered duplicating `src/media-host/live/env.ts`'s tiny `.env` loader into a new
  `src/apify/live/env.ts` to keep `apify` and `media-host` fully decoupled; decided against it —
  reusing the already-tested `loadEffectiveEnv` directly (via `token.ts`) avoids ~35 lines of duplicated,
  re-tested logic for a module that is already generic (parses `KEY=VALUE` text, nothing media-host- or
  Apify-specific), consistent with how commands elsewhere in this repo (`track-performance.ts` itself)
  already import across `apify/`, `performance/`, `asset/`, `ledger/`, `brand/`.
- `client.ts`'s `globalThis.fetch as ApifyFetch` cast was originally written as a double cast (`as
  unknown as ApifyFetch`); simplified to a single cast after confirming `tsc` accepts it directly (real
  `fetch`'s signature structurally satisfies `ApifyFetch` once the intermediate `unknown` is dropped) —
  one less thing hiding a real structural mismatch, if one is ever introduced.
- Found and fixed a real spec-authoring trap while writing the OpenSpec deltas: `openspec validate
  --strict`'s "must contain SHALL or MUST" check reads only the requirement paragraph's FIRST markdown
  line (up to the first `\n`), not the full wrapped paragraph — a MODIFIED requirement whose "SHALL"
  landed on a soft-wrapped second line failed validation with a misleading-looking error even though the
  full requirement text plainly contains "SHALL" several times. Fixed by keeping that one requirement's
  opening sentence on a single unwrapped line. Recording this here since it cost real time and isn't
  covered by the known MODIFIED-header trap already documented for this repo.
- Rewrote the `track-performance.md`/`performance-tracker.md` doc edits twice after the first pass
  accidentally split the literal pinned phrase "never live Apify" across a markdown soft-wrap boundary
  (`track-performance.docs-test.ts` matches on a literal space, not a wrapped newline) — caught by
  actually running the docs-test suite rather than eyeballing the prose, per this repo's own standing
  gotcha about prose-doc-test wrapping.
- Kept `smoke.ts` intentionally thin (print raw + normalized + a fixed "NEXT STEPS" block) rather than
  trying to auto-write a fixture file or auto-post to GitHub — the Operator should read and decide, not
  have a script silently commit something on their behalf.

### Known limits

- **Acceptance criteria 4–8 are NOT done by this build** — verifying the Facebook mapping, scraping/
  scoring the 7 posted Assets, computing the Straw Motion baseline for real, and quoting a Fit/
  Performance pair all require spending real Apify credits, which this build agent never does
  (CLAUDE.md). The exact runbook above is the Operator's next action; `src/apify/live/client.ts` and
  `src/apify/live/smoke.ts` are what make it a five-minute, low-risk pass rather than an improvised one.
- **`mapFacebookItem`'s field mapping is unchanged and still only synthetically tested** — if the live
  verification (runbook step 2) turns up a mismatch, correcting `src/apify/normalize-metrics.ts` is a
  small, separate follow-up (not performed here, since it would be guessing at a live shape this build
  cannot observe).
- **MundoTip has zero posted Assets and stays at a null baseline after this slice** — correctly so
  (nothing to compute from); not a defect, just the current real state of that Brand's ledger.
- **LinkedIn's live Apify request shape is unverified and deliberately unimplemented** —
  `apifyRunSyncInput` throws for `platform: "linkedin"` rather than guess a shape; unreachable in
  practice today since `resolveApifyActor` already reports "not trackable" for LinkedIn before
  `LiveApifyClient.scrapePost` would ever be called with it (unchanged, pre-existing behavior).
- **A live `ApifyRequestError`'s exact retry/rate-limit handling is not modelled** — a non-ok response
  (e.g. a transient 429) is reported as a single SKIPPED line by `trackPerformanceCommand`'s existing
  catch, exactly like every other scrape failure; no retry logic was added or requested by this issue.
