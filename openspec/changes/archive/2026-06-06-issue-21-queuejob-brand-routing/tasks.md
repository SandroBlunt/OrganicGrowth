## 1. Spec delta (before any code)

- [x] 1.1 Write the spec delta under `openspec/changes/issue-21-queuejob-brand-routing/specs/` —
  MODIFIED requirements for `production-queue` (brand on job shape, parseJob brand validation,
  auto-enqueue brand stamp, worker brand routing, gate-across-brands) and for `brand-commands`
  (`/queue` brand label + filter).
- [x] 1.2 Run `npx openspec validate issue-21-queuejob-brand-routing --strict` and make it green.

## 2. `QueueJob` type + `enqueue` / `enqueueRender` (test-first, pure)

- [x] 2.1 Write failing tests (`queue.test.ts`): `enqueue` stamps the brand on the new job;
  `enqueueRender` stamps the brand; round-trip the brand through the job shape. Confirm pure
  (input not mutated).
- [x] 2.2 Add `readonly brand: string` to `QueueJob` in `queue.ts`; add `brand` parameter to
  `enqueue` and `enqueueRender`. Update the documented job-shape comment. Tests must now pass.

## 3. `parseJob` brand validation + defensive drop (test-first)

- [x] 3.1 Write failing tests (`store.test.ts`): `parseJob` (via `parseQueueState`) round-trips the
  brand field; drops a job with a missing brand; drops a job with an empty-string brand; logs a
  warning on drop. Confirm well-formed jobs are not affected.
- [x] 3.2 Update `parseJob` in `store.ts` to validate the `brand` field (non-empty string) and
  return `null` with a `console.warn` on failure. Tests must now pass.

## 4. Auto-enqueue-on-accept — brand parameter (test-first)

- [x] 4.1 Write failing tests (`enqueue-on-accept.test.ts`): `planEnqueue` receives a brand and the
  enqueued job carries that brand. An accepted Idea enqueued for Brand `"alpha"` shows `brand:
  "alpha"` on the job. Existing policy tests (not-accepted, already-queued) remain green.
- [x] 4.2 Add `brand` parameter to `planEnqueue` and `enqueueOnAccept` in
  `enqueue-on-accept.ts`; thread it through to `enqueue`. Tests must now pass.

## 5. Worker — brand-routed ledger writes (test-first)

- [x] 5.1 Write failing tests (`worker.test.ts`):
  - `WorkerDeps` now carries `resolveLedger(brand: string): LedgerWrites`; tests supply an
    in-memory brand-aware factory.
  - A reap of a cast job for Brand A writes to Brand A's ledger, not Brand B's.
  - A reap of a render job for Brand B writes to Brand B's ledger, not Brand A's.
  - Gate-across-brands: two Brands' cast jobs in the global queue — the first reaches
    `awaiting_cast` (releasing the lock), and the second Brand's cast-gen proceeds unattended
    (ADR-0004 preserved across Brands).
  - Defensive: a job with an unresolvable brand (resolveLedger throws) is treated as a failure
    (job marked failed, Operator notified), and the drain continues with the next job.
- [x] 5.2 Update `WorkerDeps` in `worker.ts`: replace the single `ledger: LedgerWrites` with
  `resolveLedger: (brand: string) => LedgerWrites`. In `reap*` helpers, call
  `deps.resolveLedger(job.brand)` to get the brand-scoped ledger writers. Add defensive handling
  for an unresolvable brand (catch + notify + continue). Tests must now pass.

## 6. `/pick-cast` — brand-stamped render job (test-first)

- [x] 6.1 Write failing test (`pick-cast.test.ts`): after a successful pick, the enqueued render
  job carries the correct brand (matches the `brand` arg passed to `pickCastCommand`).
- [x] 6.2 Update `pickCastCommand` to pass `brand` to `enqueueRender`. Tests must now pass.

## 7. `/queue` renderer — brand label + filter (test-first)

- [x] 7.1 Write failing tests (`render.test.ts`): each job line includes its brand; `brandFilter`
  shows only that Brand's jobs; no filter shows all jobs; empty-queue message is unchanged.
- [x] 7.2 Update `renderQueue` in `render.ts` to include brand in each job line and accept an
  optional `brandFilter`. Update `src/commands/queue.ts` to pass the `<brand>` arg as the filter
  (or show all when absent/`--all`). Tests must now pass.

## 8. Self-review

- [x] 8.1 `npx openspec validate issue-21-queuejob-brand-routing --strict` green.
- [x] 8.2 `npm test` green (all new + existing tests); `npm run build` exit 0.
- [x] 8.3 Simplify / dead-code pass: confirm every acceptance criterion maps to a named test.
- [x] 8.4 Write the Build Report into `handoff.md`.
