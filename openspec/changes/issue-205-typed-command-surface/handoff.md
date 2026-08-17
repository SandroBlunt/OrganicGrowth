# Slice Handoff — issue #205: the typed command surface, and direct file access swept behind it

## Build Report

### What changed

Two things, exactly as the issue asked, plus the audit that ties them together:

1. **A typed, in-process command surface** (`src/command-surface/`) — plain exported TypeScript
   functions, one file per domain area, each a thin orchestration shell over the SQL-backed `{ db }`
   stores #201/#222/#223/#203 already shipped:
   - `trends.ts` — `listTrends`.
   - `ideas.ts` — `createIdea`, `recordReviewDecision` (composes `acceptIdea`/`rejectIdea` with, for an
     acceptance, `selectIdeaRecipes` — one Operator decision, not two calls a caller must sequence).
   - `jobs.ts` — `enqueueJob`, `claimJob`, `releaseJob`.
   - `assets.ts` — `saveAsset`, `attachAssetMedia`.
   - `posts.ts` — `logPost`.
   - `performance.ts` — `readPerformance`, `recordPerformanceSnapshot`, `recordPerformanceScore`.
   - `index.ts` — the barrel, proven wired by one integration test driving a full pipeline turn (Trend →
     Idea → Review → Job → Asset → Post → Performance) through its own exported names only.
   `releaseJob`, `attachAssetMedia`, and the two Performance write commands are deliberate, minimal
   companions beyond the issue's own eight named operations — each individually justified in its own
   module's doc comment and in `proposal.md` (a command surface that can enqueue/claim a job but never
   finish it, or save an Asset but never record its media, cannot honor AC2 for its own domain).
2. **The `node:fs` audit and sweep.** Re-derived the real count myself: **33**, not the issue's stated
   "roughly 41" (`git grep -l "node:fs" -- 'src/**/*.ts' | grep -v test`). Read every one of the 33
   individually — its real purpose, not just its import line — and gave each one of the issue's own three
   verdicts. Full table posted to issue #205:
   https://github.com/SandroBlunt/OrganicGrowth/issues/205#issuecomment-5314811934
   - **1 moved behind a store**: `src/commands/run-pipeline.ts` (was reading the ledger raw via
     `readFile`+`JSON.parse`, bypassing `ledger.ts`'s own `loadBaseline` — and, unlike `loadBaseline`,
     silently swallowing a genuinely corrupt ledger as "no baseline"). Swept onto `loadBaseline`.
   - **0 moved behind a port** — none of the 33 fit `SpaceMcpPort`/`PerformanceScrapePort`/
     `MediaHostPort`/the Zoho MCP schedule port.
   - **32 legitimately direct**, each with a stated, specific reason (produced-media-on-local-disk per
     ADR-0029; already-the-store; foundational I/O primitives; ADR-0029-named documents including the
     Mention Handle Registry, issue #226; third-party/generated/ops artifacts; test/fixture/deferred-live
     code).
3. **The automated guard** (`src/fs-boundary/`) AC7 asks for: a pure detector (`scan.ts`) matching a real
   import/require SITE (never a bare substring search — this would have false-positived on its own doc
   comments, and did, mid-build; fixed by rewording, not by weakening the match), an allow-list
   (`allow-list.ts`) of the 32 legitimately-direct modules, and a disk-walking test
   (`node-fs-guard.test.ts`) asserting the two sets are exactly equal in both directions. **Landed as a
   ratchet**, per the issue's own suggested sequencing: the first commit (`854049e`) lands the guard green
   against the real starting state (33/33, `run-pipeline.ts` still included); the very next commit
   (`c0f51c8`) performs the sweep and shrinks the list to 32 in the same breath — proving the ratchet
   catches and fixes a real violation, not a pre-solved one.
4. **Docs accuracy**: rule 7 (`.claude/rules/always/organicgrowth-rules.md`) and `openspec/project.md`'s
   Tech stack paragraph now name the command surface and the guard, plus a small factual fix noticed
   while in the neighborhood — issue #203's Job/Gate Request/Post/Performance stores were never added to
   rule 7's SQL-backed store list. New `src/db/adr.docs-test.ts` assertions pin the additions; the
   already-pinned #222/#223/#204 sentences were never touched.

