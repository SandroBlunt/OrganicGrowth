## 1. Ground the decision + read what's already there

- [x] 1.1 Read issue #143 in full, plus its parent #140 (Schedule Batch spec — user stories 10–11,
  the timezone decision) and confirm blocker list is empty (`gh issue view 143`).
- [x] 1.2 Read `src/production-spec/brand-profile.ts` in full — the existing typed Brand Profile
  reader/store this slice extends, following its pure-function + async-I/O-wrapper convention exactly
  (mirrors `channelsFrom`/`primaryChannelFrom`/`loadChannels`/`loadPrimaryChannel`, ADR-0019).
- [x] 1.3 Read `src/format/baseline-prompt.ts`'s `BaselinePromptLookup` — the closest existing
  precedent for a never-throwing, Brand-naming, multi-reason typed "not found" result — and adopt its
  discriminated-union shape for the Zoho config lookup.
- [x] 1.4 Read the real `data/brands/straw-motion/brand-profile.yaml` and
  `data/brands/mundotip/brand-profile.yaml` to confirm the existing `channel[].platform` free-string
  convention this slice's `ZohoChannelMapping.platform` mirrors.
- [x] 1.5 Confirm Node's built-in `Intl.DateTimeFormat` rejects an invalid IANA timezone string with a
  thrown error (no new dependency needed for a real validity check).
- [x] 1.6 Run `npm test` to capture the exact baseline pass count before any change.

## 2. Zoho config reader — `src/production-spec/brand-profile.ts` (test-first)

- [x] 2.1 Add tests to `src/production-spec/brand-profile.test.ts` FIRST (failing): `zohoConfigFrom`
  returns `configured: false, reason: "not_configured"` (naming the Brand) for a raw profile with no
  `zoho` key, or a non-object raw value; reads a well-formed two-Zoho-Brand config; defaults a missing
  `name` to `""` without erroring; trims `platform`/`label`/`name`/`timezone`; reports
  `reason: "malformed"` for: a non-object `zoho`, a missing/empty `zoho.brands`, a missing/blank
  `timezone`, an unrecognized IANA `timezone` string, missing/empty `channels`, a channel entry
  missing `platform` or `label`, and the SAME platform assigned to more than one Zoho Social Brand;
  proves multiple independent problems are ALL collected (never just the first); never throws for any
  malformed shape (`null`, `undefined`, `{}`, `{ zoho: null }`, `{ zoho: 7 }`,
  `{ zoho: { brands: "nope" } }`).
- [x] 2.2 Add `src/production-spec/fixtures/brand-profile.zoho.yaml` — a well-formed two-Zoho-Brand
  fixture with DIFFERENT strings than the real Straw Motion config, so a test can prove genuine
  parameterization rather than a hardcoded read.
- [x] 2.3 Add `loadZohoConfig` tests: reads the fixture file; a missing file degrades to
  `not_configured` (never crashes); the REAL committed `data/brands/straw-motion/brand-profile.yaml`
  round-trips the real grouping (facebook/instagram/tiktok in the main file,
  linkedin/x in the second), the exact `LinkedInProfile` label (never `LinkedIn`), and both Zoho
  Brands sharing one timezone; the REAL committed `data/brands/mundotip/brand-profile.yaml` reads as
  `not_configured`, naming `"mundotip"`.
- [x] 2.4 Implement `ZohoChannelMapping`, `ZohoSocialBrand`, `ZohoConfigFound`,
  `ZohoConfigNotConfigured`, `ZohoConfigLookup`, `zohoConfigFrom(raw, brand)`, `loadZohoConfig(path,
  brand)` in `src/production-spec/brand-profile.ts`. Run 2.1/2.3: green.

## 3. Ship Straw Motion's real configuration

- [x] 3.1 Add the real `zoho:` block to `data/brands/straw-motion/brand-profile.yaml`: two Zoho Social
  Brands (main: facebook/instagram/tiktok, labels Facebook/Instagram/TikTok; second: linkedin/x,
  labels LinkedInProfile/X), both `timezone: "Europe/Berlin"` (CEST today).
- [x] 3.2 Confirm `data/brands/mundotip/brand-profile.yaml` is left untouched (no `zoho` key) — the
  AC3 "not configured" test case.

## 4. OpenSpec

- [x] 4.1 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and one spec delta: `production-spec` (ADDED Requirement — the Zoho config reader).
- [x] 4.2 `npx openspec validate issue-143-zoho-brand-config --strict` green.

## 5. Self-review

- [x] 5.1 `npm test` green (type-check + full suite; confirm the count grows from the pre-slice
  baseline with zero regressions).
- [x] 5.2 `npm run test:docs` green (unchanged — this slice adds no `.docs-test.ts`/Skill doc file).
- [x] 5.3 Simplify pass: confirm every issue #143 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm nothing about straw-motion is
  hardcoded in the reader itself (only in the committed YAML data); remove any dead code/unused
  import.
- [x] 5.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed), self-review notes, known limits (no cross-validation against the Brand's own `channel`
  list; MundoTip's real wiring deferred; CONTEXT.md glossary entry deferred).
