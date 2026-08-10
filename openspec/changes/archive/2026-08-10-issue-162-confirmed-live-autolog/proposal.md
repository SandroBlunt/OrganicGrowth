## Why

ADR-0020 (accepted 2026-08-10; read read-only, external to this branch, at
`docs/adr/0020-zoho-mcp-schedules-posts-csv-becomes-fallback.md`) decides that for the Zoho MCP scheduling
path, attribution logs automatically — but only once a post is confirmed live, checked by the EXACT
reference Zoho returned at schedule-time (never guessed from timing). Issue #161 (merged) gave that
reference a durable home on the ledger (`LedgerAssetRecord.zoho_schedule_reference`). This slice is the
decision + write layer ADR-0020 names as part of "a future build slice": given an Asset's stored
schedule-time reference and Zoho's own current report for that reference (fetched by the Producer at
runtime, #163's job; injected here as plain data), decide whether the post is confirmed live and, when it
is, write the live Post URL and time onto exactly that `(Idea, Recipe)` Asset — through the SAME
attribution write `/log-post` performs, moving it `produced -> posted`.

This slice is deliberately narrow: it is the pure decision + shared write only. The actual Zoho MCP
scheduling flow, the conversational-approval gate, and the live fetch of Zoho's report are issue #163's
job — out of scope here, and never called from this diff.

## What Changes

- **`src/asset/attribution.ts` (NEW)** — extracts the ONE attribution write `/log-post` has always
  performed (write `post_url`/`posted_at` + the advanced `AssetStatus` onto the named `(idea, recipe)`
  Asset via `AssetStore.writeAsset`, then refresh that Asset's output-bundle `post.json` via
  `refreshPostJson`, issue #112) into a shared module: `nextAttributedStatus` (the produced -> posted /
  never-regress rule) and `writeAttributedPost` (the two-step write). `src/commands/log-post.ts` is
  refactored to call this shared module instead of inlining the write — its own observable behavior and
  every existing `post-attribution` spec scenario are UNCHANGED (verified: the full pre-existing
  `log-post.test.ts` suite still passes byte-for-byte against the refactored command).
- **`src/asset/asset.ts`** — adds `describeAssetList` (a small pure formatting helper, extracted from
  `/log-post`'s previously-private `describeAssets`), shared by `/log-post` and the new confirmed-live
  path so both refuse an unmatched Recipe with the exact same wording.
- **`src/schedule-batch/confirmed-live.ts` (NEW)** — the decision + shell for issue #162:
  - `ZohoScheduleReport`/`ZohoPlatformStatus`/`ZohoPostLiveStatus` — the small input type representing
    what the Producer fetches from Zoho's MCP tools at runtime (#163's job) and injects here as plain
    data. `reference` must echo back the exact reference the report is FOR; `statuses` carries one entry
    per targeted Channel platform (status + optional live URL/time).
  - `planConfirmedLiveLog` (PURE, no I/O, no clock) — given an Idea, a Recipe, a `ZohoScheduleReport`,
    and the Brand's primary Channel (`Channel | null`), decides: unresolved Idea/Recipe refuse; an Asset
    still `queued`/`in_production` refuses (`not-yet-produced`); an Asset with **no stored
    `zoho_schedule_reference`** refuses (`no-stored-reference`) and is **never** auto-logged (AC4); no
    configured primary Channel refuses (`no-primary-channel`); a report whose `reference` does not
    EXACTLY equal the Asset's stored reference (same shape, same value(s), same order) refuses
    (`reference-mismatch` — AC2: keys only on the stored reference, never timing/inference); no report
    entry for the primary Channel's platform refuses (`no-report`); a non-`"live"` status, or a `"live"`
    status missing `liveUrl`/`liveAt`, refuses (`pending` — AC3: never half-fabricates a Post). On
    success, returns the primary Channel's `liveUrl`/`liveAt` and the Asset's `nextStatus`
    (`nextAttributedStatus` — produced -> posted, never regresses an already-posted/tracking/scored
    Asset).
  - `confirmZohoPostLive` (the orchestration shell) — loads the Idea's Assets and the Brand's primary
    Channel, applies `planConfirmedLiveLog`, and on success calls the SAME `writeAttributedPost`
    `/log-post` uses — so there is only ever one `produced -> posted` transition in the codebase. Every
    refusal is a returned, clearly-worded message; nothing is ever thrown, and a refused call never
    writes the ledger.
