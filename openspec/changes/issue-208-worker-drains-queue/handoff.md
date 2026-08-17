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

---

## QA Verdict — Round 1: FAIL

**Verifier:** qa (non-human gate). Worked and ran exclusively inside
`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue`, branch
`issue-208-worker-drains-queue`, HEAD `f2377ae`, `main` base `60ecfc7`. Read, ran, and reported only —
no product code, test, spec, or ADR file was edited.

### Suite result — GREEN (the code itself works)

- `npx openspec validate --all --strict` → **62 passed, 0 failed** (matches the Build Report).
- `npx openspec validate issue-208-worker-drains-queue --strict` → **`Change 'issue-208-worker-drains-queue' is valid`**.
- `npm test` (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"`)
  → **3339 tests / 884 suites / 0 fail**, `tsc --noEmit` clean. Matches the Build Report's own count
  exactly; `main` at `60ecfc7` is 3303/862/0, so this slice adds 36 tests / 22 suites, zero regressions.
- `npm run test:docs` (re-run separately per the brief) → **295 tests / 80 suites / 0 fail**.
- `git status --short data/` and full `git status --short` after every run above → **clean** (no stray
  writes into the committed `data/` tree; the `mediaRoot` test-hygiene fix holds).

The suite is genuinely green. **The FAIL verdict below is entirely about the ADR-governance gap
(Priority One), not about broken code or an unproven acceptance criterion.**

### Priority one — ADR-0008 is contradicted with no forward-pointer: DEFECT (high)

`docs/adr/0008-producer-drives-the-space-attended.md` is **Status: accepted**, and its Decision section
states in as many words: *"No headless worker host, no unattended-permission wiring, no cross-process
lock,"* and *"the `producer` is an **interactive** agent... that drives the live Space **in the
Operator's session**."* Issue #208 builds exactly the thing that sentence forbids — a headless process,
started by the Operator but running with **no human present**, holding its own Magnific credentials.

The issue's own body gives a real, considered reason ("attended mode is not a product requirement... a
worker holding its own credentials does not face [the permission-classifier problem]") — the *intent* to
reverse ADR-0008 is not invented, it is genuine and well-argued. But an accepted ADR is not overridden by
an issue body, and this repo has just finished demonstrating, on the SAME day, exactly how a reversal
must be recorded:

- ADR-0011 carries `> **Partially superseded by ADR-0028** (issue #201, Operator decision 2026-08-16)...`
- ADR-0014 carries `> **Superseded by ADR-0029** (issue #201, Operator decision 2026-08-16)...`, and
  ADR-0029's own Consequences section states the rule explicitly: *"`docs/adr/0014` carries a
  forward-pointer to this ADR (the repo's established pattern — see how ADRs 0015–0018 point back at
  0010/0013/0014), rather than being silently contradicted."*

`docs/adr/0008-....md` (verified byte-for-byte: `git diff 60ecfc7..HEAD -- docs/adr/` shows **zero
changes to any ADR file** on this branch) carries **no such blockquote**. A reader who opens ADR-0008
directly — the normal way to find out "is attended mode still the rule" — finds it saying attended, full
stop, with no trail to this slice, exactly the failure mode Priority One warned against.

What the build actually did instead:
- Added an **addendum to `organicgrowth-rules.md` rule 11** (not the ADR file) — and the addendum sits
  immediately below the rule's own unedited sentence *"There is **no unattended background worker**,"*
  so the rule file now contradicts itself in the same paragraph (`.claude/rules/always/organicgrowth-rules.md`
  lines 61–71, confirmed by direct read).
- Recorded it as a **Known Limit** in this Build Report ("a proper superseding ADR... is NOT written by
  this ticket").
- `tasks.md` task 1.7 states outright: *"epic #195's own body... and issue #208's own text supersede
  ADR-0008's attended-only posture"* — i.e. the plan was to treat an issue body as ADR-superseding
  authority, which this repo's own governance does not recognize (only an ADR supersedes an ADR).

This is real and disclosed, not hidden — full credit for that. But disclosure in a rules-file addendum
and a Known Limit is not the established remedy; the remedy this repo uses, twice, the same day, is a
forward-pointer on the superseded ADR plus (here) a new ADR recording the worker's own decision (why a
worker holding its own credentials does not face the permission-classifier problem ADR-0008 cited, what
serialization guarantee replaces "one attended session" — this slice's own `run-worker.ts` doc comment
already states it: strictly-sequential processing, so "the Space's one-generation-at-a-time constraint
holds by construction"). None of that reasoning is wrong; it simply is not where the governance record
lives yet.

**Severity: high.** Not critical — nothing here causes runtime harm, a wrong publish, or data loss (see
Priority Two below, clean). But it is squarely what this task's Priority One exists to catch: a
self-consistent, well-reasoned change that quietly leaves an accepted ADR pointing the opposite direction
of the code, with the fix pattern already sitting in the same repo, same day, unused here.

**Repro:**
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
git diff 60ecfc7..HEAD -- docs/adr/          # empty — no ADR file touched
sed -n '1,10p' docs/adr/0008-producer-drives-the-space-attended.md   # "Status: accepted", no forward-pointer
sed -n '56,71p' .claude/rules/always/organicgrowth-rules.md          # "no unattended background worker" then, 3 lines later, the addendum describing one
```
**Fix expected before PASS:** either (a) a new ADR (e.g. `docs/adr/0030-...`) recording the worker
decision, with a forward-pointer blockquote added to the top of ADR-0008 pointing at it — mirroring
ADR-0011→ADR-0028 and ADR-0014→ADR-0029 exactly — or (b) an amending blockquote directly on ADR-0008 if
the Operator judges a full new ADR unnecessary. A rules-file addendum and a Known Limit are not a
substitute for either.

### Priority two — the worker never publishes: PASS

- **No publish call anywhere.** `grep -rln "publishSocialPost\|updateSocialPostApprovalStatus\|ZohoSocial_" src/`
  (excluding `.test.ts`) returns only `src/schedule-batch/**`, pre-existing code that itself documents and
  tests *forbidding* those two tools (`mcp-schedule.docs-test.ts`'s `"explicitly forbids
  updateSocialPostApprovalStatus and isApprovalNeeded"`). Nothing under `src/worker/`,
  `src/command-surface/worker.ts`, `src/command-surface/gates.ts`, `src/command-surface/copy.ts`, or
  `src/commands/run-worker.ts` references a Zoho tool, a publish call, or a Post record at all —
  `runOneJob` stops at `releaseJob(db, claimed.id, "done", now)` with the Asset at `status: "produced"`.
  Generate-never-publish holds.
- **No live `spaces_*`/`creations_*`/Zoho/Apify call reachable from `npm test`.** Every worker test
  (`worker.test.ts`, `run-worker.test.ts`, `gates.test.ts`, `copy.test.ts`) imports only `FakeSpace`
  (`space-driver/fixtures/fake-space.ts`) and `FakeCarouselSpace` (`producer/fixtures/fake-carousel-space.ts`)
  against the pure `SpaceMcpPort` interface (`src/space-driver/port.ts`) — confirmed by reading both test
  files' imports directly; no import of `src/space-driver/live/adapter.ts` or `transport.ts` outside that
  module's own tests (`grep -rln "LiveSpaceAdapter\|LiveMcpTransport" src/ --include="*.ts" | grep -v
  "\.test\.ts\|/live/"` → empty). The media download step uses a hand-rolled fake `fetch`, never the
  network.
- **AC9's live run is documented, Operator-gated, and never wired into the suite.** The handoff's
  "Operator-gated live run" section gives exact steps (merge → pick an Idea → commit a Brand Asset →
  instantiate `LiveSpaceAdapter` with a real transport in an attended session with `magnific` tools
  granted → call `drainQueue` with the real adapter) — none of which happen inside `npm test`.
- **Parking genuinely releases the claim — verified against the SQL, not just the Build Report's prose.**
  `job-store.ts`'s `claimJob` eligibility is `status = 'queued' OR (status = 'running' AND locked_until <
  now)` — `awaiting_pick` is never eligible. `runOneJob`'s paused branch calls `releaseJob(db,
  claimed.id, "awaiting_pick", now)` BEFORE raising the gate request, which the SQL sets `locked_by =
  NULL, locked_until = NULL`. `findNextQueuedJob` only ever selects `status = 'queued'`, so the very next
  `drainQueue` iteration is free to claim a different job. `driver.ts` holds no module-level mutable state
  (confirmed by inspection — no external "Space busy" lock exists to leak). **AC5's own test proves this
  live, not just structurally:** `run-worker.test.ts` → `drainQueue — a parked job does not block a
  sibling job from draining (AC5)` enqueues job A (earlier `enqueued_at`, gated) and job B (a different
  Asset's resumed, final leg, enqueued after), and asserts BOTH are processed in the SAME `drainQueue`
  call, in FIFO order, with job A left `awaiting_pick` and job B reaching `done`. This genuinely proves
  release-then-advance, not a false PASS from a same-job double-claim.

### Priority three — claim primitive and the seam: PASS

- **`claimJob` is unmodified.** `git diff 60ecfc7..HEAD -- src/production-queue/job-store.ts` shows only
  an ADDED `findNextQueuedJob` function; the `claimJob`/`releaseJob`/`requeueJob` bodies are byte-for-byte
  identical to `main`. No second claiming mechanism exists — `resolveGate` (`gates.ts`) resumes a parked
  job by calling `createJob` (pre-existing) for a NEW row targeting the same Asset, never by re-touching
  the parked row, which is exactly why `awaiting_pick` staying permanently ineligible in `claimJob` does
  not strand it.
- **Zero new store-write allow-list entries — verified by diff, not just by reading the guard's own
  pass/fail.** `git diff 60ecfc7..HEAD -- src/store-write-boundary/allow-list.ts src/fs-boundary/allow-list.ts`
  is empty. Every write `gates.ts`/`copy.ts`/`worker.ts` compose
  (`createJob`/`claimJob`/`releaseJob`/`requeueJob`, `createGateRequest`/`recordGateDecision`,
  `writeAsset`/`addAssetMediaBatch`, `upsertCopyVariant`) was already present in
  `STORE_WRITE_FUNCTIONS` (`src/store-write-boundary/scan.ts`) from earlier tickets, and every write
  happens inside `src/command-surface/`, which the guard exempts by path. `store-write-guard.test.ts`
  (part of the green 3339) walks all of `src/` including the new `src/worker/`, `src/commands/`, and
  `src/command-surface/` files — not a narrower scope that could have missed something. Confirmed no
  store the guard "cannot see": `gate-request-store.ts`'s `listGateRequestsForAsset` is a pure read
  (not in `STORE_WRITE_FUNCTIONS`, correctly), and `resolve-media-slots.ts`/`plan-leg.ts`/`media-kind.ts`
  import no store-write function at all (grepped directly).
- **The four "small additive" reads/widenings, checked individually:**
  - `getAssetById` (`asset/store.ts`) — new, pure `SELECT * FROM asset WHERE id = ?`, no side effect.
  - `findNextQueuedJob` (`job-store.ts`) — new, pure `SELECT ... WHERE status = 'queued' ORDER BY
    enqueued_at ASC LIMIT 1`, genuinely FIFO (see below).
  - `listGateRequestsForAsset` (`gate-request-store.ts`) — new, pure read joined through `job`.
  - `downloadAssetFiles`'s widened return (`asset/download.ts`) — confirmed **additive only**: the diff
    adds `bytes`/`contentType` fields to `DownloadedAssetFile`, defensively reads `response.headers?.get?.`
    (so a caller's fetch stub with no `headers` at all still works, `contentType` simply omitted), and
    every EXISTING caller (`asset/cast-candidates.ts`, `asset/shot-list-media.ts`, `asset/asset.ts`,
    `media-backup/backup-runner.ts`, `media-backup/copy.ts`) destructures only `filename`/`path` — proven
    unaffected by the full green suite (all of their own tests still pass) plus two new dedicated tests
    (`download.test.ts`: "carries its raw bytes and content-type" / "omits contentType when the response
    carries no content-type header").

### FIFO ordering, starvation, and re-claim safety: PASS

- `findNextQueuedJob`'s SQL (`ORDER BY enqueued_at ASC LIMIT 1`, filtered to `status = 'queued'`) is
  genuinely FIFO and genuinely excludes `running`/`awaiting_pick`/`done`/`failed` — read directly, not
  taken on faith.
- **Cannot starve:** a parked job is not `queued`, so it is structurally invisible to `findNextQueuedJob`
  until `resolveGate` enqueues its resumed leg as a brand-new row (with a fresh `enqueued_at`) — it does
  not jump the line ahead of jobs enqueued in between, nor does it block them (AC5's test, above).
- **Cannot re-claim a job another worker holds:** `claimJob`'s own SQL WHERE clause (`status = 'queued' OR
  (status = 'running' AND locked_until < now)`) is unchanged, and this ticket adds no second entry point
  into that row's claim state.

### Fresh Magnific thread id per edit: PASS (by construction, one level down)

The worker's own code never touches `threadId` — `SpaceMcpPort.edit(goal)` (`space-driver/port.ts`) takes
no thread parameter; that concern is fully inside whichever `SpaceMcpPort` implementation is wired in.
The live implementation the Operator will wire for AC9 (`src/space-driver/live/adapter.ts`, issue #207,
untouched by this ticket) generates a **fresh `crypto.randomUUID()` per `spacesEdit` call** by its own
documented design (`adapter.ts`'s own doc comment: *"`threadId` is a FRESH id the adapter generates for
every single call... a shared thread reused across many edits was found, live, to truncate the JSON node
after roughly 40 edits"*). Since `runOneJob`/`driveToNextGate` only ever call `port.edit(goal)` and never
construct or reuse a thread id themselves, the worker's path structurally cannot regress this — it
inherits the fresh-id guarantee from the port it is handed, in both the fake (irrelevant, no threads) and
the live case.

### `SPACES_EDIT_WRITE_LIMIT_CHARS` = 4000: N/A to this slice, unchanged

`SPACES_EDIT_WRITE_LIMIT_CHARS` (`src/space-driver/live/write-limit.ts`) is `4000`, untouched by this
branch (`git diff 60ecfc7..HEAD` touches no file under `src/space-driver/live/`). The worker inherits it
unmeasured against the live API exactly as the Build Report's own Known Limits says; today's live
re-measurement (4000 accepted / 4001 refused before any transport call) is consistent with the constant
already in the repo and requires no code change here.

### `MIGRATION_1`/`MIGRATION_2`: byte-for-byte frozen — PASS

`git diff 60ecfc7..HEAD -- src/db/schema.ts` and `git log 60ecfc7..HEAD -- src/db/schema.ts` are both
**empty** — the file is untouched by this branch at all, so `MIGRATION_1`/`MIGRATION_2` are frozen by
construction, not merely "believed" frozen.

### Always-rules

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | See Priority Two above — no publish call anywhere reachable, `runOneJob` stops at `produced`. |
| Public-metrics-only | PASS (N/A) | `grep -rln "performance\|Apify\|baseline" src/worker src/command-surface/worker.ts src/command-surface/gates.ts src/command-surface/copy.ts src/commands/run-worker.ts` → empty; this slice touches no metrics code path at all. |
| Relative-not-absolute | PASS (N/A) | Same grep, same reason — no scoring/comparison code in this slice. |
| Explicit-attribution | PASS (N/A) | `grep -rln "post_url\|attribution" ...` (same fileset) → empty; no Post logging in this slice. |
| Ledger-as-source-of-truth | PASS | Every status transition (`job.status`, `asset.status`) is written through the existing SQL stores via `src/command-surface/` (`claimJob`/`releaseJob`/`requeueJob`, `saveAsset`/`attachAssetMedia`), the same governed path ADR-0029 (2026-08-16, this session) established as canonical, superseding the old `data/queue.json`/ledger-file path for this state. The file-based `data/queue.json`/ledger are deliberately untouched by this slice (verified: `git status --short data/` clean after the full suite), matching ADR-0029's "canonical relational state moves to SQL" scope. |

### Magnific-fake check: PASS

`FakeSpace`/`FakeCarouselSpace` are the only Space implementations used by any test reachable from `npm
test`; no `spaces_*`/`creations_*`/Zoho/Apify network call, no credits spent, no board mutation. Verified
by import-grep of both test files and by the absence of any `LiveSpaceAdapter`/`LiveMcpTransport`
reference outside `src/space-driver/live/` and its own tests.

### Per-criterion results (issue #208)

| # | Acceptance criterion | Verdict | Proving test |
|---|---|---|---|
| 1 | Worker drains the queue, claiming through the atomic claim | PASS | `worker.test.ts` → `runOneJob — claiming (AC1)`; `run-worker.test.ts` (every processed job real-claimed) |
| 2 | A News Carousel job runs `queued → running → done`, no human present | PASS | `worker.test.ts` → `runOneJob — a News Carousel job runs queued -> running -> done, no human present (AC2)` |
| 3 | Each phase self-audited; a broken shape/banned word stops the job | PASS | `worker.test.ts` → the author-phase, bind-media-phase, and copy-phase "stops the job" tests (three, one per currently-auditable phase) |
| 4 | A gated Recipe's job parks at `awaiting_pick` | PASS | `worker.test.ts` → `runOneJob — a gated Recipe parks at awaiting_pick (AC4)` |
| 5 | A parked job does not hold the Space; the worker advances the next job | PASS | `run-worker.test.ts` → `drainQueue — a parked job does not block a sibling job from draining (AC5)` |
| 6 | Resolving a `gate_request` resumes the parked job | PASS | `worker.test.ts` → `runOneJob — resolving a gate resumes the parked job (AC6)`; `gates.test.ts` |
| 7 | A failed job retries with a recorded attempt count, then terminal | PASS | `worker.test.ts` → `runOneJob — a failed job is retried with a recorded attempt count, then reaches terminal failure (AC7)` |
| 8 | Driven against `fake-space.ts` in tests — full status path, retries, terminal failure, parked-does-not-block | PASS | `FakeSpace`/`FakeCarouselSpace` throughout; see AC2–AC7 above |
| 9 | One real News Carousel Asset produced live, reported on the issue | **NOT YET RUN** (Operator-gated, correctly not attempted by the agent) | Steps documented in this handoff's "Operator-gated live run" section — see the Return section below for exactly what the Operator must do |

All 8 automatable criteria are genuinely proven by tests that exercise the stated behavior, not merely
claimed. AC9 is inherently outside this agent's reach (no `magnific` MCP tools) and is correctly left
undone rather than faked — not a defect, but it does mean the ticket's own AC list is not 100% closed
yet, independent of the ADR defect above.

### Per-scenario results (spec deltas)

All Scenarios across `specs/worker/spec.md`, `specs/command-surface/spec.md`, `specs/job-claim-store/spec.md`,
and `specs/asset-store/spec.md` were traced individually to a passing test (`findNextQueuedJob`,
`listGateRequestsForAsset`, `getAssetById`, `resolveGate`, `runOneJob`'s claim/audit/park/resume/retry
scenarios, the store-write-guard scenario) — every one covered, all PASS. **One gap noted (low
severity, informational):** `specs/worker/spec.md`'s "Each phase is self-audited..." Requirement's body
text and its two Scenarios name only the `author` and `bind-media` phases; the `copy`-phase audit (added
in the second commit, `f2377ae`, alongside its own real test) has no corresponding Scenario in the spec
delta, even though the Requirement's title says "Each phase" and AC3's wording is "each phase." The
behavior is genuinely implemented and genuinely tested (`worker.test.ts` → "the copy phase stops an
invalid drafted Copy before the Asset is saved produced (AC3)") — this is a spec-delta completeness gap,
not a code or test gap, and does not by itself change the verdict.

### Rebase-onto-current-main flag (per the brief's own note)

`main` has moved to `c9adf1c` (`#235`/`#239` guard-hardening + `#241` gitignore), NOT included in this
branch's `60ecfc7` base. Checked for rebase breakage:

- `#235` extends `STORE_WRITE_FUNCTIONS` with `saveSpec` and adds namespace-import (`import * as
  alias`) detection to the store-write guard. This branch's new/modified files contain **zero** namespace
  imports and **zero** calls to `saveSpec`
  (`grep -rn "import \* as\|saveSpec" src/worker src/command-surface/{worker,gates,copy}.ts
  src/commands/run-worker.ts` → empty) — rebasing will not trip the hardened guard.
- `#235` also edits `.claude/rules/always/organicgrowth-rules.md`, but a **different section** (the
  store-write-boundary paragraph, rules 6–7) than this branch's rule-11 addendum — textually
  non-overlapping, low conflict risk, but worth a human glance on rebase since both touch the same file.
- `src/store-write-boundary/allow-list.ts` is untouched by this branch, so `#235`'s own additions there
  apply cleanly.
- No other file this branch touches overlaps `#235`'s or `#241`'s changed files.

**Net: this branch is expected to rebase cleanly and stay green**, modulo the routine `organicgrowth-rules.md`
merge (non-conflicting hunks, different line ranges).

### Defect list

1. **[HIGH] ADR-0008 is contradicted by this slice's own stated design with no forward-pointer or
   superseding ADR recorded on the ADR itself** (Priority One). See the full writeup above.
   **Repro:** `git diff 60ecfc7..HEAD -- docs/adr/` (empty); read `docs/adr/0008-producer-drives-the-space-attended.md`
   directly (still says "accepted," "no headless worker host," no blockquote); read
   `.claude/rules/always/organicgrowth-rules.md` lines 56–71 (self-contradicting paragraph). **Fix:** add
   a forward-pointer to ADR-0008 and either a new superseding ADR or an amending blockquote, mirroring
   ADR-0011→ADR-0028 / ADR-0014→ADR-0029 exactly.
2. **[LOW] `specs/worker/spec.md`'s phase-audit Requirement omits a Scenario for the copy-phase stop**,
   even though the code and a real test (added in the second commit) already cover it, and the
   Requirement's own title says "Each phase." **Repro:** read
   `openspec/changes/issue-208-worker-drains-queue/specs/worker/spec.md`'s "Each phase is self-audited..."
   Requirement — two Scenarios (author, bind-media), no third for copy; compare against `worker.test.ts`'s
   three phase-stop tests. **Fix:** add a third Scenario (or fold copy-phase coverage into the Requirement
   text) so the spec delta visibly matches what AC3 and the tests already prove.

### Overall

**PASS/FAIL: FAIL — on Defect 1 only.** Every acceptance criterion the agent could run is genuinely
proven green by real tests against the Magnific fake; the worker structurally cannot publish; the claim
primitive is untouched; the store-write guard needed zero new entries and was independently verified via
diff, not assumed; parking genuinely releases the claim and is proven by a same-`drainQueue`-call
sibling-job test; FIFO/starvation/re-claim safety hold; the fresh-thread-id guarantee is inherited
correctly from the live adapter; migrations are frozen. The sole reason this is not a PASS is Priority
One: an accepted ADR (0008) is being reversed by working code with no forward-pointer or superseding ADR
recorded in `docs/adr/` — a governance-trail gap, disclosed honestly in the Build Report and tasks.md but
not remedied in the place this repo's own established pattern (used twice, same day, on ADR-0011 and
ADR-0014) requires. Fix Defect 1 (and, optionally, Defect 2) and resubmit for Round 2.

---

## Round-2 Build (developer)

### What changed

Fixed both defects from the Round-1 QA Verdict. No product code changed at all — every Round-1 test still
passes byte-for-byte; this round is governance/documentation only, exactly matching qa's own framing
("nothing here causes runtime harm... it is squarely what this task's Priority One exists to catch").

**Defect 1 (HIGH) — ADR governance trail, fixed the way this repo's own established pattern requires:**

- **New ADR:** `docs/adr/0030-worker-drains-the-queue-unattended.md` — **supersedes, in part, ADR-0008**.
  Mirrors ADR-0028's shape exactly (Title states the reversal; Status line names what's superseded and
  the Operator-decision date/epic/issue; a Context paragraph explaining why the original decision has not
  aged well; `## Decision` / `## Why` / `## Consequences`). States the two reasons ADR-0008's
  attended-only decision no longer holds universally: (a) the permission-classifier problem ADR-0008 cited
  is a fact about Claude Code's own `auto` mode, which never applies to a plain process holding its own
  Magnific credentials (it is not an agent session at all) — sidestepped by construction, not by disabling
  any safety gate; (b) two of the three wired Recipes (`News Carousel`, `News Short Script`) declare zero
  gates, so ADR-0008's own justification ("a human is present partway through every job regardless") was
  never true for them. States the serialization guarantee that replaces "one attended session":
  `drainQueue`'s own strictly-sequential loop, backed by the SQL atomic `claimJob` (issue #203) as the
  arbitration primitive if more than one worker process is ever run — explicitly NOT a new lock this ADR
  invents. States plainly that the attended `producer` content agent is UNCHANGED: a second, parallel
  path, not a replacement.
- **Forward-pointer on ADR-0008 itself:** a `> **Partially superseded by ADR-0030**...` blockquote added
  directly under the existing Status line, mirroring ADR-0011's and ADR-0014's own blockquote placement,
  wording register, and the "partially" qualifier (since the `producer` content agent's own attended
  behavior described in the rest of ADR-0008 is genuinely unchanged — only the "no headless worker host"
  clause is reversed).
- **Rewrote (not appended to) rule 11** in `.claude/rules/always/organicgrowth-rules.md` — the exact
  self-contradiction qa's repro pointed at (`sed -n '56,71p'`) is gone: the rule now states, in one
  coherent paragraph with two clearly-named paths, that (1) the attended `producer` content agent works
  the Production Queue in the Operator's session, one generation at a time (`docs/adr/0008`, unchanged),
  and (2) the unattended worker (`drainQueue`/`runOneJob`) now also exists for zero/single-gate wired
  Recipes, holding its own credentials, self-auditing each phase, parking without holding the Space
  (`docs/adr/0030`). No sentence anywhere in the rule now says "there is no unattended background worker."
- **Removed** the "Known Limit" bullet in this same Build Report (Round 1) that said a superseding ADR
  "is NOT written by this ticket" — it is now written. (Left the Round-1 text below UNCHANGED per the
  Slice Handoff's own append-only convention; this note records the removal's rationale instead of editing
  Round 1's prose.)

**Defect 2 (LOW) — spec-delta completeness gap, fixed:**

- `specs/worker/spec.md`'s "Each phase is self-audited against its Phase Contract before advancing"
  Requirement body now explicitly names all THREE currently-auditable phases (`author`, `bind-media`,
  `copy` — and explicitly notes `gate`/`render`/`save` have no generic mechanical auditor yet, the
  pre-existing, documented limit `recipe/phase-contract.ts` itself states). Added the missing third
  Scenario, "An invalid composed Copy stops the job before the Asset is ever saved produced," matching
  `worker.test.ts`'s real, already-passing test from Round 1's second commit.

### Files touched (Round 2)

New:
- `docs/adr/0030-worker-drains-the-queue-unattended.md`

Modified:
- `docs/adr/0008-producer-drives-the-space-attended.md` (+forward-pointer blockquote only; the rest of the
  file, including its own Decision/Consequences prose, is byte-unchanged)
- `.claude/rules/always/organicgrowth-rules.md` (rule 11 rewritten in place — no other rule touched)
- `openspec/changes/issue-208-worker-drains-queue/specs/worker/spec.md` (Requirement body widened + one
  new Scenario)
- `openspec/changes/issue-208-worker-drains-queue/tasks.md` (+"8. Round 2" section)
- `openspec/changes/issue-208-worker-drains-queue/handoff.md` (this Round-2 Build block)

No `src/` file touched at all this round — confirmed by `git status --short src/` returning empty
throughout Round 2.

### How to run (Round 2)

Identical commands to Round 1:
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
npx openspec validate issue-208-worker-drains-queue --strict
npx openspec validate --all --strict
npm test
npm run test:docs
```

**Results:** `openspec validate issue-208-worker-drains-queue --strict` → `Change
'issue-208-worker-drains-queue' is valid`. `openspec validate --all --strict` → **62 passed, 0 failed**
(unchanged from Round 1). `npm test` → **3339 tests / 884 suites / 0 fail** (identical count to Round 1 —
expected, since no `src/` file changed). `npm run test:docs` → **295 tests / 80 suites / 0 fail**
(matches qa's own Round-1 measurement exactly).

### Defect-by-defect resolution

| Defect | qa's fix expectation | What was done |
|---|---|---|
| 1 (HIGH) — ADR-0008 contradicted, no forward-pointer | "either (a) a new ADR... with a forward-pointer blockquote added to the top of ADR-0008... or (b) an amending blockquote directly on ADR-0008" | Did BOTH halves of option (a): new `docs/adr/0030` plus a forward-pointer blockquote on ADR-0008, mirroring ADR-0011→ADR-0028/ADR-0014→ADR-0029 exactly. Also fixed the self-contradicting rule-11 paragraph qa's repro named specifically. |
| 2 (LOW) — spec delta missing the copy-phase Scenario | "add a third Scenario (or fold copy-phase coverage into the Requirement text)" | Did both: widened the Requirement body AND added the third Scenario. |

### Self-review notes (Round 2)

- Considered whether to also rewrite `tasks.md`'s original task 1.7 (the line qa quoted as evidence the
  plan intended to treat the issue body as ADR-superseding authority) in place. Left it as the historical
  record of what Round 1 actually planned/did, and instead added the new "8. Round 2" section explaining
  the correction — matches this repo's own append-only convention for Slice Handoffs and mirrors how
  issue #209's own Round 2 handled an analogous course-correction (append a new numbered section, never
  rewrite a checked-off one).
- Verified the new ADR-0030 does not collide with any doc-conformance test scoped to a specific ADR count
  or an unrelated ADR file: `src/db/adr.docs-test.ts` (scoped to ADR-0028/0029 only) and
  `src/commands/report.docs-test.ts` (scoped to `.claude/commands/pick-cast.md`, a file this round never
  touched) both still pass, confirmed by running them directly before the full suite.
- Deliberately did NOT touch `.claude/commands/pick-cast.md`/`pick.md` (both still correctly state "no
  unattended background worker" as a fact about THAT command's own attended flow, which remains true —
  the worker is a separate, standalone process the Operator runs independently, never spawned by
  `/pick-cast`) or any `.claude/agents/*.md` file — epic #195's own phase 05 ("The agents") is where a
  fuller rewrite of agent-facing prose belongs, matching this ticket's own already-stated scope boundary.

### Known limits (Round 2 — unchanged from Round 1, restated for completeness)

All of Round 1's "Known limits" stand unchanged (Space-less Recipes out of scope, `planLeg`'s
single-gate-per-Recipe assumption, one representative creation downloaded per Asset, one Copy Variant
against the primary Channel only, no render-tail outbox, the inherited/unmeasured
`SPACES_EDIT_WRITE_LIMIT_CHARS`). The ONE Round-1 Known Limit that Round 2 explicitly CLOSES is
"`organicgrowth-rules.md` rule 11 gained a short addendum, not a rewrite... a proper superseding ADR...
is NOT written by this ticket" — that ADR now exists (`docs/adr/0030`) and rule 11 is a rewrite, not an
addendum.

### Operator-gated live run (AC9)

Unchanged from Round 1 — see the "Operator-gated live run" section above. Not attempted this round either
(no `magnific` MCP tools; no `src/` changes to affect it regardless).

---

## QA Verdict — Round 2: FAIL

**Verifier:** qa. Same worktree, branch `issue-208-worker-drains-queue`, HEAD `0c0c2c3`. Read, ran, and
reported only — no product code, test, spec, or doc file was edited by this agent.

### No `src/` file touched this round — confirmed

`git diff f2377ae..HEAD --stat` touches exactly 6 files: `docs/adr/0008-...md`, `docs/adr/0030-...md`,
`.claude/rules/always/organicgrowth-rules.md`, `specs/worker/spec.md`, `tasks.md`, `handoff.md`. **Zero**
`src/` files. Round 1's code findings (claim primitive untouched, zero new store-write allow-list
entries, parking releases the claim, FIFO/starvation/re-claim safety, fresh-thread-id inheritance,
migrations frozen, no publish path, no live call reachable from `npm test`) stand unchanged and are not
re-derived below — they were re-verified as still true simply by confirming no `src/` diff exists.

### Suite result — GREEN, genuinely re-run, numbers match exactly

- `npx openspec validate issue-208-worker-drains-queue --strict` → `Change 'issue-208-worker-drains-queue' is valid`.
- `npx openspec validate --all --strict` → **62 passed, 0 failed** (unchanged from Round 1).
- `npm test` → **3339 tests / 884 suites / 0 fail**, `tsc --noEmit` clean (identical to Round 1 — expected,
  zero `src/` change).
- `npm run test:docs` → **295 tests / 80 suites / 0 fail** (identical to Round 1).
- `git status --short` / `git status --short data/` → clean.

Not assumed — all four re-run from a cold shell this round, not carried over from Round 1's numbers.

### Defect 1 (Round 1, HIGH) — ADR-0008 governance trail: FIXED, well done, but see the NEW Defect 3 below

`docs/adr/0030-worker-drains-the-queue-unattended.md` is a genuinely good ADR, checked point by point:

- **Shape mirrors ADR-0028 exactly, not a third style.** Title: `"The worker drains the Production Queue
  unattended, partially reversing ADR-0008"` — same construction as ADR-0028's `"Post becomes its own
  record, reversing ADR-0011's declined split"`. Status line: `"accepted — supersedes, in part, ADR-0008
  (...). Operator decision recorded 2026-08-17, epic #195, issue #208."` — matches ADR-0028's `"accepted
  — supersedes, in part, ADR-0011 (...). Operator decision recorded 2026-08-16, epic #195."` field-for-
  field. `## Decision` / `## Why` / `## Consequences` sections, same as ADR-0028/ADR-0029. **PASS.**
- **Forward-pointer on ADR-0008 mirrors the ADR-0011→ADR-0028 / ADR-0014→ADR-0029 convention exactly.**
  `> **Partially superseded by [ADR-0030](./0030-worker-drains-the-queue-unattended.md)** (issue #208,
  epic #195, Operator decision 2026-08-17): ...` placed directly under the existing Status line — same
  placement, same "Partially superseded by" phrasing register as ADR-0011's own blockquote. Verified by
  direct read of `docs/adr/0008-...md` lines 1–17. **PASS.**
- **Makes the old argument honestly before rebutting it.** ADR-0030's opening paragraph restates BOTH of
  ADR-0008's original reasons in good faith — the `auto`-mode permission classifier re-blocking allow-
  listed Space calls, and the Cast gate meaning "a human was present partway through every job regardless"
  — before explaining specifically why each no longer binds (a worker is not a Claude Code agent session,
  so the classifier never applies to it; two of three wired Recipes declare zero gates, so the
  "human-present-anyway" argument was never true for them). This is a fair restatement, not a strawman.
  **PASS.**
- **Serialization claim is accurate to what the code does.** "`drainQueue`'s own loop never starts a
  second job's `runOneJob` call before the current one reaches `done`/`awaiting_pick`/`failed`... If more
  than one worker process is ever run concurrently... the SQL atomic `claimJob`... is the arbitration
  primitive — this ADR does not introduce a second one." This matches Round 1's own independent
  verification: `claimJob` is byte-for-byte unmodified, and `run-worker.ts`'s loop is a plain sequential
  `for` loop with no concurrency primitive of its own. **PASS.**
- **What is genuinely lost is NOT named.** `grep -in "watch|observ|nobody|no one|visib|sees|witness|
  unsupervised|unmonitored" docs/adr/0030-worker-drains-the-queue-unattended.md` → **zero matches.** The
  attended model's real protective property — a human watches a Magnific Space render happen, live, and
  can react in the moment (stop a wasteful/garbled generation, notice a broken canvas) — has no
  Consequences bullet, and no mention anywhere else in the ADR either. The Consequences section lists five
  things (forward-pointer recorded, rule 11 rewritten, AC9 stays Operator-gated, the file-based queue
  untouched, generate-never-publish unaffected) but never states "no human observes a live render once
  this worker drives it; the phase self-audits (author/bind-media/copy) and generate-never-publish are the
  only backstops between an unattended render and a produced Asset — they catch a broken SHAPE or a banned
  WORD, not a visually-wrong-but-structurally-valid render." This is flagged as **Defect 4 (medium)**
  below — real, but on its own would not have failed this round.

### Defect 2 (Round 1, LOW) — spec-delta copy-phase Scenario: FIXED

`specs/worker/spec.md`'s "Each phase is self-audited against its Phase Contract before advancing"
Requirement body now names all three phases explicitly (`author`, `bind-media`, `copy`), states the
`gate`/`render`/`save` scope limit plainly, and a new Scenario, "An invalid composed Copy stops the job
before the Asset is ever saved produced," was added. Traced against the real test: `worker.test.ts` →
`"the copy phase stops an invalid drafted Copy before the Asset is saved produced (AC3)"` — GIVEN an
empty-caption drafter (fails `auditCopyPhase`), THEN `outcome.status === "failed"`, `saved.status !==
"produced"`, `listAssetMedia(...) === []`. The Scenario's GIVEN/THEN matches the test's actual setup and
assertions exactly, not a paraphrase that drifted. **PASS.**

### NEW Defect 3 (HIGH) — the repo-wide "no unattended background worker" claim was fixed in ONE file, not repo-wide

The coordinator's explicit check this round — "no other rule or doc still asserts 'there is no unattended
background worker'" — fails. Six files outside `organicgrowth-rules.md` still assert exactly that,
unqualified by ADR-0030 and without mentioning the worker exists at all:

| File : line | What it says |
|---|---|
| `README.md:68` | *"Production is **attended**: it runs in your session and you approve the Magnific calls as they happen — there is no unattended background worker ([`docs/adr/0008`](./docs/adr/0008-producer-drives-the-space-attended.md))."* |
| `CLAUDE.md:54–57` | *"**Production runtime (attended).** Production runs **in the Operator's session**, not in an unattended background process... There is deliberately **no headless worker host and no unattended-permission wiring**..."* citing only ADR-0008, never ADR-0030 |
| `.claude/commands/run-pipeline.md:84–90` | *"Production runtime — attended (ADR-0008)... There is deliberately **no headless worker host and no unattended-permission wiring**..."* |
| `.claude/commands/pick.md:42–44` | *"...the Producer resumes the job **in the Operator's session**... there is no unattended background worker (ADR-0008)."* |
| `.claude/commands/pick-cast.md:57–59` | *"...the Producer resumes the job **in the Operator's session**... there is no unattended background worker (ADR-0008)."* |
| `.claude/agents/producer.md:60` | *"...deliberately no unattended/background worker for you to be..."* |

**README.md, CLAUDE.md, and `run-pipeline.md` are the serious cases**: they describe "Production runtime"
as a single, unqualified, system-wide fact — not scoped to one command or one agent — and that fact is
now flatly false: a headless worker host (`src/commands/run-worker.ts`) exists and is merged onto this
branch. CLAUDE.md in particular is the top-level file every future Claude Code session in this repo reads
first; a reader (human or agent) who opens it finds "there is deliberately no headless worker host and no
unattended-permission wiring," the exact opposite of what ADR-0030 just recorded as accepted. This is
Priority One's own failure mode — "a future reader finds [the doc] saying X and [the code] doing the
opposite, with no trail between them" — recurring in a wider set of files than the one Round 1 caught.

`producer.md:60` and `pick.md`/`pick-cast.md`'s claims are narrower and arguably still literally true on
a strict reading (they describe the `producer` **agent's** own behavior / the `/pick-cast` command's own
attended-resume flow specifically, and the worker genuinely is a separate process the `producer` agent
does not become and `/pick-cast` does not spawn) — the developer's Round-2 self-review notes make exactly
this argument, and it holds up. But even these three are now **incomplete**: none mentions that a second,
unattended path exists at all, or cites ADR-0030, so a reader gets a one-sided picture from any of them.

**This is not a fresh oversight — it was seen and deliberately left.** `tasks.md`'s own Round-2 task 8.4
records: *"Confirmed no docs-test breaks (`report.docs-test.ts`'s `pick-cast.md`/ADR-0008 checks are
scoped to a different file, untouched...)"* — the developer read `report.docs-test.ts`, saw it pins the
stale claim on `pick-cast.md`, and treated "the test still passes" as sufficient, rather than treating a
passing test that enforces a now-inaccurate claim as itself a signal to raise.

**And the tests actively enforce the stale claim as a requirement — this is worse than a stale comment.**
`src/commands/run-pipeline.docs-test.ts` (`"run-pipeline.md documents the attended runtime and the
deliberate absence of an unattended one"`) asserts `run-pipeline.md` MUST match
`/deliberately \*{0,2}no\b[\s\S]{0,10}headless worker host/i` and MUST match `/unattended-permission
wiring/i`. `src/commands/report.docs-test.ts` (`"pick-cast.md is honest that production is attended — no
unattended background worker (ADR-0008)"`) asserts `pick-cast.md` MUST match `/no unattended background
worker/i`. Both are inside the green 3339-test suite right now — the suite being green does not mean the
docs are accurate; it means the docs match tests that were never updated to reflect ADR-0030.

**Worse still: the LIVE (non-archived) spec registry itself pins the stale claim as a Requirement.**
`openspec/specs/docs-conformance/spec.md` (this is `openspec/specs/`, the current merged-spec registry —
not an `openspec/changes/` proposal, and not the archived 2026-07-16 issue-59 change under a similar
path) has a live `### Requirement: Docs-conformance tests pin the CURRENT reality, never a superseded
honesty disclaimer` whose own `#### Scenario: report.docs-test.ts asserts pick-cast.md's attended-runtime
claim, not the retired disclaimer` states: *"the suite asserts the doc states the render runs in the
Operator's session, that there is no unattended background worker, and that it cites ADR-0008"* — and a
parallel Scenario for `run-pipeline.docs-test.ts`. This spec's own Requirement text says tests must "pin
the CURRENT reality" — and its own Scenario, unmodified by this change, now pins something that is no
longer the current reality. This is exactly the "self-consistent-but-wrong spec" failure mode: the spec
is green against itself (the tests it describes do pass) but wrong against the reality ADR-0030 itself
just recorded.

**Severity: high.** Same reasoning as Round 1's Defect 1 — no runtime harm, no publish risk, no data
loss — but this is squarely the check the coordinator asked for this round, it recurs across the most
central onboarding docs in the repo (CLAUDE.md, README.md), and it is reinforced by currently-green tests
and a currently-live spec Requirement that actively pin the wrong answer, meaning the next person to try
fixing README.md/CLAUDE.md will find their fix breaking `npm run test:docs` unless they also touch
`run-pipeline.docs-test.ts`/`report.docs-test.ts` and `openspec/specs/docs-conformance/spec.md` — a
larger, coupled fix than "edit two sentences."

**Repro:**
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
grep -n "no unattended\|unattended background\|no headless worker\|not in an unattended" README.md CLAUDE.md \
  .claude/agents/producer.md .claude/commands/pick.md .claude/commands/pick-cast.md .claude/commands/run-pipeline.md
sed -n '45,62p' CLAUDE.md          # "deliberately no headless worker host and no unattended-permission wiring"
sed -n '60,90p' README.md          # "there is no unattended background worker"
sed -n '72,90p' openspec/specs/docs-conformance/spec.md   # live spec Scenario pinning the stale claim
grep -n "headless worker host\|unattended-permission wiring" src/commands/run-pipeline.docs-test.ts
grep -n "no unattended background worker" src/commands/report.docs-test.ts
```

**Fix expected before PASS:** update README.md, CLAUDE.md, and `run-pipeline.md`'s unqualified "no
unattended background worker" claims to name BOTH paths (as `organicgrowth-rules.md` rule 11 now does)
and cite ADR-0030; update `run-pipeline.docs-test.ts`/`report.docs-test.ts`'s assertions to match; update
`openspec/specs/docs-conformance/spec.md`'s own Requirement/Scenario text via a proper spec delta (this
change, or a follow-up this change's proposal explicitly opens, since `docs-conformance` is not among its
"Modified Capabilities" today). `producer.md`/`pick.md`/`pick-cast.md` may be left as literally-true-but-
narrow, or extended to mention ADR-0030 for completeness — the Operator's call, lower priority than the
three system-wide docs.

### NEW Defect 4 (MEDIUM) — ADR-0030 does not name what is lost

See the write-up under "Defect 1... FIXED, well done, but see NEW Defect 3" above. ADR-0030 fairly
restates and rebuts ADR-0008's original reasoning (honest on that front — full credit) but never states,
anywhere in the document, that the attended path's real-time human oversight of a live Space render is
gone on the unattended path: nobody watches a News Carousel render happen; the only backstops are the
phase self-audits (which catch a broken Production-Spec shape, a missing Brand Asset, or a banned word —
not a visually-wrong-but-structurally-valid render) and generate-never-publish (which catches nothing
until a human later reviews a `produced` Asset before Publish). Given this is explicitly reversing a
decision the Operator once made the other way (closing the unattended-runtime epic not-planned and
restoring attended mode deliberately, per ADR-0008's own Context paragraph), a future reader relying on
ADR-0030 to understand the tradeoff being accepted does not get the cost side of it from the ADR itself.

**Severity: medium** — a completeness/honesty gap in an otherwise well-constructed ADR, not a functional
defect; it does not on its own change the overall verdict, but should be fixed alongside Defect 3 rather
than left for a third round.

**Repro:**
```
grep -in "watch\|observ\|nobody\|no one\|visib\|sees\|witness\|unsupervised\|unmonitored" \
  docs/adr/0030-worker-drains-the-queue-unattended.md   # zero matches
```
**Fix expected:** one additional `## Consequences` bullet naming the loss plainly (no human watches a
live render on the unattended path; the phase self-audits and generate-never-publish are the backstops,
and what they do and do not catch).

### Always-rules + Magnific-fake check (re-confirmed, unchanged from Round 1)

No `src/` file changed, so these are unchanged and were spot-re-confirmed rather than re-derived:
`generate-never-publish` PASS (no publish call reachable), `public-metrics-only`/`relative-not-absolute`/
`explicit-attribution` PASS (N/A, no metrics/attribution code in this slice), `ledger-as-source-of-truth`
PASS (every write goes through the command surface to the SQL stores), Magnific-fake check PASS (only
`FakeSpace`/`FakeCarouselSpace` reachable from `npm test`).

### Per-criterion / per-scenario results

Unchanged from Round 1 (AC1–AC8 all PASS with real, specific tests; AC9 correctly not attempted). All
worker/command-surface/job-claim-store/asset-store Scenarios trace to passing tests, now including the
copy-phase Scenario (Defect 2, fixed). No `src/` change this round means no re-derivation was needed or
performed from scratch; each was spot-checked against the unchanged diff instead.

### Operator's live-run steps (AC9) — unchanged from Round 1

Still exactly as documented in the Build Report's "Operator-gated live run" section: merge → pick an
accepted Straw Motion Idea with an authored News Carousel Spec (`asset.status: 'queued'`) → commit/
register the `brand-logo` Brand Asset → instantiate `LiveSpaceAdapter` with a real `LiveMcpTransport` in
an attended session holding the `magnific` MCP tools → call `drainQueue(db, liveAdapter, { poll: {} })`.
Pass/fail signs and the three `reason`-string failure classes (`"drive failed: ..."`, `"bind-media phase
failed"`, `"downloading the rendered Asset failed"`) are unchanged. Nothing in this round touched
`src/space-driver/live/` or `src/commands/run-worker.ts`.

### Defect list (Round 2)

1. **[FIXED]** Round-1 Defect 1 (ADR-0008 governance) — `docs/adr/0030` + forward-pointer + rule-11
   rewrite, verified against precedent point by point above.
2. **[FIXED]** Round-1 Defect 2 (spec-delta copy-phase Scenario) — verified against the real test.
3. **[NEW — HIGH]** README.md, CLAUDE.md, and `.claude/commands/run-pipeline.md` still assert, as an
   unqualified system-wide fact, "there is no unattended background worker" / "no headless worker host
   and no unattended-permission wiring," citing only ADR-0008 and never ADR-0030, contradicting the ADR
   this same round just recorded as accepted — reinforced by two currently-passing docs-conformance tests
   (`run-pipeline.docs-test.ts`, `report.docs-test.ts`) and by the live (non-archived)
   `openspec/specs/docs-conformance/spec.md`'s own Requirement/Scenario text, none of which were updated.
   `.claude/agents/producer.md`, `.claude/commands/pick.md`, `.claude/commands/pick-cast.md` carry a
   narrower, arguably-still-true claim but are incomplete (never mention the worker or ADR-0030 exists).
   **Blocks PASS.**
4. **[NEW — MEDIUM]** `docs/adr/0030` never states what is lost on the unattended path (no human watches
   a live render in real time) — a completeness gap in an otherwise honest, well-shaped ADR. Does not by
   itself block PASS, but should be fixed in the same round as Defect 3.

### Overall — Round 2

**PASS/FAIL: FAIL.** Both Round-1 defects are genuinely, cleanly fixed — ADR-0030 is a real, honest
supersession that mirrors this repo's own established precedent closely and fairly restates ADR-0008's
original reasoning before rebutting it; the spec-delta gap is closed exactly as asked. The code is
unchanged (verified by empty `git diff f2377ae..HEAD -- src/`) and everything Round 1 verified about the
code — no publish path, no live call in `npm test`, claim primitive untouched, zero new store-write
allow-list entries, parking genuinely releases the claim, FIFO/starvation/re-claim safety, fresh-thread-id
inheritance, frozen migrations — still holds by construction. All four suite numbers were re-run from
scratch this round and match exactly: `openspec --all --strict` 62/0, `npm test` 3339/884/0-fail, `npm
run test:docs` 295/80/0-fail.

The reason this is still not a PASS is **Defect 3**: the coordinator's own Round-2 ask — confirm no other
rule or doc still asserts "there is no unattended background worker" — turned up exactly that, in the
repo's two most central onboarding documents (CLAUDE.md, README.md) plus `run-pipeline.md`, unqualified
and uncorrected, with two currently-green tests and the live docs-conformance spec actively pinning the
stale claim as a requirement. Merging now would put a PR into `main` whose own top-level CLAUDE.md flatly
contradicts the ADR the same PR just added. **This should block the merge.** Fix Defect 3 (and, ideally,
Defect 4 alongside it) and resubmit for Round 3.

---

## Round-3 Build (developer)

### What changed

Fixed both Round-2 defects. No `src/` production code changed — confirmed by
`git diff --stat -- 'src/**/*.ts' ':!src/**/*.docs-test.ts' ':!src/**/*.test.ts'` returning empty. Every
change this round is either prose (an ADR, a rules file, six markdown docs) or a docs-conformance test
re-pinned to the new prose, plus one OpenSpec spec delta.

**Defect 3 (HIGH) — the repo's two front doors, and four other docs, still said the opposite.**

Widened the fix from "one rules file" (Round 2) to every place the coordinator's explicit check named,
plus the two files QA additionally flagged as narrower-but-incomplete:

- **`CLAUDE.md`** (the top-level file every session reads first) and **`README.md`** — both rewritten to
  name BOTH paths (attended, ADR-0008; unattended, ADR-0030), each linking its own ADR.
- **`.claude/commands/run-pipeline.md`** — its "Production runtime" blockquote split into two clearly
  labeled sub-sections (Attended / Unattended), same content as before for the attended half, new content
  for the unattended half, citing ADR-0030.
- **`.claude/commands/pick.md` and `.claude/commands/pick-cast.md`** — extended (not left narrow). QA's
  own verdict explicitly permitted leaving these two (plus `producer.md`) as "literally-true-but-narrow,
  lower priority... if you leave them, say why." Chose to extend anyway, for one concrete reason: the
  coordinator's own instruction list named `report.docs-test.ts` as a test that MUST be updated to pin
  the new wording, and that file's ONLY relevant hook is `pick-cast.md`'s "no unattended background
  worker" assertion — updating the test without updating the doc it pins would mean asserting a claim the
  doc no longer needs to make, an inconsistency of its own. Extending `pick.md` alongside `pick-cast.md`
  (they are near-duplicate commands, `/pick` and its `/pick-cast` alias) then keeps the repo internally
  consistent rather than leaving one alias extended and the other not.
- **`.claude/agents/producer.md`** — extended for the same consistency reason, plus its own docs-test
  (`producer-agent.docs-test.ts`) already lived in this repo and was cheap to strengthen alongside it.
  producer.md's claim about ITS OWN behavior (this agent runs attended) stays exactly true; it now also
  names that a separate worker exists, so a reader of this one file is not left with an incomplete
  picture.

**Every docs-conformance test that pinned the old, now-false claim was re-pinned to the new wording — not
weakened.** Each of the three updated test files gained a `doesNotMatch` guard against the OLD unqualified
claim reappearing (`no headless worker host`, `no unattended background worker`), so a future prose
revert is still caught, exactly as the coordinator asked:

- `src/commands/run-pipeline.docs-test.ts` — renamed test title, added ADR-0030/`unattended`/`no human
  present`/`run-worker` assertions, added the `doesNotMatch(/no headless worker host/i)` regression guard.
- `src/commands/report.docs-test.ts` — renamed the pick-cast.md test, same treatment
  (ADR-0030/`unattended` assertions + `doesNotMatch(/no unattended background worker/i)` guard); added
  TWO brand-new tests (`CLAUDE.md`, `README.md`) with the same shape, since neither file had ANY prior
  docs-test coverage at all — leaving them unpinned would mean a future revert of this round's own fix
  goes unnoticed. Widened the file's own top-of-file doc comment to name README.md as a file it now reads.
- `src/production-spec/producer-agent.docs-test.ts` — added one new assertion (`ADR-0030` citation) to
  the existing attended-runtime test, rather than a new test, since the existing test already owns
  "producer.md's attended-runtime honesty" as its subject.
- `.claude/commands/pick.md` was extended in prose but gained NO new docs-test: grepped every
  `*.docs-test.ts` file for a reference to `pick.md` (bare, not `pick-cast.md`) and confirmed none exists
  — there was no prior pin to either preserve or strengthen, and adding a first one felt like scope
  creep beyond what Round 3 was asked to fix. Disclosed here rather than left silent.

**Updated `openspec/specs/docs-conformance/spec.md` via a proper MODIFIED-Requirement spec delta**
(`specs/docs-conformance/spec.md` under this change), matching the live requirement's title
byte-for-byte (`### Requirement: Docs-conformance tests pin the CURRENT reality, never a superseded
honesty disclaimer`) — the MODIFIED-header archive trap this repo has hit before. Reproduced the
Requirement body verbatim (unchanged), updated the two Scenarios whose own docs-tests changed
(`pick-cast.md`, `run-pipeline.md`), lightly widened the `producer-agent.docs-test.ts` Scenario to
mention the new ADR-0030 citation, left the QA-1 regression-guard Scenario byte-identical (untouched,
unrelated), and added two brand-new Scenarios (`CLAUDE.md`, `README.md`) mirroring the new tests.
Added `docs-conformance` to `proposal.md`'s own "Modified Capabilities" list (it was missing there,
exactly as QA's repro noted).

**Deliberately NOT touched:** the OTHER Requirement in the same spec file, "The repository retains no
dead ADR-0004 unattended-background-worker code." Its own Scenario (`worker.ts is absent and
unreferenced`) checks a SPECIFIC retired path, `src/production-queue/worker.ts` — this ticket's worker
code lives at `src/command-surface/worker.ts` and `src/commands/run-worker.ts`, neither of which matches
that path, so the Scenario's own literal check still passes and asserts nothing false. The Requirement's
PROSE ("that code SHALL NOT be present or referenced") is adjacent to this ticket's own reversal in
spirit but not literally contradicted by anything this ticket ships — flagged as worth a future glance,
not fixed here, to keep this round's diff scoped to what QA actually flagged as broken.

**Defect 4 (MEDIUM) — ADR-0030 never named what is lost.**

Added a new, first-listed `## Consequences` bullet to `docs/adr/0030` stating plainly that nobody watches
a render happen in real time on the unattended path, naming the two backstops that exist instead (the
phase self-audits — catch a broken Spec shape, a missing Brand Asset, or a banned word, never a
structurally-valid-but-visually-wrong render — and generate-never-publish, which catches nothing until a
human reviews the Asset before Publish, by which point Space credits are already spent), and stating this
ADR accepts that gap deliberately for the two zero/single-gate wired Recipes, not as a free trade-off.
Re-ran the exact grep QA's own repro used (`grep -in "watch|observ|nobody|no one|visib|sees|witness|
unsupervised|unmonitored" docs/adr/0030-...md`) — now matches `watch` (x2), `Nobody`, and `no one`; the
previous zero-match repro would now find hits.

### Files touched (Round 3)

Modified:
- `docs/adr/0030-worker-drains-the-queue-unattended.md` (+Consequences bullet — Defect 4)
- `CLAUDE.md`, `README.md`, `.claude/commands/run-pipeline.md`, `.claude/commands/pick.md`,
  `.claude/commands/pick-cast.md`, `.claude/agents/producer.md` (all six — Defect 3)
- `src/commands/run-pipeline.docs-test.ts`, `src/commands/report.docs-test.ts`,
  `src/production-spec/producer-agent.docs-test.ts` (re-pinned, strengthened, not weakened — Defect 3)
- `openspec/changes/issue-208-worker-drains-queue/proposal.md` (+`docs-conformance` to Modified
  Capabilities, +file-list notes)
- `openspec/changes/issue-208-worker-drains-queue/handoff.md` (this Round-3 Build block)

New:
- `openspec/changes/issue-208-worker-drains-queue/specs/docs-conformance/spec.md` (MODIFIED-Requirement
  spec delta)

No `src/` file outside `*.docs-test.ts` touched — confirmed by
`git diff --stat -- 'src/**/*.ts' ':!src/**/*.docs-test.ts' ':!src/**/*.test.ts'` returning empty.

### How to run (Round 3)

Identical commands to Rounds 1–2:
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
npx openspec validate issue-208-worker-drains-queue --strict
npx openspec validate --all --strict
npm test
npm run test:docs
```

**Results:** `openspec validate issue-208-worker-drains-queue --strict` → `Change
'issue-208-worker-drains-queue' is valid`. `openspec validate --all --strict` → **62 passed, 0 failed**
(unchanged — the docs-conformance delta modifies an EXISTING capability's Requirement, it does not add a
new one, so the item count is unaffected). `npm test` → **3341 tests / 884 suites / 0 fail** (+2 from
Round 2's 3339 — the two brand-new CLAUDE.md/README.md docs-tests; `npm test`'s own glob includes
`*.docs-test.ts`, so they count here too). `npm run test:docs` → **297 tests / 80 suites / 0 fail** (+2
from Round 2's 295, same two new tests). As the coordinator anticipated: "expect the docs-test numbers to
move as you re-pin — that is fine and expected." Both deltas are +2/+2, exactly the two brand-new tests
added; every RE-PINNED test (run-pipeline.md, pick-cast.md, producer.md) is a same-count edit to an
existing `it()`, not a new one.

### Defect-by-defect resolution (Round 3)

| Defect | qa's fix expectation | What was done |
|---|---|---|
| 3 (HIGH) — stale claim survives in CLAUDE.md/README.md/run-pipeline.md + 2 green tests + the live spec | "update README.md, CLAUDE.md, and run-pipeline.md... cite ADR-0030; update run-pipeline.docs-test.ts/report.docs-test.ts... update docs-conformance/spec.md via a proper spec delta... producer.md/pick.md/pick-cast.md may be left... or extended" | Updated all SIX docs (extended rather than left the three optional ones, reasoned above); re-pinned (never weakened) all three affected docs-test files, adding regression guards; added the docs-conformance spec delta, `docs-conformance` added to Modified Capabilities. |
| 4 (MEDIUM) — ADR-0030 never names what is lost | "one additional Consequences bullet naming the loss plainly... and what the backstops are... including what they do not catch" | Added the bullet, first in the Consequences list; names the two backstops AND what each does not catch; states the trade-off is accepted deliberately, not free. |

### Self-review notes (Round 3)

- Ran every affected docs-test file individually BEFORE the full suite, to localize failures fast: caught
  one real bug this way — the first README.md draft cited `docs/adr/0008`/`docs/adr/0030` only as
  markdown LINK PATHS (lowercase, no "ADR-" prefix in the visible text), which the new test's
  case-sensitive `/ADR-0008/` regex correctly failed to match. Fixed by adding the literal "ADR-0008"/
  "ADR-0030" labels alongside the links, matching how every OTHER doc in this repo cites an ADR.
- Deliberately did NOT invent a docs-test for `pick.md` (see "Deliberately NOT touched" above) — chose
  proportionality over maximal coverage for a file this round was not required to protect.
- Deliberately did NOT touch the sibling "no dead ADR-0004 code" Requirement in the same spec file (see
  above) — its own Scenario is not contradicted by anything this ticket ships; touching it would have
  been scope creep into a Requirement QA never flagged as broken.
- Considered adding a THIRD grep-based regression test asserting the two new ADR files
  (`docs/adr/0008`/`docs/adr/0030`) cross-reference each other, mirroring `src/db/adr.docs-test.ts`'s own
  precedent for ADR-0028/ADR-0029. Decided against it for THIS round: it was not requested, and Round 2's
  QA Verdict already verified the forward-pointer/blockquote pairing by direct read, point by point.
  Flagged here as a reasonable follow-up, not silently skipped.

### Known limits (Round 3 — additive to Rounds 1–2, nothing removed)

All Round 1/2 Known Limits stand unchanged. Round 3 adds one: the "no dead ADR-0004 code" Requirement in
`openspec/specs/docs-conformance/spec.md` is adjacent-in-spirit to this ticket's own ADR-0008 reversal but
not literally broken by it (see "Deliberately NOT touched" above) — worth a maintainer's glance in a
future round, not urgent.

### Operator-gated live run (AC9)

Unchanged from Rounds 1–2 — see the "Operator-gated live run" section above. Not attempted this round
either (no `magnific` MCP tools; no `src/` production-code changes to affect it regardless).

---

## QA Verdict — Round 3: FAIL

**Verifier:** qa. Same worktree, branch `issue-208-worker-drains-queue`, HEAD `017746c`. Read, ran, and
reported only — no product code, test, spec, or doc file was edited by this agent (a temporary,
read-only comparison against the pre-Round-3 doc text was attempted via direct file overwrite and
correctly BLOCKED by the auto-mode permission classifier; the equivalent check was instead done safely
by running the actual regex assertions against `git show`-dumped old text in the scratchpad, never
touching a tracked file — see "doesNotMatch guards" below).

### No `src/` production file touched this round — confirmed

`git diff 0c0c2c3..HEAD --stat -- src/` touches exactly 3 files, all `*.docs-test.ts`:
`src/commands/report.docs-test.ts`, `src/commands/run-pipeline.docs-test.ts`,
`src/production-spec/producer-agent.docs-test.ts`. Zero `*.ts`/`*.test.ts` production files. Round 1's
code findings (claim primitive untouched, zero new store-write allow-list entries, parking releases the
claim, FIFO/starvation/re-claim safety, fresh-thread-id inheritance, migrations frozen, no publish path,
no live call reachable from `npm test`) stand unchanged.

### Suite result — GREEN, genuinely re-run, deltas match exactly

- `npx openspec validate issue-208-worker-drains-queue --strict` → `Change 'issue-208-worker-drains-queue' is valid`.
- `npx openspec validate --all --strict` → **62 passed, 0 failed** (unchanged — the docs-conformance
  delta MODIFIES an existing Requirement, it does not add a new capability, so the item count is
  unaffected — confirmed this reasoning is correct, not just asserted).
- `npm test` → **3341 tests / 884 suites / 0 fail** (+2 from Round 2's 3339 — exactly the two brand-new
  CLAUDE.md/README.md docs-tests; `npm test`'s glob includes `*.docs-test.ts`).
- `npm run test:docs` → **297 tests / 80 suites / 0 fail** (+2 from Round 2's 295, same two tests).
- `git status --short` → clean throughout.

All four re-run from a cold shell this round, not carried over.

### Defect 3 (Round 2, HIGH) — the stale claim: PARTIALLY fixed — the silence is gone, but a NEW inaccuracy replaces it in 4 of the 6 files

**The coordinator's specific ask — "no other rule or doc still asserts 'there is no unattended background
worker'" — is now satisfied.** An independent sweep (`git ls-files | xargs grep -ln` for every variant of
the old phrasing across the WHOLE tracked repo, not just the developer's own six-file list) turns up the
phrase only in: `docs/adr/0008` (its own original Decision text, now carrying the Round-2 forward-pointer
— expected, historical), `docs/adr/0030` (quoting ADR-0008 to explain the reversal — expected), the three
re-pinned `*.docs-test.ts` files (inside `doesNotMatch` regexes and doc-comment history — expected), the
archived changes `2026-07-10-issue-40-...` and `2026-07-16-issue-59-...` (historical record, correctly
untouched), and this change's own `handoff.md`/`proposal.md`/`specs/docs-conformance/spec.md` (quoting
the old text for context/repro — expected). **No other tracked file still asserts the old, unqualified
claim.** README.md and `.claude/agents/producer.md`'s Round-3 rewrites are accurate and careful — good
work, no notes.

**But two of the four remaining rewrites (`CLAUDE.md`, `.claude/commands/run-pipeline.md`) and both
command docs extended "for consistency" (`.claude/commands/pick.md`, `.claude/commands/pick-cast.md`)
introduce a NEW factual inaccuracy that directly contradicts ADR-0030's own (accurate) Consequences
section — this is a fresh defect, not the one being fixed.**

- `CLAUDE.md:67`: *"Either way the **Production Queue** is the same backlog of accepted-Idea jobs
  (ADR-0006); the Operator chooses which path drains a given job."*
- `.claude/commands/run-pipeline.md:84–86`: *"An accepted Idea's job can be produced either way; which
  path drains a given job is your own choice, not something either agent decides for itself."*
- `.claude/commands/pick.md:42–48` and `.claude/commands/pick-cast.md:57–64` (identical passage in
  both): *"once the pick is in, the resumed job renders through one of two paths — same as any other
  queued job (ADR-0008 attended; ADR-0030 unattended)... Unattended: a separate worker
  (`src/commands/run-worker.ts`) claims and drives it with no human present..."*

**This is not true of the code as it stands, verified directly, not assumed:**

- `.claude/commands/pick.ts`'s `resumeGate` (the function BOTH `/pick` and `/pick-cast` call — confirmed
  by `import { resumeGate } from "./pick.ts"` in `pick-cast.ts:52`) imports exclusively
  `enqueueNextLeg`/`markPickConsumed`/`loadQueue`/`saveQueue`/`DEFAULT_QUEUE_PATH` from
  `../production-queue/queue.ts`, `../production-queue/scheduler.ts`, and `../production-queue/store.ts`
  — the FILE-BASED `data/queue.json` system, byte-for-byte the same one `pick.md`'s own body text names
  two lines above the false callout (`"written onto the Idea's enqueued next-leg job in the global
  Production Queue (data/queue.json)"`). Zero import of `src/production-queue/job-store.ts`,
  `gate-request-store.ts`, or anything under `src/command-surface/`.
- The unattended worker's OWN gate-resume path is `src/command-surface/gates.ts`'s `resolveGate` — a
  COMPLETELY SEPARATE function, operating on the SQL `job`/`gate_request` tables, that `/pick`/`/pick-cast`
  never call and never write to.
- The live, everyday flow that actually enqueues a job today — `.claude/commands/run-pipeline.md`'s own
  Review step, `src/commands/run-pipeline.ts` — imports only `enqueueOnAccept`
  (`../production-queue/enqueue-on-accept.ts`) and `loadQueue` (`../production-queue/store.ts`); zero
  import of `command-surface`, `db`, or any SQL store. `.claude/commands/review-ideas.md` confirms the
  same: every write is `data/brands/<slug>/ledger.json` + `data/queue.json`, no SQL mentioned anywhere.
- The SQL `job` table `findNextQueuedJob`/`drainQueue` actually read is populated ONLY by
  `src/importer/execute.ts`'s one-shot importer (issue #204, itself Operator-gated, not yet run against
  the live corpus per Round 1's own AC9 notes) or by `resolveGate`'s own follow-up job creation for an
  Asset that ALREADY has SQL job/gate_request history.

So: a job accepted TODAY through the real `/review-ideas`/`/run-pipeline` flow lands in `data/queue.json`
ONLY, and is invisible to `findNextQueuedJob`/`drainQueue` until/unless the Operator separately runs the
one-shot importer to copy it into SQL first — a real, un-automatic precondition none of these four docs
mention. **"The Operator chooses which path drains a given job" and "an accepted Idea's job can be
produced either way" are not true of the wiring that exists** — there are two SEPARATE, unsynchronized
backlogs today, exactly as ADR-0030's OWN Consequences bullet already states correctly: *"The file-based
`data/queue.json`/`scheduler.ts` path is untouched... The worker drains the SQL `job` table, not
`data/queue.json`... which the attended `producer` content agent still reads."* CLAUDE.md and
`run-pipeline.md` now contradict the very ADR they cite two sentences earlier. `pick.md`/`pick-cast.md`
go further: they specifically promise the Operator that a pick recorded through THAT command can be
picked up by the unattended worker, which is false — an Operator who reads `/pick-cast` and then starts
the worker expecting it to resume their pick will find `drainQueue` returns `{ processed: [] }` and
nothing happens, with no doc anywhere explaining why.

**Judging the "extend anyway" reasoning the coordinator asked about:** the STATED reasoning (leaving
`pick-cast.md` untouched would make the `report.docs-test.ts` update a no-op, so extend both `/pick` and
its alias for internal consistency) is sound AS A REASON TO ACT. It does not hold as a justification for
WHAT was written — extending coverage was the right call; the specific claim chosen to extend it with
("same as any other queued job... a separate worker... claims and drives it") was not checked against
`pick.ts`'s own imports, and does not survive that check. `producer.md`'s own extension (Round 3) shows
the accurate way to do this: it names the SQL-backed worker as touching *"the SQL-backed Production
Queue"* explicitly, distinct from *"the Production Queue (`data/queue.json`)"* the producer agent itself
works — never claiming the two are the same backlog or that a producer-agent job could resume on the
worker. `pick.md`/`pick-cast.md`/`CLAUDE.md`/`run-pipeline.md` should have followed `producer.md`'s own
pattern from the SAME commit and did not.

**Severity: high.** No runtime harm — `drainQueue` finding nothing queued and returning `{ processed: []
}` is safe, not destructive — but this is the identical failure class Priority One exists to catch (a doc
asserting something the code does not do), now freshly introduced by the very round meant to fix
documentation accuracy, appearing in the single most-read file in the repo (CLAUDE.md) plus the two
commands an Operator specifically consults when trying to resume a gated job. It also violates the
`docs-conformance` capability's OWN Requirement text, unchanged by this round: *"assert claims that are
true of the code as it stands on `main` today"* — present tense, not aspirational.

**Repro:**
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
sed -n '60,72p' CLAUDE.md                              # "the same backlog... Operator chooses which path"
sed -n '80,90p' .claude/commands/run-pipeline.md        # "can be produced either way; ... your own choice"
sed -n '38,49p' .claude/commands/pick.md                # "a separate worker ... claims and drives it"
sed -n '52,65p' .claude/commands/pick-cast.md           # same claim
grep -n "queue.json\|resumeGate\|import " src/commands/pick.ts   # resumeGate imports ONLY the file-based queue modules
grep -n "resumeGate" src/commands/pick-cast.ts                    # pick-cast delegates to the SAME resumeGate
grep -n "enqueueOnAccept\|command-surface\|db\b" src/commands/run-pipeline.ts   # the live accept flow: file-based only
grep -n "same backlog\|Operator chooses which path" docs/adr/0030-worker-drains-the-queue-unattended.md  # ADR-0030 itself makes no such claim — it says the opposite
```

**Fix expected before PASS:** in all four files, replace the "same backlog / interchangeable / Operator's
choice for a given job" framing with `producer.md`'s own accurate pattern — name the file-based
`data/queue.json` (drained by the attended producer, incl. `/pick`/`/pick-cast`'s own resumed jobs) and
the SQL-backed `job` table (drained by the unattended worker, populated today only via the one-shot
importer or `resolveGate`) as two separate stores, and state plainly that a job must exist in SQL before
the worker can see it — `/pick`/`/pick-cast` do not put it there.

### Defect 4 (Round 2, MEDIUM) — ADR-0030 now names the cost: FIXED, plainly stated, matches the code

The new, first-listed `## Consequences` bullet is unhedged and specific: *"Nobody watches a render happen
in real time on the unattended path — this is the real thing being given up... a garbled canvas, a
wasteful loop, an obviously-wrong image... no one is watching."* It then names both backstops and their
REAL scope, checked directly against Round 1's own code findings:

- *"the phase self-audits (author/bind-media/copy) catch a broken Production-Spec SHAPE, a missing
  REQUIRED Brand Asset, or a banned WORD — never a structurally-valid render that is simply visually
  wrong"* — matches `auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase`'s actual checks (Round 1:
  shape/banned-word/required-slot validation, nothing visual/semantic).
- *"Generate-never-publish... catches nothing until a human later reviews the `produced` Asset before
  Publish — by which point Space credits are already spent"* — matches `runOneJob`'s own flow (Round 1:
  stops at `status: "produced"`, no publish call anywhere, credits already spent by the time a render
  reaches that state).

