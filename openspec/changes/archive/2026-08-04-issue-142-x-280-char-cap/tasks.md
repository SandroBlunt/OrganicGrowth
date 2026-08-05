## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #142 in full, plus parent issue #140 (Schedule Batch spec, user stories 28/29 and
  the "X caption hard cap" Implementation Decision) — confirm "Blocked by: None" (no blocker to check).
- [x] 1.2 Read `src/copy/platform-shape.ts` (issue #128's per-platform `PlatformCopyShape` table),
  `src/copy/validate.ts` (`validateCopy`/`validateCopyForPlatform`), and `src/copy/compose.ts`
  (`composeCopyForChannels`, issue #129) in full — confirmed the live bug: `caption_length` only ever
  measures `caption` alone, never `caption + hashtags` combined, for any platform including X.
- [x] 1.3 Confirmed X is not currently any Brand's primary Channel (`grep` on
  `data/brands/*/brand-profile.yaml` — both Brands' primary is `facebook`), but the issue's own text
  ("whether X is the primary or a non-primary Channel") requires the fix to be correct in both cases,
  not just today's actual configuration.
- [x] 1.4 Checked for an exhaustive `switch`/`never` over `CopyValidationCode` anywhere in the repo —
  none found; widening the union with a new `caption_hashtags_length` member is safe.
- [x] 1.5 Ran `npm test` to capture the exact baseline pass count (1639 passing, 0 failing, 431 suites)
  before any change.

## 2. `src/copy/platform-shape.ts` — capIncludesHashtags, documented per platform (test-first)

- [x] 2.1 Added a test to `src/copy/platform-shape.test.ts` FIRST (failing): exactly one documented
  platform (`x`) declares `capIncludesHashtags: true`; every other platform declares it `false`.
- [x] 2.2 Added `capIncludesHashtags: boolean` to the `PlatformCopyShape` interface and every table
  entry (`true` for `x`, `false` for the other five), with a documented rationale (X's compose box has
  no separate hashtags field the way Instagram's does; the live 318-char failure). Run 2.1: green.

## 3. `src/copy/validate.ts` — checkCombinedCaptionHashtagsCap, wired into validateCopyForPlatform (test-first)

- [x] 3.1 Added tests to `src/copy/validate.test.ts` FIRST (failing):
  `checkCombinedCaptionHashtagsCap` reproduces the EXACT 318-character live-failure case (caption alone
  at X's 280-char cap, one hashtag pushing the combined total to 318) and reports
  `caption_hashtags_length` naming the platform and the 38-char overage; a compliant X variant passes;
  the same over-280-combined Copy is unaffected for Instagram/LinkedIn/Facebook/TikTok
  (`capIncludesHashtags: false` there); an undocumented platform and a malformed `copy` value both
  return `null`, never throwing or fabricating a bound. `validateCopyForPlatform` fails an X variant on
  the combined check even when the caption alone passes X's own 280-char shape, and leaves
  Instagram/LinkedIn unaffected by the identical text.
- [x] 3.2 Added `"caption_hashtags_length"` to `CopyValidationCode`; implemented
  `combinedCaptionHashtagsLength`/`checkCombinedCaptionHashtagsCap` (pure, defensive, no I/O) and wired
  it into `validateCopyForPlatform` alongside the existing mention-syntax check. `validateCopy` itself
  is NOT modified — same signature, same body, same tests. Run 3.1: green.

## 4. `src/copy/compose.ts` — the combined cap applies to a PRIMARY X Channel too (test-first)

- [x] 4.1 Added tests to `src/copy/compose.test.ts` FIRST (failing): a non-primary X variant fails the
  combined cap (naming the platform + the 318 combined length) inside `composeCopyForChannels`; an X
  Channel marked `primary: true` ALSO fails the combined cap even though the caption alone is well
  within the primary Recipe's own (unrelated) `copyShape` — proving the primary/non-primary branch
  split (issue #128 AC3) never skips this check; a compliant X variant still passes; every other
  targeted platform never reports `caption_hashtags_length` for the identical over-280-combined text.
- [x] 4.2 Wired `checkCombinedCaptionHashtagsCap` into `composeCopyForChannels`'s primary-Channel
  branch (merged into that branch's own validation result), alongside the pre-existing
  `validateCopyForPlatform` call already covering the non-primary branch. Run 4.1: green.

## 5. Docs kept in sync

- [x] 5.1 Added a short note to `.claude/skills/write-social-copy/SKILL.md`'s per-platform check step
  naming `checkCombinedCaptionHashtagsCap`/`capIncludesHashtags`/`caption_hashtags_length` and the
  "regardless of primary" rule; pinned by new assertions in
  `src/copy/write-social-copy-skill.docs-test.ts`.
- [x] 5.2 Added the same short note to `.claude/agents/producer.md`'s Copy-phase step 4; pinned by a
  new assertion in `src/production-spec/producer-agent.docs-test.ts`.
- [x] 5.3 Ran `npm run test:docs`: green (both new doc assertions pass, nothing else regressed).

## 6. OpenSpec

- [x] 6.1 Authored `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and a `copy-composition` spec delta (MODIFIED Requirement covering the platform table's
  new field and the platform-aware validators' new check).
- [x] 6.2 `npx openspec validate issue-142-x-280-char-cap --strict` green.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite; grew from the 1639 baseline to 1654 passing, zero
  regressions, zero failures).
- [x] 7.2 `npm run test:docs` green.
- [x] 7.3 Simplify pass: confirmed all three AC map to named, passing tests (see the Build Report);
  confirmed `validateCopy`'s signature/body is byte-for-byte unchanged; confirmed no `spaces_*`/
  `creations_*` call anywhere in the diff (this slice touches no Space-driving code at all); removed no
  dead code (none was introduced) and kept the new check as one small, pure, independently-testable
  function rather than duplicating logic inside `validateCopy`/`validateCopyForPlatform`/`compose.ts`.
- [x] 7.4 Wrote the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice has no Space/MCP code at all), self-review notes, known limits (the Schedule
  Batch export itself is a separate, later slice).
