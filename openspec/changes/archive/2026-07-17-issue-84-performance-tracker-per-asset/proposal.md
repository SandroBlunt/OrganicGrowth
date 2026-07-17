## Why

Parent #60's "`/track-performance` shows the two Assets independently" acceptance criterion needs this
(flagged as its own plain issue in map #70). ADR-0011 moved production state off the Idea onto a
per-Recipe **Asset** (`Idea.assets[]`) back in issue #55, and issue #56 re-graINed `/log-post` and
`/report` onto that same grain. `/track-performance` never got the equivalent treatment: there is **no
code behind it at all** — every step (select Ideas, scrape Apify by hand, compute the score, edit
`ledger.json`) is done freeform by the `performance-tracker` agent via `Read`/`Write`/`Bash`, and its
prose (already updated in issue #56 to talk about Assets/Recipes) has no test proving the described
behavior is what actually happens. A Brand with one Idea posted through two Recipes has no tested
guarantee it gets two independent scores rather than one collapsed onto the other.

## What Changes

- **Add the missing implementation, test-first.** Four pure deep modules under `src/performance/`:
  - `selection.ts` — `selectTrackableAssets(ideas, { ideaId? })`: one selection PER `(Idea, Recipe)`
    Asset with a `post_url` at `posted`/`tracking` (default), or every one of a named Idea's Assets
    with a `post_url` regardless of status when `ideaId` is given (forces a re-pull, even of a
    `scored` Asset).
  - `score.ts` — `computePerformanceScore(metrics, baseline)`: the ADR-0001 formula (shares 0.35 ·
    comments 0.25 · reactions 0.20 · views 0.20, each `clip(metric/baseline_median, 0, 2)/2`), with a
    `null`/`0` baseline median scored NEUTRAL (`0.5`) rather than a fabricated ratio.
  - `maturity.ts` — `assetMaturityStatus(postedAt, now)`: `tracking` under 7 days old, `scored` at 7+,
    decided from THAT Asset's own `posted_at`; `null` (never guessed) for an unparseable timestamp.
  - `metrics.ts` — `median`/`recomputeBaseline`: the Channel's per-metric rolling medians.
- **Extend the Asset schema** (`src/asset/asset.ts`, `LedgerAssetRecord`): `metrics` (the four public
  readings behind the current `performance_score`), `tracked_at` (ISO-8601), and `history` (a small
  trail of prior readings, pushed before each overwrite — Performance is a moving number until a Post
  matures). Parsed defensively; a malformed reading invalidates only itself, never the whole Asset.
- **Extend the ledger store** (`src/ledger/ledger.ts`): `loadBaseline`/`writeBaseline` — the typed
  read/write boundary for the Brand's ONE Channel baseline (`{ shares, comments, reactions, views,
  updated_at }`, all-null until first tracked), mirroring the existing thin write-shell pattern.
- **Add the Facebook metrics mapper** (`src/apify/normalize-metrics.ts`): `mapFacebookItem` — `likes`→
  reactions, `comments`→comments, `shares`→shares (Facebook DOES publicly expose a share count, unlike
  Instagram/YouTube), `viewsCount`→views — completing the three-platform set `detectPlatformFromUrl`
  already dispatches across. Field names are the Apify Store's DOCUMENTED output schema (not yet
  verified against a live sanctioned capture the way issue #48 did for Instagram/YouTube) — flagged
  honestly as a follow-up, backed by a SYNTHETIC fixture, never claimed as a live capture.
- **Add the orchestration shell** (`src/commands/track-performance.ts` + `track-performance-port.ts`):
  wires the above behind an injected `PerformanceScrapePort` — selects, detects platform, resolves the
  actor from `seeds.yaml`, scrapes (the port; a FAKE in every test), normalizes, scores, decides
  maturity, writes the ONE Asset via `AssetStore.writeAsset`, then recomputes + writes the ONE Channel
  baseline from every currently-`scored` Asset's `metrics` (falling back to whatever has been measured
  at all, before anything has matured — "seed the baseline from this batch"). Never fabricates: an
  Asset whose platform/actor is unresolvable, whose scrape returns nothing or errors, or whose
  `posted_at` is missing/unparseable is SKIPPED and reported, never guessed. The live Apify HTTP call is
  DEFERRED (the default port always reports "no data", mirroring `run-pipeline-ports.ts`'s
  `DEFAULT_APIFY_PORT`/`DEFAULT_MAGNIFIC_PORT` placeholders) — this module is the tested, canonical
  reference the `performance-tracker` agent's own Bash-driven Apify calls must match until it is wired.
- **Update the docs.** `.claude/commands/track-performance.md` now names the real code path (mirrors
  `/log-post`'s "Run `npm run X` (or call the function directly)" convention). `.claude/agents/
  performance-tracker.md` is corrected to attribute a result to the `(Idea, Recipe)` **Asset** (not a
  flat Idea), states an Idea with two posted Assets scores independently, documents Facebook's real
  share count, and references the new canonical modules. Both are pinned by docs-tests
  (`src/commands/track-performance.docs-test.ts`, plus the pre-existing `src/apify/apify-docs.test.ts`
  stays green).

## Non-Goals (explicitly deferred)

- **The live Apify HTTP adapter.** `DEFAULT_PERFORMANCE_SCRAPE_PORT` is a deferred placeholder, exactly
  like `run-pipeline-ports.ts`'s existing probes — never exercised by a test. The `performance-tracker`
  agent's Bash-tool-driven `curl` calls remain the sanctioned way to pull real metrics until a live
  adapter is wired (a future slice).
- **Facebook live field-name verification.** `mapFacebookItem`'s field names come from Apify's
  documented schema, not a sanctioned live capture (issue #48 did that for Instagram/YouTube only).
  Flagged as a follow-up in the module docstring and `src/apify/fixtures/README.md`.
- **Meta Content export enrichment** (Saves/Net-follows/watch-through). Already optional/manual per
  ADR-0001; untouched by this slice.
- **A `history` length cap.** Unbounded for now (small in practice at weekly cadence); a future
  concern if it ever grows unwieldy.
- **`/report`'s own code.** Already reads per-Asset `performance_score`/`post_url` and computes the
  best-of-N summary (issue #56) — this slice proves `/track-performance` feeds it correctly
  end-to-end but does not modify `report.ts` itself.

## Capabilities

### Added Capabilities

- `performance-tracking`: the per-Asset selection/scoring/maturity/baseline-recompute pipeline and its
  hermetic, FAKE-Apify-backed orchestration shell.

### Modified Capabilities

- `asset-store`: `LedgerAssetRecord` gains `metrics`/`tracked_at`/`history`, parsed defensively.
- `apify-platform-integration`: adds `mapFacebookItem`, completing the three-platform metrics mapping.

## Impact

- **New code:** `src/performance/{selection,score,maturity,metrics}.ts` (+ `.test.ts` each),
  `src/commands/track-performance.ts`, `src/commands/track-performance-port.ts` (+
  `track-performance.test.ts`, `track-performance.docs-test.ts`).
- **Modified code:** `src/asset/asset.ts` (+`asset.test.ts` additive), `src/ledger/ledger.ts`
  (+`ledger.test.ts` additive), `src/apify/normalize-metrics.ts` (+`normalize-metrics.test.ts`
  additive), `src/apify/fixtures/README.md`, `package.json` (new `track-performance` script),
  `.claude/commands/track-performance.md`, `.claude/agents/performance-tracker.md`, `CLAUDE.md`.
- **New fixture:** `src/apify/fixtures/facebook-post.synthetic-sample.json` (SYNTHETIC, not a live
  capture — documented as such).
- **Not touched:** `src/production-queue/**`, `src/space-driver/**`, `src/production-spec/**`,
  `src/recipe/**`, `src/format/**`, `src/commands/report.ts`, `src/commands/log-post.ts`,
  `src/commands/pick-cast.ts`.
- **Hermetic:** no live `spaces_*`/`creations_*` calls (no Magnific involvement in this slice at all);
  no live Apify HTTP calls in any test — every scrape in `track-performance.test.ts` goes through a
  FAKE `PerformanceScrapePort` (`grep -rn "spaces_\|creations_\|FakeSpace" src/performance/
  src/commands/track-performance*.ts` → no matches).
- **Always-rules upheld:** public-metrics-only (Apify only; Meta-export enrichment untouched, still
  optional); relative-not-absolute (every score computed via `computePerformanceScore` against the ONE
  Channel baseline, never a raw count); explicit-attribution (writes land on exactly one `(Idea,
  Recipe)` Asset via `AssetStore.writeAsset`, sibling Assets untouched — proven by a dedicated test);
  predicted-vs-measured (this slice only ever writes `performance_score`, never touches `fit_score`);
  ledger-as-source-of-truth (every write goes through `AssetStore.writeAsset`/`writeBaseline`, never a
  stray `writeFile`); never-fabricate (every skip path is tested: unresolvable platform/actor, empty
  scrape, thrown scrape error, missing `posted_at`).
