## MODIFIED Requirements

### Requirement: A documented, per-platform CopyShape table extends the single per-Recipe CopyShape

The system SHALL provide a brand-agnostic, in-repo table of `PlatformCopyShape` bounds
(`src/copy/platform-shape.ts`) for the platforms named in issue #128 — `facebook`, `instagram`,
`linkedin`, `x`, `tiktok`, `youtube` — each declaring the base `CopyShape` fields (`maxChars`,
`minEmojis`, `maxEmojis`), a human-readable `description` citing the documented, standard platform
convention its bounds are based on, `supportsMentions` (whether that platform's caption text uses a
typed inline `@Handle` mention, checked by `validateCopyForPlatform` below), and `capIncludesHashtags`
(issue #142 — whether that platform's `maxChars` cap applies to `caption` PLUS `hashtags` together
rather than `caption` alone). `platformCopyShapeFor(platform)` SHALL look this table up case- and
whitespace-insensitively and SHALL return `null` — never a fabricated bound — for a platform this table
does not document (rule 8: never fabricate). `resolveCopyShapeForPlatform(baseShape, platform)` SHALL
"extend" a Recipe's own single `CopyShape` (its `copyShape`, `src/recipe/registry.ts`) into a
per-platform-aware one: it SHALL return the platform's documented bounds when `platformCopyShapeFor`
resolves one, and SHALL fall back to the caller's own `baseShape`, UNCHANGED, for a platform this table
does not document. Both functions SHALL be pure — no I/O, no clock, never throw.

`capIncludesHashtags` SHALL be `true` for exactly ONE documented platform, `x` — X's compose box has no
separate hashtags field the way Instagram's does, so its 280-char cap covers the whole tweet, caption
and hashtags together. Every other documented platform (`facebook`, `instagram`, `linkedin`, `tiktok`,
`youtube`) SHALL declare `capIncludesHashtags: false` — their own `maxChars` continues to apply to
`caption` alone, exactly as before this field existed.

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

#### Scenario: Only X declares capIncludesHashtags (issue #142)

- **GIVEN** the six platforms this table documents
- **WHEN** each is inspected for `capIncludesHashtags`
- **THEN** exactly one — `x` — declares it `true`; every other platform declares it `false`

### Requirement: validateCopy is unchanged; validateCopyForPlatform is a new, additive entry point

`validateCopy(copy, shape, rules)` (`src/copy/validate.ts`) SHALL remain byte-for-byte unchanged in
signature and behavior by this capability — every existing caller (`compose.ts`, `recipe/phase-
contract.ts`'s `auditCopyPhase`, both wired Recipes' own copy step) SHALL continue to call it with a
single `CopyShape` exactly as before, so the single-Channel production path is unaffected (issue #128
AC3). The system SHALL additionally provide `validateCopyForPlatform(copy, platform, baseShape, rules)`
— a NEW, additive function that resolves `platform`'s `CopyShape` via `resolveCopyShapeForPlatform`,
runs the SAME core checks `validateCopy` runs (length, emoji count, required CTA, required hashtags,
banned words, dash tells) against the resolved shape, and additionally runs TWO platform-specific
checks, each only when the resolved platform's own `PlatformCopyShape` opts into it:

