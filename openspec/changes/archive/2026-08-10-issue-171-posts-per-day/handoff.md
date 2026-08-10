# Slice Handoff — issue #171 (Schedule Batch: several posts per day)

## Build Report (developer, round 1)

### What changed

`deriveScheduleSlots` (`src/schedule-batch/schedule.ts`) gains a third, optional `postsPerDay` parameter
(default `1`). It controls how many CONSECUTIVE slots (by overall position) share one calendar day
before the schedule advances to the next: the day offset for slot `i` becomes `Math.floor(i /
postsPerDay)`, while the `HOUR_MINUTE_ROTATION` entry each slot uses is still selected by the slot's
overall position `i % rotation.length`, exactly as before — raising `postsPerDay` only changes which
calendar day a slot lands on, never which `(hour, minute)` it uses. Omitting the parameter (or passing
`1`) reproduces the pre-#171 one-Asset-per-day behavior byte-for-byte.

This one shared change is threaded through **both** ADR-0020 Schedule Batch mechanisms, never
reimplemented per mechanism:

- `buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`) gains an optional `postsPerDay` input field,
  passed straight through to `deriveScheduleSlots`.
- `exportScheduleCommand` (`src/commands/export-schedule.ts`, the CSV/S3 fallback) gains
  `options.postsPerDay`, plus an optional 5th CLI positional argument (`npm run export-schedule <brand>
  <format> <run> <start-date> [posts-per-day]`), parsed/validated by a new pure, exported
  `parsePostsPerDayArg` helper.
- `scheduleViaZohoMcpCommand` (`src/commands/schedule-via-zoho-mcp.ts`, the MCP primary path) gains
  `options.postsPerDay`, passed straight through to `buildMcpSchedulePlan`.

`validateSlotsFuture` is untouched, per the issue's own scope — it operates on the already-derived
`ScheduleSlot[]` list regardless of how those slots are spaced across days, so the 1-hour lead-time guard
keeps refusing the whole export/schedule run, naming every violating slot, unchanged.

