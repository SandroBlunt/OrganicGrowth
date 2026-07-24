## ADDED Requirements

### Requirement: linkedin-mentions.ts resolves and weaves LinkedIn @mentions from a Recipe's own structured companies data

The system SHALL provide `src/copy/linkedin-mentions.ts`, a pure deep module (mirroring
`src/copy/inject.ts`'s pure-logic shape) plus one thin async shell, resolving every company/product
named in a Recipe's own STRUCTURED companies data — `CopyInput.companies` (the Character Explainer with
Cast Recipe's whole-Asset grain, issue #125) and every `CopySlideBeat.companies` beat (the News Carousel
Recipe's per-slide grain, PR #122) — through issue #126's committed LinkedIn Handle Lookup
(`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`), and weaving the literal text the Operator
would select from LinkedIn's own compose-box dropdown into the caption.

`companiesFromCopyInput(input)` SHALL gather every name from `input.companies` and every
`input.slideNarrative[].companies` beat, in that order, deduped case-insensitively (the first-seen
casing wins). It SHALL NEVER read free-prose fields (`title`, `angle`, `mediaContext`) — only names
already present in the Spec's own structured companies data are ever considered (grounded, never
invented — mirrors PR #122's rule; always-rule 8).

`buildLinkedInMentionResolutions(companies, handles)` SHALL build one `LinkedInMentionResolution`
(`{ name, mention, resolved }`) per company from an already-resolved `name -> handle | null` map: when a
handle is present, `mention` SHALL be the literal string `"@" + name` (the plain company/product name,
NEVER the raw handle slug) and `resolved` SHALL be `true`; when no handle is present, `mention` SHALL be
`name` unchanged and `resolved` SHALL be `false`.

`injectLinkedInMentions(caption, resolutions)` SHALL deterministically weave every resolution's
`mention` into `caption`: a resolution whose `mention` (case-insensitively) already appears in `caption`
SHALL be left alone — never duplicated (mirrors `injectRequiredCta`'s dedupe-on-already-present
pattern); every other resolution SHALL be appended, in order, as one trailing sentence. An empty
`resolutions` list SHALL return `caption` COMPLETELY UNCHANGED — no trailing artifact when there is
nothing to mention.

`unresolvedMentionNames(resolutions)` SHALL return the plain `name` of every resolution whose `resolved`
is `false`, in order — the Operator-review flag list, never silently dropped.

`weaveLinkedInMentions(caption, input, linkedInHandlesPath?)` SHALL be the thin async shell:
`companiesFromCopyInput(input)`, resolve each via `resolveLinkedInHandle` (issue #126, defaulting to
`DEFAULT_LINKEDIN_HANDLES_PATH` when `linkedInHandlesPath` is omitted), weave the result into `caption`,
and return `{ caption, unresolvedMentions }`. Zero companies SHALL short-circuit BEFORE any file I/O and
return `caption` byte-for-byte unchanged.

#### Scenario: companiesFromCopyInput merges both grains, deduped, ignoring free prose

- **GIVEN** a `CopyInput` whose `companies` names one company and whose `slideNarrative` carries two
  beats each naming a different (and, on one beat, an overlapping/differently-cased) company, plus a
  distinctive `title`/`angle`/`mediaContext` that itself names yet another company-looking string
- **WHEN** `companiesFromCopyInput(input)` is called
- **THEN** the result contains every company from `companies` and every beat's `companies`, each exactly
  once (the overlapping name deduped to its first-seen casing), and contains nothing derived from
  `title`/`angle`/`mediaContext`

#### Scenario: buildLinkedInMentionResolutions marks a resolved handle as @Name, an unresolved one as plain text

- **GIVEN** a companies list `["OpenAI", "Unknown Startup"]` and a handle map resolving `"OpenAI"` to
  `"openai"` and carrying no entry for `"Unknown Startup"`
- **WHEN** `buildLinkedInMentionResolutions(companies, handles)` is called
- **THEN** it returns `{ name: "OpenAI", mention: "@OpenAI", resolved: true }` and `{ name: "Unknown
  Startup", mention: "Unknown Startup", resolved: false }` — the resolved mention is the plain name
  string prefixed with `@`, never the raw handle slug `"openai"`

#### Scenario: injectLinkedInMentions appends missing mentions, dedupes present ones, and is a no-op for zero resolutions

- **GIVEN** a caption, and separately: zero resolutions; one resolution whose mention is already present
  in the caption (case-insensitively); and one resolution whose mention is absent
- **WHEN** `injectLinkedInMentions(caption, resolutions)` is called for each
- **THEN** zero resolutions returns the caption completely unchanged; the already-present resolution is
  NOT duplicated; the absent resolution's mention text is appended to the caption

#### Scenario: weaveLinkedInMentions resolves, weaves, and reports unresolved names against the real lookup file

- **GIVEN** a committed `linkedin-handles.yaml` resolving one of two companies named in a `CopyInput`
- **WHEN** `weaveLinkedInMentions(caption, input, path)` is called
- **THEN** the returned caption contains `@Name` for the resolved company and the plain name for the
  unresolved one, and `unresolvedMentions` contains exactly the unresolved company's name

#### Scenario: weaveLinkedInMentions never touches disk for zero companies

- **GIVEN** a `CopyInput` with no `companies` and no `slideNarrative` companies at all
- **WHEN** `weaveLinkedInMentions(caption, input, "/path/that/does/not/exist.yaml")` is called
- **THEN** it resolves successfully, returning `caption` unchanged and `unresolvedMentions: []` — no
  error, even though the given path does not exist (short-circuits before any file read)

## MODIFIED Requirements

### Requirement: Copy carries an optional per-platform variants field, additive to the single caption/hashtags shape

The system SHALL extend `Copy` (`src/copy/contract.ts`) with an OPTIONAL `variants?: readonly
CopyVariant[]` field, where `CopyVariant` is `{ platform: string, caption: string, hashtags: readonly
string[], unresolvedMentions?: readonly string[] }`. `Copy.caption`/`Copy.hashtags` SHALL remain
required and, when `variants` is present, SHALL mirror the PRIMARY Channel's own variant — so every
existing single-variant consumer (`validateCopy`, the output bundle, `/log-post`'s surfaced Copy) keeps
working unmodified on the top-level fields alone. A Copy composed for a Brand with exactly one Channel
SHALL carry NO `variants` field at all — the exact shape `Copy` had before this capability.
`CopyVariant.unresolvedMentions` (issue #130) SHALL be present ONLY when non-empty — the plain
company/product names issue #126's LinkedIn Handle Lookup had no committed handle for, on a variant
composed for a platform whose `PlatformCopyShape` sets `supportsMentions: true` (today: `linkedin`
alone); every other variant SHALL never carry this field at all.

#### Scenario: A single-Channel Copy has no variants field

- **GIVEN** a Brand configured for exactly one Channel
- **WHEN** its Copy is composed
- **THEN** the resulting `Copy` has only `caption` and `hashtags` — no `variants` key at all

#### Scenario: A multi-Channel Copy's top-level fields mirror the primary variant

- **GIVEN** a Brand configured for more than one Channel, one marked `primary`
- **WHEN** its Copy is composed
- **THEN** `copy.caption`/`copy.hashtags` equal the PRIMARY Channel's own entry in `copy.variants`

#### Scenario: A variant with every mention resolved carries no unresolvedMentions field

- **GIVEN** a LinkedIn variant whose every Spec-recorded company/product resolves to a committed handle
- **WHEN** its `CopyVariant` is inspected
- **THEN** it carries no `unresolvedMentions` key at all — never an empty array either

#### Scenario: A non-LinkedIn variant never carries unresolvedMentions, even with the same companies data

- **GIVEN** the SAME `CopyInput` companies data composed for both a LinkedIn and a non-LinkedIn targeted
  platform, with at least one company unresolved
- **WHEN** both variants are inspected
- **THEN** the LinkedIn variant carries `unresolvedMentions` naming the unresolved company; the
  non-LinkedIn variant carries no `unresolvedMentions` field at all

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
`CopyInput` companies data. `composeCopy` itself SHALL remain byte-for-byte unchanged (same signature,
same body) — every existing caller keeps calling it exactly as before. A Brand with NO Channel
configured at all SHALL degrade to the exact single, unlabeled compose `composeCopy` already performs —
never crash (data-handling rule 4). A Brand with EXACTLY ONE Channel SHALL produce a result identical to
calling `composeCopy` directly with the same `baseShape` (AC1/AC5) — UNLESS that one Channel is itself a
mentions-supporting platform, in which case its own `CopyVariant`-equivalent top-level fields are still
subject to the mention-weaving step above. Every targeted platform's validation failures SHALL be
collected (never stopping at the first) and a partially-valid set of variants SHALL NEVER be surfaced —
only a fully valid `Copy` is ever returned, mirroring `composeCopy`'s own all-or-nothing contract.

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
guessed `@mention`.

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