- `capIncludesHashtags: true` (today: `x` alone, issue #142) — `checkCombinedCaptionHashtagsCap(copy,
  platform)` (`src/copy/validate.ts`), which measures `caption` PLUS a separating space PLUS `hashtags`
  space-joined against that platform's own `maxChars`, appending a `caption_hashtags_length` error
  (naming the platform and the exact character overage) when the combined length exceeds it. This check
  is INDEPENDENT of whichever `CopyShape` governs the caption-alone length/emoji bounds — it always
  measures against the resolved platform's OWN real `maxChars`, never a Recipe's `baseShape`.
- `supportsMentions: true` (today: `linkedin` alone) — scans the caption for a malformed inline
  `@mention` via `scanAtHandleMentionSyntax`, appending a `platform_mention_syntax` error for each
  violation found.

`CopyValidationCode` SHALL gain `"caption_hashtags_length"` (issue #142) and `"platform_mention_syntax"`
(issue #128), each additively (a union widening — no exhaustive switch over it exists anywhere in the
repo).

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

#### Scenario: An X variant whose caption + hashtags combined exceeds 280 fails, even though the caption alone fits (issue #142 AC1/AC2)

- **GIVEN** a Copy whose `caption` is exactly 280 characters (within X's own cap on its own) and whose
  `hashtags` contains one entry long enough to push the combined caption+hashtags length to 318
  characters — the exact live-failure case named in issue #140/#142
- **WHEN** `validateCopyForPlatform(copy, "x", baseShape, rules)` is called
- **THEN** it reports `ok: false` with a `caption_hashtags_length` error naming `"x"` and the overage
  (`38`, i.e. `318 - 280`)
- **AND** it does NOT report a `caption_length` error — the caption alone is within X's 280-char cap;
  the NEW failure is specifically the combined check

#### Scenario: A compliant X variant still passes unchanged (issue #142 AC3)

- **GIVEN** a Copy whose `caption` PLUS `hashtags` combined is well within X's 280-char cap
- **WHEN** `validateCopyForPlatform(copy, "x", baseShape, rules)` is called
- **THEN** it reports `ok: true`

#### Scenario: The SAME over-280-combined Copy is unaffected on every other documented platform (issue #142 AC3)

- **GIVEN** the SAME Copy whose `caption` PLUS `hashtags` combined exceeds 280 characters (from the
  318-character scenario above)
- **WHEN** `validateCopyForPlatform` is called for `"instagram"`, `"linkedin"`, `"facebook"`, and
  `"tiktok"` in turn
- **THEN** none of them ever reports `caption_hashtags_length` — that check only ever fires for a
  platform whose `PlatformCopyShape` declares `capIncludesHashtags: true` (today: X alone)

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
`composeCopy` already does for its single variant.

For a platform whose `platformCopyShapeFor(platform)?.supportsMentions` is `true` (today: `linkedin`
alone), AFTER `injectRequiredParts` and BEFORE that variant is validated, `weaveLinkedInMentions`
(`src/copy/linkedin-mentions.ts`, issue #130) SHALL run against the injected caption, resolving every
company/product in `input`'s own structured companies data (never free prose) through issue #126's
lookup at `options.linkedInHandlesPath` (defaulting to `DEFAULT_LINKEDIN_HANDLES_PATH`). The resulting
woven caption SHALL be what that variant is validated against, and its
`unresolvedMentions` (when non-empty) SHALL be carried onto that platform's `CopyVariant`. Every OTHER
targeted platform (any platform whose `supportsMentions` is not `true`, including the primary Channel
when it is not LinkedIn) SHALL be completely unaffected by this step, even when composing the identical
`CopyInput` companies data.

For a platform whose `platformCopyShapeFor(platform)?.capIncludesHashtags` is `true` (today: `x` alone,
issue #142), `checkCombinedCaptionHashtagsCap` (`src/copy/validate.ts`) SHALL ALSO be checked against
that variant's final candidate `{ caption, hashtags }` — REGARDLESS of whether that platform is the
PRIMARY Channel. The non-primary branch already gets this for free through `validateCopyForPlatform`
above; the PRIMARY-Channel branch, which otherwise only ever calls `validateCopy` against `baseShape`
(never consulting `platform-shape.ts` at all, per this Requirement's own primary-Channel rule above),
SHALL additionally call `checkCombinedCaptionHashtagsCap(candidate, channel.platform)` directly and
merge any resulting error into that Channel's own validation errors. A failure here SHALL be reported as
a `caption_hashtags_length` error on that platform's `ComposeCopyVariantFailure`, exactly as
`validateCopyForPlatform` reports it for a non-primary platform.

`composeCopy` itself SHALL remain byte-for-byte unchanged (same signature, same body) — every existing
caller keeps calling it exactly as before. A Brand with NO Channel configured at all SHALL degrade to
the exact single, unlabeled compose `composeCopy` already performs — never crash (data-handling rule 4).
A Brand with EXACTLY ONE Channel SHALL produce a result identical to calling `composeCopy` directly with
the same `baseShape` (AC1/AC5) — UNLESS that one Channel is itself a mentions-supporting platform, in
which case its own `CopyVariant`-equivalent top-level fields are still subject to the mention-weaving
step above, OR is itself a combined-cap platform (issue #142), in which case it is still subject to the
combined-cap check above. Every targeted platform's validation failures SHALL be collected (never
stopping at the first) and a partially-valid set of variants SHALL NEVER be surfaced — only a fully
valid `Copy` is ever returned, mirroring `composeCopy`'s own all-or-nothing contract.

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

#### Scenario: Every Spec-recorded company that resolves is named as @Name on the LinkedIn variant

- **GIVEN** a `CopyInput` whose `companies` names two companies, both resolving to a committed handle in
  the LinkedIn Handle Lookup at `options.linkedInHandlesPath`
- **WHEN** `composeCopyForChannels` is called across the 5-platform Brand
- **THEN** the LinkedIn variant's caption contains `@Name` for both companies, and its `CopyVariant`
  carries no `unresolvedMentions` field

#### Scenario: An unresolved company falls back to plain text and is flagged, never blocking the caption

- **GIVEN** a `CopyInput` whose `companies` names one company that resolves and one that does not
- **WHEN** `composeCopyForChannels` is called
- **THEN** the LinkedIn variant's caption contains `@Name` for the resolved company and the plain,
  un-prefixed name for the unresolved one, its `CopyVariant.unresolvedMentions` contains exactly that
  unresolved name, and the overall result is still `ok: true` — an unresolved name never fails the
  compose

#### Scenario: Zero companies produces the exact pre-#130 LinkedIn variant, byte for byte

- **GIVEN** a `CopyInput` with no `companies` and no `slideNarrative` companies at all
- **WHEN** `composeCopyForChannels` is called across the 5-platform Brand
- **THEN** the LinkedIn variant's caption and hashtags are byte-for-byte identical to what issue #129's
  pre-#130 code produced (no `Mentions:` text, no `unresolvedMentions` field)

#### Scenario: A company absent from the Spec's own companies data is never mentioned, even if the lookup would resolve it

- **GIVEN** a LinkedIn Handle Lookup with a committed entry for a company NOT present anywhere in the
  `CopyInput`'s `companies`/`slideNarrative` data
- **WHEN** `composeCopyForChannels` is called
- **THEN** that company's name never appears anywhere in the LinkedIn variant's caption — grounded,
  never invented (mirrors PR #122's rule; always-rule 8)

#### Scenario: A NON-primary X variant fails the combined cap, naming the platform and the 318 combined length (issue #142)

- **GIVEN** the same 5-platform Brand (X non-primary) and a drafter whose fixed caption is exactly 280
  characters with one hashtag long enough to push caption + hashtags combined to 318
- **WHEN** `composeCopyForChannels` is called
- **THEN** the result fails with a `"x"` platform failure carrying a `caption_hashtags_length` error
  whose message names `318` (the combined length) — no partially-valid Copy is surfaced

#### Scenario: An X variant fails the combined cap even when X is the PRIMARY Channel (issue #142)

- **GIVEN** a Brand configured for exactly ONE Channel, `x`, marked `primary: true`, and a Recipe's own
  `copyShape` (e.g. 180 chars, 1-3 emoji)
- **WHEN** `composeCopyForChannels` is called with a drafter whose fixed caption is well within the
  Recipe's own 180-char cap (so the pre-existing `validateCopy` check passes) but whose hashtags push
  the combined caption+hashtags length past X's real 280-char cap
- **THEN** the result fails with exactly one platform failure, `"x"`, carrying a
  `caption_hashtags_length` error — proving the combined check is never skipped just because X is the
  primary Channel
- **AND** that failure does NOT carry a `caption_length` error — the caption alone is well within the
  primary Recipe's own shape; only the NEW combined check fires

#### Scenario: A compliant X variant still passes unchanged, primary or not (issue #142)

- **GIVEN** an X variant (primary or non-primary) whose caption + hashtags combined is well within 280
  characters
- **WHEN** `composeCopyForChannels` is called
- **THEN** the X variant is composed successfully, exactly as before this capability gained the
  combined-cap check

#### Scenario: Other platforms' limits are unaffected by the SAME over-280-combined caption/hashtags (issue #142 AC3)

- **GIVEN** the same over-280-combined caption/hashtags from the 318-character scenario above, composed
  across the 5-platform Brand
- **WHEN** `composeCopyForChannels` is called
- **THEN** no platform OTHER than `x` ever reports a `caption_hashtags_length` error — every other
  platform's own bounds (caption-alone length, emoji count, etc.) are completely unaffected by this
  capability

### Requirement: write-social-copy documents composing one Copy variant per targeted platform

`.claude/skills/write-social-copy/SKILL.md` SHALL document reading the Brand's FULL Channel list
(`channelsFrom`/`loadChannels`, ADR-0019) before drafting, and — when it targets more than one platform
— drafting a DISTINCT caption per targeted platform from the same produced material (never one shared
caption reused everywhere), checking the primary Channel's variant with `validateCopy` and every other
targeted platform's variant with `validateCopyForPlatform`/`resolveCopyShapeForPlatform`. It SHALL
state that a single-Channel Brand's instructions are unchanged (one caption, as before), and that the
saved Copy carries `variants` (`src/copy/contract.ts`'s `Copy.variants`) only when more than one
platform was targeted. It SHALL additionally document the LinkedIn mention-resolution step (issue
#130): for each company/product named in the Spec's own structured companies data, `weaveLinkedInMentions`
(`src/copy/linkedin-mentions.ts`) resolves a handle via issue #126's lookup
(`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`) and weaves the literal `@Name` text into the
LinkedIn variant's caption when resolved, or the plain name — flagged for Operator review — when not; it
SHALL state this is a deterministic step the Skill hands off to, never the Skill's own hand-written or
guessed `@mention`. It SHALL additionally document X's combined caption+hashtags cap (issue #142):
naming `checkCombinedCaptionHashtagsCap`/`capIncludesHashtags`/`caption_hashtags_length`, and stating
this check runs REGARDLESS of whether X is the primary Channel or not.

#### Scenario: The Skill instructs one distinct caption per targeted platform

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it instructs drafting a DISTINCT caption for each targeted platform from the same produced
  material, and explicitly states this is never one shared caption reused everywhere

#### Scenario: The Skill documents the deterministic LinkedIn mention-resolution step

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it names `weaveLinkedInMentions`, `resolveLinkedInHandle`, and `linkedin-handle`, states that
  a resolved company/product is woven in as `@Name`, and states that an unresolved one falls back to
  plain text, flagged for Operator review

#### Scenario: The Skill documents X's combined caption+hashtags cap, regardless of primary status (issue #142)

- **GIVEN** `write-social-copy/SKILL.md`
- **WHEN** it is read
- **THEN** it names `checkCombinedCaptionHashtagsCap`, `capIncludesHashtags`, and
  `caption_hashtags_length`, and states this check runs regardless of whether X is the primary Channel
