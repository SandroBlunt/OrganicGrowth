## Why

ADR-0020 (not yet merged; captured 2026-08-10, Straw Motion W32 grilling session) decides that once the
Producer schedules a post through Zoho's own MCP tools, closing the loop later ("is it live yet?") must
key on the EXACT reference Zoho's schedule-post tool returned at schedule-time — never guessed from
timing, and never re-derived. Before this slice, the ledger has nowhere durable to put that reference:
`LedgerAssetRecord` (`src/asset/asset.ts`) carries `scheduled_at` (the Schedule Batch export's stamp,
issue #140/#141) but no field at all for what Zoho itself returned when a post is scheduled through the
MCP path. This slice gives that reference its durable home, so the future MCP-calling build slice (ADR-0020
names it explicitly as "a future build slice") has a typed field to write into and read back from.

This is purely the ledger/Asset-store prerequisite — mirroring how issue #141 (archived:
`2026-08-04-issue-141-ledger-scheduled-at-round-trip`) was the ledger-fidelity prerequisite for the
Schedule Batch export itself. No Zoho MCP-calling code, no Producer conversational-approval wiring, and no
docs/glossary updates for the new primary-scheduling-path narrative are in scope here — those belong to the
later slices ADR-0020's "Consequences" section names.

## What Changes

