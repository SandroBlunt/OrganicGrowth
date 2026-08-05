# Slice Handoff — issue #135: brand-scaffolder still emits old single-object Channel shape

This is the one bidirectional Slice Handoff doc for this change. developer writes the Build Report
below; qa appends its Verdict beneath it (nothing here is ever overwritten; retries append new
Round-N blocks).

---

## Build Report (developer, Round 1)

### What changed

ADR-0019 changed `brand-profile.yaml`'s `channel` field from a single object
(`{ name, platform, url }`) to a LIST of `{ platform, url?, primary? }` entries, exactly one marked
`primary: true`. Issue #127 built the new reader (`channelsFrom`/`primaryChannelFrom`) and migrated
both real Brand Profiles, but deliberately left the new-Brand **scaffolder** untouched. That left a
real bug: a Brand onboarded today via `/run-pipeline`'s no-argument onboarding flow got a
`brand-profile.yaml` the new Channel reader could not parse (`channel` not an array → reads as `[]`
→ no primary Channel → `channel_url_missing` blocks Publish readiness forever, even after the
Operator fills in a real URL).

This slice brings the scaffolder in line with the reader it feeds:

- `src/brand/scaffolder.ts`'s `buildBrandProfile` now emits `channel` as a **one-entry list**,
  `[{ platform, url, primary: true }]`, instead of the old single object.
- The Channel entry's `name` sub-field is **dropped** — ADR-0019's Channel entry shape has no
  `name`/`handle` field, and neither of the two real Brand Profiles migrated by #127
  (`data/brands/straw-motion/brand-profile.yaml`, `data/brands/mundotip/brand-profile.yaml`) carries
  one either. The Operator's typed display name continues to be used only to derive the Brand's slug
  (`deriveSlug`) — it is simply not persisted onto the Channel any more, matching the two real Brands'
  precedent.
- `templates/brand-skeleton/brand-profile.yaml` (the raw copy-and-fill-in template) is updated to the
  same one-entry list shape, with the same ADR-0019 guidance comment used in the real, migrated Brand
  Profiles.
- New regression tests feed the scaffolder's own output through `channelsFrom`, `primaryChannelFrom`,
  and `checkConfig` end-to-end — proving both that a scaffolded Brand with a URL never trips
  `channel_url_missing`, and that a scaffolded Brand WITHOUT a URL still correctly trips it (so the
  fix doesn't silently disable the check).
- Every existing test that asserted the old single-object onboarding-output shape
  (`profile.channel.platform`, `.url`, `.name`) was updated to the new list shape
  (`profile.channel[0].platform`, etc.). The one test asserting the retired "channel.name preserves
  the typed display name" behavior ("C22") was replaced with a test proving the new, correct
  behavior: the scaffolded Channel entry has no `name` field at all, regardless of what the Operator
  typed.

### Files touched

- `src/brand/scaffolder.ts` — `buildBrandProfile`'s `channel` output; new `BrandProfileChannel` type;
  `BrandProfileContent.channel` retyped; doc comments updated (including `BrandInterviewAnswers.name`).
- `templates/brand-skeleton/brand-profile.yaml` — `channel` block rewritten to the ADR-0019 list shape.
- `src/brand/scaffolder.test.ts` — updated existing `buildBrandProfile` assertions to the list shape;
  added tests for `primary: true`, the absent `name` field, and a new integration section proving the
  builder's output round-trips through `channelsFrom`/`primaryChannelFrom`/`checkConfig`.
- `src/brand/scaffold-brand.test.ts` — updated the one assertion reading `profile.channel?.platform`
  (youtube test) to `profile.channel?.[0]?.platform`; added a new describe block that reads the RAW
  template file directly (independent of the scaffold pipeline) and proves it parses as one primary
  Channel entry under `channelsFrom`/`primaryChannelFrom`.
- `src/commands/run-pipeline-onboarding.test.ts` — updated three assertions
  (`channel[0].url`/`.platform` ×2) to the list shape; replaced the "C22: display name preserved as
  channel.name" describe block with a test proving the new behavior (no `name` field on the Channel
  entry).
- `openspec/changes/135-scaffolder-channel-shape/{proposal.md,tasks.md,handoff.md}` (this doc) and
  `openspec/changes/135-scaffolder-channel-shape/specs/brand-resolver/spec.md` (MODIFIED Requirement).

### How to run

