# Slice Handoff — issue-84-performance-tracker-per-asset

Bidirectional channel between `developer` and `qa`. Developer writes the Build Report below; `qa`
appends its Verdict beneath it. Retries append `Round-N Build` blocks. Nothing here is ever overwritten.

---

## Build Report (Round 1)

### What changed

`/track-performance` had **no code behind it at all** before this slice — every step (selecting Ideas,
scraping Apify by hand, computing the score, editing `ledger.json`) was done freeform by the
`performance-tracker` agent, and its docs (already re-worded in issue #56 to talk about Assets/Recipes)
had no test proving that prose was actually what happened. This slice builds the missing implementation
test-first, at the real per-Asset grain (ADR-0011):

- Four pure deep modules under `src/performance/`: `selection.ts` (one selection per `(Idea, Recipe)`
  Asset), `score.ts` (the ADR-0001 Performance Score formula, relative to the Channel baseline),
  `maturity.ts` (the per-Asset `tracking`/`scored` transition by that Asset's own `posted_at` age), and
  `metrics.ts` (median / rolling-baseline recompute).
- Extended `LedgerAssetRecord` (`src/asset/asset.ts`) with `metrics`, `tracked_at`, `history` — parsed
  defensively (a malformed reading is dropped, never half-fabricated).
- Extended the ledger store (`src/ledger/ledger.ts`) with `loadBaseline`/`writeBaseline` — the typed
  read/write boundary for the Brand's ONE Channel baseline.
- Added `mapFacebookItem` (`src/apify/normalize-metrics.ts`), completing the three-platform metrics
  mapping `detectPlatformFromUrl` already dispatches across (Instagram/YouTube already existed from
  issue #48; Facebook never had one).
- Added the orchestration shell `src/commands/track-performance.ts` (+ `track-performance-port.ts` for
  the `PerformanceScrapePort` seam) — wires selection → platform detection → actor resolution → scrape
  (via the injected, FAKE-in-tests port) → normalize → score → maturity → `AssetStore.writeAsset` →
  (after the batch) baseline recompute + `writeBaseline`. Never fabricates: every unresolvable path
  (bad URL, unconfigured actor, empty/failed scrape, missing `posted_at`) is skipped and reported.
- Updated `.claude/commands/track-performance.md` and `.claude/agents/performance-tracker.md` to
  reference the real code, attribute results to the `(Idea, Recipe)` **Asset** (never a flat Idea), and
  correct the Facebook field-mapping (previously vague "as documented previously").
- Updated `CLAUDE.md`'s Asset field list (`metrics`/`tracked_at`/`history`).

### Files touched

**New:**
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/performance/selection.ts` (+ `selection.test.ts`)
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/performance/score.ts` (+ `score.test.ts`)
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/performance/maturity.ts` (+ `maturity.test.ts`)
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/performance/metrics.ts` (+ `metrics.test.ts`)
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/track-performance.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/track-performance-port.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/track-performance.test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/commands/track-performance.docs-test.ts`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/apify/fixtures/facebook-post.synthetic-sample.json`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/openspec/changes/issue-84-performance-tracker-per-asset/`
  (`proposal.md`, `tasks.md`, `specs/performance-tracking/spec.md`, `specs/asset-store/spec.md`,
  `specs/apify-platform-integration/spec.md`, this `handoff.md`)

**Modified:**
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/asset/asset.ts` (+`asset.test.ts`) — `AssetMetrics`,
  `AssetMetricsSnapshot`, `parseAssetMetrics`/`parseAssetMetricsSnapshot`/`parseAssetMetricsHistory`,
  wired into `LedgerAssetRecord`/`parseAssetRecord`.
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/ledger/ledger.ts` (+`ledger.test.ts`) —
  `LedgerBaseline`, `loadBaseline`, `writeBaseline`.
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/apify/normalize-metrics.ts`
  (+`normalize-metrics.test.ts`) — `mapFacebookItem`, `isoFromUnixSeconds` helper.
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/src/apify/fixtures/README.md` — documents the new
  synthetic Facebook fixture as NOT a live capture.
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/package.json` — new `track-performance` npm script.
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/commands/track-performance.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/agents/performance-tracker.md`
- `/Users/CaxtonTaylor/Developer/OrganicGrowth/CLAUDE.md`

**Untouched (confirmed via `git status`):** `src/production-queue/**`, `src/space-driver/**`,
`src/production-spec/**`, `src/recipe/**`, `src/format/**`, `src/commands/report.ts`,
`src/commands/log-post.ts`, `src/commands/pick-cast.ts`.

### How to run

```bash
npm test                                                   # type-check + full unit suite
npm run test:docs                                          # docs-conformance suite
npx openspec validate --all --strict                       # spec validation (all changes + specs)
npx openspec validate issue-84-performance-tracker-per-asset --strict   # this change only

# exercise the command directly (fake port only — see track-performance.test.ts for real usage)
npx tsx src/commands/track-performance.ts mundotip
npx tsx src/commands/track-performance.ts mundotip idea-2026-W22-01   # forces a re-pull
```

Current status: `npm test` → **1243/1243 passing**; `npm run test:docs` → **38/38 passing**;
`npx openspec validate --all --strict` → **23/23 valid** (22 specs + this 1 change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #84) | Proving test(s) |
|---|---|---|
| 1 | Every posted Asset (per Recipe) is scraped and scored independently; attribution stays via the logged `post_url` only, never inferred | `src/commands/track-performance.test.ts` → `"trackPerformanceCommand — an Idea with two posted Assets gets two INDEPENDENT scores"` (both sub-tests: independent scores + sibling-Asset untouched); `src/performance/selection.test.ts` → `"selects EACH of an Idea's several Recipes' Assets independently"`, `"does NOT select an Asset without a post_url"` |
| 2 | `tracking`/`scored` transitions happen per Asset by its own post age; the ledger is updated at Asset grain with ISO-8601 timestamps | `src/performance/maturity.test.ts` (full boundary coverage: <7d, exactly 7d, well past, unparseable→`null`); `src/commands/track-performance.test.ts` → `"a Post younger than 7 days becomes tracking..."`, `"a Post 7+ days old becomes scored"` (asserts `tracked_at` is written ISO-8601) |
| 3 | An Idea with two posted Assets shows two scores; `/report`'s Fit-vs-best-Performance comparison reflects them | `src/commands/track-performance.test.ts` → `"scores each Recipe's Asset from its OWN post_url..."` — writes two independent scores AND asserts `loadReport(ledgerPath).ideas[0].best_performance_score` equals `Math.max` of the two (proves the existing `/report` 1:N surface, issue #56, is correctly fed by this slice's writes) |
| 4 | performance-tracker agent doc updated; built test-first; both `npm test` and docs-tests green | `.claude/agents/performance-tracker.md` + `.claude/commands/track-performance.md` updated; pinned by `src/commands/track-performance.docs-test.ts` (13 tests) plus the pre-existing `src/apify/apify-docs.test.ts` (17 tests, unchanged, still green); `npm test` 1243/1243, `npm run test:docs` 38/38 |

Additional slice-specific guarantees, each with its own test:
- **Never fabricate** (rule 8): every skip path — undetectable platform, unconfigured actor (still
  `"..."` placeholder), scrape returns `null`, scrape throws, missing `posted_at` — is covered in the
  `"never fabricates"` describe block of `track-performance.test.ts` (5 tests), each asserting the
  ledger is left unwritten for that Asset.
- **Relative, not absolute** (rule 4): `src/performance/score.test.ts` proves the score is computed
  against the baseline (same metrics score differently against different baselines; a null baseline
  scores neutral rather than a fabricated ratio; a viral 100x outlier clips to 1.0, never higher).
- **Public-metrics-only** (rule 2): `mapFacebookItem` only ever reads `likes`/`comments`/`shares`/
  `viewsCount` — no Saves/follows/watch-through anywhere in this slice's code path.
- **Ledger-as-source-of-truth**: every write in this slice goes through `AssetStore.writeAsset` or the
  new `writeBaseline` — no stray `writeFile` call anywhere in `track-performance.ts` (confirmed by
  reading the file; only the two typed store functions ever touch `ledgerPath`).

### Fakes / fixtures used

- **The Magnific fake: N/A — not applicable to this slice.** No Magnific Space involvement at all;
  `grep -rn "spaces_\|creations_\|FakeSpace" src/performance/ src/commands/track-performance*.ts` →
  zero matches. This slice is entirely ledger/Apify-metrics work.
- **The Apify fake (the load-bearing one for this slice): `PerformanceScrapePort`**
  (`src/commands/track-performance-port.ts`). Every test in `track-performance.test.ts` injects a
  literal in-memory `fakePort(responses)` function — no network call, no `APIFY_API_TOKEN` read, no
  credits. The shipped `DEFAULT_PERFORMANCE_SCRAPE_PORT` (used only outside tests) always returns
  `null` and is never exercised by any test.
- **`src/apify/fixtures/facebook-post.synthetic-sample.json`** — a SYNTHETIC fixture (explicitly
  labeled as such in the file's own README entry and the `mapFacebookItem` docstring), built from the
  Apify Store's documented output schema for `apify/facebook-post-scraper`, NOT a live sanctioned
  capture the way the pre-existing Instagram/YouTube fixtures (issue #48) are. Flagged as a follow-up.
- Tmp-directory ledger/seeds fixtures (`mkdtemp` + `writeFile`), mirroring the existing
  `log-post.test.ts`/`ledger.test.ts` convention — no shared/global state between tests.

### Self-review notes

- Reused `AssetMetrics` (defined once in `src/asset/asset.ts`) as the shared shape across
  `src/performance/{metrics,score}.ts` rather than duplicating a parallel type, keeping module
  boundaries tight (one canonical definition of "the four public metrics").
- Reused the existing `asNumberOrNull`/`isEnoent` helpers already in `src/ledger/ledger.ts` for the new
  `loadBaseline` rather than re-deriving them.
- Considered a `history` length cap; left unbounded (documented as a known limit below) since weekly
  cadence keeps it small in practice and no acceptance criterion calls for one — avoided speculative
  complexity.
- Considered giving `PerformanceScrapePort` a richer discriminated-union return type (ok/error/empty);
  simplified to `unknown | null` (mirrors the existing `MagnificReadinessPort`/`ApifyReadinessPort`
  simplicity) since the shell already distinguishes "thrown" from "returned null" at the call site —
  a richer type would have added ceremony without a behavioral difference.
- Fixed two doc line-wrap regressions during self-review: my first pass at rewriting
  `performance-tracker.md` accidentally split "Instagram/YouTube does not publicly expose" across a
  line break in a way that broke the pre-existing `src/apify/apify-docs.test.ts` (issue #48) — caught
  by running `npm test`, not just the new docs-test file, and fixed before handoff.

### Known limits (deferred, not silently dropped)

- **The live Apify HTTP adapter is deferred.** `DEFAULT_PERFORMANCE_SCRAPE_PORT` always reports "no
  data" outside tests, mirroring `run-pipeline-ports.ts`'s existing `DEFAULT_APIFY_PORT`/
  `DEFAULT_MAGNIFIC_PORT` placeholders. Until it is wired, the `performance-tracker` agent's own
  Bash-tool-driven `curl` calls (documented in its `.md`) remain the sanctioned way to pull real
  metrics — this module is the tested, canonical reference that process must match.
- **Facebook's field mapping is not yet live-verified.** `mapFacebookItem`'s field names come from
  Apify's documented output schema, not a sanctioned live capture (unlike Instagram/YouTube, issue
  #48). Flagged in the module docstring, `src/apify/fixtures/README.md`, and the OpenSpec delta.
  Follow-up: run a real (sanctioned, `.env`-token) Facebook post-scrape capture and re-verify.
  This build never made a live Apify or Magnific call to produce this fixture.
- **Meta Content export enrichment** (Saves/Net-follows/watch-through) is untouched — already optional
  per ADR-0001, out of this slice's scope.
- **No `history` length cap.** Unbounded for now; acceptable at weekly cadence, flagged for a future
  slice if it ever grows unwieldy.
- **`/report`'s own code is untouched** — this slice proves (with a dedicated integration-style test)
  that it is fed correctly by the new per-Asset writes, but does not modify `report.ts` itself (it
  already read per-Asset `performance_score`/`post_url` and computed the best-of-N summary since
  issue #56).

---

## QA Verdict — Round 1: PASS

### Suite result

All three commands were re-run independently by QA (not taken on faith from the Build Report):

- `npm test` → **1243/1243 passing, 341 suites, 0 fail, 0 skipped** (type-check via `tsc --noEmit` +
  full `node:test` run). Confirmed green.
- `npm run test:docs` → **38/38 passing, 7 suites, 0 fail**. Confirmed green.
- `npx openspec validate --all --strict` → **23 passed, 0 failed** (22 pre-existing specs + this 1
  change, `change/issue-84-performance-tracker-per-asset` explicitly listed and valid). Confirmed green.

Also manually ran `npx tsx src/commands/track-performance.ts mundotip` against the real
`data/brands/mundotip` ledger (no fake injected, i.e. the shipped `DEFAULT_PERFORMANCE_SCRAPE_PORT`
path) — it printed "Tracking performance for Brand: mundotip." + "No trackable Assets..." and did not
crash or write anything. Confirms the runtime CLI entry point is wired and honest with real data.

### Per-criterion results (issue #84 acceptance criteria, verbatim)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | Every posted Asset (per Recipe) is scraped and scored independently; attribution stays via the logged `post_url` only, never inferred | **PASS** | `src/commands/track-performance.test.ts` → `"scores each Recipe's Asset from its OWN post_url, never collapsing or inferring across Recipes"` (asserts `a1.performance_score !== a2.performance_score` and the higher-engagement Post scores higher) and `"writing one Recipe's Asset never touches the sibling Recipe's Asset fields"`; `src/performance/selection.ts` reads only `asset.post_url` (never infers a Post from anything else) — confirmed by reading the module: selection is keyed strictly on the Asset's own `post_url` string, `assets` array order/position is never used as attribution |
| 2 | `tracking`/`scored` transitions happen per Asset by its own post age; ledger updated at Asset grain with ISO-8601 timestamps | **PASS** | `src/performance/maturity.test.ts` (exact 7-day boundary tested: `"is still tracking one second short of the maturity window"` + `"is 'scored' once a Post is exactly 7 days old"`); `src/commands/track-performance.test.ts` → `"a Post younger than 7 days becomes tracking..."` and `"a Post 7+ days old becomes scored"` (asserts `tracked_at` equals the injected ISO-8601 `now`); write path confirmed to go only through `AssetStore.writeAsset` (`src/asset/store.ts`), which upserts a single `(ideaId, recipe)` Asset in the ledger |
| 3 | An Idea with two posted Assets shows two scores; `/report`'s Fit-vs-best-Performance comparison reflects them | **PASS** | `src/commands/track-performance.test.ts` → the same two-Asset test asserts `loadReport(ledgerPath).ideas[0].best_performance_score === Math.max(a1.performance_score, a2.performance_score)`, proving `/report`'s pre-existing (issue #56) 1:N surface is fed correctly by this slice's writes. `report.ts` itself is confirmed untouched (`git status`), consistent with the Build Report's claim that it already read per-Asset data |
| 4 | performance-tracker agent doc updated; built test-first; both `npm test` and docs-tests green | **PASS** | `.claude/agents/performance-tracker.md` and `.claude/commands/track-performance.md` both read and confirmed to describe the real per-Asset grain, the FAKE port, and the deferred live adapter honestly; pinned by `src/commands/track-performance.docs-test.ts` (13 tests, all reading the real doc files and asserting concrete substrings/patterns — not just "file exists"); `npm test` 1243/1243, `npm run test:docs` 38/38, both independently re-run green |

### Per-scenario results (spec deltas)

**`performance-tracking` (ADDED)** — all 16 scenarios traced to a passing test:
- "An Idea with two Recipes' Assets yields two independent selections" → `selection.test.ts` line 41
- "A scored Asset is not selected by default" → `selection.test.ts` line 27
- "An explicit idea-id forces re-selection of an already-scored Asset" → `selection.test.ts` line 77
- "An Asset with no post_url is never selected, even when forced" → `selection.test.ts` line 85
- "A reading exactly at baseline scores 0.5" / "2x baseline scores 1.0" / "100x outlier clips to 1.0" /
  "null baseline scores neutral" → `score.test.ts` lines 20/26/32/52 — all PASS
- "A Post younger than 7 days is tracking" / "7+ days is scored" / "unparseable → null" →
  `maturity.test.ts` lines 20/34/50 — all PASS
- "Two posted Assets end up with two independent scores" / "writing one never touches the sibling" →
  `track-performance.test.ts` lines 142/182 — both PASS
- "Unresolvable platform skipped" / "no-data scrape skipped" / "thrown error skipped, run continues" →
  `track-performance.test.ts` "never fabricates" describe block — all PASS
- "Baseline seeds from batch on first run" / "prefers scored over tracking" →
  `track-performance.test.ts` lines 305/320 — both PASS
- "Full suite passes with zero live Apify calls" → verified directly by QA: `grep -rn "fetch(\|http\.request\|https\.request\|axios\|APIFY_API_TOKEN" src/performance/ src/commands/track-performance*.ts` → zero matches; every test in `track-performance.test.ts` constructs `fakePort(...)` and passes it as `options.apify`

**`asset-store` (MODIFIED)** — all 7 scenarios (2 pre-existing + 5 new for issue #84) traced:
- "A well-formed metrics/tracked_at/history reading parses onto the Asset" → `asset.test.ts` — PASS
- "A metrics reading missing any one of the four fields is omitted entirely" → `asset.test.ts` — PASS
  (confirmed in code: `parseAssetMetrics` requires all four `isFiniteNonNegativeNumber` checks to pass)
- "A malformed history entry is dropped without invalidating the whole array" → `asset.test.ts` — PASS

**`apify-platform-integration` (MODIFIED)** — the new Facebook scenario traced:
- "A Facebook post maps its real share count through, never forcing it to 0" →
  `normalize-metrics.test.ts` (`mapFacebookItem` tests) — PASS; confirmed in code `mapFacebookItem`
  reads `obj.shares` directly (unlike `mapInstagramItem`/`mapYoutubeItem`, which hardcode `shares: 0`)
- "A garbled/empty item never throws" → covered for all three mappers — PASS

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | This slice touches no production/rendering path at all; `src/production-queue/**`, `src/space-driver/**`, `src/production-spec/**`, `src/recipe/**` confirmed untouched by `git status --porcelain \| grep -E "production-queue\|space-driver\|production-spec\|recipe/"` → no output |
| Public-metrics-only | **PASS** | `mapFacebookItem` reads only `likes`/`comments`/`shares`/`viewsCount`/`url`/`time`/`timestamp` — no Insights-only fields. `grep -n "Saves\|Net-follows\|watch-through" src/apify/normalize-metrics.ts src/performance/*.ts src/commands/track-performance*.ts` → no matches in the code path (only in doc prose describing the *optional*, separate Meta-export enrichment, which this slice does not touch) |
| Relative-not-absolute | **PASS** | `computePerformanceScore(metrics, baseline)` divides every metric by `baseline.<metric>` before weighting (`src/performance/score.ts` lines 44-58) — verified by reading the function body; `score.test.ts` proves the same `metrics` score differently against different baselines and a `null` baseline yields neutral 0.5, never a raw-count-derived number |
| Explicit-attribution | **PASS** | `selectTrackableAssets` selects only Assets with a non-empty `post_url`; `writeAsset(ideaId, recipe, ...)` in `track-performance.ts` writes exactly the `(pickIdeaId, asset.recipe)` pair the selection produced — no code path infers an Idea/Recipe from post content, timing, or position. Confirmed by reading `selection.ts`, `track-performance.ts`, and `store.ts::writeAsset` in full |
| Ledger-as-source-of-truth | **PASS** | Every state write in the new code goes through `AssetStore.writeAsset` or the new `loadBaseline`/`writeBaseline` (`src/ledger/ledger.ts`) — `grep -n "writeFile\|writeFileAtomic" src/commands/track-performance.ts` → no direct file-write calls in the command file itself (only via the imported store functions) |
| Magnific fake / no live-Space calls | **PASS** | `grep -rn "spaces_\|creations_\|FakeSpace" src/performance/ src/commands/track-performance*.ts` → zero matches (re-run independently by QA, confirms Build Report's claim). This slice has no Magnific involvement at all — correctly N/A, not silently skipped |
| No live Apify calls in tests | **PASS** | `grep -rn "fetch(\|http\.request\|https\.request\|axios\|APIFY_API_TOKEN" src/performance/ src/commands/track-performance*.ts` → zero matches. Every `trackPerformanceCommand` call in `track-performance.test.ts` passes an explicit `apify: fakePort(...)`. The shipped `DEFAULT_PERFORMANCE_SCRAPE_PORT` always returns `null` and was manually confirmed (via the real `mundotip` CLI run above) to behave honestly rather than crash |

### OpenSpec-vs-issue faithfulness (job c)

Read `proposal.md`, `tasks.md`, and all three spec deltas against the issue body and ADR-0011 directly
(not just the Build Report's self-assessment):

- The issue's core ask — "an Idea with one Idea posted through two Recipes gets **two** independent
  scores, each measured against the Channel's one baseline — never a single per-Idea number" — is
  encoded verbatim as its own Requirement + Scenario in `performance-tracking/spec.md` ("An Idea with
  two posted Assets ends up with two independent scores") and is the one most load-bearing test in the
  suite. No drift found.
- The issue's "attribution stays via the logged `post_url` only, never inferred" is enforced both in the
  `selection.ts` Requirement (an Asset with no `post_url` is *never* selected, even when forced) and in
  the write Requirement (writing one Asset never touches a sibling) — matches always-rules #5 and
  ADR-0011 exactly.
- The issue's "Idea-level view stays a derived roll-up, never stored state" is respected: this slice
  writes nothing at Idea grain (`writeAsset` only ever patches `assets[]` entries); `loadReport`'s
  Idea-level `status`/`best_performance_score` remain derived, exactly as ADR-0011 specifies, and this
  slice does not modify that derivation.
- `asset-store`'s spec delta additively extends the existing (issue #55/#56) `LedgerAssetRecord`
  Requirement rather than replacing it — the pre-existing `casting`-retirement and structured-`copy`
  scenarios are preserved verbatim in the same file, appropriately, since this is a MODIFIED capability.
- No misread found: nothing in the spec deltas claims a stronger or weaker guarantee than the issue
  asks for (e.g. the "never a per-Recipe baseline" language is additive rigor consistent with
  always-rules #4, not scope creep — it directly implements "measured against the Channel baseline"
  from the issue body).
- Cross-checked against ADR-0011: the retired `casting` status, the `pending_gate` pause-not-stage
  model, and the `assets[]` per-Recipe grain are all consistent with what this slice builds on top of
  (it introduces no new status values and does not touch the `casting`/`pending_gate` logic at all).

### Known-limits sanity check

All five "Known limits" the Build Report flags were checked against the issue's acceptance criteria and
confirmed genuinely out of scope, not silently dropped criteria:
- **Deferred live Apify adapter** — the issue does not ask for a live HTTP integration; it asks for the
  selection/scoring/maturity/write pipeline to exist and be tested, which it is (hermetically, per the
  existing `run-pipeline-ports.ts` convention already established in this repo). Not a dropped criterion.
- **Facebook field-mapping not live-verified** — flagged honestly in three places (docstring, fixtures
  README, spec delta); the issue does not require a live capture, only that metrics be pulled and
  scored; the mapping is unit-tested against a clearly-labeled synthetic fixture. Acceptable.
- **No `history` length cap** — no acceptance criterion mentions history size; reasonable deferral.
- **Meta Content export enrichment untouched** — explicitly out of scope per ADR-0001 and the issue,
  which is about Apify-sourced Performance Scores, not the optional enrichment.
- **`/report`'s own code untouched** — correct: the issue asks that `/report`'s existing comparison
  "reflects" the two scores, which is proven by an integration-style test against the real
  `loadReport`, not that `report.ts` be modified.

### Defect list

None. No defects found in this round.