Explicitly states the trade-off is accepted "deliberately, for the two zero/single-gate wired Recipes, in
exchange for throughput; it is not free" — not hedged into invisibility, and a future higher-quality-bar
Recipe is flagged as needing to weigh this cost explicitly before being added. Re-ran the exact repro from
Round 2 (`grep -in "watch|observ|nobody|no one|visib|sees|witness|unsupervised|unmonitored"`) — now
matches `watch` (×2), `Nobody`, `no one`. **PASS.** This is a record the Operator could genuinely rely on.

### The `doesNotMatch` guards — genuinely tested, not read on faith

Ran the actual regex assertions from the shipped `*.docs-test.ts` files against the OLD (pre-Round-3) doc
text, dumped read-only via `git show 0c0c2c3:<path>` into the scratchpad (never touching a tracked file —
a direct attempt to temporarily overwrite the tracked docs for this check was correctly BLOCKED by the
auto-mode permission classifier, confirming this agent cannot and did not edit product docs even
transiently):

| Guard | Old text matched (guard would fire)? |
|---|---|
| `report.docs-test.ts` — CLAUDE.md `doesNotMatch(/no headless worker host/i)` | **YES — fires.** |
| `report.docs-test.ts` — README.md `doesNotMatch(/there is no unattended background worker/i)` | **YES — fires.** |
| `report.docs-test.ts` — pick-cast.md `doesNotMatch(/no unattended background worker/i)` | **YES — fires.** |
| `run-pipeline.docs-test.ts` — run-pipeline.md `doesNotMatch(/no headless worker host/i)` | **NO — does NOT fire.** |

