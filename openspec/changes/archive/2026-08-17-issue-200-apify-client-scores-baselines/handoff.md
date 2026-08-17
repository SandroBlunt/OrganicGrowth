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

---

## QA Verdict — Round 1: PASS

Verified in the worktree at
`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-200-apify-client-scores-baselines`, branch
`issue-200-apify-client-scores-baselines`, HEAD `9794785` (rebased onto `main` `4dbe8a8`). Working tree
clean throughout (`git status --porcelain` empty), so the credential scanner's `git ls-files`-based
self-scan genuinely covered every tracked file this round.

### Suite result (re-run fresh, not trusted from the Build Report)

The Build Report's own numbers (2881/729, 280/75) were pre-rebase and are stale — confirmed stale by
re-running everything myself:

- `npx tsc -p tsconfig.json --noEmit` → clean, no errors.
- `npm test` (`tsc --noEmit && node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"`) →
  **2888 tests / 731 suites / 0 fail**. Matches the expected post-rebase branch figure exactly.
- `npm run test:docs` (`node --import tsx --test "src/**/*.docs-test.ts"`), run separately → **282
  tests / 76 suites / 0 fail** (2 tests / 1 suite higher than the Build Report's stale 280/75 — `main`
  gained doc-conformance tests between the Build Report and the rebase; not a regression, just a moved
  target).
- `npx openspec validate issue-200-apify-client-scores-baselines --strict` → `Change
  'issue-200-apify-client-scores-baselines' is valid`.
- `npx openspec validate --all --strict` → **48/48 pass** (includes `change/issue-200-...` and
  `spec/apify-platform-integration`, `spec/performance-tracking`, all others green).

All four commands were run for real, in this worktree, and all were genuinely green — no assumed pass.

### Per-criterion results (issue #200 acceptance criteria)

| # | Criterion | Result | Proving test / evidence |
|---|---|---|---|
| 1 | Live Apify client implements `PerformanceScrapePort`, used by `npm run track-performance` in place of hand-driven scraping | **PASS** | `src/apify/live/client.ts`: `class LiveApifyClient implements PerformanceScrapePort`. `src/commands/track-performance.ts:76`: `const DEFAULT_PERFORMANCE_SCRAPE_PORT: PerformanceScrapePort = new LiveApifyClient();` (confirmed via `git diff main...HEAD`, replacing the prior always-`null` stub). `src/apify/live/client.test.ts` (9 tests) exercises `scrapePost` end-to-end against a fake transport. |
| 2 | Token sent in a header, never a URL query string | **PASS** | `src/apify/live/request.ts:79-90` (`buildApifyRunSyncRequest`) puts the token only in `headers.Authorization`; `apifyRunSyncUrl` builds a plain template string with no query component at all. Proven on the concrete request, not merely "a header exists": `request.test.ts`'s "security-critical proof" block (5 tests, lines 73-145) asserts `request.url` contains no `?`, no `token` substring, and not the token value itself; `request.body` doesn't contain the token either. `client.test.ts`'s first test (lines 38-51) proves the same end-to-end through the real client and a captured call. |
| 3 | Actor chosen per source URL's own platform (issue #48's existing detection) | **PASS** | `src/apify/platform.ts` (`detectPlatformFromUrl`/`resolveApifyActor`) is byte-for-byte unchanged (`git diff main...HEAD -- src/apify/platform.ts` → empty). `track-performance.ts` still calls it before ever calling `apify.scrapePost` (lines 174-198); `LiveApifyClient.scrapePost(url, platform, actorSlug)` only ever receives an already-resolved platform, never re-decides it. |
| 4 | Facebook mapping verified live, correction applied, verification posted on the issue | **Correctly deferred — Operator action, not a build defect** | Out of scope per the task brief (needs real credits). `src/apify/live/smoke.ts` exists and is a genuinely followable tool (see Runbook judgement below). |
| 5 | All 7 posted Assets scraped, raw metrics stored | **Correctly deferred — Operator action** | Ledger check: `data/brands/straw-motion/ledger.json` has exactly 7 Assets with a `post_url` (all `news-carousel`, all Facebook, posted 2026-08-04 through 2026-08-10), 0 with a `performance_score` — matches the issue's stated starting state exactly. |
| 6 | Channel baseline computed, `updated_at` no longer null | **Correctly deferred — Operator action** | Confirmed both `data/brands/straw-motion/ledger.json` and `data/brands/mundotip/ledger.json` still have `baseline.updated_at: null` today — accurate starting state, nothing silently faked as done. |
| 7 | Each of the 7 Assets carries a Performance Score relative to its Channel baseline | **Correctly deferred — Operator action** | Same reasoning; `src/performance/score.ts` (untouched, `git diff` empty) already implements this relative-to-baseline formula and is unit-tested pre-existing; this slice only wires a real data source into it. |
| 8 | A Fit/Performance pair quoted on the issue | **Correctly deferred — Operator action** | `src/commands/report.ts` (untouched) already prints `fit_score` next to `best_performance_score` per Idea (lines 58-83). Spot-checked the runbook's own example: `idea-2026-W32-01` really does have `fit_score: 0.72` in the ledger today, and its posted Asset's `post_url` really is the exact URL the runbook's smoke example uses — the runbook picked a real, valid row, not an invented one. |
| 9 | Client exercised in tests through the port's fake; no test spends Apify credits | **PASS** | See "Gate one" below — verified file-by-file, not by trusting the grep count in the Build Report. |

