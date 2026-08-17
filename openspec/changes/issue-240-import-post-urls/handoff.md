# Slice Handoff — issue #240: the importer drops the 7 published post URLs

## Build Report (developer)

### What changed

`#204`'s real import (2026-08-17) reported 61/61 Ideas, 54/54 Assets, 66/66 Jobs — every counted
category matched — while silently dropping the 7 real Straw Motion `post_url` values that exist only
in `data/brands/straw-motion/ledger.json`. This slice:

1. Teaches the importer about a Brand's Channel list for the first time (`#204`'s own `handoff.md`
   explicitly named this as an undone gap): `planImport` now reads `brand-profile.yaml`'s `channel`
   list via the existing `loadChannels` loader, validates each entry's `platform` against
   `KNOWN_PLATFORMS`, and `executeImport` creates every Channel row right after the Brand itself —
   before any Format/Run/Idea/Asset — so a Post always has a real Channel to key against.
2. Resolves the Channel an Asset's `post_url` belongs to **from the URL's own hostname alone**
   (`src/importer/resolve-post-platform.ts`, new) — never assumed from the Brand's primary Channel,
   never hardcoded to Facebook. The resolved platform is then checked against that specific Brand's
   own configured Channel platforms; an unresolvable platform, an out-of-vocabulary platform, or a
   `post_url` with no `posted_at` is a named refusal — exactly like every other unparseable record this
   importer already refuses on, never a silent drop.
3. Logs each resolved Post through the existing `src/command-surface/index.ts`'s `logPost`
   (`PostStore.recordPost`), keyed `(asset_id, channel_id)` per ADR-0028 — never a store bypassed.
   `src/command-surface/tenancy.ts` gains `createChannel`, following the exact pattern
   `createBrand`/`createFormat`/`createRun` already established.
4. An Asset with no `post_url` carries none of the three new `PlannedAsset` fields and therefore
   produces no `post` row — proven directly by a `COUNT(*)` in a test, not inferred.
5. The reconciliation gains a fourth counted category, **Posts**, and now states in prose — on the
   report itself, not just in a source comment — exactly which entities it counts/cross-checks and
   which it does not. This is the ticket's own real lesson: a category never named on the report cannot
   be proven complete by it, which is exactly how the 7 Posts went missing while everything counted
   stayed green.
6. Golden-file coverage proves the real shape directly against the ledger: all 7 `post_url`-carrying
   Assets are `news-carousel`, all from Run `2026-W32`, all resolve to `facebook`, and — checked
   explicitly — **none of the 7 share an Idea** (each belongs to a distinct Idea, one Asset each).
7. **Fixed by re-running, not backfilling.** No second code path writes a `post_url` outside the
   importer's own plan → execute chain. `data/organicgrowth.db` (gitignored, absent before this slice
   in this worktree) was created fresh by deleting nothing (none existed) and running the single
   `npm run import-data --` command end to end. The resulting reconciliation — 61/61 Ideas, 54/54
   Assets, 66/66 Jobs, **7/7 Posts** — was posted to issue #204's own comment thread:
   https://github.com/SandroBlunt/OrganicGrowth/issues/204#issuecomment-5316822899

### Files touched