```bash
# Full suite (type-check + all tests)
npm test

# Just this slice's test files
node --import tsx --test src/brand/scaffolder.test.ts
node --import tsx --test src/brand/scaffold-brand.test.ts
node --import tsx --test src/commands/run-pipeline-onboarding.test.ts

# OpenSpec validation
npx openspec validate 135-scaffolder-channel-shape --strict
```

Baseline before this slice: `npm test` → 1863 passing, 0 failing.
After this slice: `npm test` → **1874 passing, 0 failing** (+11 net new tests, zero regressions).
`npx openspec validate 135-scaffolder-channel-shape --strict` → **valid**.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | A newly-onboarded Brand's `brand-profile.yaml` (scaffolder output) parses correctly under the current Channel store/reader. | `src/brand/scaffolder.test.ts` → describe `"buildBrandProfile — output parses correctly under channelsFrom/primaryChannelFrom (issue #135)"`: `"channelsFrom reads the scaffolder's output as one Channel entry"`, `"primaryChannelFrom finds the scaffolder's one entry (never null)"`, `"primaryChannelFrom still finds the entry even before the Operator supplies a URL"`. Also proven end-to-end on disk via `src/brand/scaffold-brand.test.ts`'s youtube test, which scaffolds through the REAL template and reads back `channel[0].platform` from the written file. |
| 2 | `templates/brand-skeleton/brand-profile.yaml` matches the new shape. | `src/brand/scaffold-brand.test.ts` → describe `"templates/brand-skeleton/brand-profile.yaml — raw template matches the ADR-0019 Channel shape (issue #135)"`: reads the RAW template file directly (not through the scaffold pipeline) and proves `channelsFrom`/`primaryChannelFrom` read it as one primary Channel entry, and that `channel` is an array (not the retired single-object shape). |
| 3 | A test exercises the scaffolder's output against `channelsFrom`/`primaryChannelFrom`/readiness checks to catch future drift between the two. | `src/brand/scaffolder.test.ts` → describe `"buildBrandProfile — output does not falsely block Publish readiness once a URL is supplied (issue #135)"`: `"checkConfig reports no channel_url_missing finding once channelUrl is supplied"` (proves the exact bug is fixed) and `"checkConfig still reports channel_url_missing when no channelUrl was ever supplied"` (proves the fix doesn't silently disable the check) — both call `checkConfig` (`src/readiness/check-config.ts`) directly on `buildBrandProfile`'s own output, plus the `channelsFrom`/`primaryChannelFrom` tests under AC1 above. |

### Fakes / fixtures used

- **No Magnific fake needed and none used.** This slice touches no Magnific Space code path at all —
  it is plain-file YAML generation (a pure builder function) plus pure data-transform tests. Confirmed
  by `grep -rn "spaces_\|creations_" ` across every file in this diff: zero matches.
- No Apify fake needed either — this slice is unrelated to trend/performance scraping.
- Filesystem fixtures: temp directories via `mkdtemp`/`rm` (existing pattern in
  `scaffold-brand.test.ts`), and the REAL `templates/brand-skeleton/brand-profile.yaml` file (not a
  mock) — deliberately, since AC2 is specifically about that real template file's own shape.

### Self-review notes

- Kept the change minimal: only `buildBrandProfile`'s output shape and the template changed;
  `src/production-spec/brand-profile.ts` (the reader), `src/readiness/check-config.ts`, and
  `src/brand/scaffold-brand.ts` (the write shell) needed NO changes — they already read/serialize
  whatever shape the builder hands them, confirming the write shell's "no business logic" design
  principle held up under this change.
- Considered whether to preserve the retired "channel.name = typed display name" behavior by adding
  an extra, ADR-0019-shape-tolerant field. Decided against it: ADR-0019's Channel entry shape is
  explicit (`{ platform, url?, primary? }`, no `name`/`handle`), and neither real, already-migrated
  Brand Profile (Straw Motion, MundoTip) carries a display-name field anywhere in the file. Inventing
  a new field to route around that would be scope creep beyond what issue #135 asked for and would
  contradict the two production Brands' own precedent — documented as a known limit below instead.
- Removed the now-inapplicable "C22" test rather than skip/leave it stale, replacing it with a test
  that proves the new, correct, ADR-0019-consistent behavior explicitly (no `name` field, regardless
  of what the Operator typed).
- Double-checked (via `grep -rn "channel?\.\(name\|platform\|url\)\b"` and
  `grep -rn "\.channel\.\(name\|platform\|url\)\b"` across `src`) that no other test or production
  code still reads the old single-object shape after this change.
- No dead code or unused imports introduced; `npm test`'s `tsc --noEmit` pass confirms this compiles
  clean under the repo's strict compiler settings (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`).