**Design decision — how posts-per-day is supplied:** a plain, optional parameter threaded from each
entry point (the CSV command's CLI argument; each orchestration shell's `options` object) down to the one
shared `deriveScheduleSlots` function — never a Format-YAML field. A Format-level default (the natural
home would be ADR-0022's own per-Format `cadence`, issue #172) was considered and explicitly deferred:
issue #172 is a separate, independent, not-yet-built slice that never mentions posts-per-day, and this
issue's own scope note ("the change lives in the shared derivation, not per-mechanism") argues for the
minimal, mechanism-agnostic parameter rather than coupling to another in-flight design. A later slice (or
#172 itself) can read a Format's own default and pass it in as this same parameter without touching
`schedule.ts`, `mcp-plan.ts`, or either orchestration shell again. Full reasoning is in `proposal.md`'s
"How posts-per-day is supplied" section.

### Files touched

- `src/schedule-batch/schedule.ts` + `src/schedule-batch/schedule.test.ts` — the shared derivation.
- `src/schedule-batch/mcp-plan.ts` + `src/schedule-batch/mcp-plan.test.ts` — MCP-path pass-through.
- `src/commands/export-schedule.ts` + `src/commands/export-schedule.test.ts` — CSV/S3 fallback
  pass-through + CLI `[posts-per-day]` argument + `parsePostsPerDayArg`.
- `src/commands/schedule-via-zoho-mcp.ts` + `src/commands/schedule-via-zoho-mcp.test.ts` — MCP-primary
  orchestration pass-through.
- `.claude/commands/export-schedule.md` — usage line + derivation description updated.
- `openspec/changes/issue-171-posts-per-day/` — `proposal.md`, `tasks.md`, spec deltas (this change).

### How to run

```
set -a; [ -f .env ] && . ./.env; set +a   # not actually needed for this slice — no live calls
npm test                                    # type-check + full unit suite
npm run test:docs                           # docs-conformance suite (export-schedule.md, producer.md, etc.)
npm run build                               # tsc -p tsconfig.build.json
npx openspec validate issue-171-posts-per-day --strict
```

Single-file runs used during development:

```
node --import tsx --test src/schedule-batch/schedule.test.ts
node --import tsx --test src/schedule-batch/mcp-plan.test.ts
node --import tsx --test src/commands/export-schedule.test.ts
node --import tsx --test src/commands/schedule-via-zoho-mcp.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #171) | Proven by |
|---|---|---|
| 1 | Exporting N eligible Assets with posts-per-day = 6 schedules them across ceil(N/6) days, rotation order preserved | `src/schedule-batch/schedule.test.ts` — "N=7 Assets at postsPerDay=6 span exactly ceil(7/6)=2 distinct calendar days", "N=18 Assets at postsPerDay=6 span exactly ceil(18/6)=3 distinct calendar days, 6 per day", "same-day slots are drawn from the HOUR_MINUTE_ROTATION in order (rotation order preserved)" (pure-function level); `src/commands/export-schedule.test.ts` — "posts-per-day (issue #171): 7 eligible Assets at postsPerDay=6 schedule across ceil(7/6)=2 days, rotation order preserved" (CSV/S3 command level, asserts exact `scheduled_at` parity with `deriveScheduleSlots(startDate, 7, 6)`); `src/commands/schedule-via-zoho-mcp.test.ts` — "posts-per-day (issue #171): 3 eligible Assets at postsPerDay=6 all schedule to the SAME calendar day..." (MCP command level); `src/schedule-batch/mcp-plan.test.ts` — "honors postsPerDay from the shared derivation (issue #171)..." (plan level) |
| 2 | Default (1/day) behavior byte-identical; full suite green | `src/schedule-batch/schedule.test.ts` — "omitting postsPerDay is byte-identical to the explicit default of 1"; `src/schedule-batch/mcp-plan.test.ts` — "omitting postsPerDay defaults to 1 — byte-identical to the pre-#171 behavior"; `src/commands/export-schedule.test.ts` — "omitting postsPerDay is byte-identical to the pre-#171 default (one Asset per calendar day)" (re-asserts the exact same byte-exact `08/04/2026 15:06,` string the suite's original happy-path test already pinned); `npm test` — 2012/2012 passing (was 1996 before this slice; the pre-existing suite is unmodified in behavior, only extended) |
| 3 | Past-slot guard still refuses the whole export with named violations | `src/schedule-batch/schedule.test.ts`'s existing `validateSlotsFuture` describe block — untouched, still green (proves the guard itself is byte-for-byte unchanged); `src/commands/export-schedule.test.ts` — "refuses the WHOLE export loudly, writing nothing, when a schedule time is less than 1 hour away" (pre-existing, unmodified, still passes against the new `deriveScheduleSlots` signature); `src/commands/schedule-via-zoho-mcp.test.ts` — "a schedule time inside the 1-hour lead window refuses, zero port calls" (pre-existing, unmodified, still passes) |

### Fakes / fixtures used

- `FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`) — every `exportScheduleCommand` and
  `scheduleViaZohoMcpCommand` test.
- `FakeZohoSchedulePort` (`src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`) — every
  `scheduleViaZohoMcpCommand` test.
- No new fixtures were added; this slice is pure-derivation + options threading, reusing the exact
  fixtures the pre-existing `schedule-batch` test suite already used.
- **Magnific fake flag:** this slice makes **no Magnific call of any kind** (no `spaces_*`/`creations_*`
  anywhere in the touched code or tests) and **no live Zoho MCP call** — every Zoho interaction in the
  new/changed tests goes through `FakeZohoSchedulePort`. Confirmed by inspection of every touched file's
  imports (`grep -rn "spaces_\|creations_\|zoho-social" src/schedule-batch/schedule*.ts
  src/schedule-batch/mcp-plan*.ts src/commands/export-schedule*.ts
  src/commands/schedule-via-zoho-mcp*.ts` returns no live-tool references, only the fake port import).

### Self-review notes

- Considered adding a `postsPerDay` field to `formats/<slug>.yaml` (`src/format/store.ts`) since ADR-0022
  names a sibling `cadence` field — deliberately reverted to the plain-parameter design once it was clear
  issue #172 (the actual `cadence` slice) is separate, not-yet-built, and never mentions posts-per-day;
  coupling this slice to that one's future shape would have violated the issue's own "the change lives
  in the shared derivation, not per-mechanism" scope note.
- Tightened a docstring line-wrap in `schedule-via-zoho-mcp.ts` that split mid-sentence across three
  short lines after the first edit pass; merged into two well-formed lines.
- Considered testing `parsePostsPerDayArg`'s CLI wiring via `main()` end-to-end against a real Brand
  fixture; rejected because `main()` always resolves paths off the real `data/brands` root with no way
  to inject `ledgerPath`/`brandProfilePath` — running it against a real Brand risked mutating the actual
  Straw Motion ledger in a test. Instead: `parsePostsPerDayArg` is exported and unit-tested directly
  (pure, no I/O), and a `main()`-level test proves a malformed 5th argument produces a clear usage error
  and non-zero exit — the same boundary-testing pattern the pre-existing "missing required argument"
  `main()` test already used. The actual value-threading through `exportScheduleCommand` (what matters
  for the acceptance criteria) is proven directly, with a real fixture, in the `exportScheduleCommand`
  test itself.
- No dead code introduced; no existing test was weakened or deleted — every pre-existing schedule-batch
  test (including the full `validateSlotsFuture` suite) is unmodified and still green.

### Known limits

- No Format-YAML `posts_per_day` field/default — a Brand or agent must pass the value explicitly at each
  call site (CLI argument for the CSV path; `options.postsPerDay` for either orchestration shell). This
  is an intentional, documented deferral (see "How posts-per-day is supplied" above), not an oversight.
- `.claude/agents/producer.md` was not updated to mention `postsPerDay` — the producer agent's own
  conversational flow for supplying it (e.g. reading it from a Format, or asking the Operator) is left
  for whichever later slice wires a default in, consistent with keeping this slice minimal.
- The CLI's `[posts-per-day]` argument is a plain positional integer with no upper bound validation
  beyond "positive integer" — an operator passing an implausibly large value (e.g. 1000) would get a
  degenerate but not incorrect schedule (all Assets crammed onto very few days, cycling the 12-entry
  rotation many times within a day); this was judged out of scope since the issue only asks for a
  positive-integer guard, not a sanity ceiling.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (type-check via `tsc --noEmit` + full unit suite, Node's built-in test runner): **2012/2012
  passing, 0 failing, 0 skipped** (511 suites). Exact tail: `# tests 2012 / # pass 2012 / # fail 0 /
  # cancelled 0 / # skipped 0 / # todo 0`.
- `npm run test:docs` (docs-conformance suite): **192/192 passing, 0 failing** (50 suites), including
  `export-schedule.md documents itself as the CSV/S3 fallback path` — green with the updated docs.
- `npm run build` (`tsc -p tsconfig.build.json`): clean, no errors/output.
- `npx openspec validate --strict --all`: **39/39 items passed, 0 failed**, including
  `✓ change/issue-171-posts-per-day`, `✓ spec/schedule-batch-export`, `✓ spec/schedule-batch-mcp-plan`,
  `✓ spec/schedule-batch-mcp-scheduling`.

All four commands were actually run in this worktree (branch `issue-171-posts-per-day`), not assumed.

### Per-criterion results

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | N Assets at posts-per-day=6 schedule across ceil(N/6) days, rotation order preserved | **PASS** | `src/schedule-batch/schedule.ts`: day offset is `Math.floor(i / postsPerDay)`, rotation index stays `i % HOUR_MINUTE_ROTATION.length` (unchanged expression, confirmed by diff). Proven at 4 levels: pure-function (`schedule.test.ts` — N=7→2 days, N=18→3 days×6, and a direct same-day-vs-spread `(hour,minute)` sequence-equality test that is the strongest possible proof rotation order survives the day-boundary change), CSV command (`export-schedule.test.ts` — 7 Assets/postsPerDay=6 asserts each `scheduled_at` exactly equals `deriveScheduleSlots(startDate,7,6)`'s corresponding slot, and spans exactly 2 distinct days), MCP plan (`mcp-plan.test.ts`), MCP command (`schedule-via-zoho-mcp.test.ts`). All cited tests ran and passed in the `npm test` run above. |
| 2 | Default (1/day) byte-identical; full suite green | **PASS** | `deriveScheduleSlots(startDate, count)` (2-arg call site) is byte-identical to `(startDate, count, 1)` by `assert.deepEqual` in `schedule.test.ts`; `mcp-plan.test.ts` and `export-schedule.test.ts` each re-assert byte-identical output/CSV bytes when `postsPerDay` is omitted (the export test re-checks the exact pre-existing `"08/04/2026 15:06,"` string). `deriveScheduleSlots`'s implementation itself — `for (i...) dayOffset = Math.floor(i/postsPerDay); rotation index i % len` — is a mathematical no-op at `postsPerDay=1` (`Math.floor(i/1) === i`), so this isn't just test-asserted but structurally guaranteed. Full suite green as reported above (2012/2012). |
| 3 | Past-slot guard still refuses the whole export with named violations | **PASS** | `git diff` on `src/schedule-batch/schedule.ts` shows **zero lines changed** inside `validateSlotsFuture` or its surrounding types (`ScheduleFutureValidation`, `ScheduleFutureViolation`) — confirmed by isolating the diff to that region. Pre-existing, unmodified tests for this guard (schedule.test.ts's `validateSlotsFuture` describe block, `export-schedule.test.ts`'s "refuses the WHOLE export loudly... schedule time is less than 1 hour away", `schedule-via-zoho-mcp.test.ts`'s "a schedule time inside the 1-hour lead window refuses, zero port calls") all still pass against the new 3-arg `deriveScheduleSlots` signature. |

### Per-scenario results (spec deltas)

**`schedule-batch-export`** (Requirement: Schedule derivation is pure and deterministic; the 1-hour-future guard is load-bearing):
- "one Asset per day, strictly increasing" — PASS (pre-existing, unmodified, green)
- "Eastern-local time within targeting window, off round minute" — PASS (pre-existing, unmodified, green)
- "schedule time <1hr fails validation, naming violation" — PASS (pre-existing, unmodified, green)
- "schedule time ≥1hr passes validation" — PASS (pre-existing, unmodified, green)
- "Omitting postsPerDay is byte-identical to passing 1" — PASS → `schedule.test.ts` "omitting postsPerDay is byte-identical to the explicit default of 1"
- "postsPerDay=6 places up to 6 consecutive slots on the SAME day" — PASS → `schedule.test.ts` "with postsPerDay = 6, six consecutive slots share the SAME calendar day"
- "postsPerDay=6 rolls over on the 7th slot" — PASS → `schedule.test.ts` "with postsPerDay = 6, the 7th slot rolls over to the next calendar day"
- "N=7 at postsPerDay=6 spans ceil(7/6)=2 days" — PASS → `schedule.test.ts` matching test
- "Same-day slots preserve rotation order" — PASS → `schedule.test.ts` "same-day slots are drawn from the HOUR_MINUTE_ROTATION in order"
- "non-positive/non-integer postsPerDay throws naming error" — PASS → `schedule.test.ts` two `assert.throws(...,/postsPerDay/)` tests

**`schedule-batch-export`** (Requirement: The command writes CSVs + manifest, stamps scheduled_at):
- All pre-existing scenarios (happy path, empty run, no Zoho config, 1-hour guard, 4-failure-mode preflight, re-run idempotency, auto-cleanup) — PASS, all unmodified and green.
- "7 Assets at postsPerDay=6 schedule across ceil(7/6)=2 days, rotation order preserved" — PASS → `export-schedule.test.ts` new test, asserts exact `scheduled_at` parity with `deriveScheduleSlots` and 2-distinct-day span.
- "Omitting postsPerDay reproduces exact pre-#171 default" — PASS → `export-schedule.test.ts` new test, byte-exact CSV string match.

**`schedule-batch-mcp-plan`** (Requirement: plan groups eligible Assets by Zoho Social Brand, at CSV export's own slot):
- Pre-existing scenarios (Channel grouping, slot parity with `deriveScheduleSlots`+`sortEligible`, X-only-grouping-contributes-nothing) — PASS, unmodified, green.
- "postsPerDay passed straight through" — PASS → `mcp-plan.test.ts` "honors postsPerDay from the shared derivation"
- "Omitting postsPerDay defaults to 1, byte-identical" — PASS → `mcp-plan.test.ts` "omitting postsPerDay defaults to 1"

**`schedule-batch-mcp-scheduling`** (Requirement: scheduleViaZohoMcpCommand reuses SAME eligibility/plan/preflight):
- Pre-existing scenarios (empty run, no Zoho config, preflight refusal, 1-hour lead-window refusal, no-double-schedule) — PASS, unmodified, green.
- "postsPerDay schedules several Assets to the SAME calendar day" — PASS → `schedule-via-zoho-mcp.test.ts` new test, asserts exact `scheduled_at` parity with `deriveScheduleSlots(startDate,3,6)` and same-day for all 3.

### Always-rules + Magnific-fake checks

- **Generate-never-publish**: PASS. `scheduleViaZohoMcpCommand`'s `approved` gate (`if (!options.approved) { ... refuse before any Zoho write-tool ... }`, `src/commands/schedule-via-zoho-mcp.ts` line 128) is byte-unchanged by this diff — `options.postsPerDay` was added as a sibling optional field, not inserted into the approval path. `AC1` unaffected; the conversational-approval-then-schedule gate is untouched. This slice only reshapes WHEN (which calendar day) an Asset is scheduled, never adds a new write path.
- **Public-metrics-only**: PASS (N/A — no metrics code touched by this slice; `grep` confirms no touched file references Apify/Insights).
- **Relative-not-absolute**: PASS (N/A — no scoring code touched).
- **Explicit-attribution**: PASS. `scheduled_at` is still stamped per-`(ideaId, recipe)` Asset via `AssetStore.writeAsset` (`grep -n "writeAsset"` shows both `export-schedule.ts:265` and `schedule-via-zoho-mcp.ts:229` unchanged call sites); no new inference of attribution introduced.
- **Ledger-as-source-of-truth**: PASS. `writeAsset` remains the only write path in both touched commands; `git diff` confirms no new/duplicate ledger-write logic introduced. Ledger re-reads in the new tests (`loadIdeaAssets`) confirm `scheduled_at` is durably written, not just returned in the command's string output.
- **Magnific fake / no live calls**: PASS. `grep -rn "spaces_\|creations_\|zoho-social\|magnific" src/schedule-batch/schedule.ts src/schedule-batch/schedule.test.ts src/schedule-batch/mcp-plan.ts src/schedule-batch/mcp-plan.test.ts src/commands/export-schedule.ts src/commands/export-schedule.test.ts src/commands/schedule-via-zoho-mcp.ts src/commands/schedule-via-zoho-mcp.test.ts` returned **zero matches**. Every touched test imports only `FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`, in-memory, `https://fake-media-host.example/` placeholder base URL, no `fetch`/network calls) and `FakeZohoSchedulePort` (`src/schedule-batch/fixtures/fake-zoho-schedule-port.ts`, in-memory, placeholder `https://bucket.example/...` URLs only). No `mcp-schedule.ts`/`mcp-schedule-port.ts` (the actual live-port adapter files) were touched by this slice at all (confirmed via `git diff --stat` showing no output for those paths).

### OpenSpec-vs-issue faithfulness check

- The change lives entirely in the **shared derivation** (`deriveScheduleSlots`), passed straight through by both `buildMcpSchedulePlan` and the two orchestration shells — confirmed no per-mechanism reimplementation exists anywhere in the diff (each call site is a one-line pass-through: `deriveScheduleSlots(startDate, sorted.length, postsPerDay)` / `postsPerDay` field on an options object). This matches the issue's explicit scope note verbatim.
- Default `1` preserves every weekly Format's behavior, matching the issue's "so every weekly Format's behavior is byte-identical" requirement, and is proven structurally (not just by test) since `Math.floor(i/1) === i`.
- Rotation stays the fixed 12-entry `HOUR_MINUTE_ROTATION`, same-day slots spread across it in order — matches "Same-day slots spread across the existing 12-entry HOUR_MINUTE_ROTATION in order."
- `validateSlotsFuture` confirmed byte-unchanged (see AC3 above) — matches "unchanged" scope item exactly.
- No misread found: the spec deltas do not introduce anything the issue didn't ask for (no Format-YAML field, no change to CSV dialect/row cap/Media Host, no change to the approval gate) and do not drop any issue requirement. The deliberate deferral of a Format-level `postsPerDay` default (leaving it a plain parameter today) is explicitly scoped as a Non-Goal in `proposal.md` and does not contradict the issue — the issue only asks for "a posts-per-day parameter on the slot derivation," which is exactly what was built.
- Spec deltas' Requirement names reproduce the existing `openspec/specs/` Requirement names verbatim (confirmed via the clean `openspec validate --strict --all` pass with no header-mismatch errors), per repo archive convention.

### Defect list

None. No defects found in this round.

**Overall: PASS.** All three acceptance criteria are met and proven by passing tests; the OpenSpec change faithfully matches the issue and lives in the shared derivation as scoped; no live Magnific/Zoho calls anywhere; all always-rules hold, including confirmation the conversational-approval gate (`options.approved`) is untouched.