### Files touched

**New:**
- `src/command-surface/{trends,ideas,jobs,assets,posts,performance,index}.ts` (+ matching `.test.ts`
  files, 7 pairs)
- `src/fs-boundary/{scan,allow-list}.ts`, `src/fs-boundary/{scan,node-fs-guard}.test.ts`
- `openspec/changes/issue-205-typed-command-surface/` (this change: `proposal.md`, `tasks.md`,
  `specs/command-surface/spec.md`, `specs/node-fs-boundary-guard/spec.md`, `handoff.md`)

**Modified:**
- `src/commands/run-pipeline.ts` — the one swept module (raw ledger read → `loadBaseline`; `node:fs`
  import removed)
- `.claude/rules/always/organicgrowth-rules.md`, `openspec/project.md`, `src/db/adr.docs-test.ts`

**Untouched (deliberately):** `src/db/schema.ts`, `src/db/migrate.ts` (`MIGRATION_1`/`MIGRATION_2`
byte-for-byte frozen — no new migration), the four integration ports and their fakes, every existing
store's own operations/return shapes, `src/ledger/ledger.ts` and every real production module that
reads/writes `ledger.json`.

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-205-typed-command-surface

# Full suite (typecheck + tests + docs-tests)
npm test

# Just this slice's new/changed suites
node --import tsx --test src/command-surface/*.test.ts src/fs-boundary/*.test.ts src/commands/run-pipeline.test.ts

# OpenSpec
npx openspec validate issue-205-typed-command-surface --strict
npx openspec validate --all --strict
```

Result at handoff: `npm test` → **3100 tests / 800 suites / 0 fail** (baseline on `main` at `c33a358` was
3061/783/0 — +39 tests, +17 suites, no regressions). `openspec validate issue-205-typed-command-surface
--strict` → valid. `openspec validate --all --strict` → **57/57** (baseline 54; +3 for this change's own
proposal + 2 spec deltas).

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | A typed command surface exposes the operations the pipeline needs — listing Trends, creating an Idea, recording a Review decision, enqueuing and claiming jobs, saving an Asset, logging a Post, reading Performance — as plain exported functions over the stores. | `src/command-surface/*.ts` (all 7 modules); `index.test.ts`'s end-to-end barrel test drives all eight named operations (plus the 3 justified companions) through the barrel's own exports; every domain's own `*.test.ts` proves its individual command. |
| 2 | The command surface is the only thing that writes. Nothing above it writes to a store or the filesystem directly. | Verified by grep at both the START of this ticket (before any command-surface code existed) and the END (task 7.2): zero production modules outside the SQL stores themselves, `src/command-surface/`, and test/fixture code (`db/fixtures/seed-chain.ts`, `production-queue/fixtures/claim-worker.ts` — both pre-existing, documented exceptions) import any SQL store's write functions. No automated CI gate enforces this the way AC7's guard does for `node:fs` — see "Known limits" below; this is a stated, deliberate scope decision, not an oversight. |
| 3 | Commands are tested in-process against a real database. | Every `src/command-surface/*.test.ts` uses `withTempDb` (`src/db/test-support.ts`) — a real, throwaway SQLite file per test, never `:memory:`. |
| 4 | Every non-test module importing `node:fs` is audited, and the audit is posted on this issue with a verdict per module: moved behind a store, moved behind an existing port, or legitimately direct (with the reason). | Posted: https://github.com/SandroBlunt/OrganicGrowth/issues/205#issuecomment-5314811934 — all 33 modules, individually reasoned, grouped by verdict category. |
| 5 | Every module the audit marks as needing to move is moved behind a store or one of the four existing ports. | The one module marked "moved" (`src/commands/run-pipeline.ts`) is moved, in commit `c0f51c8`; `run-pipeline.test.ts`'s existing C21 baseline-advisory tests (`"suppresses the no-baseline advisory..."`, `"still shows the no-baseline advisory..."`) pass unchanged, proving behavior preserved. |
| 6 | The four existing integration ports are unchanged. | `git diff c33a358..HEAD -- src/space-driver/port.ts src/commands/track-performance-port.ts src/media-host/port.ts src/schedule-batch/mcp-schedule-port.ts` is empty — none of the four port files appear in this change's diff at all. |
| 7 | An automated check fails when new production code imports `node:fs` outside the allowed list. | `src/fs-boundary/node-fs-guard.test.ts`, run by `npm test`. Proven both directions by construction: the ratchet's first commit (`854049e`) shows it failing-were-it-not-allow-listed against the real 33; `scan.test.ts`'s own unit tests directly assert a not-allow-listed import is detected and a stale entry is detected. |

### Fakes / fixtures used

- **`src/db/test-support.ts`'s `withTempDb`** — a real, empty, throwaway SQLite file per test (never
  `:memory:`), the SAME fixture every `{ db }`-backed store test in this repo already uses.
- **`src/db/fixtures/seed-chain.ts`'s `seedAsset`/`seedAssetAndChannel`** — the shared brand → format →
  run → idea → asset (→ channel) seed chain, reused unchanged for `jobs.test.ts`, `assets.test.ts`,
  `posts.test.ts`, `performance.test.ts`.
- **No Magnific fake, no Apify fake, no Media Host fake, no Zoho fake were needed** — this slice never
  touches `SpaceMcpPort`/`PerformanceScrapePort`/`MediaHostPort`/the Zoho MCP schedule port at all (AC6).
  **Explicitly confirming for qa: no live Space, Apify, Media Host, or Zoho MCP call was made anywhere in
  this slice — hermetic throughout, by construction (nothing here imports `src/space-driver/`,
  `src/apify/`, `src/media-host/live/adapter.ts`, or any Zoho MCP tool).**

### Self-review notes

- Caught and fixed a real false-positive in my OWN new code mid-build: `scan.ts`'s first doc-comment
  draft literally wrote `from "node:fs"` in prose (describing what the detector matches), which tripped
  its own detector once the guard ran against itself. Reworded the doc comment to describe the match
  shape without reproducing the literal matching text — a genuine, useful proof the chosen detection
  method (an import/require SITE, never a bare substring) is the right one, since even talking ABOUT the
  target string in prose is a realistic thing a doc comment does.
- Reconsidered and explicitly scoped OUT a second automated "write boundary" guard for AC2 (see "Known
  limits") rather than build a fragile static-analysis tool with many legitimate fixture/store-composition
  exceptions to get right, not asked for by AC7's own explicit "automated check" phrasing (which names
  only `node:fs`).
- Kept every command a thin, single-purpose wrapper — no command re-implements logic a store already has;
  where a command composes two store calls (`recordReviewDecision`), the composition and its atomicity
  trade-off are documented explicitly rather than silently accepted.
- Re-derived the `node:fs` count myself rather than trusting the issue's "~41", per the issue's own
  explicit instruction — found 33, stated the discrepancy and its likely cause (#222/#223 absorbing
  some violators into their own file-backed store halves) in `proposal.md` and the posted audit.

### Known limits

- **AC2 is proven by a point-in-time grep verification (start and end of this ticket) and documented in
  rule 7 + every command module's own doc comment, not by a second automated CI guard** — a deliberate,
  stated scope decision (see `proposal.md`'s "Known gaps"), since AC7's own phrasing names an automated
  check only for `node:fs`. If a future slice (most likely the worker, #208 — the first real caller) needs
  it enforced automatically, `src/fs-boundary/scan.ts`'s exact pattern (an import-SITE match, not a bare
  substring search) is directly reusable.
- **No `requeueJob` command** — `JobStore.requeueJob` is not wrapped; not needed to prove any of this
  ticket's own ACs, left for #208 to add if/when it needs that retry shape.
- **No command wraps `Brand`/`Channel`/`Format`/`BrandAsset`/`CopyVariant`** — AC1 names eight specific
  operations; these four stores are not among them, and remain directly importable exactly as they were
  before this ticket (nothing above the store layer currently imports them either).
- **No production caller is wired onto the command surface.** The worker (#208), the viewer (#210), and
  every agent (#211) are later slices — this ticket builds the surface they will call, not the callers
  themselves, matching #222's and #223's own precedent (their new stores were similarly unwired at
  handoff).