**The `run-pipeline.md` guard is genuinely weak, exactly the failure mode the coordinator warned about.**
The OLD run-pipeline.md text reads *"There is deliberately **no\n> headless worker host and no
unattended-permission wiring**"* — the phrase is split by a markdown line-wrap AND a `> ` blockquote
continuation marker between "no" and "headless" (an artifact of that file's own ~100-char prose wrapping,
confirmed by direct byte inspection). The new `doesNotMatch(/no headless worker host/i)` requires "no"
and "headless worker host" to be CONTIGUOUS (a single space), so it does not match the raw old text as a
contiguous substring and would silently NOT catch a literal revert to that exact paragraph — unlike the
ORIGINAL (pre-Round-2) positive-match regex it replaces, `/deliberately \*{0,2}no\b[\s\S]{0,10}headless
worker host/i`, which had `[\s\S]{0,10}` gap-tolerance for exactly this reason and WOULD have matched it.
**This dedicated guard is not the thing that would actually catch a full revert of that paragraph** — a
full revert would still be caught by the file's own sibling POSITIVE assertions (`/ADR-0030/`,
`/run-worker/i` both fail against the old text, confirmed by the same script), so the test SUITE as a
whole still catches a wholesale revert; but the SPECIFIC `doesNotMatch` line the developer added as "the
regression guard" does not do the job it was written for, and a partial/careless edit that kept the
positive-assertion phrases while re-introducing just that one line-wrapped old sentence would slip
through unnoticed by this guard.

