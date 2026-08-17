## Why

#204's importer ran for real on 2026-08-17. Its reconciliation reported 61/61 Ideas, 54/54 Assets,
66/66 Jobs — every counted category matched exactly — and it still lost data. `data/brands/straw-motion/
ledger.json` carries 7 Assets with a `post_url` (Facebook permalinks, W32 news-carousels). After the
real import the `asset` table has no `post_url` column and the `post` table has 0 rows;
`grep -rn "post_url\|recordPost\|postUrl" src/importer/` returned nothing.

The reconciliation could not have caught this, because it only ever counted the three entities AC12 of
#204 named. A category that is never counted cannot come up short. That is the lesson this change
carries forward: the reconciliation must now state what it does *not* cover as explicitly as what it
does, so a future gap is visible on the report itself, not just discoverable by an Operator who happens
to grep for a specific field name.

These 7 rows matter beyond their count. ADR-0028 (#201) made Post its own record keyed
`(asset_id, channel_id)`; #203 built the `post`, `metric_snapshot`, and `performance_score` tables — all
three are empty today. The `explicit-attribution` always-rule states a Post links to an Idea only via the
logged URL, never inferred — so until these 7 rows exist in SQL, that link exists nowhere relational.
#200's Apify scrape scores exactly these 7 posts; with no `post` rows it has nothing to attach metrics
to, and 31 Ideas currently record the neutral `0.5` Relevance fallback because nothing has ever been
measured. These 7 rows are what let the feedback loop start.

## What Changes

- **The importer now plans and creates a Brand's Channel rows** (`channel`, ADR-0019) — the importer
  never created a single one before this change (`#204`'s own `handoff.md` named this explicitly as a
  known gap: "importing `post`/`copy_variant` needs a `channel` row to key against, which needs a scope
  decision... this ticket was not asked to make"). A Brand's `channel` list is read from
  `brand-profile.yaml` via the existing `loadChannels` loader (already used elsewhere in this module,
  never a new raw-YAML reader), validated against `KNOWN_PLATFORMS`, and created before any of that
  Brand's Formats/Runs/Ideas/Assets — so a Post always has a real Channel row to key against by the time
  it is written.
- **The Channel a Post belongs to is resolved from the URL itself, never assumed.** A new pure module,
  `src/importer/resolve-post-platform.ts`, determines the platform purely from a `post_url`'s own
  hostname — never from the Brand's primary Channel, never hardcoded to Facebook just because every real
  Post today happens to be one. The resolved platform is then checked against that specific Brand's own
  configured Channel platforms; a platform the Brand has no configured Channel for, or a URL that does
  not resolve to any of the six known platforms, is a named refusal — exactly like every other
  unparseable record this importer already refuses on, never a silent drop.
- **`src/importer/plan-idea.ts`'s `planOneAsset` carries `postUrl`/`postedAt`/the resolved `postPlatform`
  onto a `PlannedAsset` only when the source Asset record itself carries a `post_url`.** An Asset with no
  `post_url` carries none of the three fields and therefore produces no `post` row at execute time — the
  count stays meaningful, proven directly by a test. An Asset with `post_url` but no `posted_at` is a
  named refusal, never a fabricated timestamp.
- **`src/importer/execute.ts`'s `executeImport` creates every Brand's Channel rows right after the Brand
  itself, before any Format/Run/Idea/Asset, and logs each resolved Post through
  `src/command-surface/index.ts`'s existing `logPost` (`PostStore.recordPost`), keyed
  `(asset_id, channel_id)` per ADR-0028 — never a store bypassed.** `src/command-surface/tenancy.ts`
  gains `createChannel`, following the exact pattern `createBrand`/`createFormat`/`createRun` already
  established for the importer's own tenancy/config needs; `createChannel`'s own store
  (`src/channel/store.ts`) and its write functions (`createChannel`/`setPrimaryChannel`) are already
  registered with the store-write boundary guard (`src/store-write-boundary/scan.ts`) from issue #222 —
  no guard changes are needed by this change.
- **The reconciliation gains a fourth counted category, Posts**, alongside the existing Ideas/Briefs,
  Assets, and Jobs — "counts in" (from the plan) vs "counts out" (a real query against `post` joined to
  `asset`/`idea`), exactly mirroring how the other three are already computed. `formatReconciliationMarkdown`
  now also states, in prose, on the report itself, exactly which entities this reconciliation counts and
  cross-checks (Ideas, Assets, Jobs, Posts) and which it does not (Brand, Channel, Format, Run, Trend,
  `idea_recipe`, `asset_media`, `gate_request`, `copy_variant`, `metric_snapshot`, `performance_score`,
  `channel_baseline`, `brand_asset`, `baseline_prompt`) — so a category never named on the report can
  never again silently masquerade as "everything reconciled."
- **Golden-file coverage proves the real shape of Straw Motion's 7 Posts**, not an idealised one: all 7
  are `news-carousel`, all from Run `2026-W32`, all resolve to `facebook`, and — checked directly against
  the real ledger — none of the 7 share an Idea (each `post_url` belongs to a different Idea, one Asset
  each).
- **Fixed by re-running, not backfilling.** No second code path is added to write a `post_url` outside
  the importer's own plan → execute chain — the same property #204 was built for ("a rehearsal proves the
  exact command the real run will use"). This change's own final step deletes the SHARED checkout's
  gitignored `data/organicgrowth.db` and re-runs the single `npm run import-data --` command end to end
  from empty, posting the new reconciliation (7 Posts in, 7 out, alongside the unchanged 61/54/66) on
  issue #204's own comment thread, matching #204's own established practice for a completed real/rehearsal
  run.

## Impact

- **New code:** `src/importer/resolve-post-platform.ts` (+`.test.ts`).
- **Modified code:** `src/importer/plan.ts` (Channel planning + validation, `brandChannelPlatforms`
  threaded into `PlanIdeaDeps`), `src/importer/plan-idea.ts` (`PlannedAsset` gains
  `postUrl`/`postedAt`/`postPlatform`, `planOneAsset` resolves and refuses), `src/importer/execute.ts`
  (Channel creation, `logPost` calls, `ExecuteCounts` gains `channels`/`posts`), `src/importer/
  reconcile.ts` (Posts in/out, the new coverage prose), `src/command-surface/tenancy.ts` +
  `src/command-surface/index.ts` (`createChannel`), plus each touched module's own test file, `src/
  importer/plan.test.ts` (Channel/Post-resolution coverage, real-data Posts assertion),
  `src/importer/golden-shapes.test.ts` (the real 7 Posts' shape), `src/importer/execute.test.ts` and
  `src/importer/reconcile.test.ts` (new `channels` field, Post-creation coverage).
- **Untouched (deliberately):** `src/db/schema.ts`/`src/db/migrate.ts` (no new migration — `channel`/
  `post` already exist from #201/#203), `src/channel/store.ts`, `src/post/store.ts` (both used exactly as
  built, no behavior change), `data/brands/*/ledger.json` and `data/queue.json` (read-only throughout —
  the real 7 `post_url` values already exist there; this change only teaches the importer to read them).
- **Hermetic.** No `magnific`/Zoho MCP tool is imported or called anywhere in this change. Every test
  opens a real, throwaway SQLite file (`withTempDb`, never `:memory:`) or a mkdtemp'd mini-repo copy —
  never the live checkout, mirroring #204's own established testing pattern exactly.
- **Always-rules upheld:** `explicit-attribution` is what this change directly restores — a Post is
  linked to its Asset/Channel only via the logged `post_url`/resolved platform, never inferred.
  `ledger-as-source-of-truth` is preserved: the ledger's `post_url`/`posted_at` fields are read, never
  written, by this change. `generate-never-publish`/`public-metrics-only`/`relative-not-absolute` are
  untouched by construction (no content-generation, publication, or metrics code here).

## Capabilities

### Modified Capabilities

- `importer`: gains Channel planning/creation, Post resolution/creation (URL-based, never hardcoded),
  the "no post_url -> no post row" guarantee, the reconciliation's fourth counted category (Posts) plus
  its explicit coverage prose, and golden-file coverage for the real 7 Straw Motion Posts.
