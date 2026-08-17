## 1. Scope audit — before writing any code

- [x] 1.1 Read issue #208 + comments; confirm `ready-for-agent` label; confirm blockers #203/#205/#207
  all CLOSED/COMPLETED via `gh issue view --json state,stateReason`.
- [x] 1.2 Read `src/production-queue/job-store.ts` + `claim-concurrency.test.ts` end to end (issue #203) —
  the atomic claim primitive this ticket must use, unmodified in its claiming mechanics.
- [x] 1.3 Read `src/space-driver/driver.ts`'s `driveToNextGate` + `src/recipe/phase-contract.ts` +
  `src/recipe/registry.ts` end to end — the generic run-until-gate engine and the three phases
  (`author`/`bind-media`/`copy`) that already have a generic mechanical auditor.
  `src/producer/carousel-end-to-end.test.ts` and `two-recipes-end-to-end.test.ts` are the closest
  existing precedent for the exact sequence `runOneJob` composes (file-ledger-backed there; this ticket
  is the SQL-backed, worker-driven equivalent).
- [x] 1.4 Read `src/command-surface/**` end to end (issue #205) — confirm no production caller is wired
  onto it yet, and that `recordReviewDecision`/`scheduleViaOutbox` are the sanctioned "compose several
  store calls behind branching logic, inside the command surface" shape (issue #209's own Round-2
  precedent, cited by this ticket's own brief).
- [x] 1.5 Read `src/store-write-boundary/scan.ts` + `allow-list.ts` (issue #233) — confirm every store
  write `runOneJob` needs is already registered in `STORE_WRITE_FUNCTIONS`; confirm the plan needs zero
  new allow-list entries because every write happens inside `src/command-surface/`.
- [x] 1.6 Read `src/asset/store.ts`, `src/asset/download.ts`, `src/media-backup/checksum.ts`,
  `src/brand-asset/store.ts`, `src/channel/store.ts`, `src/copy/{draft,inject,validate}.ts`,
  `src/production-spec/brand-profile.ts`'s `BrandCopyRules` shape, `src/db/schema.ts`'s `job`/`asset`/
  `gate_request`/`copy_variant` tables, and `src/db/fixtures/seed-chain.ts` — the exact seams `runOneJob`
  composes for bind-media, copy, and save.
- [x] 1.7 Confirm CONTEXT.md/ADR-0002/0003/0004/0008/0010/0017 and the always-rules do not forbid an
  unattended worker — epic #195's own body ("Attended mode is not a product requirement") and issue
  #208's own text supersede ADR-0008's attended-only posture for a worker holding its own credentials;
  recorded as a known doc-lag in the Build Report (organicgrowth-rules.md rule 11 still describes the
  attended-only model and is not updated by this ticket — out of this ticket's scope, flagged for a
  follow-up doc ticket).

## 2. Four small, additive reads/widenings (test-first)

- [x] 2.1 Write failing tests, then implement `getAssetById(db, id)` in `src/asset/store.ts` — returns
  `null` for an unknown id, the full `DbAssetRecord` (incl. `spec`) for a known one.
- [x] 2.2 Write failing tests, then implement `findNextQueuedJob(db)` in
  `src/production-queue/job-store.ts` — the oldest `queued` job by `enqueued_at`, `null` when none;
  `running`/`awaiting_pick`/`done`/`failed` jobs are never returned.
- [x] 2.3 Write failing tests, then implement `listGateRequestsForAsset(db, assetId)` in
  `src/production-queue/gate-request-store.ts` — every gate request across every job for one Asset
  (joined through `job`), oldest first, `[]` for an Asset with none.
- [x] 2.4 Write failing tests, then widen `downloadAssetFiles`'s return shape in `src/asset/download.ts`
  to also carry `bytes: Uint8Array` and `contentType?: string` per downloaded file — confirm every
  EXISTING caller/test is unaffected (they destructure only `filename`/`path`).

## 3. Pure/read-only worker helpers under `src/worker/` (test-first) — import no store WRITE function

- [x] 3.1 Write failing tests, then implement `src/worker/plan-leg.ts`'s `planLeg(recipe, priorDecision)`
  — PURE: `priorDecision === null` -> `{ kind: "first", targetGate: recipe.gates[0] ?? null }`; a
  DECIDED prior decision -> `{ kind: "resumed", targetGate: null, pick: priorDecision.choice }`. Covers a
  zero-gate Recipe, a one-gate Recipe's first leg, and its resumed leg.
- [x] 3.2 Write failing tests, then implement `src/worker/media-kind.ts`'s
  `mediaKindFromContentType(contentType)` (defaults to `"image"` for an unrecognized/absent
  content-type) and `extensionForContentType(contentType)` (defaults to `.bin`) — PURE.
- [x] 3.3 Write failing tests, then implement `src/worker/resolve-media-slots.ts`'s
  `resolveMediaSlotResolutions(db, brandId, recipe, pick)` — a brand-asset slot resolves via
  `brand-asset/store.ts`'s `getBrandAssetByKey` (a READ); an idea-pick slot resolves from `pick` when
  supplied, else unresolved. Against a real, throwaway SQLite file (`withTempDb`).

## 4. Two new command-surface modules (test-first)

- [x] 4.1 Write failing tests, then implement `src/command-surface/gates.ts`'s
  `raiseGateRequest(db, input, now)` (wraps `createGateRequest`) and
  `resolveGate(db, gateRequestId, decision, now)` — composes `recordGateDecision` +
  `getGateRequest`/`getJob` (reads) + `createJob` (a NEW job for the SAME asset, `gate` omitted) —
  mirrors `ideas.ts`'s `recordReviewDecision` shape. Throws `GateRequestNotFoundError` for an unknown
  `gateRequestId`, before any write.
- [x] 4.2 Write failing tests, then implement `src/command-surface/copy.ts`'s
  `saveCopyVariant(db, input, now)` (thin wrap of `upsertCopyVariant`).
- [x] 4.3 Re-export both modules from `src/command-surface/index.ts`.

## 5. `runOneJob` — the job orchestration (test-first, against the fakes)

- [x] 5.1 Write a failing test: claiming an already-claimed (live-leased) job returns
  `{ status: "not-claimed" }`, no side effect — proves AC1 (claiming through the atomic primitive) without
  duplicating `claim-concurrency.test.ts`'s own cross-process proof.
- [x] 5.2 Write a failing test: a News Carousel job whose Asset's Production Spec fails
  `auditAuthorPhase` (a banned word) is released `failed` (retried while `attempt < maxAttempts`, then
  terminal) — and the fake Space records ZERO edit/run calls (mirrors
  `carousel-end-to-end.test.ts`'s "STOP before any Space call" pattern) — proves AC3's "a broken shape or
  banned word stops the job rather than reaching an Asset".
- [x] 5.3 Write a failing test: a News Carousel job whose Brand has no `brand-logo` Brand Asset committed
  fails the `bind-media` phase before any Space call.
- [x] 5.4 Write a failing test (the AC2 happy path): a News Carousel job — real, valid, authored Spec;
  a committed `brand-logo` Brand Asset; a healthy `FakeCarouselSpace`; an injected fake `fetch` — reaches
  `job.status === "done"`, `asset.status === "produced"`, one `asset_media` row, one `copy_variant` row
  (against the Brand's primary Channel) — proves `queued -> running -> done`, no human present.
- [x] 5.5 Write a failing test (AC4): a Character Explainer job (one gate, `"cast"`) against a healthy
  `FakeSpace` parks: `job.status === "awaiting_pick"`, a `gate_request` row exists carrying the offered
  candidates, undecided.
- [x] 5.6 Write a failing test (AC6): calling `resolveGate` on that parked job's gate request enqueues a
  NEW `queued` job for the SAME asset; running THAT job (fresh `FakeSpace`) drives a RESUMED leg (pins the
  chosen Character — asserted via the fake's recorded edit goals) and reaches `done`.
- [x] 5.7 Write a failing test (AC7): a `FakeCarouselSpace({ injectNoOp: true })` fails the drive step
  deterministically every attempt; with `maxAttempts: 2` the job is requeued once (`attempt` reaches 2)
  then reaches a TERMINAL `failed` state — never requeued a third time.
- [x] 5.8 Implement `src/command-surface/worker.ts`'s `runOneJob` to make 5.1-5.7 pass. Explicitly
  refuses (a normal, retryable failure) a Space-less Recipe job (`recipe.space === undefined`) — News
  Short Script stays out of this ticket's scope.

## 6. `drainQueue` — the outer loop (test-first, against the fakes)

- [x] 6.1 Write a failing test (AC5, the parked-job-does-not-block case): enqueue a gated
  Character-Explainer job FIRST (earlier `enqueued_at`) and a gateless News-Carousel job SECOND, both
  `queued`; `drainQueue` over both fakes; assert the FIRST job ends `awaiting_pick` and the SECOND ends
  `done` — the parked job never held the Space.
- [x] 6.2 Write a failing test: `drainQueue` stops (returns) once nothing is `queued` — an
  `awaiting_pick`/`done`/terminal-`failed` job is never re-selected.
- [x] 6.3 Implement `src/commands/run-worker.ts`'s `drainQueue(db, port, options)` to make 6.1-6.2 pass:
  loop `findNextQueuedJob` -> `runOneJob` until `null`, bounded by an injectable `maxIterations` safety
  valve.

## 7. OpenSpec + full-suite green + self-review + Build Report

- [x] 7.1 Author spec deltas: `worker` (ADDED, new capability), `command-surface` (ADDED Requirement —
  the existing "exactly three companions" Requirement from issue #205 untouched), `job-claim-store`
  (ADDED Requirement), `asset-store` (ADDED Requirement). Run `openspec validate --strict` until green.
- [x] 7.2 Run `npx tsc -p tsconfig.json --noEmit` (or the repo's configured type-check script) and
  `npm test` — all green, at/above the 3303/862/0-fail baseline recorded at branch cut.
- [x] 7.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #208
  acceptance criterion maps to a specific test (table in the Build Report).
- [x] 7.4 Write the Build Report into `handoff.md`, explicitly flagging: the Magnific fake used in every
  test (no live Space touched), the Operator-gated live-run steps (exact commands, pass/fail signs), and
  every known limit (Space-less Recipes, single-representative-creation download, single-Channel Copy,
  single-gate `planLeg`, organicgrowth-rules.md rule 11's doc lag).