**Severity: medium/low** — a real, verified test-quality defect (confirmed empirically, not asserted), not
a functional-code or false-doc-claim issue, and the suite's other assertions provide a safety net for the
most likely revert scenario. Worth fixing (normalize whitespace before matching, e.g. `doc.replace(/\s+/g,
" ")`, or reuse the original gap-tolerant pattern) but does not by itself change this round's verdict.

**Repro (read-only, scratchpad-only, no tracked file touched):**
```
node -e '
const re = /no headless worker host/i;
console.log(re.test("There is deliberately **no\n> headless worker host and no unattended-permission wiring**"));
' # false — the guard would not fire against the exact old paragraph
```

### Brand-new CLAUDE.md/README.md docs-tests — pin something meaningful, not merely existence

Both require specific ADR citations (`/ADR-0008/`, `/ADR-0030/`), the word "unattended", and (CLAUDE.md)
"no human present" — genuine positive pins that fail against a doc silent about either path, not a
rubber-stamp `assert.ok(doc.length > 0)`-style check. Confirmed neither test was weakened relative to what
existed before: there was NO prior CLAUDE.md/README.md docs-test coverage at all (grepped `*.docs-test.ts`
for `CLAUDE.md`/`README.md` on `0c0c2c3` — zero hits), so "re-pinned, not weakened" does not apply to
these two (correctly described by the developer as brand-new, not re-pinned).

