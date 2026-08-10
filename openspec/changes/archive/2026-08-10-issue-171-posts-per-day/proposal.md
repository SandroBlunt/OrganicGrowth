## Why

The **Unhypped Daily** Format (design session 2026-08-10, Q16; ADR-0022) produces ~6 News Carousel
Assets **per day**, but `deriveScheduleSlots` (`src/schedule-batch/schedule.ts`) places exactly **one**
Asset per consecutive calendar day. At 6 produced/day and 1 scheduled/day, the Schedule Batch backlog
falls 5 days further behind every single day it runs — the Operator's explicit choice (all six Ideas get
carousels) makes this a structural bottleneck, not an edge case. ADR-0022 itself names this as the
volume consequence "its own slice" — this is that slice.

## What Changes

- **`deriveScheduleSlots(startDate, count, postsPerDay = 1)`** (`src/schedule-batch/schedule.ts`) gains a
  third, OPTIONAL parameter: how many consecutive Assets share one calendar day before the schedule
  advances to the next. Each slot's `(hour, minute)` is STILL drawn from the fixed 12-entry
  `HOUR_MINUTE_ROTATION` by the slot's overall position `i` (never re-indexed per day) — raising
  `postsPerDay` only changes which calendar day a slot lands on, never which rotation entry it uses.
  Omitting the argument (or passing `1`) reproduces the exact previous one-Asset-per-day behavior,
  byte-for-byte — every existing weekly Format is unaffected.
- **Both Schedule Batch mechanisms honor the SAME derivation, never a per-mechanism reimplementation**
  (ADR-0020): `buildMcpSchedulePlan` (`src/schedule-batch/mcp-plan.ts`) gains an optional
  `postsPerDay` input field, passed straight through to `deriveScheduleSlots`; `exportScheduleCommand`
  (`src/commands/export-schedule.ts`, the CSV/S3 fallback) and `scheduleViaZohoMcpCommand`
  (`src/commands/schedule-via-zoho-mcp.ts`, the MCP primary path) each gain an optional
  `options.postsPerDay`, threaded straight through to the shared derivation with no separate logic.
- **`exportScheduleCommand`'s CLI wrapper** (`npm run export-schedule`) gains an optional 5th positional
  argument, `[posts-per-day]`, parsed and validated by a small, pure, independently-tested helper
  (`parsePostsPerDayArg`) — an omitted argument defaults to `1`; a present-but-invalid one (not a
  positive integer) prints a clear usage error and exits non-zero, never silently falling back to a
  guessed value or passing a bad number deeper into the pipeline.
- **`validateSlotsFuture` is completely unchanged** (per the issue's own scope) — it operates on the
  already-derived `ScheduleSlot[]` list regardless of how those slots were spaced across days, so the
  1-hour lead-time guard keeps refusing the WHOLE export/schedule run, naming every violating slot, with
  no code change required.

## How posts-per-day is supplied (design decision)

The issue explicitly scopes this to "the shared derivation, not per-mechanism" and asks for the default
to keep every existing Format byte-identical. A Format-YAML field (`formats/<slug>.yaml`) was considered
— ADR-0022's own per-Format `cadence` field (issue #172, not yet built) would be the natural sibling —
but is deliberately **out of scope here**: issue #172 is a separate, independent slice with no mention
of posts-per-day, and wiring a Format-level default now would either duplicate #172's future YAML-parsing
work or create a coupling this issue never asked for. Instead, `postsPerDay` is a plain, optional
parameter threaded from each entry point (the CSV command's CLI argument, and each orchestration shell's
`options` object) down to the one shared `deriveScheduleSlots` function. This keeps the change minimal,
mechanism-agnostic (both ADR-0020 paths call the exact same code), and leaves room for a later slice (or
#172 itself) to read a Format's own default and pass it in as this same parameter — without touching
`schedule.ts`, `mcp-plan.ts`, or either orchestration shell again.

## Non-Goals (explicitly deferred)

- **A Format-YAML `posts_per_day` field.** No change to `src/format/store.ts` or any `formats/*.yaml`
  file. The caller (today: the Operator, via the CLI argument or the producer's own conversational
  choice) supplies the value explicitly.
- **Any live Magnific or Zoho MCP call.** Purely a change to deterministic, pure slot derivation plus the
  two existing orchestration shells' options — hermetic throughout, fakes only in every test.
- **Changing `validateSlotsFuture`** — explicitly out of scope per the issue.
- **Changing the CSV/manifest row cap (350 rows), the Media Host, or the CSV dialect** — untouched.

## Capabilities

### Modified Capabilities

- `schedule-batch-export`: `deriveScheduleSlots` gains the `postsPerDay` parameter; `exportScheduleCommand`
  and its CLI wrapper thread it through.
- `schedule-batch-mcp-plan`: `buildMcpSchedulePlan` gains the `postsPerDay` input field, passed straight
  through to the SAME shared `deriveScheduleSlots`.
- `schedule-batch-mcp-scheduling`: `scheduleViaZohoMcpCommand` gains `options.postsPerDay`, passed
  straight through to `buildMcpSchedulePlan`.

## Impact

- **Modified code:** `src/schedule-batch/schedule.ts` (+ `.test.ts`), `src/schedule-batch/mcp-plan.ts`
  (+ `.test.ts`), `src/commands/export-schedule.ts` (+ `.test.ts`), `src/commands/schedule-via-zoho-mcp.ts`
  (+ `.test.ts`), `.claude/commands/export-schedule.md` (usage line + derivation description).
- **Not touched:** `src/schedule-batch/plan.ts`, `csv.ts`, `manifest.ts`, `eligibility.ts`, `order.ts`,
  `timezone.ts`, `cleanup*.ts`, `mcp-schedule.ts`, `mcp-schedule-port.ts`, `confirmed-live.ts`,
  `src/format/**`, `src/media-host/**`, `data/**`, `.claude/agents/producer.md`.
- **Hermetic:** no live `spaces_*`/`creations_*` calls, no live Zoho MCP call, no network anywhere in the
  new/changed tests — every test uses `FakeMediaHost` and `FakeZohoSchedulePort` (existing fixtures),
  mirroring the existing `schedule-batch` test suite's own style exactly.
- **Always-rules upheld:** generate-never-publish (this change only reshapes WHEN Assets are scheduled
  across days; it adds no new write path to Zoho or any platform); public-metrics-only (N/A — no metrics
  here); relative-not-absolute (N/A — no scoring here); explicit-attribution (each stamped `scheduled_at`
  stays keyed to its own `(ideaId, recipe)` Asset, unchanged); ledger-as-source-of-truth
  (`AssetStore.writeAsset` is still the only write path, unchanged).