### Per-scenario results (spec deltas)

**`specs/apify-live-client/spec.md` (ADDED capability) — all Scenarios pass:**

| Requirement | Scenario | Result | Test |
|---|---|---|---|
| Token in header, never URL | Token in Authorization header | PASS | `request.test.ts:73-82` |
| Token in header, never URL | URL never contains token/query string | PASS | `request.test.ts:84-94` |
| Token in header, never URL | Body never contains token | PASS | `request.test.ts:96-104` |
| Per-platform request shape | FB/YT build startUrls body | PASS | `request.test.ts:51-55` |
| Per-platform request shape | IG builds username-named body | PASS | `request.test.ts:57-59` |
| Per-platform request shape | linkedin throws | PASS | `request.test.ts:61-63` |
| Per-platform request shape | actor slug's first slash → tilde | PASS | `request.test.ts:18-30,34-39` |
| Response parsing never fabricates | non-empty array → first item | PASS | `response.test.ts:7-10` |
| Response parsing never fabricates | empty array → null | PASS | `response.test.ts:12-14` |
| Response parsing never fabricates | invalid JSON / non-array throws | PASS | `response.test.ts:16-26` |
| Token resolution, base wins over .env | direct env value resolves, trimmed | PASS | `token.test.ts:26-32` |
| Token resolution, base wins over .env | missing token → null | PASS | `token.test.ts:22-24` |
| Token resolution, base wins over .env | base env wins over .env file | PASS | `token.test.ts:49-59` |
| LiveApifyClient against injectable transport | successful scrape, token in header only | PASS | `client.test.ts:38-51` |
| LiveApifyClient against injectable transport | no token → zero requests, `ApifyTokenMissingError` | PASS | `client.test.ts:62-71` |
| LiveApifyClient against injectable transport | empty dataset → null | PASS | `client.test.ts:73-78` |
| LiveApifyClient against injectable transport | non-ok response → `ApifyRequestError` | PASS | `client.test.ts:80-88` |
| LiveApifyClient against injectable transport | explicit token wins over env | PASS | `client.test.ts:114-124` |

**`specs/performance-tracking/spec.md` (MODIFIED requirement) — both Scenarios pass:**

| Scenario | Result | Evidence |
|---|---|---|
| Full suite passes with zero live Apify calls | PASS | `npm test` green (2888/731/0 fail); every `trackPerformanceCommand` call across `track-performance.test.ts` (24) and `two-recipes-end-to-end.test.ts` (1) injects an explicit fake `apify` option (verified programmatically, not just grepped — see Gate one). |
| Live client is real but its default fetch transport is unreached by the suite | PASS | `new LiveApifyClient()` at `track-performance.ts:76` runs at module-load time (harmless — object construction only, `fetchImpl` is captured, never invoked), but `scrapePost` on that default instance is never called from any test (confirmed by tracing every caller). |