### Two self-reported items — both confirmed

1. **README.md ADR-link case-sensitivity catch:** confirmed real. `README.md`'s current text cites the
   literal strings `ADR-0008`/`ADR-0030` (not just lowercase `docs/adr/0008` link paths) at lines 69/72,
   satisfying the new case-sensitive `/ADR-0008/`/`/ADR-0030/` regexes — verified by direct grep of the
   shipped file, not taken on the Build Report's word.
2. **A corrected inaccurate claim in the handoff draft:** the specific correction is not separately
   narrated as its own bullet in the shipped Round-3 Build block, so it could not be traced to a specific
   before/after in this repo's history (by construction — a pre-commit draft leaves no git trail). What
   IS checkable — every number, file-list, and mechanism claim actually shipped in the Round-3 Build
   block — was independently verified above and reads accurately (numbers match a from-scratch re-run
   exactly; the spec-delta title matches the live spec verbatim; the "Deliberately NOT touched" section's
   claim about the sibling "no dead ADR-0004 code" Requirement's Scenario checking a specific, different
   file path — `src/production-queue/worker.ts`, not this ticket's `src/command-surface/worker.ts` — was
   confirmed correct by direct read of that Requirement).

### Independent sweep — beyond the developer's own six-file list

Full-repo grep (`git ls-files | xargs grep -ln`, every phrasing variant) plus a targeted check of
CONTEXT.md and `docs/architecture/` (grounding docs this agent's own brief names explicitly) found:
`CONTEXT.md`'s own "Production Queue" glossary entry (`grep -n "Production Queue" CONTEXT.md`, lines
325–326 and 425) still describes it as *"the serialized backlog... the **Producer** owns... because the
single attended Operator drives one generation at a time"* with zero mention of the unattended worker or
ADR-0030. Unlike CLAUDE.md/run-pipeline.md, this text does NOT claim interchangeability or make a false
claim — it accurately describes the FILE-BASED queue specifically (matching pick.md's own description of
that exact queue), so it is not wrong, only silent/incomplete, the same "narrow-but-true" category Round 2
placed `producer.md`/`pick.md`/`pick-cast.md` in before this round chose to extend them. Flagging as a
**new, low-severity** finding (CONTEXT.md is a grounding/vocabulary doc, not a production-behavior claim,
and was never named by the coordinator's list) — not blocking, but worth a mention in whatever follow-up
addresses Defect 3's remainder, for the same completeness reason `producer.md` was extended.

### Always-rules + Magnific-fake check (re-confirmed, unchanged)

No `src/` production file changed, so these are unchanged from Round 1/2 and were spot-re-confirmed:
generate-never-publish PASS, public-metrics-only/relative-not-absolute/explicit-attribution PASS (N/A),
ledger-as-source-of-truth PASS, Magnific-fake check PASS.

### Operator's live-run steps (AC9) — unchanged

Still exactly as documented in the Build Report's "Operator-gated live run" section. Nothing in any of the
three rounds touched `src/space-driver/live/` or `src/commands/run-worker.ts`'s own production logic.

### Defect list (Round 3)

1. **[PARTIALLY FIXED → NEW DEFECT, HIGH]** Round-2 Defect 3's "silence" is genuinely closed (independent
   sweep confirms no tracked file still asserts the old, unqualified "no unattended worker" claim). But
   4 of the 6 rewritten docs (`CLAUDE.md`, `run-pipeline.md`, `pick.md`, `pick-cast.md`) now assert a NEW,
   equally false claim — that the file-based Production Queue and the SQL-backed job table are "the same
   backlog," interchangeable at the Operator's choice, or that the unattended worker "claims and drives"
   a pick recorded via `/pick`/`/pick-cast` — directly contradicting ADR-0030's own accurate Consequences
   bullet and verified false against `pick.ts`/`pick-cast.ts`/`run-pipeline.ts`'s own imports. **Blocks
   PASS.**
