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
