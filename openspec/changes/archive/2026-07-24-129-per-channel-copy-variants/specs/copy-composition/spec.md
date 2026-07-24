## ADDED Requirements

### Requirement: Copy carries an optional per-platform variants field, additive to the single caption/hashtags shape

The system SHALL extend `Copy` (`src/copy/contract.ts`) with an OPTIONAL `variants?: readonly
CopyVariant[]` field, where `CopyVariant` is `{ platform: string, caption: string, hashtags: readonly
string[] }`. `Copy.caption`/`Copy.hashtags` SHALL remain required and, when `variants` is present, SHALL
mirror the PRIMARY Channel's own variant — so every existing single-variant consumer (`validateCopy`,
the output bundle, `/log-post`'s surfaced Copy) keeps working unmodified on the top-level fields alone.
A Copy composed for a Brand with exactly one Channel SHALL carry NO `variants` field at all — the exact
shape `Copy` had before this capability.

#### Scenario: A single-Channel Copy has no variants field

- **GIVEN** a Brand configured for exactly one Channel
- **WHEN** its Copy is composed
- **THEN** the resulting `Copy` has only `caption` and `hashtags` — no `variants` key at all

#### Scenario: A multi-Channel Copy's top-level fields mirror the primary variant

- **GIVEN** a Brand configured for more than one Channel, one marked `primary`
- **WHEN** its Copy is composed
- **THEN** `copy.caption`/`copy.hashtags` equal the PRIMARY Channel's own entry in `copy.variants`

### Requirement: composeCopyForChannels composes one variant per targeted Channel platform, from the same underlying material

