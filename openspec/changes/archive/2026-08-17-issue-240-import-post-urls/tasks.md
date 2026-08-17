## 1. Ground the build — read before writing any code

- [x] 1.1 Read issue #240's body and confirm #204 (its only blocker) is merged.
- [x] 1.2 Read ADR-0028 (Post is its own record) and ADR-0029 (SQLite) to confirm the `post`/`channel`
  tables' exact shape and constraints.
- [x] 1.3 Read #204's own `handoff.md` / archived `proposal.md` — confirm it explicitly named Channel/
  Post as a known, undone gap ("importing post/copy_variant needs a channel row to key against... this
  ticket was not asked to make [that scope decision]").
- [x] 1.4 Read `src/post/store.ts` and `src/channel/store.ts` (both already built by #203/#222) and
  `src/command-surface/posts.ts` (the existing `logPost` command-surface function, unused by the
  importer until this change).
- [x] 1.5 Inspect the real `data/brands/straw-motion/ledger.json`: confirm exactly 7 Assets carry
  `post_url`, all `news-carousel`/Run `2026-W32`/Facebook, and that none of the 7 share an Idea (each
  belongs to a distinct Idea) — the real shape the golden fixture must cover.

## 2. Pure deep module (test-first)

- [x] 2.1 `src/importer/resolve-post-platform.ts` (+`.test.ts`) — `resolvePostPlatform`: a Post's logged
  URL to a `KnownPlatform`, from its hostname alone. Covers all six `KNOWN_PLATFORMS` entries, common
  short-link hosts (`fb.watch`, `twitter.com`, `youtu.be`), an unparseable string, and a host matching
  none of the six.

## 3. Command-surface addition the importer needs (test-first)

- [x] 3.1 `src/command-surface/tenancy.ts` (+`.test.ts`) — `createChannel`, following the exact pattern
  `createBrand`/`createFormat`/`createRun` already established. `src/channel/store.ts`'s own write
  functions are already registered with the store-write boundary guard (issue #222) — no guard changes
  needed.
- [x] 3.2 `src/command-surface/index.ts` — re-export `createChannel`/`ChannelInput`/`ChannelRecord`.

## 4. Planning: Channel list + Post resolution (test-first)

- [x] 4.1 `src/importer/plan.ts` — `ChannelPlanItem`, `BrandPlanItem.channels`; `planBrand` loads a
  Brand's Channel list via the existing `loadChannels`, validates each entry's `platform` against
  `KNOWN_PLATFORMS` (a problem, never a silently-skipped Channel), and threads the resulting
  `brandChannelPlatforms` set into `PlanIdeaDeps`.
- [x] 4.2 `src/importer/plan-idea.ts` — `PlanIdeaDeps.brandChannelPlatforms`; `PlannedAsset` gains
  `postUrl`/`postedAt`/`postPlatform`; `planOneAsset` resolves an Asset's `post_url` (via
  `resolvePostPlatform`) against the Brand's own configured platforms, refusing (never silently
  dropping) an unresolvable platform, an out-of-vocabulary platform, or a `post_url` with no
  `posted_at`. An Asset with no `post_url` carries none of the three fields.
- [x] 4.3 `src/importer/plan.test.ts` — Channel planning + Post resolution unit coverage (happy path, no
  Channel list configured, unknown platform, post_url resolving to an unconfigured platform), plus the
  real-data structural smoke test extended to assert `totalPosts === 7` and every one resolves to
  `facebook`.
- [x] 4.4 `src/importer/plan-idea.test.ts` — `planOneAsset`'s Post-resolution unit coverage, one test per
  named refusal plus the happy path and the no-`post_url` case.

## 5. Execution: create Channels, log Posts (test-first)

- [x] 5.1 `src/importer/execute.ts` — `executeBrand` creates every planned Channel right after the Brand
  itself (before any Format/Run/Idea/Asset); the Asset loop calls `logPost` (via the command surface)
  whenever a `PlannedAsset` carries a `postUrl`, resolving `channelId` from the Channel-creation map
  keyed by platform; `ExecuteCounts` gains `channels`/`posts`.
- [x] 5.2 `src/importer/execute.test.ts` — a Post row is created and correctly keyed to its Asset and
  Channel; an Asset with no `postUrl` writes no `post` row (proven by a real `COUNT(*)`); an internal
  defensive-error test for a planned `postPlatform` with no matching created Channel (a shape
  `planImport` should already have refused); the end-to-end `planImport` -> `executeImport` mini-repo
  test extended with a Channel + a `post_url`.

## 6. Reconciliation: Posts in/out, plus the coverage prose (test-first)

- [x] 6.1 `src/importer/reconcile.ts` — `BrandReconciliation`/`ReconciliationTotals` gain
  `postsIn`/`postsOut`; `countIn`/`countOut` compute them (in: from the plan; out: a real
  `post JOIN asset JOIN idea` query); `formatReconciliationMarkdown` renders the new column plus a
  prose section naming exactly which entities this report counts/cross-checks and which it does not.
- [x] 6.2 `src/importer/reconcile.test.ts` — Posts in/out asserted alongside the existing three
  categories (matching case + the "nothing executed" mismatch case); the Markdown test asserts the new
  column and the coverage prose (including that it names an UN-counted entity, e.g. `channel_baseline`).

## 7. Golden-file coverage for the real 7 Posts (test-first)

- [x] 7.1 `src/importer/golden-shapes.test.ts` — one dedicated test reading the real Straw Motion ledger
  directly: all 7 `post_url`-carrying Assets are `news-carousel`, all from Run `2026-W32`, all resolve
  to `facebook`, and none of the 7 share an Idea.

## 8. The real, final run (AC6)

- [x] 8.1 Delete the SHARED checkout's (this worktree's) gitignored `data/organicgrowth.db`, if present.
- [x] 8.2 Run `npm run import-data --` end to end against this worktree's real `data/` (an empty
  database is the only precondition the command itself enforces).
- [x] 8.3 Confirm the printed reconciliation shows `61/61` Ideas, `54/54` Assets, `66/66` Jobs (unchanged)
  and the new `7/7` Posts.
- [x] 8.4 Post the reconciliation on issue #204's own comment thread (`gh issue comment 204`), matching
  #204's own established practice for a completed rehearsal/real run.

## 9. OpenSpec + full-suite green + self-review + Build Report

- [x] 9.1 Author `proposal.md`, this `tasks.md`, and the `importer` capability's spec deltas
  (`specs/importer/spec.md`) — one MODIFIED reconciliation requirement (matching the LIVE spec's wording
  verbatim before extending it), plus ADDED requirements for Channel-resolved Post creation, the
  no-`post_url`-no-`post`-row guarantee, and the real golden-file coverage. Run
  `openspec validate --strict` until green.
- [x] 9.2 Run `npx tsc -p tsconfig.json --noEmit` and `npm test` — green, at/above the 3313/863/0-fail
  baseline.
- [x] 9.3 Self-review pass: confirm every issue #240 acceptance criterion maps to a specific test; remove
  any dead code/unused exports.
- [x] 9.4 Write the Build Report into `handoff.md`.
