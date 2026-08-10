# Slice Handoff — issue #160: MCP-first Schedule Batch plan (pure decision layer)

## Build Report (developer, round 1)

### What changed

Built the pure decision layer ADR-0020 needs before any code calls a live Zoho MCP tool: given a run's
already-selected eligible News Carousel Assets, a Brand's Zoho Social Brand configuration, and a start
date, `buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`) decides which Channels each Asset
schedules to over the MCP path — grouped exactly the way the Brand's Zoho Social Brands group their
Channels — and at what time, permanently excluding `x` (Twitter) regardless of Brand configuration.

To avoid a second, independently-drifting copy of the CSV export's own deterministic Idea-number
scheduling order, the existing `ideaSortKey`/`sortEligible` (previously private to
`src/commands/export-schedule.ts`) were extracted, unchanged in behavior, into a new shared module
`src/schedule-batch/order.ts`. `export-schedule.ts` now imports `sortEligible` from there instead of
defining it locally — a behavior-preserving refactor; its own existing test suite (10 tests) is
unmodified and stays green. `src/schedule-batch/plan.ts`'s previously-private `X_PLATFORM` constant is
now exported so the new module reads the exact same `"x"` literal the CSV export's own 4-slide cap
already uses, instead of a second hardcoded string.

No new command, no orchestration shell, no live Zoho/Magnific call, no ledger write — this slice is
strictly the decision layer. The ledger's schedule-time reference field (#161), the confirmed-live
auto-log (#162), and the attended MCP-calling Producer flow (#163) are separate, later slices; #163 is
explicitly blocked on this one.

### Files touched

**New:**
- `src/schedule-batch/mcp-plan.ts` — `buildMcpSchedulePlan` and its types (`McpTargetGroup`,
  `McpAssetSchedule`, `McpSchedulePlanResult`, `BuildMcpSchedulePlanInput`).
- `src/schedule-batch/mcp-plan.test.ts` — 12 tests.
- `src/schedule-batch/order.ts` — `ideaSortKey`/`sortEligible`, extracted from `export-schedule.ts`.
- `src/schedule-batch/order.test.ts` — 7 tests.
- `openspec/changes/issue-160-mcp-schedule-plan/` — `proposal.md`, `tasks.md`,
  `specs/schedule-batch-mcp-plan/spec.md` (ADDED capability), this `handoff.md`.

**Modified:**
- `src/commands/export-schedule.ts` — imports `sortEligible` from `./order.ts` instead of a local
  definition; removed the now-dead local `ideaSortKey`/`sortEligible` functions; added a one-paragraph
  doc note pointing at the shared module. No behavior change.
- `src/schedule-batch/plan.ts` — `X_PLATFORM` changed from a module-private `const` to an exported
  `const`, with an added doc note explaining why. No behavior change.

### How to run

```bash
# Type-check + full suite
npm test

# Just this slice's new tests
node --import tsx --test src/schedule-batch/mcp-plan.test.ts src/schedule-batch/order.test.ts

# Confirm the refactored CSV export is unaffected
node --import tsx --test src/commands/export-schedule.test.ts src/schedule-batch/plan.test.ts

# Build
npm run build

# Docs-conformance (untouched by this slice, confirmed still green)
npm run test:docs

# OpenSpec
npx openspec validate issue-160-mcp-schedule-plan --strict
npx openspec validate --all --strict
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | For a Brand configured with MCP-eligible Channels, the plan names each eligible Asset's target Channels (grouped per Zoho Social Brand) and its scheduled time, matching the slot rules the CSV export uses today. | `mcp-plan.test.ts`: `"names each eligible Asset's target Channel groups (per Zoho Social Brand) and its scheduled time"` (asserts groups, channels, and `scheduledAtLocal`/`scheduledAtUtc` against `formatZohoScheduleTime`/`deriveScheduleSlots` called directly) and `"derives the SAME slot, in the SAME idea order, that deriveScheduleSlots + sortEligible produce directly"` (explicit parity assertion against the CSV export's own modules). |
| 2 | X is never routed to the MCP path, regardless of Brand configuration. | `mcp-plan.test.ts`: `"never surfaces x in a mixed group's channels, regardless of Brand configuration"` and `"an X-only Zoho Social Brand grouping contributes no group at all"`. |
| 3 | Empty run / no Zoho configuration / slot inside the lead window → a clearly-worded returned refusal, never a throw. | `mcp-plan.test.ts`: `"refuses an empty run clearly, never throwing"`, `"refuses an effectively-empty run (only non-news-carousel entries) as empty-run too"`, `"refuses a Brand with no usable Zoho configuration (not_configured), carrying that message verbatim"`, `"refuses a Brand with a malformed Zoho configuration, carrying that message verbatim"`, `"refuses a slot inside the 1-hour lead window, naming the violating Idea, never throwing"`. Every case asserts `result.ok === false` plus a specific `reason`/`message` — none of these paths calls `throw` (confirmed by reading `mcp-plan.ts`: the only `throw`-free contract holds because every non-`ok:true` branch returns a value). |
| 4 | Pure and fully covered by tests; no live calls anywhere. | `mcp-plan.test.ts`: `"never reads the system clock — nowMs is always the caller's explicit argument"` and `"is pure — calling it twice with the same inputs returns deep-equal output"`. Structurally: `mcp-plan.ts` imports only other pure deep modules (`eligibility.ts`, `schedule.ts`, `timezone.ts`, `order.ts`, `plan.ts`'s `X_PLATFORM`) and type-only imports from `brand-profile.ts` — no `node:fs`, no `node:http`/`fetch`, no MCP client of any kind, in either the module or its test file (`grep -n "import" src/schedule-batch/mcp-plan.ts` shows this directly). |

Bonus coverage beyond the letter of the acceptance criteria (defense in depth, matching the ADR's own
"News Carousel only" scope note): `"excludes a non-news-carousel entry from the plan, defensively, never
scheduling it"` proves a Character Explainer Asset that somehow reached this module's input is dropped,
not scheduled.

### Fakes / fixtures used

- No fakes needed — every test in this slice constructs plain in-memory fixtures (`EligibleAsset[]`,
  `ZohoConfigLookup`, `ZohoSocialBrand[]`), mirroring `src/schedule-batch/plan.test.ts`'s own style. There
  is no disk I/O, no ledger, no Media Host, and — **explicitly flagged for qa** — **no Magnific fake and
  no Zoho MCP fake of any kind**, because this slice never calls, imports, or references either: it is
  pure decision logic over data the caller already holds. `grep -rn "spaces_\|creations_\|zoho-social\|magnific" src/schedule-batch/mcp-plan.ts src/schedule-batch/mcp-plan.test.ts src/schedule-batch/order.ts src/schedule-batch/order.test.ts` returns nothing.
- `src/commands/export-schedule.test.ts` (unmodified, pre-existing) continues to exercise the refactored
  `sortEligible` import indirectly and stays green, confirming the extraction is behavior-preserving.

### Self-review notes

- Extracted `ideaSortKey`/`sortEligible` into `order.ts` rather than leaving a second, hand-copied sort
  in `mcp-plan.ts` — the issue's own instruction ("do not fork a second copy of slot math; extract/share
  if needed") applies just as much to the Idea-ordering as to the slot-time math itself.
- Exported `plan.ts`'s already-existing `X_PLATFORM` constant instead of redeclaring `const X_PLATFORM =
  "x"` a second time in `mcp-plan.ts` — one literal, one place, per the same reuse instruction.
- Considered making the "all Zoho Social Brands are X-only" case its own refusal reason (a fourth
  `McpSchedulePlanRefusalReason`), but decided against it: the plan is still meaningfully `ok: true` (an
  Asset's `groups: []` truthfully says "nothing to schedule via MCP for this Asset" without inventing a
  new business rule the issue never asked for); a future slice (#163) is free to treat an
  all-empty-groups plan as "fall back to CSV entirely" without this layer pre-deciding that for it. Noted
  under Known limits below.
- Considered having `buildMcpSchedulePlan` re-run `selectEligibleAssets` itself (accepting raw Ideas)
  instead of taking an already-selected `eligible` list. Rejected: the issue's own framing ("Given a
  run's produced, not-yet-posted News Carousel Assets...") describes the SAME shape
  `selectEligibleAssets` already produces, and `buildSchedulePlan` (the CSV path's own pure assembly
  step) has the identical contract — taking pre-selected input keeps this module a pure deep module
  rather than creeping into the orchestration shell's job (loading a run off the ledger is #163's
  concern).
- No dead code left behind; both new modules and the two edited files were re-read end to end as part of
  this pass.

### Known limits

- A Brand whose EVERY configured Zoho Social Brand is X-only ends up with `ok: true` and every Asset's
  `groups: []` — this is a deliberate, tested design choice (see Self-review notes), not a gap, but
  flagged here since it might look surprising at first glance: it is NOT a fourth refusal reason.
- This slice never writes anything — no ledger stamp, no schedule-time reference. That is issue #161's
  job; this module's `McpAssetSchedule.scheduledAtUtc` is exactly the value a later slice would stamp,
  but nothing here stamps it.
- No new `.claude/commands/*.md` doc and no producer-agent instruction changes — deliberately deferred to
  issue #163, which is the slice that actually drives the attended MCP-calling flow.
- `groupsFor` returns groups in the SAME order as the Brand's own `zohoConfig.zohoBrands` array (not
  re-sorted) — matches the CSV export's own per-file ordering convention, not separately specced here
  since the issue doesn't call out an ordering requirement on groups.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (= `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`):
  **green** — `# tests 1905 / # suites 488 / # pass 1905 / # fail 0 / # cancelled 0 / # skipped 0`.
- `npm run test:docs` (= `node --import tsx --test "src/**/*.docs-test.ts"`): **green** —
  `# tests 179 / # suites 45 / # pass 179 / # fail 0`.
- `npm run build` (`tsc -p tsconfig.build.json`): clean, no errors.
- `npx openspec validate issue-160-mcp-schedule-plan --strict`: `Change 'issue-160-mcp-schedule-plan' is valid`.
- `npx openspec validate --all --strict`: `Totals: 36 passed, 0 failed (36 items)` — includes the new
  `change/issue-160-mcp-schedule-plan` and leaves every pre-existing spec/change green.
- Slice-scoped run confirmed separately: `node --import tsx --test src/schedule-batch/mcp-plan.test.ts
  src/schedule-batch/order.test.ts` → `# tests 19 / # pass 19 / # fail 0` (12 + 7, matches the Build
  Report).

All real, actually-executed runs — no command failed, nothing assumed.

### Per-criterion results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Plan names each eligible Asset's target Channels (grouped per Zoho Social Brand) and scheduled time, matching the CSV export's own slot rules | PASS | `mcp-plan.ts` imports and calls the SAME functions the CSV path uses — `sortEligible` (`./order.ts`, now shared), `deriveScheduleSlots`/`validateSlotsFuture` (`./schedule.ts`), `formatZohoScheduleTime` (`./timezone.ts`) — confirmed by reading both `mcp-plan.ts` and `export-schedule.ts`/`plan.ts`; not a re-implementation. Proven by `mcp-plan.test.ts`'s `"names each eligible Asset's target Channel groups..."` and the explicit parity test `"derives the SAME slot, in the SAME idea order, that deriveScheduleSlots + sortEligible produce directly"`. |
| 2 | X is never routed to the MCP path, regardless of Brand configuration | PASS | `mcpEligibleChannels` filters `c.platform !== X_PLATFORM` (the same exported constant `plan.ts` uses for its own X handling) — hardcoded, not a Brand setting. Proven by `"never surfaces x in a mixed group's channels..."` and `"an X-only Zoho Social Brand grouping contributes no group at all"`. |
| 3 | Empty run / no Zoho config / lead-window slot → clearly-worded returned refusal, never a throw | PASS | Read `mcp-plan.ts` end to end: the only `throw` in the file is inside a doc comment; every one of the three refusal branches (`emptyRunRefusal()`, `zohoConfig.configured === false`, `!futureCheck.ok`) returns `{ ok: false, reason, message }`. Note: `deriveScheduleSlots` itself can throw on a malformed `startDate` string format — but that mirrors the CSV export's own identical, unguarded call (`export-schedule.ts` line ~195) and is a caller-contract/programming error, not one of the three named business-rule refusals the issue scopes "never a throw" to. Proven by the five refusal tests in `mcp-plan.test.ts` (empty run, effectively-empty run, not-configured, malformed, lead-window), each asserting `ok === false` + a specific `reason`/`message`. |
| 4 | Pure and fully covered by tests; no live calls anywhere | PASS | `grep -n "import" src/schedule-batch/mcp-plan.ts` shows only other pure modules + type-only imports; independently re-ran `grep -rn "spaces_\|creations_\|zohomcp\|zoho-social\|fetch(\|http\.\|https\.\|node:http\|axios\|XMLHttpRequest" src/schedule-batch/mcp-plan.ts src/schedule-batch/mcp-plan.test.ts src/schedule-batch/order.ts src/schedule-batch/order.test.ts` → no matches. Proven pure by `"never reads the system clock..."` and `"is pure — calling it twice with the same inputs returns deep-equal output"`. |

### Per-scenario results (spec deltas, `specs/schedule-batch-mcp-plan/spec.md`)

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| Groups by Zoho Social Brand at the CSV export's own slot → "A Brand configured with MCP-eligible Channels gets a plan naming Channels and times" | PASS | `mcp-plan.test.ts`: `"names each eligible Asset's target Channel groups..."` |
| ...→ "The derived slot matches exactly what deriveScheduleSlots + sortEligible produce directly" | PASS | `mcp-plan.test.ts`: `"derives the SAME slot, in the SAME idea order..."` |
| ...→ "An X-only Zoho Social Brand grouping contributes no group at all" | PASS | `mcp-plan.test.ts`: `"an X-only Zoho Social Brand grouping contributes no group at all"` |
| X is never routed to the MCP path → "A mixed Zoho Social Brand grouping never surfaces X in its MCP group" | PASS | `mcp-plan.test.ts`: `"never surfaces x in a mixed group's channels..."` |
| Scoped to News Carousel only → "A non-news-carousel entry in the input is excluded from the plan, not scheduled" | PASS | `mcp-plan.test.ts`: `"excludes a non-news-carousel entry from the plan, defensively, never scheduling it"` |
| Every refusal is returned, never thrown → "An empty run of eligible Assets is refused clearly, never thrown" | PASS | `mcp-plan.test.ts`: `"refuses an empty run clearly, never throwing"` (+ `"refuses an effectively-empty run..."` for the "becomes empty after filtering" clause) |
| ...→ "A Brand with no Zoho configuration is refused clearly, carrying that lookup's message" | PASS | `mcp-plan.test.ts`: `"refuses a Brand with no usable Zoho configuration (not_configured)..."` + `"...malformed Zoho configuration..."` (both `ZohoConfigLookup` shapes) |
| ...→ "A slot inside the 1-hour lead window is refused, naming the violation" | PASS | `mcp-plan.test.ts`: `"refuses a slot inside the 1-hour lead window, naming the violating Idea, never throwing"` |
| Pure, no clock/I/O → "Calling the plan twice with the same inputs returns deep-equal output" | PASS | `mcp-plan.test.ts`: `"is pure — calling it twice with the same inputs returns deep-equal output"` (+ `"never reads the system clock..."`) |

Every Requirement's every Scenario in the spec delta traces to a real, passing test — none is asserted
only by the spec's own prose.

### OpenSpec-vs-issue faithfulness (job c)

- Read `docs/adr/0020-zoho-mcp-schedules-posts-csv-becomes-fallback.md` (the accepted ADR the issue cites,
  present on `main`/`straw-motion-w32-run`) alongside the issue and the spec delta. The routing rule text
  in the issue ("Facebook, Instagram, TikTok, LinkedIn → MCP path. X → NEVER the MCP path") matches
  ADR-0020's Decision section verbatim in substance, and the proposal/spec delta both restate it
  correctly, scoped correctly to News Carousel only (explicitly deferring Character Explainer, matching
  the ADR's own "flagged for a later conversation" note).
- The proposal's Non-Goals section correctly keeps this slice to the pure decision layer only — no MCP
  tool call, no ledger write, no orchestration shell, no `.claude/agents/producer.md` change — matching
  both the issue's own framing ("This slice builds the pure decision layer for that split") and the
  ADR's Consequences section, which explicitly assigns those to "a future build slice" (i.e. #161–#163).
  Confirmed by `git status`/diff: only `src/commands/export-schedule.ts` and `src/schedule-batch/plan.ts`
  were modified (both behavior-preserving), plus new files under `src/schedule-batch/` and
  `openspec/changes/issue-160-mcp-schedule-plan/` — nothing under `data/`, `.claude/agents/`,
  `.claude/commands/`, or `CONTEXT.md` was touched by this slice.
- No misread found: the spec delta's four Requirements map 1:1 onto the issue's four acceptance criteria
  (grouping+timing, X-exclusion, refusal-not-throw, purity), plus one bonus Requirement ("scoped to News
  Carousel only") that is explicit issue text, not an invention.
- **Judgment call reviewed and accepted:** the developer's choice NOT to add a fourth refusal reason for
  "every configured Zoho Social Brand is X-only" (returning `ok: true` with per-Asset `groups: []`
  instead) is consistent with the issue text, which names exactly three refusal conditions (empty run, no
  Zoho configuration, lead-window slot) and no fourth. Inventing a new business rule the issue never
  asked for would itself have been a spec/issue mismatch in the other direction. Accepted as correct,
  house-style ("never fabricate") behavior, not a defect.
- **Non-blocking observation, not a defect:** `mcpEligibleChannels` implements the routing rule as "every
  platform except `x`" rather than a strict allowlist of exactly `{facebook, instagram, tiktok,
  linkedin}`. Checked against real data (`data/brands/straw-motion/brand-profile.yaml`,
  `data/brands/mundotip/brand-profile.yaml`): today's only configured Zoho platforms are exactly
  `facebook`/`instagram`/`tiktok`/`linkedin`/`x` — the two approaches are behaviorally identical against
  every real and test fixture in the repo today, and the issue's acceptance criteria do not require
  rejecting a hypothetical unnamed platform. Flagged only so a future slice (e.g. if a 6th Zoho-connected
  platform is ever configured) revisits whether "block X" should instead be "allow only the named four."

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | `buildMcpSchedulePlan` only computes a plan (in-memory data); it calls no write tool, no network call, of any kind. Publication is explicitly deferred to issue #163's conversational-approval gate per ADR-0020. |
| Public-metrics-only | N/A (pass) | No metrics code path touched by this slice. |
| Relative-not-absolute | N/A (pass) | No scoring/comparison logic in this slice. |
| Explicit-attribution | PASS | Every `McpAssetSchedule` carries forward the caller-supplied `ideaId`/`recipe` from the already-selected `eligible` input — nothing is inferred; attribution logging itself is out of scope here (issue #162). |
| Ledger-as-source-of-truth | PASS (N/A for writes) | This slice performs no ledger read or write at all — confirmed by `grep`: no `ledger`/`fs` import in `mcp-plan.ts`. That is correctly scoped to issue #161, not this slice; the issue and ADR both say so explicitly. |
| Magnific fake / no live-Space calls | PASS | `grep -rn "spaces_\|creations_\|zoho-social\|zohomcp\|magnific" src/schedule-batch/mcp-plan.ts src/schedule-batch/mcp-plan.test.ts src/schedule-batch/order.ts src/schedule-batch/order.test.ts` → no matches. No fake needed or claimed — this slice never imports or references the Magnific SDK/MCP or the Zoho MCP client at all; independently re-verified, not just taken from the Build Report's own claim. |

### Defect list

None. No defects found in this round.

**Overall: PASS.** All four acceptance criteria are met and proven by real, passing tests; every
Requirement/Scenario in the spec delta traces to a passing test; the OpenSpec change faithfully matches
both the issue text and ADR-0020 with no misread or invented scope; no live Magnific/Zoho calls anywhere;
all always-rules hold for what this slice actually does (a pure, non-writing decision layer). Suite is
green end to end (1905/1905 main suite, 179/179 docs suite, `openspec validate --strict` clean on both
the single change and the whole store).