2. **[FIXED]** Round-2 Defect 4 (ADR-0030 names the cost) — plainly stated, unhedged, matches the code's
   actual backstop scope.
3. **[NEW — MEDIUM/LOW]** `run-pipeline.docs-test.ts`'s new `doesNotMatch(/no headless worker host/i)`
   guard does not fire against the OLD doc's own exact line-wrapped phrasing (empirically verified) — a
   real but non-blocking test-quality gap; the suite's sibling positive assertions still catch a full
   revert.
4. **[NEW — LOW]** `CONTEXT.md`'s "Production Queue" glossary entry is silent about the unattended
   worker/ADR-0030 — accurate as far as it goes (describes the file-based queue specifically, not a false
   claim), same "narrow-but-true, now incomplete" category as `producer.md` was before this round —
   informational, not blocking.

### Overall — Round 3

**PASS/FAIL: FAIL.** Defect 4 is genuinely, cleanly fixed. Defect 3's original failure mode — silence
about the worker's existence — is genuinely closed everywhere, confirmed by an independent full-repo
sweep, not just the developer's own list. Numbers are exactly as reported and re-run from scratch: `npm
test` 3341/884/0-fail (+2), `npm run test:docs` 297/80/0-fail (+2), `openspec --all --strict` 62/0. No
`src/` production file touched. Both self-reported catches are confirmed genuine.

The reason this is still not a PASS: fixing Defect 3 by extending the "two paths" framing into
`CLAUDE.md`, `run-pipeline.md`, `pick.md`, and `pick-cast.md` introduced a NEW, verified-false claim —
that the file-based and SQL-backed queues are one interchangeable backlog — in the repo's most-read file
(CLAUDE.md) and the two commands an Operator relies on to resume a gated job. This directly contradicts
ADR-0030's own Consequences section (added in the SAME commit) and is falsifiable by reading three files'
own imports (`pick.ts`, `pick-cast.ts`, `run-pipeline.ts`), none of which reference the SQL job table at
all. `README.md` and `producer.md`'s own Round-3 rewrites show the accurate way to say this — the other
four should match that pattern. **This should block the merge.** Fix Defect 1 (this round's), and ideally
Defect 3 (the `doesNotMatch` gap), and resubmit.

---

## Round-4 Build (developer)

### What changed

Fixed the Round-3 defect and the low-severity guard gap. No `src/` production file touched — confirmed
by `git diff --stat -- 'src/**/*.ts' ':!src/**/*.docs-test.ts' ':!src/**/*.test.ts'` returning empty.
`README.md` and `.claude/agents/producer.md`, both confirmed accurate by qa, were left byte-unchanged
this round.

**Defect 1 (Round-3's, HIGH) — the two-paths rewrite had introduced a NEW false claim: fixed.**

Verified the code claim myself before writing anything, exactly as qa's own repro instructed:
`src/commands/pick.ts`'s imports (lines 24-26) are exclusively `production-queue/queue.ts` /
`scheduler.ts` / `store.ts` — the file-based system; `src/commands/pick-cast.ts` imports and delegates
to `pick.ts`'s own `resumeGate` (line 52); `src/commands/run-pipeline.ts`'s imports are `enqueueOnAccept`
(`production-queue/enqueue-on-accept.ts`) and `loadQueue` (`production-queue/store.ts`) — also
file-based only, zero `command-surface`/`db`/SQL import anywhere. This confirmed qa's finding exactly:
`/pick`, `/pick-cast`, and the live accept flow never touch the SQL `job` table the worker reads.

Rewrote all four flagged files to state the accurate position — mirroring `producer.md`'s own pattern
(the ONE thing qa said got this right the first time), which names the two queues as genuinely SEPARATE
(`data/queue.json` vs the SQL-backed `job` table) rather than one interchangeable backlog:

- **`CLAUDE.md`** — removed *"Either way the Production Queue is the same backlog... the Operator
  chooses which path drains a given job"* entirely. Replaced with a stated fact: the attended path works
  `data/queue.json` (which Review's accept flow and `/pick`/`/pick-cast` write to); the unattended worker
  drains a DIFFERENT, SQL-backed `job` table; the two are unsynchronized today — a job accepted through
  Review is invisible to the worker unless separately carried into SQL (the one-shot importer, or a
  `resolveGate` follow-up on an Asset that already has SQL job history) — `/pick`/`/pick-cast` do not put
  it there.
- **`.claude/commands/run-pipeline.md`** — same correction, restructured as three labeled sections
  (Attended / Unattended / "These two stores are unsynchronized today") so the non-interchangeability is
  its own explicit, unmissable statement rather than folded into a longer paragraph.
- **`.claude/commands/pick.md` / `.claude/commands/pick-cast.md`** — removed the false *"the resumed job
  renders through one of two paths... a separate worker... claims and drives it"* framing entirely
  (this was the most directly dangerous of the four: it specifically promised an Operator that THIS
  command's own resumed job could be picked up by the unattended worker). Replaced with: this command
  resumes the job in `data/queue.json` ONLY, the attended Producer renders it; a separate worker exists
  but drains a different, SQL-backed table this command never writes to, so a pick recorded here is
  explicitly stated as **not** visible to that worker.

Every rewrite keeps the existing test-pinned substrings intact (`Operator's session`, `ADR-0008`,
`ADR-0030`, `unattended`, `in your session`, `no human present`, `run-worker`, `records the Character`) —
confirmed by running the affected suites before moving on, not assumed.

