## 1. Shared Idea-order module (test-first, pure, extracted, behavior-preserving)

- [x] 1.1 Write failing tests (`schedule-batch/order.test.ts`): `ideaSortKey` parses the `idea-NN` suffix
  via `briefShortName`; an unparseable id sorts to the end (`Number.MAX_SAFE_INTEGER`) rather than
  crashing; `sortEligible` sorts a list of `EligibleAsset`s into ascending idea-number order, is stable
  for equal/unparseable keys, never mutates its input array, and is pure (same input -> same output).
- [x] 1.2 Implement `ideaSortKey`/`sortEligible` (`schedule-batch/order.ts`), moved verbatim in behavior
  from `commands/export-schedule.ts`.
- [x] 1.3 Update `commands/export-schedule.ts` to import `sortEligible` from `./order.ts` instead of
  defining it locally; remove the now-dead local `ideaSortKey`/`sortEligible`. Confirm
  `commands/export-schedule.test.ts` stays green, unmodified (behavior-preserving refactor).

## 2. Export the shared X-platform constant (no behavior change)

- [x] 2.1 Export `X_PLATFORM` from `schedule-batch/plan.ts` (was module-private); confirm
  `schedule-batch/plan.test.ts` stays green, unmodified.

## 3. MCP schedule plan — the pure decision layer (test-first)

- [x] 3.1 Write failing tests (`schedule-batch/mcp-plan.test.ts`) against in-memory fixtures (no disk, no
  ledger, mirroring `schedule-batch/plan.test.ts`'s own style):
  - a Brand configured with MCP-eligible Channels: the plan names each eligible Asset's target Channel
    groups (one per Zoho Social Brand with at least one non-X Channel) and its scheduled time, matching
    exactly what `deriveScheduleSlots` + `sortEligible` + `formatZohoScheduleTime` would derive for the
    same inputs (an explicit parity assertion against those modules called directly);
  - a Zoho Social Brand grouping that is X-only contributes NO group to the plan (X is dropped, never
    silently included, and an empty-channel group is never fabricated);
  - X is excluded from a MIXED group (e.g. `linkedin` + `x` under one Zoho Social Brand) — that group's
    `channels` never contains `x`, regardless of how the Brand's config lists it;
  - an eligible entry whose `asset.recipe` is not `"news-carousel"` (e.g. a Character Explainer Asset
    that somehow reached this module) is defensively excluded from the plan, never scheduled;
  - an empty `eligible` list returns `{ ok: false, reason: "empty-run" }` with a clear message, never a
    throw;
  - a Brand with no Zoho configuration (`ZohoConfigLookup.configured === false`, both the
    `"not_configured"` and `"malformed"` shapes) returns `{ ok: false, reason: "zoho-not-configured" }`
    carrying that lookup's own message, never a throw;
  - a schedule slot inside the 1-hour lead window returns `{ ok: false, reason: "lead-window" }` naming
    every violating Asset, never a throw, and never partially returns a plan;
  - `nowMs` is always the caller's explicit argument — never a `Date.now()` read internally (proven by
    calling `buildMcpSchedulePlan` twice with the same fixed `nowMs` and asserting deep-equal output);
  - calling it twice with the same inputs returns deep-equal output (pure).
- [x] 3.2 Implement `buildMcpSchedulePlan` and its types (`schedule-batch/mcp-plan.ts`), reusing
  `eligibility.ts`/`order.ts`/`schedule.ts`/`timezone.ts`/`plan.ts`'s `X_PLATFORM` — never re-implementing
  slot derivation, the lead-time guard, or the Idea-ordering logic a second time.

## 4. OpenSpec

- [x] 4.1 Author `proposal.md`, this `tasks.md`, and the ADDED `schedule-batch-mcp-plan` spec delta.
- [x] 4.2 `npx openspec validate issue-160-mcp-schedule-plan --strict` green.

## 5. Self-review

- [x] 5.1 `npm test` green (type-check + full suite); `npm run build` green.
- [x] 5.2 Simplify / dead-code pass; confirm every issue #160 acceptance criterion maps to a named test;
  confirm no live `spaces_*`/`creations_*`/Zoho-MCP call anywhere in the new test suite (there are no
  such imports at all in this slice).
- [x] 5.3 Write the Build Report into `handoff.md`.