- **New:** `src/importer/resolve-post-platform.ts` (+`.test.ts`).
- **Modified:** `src/importer/plan.ts` (`ChannelPlanItem`, `BrandPlanItem.channels`, Channel planning +
  validation, `brandChannelPlatforms` threaded into `PlanIdeaDeps`); `src/importer/plan-idea.ts`
  (`PlannedAsset` gains `postUrl`/`postedAt`/`postPlatform`, `planAssetPost` + `planOneAsset` wiring);
  `src/importer/execute.ts` (`executeChannels`, `logPost` call in the Asset loop, `ExecuteCounts` gains
  `channels`/`posts`); `src/importer/reconcile.ts` (Posts in/out, the coverage-prose section);
  `src/command-surface/tenancy.ts` + `src/command-surface/index.ts` (`createChannel`); each touched
  module's own test file (`plan.test.ts`, `plan-idea.test.ts`, `execute.test.ts`, `reconcile.test.ts`,
  `golden-shapes.test.ts`, `tenancy.test.ts`); `openspec/project.md` (stale Tech-stack paragraph
  corrected, mirroring #204's own precedent for a completed real run).
- **OpenSpec:** `openspec/changes/issue-240-import-post-urls/{proposal.md,tasks.md,specs/importer/
  spec.md}` (this file).
- **Untouched (deliberately):** `src/db/schema.ts`/`src/db/migrate.ts` (no new migration — `channel`/
  `post` already existed from #201/#203), `src/channel/store.ts`, `src/post/store.ts` (used exactly as
  built), `data/brands/*/ledger.json`, `data/queue.json` (read-only throughout).

### How to run

```
npx tsc -p tsconfig.json --noEmit
npm test
npx openspec validate issue-240-import-post-urls --strict
npx openspec validate --all --strict
```

Targeted:

```
npx tsx --test src/importer/*.test.ts src/command-surface/*.test.ts src/store-write-boundary/*.test.ts
```

The real, final run (already performed as part of this build; do not repeat unless verifying — it
refuses against a non-empty database):

```
rm -f data/organicgrowth.db      # only if a stale one exists from a prior partial attempt
npm run import-data -- --reconciliation-out data/reconciliation.md
```

### Acceptance-criteria self-assessment

| AC | Requirement | Proven by |
| --- | --- | --- |
| 1 | Each ledger `post_url` becomes a `post` row keyed `(asset_id, channel_id)`, per ADR-0028 | `src/importer/execute.test.ts` — "resolves an Asset's postPlatform against the created Channel and writes one post row (issue #240)" (asserts `channel_id` matches the created Facebook Channel row); `src/importer/execute.test.ts` — the end-to-end `planImport → executeImport` mini-repo test (Channel in `brand-profile.yaml` → real `post` row); `src/importer/golden-shapes.test.ts` — the real 7; the real run itself (7/7 posted on issue #204) |
| 2 | The Channel is resolved, not assumed — explicit and stated, never hardcoded to one platform | `src/importer/resolve-post-platform.test.ts` — one test per `KNOWN_PLATFORMS` entry (all 6, not just Facebook) plus short-link hosts; `src/importer/plan-idea.test.ts` — "refuses when post_url resolves to a platform the Brand has no configured Channel for" (proves the check is per-Brand-configured, never a hardcoded assumption); `src/importer/plan.test.ts` — Channel-list-planning tests |
| 3 | An Asset with no `post_url` produces no `post` row, proven by a test | `src/importer/execute.test.ts` — "an Asset with no postUrl writes no post row — the count stays meaningful (issue #240 AC3)" (direct `SELECT COUNT(*) FROM post`); `src/importer/plan-idea.test.ts` — "an Asset with no post_url carries none of the three Post fields" |
| 4 | Reconciliation gains a Posts in/out column, and states in prose what it does/does not cover | `src/importer/reconcile.test.ts` — Posts in/out asserted (matching + mismatch cases); the Markdown test asserts the new column, the "What this reconciliation covers" heading, "NOT independently counted", and names an un-counted entity (`channel_baseline`) |
| 5 | Golden-file test covers the real shape of all 7, including any sharing an Idea | `src/importer/golden-shapes.test.ts` — "all 7 are news-carousel, all from Run 2026-W32, all resolve to facebook, and NONE share an Idea" (reads the real ledger directly, asserts the Idea-id set has no duplicates) |
| 6 | Re-run end to end from empty, new reconciliation posted on #204 (7/7 alongside 61/54/66) | Performed directly: `npm run import-data --` run against this worktree's real `data/`; reconciliation showed `61/61, 54/54, 66/66, 7/7`; posted at https://github.com/SandroBlunt/OrganicGrowth/issues/204#issuecomment-5316822899 |

### Fakes / fixtures used

- **No Magnific fake needed** — this slice never touches the Space, Copy, or any generation/publication
  path. `grep -rn "magnific\|spaces_\|creations_" src/importer/` (before and after this change) returns
  nothing; confirmed no MCP tool is imported or called anywhere in the touched files.
- **SQLite:** every test opens a real, throwaway `node:sqlite` file via `src/db/test-support.ts`'s
  `withTempDb` — never `:memory:`, matching this epic's own Testing Decisions and every existing
  importer test's convention.
- **Mini-repo fixtures:** `mkdtemp`'d temp directories built by hand (`withMiniRepo` helpers already
  established in `plan.test.ts`/`execute.test.ts`), never the live checkout, for every Channel/Post
  planning and execution unit test.
- **Real-data smoke tests:** `plan.test.ts`'s structural smoke test and `golden-shapes.test.ts` read
  the real, tracked `data/brands/straw-motion/ledger.json`/`data/brands/mundotip/ledger.json`
  READ-ONLY (never written to) — the same established pattern every prior importer golden-file test
  already uses.
- **The one real write this slice performs** is the final AC6 run: `npm run import-data --` against
  this worktree's own `data/`, writing only the gitignored `data/organicgrowth.db` — never the live
  `/Users/CaxtonTaylor/Developer/OrganicGrowth` checkout, per the task's own explicit boundary.

### Self-review notes

- Removed a dead compile-time "exhaustiveness reminder" stub from `resolve-post-platform.ts` that did
  not actually enforce anything at compile time (a raw array re-typed against itself) — the real
  exhaustiveness proof is `resolve-post-platform.test.ts`'s own test iterating every `KNOWN_PLATFORMS`
  entry.
- Kept `resolve-post-platform.ts` genuinely separate from `src/apify/platform.ts`'s
  `detectPlatformFromUrl` rather than reusing/widening it — that resolver is deliberately scoped to
  Apify-actor-verified platforms (a different, narrower concern; its own doc comment says so), and
  widening it would have silently coupled Post-Channel resolution to Apify actor availability.
- `planAssetPost` (the new pure helper inside `plan-idea.ts`) mirrors `planAssetMedia`'s existing
  `{ fields, problem? }` shape rather than inventing a new refusal convention.
- Verified with the actual `npm test` run (not just by inspection) that no new store-write-boundary
  violation was introduced — `createChannel`/`recordPost` (via `logPost`) were already registered in
  `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` from issues #222/#203, so no guard or
  allow-list change was needed by this slice.

### Known limits

- **Two Channel entries with the same `platform` on one Brand** (not present in either real
  `brand-profile.yaml` today — verified) would silently collapse to whichever is created last in
  `executeChannels`' platform→id map. Not a regression (nothing before this slice created Channel rows
  at all) and not exercised by real data; flagged here rather than guarded against, since guarding
  against it would need a new refusal category no acceptance criterion or real record asks for.
- **The dead-media-paths count reported by this worktree's real run (260) is a worktree-local
  artifact, not a regression.** This worktree, like CI, does not carry the ~813 MB of untracked,
  gitignored produced media (`.output/` directories) that a full checkout with the real corpus holds —
  `plan.test.ts`'s own real-data smoke test already documents this exact caveat. The 8 dead paths
  #204's own rehearsal reported (against a full copy of `data/`) are unaffected by this slice.
- **`data/reconciliation.md` was deliberately NOT committed.** No prior real run ever committed one
  (`git log` shows none); the established practice (#204's own rehearsal) is to post it as a `gh issue
  comment`, which this slice did. The `.gitignore`'s own comment ("the reconciliation report is what
  gets committed, never the database") is aspirational, not yet realized by any prior slice — raised
  here rather than silently deviating from it without comment.
- **`data/organicgrowth.db` now exists in this worktree** (gitignored, ~1.4 MB) as the AC6 real run's
  own artifact, left in place for qa's own inspection/verification rather than deleted after the build.
