## Why

Epic #120 asked for captions "optimized in tone, content, and length for each social media channel."
Issue #127 (merged) made a Brand's `channel` field a LIST of `{ platform, url?, primary? }` entries
(ADR-0019) — a Brand may now target several platforms, not just its one tracked `primary` Channel. Today
a Recipe still declares exactly ONE `CopyShape` (`src/recipe/registry.ts`'s `RecipeCopyShape` /
`src/copy/contract.ts`'s `CopyShape`: `{ maxChars, minEmojis, maxEmojis }`), and `validateCopy`
(`src/copy/validate.ts`) checks a caption against that ONE shared shape regardless of which platform it
will ship to. A caption that fits X's Facebook-length habits will overflow LinkedIn's professional
register or X's 280-character cap, and nothing in the codebase knows LinkedIn's inline `@mention` syntax
is different from plain text.

Issue #128 (this slice) builds ONLY the SHAPE and VALIDATION half of that: a documented, brand-agnostic
table of per-platform `CopyShape` bounds, and an extension to `validate.ts` that checks a caption against
a SPECIFIC platform's own bounds (length, emoji count, and — for LinkedIn — its inline `@mention` text
syntax) instead of one shared shape. Actually composing a DISTINCT caption per platform (`Copy`/
`CopyInput` carrying several variants, the `write-social-copy` Skill choosing per-platform wording) is
issue #129; resolving a LinkedIn mention to a real Page handle is issue #130 (built on the already-
shipped `src/linkedin-handle/` lookup, issue #126). Neither is built here.

## What Changes

- **New module `src/copy/platform-shape.ts`** — a brand-agnostic, in-repo table of documented
  `PlatformCopyShape` bounds (`CopyShape`'s `maxChars`/`minEmojis`/`maxEmojis` plus a platform name, a
  human `description` citing the convention it's based on, and `supportsMentions`) for the six platforms
  named in the issue: `facebook`, `instagram`, `linkedin`, `x`, `tiktok`, `youtube`. Values are
  documented, standard platform conventions (X's ~280-char cap, LinkedIn's ~3,000-char professional-tone
  cap, Instagram's 2,200-char cap — already the News Carousel Recipe's own `copyShape`, YouTube's
  long-form description room, TikTok's short/punchy practical caption length, Facebook's practical
  above-the-fold length) — Operator-configurable, not a hard science, exactly as the issue asks.
  `platformCopyShapeFor(platform)` looks it up case/whitespace-insensitively and returns `null` (never a
  fabricated bound) for a platform this table doesn't document. `resolveCopyShapeForPlatform(baseShape,
  platform)` "extends" a Recipe's own single `copyShape` into a per-platform-aware one: the platform's
  documented bounds when known, falling back to the caller's own `baseShape` otherwise (AC1).
- **Extend `src/copy/validate.ts`, additively.** `validateCopy` itself — the function `compose.ts` and
  both wired Recipes' own copy step already call — is UNCHANGED: same signature, same behavior, same
  tests, so the single-Channel path is byte-for-byte unaffected (AC3). A NEW function,
  `validateCopyForPlatform(copy, platform, baseShape, rules)`, resolves `platform`'s `CopyShape` via
  `resolveCopyShapeForPlatform`, runs the SAME core `validateCopy` checks against it, and — only when
  that platform's own shape sets `supportsMentions: true` (today: only `linkedin`) — additionally scans
  the caption for a malformed inline `@mention` via the new, pure `scanAtHandleMentionSyntax` (a dangling
  `@`, a doubled `@@`, or a token that isn't a plausible handle), reporting a new `platform_mention_syntax`
  error code. This checks caption TEXT SHAPE ONLY — it never resolves a name to a real LinkedIn Page
  handle (that lookup already exists at `src/linkedin-handle/`, wired up by the later issue #130).
- **Tests** cover: every one of the six documented platforms resolves to its own shape and none is
  fabricated for an unknown platform; a single-Channel Brand's existing wired-Recipe validation path is
  unchanged (AC3); a multi-Channel Brand (Straw Motion's own platform list) has the SAME caption validate
  differently against X's tight cap vs. LinkedIn's long-form cap (AC4, two different platform bounds);
  and LinkedIn's `@mention` syntax check fires only for LinkedIn, never for a platform that doesn't
  declare `supportsMentions`.

## Non-Goals (explicitly deferred / out of scope)

- **The Copy/CopyInput contract carrying multiple platform variants.** Issue #129. `Copy`
  (`src/copy/contract.ts`) stays exactly `{ caption, hashtags }`; nothing here adds a per-platform map of
  composed captions.
- **`write-social-copy` composing a distinct caption per platform.** Issue #129. The Skill/drafters
  (`draft.ts`) are untouched by this slice.
- **LinkedIn `@mention` insertion / resolving a company name to a real Page handle.** Issue #130. This
  slice's mention check is a pure TEXT-SYNTAX scan (well-formed vs malformed `@token`), never a lookup —
  it does not import or call `src/linkedin-handle/`.
- **Wiring `resolveCopyShapeForPlatform`/`validateCopyForPlatform` into `compose.ts` or the Recipe
  registry.** Both wired Recipes keep calling `validateCopy`/`composeCopy` with their own single
  `copyShape`, unchanged — that wiring is issue #129's job, once there is a multi-variant `Copy` to
  validate per platform.
- **Per-Channel performance tracking / baseline / ledger attribution.** ADR-0019 already scoped this to
  a future epic; untouched here.

## Capabilities

### Modified Capabilities

- `copy-composition`: gains a per-platform `CopyShape` bounds table and a platform-aware validation
  entry point, additive alongside the existing single-shape `validateCopy`/`composeCopy` path.

## Impact

- **Added:**
  - `src/copy/platform-shape.ts` (+ `src/copy/platform-shape.test.ts`)
  - `openspec/changes/128-per-channel-copyshape/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/128-per-channel-copyshape/specs/copy-composition/spec.md`
- **Modified:**
  - `src/copy/validate.ts` (+tests in `src/copy/validate.test.ts`) — new `platform_mention_syntax` code,
    new `scanAtHandleMentionSyntax` + `validateCopyForPlatform` exports; `validateCopy` itself unchanged.
- **Not touched:** `src/copy/contract.ts`, `src/copy/compose.ts`, `src/copy/draft.ts`,
  `src/copy/inject.ts`, `src/recipe/registry.ts`, `src/linkedin-handle/*`, any Brand Profile YAML,
  CONTEXT.md (already forward-references `#128`/`#129` in its Channel glossary entry, from ADR-0019's own
  authoring commit).
- **Hermetic:** no Space/MCP call anywhere in this diff — this slice is pure, deterministic data +
  validation logic (a table lookup and a regex-based text scan). The Magnific fake is not exercised
  because there is nothing to fake here.
- **Always-rules upheld:** generate-never-publish (no publish-path code touched); public-metrics-only /
  relative-not-absolute (no metrics/baseline code touched); explicit-attribution (no Post/`post_url` code
  touched); ledger-as-source-of-truth (no ledger-write path touched); never-fabricate
  (`platformCopyShapeFor` never invents bounds for a platform it doesn't document — returns `null`, and
  `resolveCopyShapeForPlatform` falls back to the caller's own real Recipe `copyShape` rather than a
  guess).