The system SHALL provide `composeCopyForChannels(input, baseShape, channels, options)`
(`src/copy/compose.ts`), composing ONE `CopyVariant` per entry in `channels` (the Brand's FULL Channel
list — `src/production-spec/brand-profile.ts`'s `channelsFrom`/`loadChannels`, every entry's `platform`,
not just the primary), from the SAME `CopyInput` material for every platform. The PRIMARY Channel's
variant SHALL be drafted and validated against `baseShape` (the chosen Recipe's own `copyShape`) via the
SAME `validateCopy` check `composeCopy` already uses — NEVER `platform-shape.ts`'s own per-platform
bounds table, even when other Channels are also targeted. Every OTHER (non-primary) targeted Channel's
variant SHALL be drafted and validated against its own documented bounds via
`resolveCopyShapeForPlatform`/`validateCopyForPlatform` (issue #128), falling back to `baseShape` for a
platform `platform-shape.ts` does not document — never fabricating a bound (rule 8). The Brand's
required CTA/hashtags SHALL be injected into EVERY variant via `injectRequiredParts`, exactly as
`composeCopy` already does for its single variant. `composeCopy` itself SHALL remain byte-for-byte
unchanged (same signature, same body) — every existing caller keeps calling it exactly as before. A
Brand with NO Channel configured at all SHALL degrade to the exact single, unlabeled compose
`composeCopy` already performs — never crash (data-handling rule 4). A Brand with EXACTLY ONE Channel
SHALL produce a result identical to calling `composeCopy` directly with the same `baseShape` (AC1/AC5).
Every targeted platform's validation failures SHALL be collected (never stopping at the first) and a
partially-valid set of variants SHALL NEVER be surfaced — only a fully valid `Copy` is ever returned,
mirroring `composeCopy`'s own all-or-nothing contract.

#### Scenario: A single-(primary)-Channel Brand's result is identical to composeCopy's own result

- **GIVEN** a Brand configured for exactly one Channel, marked `primary`, and a Recipe's own
  `copyShape`
- **WHEN** `composeCopyForChannels(input, baseShape, [thatChannel], options)` and `composeCopy(input,
  baseShape, options)` are both called with the same `input`/`baseShape`/`options`
- **THEN** the two results are deep-equal

#### Scenario: A multi-Channel Brand composes one labeled variant per targeted platform

- **GIVEN** a Brand configured for Straw Motion's own 5-platform Channel list (facebook primary,
  instagram, linkedin, x, tiktok)
- **WHEN** `composeCopyForChannels` is called
- **THEN** the result's `copy.variants` has exactly 5 entries, one per platform, each labeled by its
  own `platform`

#### Scenario: The primary Channel's variant never consults platform-shape.ts's own bounds

- **GIVEN** the same 5-platform Brand and the wired Character Explainer with Cast Recipe's own
  `copyShape` (180 chars, 1-3 emoji)
- **WHEN** a title long enough to overflow 180 chars but well within `platform-shape.ts`'s own
  `facebook` entry (477 chars) is composed
- **THEN** the primary (facebook) variant is truncated to the Recipe's own 180-char cap and carries at
  least 1 emoji — proving the table's own, looser `facebook` bound was never consulted

#### Scenario: Each non-primary variant is validated against its own platform's bounds

- **GIVEN** the same 5-platform Brand and a caption long enough to overflow X's 280-char cap but well
  within LinkedIn's 3,000-char cap
- **WHEN** `composeCopyForChannels` is called
- **THEN** the X variant is truncated to at most 280 characters and the LinkedIn variant is materially
  longer, genuinely different caps enforced on the same underlying material

#### Scenario: Every targeted platform's failures are collected; a partially-valid Copy is never surfaced

- **GIVEN** a drafter whose fixed output is simultaneously too long for the primary Channel's own
  `copyShape`, for X, and for TikTok, but within bounds for Instagram and LinkedIn
- **WHEN** `composeCopyForChannels` is called
- **THEN** the result is `ok: false` with failures for exactly the primary/X/TikTok platforms (never
  stopping at the first) and `copy` is `undefined` — no partially-valid Copy is ever returned

#### Scenario: A malformed LinkedIn @mention fails only the LinkedIn variant

- **GIVEN** a fixed caption containing a malformed inline `@mention` (a dangling `@`)
- **WHEN** `composeCopyForChannels` is called across the 5-platform Brand
- **THEN** the result fails with exactly one platform failure, `"linkedin"`, carrying a
  `platform_mention_syntax` error — every other platform's variant is unaffected by the identical text

#### Scenario: An undocumented platform falls back to the Recipe's own baseShape, never fabricating a bound

- **GIVEN** a Channel list naming a platform `platform-shape.ts` does not document (e.g. `"mastodon"`)
  alongside the primary
- **WHEN** `composeCopyForChannels` is called
- **THEN** that platform's variant is composed and validated against the Recipe's own `baseShape`,
  identically to what `composeCopy` alone would produce for that shape — never an invented bound

### Requirement: write-social-copy documents composing one Copy variant per targeted platform

`.claude/skills/write-social-copy/SKILL.md` SHALL document reading the Brand's FULL Channel list
(`channelsFrom`/`loadChannels`, ADR-0019) before drafting, and — when it targets more than one platform
— drafting a DISTINCT caption per targeted platform from the same produced material (never one shared
caption reused everywhere), checking the primary Channel's variant with `validateCopy` and every other
targeted platform's variant with `validateCopyForPlatform`/`resolveCopyShapeForPlatform`. It SHALL
state that a single-Channel Brand's instructions are unchanged (one caption, as before), that the saved
Copy carries `variants` (`src/copy/contract.ts`'s `Copy.variants`) only when more than one platform was
targeted, and that it does NOT resolve or insert a LinkedIn `@mention` to a real Page handle (issue
#130, a separate lookup).

#### Scenario: The Skill instructs one distinct caption per targeted platform

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it instructs drafting a DISTINCT caption for each targeted platform from the same produced
  material, and explicitly states this is never one shared caption reused everywhere

#### Scenario: The Skill defers LinkedIn @mention resolution to issue #130

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it names issue #130 and states it never resolves or inserts a LinkedIn handle, referencing
  the separate `src/linkedin-handle/` lookup