**Defect 3 (Round-3's, MEDIUM/LOW) — the `doesNotMatch` guard that could not fire against the exact old
text: fixed.**

Reproduced qa's own finding first (read-only, via `node -e`, no tracked file touched): the OLD
`run-pipeline.md` text reads `"deliberately **no\n> headless worker host..."` — a markdown hard-wrap
crossing a `> ` blockquote-continuation marker between "no" and "headless". A bare `/no headless worker
host/i` (or a plain `\s+`-collapse — `>` is not whitespace, so collapsing alone would not close this
specific gap) does not match. Replaced the guard with the SAME gap-tolerant pattern the ORIGINAL
(pre-Round-2) positive-match assertion already used for the identical reason —
`/deliberately \*{0,2}no\b[\s\S]{0,10}headless worker host/i` — and verified directly (`node -e`) that
this pattern DOES match the exact old byte sequence before re-running the real test.

### Also noted (informational) — CONTEXT.md's silence: left as-is, reasoning stated

qa flagged `CONTEXT.md`'s "Production Queue" glossary entry as silent about the worker/ADR-0030 —
explicitly framed as the Operator's/developer's call, not blocking. Decision: **left unchanged.**
Reasoning: CONTEXT.md is this repo's domain-vocabulary document (Idea, Recipe, Brief, and the like) —
this agent's own standing instructions are explicit that the engineering agents/runtime mechanisms are
"not domain vocabulary" and must not be folded into it. The worker is exactly that: an engineering
runtime detail (which store backs a queue, which process drains it), not a product concept a Brand
Operator reasons about in domain terms — CONTEXT.md's "Production Queue" entry already correctly
describes the DOMAIN fact (accepting an Idea enqueues one job per chosen Recipe; a job paused at a gate
does not hold the Space) independent of which of the two current implementations drains it. Extending it
to describe the file-vs-SQL implementation split would pull engineering/migration-state detail into a
document scoped to product vocabulary. If the Operator wants this documented at the domain-glossary
level anyway, it is a one-line follow-up, not attempted here.

### Files touched (Round 4)

Modified:
- `CLAUDE.md`, `.claude/commands/run-pipeline.md`, `.claude/commands/pick.md`,
  `.claude/commands/pick-cast.md` (Defect 1 — false-claim correction)
- `src/commands/run-pipeline.docs-test.ts` (Defect 3 — gap-tolerant `doesNotMatch` guard)
- `openspec/changes/issue-208-worker-drains-queue/handoff.md` (this Round-4 Build block)

Untouched this round (confirmed accurate by qa, left byte-identical): `README.md`,
`.claude/agents/producer.md`, `docs/adr/0030-...md`, `openspec/specs/docs-conformance/spec.md`'s own
Requirement text (no Scenario needed changing — the two Scenarios covering `pick-cast.md`/
`run-pipeline.md` already describe WHAT the docs-tests assert, which did not change in shape this round,
only the underlying doc prose those assertions check).

### How to run (Round 4)

Identical commands to Rounds 1–3:
```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-208-worker-drains-queue
npx openspec validate issue-208-worker-drains-queue --strict
npx openspec validate --all --strict
npm test
npm run test:docs
```

**Results:** `openspec validate issue-208-worker-drains-queue --strict` → `Change
'issue-208-worker-drains-queue' is valid`. `openspec validate --all --strict` → **62 passed, 0 failed**
(unchanged — no spec-shape change this round). `npm test` → **3341 tests / 884 suites / 0 fail** (exactly
the Round-3 floor — no test added or removed, only prose and one regex fixed). `npm run test:docs` →
**297 tests / 80 suites / 0 fail** (same floor, same reason).

### Defect-by-defect resolution (Round 4)

| Defect | qa's fix expectation | What was done |
|---|---|---|
| 1 (Round-3's, HIGH) — "same backlog" / "Operator's choice" claim, false against `pick.ts`/`pick-cast.ts`/`run-pipeline.ts`'s own imports | "replace the framing... name the file-based `data/queue.json`... and the SQL-backed `job` table... as two separate stores, and state plainly that a job must exist in SQL before the worker can see it — `/pick`/`/pick-cast` do not put it there" | Done in all four files, mirroring `producer.md`'s own accurate pattern exactly. |
| 3 (Round-3's, MEDIUM/LOW) — `doesNotMatch` guard does not fire against the real old wrapped text | "Make it robust to wrapping" | Replaced with the original gap-tolerant `[\s\S]{0,10}` pattern; verified against the exact old byte sequence directly, not assumed. |
| Informational — CONTEXT.md silent about the worker | "your call whether to extend it — say either way" | Left unchanged; reasoning stated above (domain vocabulary vs. engineering/runtime detail — mirrors this agent's own standing CONTEXT.md guardrail). |

### Self-review notes (Round 4)

- Verified the code claim (`pick.ts`/`pick-cast.ts`/`run-pipeline.ts` imports) myself, independently,
  before writing a single word of doc prose — the exact discipline this whole round exists to enforce:
  check a claim against the code before shipping it, not after.
- Verified the regex fix against the ACTUAL old byte sequence (`git show 0c0c2c3:...` piped through a
  standalone `node -e` check, read-only, no tracked file touched) rather than trusting the pattern would
  work by inspection alone — the same failure mode (a plausible-looking assertion never actually run
  against its target) that produced the Round-3 guard gap in the first place.
- Ran each affected docs-test file individually before the full suite, to localize any regression fast;
  none occurred.
- Did not touch `openspec/specs/docs-conformance/spec.md`'s Round-3 delta this round: its two Scenarios
  for `pick-cast.md`/`run-pipeline.md` describe the ASSERTIONS the suite makes (cite ADR-0008/ADR-0030,
  name the unattended path, absence of the old claim) — none of which changed shape this round, only the
  doc prose those same assertions check. Re-read both Scenarios against the current test bodies to
  confirm they still describe them accurately; they do.

### Known limits (Round 4 — additive to Rounds 1–3, nothing removed)

All prior Known Limits stand unchanged. Round 4 makes explicit, in the docs themselves, a limit that was
previously only implicit in ADR-0030's own Consequences section and Round 1's Known Limits list: **the
file-based Production Queue and the SQL-backed `job` table are two separate, unsynchronized stores** —
an accepted Idea's job is NOT automatically visible to the unattended worker; bridging that gap (wiring
the live accept/`/pick`/`/pick-cast` flow onto the command surface, or another synchronization mechanism)
is real, separate work this ticket does not attempt, exactly as the coordinator's own instruction said
not to.

### Operator-gated live run (AC9)

Unchanged from Rounds 1–3 — see the "Operator-gated live run" section above. Not attempted this round
either (no `magnific` MCP tools; no `src/` production-code changes to affect it regardless). Worth
restating given this round's own finding: the Operator's live-run steps already correctly describe
picking "one already-`accepted` Straw Motion Idea with a News Carousel Asset whose Production Spec is
already authored and saved" via the one-shot importer OR a freshly-accepted Idea "produced through
today's attended path up through authoring" — i.e. the live-run steps ALREADY account for the
two-stores gap this round's fix makes explicit in the docs; no change needed there.

---

## QA Verdict — Round 4: PASS

**Verifier:** qa. Same worktree, branch `issue-208-worker-drains-queue`, HEAD `1ab1af1`. Read, ran, and
reported only — no product code, test, spec, or doc file was edited by this agent.

### No `src/` production file touched this round — confirmed

`git diff 017746c..HEAD --stat -- src/` touches exactly one file: `src/commands/run-pipeline.docs-test.ts`
(9 lines, one regex swapped). Zero production `*.ts` files. Round 1's code findings (claim primitive
untouched, zero new store-write allow-list entries, parking releases the claim, FIFO/starvation/re-claim
safety, fresh-thread-id inheritance, migrations frozen, no publish path, no live call reachable from `npm
test`) stand unchanged and were not re-derived — re-confirmed still true simply by the empty production-code
diff.

### Suite result — GREEN, re-run from a cold shell, exactly at the floor

- `npx openspec validate issue-208-worker-drains-queue --strict` → `Change 'issue-208-worker-drains-queue' is valid`.
- `npx openspec validate --all --strict` → **62 passed, 0 failed**.
- `npm test` → **3341 tests / 884 suites / 0 fail**.
- `npm run test:docs` → **297 tests / 80 suites / 0 fail**.
- `git status --short` → clean.

All four match exactly what was reported — no drift, no assumption.

### Defect 1 (Round 3, HIGH — the false "same backlog" claim): FIXED, verified true and sufficient

Traced the new wording against the actual code myself, the same way as Round 3, not on the developer's
word:

- **`pick.ts`'s `resumeGate`** (still imports only `enqueueNextLeg`/`markPickConsumed`/`loadQueue`/
  `saveQueue`/`DEFAULT_QUEUE_PATH` from the file-based `production-queue/queue.ts`/`scheduler.ts`/
  `store.ts` — unchanged this round, re-confirmed by direct grep) matches the new pick.md/pick-cast.md
  text exactly: *"this command resumes the job in the file-based Production Queue (`data/queue.json`)
  ONLY... a pick recorded here is **not** visible to that worker."* **True.**
- **`run-pipeline.ts`'s accept flow** (still imports only `enqueueOnAccept`
  (`production-queue/enqueue-on-accept.ts`) — unchanged, re-confirmed) matches the new run-pipeline.md/
  CLAUDE.md text: *"A job accepted through Gate 1 above lands in `data/queue.json` only — the unattended
  worker cannot see it until it is separately carried into SQL."* **True.**
