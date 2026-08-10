## Why

ADR-0020 (accepted 2026-08-10) makes Zoho's MCP tools the primary way a Run's produced News Carousel
Assets get scheduled, with the existing CSV/S3 export (`schedule-batch-export`) retained only as a
fallback. Before any code calls a live Zoho MCP tool, OrganicGrowth needs the same kind of pure decision
layer the CSV path already has: given a run's eligible Assets and the Brand's Zoho Social Brand
configuration, decide WHICH Channels each Asset schedules to over the MCP path (grouped the way Zoho
Social Brands group their Channels) and AT WHICH time — reusing, never forking, the brand-clock slot
rules and 1-hour lead-time guard the CSV export already derives (`src/schedule-batch/schedule.ts`).

This slice builds exactly that decision layer — no MCP tool calls, no live Zoho, no orchestration shell.
Issue #161 (the ledger's schedule-time reference field), #162 (the confirmed-live auto-log), and #163
(the actual attended MCP-calling Producer flow) are separate, later slices; #163 is explicitly blocked on
this one.

## What Changes

- **Add `src/schedule-batch/mcp-plan.ts`** — a new pure deep module, `buildMcpSchedulePlan`, that takes
  a run's already-selected eligible Assets (`selectEligibleAssets`'s `eligible` list — i.e. News Carousel
  Assets that are `produced` and not yet posted or scheduled), a Brand's `ZohoConfigLookup`
  (`loadZohoConfig`'s return), a start date, and an explicit `nowMs`, and returns either:
  - `{ ok: true, assets }` — one `McpAssetSchedule` per eligible Asset, each naming its target Channel
    groups (one per Zoho Social Brand that has at least one MCP-eligible Channel, X already excluded)
    and the absolute UTC instant + each group's own zoned local rendering it schedules at, or
  - `{ ok: false, reason, message }` — a clearly-worded refusal for an empty run, a Brand with no usable
    Zoho configuration, or a schedule slot inside the 1-hour lead window. Never a throw.
- **Add `src/schedule-batch/order.ts`** — extracts the existing Idea-number scheduling order
  (`ideaSortKey`/`sortEligible`, today private to `src/commands/export-schedule.ts`) into its own pure,
  independently-tested module, so both the CSV export and the new MCP plan share the exact same
  deterministic ordering instead of a second copy drifting out of sync. `export-schedule.ts` is updated
  to import `sortEligible` from here instead of defining it locally — a behavior-preserving refactor
  (its own existing tests are unchanged and stay green).
- **Reuses without modification:** `src/schedule-batch/eligibility.ts` (`selectEligibleAssets`,
  `SUPPORTED_RECIPE`), `src/schedule-batch/schedule.ts` (`deriveScheduleSlots`, `validateSlotsFuture`),
  `src/schedule-batch/timezone.ts` (`formatZohoScheduleTime`), and
  `src/production-spec/brand-profile.ts` (`ZohoConfigLookup`/`ZohoSocialBrand`/`ZohoChannelMapping`,
  `loadZohoConfig`). `src/schedule-batch/plan.ts`'s private `X_PLATFORM` constant is exported so both the
  CSV path's 4-slide cap and this slice's routing exclusion read the same literal.
- Routing rule (from ADR-0020, hardcoded, never a Brand setting): `facebook`, `instagram`, `tiktok`,
  `linkedin` route to the MCP path; `x` never does, regardless of how a Brand's Zoho config lists it.
  Scoped to the `news-carousel` Recipe only (mirrors `SUPPORTED_RECIPE`) — the Character Explainer
  Recipe's possible future ride on this path is out of scope here, matching the ADR's own deferral.

## Non-Goals (explicitly deferred)

- **Calling any live Zoho MCP tool, or any live Magnific call.** This slice is pure decision logic only;
  hermetic, no network, no credits, no board mutation.
- **The ledger's schedule-time reference field** (issue #161) and **the confirmed-live auto-log**
  (issue #162) — this slice's output is plain in-memory data, not yet written anywhere.
- **The attended orchestration shell that drives the MCP path** (issue #163, blocked on this slice,
  #161, and #162) — no new command, no `.claude/commands/*.md`, no producer-agent doc changes here.
- **The Character Explainer Recipe riding this path** — explicitly out of scope per the ADR; this
  slice's plan only ever considers `news-carousel` Assets (via `selectEligibleAssets`'s existing scope).

## Capabilities

### Added Capabilities

- `schedule-batch-mcp-plan`: the pure MCP-first routing decision layer (`buildMcpSchedulePlan`) and the
  shared Idea-order module (`order.ts`) it (and the CSV export) both use.

## Impact

- **New code:** `src/schedule-batch/mcp-plan.ts` (+ `.test.ts`), `src/schedule-batch/order.ts`
  (+ `.test.ts`).
- **Modified code:** `src/commands/export-schedule.ts` (imports `sortEligible` from the new `order.ts`
  instead of defining it locally — no behavior change, its own test suite is unchanged), `src/schedule-
  batch/plan.ts` (exports its existing `X_PLATFORM` constant instead of keeping it module-private).
- **Not touched:** `src/asset/**`, `src/production-spec/**` (read-only, already merged), `src/media-
  host/**`, `data/**`, `.claude/commands/**`, `.claude/agents/**`.
- **Hermetic:** no live `spaces_*`/`creations_*` calls, no live Zoho MCP call, no network anywhere in the
  new test suite — every test constructs plain in-memory fixtures (`EligibleAsset[]`,
  `ZohoConfigLookup`), mirroring `src/schedule-batch/plan.test.ts`'s own style.
- **Always-rules upheld:** generate-never-publish (this module decides a plan; it never posts, never
  calls a Zoho write tool — that is issue #163's job, gated on the Operator's in-conversation approval
  per ADR-0020); public-metrics-only (N/A — no metrics here); relative-not-absolute (N/A — no scoring
  here); explicit-attribution (each `McpAssetSchedule` is keyed to its own `(ideaId, recipe)`, never
  inferred); ledger-as-source-of-truth (N/A — this slice writes nothing to any ledger; that lands in
  #161/#163).
