# Slice Handoff — issue #208: the worker drains the Production Queue

## Build Report (developer)

### What changed

The missing engine now runs. `src/commands/run-worker.ts`'s `drainQueue(db, port, options)` is "a local
process, started by the Operator, draining the queue" (the issue's own words): it repeatedly finds the
oldest `queued` job (`job-store.ts`'s new `findNextQueuedJob`, FIFO by `enqueued_at`) and processes it via
`src/command-surface/worker.ts`'s `runOneJob`, until nothing is `queued`.

`runOneJob` composes the EXISTING deep modules end to end for one claimed job — it adds no new production
logic:

1. Claim via the SQL atomic primitive (`job-store.ts`'s `claimJob`, unchanged — issue #203).
2. Load the Asset / Brand / Recipe / Idea (reads only).
3. Refuse a Space-less Recipe (ADR-0021) — explicitly out of this slice's scope.
4. Decide the LEG — FIRST or RESUMED — via the new, pure `src/worker/plan-leg.ts`, fed by whether the
   Asset already carries a DECIDED `gate_request` from an earlier job (`gate-request-store.ts`'s new
   `listGateRequestsForAsset`).
5. FIRST leg only: self-audit the already-authored, saved Production Spec against the `author` Phase
   Contract (`recipe/phase-contract.ts`'s `auditAuthorPhase`, unchanged).
6. A leg about to render (`targetGate === null`): resolve + bind media slots
   (`src/worker/resolve-media-slots.ts` + `producer/bind-media.ts`'s `bindMediaSlots`, unchanged),
   self-audit the `bind-media` Phase Contract, then actually bind each brand-asset slot into the canvas
   (`space-driver/driver.ts`'s `bindMediaAsset`, unchanged) — an idea-pick slot needs no separate call,
   `driveToNextGate`'s own resumed-leg branch pins it.
7. Drive exactly one leg (`space-driver/driver.ts`'s `driveToNextGate`, unchanged).
8. PAUSED: raise a `gate_request`, release the job to `awaiting_pick` — the Space is free for the next
   queued job.
9. FINISHED: download the rendered creation, compose + self-audit Copy (`auditCopyPhase`, unchanged), save
   the Asset `produced`, attach its media, save one Copy Variant (against the Brand's primary Channel,
   when one exists), release the job `done`.

Any phase-audit failure or drive failure routes through one shared retry/terminal-failure path: release
`failed`, then `requeueJob` (unchanged) while `attempt < maxAttempts` (default 3, injectable) — never past
it.

**Resuming a parked job** goes through a NEW command-surface module, `src/command-surface/gates.ts`:
`resolveGate(db, gateRequestId, decision)` composes `recordGateDecision` with `job-store.ts`'s `createJob`
— a NEW job row for the SAME Asset (`gate` omitted, targeting the final render) — mirroring
`ideas.ts`'s `recordReviewDecision` precedent for "a command-surface function composing more than one
store call behind real branching logic." `claimJob`'s own eligibility rule (`queued`, or `running` with an
expired lease — never `awaiting_pick`) is exactly why resuming means a NEW job row rather than re-claiming
the parked one; no second claiming mechanism was introduced.

**Copy persistence** goes through a second new, minimal module, `src/command-surface/copy.ts`'s
`saveCopyVariant` (a thin wrap of the existing `copy/store.ts`'s `upsertCopyVariant`).

Four small, additive reads/widenings round out the plumbing: `asset/store.ts`'s `getAssetById`,
`job-store.ts`'s `findNextQueuedJob`, `gate-request-store.ts`'s `listGateRequestsForAsset`, and a widened
`asset/download.ts`'s `downloadAssetFiles` return shape (`+bytes`, `+contentType`, additive — verified
every existing caller/test is unaffected).

**Also updated:** `.claude/rules/always/organicgrowth-rules.md` rule 11 gained a short addendum recording
that this worker now exists as a NEW, unattended path alongside the attended `producer` content agent
(unchanged) — flagged as a doc-gap needing a proper superseding ADR, not closed by this ticket (see Known
Limits).

### Files touched

New:
- `src/worker/plan-leg.ts` + `.test.ts`
- `src/worker/resolve-media-slots.ts` + `.test.ts`
- `src/worker/media-kind.ts` + `.test.ts`
- `src/command-surface/gates.ts` + `.test.ts`
- `src/command-surface/copy.ts` + `.test.ts`
- `src/command-surface/worker.ts` + `.test.ts`
- `src/commands/run-worker.ts` + `.test.ts`
- `openspec/changes/issue-208-worker-drains-queue/` (this change)

Modified:
- `src/asset/store.ts` (+`getAssetById`)
- `src/asset/download.ts` (+`bytes`/`contentType` on `DownloadedAssetFile`, defensive-optional
  `response.headers` read) + `.test.ts`
- `src/production-queue/job-store.ts` (+`findNextQueuedJob`) + `.test.ts`
- `src/production-queue/gate-request-store.ts` (+`listGateRequestsForAsset`) + `.test.ts`
- `src/asset/db-store.test.ts` (+`getAssetById` tests)
- `src/command-surface/index.ts` (+re-exports for `gates.ts`/`copy.ts`/`worker.ts`)
- `.claude/rules/always/organicgrowth-rules.md` (rule 11 addendum)

Not touched (by design): `src/production-queue/scheduler.ts`, `src/production-queue/queue.ts`,
`src/production-queue/store.ts` (the file-based queue — the worker drains the SQL job table, not
`data/queue.json`), `src/space-driver/driver.ts`, `src/recipe/phase-contract.ts`, `src/recipe/registry.ts`,
`src/producer/bind-media.ts` (every one reused byte-for-byte), `src/fs-boundary/`,
`src/store-write-boundary/`, `src/production-spec/compose.ts` (per the build brief's own "stay out of"
list).

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
npx openspec validate issue-208-worker-drains-queue --strict   # this change
npx openspec validate --all --strict                           # whole repo: 62 passed, 0 failed
npm test                                                        # tsc --noEmit + full suite
```

Focused runs used while building:
```
node --experimental-strip-types --test src/command-surface/worker.test.ts
node --experimental-strip-types --test src/commands/run-worker.test.ts
node --experimental-strip-types --test src/worker/*.test.ts
node --experimental-strip-types --test src/store-write-boundary/store-write-guard.test.ts src/fs-boundary/node-fs-guard.test.ts
```

**Result:** `npm test` — **3339 tests / 884 suites / 0 fail** (baseline at branch cut was 3303/862/0 —
this slice adds 36 tests across 22 new suites, zero regressions). `openspec validate --all --strict` —
**62 passed, 0 failed**.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #208) | Proven by |
|---|---|---|
| 1 | A worker process drains the Production Queue, claiming jobs through the atomic claim. | `src/command-surface/worker.test.ts` → `runOneJob — claiming (AC1)` (a live-leased job is reported `not-claimed`, no side effect); `src/commands/run-worker.test.ts`'s both suites (every processed job goes through the real `claimJob`); the atomicity itself is `job-store.ts`'s own pre-existing, unmodified `claim-concurrency.test.ts` (issue #203) — reused, not reproven. |
| 2 | A News Carousel job runs `queued → running → done` end to end with no human present. | `src/command-surface/worker.test.ts` → `runOneJob — a News Carousel job runs queued -> running -> done, no human present (AC2)`. |
| 3 | Each phase is self-audited against its Phase Contract before advancing; a broken shape or a banned word stops the job rather than reaching an Asset. | `worker.test.ts` → `the author phase stops a bad Spec before any Space call (AC3)` (banned word, zero Space calls), `the bind-media phase stops a missing required Brand Asset before any Space call` (zero Space calls), `the copy phase stops an invalid drafted Copy before the Asset is saved produced (AC3)` (Asset never reaches `produced`, no media/copy saved). All three of `runOneJob`'s audited phases (author, bind-media, copy) are covered — `gate`/`render`/`save` have no generic mechanical auditor in this codebase yet (`recipe/phase-contract.ts`'s own documented, pre-existing limit). |
| 4 | A job whose Recipe declares a gate parks at `awaiting_pick`. | `worker.test.ts` → `runOneJob — a gated Recipe parks at awaiting_pick (AC4)`. |
| 5 | A parked job does **not** hold the Space — the worker advances the next job while a pick is pending. Test proves it. | `src/commands/run-worker.test.ts` → `drainQueue — a parked job does not block a sibling job from draining (AC5)`: job A (earlier `enqueued_at`, first/gated leg) parks; job B (a resumed, final leg) reaches `done` right after, in the SAME `drainQueue` call. |
| 6 | Resolving a gate through `gate_request` resumes the parked job. | `worker.test.ts` → `runOneJob — resolving a gate resumes the parked job (AC6)` (calls `resolveGate`, then drives the resumed leg to `done`, asserting the fake Space's recorded edit goal actually pins the chosen candidate); `src/command-surface/gates.test.ts` → `resolveGate — records the Operator's decision and enqueues the resumed leg's job`. |
| 7 | A failed job is retried with a recorded attempt count and reaches a terminal failure state rather than retrying forever. | `worker.test.ts` → `runOneJob — a failed job is retried with a recorded attempt count, then reaches terminal failure (AC7)`: `maxAttempts: 2`, a deterministically-failing `FakeCarouselSpace({ injectNoOp: true })`, asserts `attempt` reaches exactly `2` and the job is left `failed` — never requeued a third time. |
| 8 | The worker is driven against the existing `fake-space.ts` in tests, asserting the full status path, retries, terminal failure, and the parked-job-does-not-block case. | `FakeSpace` (`space-driver/fixtures/fake-space.ts`) drives the AC4/AC5/AC6 (gate/park/resume) tests directly. `FakeCarouselSpace` (`producer/fixtures/fake-carousel-space.ts` — a second, purpose-built Magnific fake for the OTHER wired Space, pre-existing from issue #86/#89, not new) drives the AC2/AC3/AC7 (happy-path/audit-stop/retry) tests, since AC2's own target Recipe is News Carousel. Every fake, no live `spaces_*`/`creations_*` call anywhere in this slice. |
| 9 | One real News Carousel Asset is produced by the worker against the live Space, and the run is reported on this issue. | **Operator-gated — not run by this agent** (no `magnific` MCP tools granted; hermetic build). See "Operator-gated live run" below for the exact steps. |

### Fakes / fixtures used (explicitly flagging the Magnific fake)

- **THE Magnific fake** (no live Space touched anywhere in this slice):
  - `src/space-driver/fixtures/fake-space.ts`'s `FakeSpace` — the *Character Explainer with Cast*
    Recipe's Space, pre-existing (issue #40/#57).
  - `src/producer/fixtures/fake-carousel-space.ts`'s `FakeCarouselSpace` — the *News Carousel* Recipe's
    Space, pre-existing (issue #86/#89), rebuilt to match a live-captured node inventory.
  - Both implement the narrow `SpaceMcpPort` interface `runOneJob`/`drainQueue` are written against; the
    live `SpaceMcpPort` adapter (`src/space-driver/live/adapter.ts`, built by issue #207) satisfies the
    SAME interface and is what the Operator wires in for the real run below — nothing in `runOneJob`
    changes between fake and live.
- **A fake `fetch`** (hand-rolled per test, mirroring `asset/download.test.ts`'s own `stubFetch`) stands
  in for the "download the rendered creation" network call — never a real HTTP request.
- **A real, throwaway SQLite file per test** (`db/test-support.ts`'s `withTempDb`, never `:memory:`) —
  every worker/gates/copy/plan-leg/resolve-media-slots test opens its own file, dropped afterward.
- **`db/fixtures/seed-chain.ts`'s `seedAsset`/`seedAssetAndChannel`** — the pre-existing brand → format →
  run → idea → asset (→ channel) seed chain (issue #203), reused unchanged.
- **`production-spec/fixtures/specs.ts`'s `validSpec()`** and
  **`production-spec/fixtures/news-carousel-straw-motion-specs.ts`'s `strawMotionIdeaOneCarouselSpec()`**
  — pre-existing, real, already-graduated (10/10 on the author checklist) fixture Specs, standing in for
  "the Spec was already authored" (this slice's own scope boundary — see Known Limits).

**A test-hygiene fix mid-build:** the very first pass of these tests wrote real files into the committed
`data/brands/straw-motion/produced/` tree, because `db/fixtures/seed-chain.ts`'s seeded Brand's
`mediaRoot` is the literal repo-relative string `"data/brands/straw-motion"`. Fixed by pointing each
test's Brand at the SAME throwaway directory `withTempDb`'s own SQLite file lives in
(`updateBrand(db, brandId, { mediaRoot: dirname(dbPath) })`) before any job that reaches "finished" runs.
Verified clean with `git status --short data/` after the full suite.

### Self-review notes

- Collapsed the composing orchestration into `src/command-surface/worker.ts` from the start, rather than
  building a separate `src/worker/run.ts` deep module that would import store writes directly — the exact
  shape issue #209 had to retrofit after qa flagged it as an un-audited bypass. Confirmed with both guards
  directly (`store-write-guard.test.ts`, `node-fs-guard.test.ts`): zero new allow-list entries needed.
- `src/worker/` holds ONLY pure or read-only helpers (`plan-leg.ts` is pure; `resolve-media-slots.ts` and
  `media-kind.ts` touch no store WRITE function) — verified by grep and by the store-write guard itself.
- Found and fixed a real bug during self-review: `releaseJob`/`raiseGateRequest`'s 4th parameter is an
  injectable `now: () => string`, and an early draft passed the ALREADY-COMPUTED timestamp STRING there
  instead — `now is not a function` at runtime. Fixed at all three call sites; the fix is covered by every
  test that reaches a `paused`/`done` outcome (they all would have thrown otherwise).
- Removed dead `void assetId;` unused-variable suppressions from three tests by simply not destructuring
  the unused field, once the mediaRoot fix required touching those same lines anyway.
- Added one extra test (`the copy phase stops an invalid drafted Copy...`) beyond the original plan so
  all three currently-auditable phases (author, bind-media, copy) — not just two — have a dedicated
  "this phase's own failure stops the job" proof, matching AC3's literal "each phase" wording.

### Known limits

- **Space-less Recipes (News Short Script) are out of scope.** `runOneJob` refuses them as an ordinary
  retryable failure (`usesSpace(recipe) === false`) rather than driving `collectShotListMedia` — a
  genuinely different render step. Proven by its own test; not silently narrowed.
- **`planLeg` supports at most one gate per Recipe.** A RESUMED leg always targets `null` (the final
  render). Every wired Recipe declares 0 or 1 gates today, so this is not a live gap, but a hypothetical
  future multi-gate Recipe would need `src/worker/plan-leg.ts` widened.
- **One representative creation, not full multi-slide media.** `driveToNextGate`'s own `AssetResult`
  carries exactly one `assetId`/`assetUrl` regardless of Recipe; `runOneJob` downloads and saves exactly
  ONE `asset_media` row from it. A News Carousel Asset's real 7-slide, `stat_callout`-matched download
  (the registry's own documented "save" phase checklist item) is real, additional complexity this ticket
  deliberately does not build — "the loop around the existing engine, not new production logic."
- **One Copy Variant, the primary Channel only.** `runOneJob` composes and saves ONE Copy (via
  `skillDraftCopy`, the deterministic `write-social-copy` Skill stand-in) against `getPrimaryChannel`,
  never `composeCopyForChannels`'s full per-platform fan-out (ADR-0025). A Brand with no Channel at all
  simply gets no Copy Variant row (the render/save still succeeds).
- **No render-tail outbox.** Documented directly in `worker.ts`'s own module doc comment: a crash strictly
  between `attachAssetMedia` succeeding and `releaseJob(done)` landing would leave the job reclaimable
  after its lease expires, and a retry would re-drive the finished leg and hit the `asset_media` table's
  own `UNIQUE (asset_id, ordinal)` constraint rather than reconciling — the SAME class of problem issue
  #209's Schedule Outbox solves for Zoho scheduling. The render/save tail has no equivalent reserve-first
  step yet. A natural follow-up ticket, not attempted here.
- **`organicgrowth-rules.md` rule 11 gained a short addendum, not a rewrite.** The content-agent
  `producer`'s own attended behavior is genuinely unchanged and the addendum says so; a proper superseding
  ADR (mirroring how ADR-0008 itself superseded ADR-0004) is NOT written by this ticket — epic #195's own
  phase 05 ("The agents") is explicitly where the fuller doc rewrite belongs. Flagged, not closed.
- **The Magnific write-size limit (4,000 chars, `SPACES_EDIT_WRITE_LIMIT_CHARS`) is inherited unmeasured
  against the live API** — issue #207's own AC1 (re-measuring it live) is still outstanding per the build
  brief. If the real measurement differs, `src/space-driver/live/write-limit.ts` is the single place to
  change it; nothing in this ticket's own code hard-codes that number a second time.

### Operator-gated live run (AC9 — not executed by this agent)

This agent holds no `magnific` MCP tools and did not attempt this. Exact steps for the Operator:

1. **Merge this PR to `main`** (after qa passes).
2. **Pick one already-`accepted` Straw Motion Idea with a News Carousel Asset whose Production Spec is
   already authored and saved** (`asset.spec_json` non-null, `asset.status: 'queued'`) — e.g. via the
   one-shot importer (issue #204, still Operator-gated itself) or a freshly-accepted Idea produced through
   today's attended path up through authoring. Confirm a `job` row exists for it at `status: 'queued'`
   (`enqueueJob` via `src/command-surface/jobs.ts`, or the SQL `job` table directly).
3. **Commit a real Brand Asset** for Straw Motion's `brand-logo` key under `data/brands/straw-motion/assets/`
   if not already present (`src/brand-asset/store.ts`'s `getBrandAsset("straw-motion", "brand-logo")` must
   report `found: true`), and register it in the SQL `brand_asset` table (`createBrandAsset`) — the News
   Carousel Recipe's bind-media phase requires it.
4. **Instantiate the live adapter**: `new LiveSpaceAdapter(transport, ...)`
   (`src/space-driver/live/adapter.ts`, built by issue #207) with a real `LiveMcpTransport`
   (`src/space-driver/live/transport.ts`) wired to the live `magnific` MCP tools, in an attended Claude
   Code session that HAS those tools granted.
5. **Call `drainQueue(db, liveAdapter, { poll: {} })`** (`src/commands/run-worker.ts`) — `poll: {}`
   defaults to the real `setTimeout`-based backoff (`DEFAULT_POLL_INTERVAL_MS`/`DEFAULT_POLL_BUDGET_MS`,
   `space-driver/driver.ts`), appropriate for a live, multi-minute Space op — never the fast `FAKE_POLL`
   tests use.
6. **What a pass looks like:** the `job` row reaches `status: 'done'`; the `asset` row reaches
   `status: 'produced'` with a `produced_at`; one `asset_media` row exists with a real, non-empty local
   file under `data/brands/straw-motion/produced/<ideaId>/news-carousel/` and a plausible `bytes`/
   `checksum`; one `copy_variant` row exists for the Brand's primary (Facebook) Channel with a non-empty
   caption.
7. **What to check if it fails:**
   - `RunOneJobOutcome.status === "failed"` with `reason` starting `"drive failed: ..."` — read the
     `DriverErrorCode` in the reason; `inject_edit_failed`/`inject_unconfirmed` point at the `spaces_edit`
     write-cap or the `JSON Master` node's real name having drifted (issue #207's own live-write notes);
     `run_failed`/`run_point_stale` point at the Execution Protocol's run-point resolution.
   - `status === "failed"` with `reason` starting `"bind-media phase failed"` — the committed
     `brand-logo` Brand Asset (step 3) is missing or its SQL `brand_asset` row was never created.
   - `status === "failed"` with `reason` starting `"downloading the rendered Asset failed"` — the
     Space's returned media URL is not fetchable from wherever the worker runs (a signed URL that has
     already expired, or a network/firewall issue) — re-run `drainQueue` once more; the job was already
     requeued (up to `maxAttempts`, default 3) automatically.
   - Report the run (pass or fail, with the exact `reason` string) as a comment on issue #208.
