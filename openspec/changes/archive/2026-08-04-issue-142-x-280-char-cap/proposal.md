## Why

Issue #140 (Schedule Batch, parent) documents a LIVE failure: a 318-character X Copy variant — whose
caption ALONE was within X's 280-char cap, but whose caption PLUS hashtags combined was not — passed
`composeCopyForChannels` and was only rejected at Zoho's bulk-upload step. `src/copy/validate.ts`'s
`caption_length` check (run by both `validateCopy` and `validateCopyForPlatform`) only ever measures
`caption` on its own; nothing in the copy step accounts for X's own convention that its 280-char cap
covers the WHOLE tweet — caption and hashtags together, since X's compose box has no separate hashtags
field the way Instagram's does. `src/copy/platform-shape.ts`'s per-platform `PlatformCopyShape` table
(issue #128) has no field distinguishing "this platform's cap is caption-alone" from "this platform's
cap is caption-plus-hashtags" at all.

Issue #142 (this slice) closes that gap: an unpostable X Copy variant must fail LOUDLY at composition
time — naming the platform and the overage — never silently reach the (separate, later) Schedule Batch
export or Zoho's own upload step. This is a bug-fix scoped narrowly to the copy step
(`src/copy/validate.ts`/`platform-shape.ts`/`compose.ts`); the Schedule Batch export itself (CSV
generation, S3 hosting, scheduling) is out of scope — issue #140's other user stories, tracked
separately.

## What Changes

- **`src/copy/platform-shape.ts`** — `PlatformCopyShape` gains a new documented field,
  `capIncludesHashtags: boolean`: `true` for X (the one platform whose 280-char cap counts hashtags
  against the same budget), `false` for every other documented platform (Facebook, Instagram, LinkedIn,
  TikTok, YouTube — each of whose cap conventions apply to the caption alone). Never fabricated —
  documented per-platform, mirroring how `supportsMentions` is already modeled.
- **`src/copy/validate.ts`** — a new, pure, exported function `checkCombinedCaptionHashtagsCap(copy,
  platform)`: for a platform whose `PlatformCopyShape` declares `capIncludesHashtags: true`, measures
  `caption` + a separating space + `hashtags` space-joined against that platform's own `maxChars`, and
  reports a new `caption_hashtags_length` error (naming the platform and the exact character overage)
  when it is exceeded. Returns `null` for every other platform, for a compliant combined length, and for
  a malformed/non-object `copy` (already reported separately by `validateCopy`'s own `not_an_object`/
  `caption_missing`). `CopyValidationCode` gains this new member, additively. `validateCopyForPlatform`
  now ALSO runs this check (alongside its existing length/emoji/required-parts/banned-word/dash/mention
  checks) for every platform it validates.
- **`src/copy/compose.ts`** — `composeCopyForChannels`'s PRIMARY-Channel branch (which validates against
  the chosen Recipe's own `baseShape`, never `platform-shape.ts`'s table, per issue #128 AC3) now ALSO
  runs `checkCombinedCaptionHashtagsCap` directly against that Channel's `platform`, merging any failure
  into that Channel's validation result. This makes the fix apply **whether X is the primary Channel or
  a non-primary one** (the issue's own explicit requirement) — the non-primary branch already gets the
  check for free through `validateCopyForPlatform`.
- **Docs kept in sync** — `.claude/skills/write-social-copy/SKILL.md` and `.claude/agents/producer.md`
  each gain a short note documenting the new combined-cap check (name, trigger, and the "regardless of
  primary" rule), pinned by additive assertions in their existing `.docs-test.ts` suites.
- **Tests** cover: the exact 318-character live-failure case as a named regression test (caption alone
  within 280, combined over, failing with `caption_hashtags_length` naming the platform and the
  overage); a compliant X variant still passing unchanged; X as the PRIMARY Channel still failing on the
  combined cap even though the caption alone fits the Recipe's own (unrelated) `copyShape`; and every
  other platform's own bounds being completely unaffected by the identical over-280-combined caption
  (Instagram/LinkedIn/Facebook/TikTok never report `caption_hashtags_length`).

## Non-Goals (explicitly deferred / out of scope)

- **The Schedule Batch export itself** (CSV generation, S3 media hosting, scheduling, the export's own
  re-check naming the Asset) — issue #140's other, separate user stories/tickets. This slice only closes
  the composition-time gap the export would otherwise re-discover at upload time.
- **Any other platform's cap ever including hashtags.** `capIncludesHashtags` is `false` for every
  documented platform except X — no other platform's behavior changes.
- **Redefining what "caption alone" measures for the primary Channel.** The primary Channel's
  length/emoji bounds still come from the Recipe's own `copyShape`, unchanged (issue #128 AC3) — this
  slice adds an ADDITIONAL, independent check, it does not touch which shape governs the existing
  caption-alone/emoji checks.

## Capabilities

### Modified Capabilities

- `copy-composition`: X's documented `PlatformCopyShape` gains `capIncludesHashtags: true`, and the
  copy-validation checkers (`validateCopyForPlatform`, `composeCopyForChannels`'s primary-Channel
  branch) enforce a combined caption+hashtags cap for any platform that declares it, regardless of
  primary/non-primary status.

## Impact

- **Added:**
  - `openspec/changes/issue-142-x-280-char-cap/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/issue-142-x-280-char-cap/specs/copy-composition/spec.md`
- **Modified:**
  - `src/copy/platform-shape.ts` (+ tests in `src/copy/platform-shape.test.ts`) — new
    `capIncludesHashtags` field on `PlatformCopyShape`, `true` for X, `false` for the other five.
  - `src/copy/validate.ts` (+ tests in `src/copy/validate.test.ts`) — new `caption_hashtags_length` code,
    new `checkCombinedCaptionHashtagsCap` export; `validateCopyForPlatform` now also runs it.
    `validateCopy` itself untouched.
  - `src/copy/compose.ts` (+ tests in `src/copy/compose.test.ts`) — `composeCopyForChannels`'s primary
    branch now also runs `checkCombinedCaptionHashtagsCap`.
  - `.claude/skills/write-social-copy/SKILL.md` (+ assertions in
    `src/copy/write-social-copy-skill.docs-test.ts`).
  - `.claude/agents/producer.md` (+ assertions in `src/production-spec/producer-agent.docs-test.ts`).
- **Not touched:** `src/copy/contract.ts`, `src/copy/draft.ts`, `src/copy/inject.ts`,
  `src/recipe/registry.ts`, any Brand Profile YAML, the Schedule Batch export (not yet built).
- **Hermetic:** no Space/MCP call anywhere in this diff — this slice is pure, deterministic data +
  validation logic (a table lookup, a length count, an error-merge). No `spaces_*`/`creations_*` call,
  no credits, no board mutation; the fake Magnific Space is not exercised because there is nothing to
  fake here — this slice touches no Space-driving code at all.
- **Always-rules upheld:** generate-never-publish (no publish-path code touched — this makes an
  unpostable Copy fail EARLIER, at composition, never publishes anything itself); public-metrics-only /
  relative-not-absolute (no metrics/baseline code touched); explicit-attribution (no Post/`post_url`
  code touched); ledger-as-source-of-truth (no ledger-write path touched); never-fabricate (the new
  `capIncludesHashtags` field is documented per-platform, defaulting `false` — never invented for a
  platform whose real convention is unknown; `checkCombinedCaptionHashtagsCap` returns `null`, never a
  fabricated pass/fail, for an undocumented platform).
