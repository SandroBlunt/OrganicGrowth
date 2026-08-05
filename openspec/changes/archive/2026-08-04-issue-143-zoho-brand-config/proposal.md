## Why

Issue #140 (the Schedule Batch spec) decided that the platform→CSV-file grouping and each platform's
exact Zoho channel label are **per-Brand configuration**, not hardcoded (its story 11): one
OrganicGrowth Brand's Channels can span several **Zoho Social Brands** (Zoho's own container of
connected accounts), each destined to become its own CSV file in the (separately built) Schedule
Batch export, and each with its own clock (its story 29's timezone decision). Issue #143 (this slice)
builds ONLY that data model: a typed loader on the existing Brand Profile store, and Straw Motion's
real, live-verified configuration. The Media Host port (#144), ledger round-tripping (#141), the X
280-char cap (#142), and the Schedule Batch export command itself are separate, independently-buildable
slices — not built here.

## What Changes

- **Extend the existing Brand Profile typed store** (`src/production-spec/brand-profile.ts` — the
  module that already reads `banned_words`/`required_cta`/`required_hashtags`/`watermark_handle`/
  `channel`) with an OPTIONAL `zoho` field reader: `ZohoChannelMapping`, `ZohoSocialBrand`,
  `ZohoConfigLookup` (the `ZohoConfigFound | ZohoConfigNotConfigured` discriminated union),
  `zohoConfigFrom(raw, brand)` (pure) and `loadZohoConfig(path, brand)` (the async I/O shell) — no new
  parallel module, per the issue's own instruction.
- **Never throws; always one of two typed shapes**, mirroring `src/format/baseline-prompt.ts`'s
  `BaselinePromptLookup` convention exactly:
  - `configured: false, reason: "not_configured"` — the Brand Profile has no `zoho` key at all. This is
    the ordinary, expected shape for a Brand that hasn't wired Schedule Batch yet (issue #143 AC3) —
    NOT an error. MundoTip's real profile is left untouched and reads this way.
  - `configured: false, reason: "malformed"` — a `zoho` key IS present but broken in some way. `errors`
    names EVERY problem found (never just the first, never a partial best-effort guess) — covering:
    `zoho`/`zoho.brands`/an entry/its `channels` not being the right shape; a missing/blank
    `timezone`; a `timezone` string that isn't a recognized IANA identifier (validated via the
    standard-library `Intl.DateTimeFormat`, no new dependency); a missing/blank `platform`/`label` on
    a channel mapping; and the SAME platform assigned to more than one Zoho Social Brand (each
    platform maps to exactly one CSV file). Both reasons' `message` names the Brand explicitly (AC1).
  - `configured: true` — the full, validated `zohoBrands` list.
- **Design call: IANA timezone identifiers, not fixed UTC offsets** (the issue explicitly delegates
  this choice). Chosen because (a) it needs no new npm dependency — Node's built-in `Intl` API is
  timezone-database-aware — and (b) Zoho's own account settings present timezones by representative
  city, which map directly onto IANA zone names. Each Zoho Social Brand carries its OWN `timezone`
  field (not a single Brand-wide clock), because #140 found the Operator's two real Zoho Social Brands
  had drifted onto different clocks before being manually aligned — the shape must allow that.
- **`name` is the one optional field on a Zoho Social Brand entry** — a human-readable label
  (informational only, e.g. for a future export's file naming), defaulting to `""` when absent. It is
  never itself a validation problem, unlike `timezone`/`channels`.
- **Ship Straw Motion's real configuration** in `data/brands/straw-motion/brand-profile.yaml`: two Zoho
  Social Brands, live-verified against the Operator's account 2026-08-04 — the main one grouping
  `facebook`/`instagram`/`tiktok` (labels `Facebook`/`Instagram`/`TikTok`), the second grouping
  `linkedin`/`x` (labels `LinkedInProfile`/`X` — `LinkedInProfile` names the Operator's PERSONAL
  profile and is a DIFFERENT Zoho channel than the company-Page `LinkedIn`, never normalized), both on
  `Europe/Berlin` (CEST today, the Operator's own clock, both Zoho Social Brands manually aligned to it
  on 2026-08-04).
- **MundoTip's `brand-profile.yaml` is deliberately left untouched** — the issue is explicit that
  MundoTip's actual Zoho wiring is out of scope; its profile carrying no `zoho` key IS the "not
  configured for Schedule Batch" test case (AC3).
- **No cross-validation against the Brand's own `channel` list.** A Zoho `platform` value is read as a
  free string, matching `Channel.platform`'s own free-string convention, but this slice does not check
  that the platform is actually one of the Brand's configured Channels — an explicit, documented scope
  limit (see Non-Goals).

## Non-Goals (explicitly deferred / out of scope)

- **The Schedule Batch export command itself** (the CSV writer, the S3 hosting, the schedule-time
  derivation) — a separate, not-yet-filed slice that will consume this config.
- **The Media Host port** (issue #144), **ledger `scheduled_at` round-tripping** (issue #141), and **the
  X 280-char composition cap** (issue #142) — independent slices under the same #140 parent.
- **MundoTip's actual Zoho wiring** — explicitly out of scope per the issue; MundoTip's profile is left
  untouched.
- **Cross-validating a Zoho `platform` value against the Brand's own `channel` list** — a documented
  scope limit (see "What Changes" above); a Known Limit in the Build Report.
- **Updating the new-Brand onboarding scaffolder/interview** to prompt for Zoho config — not asked for
  by the issue; a Brand simply has no `zoho` key until hand-authored, exactly like `production.
  watermark_handle` before issue #88.
- **A CONTEXT.md glossary entry for "Zoho Social Brand"** — PRD #140 itself flags this as a "glossary
  candidate" for later, not a requirement of this data-model slice.

## Capabilities

### Modified Capabilities

None — this is a new Requirement on an existing capability, not a change to previously-specified
behavior.

### Added Capabilities

- `production-spec`: the Brand Profile reader gains a Zoho Social Brand config reader alongside its
  existing banned-words / required-CTA / required-hashtags / watermark-handle / Channel-list readers.

## Impact

- **Added:**
  - `src/production-spec/fixtures/brand-profile.zoho.yaml`
  - `openspec/changes/issue-143-zoho-brand-config/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/issue-143-zoho-brand-config/specs/production-spec/spec.md`
- **Modified:**
  - `src/production-spec/brand-profile.ts` (+tests) — new `ZohoChannelMapping`, `ZohoSocialBrand`,
    `ZohoConfigFound`, `ZohoConfigNotConfigured`, `ZohoConfigLookup`, `zohoConfigFrom`,
    `loadZohoConfig`.
  - `data/brands/straw-motion/brand-profile.yaml` — real `zoho` block added.
- **Not touched:** `data/brands/mundotip/brand-profile.yaml` (deliberately — the "not configured" test
  case), `CONTEXT.md`, any command/CLI surface, any Schedule-Batch export code (doesn't exist yet).
- **Hermetic:** no Space/MCP call anywhere in this diff — this slice is plain-file YAML reading + pure
  data transforms + one standard-library `Intl` timezone-validity check. The Magnific fake is not
  exercised because there is nothing to fake here.
- **Always-rules upheld:** generate-never-publish (no publish-path code touched — Schedule Batch stays
  a human-triggered CSV export in a later slice, and the Publish gate stays human regardless);
  public-metrics-only / relative-not-absolute (no metrics/baseline code touched);
  explicit-attribution (no Post/`post_url` code touched); ledger-as-source-of-truth (no ledger-write
  path touched — `scheduled_at` round-tripping is issue #141's separate slice); never-fabricate
  (`zohoConfigFrom` never invents a platform, label, or timezone — a malformed/absent value is reported
  or degrades to a typed "not configured" result, never guessed).
