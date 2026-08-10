## 1. The Zoho Schedule port + fake (test-first, hermetic)

- [x] 1.1 Write failing tests (`schedule-batch/fixtures/fake-zoho-schedule-port.test.ts`): records every
  call in order; `uploadMediaFromUrl` returns a fresh mediaId per call; `validatePost` defaults to
  always-ok and honors an injected override; `createSchedule` defaults to an incrementing `fake-ref-N`
  reference and honors an injected override.
- [x] 1.2 Implement `ZohoSchedulePort`/`ZohoPostRequest`/`ZohoScheduleTarget`/`ZohoValidateResult`/
  `ZohoCreateScheduleResult`/`ZohoUploadedMedia` (`schedule-batch/mcp-schedule-port.ts`) — `ZohoPostRequest`
  carries NO `isApprovalNeeded` field. Implement `FakeZohoSchedulePort`
  (`schedule-batch/fixtures/fake-zoho-schedule-port.ts`).

## 2. runMcpSchedule — the orchestration deep module (test-first)

- [x] 2.1 Write failing tests (`schedule-batch/mcp-schedule.test.ts`):
  - AC1: `approved: false` makes ZERO port calls, returns a clear refusal.
  - AC2: every slide is uploaded ONCE per Asset, before any validate/schedule call; every validate/
    schedule request carries the uploaded mediaIds in order; a failing `validatePost` is never followed
    by `createSchedule` for that SAME Channel; one Asset's failed Channel never blocks that SAME Asset's
    other Channels or a sibling Asset.
  - A fully-scheduled Asset's outcome carries every scheduled platform and its combined reference +
    `scheduledAt`; an Asset with no MCP-eligible Channels at all is silently skipped (no upload, no
    failure); a Channel with no composed Copy variant is recorded as a failure, never crashes.
  - AC3: no recorded request ever carries an `isApprovalNeeded` (or similarly-named) field.
  - `x` is defensively excluded even if a group somehow still carried it.
  - `combineZohoScheduleReferences`: a bare string when exactly one reference; flattens multiple string
    references, in order; flattens an array-shaped reference's own entries in too.
  - AC4: `mcpUnavailableFallbackMessage` names the CSV/S3 export command, states the whole remaining step
    is the Operator's own by hand, and states X always uses the CSV/manual path.
- [x] 2.2 Implement `runMcpSchedule`, `combineZohoScheduleReferences`, `mcpUnavailableFallbackMessage`
  (`schedule-batch/mcp-schedule.ts`).

## 3. DRY: share `describeSkippedAssets` between the CSV and MCP orchestration shells

- [x] 3.1 Export `describeSkippedAssets` from `schedule-batch/eligibility.ts`; update
  `commands/export-schedule.ts` to import it instead of its own private copy. Confirm
  `commands/export-schedule.test.ts` stays green, unmodified (behavior-preserving refactor).

## 4. scheduleViaZohoMcpCommand — the attended orchestration shell (test-first)

- [x] 4.1 Write failing tests (`commands/schedule-via-zoho-mcp.test.ts`), mirroring
  `commands/export-schedule.test.ts`'s own fixture style:
  - AC1: `approved: false` refuses immediately — zero port calls, zero Media Host calls, ledger
    untouched.
  - AC4: no `port` injected -> the fallback message, before ANY ledger read or Media Host call (even
    with `approved: true`).
  - Happy path: schedules every eligible Asset's non-X Channels, hosts media once (7 slides), never
    calls the Zoho port for `x`, uploads happen before validate/schedule, and the ledger's
    `scheduled_at` + `zoho_schedule_reference` are stamped with `status` unchanged (`"produced"`).
  - A Brand with no Zoho config refuses clearly, zero Media Host/port calls.
  - An empty run reports nothing eligible, zero port calls.
  - A preflight problem (missing Copy variant, reusing `validateAssetsForExport`) refuses the whole run,
    zero port/Media Host calls, `scheduled_at` stays unset.
  - A schedule time inside the 1-hour lead window refuses, zero port calls.
  - A re-run against an already-`scheduled_at` Asset finds nothing eligible — never double-schedules.
- [x] 4.2 Implement `scheduleViaZohoMcpCommand` (`commands/schedule-via-zoho-mcp.ts`): reuses
  `selectEligibleAssets`, `loadZohoConfig`, `buildMcpSchedulePlan` (#160), `validateAssetsForExport`
  (defense in depth), hosts media via the injected `MediaHostPort`, drives `runMcpSchedule`, and writes
  each successfully-scheduled Asset's `scheduled_at`/`zoho_schedule_reference` via `AssetStore.writeAsset`.

## 5. Docs: producer.md, export-schedule.md, CONTEXT.md, the server-setup note (issue #163 AC5/AC6)

- [x] 5.1 Rewrite `.claude/agents/producer.md`'s "Schedule Batch offer" section: MCP-primary sequence
  (real tool names, upload -> validate -> schedule order), explicit Approval-workflow prohibition, the
  explicit CSV/S3 fallback offer, X always CSV/manual, a matching Guardrails bullet, and a light,
  additive Hard-boundary edit. Grant the 10 MCP tools the sequence calls in the `tools:` frontmatter;
  deliberately withhold `ZohoSocial_publishSocialPost`/`ZohoSocial_updateSocialPostApprovalStatus`.
  Verify EVERY pre-existing assertion in `schedule-batch/approval-gate.docs-test.ts` (issue #148) still
  passes, unmodified.
- [x] 5.2 Rewrite `.claude/commands/export-schedule.md` to describe itself as the CSV/S3 fallback path
  (ADR-0020), naming `schedule-via-zoho-mcp.ts` as primary. Verify the pre-existing
  `approval-gate.docs-test.ts` assertions for this file still pass.
- [x] 5.3 Rewrite `CONTEXT.md`'s **Schedule Batch** glossary entry to describe both mechanisms. Verify
  the pre-existing `CONTEXT.md`-pinned assertions in `approval-gate.docs-test.ts` still pass.
- [x] 5.4 Add `docs/zoho-mcp-server-setup.md` (local scope only; the new-tool re-login gotcha and the
  misleading `401 INVALID_OAUTHSCOPE`; the granted vs. deliberately-withheld tool list).
- [x] 5.5 Write `src/schedule-batch/mcp-schedule.docs-test.ts` pinning this slice's own new prose (tool
  names/order, Approval-workflow prohibition, fallback statements, the setup doc's key facts).
- [x] 5.6 `npm run test:docs` green — both the pre-existing suite (unmodified) and the new file.

## 6. OpenSpec

- [x] 6.1 Author `proposal.md`, this `tasks.md`, the MODIFIED `schedule-batch-approval-gate` delta, the
  ADDED `schedule-batch-export` delta (fallback-only framing), and the ADDED `schedule-batch-mcp-scheduling`
  capability.
- [x] 6.2 `npx openspec validate issue-163-producer-zoho-mcp-scheduling --strict` green.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite); `npm run test:docs` green.
- [x] 7.2 Simplify / dead-code pass; confirm every issue #163 acceptance criterion maps to a named test
  (AC7 explicitly deferred to an attended demo — recorded in `handoff.md`); confirm no live
  `spaces_*`/`creations_*`/Zoho-MCP call anywhere in the new test suite.
- [x] 7.3 Write the Build Report into `handoff.md`.
