## 1. Re-derive the count and read the terrain before writing any code

- [x] 1.1 Re-run `git grep -l "node:fs" -- 'src/**/*.ts' | grep -v test` — confirms 33, not the issue's
  stated ~41. State the real figure in `proposal.md` and the audit; do not carry the stale number
  forward.
- [x] 1.2 Read every one of the 33 modules' own doc comments and actual `node:fs` usage lines (not just
  their imports) — enough to give each an honest, specific verdict rather than a generic one.
- [x] 1.3 Read the four existing ports (`SpaceMcpPort`, `PerformanceScrapePort`, `MediaHostPort`, the
  Zoho MCP schedule port) and confirm none of the 33 modules' concerns fit behind any of them.
- [x] 1.4 Read every `{ db }`-backed store shipped by #201/#222/#223/#203 (`brand`, `channel`, `format`,
  `copy`, `brand-asset`, `production-spec`, `asset`, `idea`, `trend`, `job-store`, `gate-request-store`,
  `post`, `performance`) — their exact exported operation names and signatures, to design the command
  surface as thin wrappers, never new logic.
- [x] 1.5 Confirm, by grep, that NO current production module outside these stores/tests imports their
  write functions — the fact `proposal.md`'s "Known gaps" section relies on for AC2 without a second
  automated guard. Re-confirm at the end (task 7.2).

## 2. The node:fs boundary guard, landed as a ratchet (test-first)

- [x] 2.1 Write `src/fs-boundary/scan.test.ts` first (pure, in-memory fixtures: `isTestPath`,
  `importsNodeFs`, `findNodeFsImports`) — including the false-positive case a bare substring search would
  fail (a doc comment merely mentioning the target module in prose, with no real import).
- [x] 2.2 Implement `src/fs-boundary/scan.ts` — an actual import/require-SITE match, never a substring
  search.
- [x] 2.3 Write `src/fs-boundary/allow-list.ts` with all 33 of today's real violators (including
  `src/commands/run-pipeline.ts`, the one genuine bypass) — the ratchet's starting checkpoint.
- [x] 2.4 Write `src/fs-boundary/node-fs-guard.test.ts` (the one place this check touches disk): walk
  `src/`, assert `findNodeFsImports` returns exactly `NODE_FS_ALLOW_LIST`, both directions. Run it —
  green against the real 33.
- [x] 2.5 Commit this checkpoint (33/33 green) before doing any sweep — proves the ratchet starts from
  reality, not a pre-solved state.

## 3. The sweep: fix the one genuine bypass

- [x] 3.1 Read `src/ledger/ledger.ts`'s `loadBaseline` and `src/commands/run-pipeline.test.ts`'s existing
  baseline-advisory tests (C21) — confirm `loadBaseline`'s `updated_at` field reproduces the exact
  `baselineExists` behavior the raw `readFile`/`JSON.parse` computed, so the swap needs no test changes.
- [x] 3.2 Swap `run-pipeline.ts`'s raw ledger read for `loadBaseline`; remove its `node:fs/promises`
  import entirely.
- [x] 3.3 Run `src/commands/run-pipeline.test.ts` — still green, unchanged, proving behavior preserved
  (plus an improvement: a genuinely corrupt ledger now propagates instead of silently reading as "no
  baseline").
- [x] 3.4 Shrink `NODE_FS_ALLOW_LIST` to 32 (remove `run-pipeline.ts`); re-run the guard — still green,
  now against the swept state. Commit.

## 4. The typed command surface (test-first, one domain area at a time)

- [x] 4.1 `trends.ts` — write `trends.test.ts` first (all-Trends, `[]` for none, `briefableOnly`
  filtering), then implement `listTrends`.
- [x] 4.2 `ideas.ts` — write `ideas.test.ts` first (`createIdea` round-trips; `recordReviewDecision`
  accepted-with-recipes, accepted-with-`[]`, rejected-with-reason, rejected-with-blank-reason throws),
  then implement `createIdea`/`recordReviewDecision`, documenting why the two-call accept+select
  composition is not wrapped in a further outer transaction (`withTransaction` does not nest).
- [x] 4.3 `jobs.ts` — write `jobs.test.ts` first (`enqueueJob` inserts `queued`/`attempt: 0`; `claimJob`
  claims and refuses a second concurrent claim; `releaseJob` moves `running` → `done` and refuses a
  non-`running` job), then implement `enqueueJob`/`claimJob`/`releaseJob`.
- [x] 4.4 `assets.ts` — write `assets.test.ts` first (`saveAsset` upserts and round-trips; a second
  Recipe on the same Idea gets its own row; `attachAssetMedia` inserts a batch, ordinal-ordered), then
  implement `saveAsset`/`attachAssetMedia`.
- [x] 4.5 `posts.ts` — write `posts.test.ts` first (`logPost` records, and re-logging the SAME
  `(asset, channel)` updates in place), then implement `logPost`.
- [x] 4.6 `performance.ts` — write `performance.test.ts` first (`readPerformance` on an unmeasured Post
  is `{ snapshots: [], latestScore: null }`; records + reads return every snapshot and the latest score),
  then implement `readPerformance`/`recordPerformanceSnapshot`/`recordPerformanceScore`.
- [x] 4.7 `index.ts` — the barrel; write `index.test.ts` first (one integration test driving Trend → Idea
  → Review → Job → Asset → Post → Performance entirely through `index.ts`'s own exported names), then
  write the barrel re-exports.
- [x] 4.8 Re-run the node:fs guard — still green at 32; the command surface introduces no new `node:fs`
  usage anywhere.

## 5. Docs accuracy

- [x] 5.1 Extend rule 7 (`.claude/rules/always/organicgrowth-rules.md`): add issue #203's own
  Job/Gate Request/Post/Performance stores to the SQL-backed list (a small, low-risk factual fix noticed
  while in the neighborhood — #203 never added itself), name the typed command surface and its
  not-yet-wired status, name the automated node:fs guard. Never touch the ALREADY-pinned #222/#223/#204
  sentences.
- [x] 5.2 Extend `openspec/project.md`'s Tech stack paragraph the same way.
- [x] 5.3 Add new `src/db/adr.docs-test.ts` assertions pinning the new rule 7 prose.

## 6. Post the audit

- [x] 6.1 Write the full per-module audit table (verdict + reason per module, not a bare filename list —
  the issue's own instruction) and post it to issue #205 via `gh issue comment 205`.

## 7. OpenSpec + full-suite green + self-review + Build Report

- [x] 7.1 Author spec deltas: `specs/command-surface` (ADDED), `specs/node-fs-boundary-guard` (ADDED).
  Run `openspec validate --strict` until green.
- [x] 7.2 Re-confirm (grep) that no production module outside stores/tests/`command-surface/` imports a
  SQL store's write functions — the AC2 verification `proposal.md`'s "Known gaps" section promises at
  both the start and the end of this ticket.
- [x] 7.3 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 3061/783/0-fail
  baseline.
- [x] 7.4 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #205
  acceptance criterion maps to a specific test.
- [x] 7.5 Write the Build Report into `handoff.md`.
