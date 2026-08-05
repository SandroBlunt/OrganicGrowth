## 1. Ground the decision + map every affected caller

- [x] 1.1 Read issue #135 in full, confirm it is labeled `ready-for-agent` and has no open "Blocked by".
- [x] 1.2 Re-read ADR-0019 (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`) and #127's
  archived change (`openspec/changes/archive/2026-07-24-127-multi-channel-brand-profile/`) — confirm
  the exact Channel entry shape (`{ platform, url?, primary? }`, no `name`/`handle`) and that #127
  deliberately left the scaffolder/template untouched.
- [x] 1.3 Read `src/production-spec/brand-profile.ts`'s `channelsFrom`/`primaryChannelFrom` in full —
  the target shape this slice's scaffolder output must satisfy.
- [x] 1.4 `grep -rn "channel" src/brand/scaffolder.ts src/brand/scaffold-brand.ts
  templates/brand-skeleton/brand-profile.yaml` — confirm both still emit the OLD single-object shape.
- [x] 1.5 `grep -rn "channel" src/brand/scaffolder.test.ts src/brand/scaffold-brand.test.ts
  src/commands/run-pipeline-onboarding.test.ts` — enumerate every test asserting the OLD onboarding
  output shape that will need updating (including the "C22: display name preserved as channel.name"
  block, which asserts a `channel.name` field ADR-0019 retires).
- [x] 1.6 Confirm the two real Brand Profiles (`data/brands/straw-motion/brand-profile.yaml`,
  `data/brands/mundotip/brand-profile.yaml`) carry no `name`/display-name field anywhere in the file —
  the precedent this slice's scaffolder output should match.
- [x] 1.7 Run `npm test` to capture the exact baseline pass count before any change (1863 passing, 0
  failing).

## 2. `buildBrandProfile` — new Channel-list output (test-first)

- [x] 2.1 Update `src/brand/scaffolder.test.ts` FIRST (failing): `buildBrandProfile`'s `channel` is a
  one-entry array; entry `platform` equals `answers.platform`; entry `url` equals `""` when
  `channelUrl` is not supplied, or `answers.channelUrl` when supplied; entry `primary` is `true`; the
  output has no `channel.name`/`channel[0].name` field anywhere; the array round-trips through YAML
  serialization with the same shape.
- [x] 2.2 Implement: retype `BrandProfileContent.channel` as `readonly BrandProfileChannel[]` (new
  exported `BrandProfileChannel = { platform: string; url: string; primary: boolean }` type); update
  `buildBrandProfile` to build `channel: [{ platform: answers.platform, url: answers.channelUrl ?? "",
  primary: true }]`; update doc comments (module header + `BrandInterviewAnswers.name`'s doc, which no
  longer feeds a Channel `name` field). Run 2.1: green.

## 3. `templates/brand-skeleton/brand-profile.yaml` — match the new shape

- [x] 3.1 Rewrite the template's `channel:` block to the one-entry list shape, with an ADR-0019
  guidance comment mirroring the one already used in the two real, migrated Brand Profiles (no
  `name`/`handle` field; `primary: true` required on the one entry).
- [x] 3.2 Confirm the template still parses as valid YAML and that `channelsFrom`/`primaryChannelFrom`
  read its (unfilled, `url: ""`) single entry as the one primary Channel with a blank URL — proven by a
  test in step 5 below, not just eyeballing.

## 4. Update existing tests to the new shape

- [x] 4.1 `src/brand/scaffold-brand.test.ts`: update the "seeds.yaml has apify.youtube... channel.platform
  is youtube" assertion to read `profile.channel?.[0]?.platform` instead of `profile.channel?.platform`.
- [x] 4.2 `src/commands/run-pipeline-onboarding.test.ts`: update `parsed.channel?.url` (AC4 "never
  invents brand facts" test) and the two `parsed.channel?.platform` assertions (case-insensitive
  platform, youtube platform) to index `channel[0]`. Replace the "C22: display name preserved as
  channel.name" describe block with a test proving the new, correct behavior: a scaffolded Brand's
  `channel[0]` has no `name` key, regardless of what display name the Operator typed.
- [x] 4.3 Run the full suite; confirm every updated test is green and no other test still asserts the
  old shape (`grep -rn "channel?\." src --include="*.test.ts"` to double-check nothing was missed).

## 5. Regression test: scaffolder output through channelsFrom/primaryChannelFrom/checkConfig (AC3)

- [x] 5.1 Add a new test (in `src/brand/scaffolder.test.ts`) that calls `buildBrandProfile` with a
  `channelUrl` supplied, then feeds the result straight into `channelsFrom` and `primaryChannelFrom`
  (`src/production-spec/brand-profile.ts`) — asserting the one entry round-trips with the right
  platform/url/`primary: true`, and `primaryChannelFrom` finds it.
- [x] 5.2 Add a companion test asserting `checkConfig` (`src/readiness/check-config.ts`), given
  `buildBrandProfile`'s output (with a `channelUrl` supplied) and a healthy `seeds` object, produces NO
  `channel_url_missing` finding — closing the exact false-positive bug this issue reports.
- [x] 5.3 Add a test asserting `checkConfig` DOES still produce `channel_url_missing` when
  `buildBrandProfile` is called WITHOUT a `channelUrl` (the real onboarding default before the Operator
  fills one in) — proving the finding still fires for a genuinely unconfigured Channel, not just that it
  never fires.

## 6. OpenSpec

- [x] 6.1 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and one spec delta: `brand-resolver` (MODIFIED Requirement — the `buildBrandProfile`
  builder's output shape).
- [x] 6.2 `npx openspec validate 135-scaffolder-channel-shape --strict` green.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite; confirm the count grows from the 1863-test
  baseline with zero regressions).
- [x] 7.2 Simplify pass: confirm every issue #135 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff (none expected — this slice never
  touches Magnific); remove any dead code/unused import; confirm doc comments are accurate.
- [x] 7.3 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed), self-review notes, known limits (display-name-on-Channel behavior retired, matching
  ADR-0019 and the two real Brand Profiles — restated for qa).
