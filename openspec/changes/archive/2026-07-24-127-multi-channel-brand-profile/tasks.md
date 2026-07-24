## 1. Ground the decision + map every existing caller

- [x] 1.1 Read issue #127 in full, plus its parent epic #120 and ADR-0019
  (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`) — the accepted, decided schema.
  Confirm the ADR calls for migrate-in-place with NO back-compat shim for the old single-object
  `channel: { name, platform, url }` shape.
- [x] 1.2 Confirm blocker #124 is CLOSED/COMPLETED (`gh issue view 124 --json state,stateReason`).
- [x] 1.3 `grep -rn "\.channel\b\|channel:" src --include="*.ts"` (excluding tests) to enumerate every
  reader of the old shape: `src/readiness/check-config.ts` (`BrandProfile.channel.url`),
  `src/commands/run-pipeline-readiness.ts` (`brandProfile.channel?.url`), `src/apify/platform.ts`
  (doc-comment reference only — does not actually read the field at runtime).
- [x] 1.4 Read `src/production-spec/brand-profile.ts` in full — the existing typed Brand Profile
  reader/store (banned words, required CTA/hashtags, watermark handle) this slice extends with a
  Channel reader, following its existing pure-function + async-I/O-wrapper convention.
- [x] 1.5 Confirm CONTEXT.md's Brand/Channel glossary entries already reflect ADR-0019 (committed by
  the ADR's own authoring commit, prior to this slice) — no doc edit needed here.
- [x] 1.6 Enumerate every TEST fixture carrying the old single-object `channel:` shape that would
  regress under a non-back-compat reader: `src/readiness/check-config.test.ts` (`HEALTHY_PROFILE`),
  `src/commands/run-pipeline.test.ts` (`HEALTHY_PROFILE_YAML` + 2 inline profile YAML strings),
  `src/commands/run-pipeline-onboarding.test.ts` (`HEALTHY_PROFILE_YAML`, used only as an
  "existing Brand" fixture for onboarding-flow tests, not as an onboarding-OUTPUT assertion).
- [x] 1.7 Confirm the new-Brand onboarding writer (`src/brand/scaffolder.ts`'s `buildBrandProfile`,
  `src/brand/scaffold-brand.ts`, `templates/brand-skeleton/brand-profile.yaml`) is NOT named in
  ADR-0019's consequences section — decide to leave it untouched this slice (documented as a known
  limit in the Build Report), since touching it risks colliding with the prior "C22: display name
  preserved as channel.name" onboarding decision and the issue's own scope note limits this slice to
  "the data model + migration + updating existing callers to read the primary entry."
- [x] 1.8 Run `npm test` to capture the exact baseline pass count before any change.

## 2. Channel reader — `src/production-spec/brand-profile.ts` (test-first)

- [x] 2.1 Add tests to `src/production-spec/brand-profile.test.ts` FIRST (failing): `channelsFrom`
  reads a multi-Channel list with one primary entry; trims `platform`/`url`; returns `[]` for a
  missing `channel` key or a non-object raw value; returns `[]` for the pre-ADR-0019 single-object
  `channel` shape (no back-compat, proven against an inline literal AND the real repo fixture
  `fixtures/brand-profile.banned.yaml`, which still carries that old shape on disk); drops malformed
  entries (non-object, missing/blank/non-string `platform`) without crashing (data-handling rule 4);
  defaults a non-string `url` to `""` and a non-boolean `primary` to `false`. `primaryChannelFrom`
  returns the one `primary: true` entry; returns `null` when none is marked primary; picks the FIRST
  entry deterministically when more than one is (mis)configured primary. `loadChannels`/
  `loadPrimaryChannel` round-trip a new fixture file (`fixtures/brand-profile.channels.yaml`) and
  degrade to `[]`/`null` for a missing file.
- [x] 2.2 Add `src/production-spec/fixtures/brand-profile.channels.yaml` — a multi-Channel fixture
  mirroring the migrated Straw Motion shape (facebook primary + url, instagram/linkedin blank-url
  secondaries).
- [x] 2.3 Implement `Channel`, `channelsFrom(raw)`, `primaryChannelFrom(raw)`, `loadChannels(path)`,
  `loadPrimaryChannel(path)` in `src/production-spec/brand-profile.ts`, mirroring the existing
  `requiredCtaFrom`/`watermarkHandleFrom` defensive style. Run 2.1: green.

## 3. Update existing callers to read the primary entry

- [x] 3.1 `src/readiness/check-config.ts`: retype `BrandProfile.channel` as `unknown` (documented:
  types an already-parsed-but-unvalidated object); import `primaryChannelFrom`; `channel_url_missing`
  now reads `primaryChannelFrom(brandProfile)?.url`. Update the module's own doc comment (the
  `channel_url_missing` bullet + the header note) to describe the new list/primary shape.
- [x] 3.2 `src/commands/run-pipeline-readiness.ts`: derive `channelUrl` via `primaryChannelFrom`
  instead of `brandProfile.channel?.url`; update the `loadConfigFile` fallback from `{ channel: {} }`
  to `{ channel: [] }` (the new shape's "nothing configured" default).
- [x] 3.3 `src/apify/platform.ts`: update the doc comment referencing `channel.platform` to name the
  new list shape (no functional change — the module never read the field).
- [x] 3.4 Update `src/readiness/check-config.test.ts`: retype `HEALTHY_PROFILE.channel` as a one-entry
  list (`HEALTHY_CHANNEL`, `primary: true`); rewrite every `{ ...HEALTHY_PROFILE.channel, url: "" }`
  spread (which only made sense for the old object shape) to `[{ ...HEALTHY_CHANNEL, url: "" }]`; add
  a new scenario for "no entry marked primary → still blocks publish."
- [x] 3.5 Update `src/commands/run-pipeline.test.ts`'s `HEALTHY_PROFILE_YAML` and its two inline
  per-test profile YAML strings to the new list shape (so the "healthy Brand → no findings" and
  related tests keep passing under the non-back-compat reader). Leave the one deliberately-malformed
  YAML-syntax fixture (`"channel: {name: TestBrand"`, testing parse-failure handling) untouched — it
  is unrelated to the Channel shape.
- [x] 3.6 Update `src/commands/run-pipeline-onboarding.test.ts`'s `HEALTHY_PROFILE_YAML` (the
  "existing Brand" fixture used by the new-vs-existing-Brand onboarding tests) to the new list shape.
  Leave every assertion reading the onboarding-OUTPUT shape (`parsed.channel?.platform`, `.url`,
  `.name`) untouched — the writer (`buildBrandProfile`) is not changed by this slice.

## 4. Migrate the two real Brand Profiles

- [x] 4.1 `data/brands/straw-motion/brand-profile.yaml`: replace the single-object `channel` with the
  list — facebook (existing URL, `primary: true`), instagram, linkedin, x, tiktok (blank URLs). Drop
  the `name` sub-field.
- [x] 4.2 `data/brands/mundotip/brand-profile.yaml`: replace the single-object `channel` with the
  list — facebook (existing URL, `primary: true`), instagram, x, tiktok (blank URLs). Drop the `name`
  sub-field.
- [x] 4.3 Confirm both files still parse cleanly and `loadPrimaryChannel` resolves the facebook entry
  with its original URL unchanged (a real-fixture regression check, not just an inline-literal test).

## 5. OpenSpec

- [x] 5.1 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and two spec deltas: `production-spec` (ADDED Requirement — the Channel reader) and
  `readiness-classifier` (MODIFIED Requirement — `checkConfig`'s Channel-URL check).
- [x] 5.2 `npx openspec validate 127-multi-channel-brand-profile --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite; confirm the count grows from the pre-slice
  baseline with zero regressions).
- [x] 6.2 `npm run test:docs` green (unchanged — this slice adds no `.docs-test.ts`/Skill doc file).
- [x] 6.3 Simplify pass: confirm every issue #127 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm every OLD single-Channel
  reader (`check-config.ts`, `run-pipeline-readiness.ts`) now reads the primary entry; remove any
  dead code/unused import.
- [x] 6.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed), self-review notes, known limits (onboarding writer left untouched, restated for qa).
