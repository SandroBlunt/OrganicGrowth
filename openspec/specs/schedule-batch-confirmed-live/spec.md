# schedule-batch-confirmed-live Specification

## Purpose
TBD - created by archiving change issue-162-confirmed-live-autolog. Update Purpose after archive.
## Requirements
### Requirement: The confirmed-live decision keys ONLY on the Asset's stored zoho_schedule_reference, never on timing or inference

`planConfirmedLiveLog(idea, recipe, report, primaryChannel)` SHALL be PURE (no I/O, no clock read) —
defined in `src/schedule-batch/confirmed-live.ts` — and SHALL trust a `ZohoScheduleReport` as
confirmation for a `(idea, recipe)` Asset ONLY when `report.reference` is EXACTLY equal to that Asset's own stored
`zoho_schedule_reference` (`LedgerAssetRecord.zoho_schedule_reference`, issue #161) — same shape (a
string never matches an array, even one carrying the identical single value), same value(s), same order
(an array reference in a different order SHALL NOT match). A report whose `reference` does not match
SHALL be refused (`reason: "reference-mismatch"`) — it SHALL NEVER be treated as confirmation for a
different reference, regardless of what its `statuses` claim, and this decision SHALL NEVER be made by
matching on time, ordering, or "the only report supplied" (always-rules #5, explicit attribution).

#### Scenario: A report for a different reference than the stored one refuses, even though it reports live

- **GIVEN** an Asset with `zoho_schedule_reference: "zoho-post-abc123"`
- **WHEN** `planConfirmedLiveLog` is called with a `ZohoScheduleReport` whose `reference` is
  `"a-totally-different-reference"` and whose `statuses` report the primary Channel as `"live"` with a
  URL
- **THEN** the result is `{ ok: false, reason: "reference-mismatch" }`

#### Scenario: A string reference never matches an array carrying the same single value

- **GIVEN** an Asset with `zoho_schedule_reference: "zoho-post-abc123"` (a string)
- **WHEN** `planConfirmedLiveLog` is called with a report whose `reference` is `["zoho-post-abc123"]`
  (an array)
- **THEN** the result is `{ ok: false, reason: "reference-mismatch" }`

#### Scenario: An array reference in a different order never matches

- **GIVEN** an Asset with `zoho_schedule_reference: ["ref-a", "ref-b"]`
- **WHEN** `planConfirmedLiveLog` is called with a report whose `reference` is `["ref-b", "ref-a"]`
- **THEN** the result is `{ ok: false, reason: "reference-mismatch" }`

#### Scenario: A matching array reference, in the same order, is accepted

- **GIVEN** an Asset with `zoho_schedule_reference: ["ref-a", "ref-b"]`
- **WHEN** `planConfirmedLiveLog` is called with a report whose `reference` is `["ref-a", "ref-b"]` and
  whose `statuses` report the primary Channel `"live"` with a URL and time
- **THEN** the result is `{ ok: true, ... }`

### Requirement: An Asset with no stored zoho_schedule_reference is never auto-logged

`planConfirmedLiveLog` SHALL refuse with `reason: "no-stored-reference"` whenever the named `(idea,
recipe)` Asset's `zoho_schedule_reference` field is absent — regardless of what report is supplied,
including a report claiming `"live"` with a well-formed URL. This covers, in particular, an Asset
scheduled via the CSV/S3 fallback path (which records no such reference at all): it SHALL stay on the
Operator's manual `/log-post` and SHALL NEVER be logged automatically by this decision.

#### Scenario: An Asset with no stored reference refuses, even given a fully live report

- **GIVEN** a `produced` Asset with NO `zoho_schedule_reference` field at all
- **WHEN** `planConfirmedLiveLog` is called with a `ZohoScheduleReport` whose `statuses` report the
  primary Channel as `"live"` with a URL and time
- **THEN** the result is `{ ok: false, reason: "no-stored-reference" }`
- **AND** `confirmZohoPostLive`, run against that same Asset, writes nothing to the ledger

### Requirement: A confirmed-live report for the primary Channel logs the Post URL and time through the SAME write /log-post performs

`planConfirmedLiveLog` SHALL return `{ ok: true, asset, nextStatus, postUrl: liveUrl, postedAt: liveAt,
platform }` whenever a `ZohoScheduleReport`'s `reference` matches the Asset's stored
`zoho_schedule_reference` exactly AND its `statuses` contains an entry for the Brand's primary Channel's
`platform` (`primaryChannelFrom`/`loadPrimaryChannel`, `src/production-spec/brand-profile.ts`) with
`status: "live"` and non-empty `liveUrl`/`liveAt`, where `nextStatus` is computed by the SAME
`nextAttributedStatus` rule `/log-post` uses (a `produced` Asset advances to `posted`; an Asset already
`posted`/`tracking`/`scored` keeps its own status — never regressed). `confirmZohoPostLive`
(`src/schedule-batch/confirmed-live.ts`) SHALL, on this `ok: true` result, call the SAME
`writeAttributedPost` (`src/asset/attribution.ts`) that `/log-post` itself calls — writing
`post_url`/`posted_at`/the advanced status onto EXACTLY the named `(idea, recipe)` Asset via
`AssetStore.writeAsset`, then refreshing that Asset's output-bundle `post.json` (issue #112) — never a
second, independently-written produced -> posted transition. A `statuses` entry for a NON-primary
Channel platform reporting `"live"` SHALL be ignored for the write — only the primary Channel's URL is
ever logged (ADR-0019: tracking for the other Channels stays deferred).

#### Scenario: A confirmed-live report logs the primary Channel's URL and time, advancing produced to posted

- **GIVEN** a `produced` Asset with `zoho_schedule_reference: "zoho-post-abc123"`
- **WHEN** `confirmZohoPostLive` is called with a `ZohoScheduleReport` whose `reference` is
  `"zoho-post-abc123"` and whose `statuses` reports the primary Channel (`"facebook"`) as `"live"` with
  `liveUrl`/`liveAt` set
- **THEN** the Asset's ledger record now has `status: "posted"`, `post_url` equal to the reported
  `liveUrl`, and `posted_at` equal to the reported `liveAt`
- **AND** this is the SAME ledger effect an equivalent `/log-post <brand> <idea-id> <recipe> <liveUrl>
  <liveAt>` call produces for the same Asset

#### Scenario: A live status on a non-primary Channel is ignored — only the primary Channel's URL is logged

- **GIVEN** a `produced` Asset with a matching stored reference, and a report whose `statuses` include
  BOTH a non-primary platform (e.g. `"instagram"`) reporting `"live"` with its own URL AND the primary
  platform (`"facebook"`) reporting `"live"` with a different URL
- **WHEN** `planConfirmedLiveLog` is called
- **THEN** the returned `postUrl` is the PRIMARY Channel's URL, never the non-primary one

#### Scenario: An already-posted, tracking, or scored Asset's status never regresses on re-confirmation

- **GIVEN** an Asset with a matching stored reference already at `status: "posted"`, `"tracking"`, or
  `"scored"`
- **WHEN** `planConfirmedLiveLog` is called with a fully live, matching report
- **THEN** the returned `nextStatus` equals the Asset's CURRENT status, unchanged — never regressed

#### Scenario: With two Assets on one Idea, only the named Recipe's Asset is written

- **GIVEN** an Idea with two Assets — one with a matching stored reference, one without
- **WHEN** `confirmZohoPostLive` is called naming the Recipe WITH the stored reference
- **THEN** only that Asset's `post_url`/`status` change on disk — the sibling Asset is byte-identical
  before and after

#### Scenario: A successful confirmed-live log refreshes the named Asset's output-bundle post.json

- **GIVEN** a `produced` Asset with a matching stored reference and a known local output-bundle
  directory (`asset_paths` recorded)
- **WHEN** `confirmZohoPostLive` succeeds
- **THEN** that directory's `post.json` reflects the newly-logged `post_url`/`posted_at`

### Requirement: A still-pending or missing report writes nothing and says so clearly

`planConfirmedLiveLog` SHALL refuse — never write, never throw — for each of these cases, and
`confirmZohoPostLive` SHALL return a clearly-worded message describing which one occurred, leaving the
Brand's ledger file byte-for-byte unchanged: no configured primary Channel at all (`reason:
"no-primary-channel"`); a matching report with no entry for the primary Channel's platform (`reason:
"no-report"`); a matching report whose primary-Channel entry has `status` other than `"live"` (e.g.
`"pending"` or `"failed"`, `reason: "pending"`, naming the reported status); and a matching report whose
primary-Channel entry claims `status: "live"` but is missing a non-empty `liveUrl` or `liveAt` (`reason:
"pending"` — never half-fabricate a Post from an incomplete report).

#### Scenario: No configured primary Channel refuses clearly

- **GIVEN** a produced Asset with a matching stored reference and `primaryChannel: null` (the Brand has
  none configured)
- **WHEN** `planConfirmedLiveLog` is called
- **THEN** the result is `{ ok: false, reason: "no-primary-channel" }`

#### Scenario: A matching report with no entry for the primary Channel's platform refuses as missing

- **GIVEN** a produced Asset with a matching stored reference and a report whose `statuses` array is
  empty (or names only other platforms)
- **WHEN** `planConfirmedLiveLog` is called
- **THEN** the result is `{ ok: false, reason: "no-report" }`

#### Scenario: A still-pending or failed Zoho status refuses, naming the status

- **GIVEN** a produced Asset with a matching stored reference and a report whose primary-Channel entry
  has `status: "pending"` (or `"failed"`)
- **WHEN** `planConfirmedLiveLog` is called
- **THEN** the result is `{ ok: false, reason: "pending", status: <the reported status> }`

#### Scenario: A live status missing its URL or time refuses rather than half-fabricating a Post

- **GIVEN** a produced Asset with a matching stored reference and a report whose primary-Channel entry
  has `status: "live"` but no `liveUrl` (or no `liveAt`)
- **WHEN** `planConfirmedLiveLog` is called
- **THEN** the result is `{ ok: false, reason: "pending" }` — never a partially-logged Post

#### Scenario: Every refusal leaves the ledger file byte-for-byte unchanged

- **GIVEN** any of the refusal cases above (no stored reference, reference mismatch, no primary Channel,
  no report, pending/failed status, incomplete live data)
- **WHEN** `confirmZohoPostLive` is called
- **THEN** the Brand's ledger file's bytes on disk are identical before and after the call
- **AND** the returned message clearly states why nothing was logged

### Requirement: confirmZohoPostLive is Brand-explicit and never touches an unrelated Idea, Asset, or Brand

`confirmZohoPostLive(brand, ideaId, recipe, report, options)` SHALL require `<brand>` explicitly (no
silent default). It SHALL resolve the Brand's ledger and Brand Profile via `resolveBrand`, and every
write SHALL go through the shared `writeAttributedPost`, scoped to exactly the one targeted `(idea,
recipe)` Asset — every sibling Idea, every sibling Asset of the same Idea, and every other Brand's
ledger SHALL be left byte-for-byte untouched.

#### Scenario: A confirmed-live check for one Brand never touches another Brand's ledger

- **GIVEN** two Brands, each with their own ledger, sharing an identical Idea id
- **WHEN** `confirmZohoPostLive` is run for one Brand naming that shared Idea id
- **THEN** only that Brand's ledger file is written; the other Brand's ledger is untouched