- **`src/asset/asset.ts`** — a new exported type `ZohoScheduleReference = string | readonly string[]` and
  a new optional `LedgerAssetRecord` field `zoho_schedule_reference?: ZohoScheduleReference`, placed
  alongside the existing `scheduled_at`. A new pure parser, `parseZohoScheduleReference(raw)`, accepts
  EITHER a non-empty string OR a non-empty array whose every entry is a non-empty string, kept completely
  VERBATIM (never collapsed to always-array, never re-derived, never partially kept) — any other shape
  (blank string, empty array, mixed-type array, number, object, `null`/`undefined`) returns `null` and the
  WHOLE field is omitted from the parsed Asset (mirrors `parseAssetMetrics`'s never-half-fabricate rule,
  not the per-entry-dropping rule `parseCastArray`/`parseCopyVariants` use — because "verbatim, no
  normalization" means a malformed reference must not be silently rewritten into a smaller "valid" one).
  `parseAssetRecord` calls this parser and includes the field only when non-`null`.
- **No new `AssetStatus`, no lifecycle change.** `status` stays `produced` for an Asset scheduled via the
  MCP path — ADR-0011's six-stage vocabulary (`queued -> in_production -> produced -> posted -> tracking ->
  scored`) is unchanged; being queued in Zoho is not being posted. `zoho_schedule_reference` carries no
  lifecycle meaning of its own, exactly like `scheduled_at`.
- **Defensive parsing / backward compatibility.** Every ledger record written before this field existed
  (every real Brand ledger today, and every fixture in the existing test suite) has no
  `zoho_schedule_reference` key and continues to load exactly as before — the parser omits the field
  rather than fabricating one. Because `writeAsset` (`src/asset/store.ts`) re-normalizes an Idea's WHOLE
  `assets[]` array through this same parser on every write (including a write that targets an unrelated
  sibling Asset on the same Idea — the exact bug issue #141 fixed for `scheduled_at`), this parsing is
  exercised on every write, not just on a direct read.
- **Tests, test-first, hermetic.** `src/asset/asset.test.ts` gains direct unit coverage: a well-formed
  single-string reference, a well-formed array of references (verbatim, in order), a blank/empty/mixed-type
  array or non-string/non-array value is rejected as a WHOLE (never partially kept), the field is omitted
  when absent, and parsing it never changes `status`/introduces a new `AssetStatus`.
  `src/asset/store.test.ts` gains: a round-trip write -> read through `writeAsset`/`loadIdeaAssets` for
  both the string and array shapes, a regression test that a write to a SIBLING Asset does not erase an
  already-recorded `zoho_schedule_reference` (mirrors issue #141's sibling-write regression test), and a
  test that a ledger record predating this field (no `zoho_schedule_reference` key at all) loads cleanly
  with the field simply absent. No `spaces_*`/`creations_*`/Zoho MCP call anywhere in this diff — this
  slice touches ledger-parsing code only; no fake is needed or used (there is no live-system boundary in
  this slice at all).

## Non-Goals (explicitly deferred / out of scope)

- **The Producer's Zoho MCP-calling code** (portal/brand/channel lookups, validate-then-schedule, the
  conversational-approval gate that replaces the CSV-upload act, the confirmed-live check that reads this
  new field back before auto-logging a Post) — ADR-0020 names this as "a future build slice"; this slice
  only builds the ledger field that code will write into and read from.
- **The one-time Straw Motion 2026-W32 heuristic-matching closeout** (ADR-0020's separate, explicitly
  one-time exception for posts that went out via the old CSV path and have no such reference) — a distinct
  piece of work, not a ledger-shape change.
- **CONTEXT.md / `.claude/agents/producer.md` / `schedule-batch-*` OpenSpec capability updates** describing
  MCP as the new primary scheduling path — ADR-0020's "Consequences" section explicitly assigns these to
  the future build slice alongside the MCP-calling code itself, not to this ledger-prerequisite slice.
  `zoho_schedule_reference` is an internal ledger field, not new Operator-facing vocabulary, so no glossary
  term is coined here.
- **`/report` or `post.json` surfacing `zoho_schedule_reference`** — no reader outside the ledger/Asset
  store is touched; `ReportAssetRow` and `generatePostJson` are unmodified.
- **Any change to `/export-schedule`, the CSV/S3 fallback path, or Schedule Batch eligibility** — those
  stay exactly as issues #140/#141/#145-148 left them.

## Capabilities

### Modified Capabilities (none)

No existing capability's REQUIREMENT TEXT is changed by this slice; the requirement title added below is
genuinely new (checked with `grep -n "^### Requirement" openspec/specs/asset-store/spec.md` — no
collision).

### Added Requirements, by capability

- `asset-store`: an Asset scheduled via Zoho's MCP path carries the EXACT `zoho_schedule_reference` Zoho
  returned at schedule-time, verbatim, surviving every ledger round-trip; `status` stays `produced`.

## Impact

- **Added:** nothing new on disk besides this OpenSpec change folder — every code change is additive to an
  existing file (no new `.ts` module).
- **Modified:** `src/asset/asset.ts`, plus its test file `src/asset/asset.test.ts` and
  `src/asset/store.test.ts`.
- **Not touched:** `src/asset/store.ts` (the generic `writeAsset`/`loadIdeaAssets` shell already passes any
  `patch` field straight through `upsertAsset`/the parser — no store-level change needed), `src/copy/*`,
  `src/schedule-batch/*`, `src/commands/export-schedule.ts`, `src/ledger/*`, any Skill/agent doc,
  CONTEXT.md, CLAUDE.md, any live Brand's `ledger.json`.
- **Hermetic:** no Space/MCP/Zoho call anywhere in this diff (`grep -rn "spaces_\|creations_\|zoho"` over
  every touched `.ts` file returns nothing beyond this proposal's own prose) — pure ledger-parsing code, no
  fake needed or used.
- **Always-rules upheld:** ledger-as-source-of-truth (the new field is written/read through the SAME typed
  `AssetStore` boundary every other Asset field goes through — `writeAsset`/`loadIdeaAssets`, no parallel
  store); never-fabricate (a malformed/absent `zoho_schedule_reference` degrades to omitted, never
  invented, never partially kept); generate-never-publish (this slice does not call any Zoho write-tool —
  it only gives a FUTURE such call somewhere durable to record its own result); public-metrics-only /
  relative-not-absolute / explicit-attribution are untouched by this slice (no publish, metrics, baseline,
  or attribution code is modified).
