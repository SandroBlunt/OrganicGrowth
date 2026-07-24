## ADDED Requirements

### Requirement: A documented, per-platform CopyShape table extends the single per-Recipe CopyShape

The system SHALL provide a brand-agnostic, in-repo table of `PlatformCopyShape` bounds
(`src/copy/platform-shape.ts`) for the platforms named in issue #128 — `facebook`, `instagram`,
`linkedin`, `x`, `tiktok`, `youtube` — each declaring the base `CopyShape` fields (`maxChars`,
`minEmojis`, `maxEmojis`), a human-readable `description` citing the documented, standard platform
convention its bounds are based on, and `supportsMentions` (whether that platform's caption text uses a
typed inline `@Handle` mention, checked by `validateCopyForPlatform` below). `platformCopyShapeFor
(platform)` SHALL look this table up case- and whitespace-insensitively and SHALL return `null` — never
a fabricated bound — for a platform this table does not document (rule 8: never fabricate).
`resolveCopyShapeForPlatform(baseShape, platform)` SHALL "extend" a Recipe's own single `CopyShape`
(its `copyShape`, `src/recipe/registry.ts`) into a per-platform-aware one: it SHALL return the
platform's documented bounds when `platformCopyShapeFor` resolves one, and SHALL fall back to the
caller's own `baseShape`, UNCHANGED, for a platform this table does not document. Both functions SHALL
be pure — no I/O, no clock, never throw.

#### Scenario: Each of the six documented platforms resolves to its own, genuinely different bounds

- **GIVEN** the six platforms this table documents
- **WHEN** `platformCopyShapeFor(platform)` is called for each
- **THEN** each resolves to a non-null `PlatformCopyShape` naming that platform, with a positive
  `maxChars` and a non-empty `description`
- **AND** X's `maxChars` is materially smaller than LinkedIn's `maxChars` — proving the bounds are
  genuinely platform-specific, not one shared number

#### Scenario: An undocumented platform never fabricates bounds

- **GIVEN** a platform string this table does not document (e.g. `"mastodon"`), and separately a blank
  string
- **WHEN** `platformCopyShapeFor(platform)` is called
- **THEN** it returns `null` for each — no bound is invented

#### Scenario: resolveCopyShapeForPlatform extends a Recipe's own CopyShape, falling back when unknown

- **GIVEN** a Recipe's own base `CopyShape` (e.g. `{ maxChars: 180, minEmojis: 1, maxEmojis: 3 }`) and,
  separately, a known platform (`"x"`) and an undocumented one (`"mastodon"`)
- **WHEN** `resolveCopyShapeForPlatform(baseShape, platform)` is called for each
- **THEN** for the known platform it returns THAT platform's own documented bounds (different from
  `baseShape`)
- **AND** for the undocumented platform it returns `baseShape`, unchanged

### Requirement: validateCopy is unchanged; validateCopyForPlatform is a new, additive entry point

`validateCopy(copy, shape, rules)` (`src/copy/validate.ts`) SHALL remain byte-for-byte unchanged in
signature and behavior by this capability — every existing caller (`compose.ts`, `recipe/phase-
contract.ts`'s `auditCopyPhase`, both wired Recipes' own copy step) SHALL continue to call it with a
single `CopyShape` exactly as before, so the single-Channel production path is unaffected (issue #128
AC3). The system SHALL additionally provide `validateCopyForPlatform(copy, platform, baseShape, rules)`
— a NEW, additive function that resolves `platform`'s `CopyShape` via `resolveCopyShapeForPlatform`,
runs the SAME core checks `validateCopy` runs (length, emoji count, required CTA, required hashtags,
banned words, dash tells) against the resolved shape, and, ONLY when the resolved platform's own
`PlatformCopyShape` sets `supportsMentions: true` (today: `linkedin` alone), additionally scans the
caption for a malformed inline `@mention` via `scanAtHandleMentionSyntax`, appending a
`platform_mention_syntax` error for each violation found. `CopyValidationCode` SHALL gain this new
member, additively (a union widening — no exhaustive switch over it exists anywhere in the repo).

#### Scenario: The same caption validates differently against two different platforms' bounds

- **GIVEN** a caption between 280 and 3,000 characters long (too long for X, well within LinkedIn's
  cap), and a Recipe's own base `CopyShape`
- **WHEN** `validateCopyForPlatform(copy, "x", baseShape, rules)` and `validateCopyForPlatform(copy,
  "linkedin", baseShape, rules)` are both called
- **THEN** the `"x"` call reports `ok: false` with a `caption_length` error
- **AND** the `"linkedin"` call reports `ok: true`

#### Scenario: LinkedIn's inline @mention syntax check fires only for LinkedIn

- **GIVEN** a caption containing a malformed `@mention` (a dangling `@` immediately followed by
  whitespace)
- **WHEN** `validateCopyForPlatform` is called once with `platform: "linkedin"` and once with
  `platform: "x"`, both against the SAME text
- **THEN** the `"linkedin"` call reports a `platform_mention_syntax` error
- **AND** the `"x"` call does NOT report `platform_mention_syntax` — X's `PlatformCopyShape` does not
  set `supportsMentions`, so the check never runs there

#### Scenario: A well-formed @mention on LinkedIn passes the syntax check

- **GIVEN** a caption containing a well-formed inline mention (`@` immediately followed by a plausible
  handle, e.g. `"@Anthropic"`)
- **WHEN** `validateCopyForPlatform(copy, "linkedin", baseShape, rules)` is called
- **THEN** it does NOT report `platform_mention_syntax`

#### Scenario: The existing single-Channel wired-Recipe path is unchanged

- **GIVEN** a Brand configured with exactly ONE Channel (Facebook, `primary: true`) and the wired
  *Character Explainer with Cast* Recipe's own `copyShape` (`{ maxChars: 180, minEmojis: 1, maxEmojis:
  3 }`)
- **WHEN** a Copy is validated the way `compose.ts` already does — `validateCopy(copy, recipe.copyShape,
  rules)`, with no platform argument at all
- **THEN** the result is identical to the pre-#128 behavior: the 180-char bound is enforced exactly as
  before, and `platform-shape.ts`'s own (different) `facebook` table entry is never consulted