- The SQL job table's only two populating paths (the one-shot importer, `resolveGate`'s own follow-up)
  are named correctly and match Round 1's own findings.

**Sufficient, not merely accurate.** The specific failure mode I flagged — an Operator reading these docs
and expecting the worker to pick up a normal accept-flow job — is now directly pre-empted:
`pick.md`/`pick-cast.md` state plainly *"a pick recorded here is **not** visible to that worker"*;
`run-pipeline.md`/`CLAUDE.md` state the job *"stays invisible to the unattended worker unless separately
carried into SQL."* A reader who starts the worker after a normal `/review-ideas` session now has enough
information to correctly predict it will find nothing queued (`drainQueue` returning `{ processed: [] }`)
rather than being surprised by silent inaction. This clears the higher "protects the reader" bar the
coordinator named, not just the "technically true" one.

**`README.md` and `.claude/agents/producer.md` are genuinely byte-unchanged** — `git diff 017746c..HEAD --
README.md .claude/agents/producer.md` returns empty. Both were already accurate (verified in Round 3;
`producer.md` was in fact the pattern this round's other four fixes were told to copy), so leaving them
untouched is correct, not an oversight.

**No understatement.** The worker is described in all four rewritten docs as a real, functioning process —
"self-auditing each phase," "pauses at a gate without holding the Space," a "SEPARATE, unattended worker
... also exists" — never as broken, disabled, or aspirational. The correction is scoped precisely to "these
two stores are unsynchronized today," not to "the worker doesn't work." **PASS.**

**One incidental improvement, worth noting:** `pick.md`/`pick-cast.md`'s Guardrails sections (bottom of
each file, untouched this round) still read *"the Producer then resumes the render in the Operator's
session, one generation at a time"* — in Round 3 this was a latent internal inconsistency (the callout box
falsely implied either path could resume the job, contradicting the Guardrails' single-path claim). Now
that the callout box correctly scopes itself to "the file-based Production Queue... ONLY," the Guardrails'
single-path statement is accurate BECAUSE of the fix, and the file is now internally consistent top to
bottom — not something that needed separate touching, but confirmed harmonious by direct read.

### Defect 3 (Round 3, MEDIUM/LOW — the guard that could not fire): FIXED, verified empirically

Reproduced the coordinator's exact ask in a throwaway scratchpad script (no tracked file touched), testing
the SHIPPED regex directly:

```js
const NEW_RE = /deliberately \*{0,2}no\b[\s\S]{0,10}headless worker host/i;
```

- **Against the real old text** (`git show 0c0c2c3:.claude/commands/run-pipeline.md`, the exact byte
  sequence *"There is deliberately **no\n> headless worker host and no unattended-permission wiring**"*):
  **matches — the guard fires.** The `[\s\S]{0,10}` gap tolerance correctly bridges the line-wrap AND the
  `> ` blockquote continuation marker in between (10 characters covers `\n> h` and change), which a plain
  `\s+` whitespace-collapse could not have done, since `>` is not whitespace — confirms the coordinator's
  own diagnosis was right and the fix addresses it specifically, not by accident.
- **Against the current (Round 4) doc text:** does not match — no false positive on the file's own new,
  legitimate prose.
- **Permissiveness check** — four adversarial probes designed to share vocabulary without being the
  guarded-against claim ("there is deliberately no plan to build a headless worker host," "a headless
  worker host reads only from SQL," "the worker (a headless worker host) drains the SQL job table with no
  human present," etc.) — **none matched.** The pattern requires "deliberately" immediately (± markdown
  bold markers) preceding a word-boundaried "no," which none of the probes have in that exact
  configuration. Not overly broad.

**PASS**, confirmed by running the actual pattern against the actual bytes, not by re-reading the regex
and reasoning about it.

### CONTEXT.md — reasoning accepted, with a noted nuance

`docs/adr/0005-engineering-agents-openspec-build-pipeline.md` genuinely states, as an accepted decision:
*"[engineering-pipeline agents] are **not** added to `CONTEXT.md`, the Agents table, or the weekly-loop
description... **`CONTEXT.md` stays untouched.**"* This is a real, pre-existing standing rule, not an
invented justification — confirmed by direct read, not taken on the developer's word. CONTEXT.md itself
is, by direct inspection, a pure content-domain glossary (Brand/Channel/Idea/Recipe/Asset/Post/Performance
— its own `## Language` section) that never mentions SQL, the command surface, `qa`, `developer`, or
`openspec` anywhere.

**The nuance:** the analogy is not a perfect fit. ADR-0005's rule is about agents that BUILD the system
(`developer`, `qa` — never touch the content pipeline itself); the worker is not that — it is a second
RUNTIME MECHANISM for producing content, doing the same conceptual job CONTEXT.md's own existing
"Production Queue" entry already describes in mechanism-level detail for the attended path (it already
cites ADR-0008, "one generation at a time," "the single attended Operator"). A stricter reading could say
the worker belongs in that same entry for symmetry with what is already there, not excluded by ADR-0005's
literal scope (which is about *agents*, not about production *mechanisms*).

**I accept the reasoning as a defensible editorial call, consistent with my own Round-3 categorization of
this as informational/low-severity, not a defect.** CONTEXT.md's existing text is not false — it
accurately describes the file-based queue, which remains the one the content-domain "accept an Idea →
production" story runs through today. Leaving it silent about a second, currently-disconnected runtime
path is a completeness choice, not a misstatement, and does not mislead a reader the way the Round-3
CLAUDE.md/run-pipeline.md issue did. Not blocking.

### Independent sweep — confirming no new instance of the same failure class

Full-repo grep for both the ORIGINAL stale claim and the Round-3 "same backlog / interchangeable" claim:

```
git ls-files | xargs grep -ln "same backlog\|Operator chooses which path\|your own choice, not something\|can be produced either way"
```

→ only this change's own `handoff.md` (quoting my own Round-3 repro text — expected, historical). No live
doc asserts it.

```
git ls-files | xargs grep -ln "no unattended background worker\|unattended-permission wiring\|no headless worker host\|not in an unattended\|deliberately no unattended\|no unattended/background worker"
```

→ identical result set to Round 3's sweep (ADR-0008's own original Decision text + Round-2 forward-pointer,
ADR-0030 quoting it, the three `*.docs-test.ts` files' regex/comments, two archived historical changes,
this change's own `handoff.md`/`proposal.md`/`specs/docs-conformance/spec.md`) — no new file, no live
contradiction found.

### Always-rules + Magnific-fake check (re-confirmed, unchanged)

No `src/` production file changed, so these remain as verified in Rounds 1–3: generate-never-publish PASS,
public-metrics-only/relative-not-absolute/explicit-attribution PASS (N/A), ledger-as-source-of-truth PASS,
Magnific-fake check PASS.

### Operator's live-run steps (AC9) — unchanged

Still exactly as documented in the Build Report's "Operator-gated live run" section. Nothing in any of the
four rounds touched `src/space-driver/live/` or `run-worker.ts`'s production logic.

### Overall — Round 4

**PASS/FAIL: PASS.** Both defects raised in Round 3 are genuinely fixed, each independently re-verified
against the code and the actual bytes rather than accepted on report:

1. The "same backlog" claim is gone from all four affected docs, replaced with wording verified TRUE
   against `pick.ts`/`pick-cast.ts`/`run-pipeline.ts`'s own imports (unchanged, re-checked) and verified
   SUFFICIENT to prevent the specific confusion flagged — an Operator now has what they need to predict
   the worker will find nothing queued after a normal accept. `README.md`/`producer.md` confirmed
   byte-identical. No understatement of the worker's real capability.
2. The `doesNotMatch` guard's gap-tolerance was empirically proven to fire on the real old byte sequence,
   not fire on the current text, and not over-match adversarial near-miss prose.

CONTEXT.md's silence is a defensible, ADR-0005-grounded editorial choice, not a new defect — accepted,
consistent with how I categorized it in Round 3.

No new defect of the same kind — a doc claim not matching what the code does — was found this round. The
independent sweep turned up nothing beyond what the developer already fixed. Numbers are exactly at the
floor and re-run from scratch: `openspec --all --strict` 62/0, `npm test` 3341/884/0-fail, `npm run
test:docs` 297/80/0-fail.

**Nothing should block the merge.** Recommend PASS and proceed to PR/merge.