**MODIFIED-header archive-trap check:** the delta's requirement header —
`### Requirement: The build is hermetic — every test drives Apify through a fake port, never the live
API` — is byte-for-byte identical to the live spec's header at `openspec/specs/performance-tracking/spec.md:181`.
This is exactly the shape that has previously broken `openspec archive` when it drifted; here it matches
verbatim, so archiving should apply cleanly. I did **not** run `openspec archive` myself, per
instructions.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (N/A — untouched) | This slice touches no publishing path; `performance-tracker.md`'s own docs-test (`self-review` block, unmodified assertion) still asserts the doc never claims to `publish(es\|ing)`. |
| Public-metrics-only | PASS | `src/performance/metrics.ts`/`score.ts` unchanged (`git diff` empty); the live client only ever calls the same `post_actor` Apify actors that were already scoped to public post metrics; no private Insights path added. |
| Relative-not-absolute | PASS | `src/performance/score.ts` (untouched) computes Performance Score relative to `ledger.baseline`, never an absolute count; this slice changes only WHAT feeds it (real vs. fake metrics), never the formula. |
| Explicit-attribution | PASS | `src/performance/selection.ts`/`src/asset/store.ts` unchanged; writes remain keyed `(Idea, Recipe)` via `AssetStore.writeAsset`, unaffected by this slice. |
| Ledger-as-source-of-truth | PASS | `src/ledger/ledger.ts` unchanged; `trackPerformanceCommand`'s write path (baseline recompute, per-Asset `writeAsset`) is unmodified — this slice only replaces the scrape source, not the write target. |
| Magnific fake (N/A) | PASS | `grep -rn "mcp__magnific" src` → zero hits inside this slice's changed files; the only `spaces_*`/`creations_*` hits in the repo are pre-existing, unrelated `src/space-driver/live/smoke.ts` text (confirmed via `git diff main...HEAD --stat`, that file is not in this change). |

### Gate one — no test may spend an Apify credit (verified, not trusted)

- **`smoke.ts` is structurally unmatched by both test globs.** `npm test`'s glob is `"src/**/*.test.ts" "src/**/*.docs-test.ts"` (from `package.json`); `src/apify/live/smoke.ts` matches neither pattern. Confirmed nothing imports it: `grep -rln "smoke.ts" --include="*.ts" src` returns only unrelated `media-host` files (`s3.ts`, `command-runner.ts`, `command-runner.test.ts`, `fixtures/tiny-png.ts`) — none reference `apify/live/smoke.ts`. Ran `npm run apify-smoke` (no URL argument) directly: it printed the usage message and exited without any network call, confirming the script's own guard is real, not just documented.
- **File-by-file check of the "every test injects its own fake" claim**, not trusted from the Build Report's grep count: wrote a small script that parses every `trackPerformanceCommand(` call site (matching parens, not just presence of the substring "apify" anywhere nearby) across both call sites — `src/commands/track-performance.test.ts` (24 calls) and `src/producer/two-recipes-end-to-end.test.ts` (1 call). All 25 calls pass an explicit `apify:` option bound to a hand-rolled `fakePort`/`fakeApify` object, never `LiveApifyClient`. Additionally traced the ONE other place `trackPerformanceCommand` is called without an explicit `apify` option — `main()`'s CLI entry (`track-performance.ts`, guarded by an entry-point check) — and the one test that imports `main` (`track-performance.test.ts:565-591`) only exercises the "no `<brand>` argument" early-return path, which returns before `trackPerformanceCommand` is ever called. So the live default is never reached by any test, by any path.
- **`client.test.ts`'s own 9 tests** all construct `LiveApifyClient` with an explicit `fetchImpl: fakeFetch(...)` — verified by reading every constructor call in the file (lines 40, 55, 64, 75, 82, 92, 104, 119). `grep -rn "new LiveApifyClient(" src` shows exactly 2 constructions with no injected `fetchImpl`: `track-performance.ts:76` (module-scope default — object construction only, harmless, `fetchImpl` defaults to a captured-but-never-called reference to `globalThis.fetch`) and `smoke.ts:42` (never run by any test, confirmed above).
- **Result: Gate one holds.** No test path in this repository can reach a real `fetch` through this slice's code.

### Gate two — the security criterion (verified, not trusted)

- **Assert-on-the-request, not assert-a-header-exists**, confirmed by reading the actual assertions: `request.test.ts:84-94` and `client.test.ts:48-49` both assert `!request.url.includes(FAKE_TOKEN)` AND `!request.url.includes("?")` AND (in `request.test.ts`) `!request.url.includes("token")` — this would catch the exact leak (token ALSO present in the query string) the task asked me to specifically distrust a weaker test for. There is no test in this slice that only checks "a header is present" without also checking the URL/body are clean.
- **No credential-shaped string reached any tracked file.** `git status --porcelain` is empty (working tree clean) throughout this verification, so `src/secrets-scan/self-scan.test.ts`'s `git ls-files`-based scan (part of `npm test`, which was green) genuinely covered every file this round — no unstaged file was invisible to it. Every fake token literal in the new test files is built by string concatenation (`"test-fake-apify-token-" + "..."`) rather than one contiguous literal, matching the established convention.
- **`token.ts` reuses `env.ts`'s loader, doesn't duplicate it.** `src/apify/live/token.ts:13`: `import { loadEffectiveEnv } from "../../media-host/live/env.ts";` — confirmed this is a real import and real reuse (not a copy), by reading both files side by side.
- **Docs genuinely switched from query-string to header auth**, and the docs-tests were strengthened, not weakened. `grep -n "?token="` across both changed docs finds exactly one hit — a guardrail SENTENCE in `performance-tracker.md:27` explicitly telling the reader never to do that (`"...never `?token=` in the URL"`), not a live example. All three curl examples in `performance-tracker.md` (Facebook/Instagram/YouTube) use `-H "Authorization: Bearer ${APIFY_API_TOKEN}"`. `track-performance.docs-test.ts` gained a new assertion (`"documents the Apify token travels in a header, never a URL query string"`, lines 52-56) rather than losing one — confirmed by `git diff main...HEAD -- src/commands/track-performance.docs-test.ts` (10-line diff, additive).

