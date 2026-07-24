## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #129 in full, plus parent epic #120, ADR-0019
  (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`), and confirm blockers #127/#128 are
  CLOSED/COMPLETED (`gh issue view 127 128 --json state,stateReason`).
- [x] 1.2 Read `src/copy/contract.ts`, `src/copy/compose.ts`, `src/copy/draft.ts`, `src/copy/inject.ts` —
  today's single-variant `Copy`/`composeCopy` pipeline (ADR-0012).
- [x] 1.3 Read `src/copy/platform-shape.ts` and `src/copy/validate.ts`'s `validateCopyForPlatform`
  (issue #128, merged) — the per-platform bounds/validation this slice wires into actual composition,
  including its documented rule that the two wired Recipes' PRIMARY Facebook Channel never consults the
  table's own `facebook` entry.
- [x] 1.4 Read `src/production-spec/brand-profile.ts`'s `Channel`/`channelsFrom`/`loadChannels`
  (issue #127, merged) and both real Brands' migrated `brand-profile.yaml` (Straw Motion: 5 platforms;
  MundoTip: 4) to confirm the "targeted = every Channel entry" reading against ADR-0019's own
  Consequences section and CONTEXT.md's Channel glossary entry.
- [x] 1.5 Read the ledger schema (`src/asset/asset.ts`'s `LedgerAssetRecord.copy`/`parseCopy`) and the
  output-bundle generator (`src/asset/output-bundle.ts`'s `generatePostJson`/`captionText`) — both need
  to carry/label multiple variants.
- [x] 1.6 Read `.claude/skills/write-social-copy/SKILL.md` and the relevant section of
  `.claude/agents/producer.md` — the instructions that need updating to compose one variant per
  targeted platform.
- [x] 1.7 Run `npm test` to capture the exact baseline pass count (1578 passing, 0 failing) and
  `npm run test:docs` (122 passing, 0 failing) before any change.

## 2. `src/copy/contract.ts` — additive Copy.variants shape

- [x] 2.1 Add `CopyVariant` (`{ platform, caption, hashtags }`) and `Copy.variants?: readonly
  CopyVariant[]`, optional, additive. `caption`/`hashtags` stay required and unchanged in meaning.

## 3. `src/copy/compose.ts` — composeCopyForChannels (test-first)

- [x] 3.1 Add tests to `src/copy/compose.test.ts` FIRST (failing): a single-(primary)-Channel Brand's
  `composeCopyForChannels` result is deep-equal to `composeCopy`'s own result, with NO `variants` field
  (AC1/AC5); a zero-Channel Brand degrades the same way; a multi-Channel Brand (Straw Motion's own
  5-platform list) composes one labeled variant per platform, top-level `caption`/`hashtags` mirror the
  primary; the primary's variant uses the Recipe's OWN `copyShape` (never the table's `facebook`
  entry); each non-primary variant is checked against ITS OWN platform bounds; every targeted
  platform's failures are collected (never stops at the first) and no Copy is ever partially applied; a
  malformed LinkedIn `@mention` fails only the LinkedIn variant; an undocumented platform falls back to
  the Recipe's own `baseShape`; the Brand's required CTA/hashtags are injected into every variant.
- [x] 3.2 Implement `composeCopyForChannels(input, baseShape, channels, options)` in `compose.ts`:
  per-Channel loop, primary keeps `baseShape` + `validateCopy`, non-primary resolves
  `resolveCopyShapeForPlatform` + `validateCopyForPlatform`; collects all failures; returns a `Copy`
  with no `variants` field for <=1 Channel, else `variants` covering every targeted platform including
  the primary. `composeCopy` itself is NOT modified (same signature, same body). Run 3.1: green.

## 4. `src/asset/asset.ts` — parseCopy carries variants defensively (test-first)

- [x] 4.1 Add tests to `src/asset/asset.test.ts` FIRST (failing): `parseCopy` with no `variants` key
  parses to the exact pre-#129 shape; well-formed variants parse verbatim; a malformed variant entry is
  dropped, well-formed siblings kept; `variants` present but entirely malformed (or non-array) degrades
  to the plain shape; `parseCopyVariant`/`parseCopyVariants` parse/drop defensively on their own.
- [x] 4.2 Implement `parseCopyVariant`/`parseCopyVariants` and extend `parseCopy` to include `variants`
  only when at least one entry parses. Run 4.1: green.

## 5. `src/asset/output-bundle.ts` — generatePostJson + captionText carry/render variants (test-first)

- [x] 5.1 Add tests to `src/asset/output-bundle.test.ts` FIRST (failing): `generatePostJson` carries
  `copy.variants` onto `post.json` unchanged, deep-cloned (never a shared reference); a Copy with no
  `variants` yields a `post.json` copy with no `variants` key (AC5); `captionText` renders every
  variant, each headed by `=== PLATFORM ===`, separated cleanly; an empty/absent `variants` array
  renders BYTE-IDENTICAL text to before this slice (checked against the EXACT pre-existing byte
  strings); a full produce-flow (`writeAsset` -> `refreshPostJson` + `writeCaptionText`) round-trips a
  multi-variant Copy into both `post.json` and a labeled `caption.txt`.
- [x] 5.2 Implement: `cloneCopy` helper (deep-clones `variants` too); `generatePostJson`'s `copy` field
  uses it; `captionText` renders every variant when present, unchanged single-block rendering
  otherwise (shared `renderCaptionBlock` helper so the two paths can never drift). Run 5.1: green.

## 6. Skill + agent doc updates (test-first via docs-test)

- [x] 6.1 Add new pinned assertions to `src/copy/write-social-copy-skill.docs-test.ts` FIRST (failing):
  names `channelsFrom`/`loadChannels` and reading the FULL Channel list; instructs a distinct caption
  per targeted platform, never one shared caption; names `validateCopyForPlatform`/
  `resolveCopyShapeForPlatform`/`composeCopyForChannels`; names `Copy.variants` and states a
  single-Channel Brand's saved Copy carries no `variants` field; defers LinkedIn `@mention` resolution
  to issue #130.
- [x] 6.2 Update `.claude/skills/write-social-copy/SKILL.md`: new Input item for the Brand's full
  Channel list; Step 1 drafts one variant per targeted platform; Step 2 checks each variant against its
  own platform's bounds; completion criterion covers every targeted variant; "what this Skill does not
  do" gains the LinkedIn-mention-resolution and no-Channel-tracking notes. Run 6.1: green.
- [x] 6.3 Add new pinned assertions to `src/production-spec/producer-agent.docs-test.ts` FIRST
  (failing), mirroring 6.1's phrasing for the Copy-phase section of `producer.md`.
- [x] 6.4 Update `.claude/agents/producer.md`'s Copy-phase + output-bundle prose to match. Run 6.3:
  green. Re-run the FULL `npm run test:docs` suite to confirm every pre-existing pinned assertion in
  both files still passes (no regression from the doc edits).

## 7. CONTEXT.md

- [x] 7.1 Update the **Copy** glossary entry: one Copy per Asset, holding one variant per targeted
  Channel platform when the Brand targets more than one (`#129`); a single-Channel Brand still gets
  exactly the one caption it always has. No new term coined.

## 8. OpenSpec

- [x] 8.1 `grep -n "^### Requirement" openspec/specs/*/spec.md` to confirm every new requirement title
  below does not already exist verbatim (ADDED, never MODIFIED, for all of them).
- [x] 8.2 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and ADDED-Requirement spec deltas for `copy-composition`, `asset-store`,
  `asset-output-bundle`, and `producer-conductor`.
- [x] 8.3 `npx openspec validate 129-per-channel-copy-variants --strict` green.

## 9. Self-review

- [x] 9.1 `npm test` green (type-check + full suite; confirm the count grows from the 1578 baseline
  with zero regressions).
- [x] 9.2 `npm run test:docs` green (confirm the count grows from the 122 baseline with zero
  regressions).
- [x] 9.3 Simplify pass: confirm every issue #129 acceptance criterion maps to a named, passing test;
  confirm `composeCopy`'s signature/body is byte-for-byte unchanged; confirm no `spaces_*`/`creations_*`
  call anywhere in the diff; remove any dead code/unused import.
- [x] 9.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice has no Space/MCP code), self-review notes, known limits (issue #130
  deliberately not started).