- **Tests, test-first, hermetic.** New `src/asset/attribution.test.ts` and
  `src/schedule-batch/confirmed-live.test.ts`; `src/commands/log-post.test.ts` is unchanged and still
  passes (proves the refactor preserved `/log-post`'s exact behavior). No `spaces_*`/`creations_*`/Zoho
  MCP call anywhere in this diff — the confirmed-live report is always caller-injected data; this slice
  has no live-system boundary of its own (the Magnific fake is not needed here, mirroring issue #161).

## Non-Goals (explicitly deferred / out of scope)

- **Fetching Zoho's report itself** (any live MCP/network call) — #163's job entirely. This slice's
  `ZohoScheduleReport` is always caller-injected, in tests and at runtime alike.
- **The Zoho MCP scheduling flow, the conversational-approval gate, and recording `scheduled_at`/
  `zoho_schedule_reference` at schedule-time** — #163's job (schedule-time) and #161 (already merged,
  the field itself).
- **The one-time Straw Motion 2026-W32 heuristic-matching closeout** for posts that went out via the old
  CSV path before ADR-0020 (no stored reference at all) — a distinct, explicitly one-time exception named
  in the ADR, not this slice's general-purpose auto-log path.
- **Tracking for non-primary Channels** — ADR-0019's own deferred scope; this slice writes only the
  Brand's primary Channel's live Post URL.
- **Any CONTEXT.md / producer-agent-doc updates** describing the MCP-primary flow narrative — assigned by
  the ADR's "Consequences" section to the scheduling slice (#163), not this decision-layer slice.

## Capabilities

### Modified Capabilities (none)

No existing capability's REQUIREMENT TEXT changes. `post-attribution`'s scenarios all still hold,
byte-for-byte, against the refactored `/log-post` (checked: `grep -n "^### Requirement"
openspec/specs/post-attribution/spec.md` — no requirement text touched; the shared-write extraction is an
internal implementation detail, not an observable behavior change).

### Added Requirements, by capability

- `schedule-batch-confirmed-live` (NEW): the confirmed-live decision keys only on the Asset's stored
  `zoho_schedule_reference`, never on timing/inference; a confirmed-live report logs the primary
  Channel's Post URL through the same write `/log-post` performs; a still-pending or missing report
  writes nothing and says so clearly; an Asset with no stored reference is never auto-logged.

## Impact

- **Added:** `src/asset/attribution.ts`, `src/asset/attribution.test.ts`,
  `src/schedule-batch/confirmed-live.ts`, `src/schedule-batch/confirmed-live.test.ts`, this OpenSpec
  change folder.
- **Modified:** `src/commands/log-post.ts` (refactored to call the shared write; no behavior change —
  proven by its own pre-existing, unmodified test suite staying green), `src/asset/asset.ts` (adds
  `describeAssetList`).
- **Not touched:** `src/asset/store.ts`, `src/asset/output-bundle.ts`, `src/production-spec/
  brand-profile.ts`, `src/schedule-batch/mcp-plan.ts`, any Skill/agent doc, CONTEXT.md, CLAUDE.md, any
  live Brand's `ledger.json`.
- **Hermetic:** no Space/MCP/Zoho call anywhere in this diff — `ZohoScheduleReport` is always
  caller-injected plain data, in both tests and the (not-yet-built) real Producer call site. No Magnific
  fake is needed or used, mirroring issue #161's own "no live-system boundary in this slice" note.
- **Always-rules upheld:** ledger-as-source-of-truth (the SAME typed `AssetStore`/`writeAsset` boundary
  every other attribution write goes through — no parallel store); explicit-attribution (matching is by
  exact stored-reference equality only — never timing, ordering, or "the only report supplied"; an Asset
  with no stored reference is never auto-logged); never-fabricate (a `"live"` status missing its URL/time
  is treated as not-yet-confirmed, never half-logged); generate-never-publish (this slice never calls any
  Zoho write-tool — it only decides what to do with a report the caller already fetched);
  public-metrics-only / relative-not-absolute are untouched (no metrics/baseline code is modified).
