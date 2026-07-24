## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #128 in full, plus parent epic #120 and ADR-0019
  (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`) — confirm blocker #127 is
  CLOSED/COMPLETED (`gh issue view 127 --json state,stateReason`).
- [x] 1.2 Read `src/copy/contract.ts`, `src/copy/validate.ts`, and `src/recipe/registry.ts` in full —
  today's single-`CopyShape`-per-Recipe model: `CopyShape { maxChars, minEmojis, maxEmojis }`,
  `validateCopy(copy, shape, rules)`, and each wired Recipe's own `copyShape` (Character Explainer:
  180/1-3; News Carousel: 2200/0-2).
- [x] 1.3 Read `src/production-spec/brand-profile.ts`'s `Channel`/`channelsFrom`/`primaryChannelFrom`
  (issue #127, merged) — a Brand's `channel` field is a LIST of `{ platform, url?, primary? }`, keyed
  by a free-string `platform`.
- [x] 1.4 Check for an exhaustive `switch`/`never` over `CopyValidationCode` anywhere in the repo
  (`grep -rn "CopyValidationCode" src`) — confirm widening the union with a new error code is safe
  (no call site breaks).
- [x] 1.5 Confirm `src/recipe/phase-contract.ts`'s `auditCopyPhase` calls `validateCopy` with its
  existing signature — confirm this slice must NOT change that signature.
- [x] 1.6 Run `npm test` to capture the exact baseline pass count (1564 passing, 0 failing) before any
  change.

## 2. `src/copy/platform-shape.ts` — the per-platform CopyShape table (test-first)

- [x] 2.1 Add `src/copy/platform-shape.test.ts` FIRST (failing): `platformCopyShapeFor` resolves each
  of the six documented platforms (`facebook`, `instagram`, `linkedin`, `x`, `tiktok`, `youtube`) to
  its own shape; is case/whitespace-insensitive; returns `null` for an undocumented platform (never
  fabricates bounds); X's cap is materially tighter than LinkedIn's (genuinely different bounds, AC1);
  only `linkedin` sets `supportsMentions: true` today. `resolveCopyShapeForPlatform` returns the
  platform's bounds when known and falls back to the caller's `baseShape` otherwise.
- [x] 2.2 Implement `PlatformCopyShape`, the six-entry documented table, `platformCopyShapeFor`,
  `resolveCopyShapeForPlatform`, and `listPlatformCopyShapes` in `src/copy/platform-shape.ts`. Pure,
  no I/O. Run 2.1: green.

## 3. `src/copy/validate.ts` — platform-aware validation, additive (test-first)

- [x] 3.1 Add tests to `src/copy/validate.test.ts` FIRST (failing): `scanAtHandleMentionSyntax` flags
  a dangling `@` (immediately followed by whitespace or end-of-string), a doubled `@@`, and an
  implausible handle token; accepts a well-formed `@Handle` and leaves an embedded email's `@` alone.
  `validateCopyForPlatform` runs the SAME length/emoji/CTA/hashtag/banned-word/dash checks as
  `validateCopy` for the resolved platform shape; adds `platform_mention_syntax` only for a platform
  with `supportsMentions: true` (LinkedIn) and only on a genuine syntax violation; never runs the
  mention check for a platform without it (e.g. X) even on the identical malformed text.
- [x] 3.2 Add `"platform_mention_syntax"` to `CopyValidationCode`; implement
  `scanAtHandleMentionSyntax` and `validateCopyForPlatform` in `src/copy/validate.ts`, importing
  `platformCopyShapeFor`/`resolveCopyShapeForPlatform` from `./platform-shape.ts`. `validateCopy`
  itself is NOT modified — same signature, same body. Run 3.1: green.

## 4. AC3/AC4 — single-Channel unchanged, multi-Channel two-bounds proof (test-first)

- [x] 4.1 Add tests (in `src/copy/platform-shape.test.ts`) demonstrating AC3: a Brand configured with
  exactly ONE Channel (`channelsFrom` against a single-entry, Facebook-primary list) validates the
  wired *Character Explainer with Cast* Recipe's own `copyShape` via the EXISTING `validateCopy` call
  exactly as before (180-char cap still enforced) — this table's own, different `facebook` entry is
  never consulted on that path.
- [x] 4.2 Add tests demonstrating AC4: a multi-Channel Brand (Straw Motion's own platform list —
  facebook/instagram/linkedin/x/tiktok, via `channelsFrom`) validates the SAME caption differently for
  `x` (280-char cap — rejected) vs. `linkedin` (3,000-char cap — accepted); a malformed `@mention`
  fails on `linkedin` but is not flagged on `x`; a well-formed `@mention` passes on `linkedin`.
- [x] 4.3 Run 4.1/4.2: green.

## 5. OpenSpec

- [x] 5.1 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this
  `tasks.md`, and a `copy-composition` spec delta (MODIFIED Requirement — the per-platform CopyShape
  table + platform-aware validation).
- [x] 5.2 `npx openspec validate 128-per-channel-copyshape --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite; confirm the count grows from the 1564 baseline
  with zero regressions).
- [x] 6.2 `npm run test:docs` green (unchanged — this slice adds no `.docs-test.ts`/Skill doc file).
- [x] 6.3 Simplify pass: confirm every issue #128 acceptance criterion maps to a named, passing test;
  confirm `validateCopy`'s signature/body is byte-for-byte unchanged (`git diff` on the hunk); confirm
  no `spaces_*`/`creations_*` call anywhere in the diff; remove any dead code/unused import.
- [x] 6.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice has no Space/MCP code), self-review notes, known limits (issue #129/#130
  deliberately not started).