### Other verified items

- **Actor chosen per source URL's platform, not Format's/Channel's**: confirmed `src/apify/platform.ts` is byte-for-byte unchanged since `main`, and its own docstring (unchanged) explicitly states the platform is "never assumed from `brand-profile.yaml`'s `channel` list... not even the primary entry's `platform`."
- **`response.ts` failure modes, not just the happy path**: read and confirmed 3 distinct outcomes are each tested — non-empty array (first item), empty array (`null`, not an error), and genuinely garbled input (throws) — covering both "a garbled 200" (invalid JSON, or valid JSON that isn't an array, e.g. an Apify error object) and "no data" (empty array) as *distinct*, never-conflated cases. `response.test.ts:24-26` additionally covers a bare JSON scalar (`"42"`), a case not explicitly named in the spec's Scenarios but a reasonable extra edge the "not an array" throw branch already covers.
- **Runbook followability** (the "judge the runbook" instruction): actually ran the three commands the runbook tells the Operator to run, without any arguments/URL, to confirm each fails safely and informatively rather than silently spending credits by accident: `npm run apify-smoke` (no URL) → prints usage, no call made. `npm run track-performance` (no brand) → prints usage. `npm run report` (no brand) → prints usage. `.env.example` exists and matches the runbook's step 1 instruction exactly. Spot-checked the runbook's own worked example against the real ledger: `idea-2026-W32-01`'s `fit_score` really is `0.72` and its posted `post_url` really is the exact URL used in the smoke-script example — the runbook is grounded in real, current data, not invented placeholder text. Cross-checked the "7 posted Assets, all Facebook/news-carousel, posted 2026-08-04 through 2026-08-10" claim against the ledger directly — exactly 7, exactly as described, and (today being 2026-08-17) all are genuinely 7+ days old, so the runbook's prediction that the batch run lands every one straight at `scored` is correct given `TRACKING_MATURITY_DAYS = 7` (`src/performance/maturity.ts`). The runbook gives exact commands and an explicit, checkable pass/fail signal for each of AC4/5/6/7/8 — it is followable as written. **No runbook defect found.**

### Defect list

None. No defects found in this round.

### Verdict

**PASS.** All in-scope acceptance criteria (1, 2, 3, 9) are proven by tests that actually exercise them,
not merely claimed. Acceptance criteria 4–8 are correctly, honestly deferred to the Operator with a
followable, evidence-grounded runbook — this is the issue's own explicit scope split, not a build
shortfall. Both hard gates (no test can spend an Apify credit; the token never reaches a URL) hold under
adversarial, file-by-file re-verification rather than trusting the Build Report's grep counts. The
OpenSpec change faithfully matches the issue: the ADDED `apify-live-client` capability's Scenarios trace
directly to AC2/AC3/AC9 and the always-rules; the MODIFIED `performance-tracking` requirement's header
matches the live spec verbatim (the known archive trap does not appear to apply here, though I did not
run `archive` myself). `npm test` is genuinely green at 2888/731/0 fail, `npm run test:docs` at
282/76/0 fail, and `openspec validate --all --strict` at 48/48 — all re-run fresh in this session, not
carried over from the Build Report's stale pre-rebase figures.

**Operator hand-actions still outstanding** (correctly out of scope for this build, not blocking this
PASS): run the 3-step runbook above (`npm run apify-smoke <url>` → post the raw/normalized pair on
issue #200 → `npm run track-performance straw-motion` → `npm run report straw-motion` → post one Fit/
Performance pair on issue #200) to close AC4–AC8. These are real Apify-credit-spending actions only a
human can authorize and perform.
