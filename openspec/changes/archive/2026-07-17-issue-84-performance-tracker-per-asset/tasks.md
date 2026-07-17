## 1. Asset schema extension (test-first, ADR-0011)

- [x] 1.1 Write failing tests (`asset/asset.test.ts`): `parseAssetMetrics` (four finite non-negative
  numbers required, or `null` — never half-fabricates), `parseAssetMetricsSnapshot` (one `history`
  entry), `parseAssetMetricsHistory` (drops malformed entries), and `parseAssetRecord` parsing
  `metrics`/`tracked_at`/`history` independently of every other optional field.
- [x] 1.2 Implement `AssetMetrics`, `AssetMetricsSnapshot`, the three parse functions, and wire them
  into `LedgerAssetRecord`/`parseAssetRecord` in `src/asset/asset.ts`.

## 2. Performance deep modules (test-first)

- [x] 2.1 Write failing tests + implement `src/performance/metrics.ts`: `median` (odd/even-length,
  empty → `null`, pure), `recomputeBaseline` (per-metric medians across a batch of `AssetMetrics`,
  empty batch → all-null).
- [x] 2.2 Write failing tests + implement `src/performance/score.ts`: `computePerformanceScore` — the
  ADR-0001 weights (0.35/0.25/0.20/0.20, sum to 1), the `clip(ratio, 0, 2)/2` normalization, a `null`
  baseline median scores NEUTRAL (0.5), a `0` baseline median with a `0` reading stays neutral (never
  divides by zero), any positive reading against a `0` baseline scores the max, output always in
  `[0, 1]`.
- [x] 2.3 Write failing tests + implement `src/performance/maturity.ts`: `daysSince` (fractional,
  `null` on unparseable input), `assetMaturityStatus` — `tracking` under 7 days, `scored` at 7+
  (boundary-tested), `null` for unparseable `posted_at`.
- [x] 2.4 Write failing tests + implement `src/performance/selection.ts`: `selectTrackableAssets` —
  default selects every `(Idea, Recipe)` Asset with a `post_url` at `posted`/`tracking`; an explicit
  `ideaId` selects ONLY that Idea's Assets with a `post_url`, including an already-`scored` one
  (forces); never selects an Asset without a `post_url`; pure (no mutation).

## 3. Ledger baseline store (test-first)

- [x] 3.1 Write failing tests (`ledger/ledger.test.ts`): `loadBaseline` — reads a populated baseline,
  all-null for none/missing ledger (defensive, never throws), degrades a garbled field to `null`.
  `writeBaseline` — round-trips via `loadBaseline`, never touches `ideas`, overwrites (not merges) a
  prior baseline.
- [x] 3.2 Implement `LedgerBaseline`, `loadBaseline`, `writeBaseline` in `src/ledger/ledger.ts`.

## 4. Facebook metrics mapping (test-first)

- [x] 4.1 Add the SYNTHETIC fixture `src/apify/fixtures/facebook-post.synthetic-sample.json`
  (documented Apify Store output schema — NOT a live capture) and document it honestly in
  `src/apify/fixtures/README.md`.
- [x] 4.2 Write failing tests + implement `mapFacebookItem` in `src/apify/normalize-metrics.ts`:
  `likes`→reactions, `comments`→comments, `shares`→shares (Facebook DOES expose a public share count —
  never forced to `0`, unlike Instagram/YouTube), `viewsCount`→views, `time` (falling back to
  Unix-seconds `timestamp`)→`postedAt`; never throws on garbled/null input; defensive missing→0
  defaults, noted.

## 5. Orchestration shell (test-first, hermetic — FAKE Apify only)

- [x] 5.1 Add `src/commands/track-performance-port.ts`: `PerformanceScrapePort` — the one seam to
  Apify, mirroring `run-pipeline-ports.ts`'s pattern.
- [x] 5.2 Write failing tests (`commands/track-performance.test.ts`) against a FAKE port + tmp
  ledger/seeds fixtures: a Post younger than 7 days becomes `tracking` with `metrics`/
  `performance_score`/`tracked_at` written; 7+ days becomes `scored`; score is relative to a seeded
  baseline; an Idea with TWO posted Assets gets two INDEPENDENT scores and writing one never touches
  the other; every skip path (undetectable platform, unconfigured actor, scrape returns nothing,
  scrape throws, missing `posted_at`) writes nothing and is reported, never fabricated; baseline
  seeds from the batch on a first run, prefers `scored` Assets once some exist, and is never written
  when nothing has ever been measured; `history` keeps the prior reading on a second pull; an explicit
  `idea-id` forces a re-pull of an already-`scored` Asset; brand-routing via `resolveBrand`; the CLI
  `main()` usage-error path.
- [x] 5.3 Implement `trackPerformanceCommand` + CLI `main()` in `src/commands/track-performance.ts`,
  wiring `selectTrackableAssets` → `detectPlatformFromUrl`/`resolveApifyActor` → the injected port →
  the per-platform normalizer → `assetMaturityStatus` → `computePerformanceScore` → `AssetStore.
  writeAsset` → (after the batch) `recomputeBaseline` → `writeBaseline`. Add the `track-performance`
  npm script.

## 6. Docs (kept honest, per-Asset grain)

- [x] 6.1 Update `.claude/commands/track-performance.md`: name the real orchestration shell + deep
  modules (mirrors `/log-post`'s "Run `npm run X`" convention), the FAKE-port hermetic test suite, and
  the deferred live-Apify adapter.
- [x] 6.2 Update `.claude/agents/performance-tracker.md`: attribute a result to the `(Idea, Recipe)`
  Asset (not a flat Idea); an Idea with two posted Assets scores independently; Facebook's real share
  count (never forced to 0); reference the new canonical modules; the per-Asset write via
  `AssetStore.writeAsset`, sibling Recipes untouched.
- [x] 6.3 Update `CLAUDE.md`'s Asset field list (`metrics`, `tracked_at`, `history`).
- [x] 6.4 Write failing docs-tests (`commands/track-performance.docs-test.ts`) pinning the above;
  confirm the pre-existing `src/apify/apify-docs.test.ts` (issue #48) stays green unchanged.

## 7. OpenSpec

- [x] 7.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `performance-tracking`;
  MODIFIED `asset-store`, `apify-platform-integration`.
- [x] 7.2 `npx openspec validate issue-84-performance-tracker-per-asset --strict` green.

## 8. Self-review

- [x] 8.1 `npm test` green (type-check + full suite, every pre-slice test still passing plus every new
  one this slice adds); `npm run test:docs` green.
- [x] 8.2 Simplify / dead-code pass; confirm every issue #84 acceptance criterion maps to a named
  test; confirm `production-queue/**`/`space-driver/**`/`production-spec/**`/`recipe/**`/`format/**`
  and `report.ts`/`log-post.ts`/`pick-cast.ts` are byte-for-byte untouched.
- [x] 8.3 Write the Build Report into `handoff.md`, explicitly flagging the FAKE `PerformanceScrapePort`
  (no live Apify, no Magnific at all in this slice) and listing Non-Goals/Known Limits transparently.