### Known limits

- **The Operator's typed display name is no longer persisted anywhere in `brand-profile.yaml`.** It is
  used only to derive the Brand's slug during onboarding. This is a deliberate consequence of aligning
  with ADR-0019's canonical Channel entry shape (and matches the two real, already-migrated Brand
  Profiles) — not an oversight. If the Operator later wants the display name preserved somewhere in
  the Brand Profile, that would need its own explicit product decision (a new, separate field) — out
  of scope for this issue, which asked only to match the Channel shape `channelsFrom`/
  `primaryChannelFrom` expect.
- **Onboarding still only asks for one platform/URL.** This slice does not make the interview
  multi-Channel-aware — it always scaffolds a single-entry, `primary: true` Channel list. Asking the
  Operator for additional, non-primary Channels during onboarding is not part of issue #135.
- **No back-compat parser added** for the pre-ADR-0019 single-object `channel` shape — consistent with
  ADR-0019's and #127's migrate-in-place decision, unchanged by this slice.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npx openspec validate 135-scaffolder-channel-shape --strict` → `Change '135-scaffolder-channel-shape' is valid`.
- `npm test` (type-check via `tsc --noEmit` + full Node test-runner suite) →
  `# tests 1874 / # pass 1874 / # fail 0 / # cancelled 0 / # skipped 0`. Matches the Build Report's
  claimed count exactly (1863 baseline + 11 net new).
- Re-ran just the three touched test files directly
  (`node --import tsx --test src/brand/scaffolder.test.ts src/brand/scaffold-brand.test.ts src/commands/run-pipeline-onboarding.test.ts`)
  → `# tests 129 / # pass 129 / # fail 0`, confirming the new/changed assertions are exercised, not
  merely present.

Both commands were actually executed in this session (not assumed) and both came back fully green.

### Per-criterion results

| # | Acceptance criterion | Result | Proving test |
|---|---|---|---|
| 1 | A newly-onboarded Brand's `brand-profile.yaml` (scaffolder output) parses correctly under the current Channel store/reader. | PASS | `src/brand/scaffolder.test.ts` describe `"buildBrandProfile — output parses correctly under channelsFrom/primaryChannelFrom (issue #135)"` (3 tests, all exercise the real `channelsFrom`/`primaryChannelFrom` from `src/production-spec/brand-profile.ts` against `buildBrandProfile`'s real output — not a stub). End-to-end confirmation via `src/brand/scaffold-brand.test.ts`'s youtube test, which scaffolds a real Brand directory on disk and reads `channel[0].platform` back from the written file. |
| 2 | `templates/brand-skeleton/brand-profile.yaml` matches the new shape. | PASS | `src/brand/scaffold-brand.test.ts` describe `"templates/brand-skeleton/brand-profile.yaml — raw template matches the ADR-0019 Channel shape (issue #135)"` — reads the actual repo file at `templates/brand-skeleton/brand-profile.yaml` (not a copy/mock) via `readFile`, parses it with the real YAML parser, and asserts it is an array read correctly by `channelsFrom`/`primaryChannelFrom`. Verified independently by reading the template file myself: `channel:` is a one-entry list with `platform: facebook`, `url: ""`, `primary: true`, matching the two real, migrated Brand Profiles' shape and comment style exactly. |
| 3 | A test exercises the scaffolder's output against `channelsFrom`/`primaryChannelFrom`/readiness checks to catch future drift between the two. | PASS | `src/brand/scaffolder.test.ts` describe `"buildBrandProfile — output does not falsely block Publish readiness once a URL is supplied (issue #135)"` — both tests call the real `checkConfig` (`src/readiness/check-config.ts`) on `buildBrandProfile`'s real output: one proves `channel_url_missing` does NOT fire once a URL is supplied (closes the reported bug), the other proves it STILL fires when no URL is supplied (proves the fix doesn't silently disable the check). Combined with AC1's `channelsFrom`/`primaryChannelFrom` tests, this is a genuine drift-guard: any future shape mismatch between the builder and the reader/readiness-check would break these tests immediately. |

### Per-scenario results (spec deltas, `openspec/changes/135-scaffolder-channel-shape/specs/brand-resolver/spec.md`, Requirement "Pure builders produce a brand-profile, seeds, and empty ledger from interview answers")

| Scenario | Result | Covering test |
|---|---|---|
| buildBrandProfile maps every supplied answer field to the correct output key | PASS | `scaffolder.test.ts` describe `"buildBrandProfile — maps interview answers to the ADR-0019 Channel-list shape (issue #135)"`: `"sets channel to a one-entry array"`, `"sets channel[0].platform..."`, `"sets channel[0].url to empty string..."`, `"sets channel[0].primary to true..."` (plus the pre-existing, unmodified niche/voice/language/region/banned_words/required_cta/required_hashtags assertions in the same file). |
| buildBrandProfile includes deferred fields when supplied | PASS | describe `"buildBrandProfile — deferred fields when supplied"`: `"sets channel[0].url from answers.channelUrl when supplied"`, `"keeps channel[0].primary true when channelUrl is supplied"`. |
| buildBrandProfile's Channel entry never carries a name field | PASS | describe `"...Channel-list shape (issue #135)"`: `"does NOT set a name field on the Channel entry..."`, `"does not carry a name field even when the Operator's typed name differs from the slug"`. |
| buildBrandProfile round-trips through YAML serialization | PASS | describe `"buildBrandProfile — round-trip through YAML"`: both tests updated to assert `channel[0].platform`/`.url`, array length, and `channel[0].primary` survive a `stringify`→`parse` round trip. |
| buildBrandProfile's output parses as a configured primary Channel under channelsFrom/primaryChannelFrom | PASS | describe `"...output parses correctly under channelsFrom/primaryChannelFrom (issue #135)"` — all 3 tests. |
| buildBrandProfile's output does not trip checkConfig's channel_url_missing finding once a URL is supplied | PASS | describe `"...does not falsely block Publish readiness..."` → `"checkConfig reports no channel_url_missing finding once channelUrl is supplied"`. |
| buildBrandProfile's output still trips checkConfig's channel_url_missing finding when no URL is supplied | PASS | same describe → `"checkConfig still reports channel_url_missing when no channelUrl was ever supplied"`. |
| buildSeeds maps seed pages and selects the correct Apify actor block | PASS (unchanged) | describe `"buildSeeds — verified Instagram and YouTube actor slugs (issue #48)"` and earlier unmodified `buildSeeds` tests — untouched by this diff, still green. |
| buildSeeds round-trips through YAML serialization | PASS (unchanged) | unmodified round-trip test in `scaffolder.test.ts`. |
| buildEmptyLedger returns the canonical empty shape | PASS (unchanged) | unmodified `buildEmptyLedger` tests in `scaffolder.test.ts`. |

### Spec-faithfulness check (job (c))

- Confirmed the MODIFIED Requirement header in the change delta
  (`### Requirement: Pure builders produce a brand-profile, seeds, and empty ledger from interview
  answers`) is a byte-for-byte match of the existing archived requirement title in
  `openspec/specs/brand-resolver/spec.md` — a correctly-formed MODIFIED delta, not a stray new
  requirement.
- Diffed the archived requirement body against the change's delta body: only the `channel`-related
  prose/scenarios differ (old single-object dot-paths replaced by the list shape, three new scenarios
  added for the drift-guard); the `buildSeeds`/`buildEmptyLedger` scenarios are carried through
  unchanged. This is a precise, minimal, faithful delta — no unrelated scope creep, nothing silently
  dropped.
- Cross-checked the delta's prose against ADR-0019 and the two real, already-migrated Brand Profiles
  (`data/brands/straw-motion/brand-profile.yaml`, `data/brands/mundotip/brand-profile.yaml`) — both
  confirmed on disk to have no `name`/display-name field on any `channel` entry, matching the
  Requirement's claim exactly.
- Confirmed `src/production-spec/brand-profile.ts`'s real `channelsFrom`/`primaryChannelFrom` and
  `src/readiness/check-config.ts`'s real `channel_url_missing` logic match the shape and behavior the
  delta describes (read both files directly).
- `grep -rn "\.channel\.\(name\|platform\|url\)\b"` and `grep -rn "channel?\.\(name\|platform\|url\)\b"`
  across all of `src` (re-run independently, not just trusting the Build Report) found zero remaining
  references to the old single-object dot-path shape anywhere in production or test code.
- **Minor spec-hygiene gap found (not a functional defect — see Defect list, low severity):** two
  OTHER, already-archived capability specs (`openspec/specs/run-pipeline-conductor/spec.md` line 481
  and `openspec/specs/apify-platform-integration/spec.md` lines 74–78) contain Scenario prose that
  still asserts the OLD single-object dot-path (`channel.url`, `profile.channel.platform`) as a
  literal result. This text is now stale as a direct, if incidental, consequence of this slice's
  change (the underlying tests those scenarios describe were correctly updated by this developer to
  the list shape — see `run-pipeline-onboarding.test.ts`'s AC4 test and `scaffolder.test.ts`'s
  "accepts youtube as a platform value" test — but the archived spec prose in those two OTHER
  capabilities was not). Neither capability was declared Modified in this change's proposal.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | N/A (no publish-path logic changed) | This slice touches only Brand-onboarding YAML shape; nothing in the diff writes a Post, calls a Space, or touches `post_url`/publish code. `grep -n "publish\|post_url" src/brand/scaffolder.ts` → no matches beyond doc comments. |
| Public-metrics-only | N/A | No Apify/metrics code touched (`buildSeeds`'s actor-slug logic is untouched by this diff). |
| Relative-not-absolute | N/A | No scoring/baseline code touched; `buildEmptyLedger`'s baseline shape is unmodified. |
| Explicit-attribution | N/A | No Post/Idea/Recipe attribution code touched. |
| Ledger-as-source-of-truth | N/A | No ledger-write path touched; `buildEmptyLedger` (a different, pre-existing pure builder) is unmodified by this diff. `grep -n "ledger" src/brand/scaffolder.ts` shows only the pre-existing, untouched `buildEmptyLedger` function. |
| Magnific fake / no live-Space calls | PASS | `grep -rn "spaces_\|creations_"` across every file touched by this diff (`src/brand/scaffolder.ts`, `src/brand/scaffolder.test.ts`, `src/brand/scaffold-brand.test.ts`, `src/commands/run-pipeline-onboarding.test.ts`, `templates/brand-skeleton/brand-profile.yaml`) → zero matches (re-run independently in this session, exit code 1 / no match). This slice is pure YAML-shape generation and data-transform tests; no Magnific Space code path exists here to fake. |

All five domain always-rules are correctly N/A for this slice — it is a pure data-shape/onboarding
fix with no reach into publish, metrics, scoring, attribution, or ledger-write code paths. Confirmed by
direct inspection of the diff and by grepping the touched files, not merely by trusting the Build
Report's own claim.

### Defect list

| # | Severity | Description | Repro steps |
|---|---|---|---|
| 1 | low | Two OTHER, already-archived capability specs (`openspec/specs/run-pipeline-conductor/spec.md`, `openspec/specs/apify-platform-integration/spec.md`) contain Scenario assertions that still literally reference the retired single-object `channel` dot-path (`channel.url`, `profile.channel.platform`), which is now stale documentation as a side-effect of this slice's shape change. The underlying code and tests are correct; only the archived spec prose in those two OTHER capabilities is out of date. Does not block this issue's acceptance criteria (none of which ask for changes outside `brand-resolver`) and does not affect any running code or test. | 1. `grep -n "channel.url" openspec/specs/run-pipeline-conductor/spec.md` — line 481: `- **AND** \`channel.url\` is \`""\` (the Operator did not provide it)`; the real output is now `channel[0].url`. 2. `grep -n "profile.channel.platform" openspec/specs/apify-platform-integration/spec.md` — line 78: `- **THEN** \`profile.channel.platform\` equals \`"youtube"\``; the real output is now `profile.channel[0].platform`. Suggest a follow-up doc-only fix (in this PR or a fast-follow) adding small MODIFIED deltas for those two capabilities to keep the archived spec store internally consistent with the shipped behavior. |

No other defects found. This is not blocking — recommend the Operator decide whether to fold a
one-line fix into this same PR or track as a fast-follow; either is reasonable for a low-severity,
non-functional doc-drift finding.

### Verdict rationale

- Both required commands (`npm test`, `openspec validate --strict`) were run for real in this session
  and came back fully green, matching the Build Report's claimed counts exactly.
- All three acceptance criteria map to real tests that exercise the actual `channelsFrom`/
  `primaryChannelFrom`/`checkConfig` code paths against the scaffolder's real output (not mocks of
  those readers) — independently re-run and confirmed green.
- The `brand-resolver` spec delta is a precise, faithful MODIFIED requirement: same title as the
  archived original, only the `channel`-shape-related content changed, nothing dropped, three new
  drift-guarding scenarios added, all traceable to real passing tests.
- No live-Space/Magnific calls anywhere in the diff (independently grepped) — this issue correctly
  never touches Magnific.
- All five domain always-rules are correctly N/A, verified by direct inspection rather than assumed.
- The one defect found (stale prose in two OTHER, unrelated archived specs) is low severity,
  documentation-only, does not affect any acceptance criterion, and does not indicate a misread of
  issue #135 itself.

**Result: PASS. This slice may proceed to PR.**
