## MODIFIED Requirements

### Requirement: generatePostJson and captionText carry and render every Copy variant, labeled by platform

`generatePostJson` (`src/asset/output-bundle.ts`) SHALL carry an Asset's `copy.variants` through onto
`post.json`'s `copy` field, deep-cloned (never sharing a reference with the ledger's own Asset record,
mirroring its existing purity guarantee) when present — INCLUDING each variant's own
`unresolvedMentions` (issue #130), also deep-cloned; a Copy with no `variants` field SHALL yield a
`post.json` `copy` value with no `variants` key, unchanged from before this capability. `captionText`
SHALL render EVERY entry of `copy.variants`, when present and non-empty, each headed by an `=== PLATFORM
===` label (the platform name upper-cased) and separated by a blank line from its neighbors, so the
Operator can find and paste exactly one platform's block; when `copy.variants` is absent or empty,
`captionText`'s output SHALL be BYTE-FOR-BYTE IDENTICAL to its behavior before this capability (the
single caption + hashtags block, unchanged).

When a variant's `unresolvedMentions` (issue #130) is present and non-empty, `captionText` SHALL append,
inside that variant's own block, ONE flagged note line naming every unresolved company/product — "for
Operator review" surfaced right where the Operator reads the paste-ready caption before publishing,
never silently dropped. A variant with no `unresolvedMentions` field, or an empty one, SHALL render its
block with NO such note — BYTE-FOR-BYTE identical to this capability's pre-issue-#130 rendering.

#### Scenario: post.json carries every variant, unchanged from the ledger's own Copy

- **GIVEN** an Asset whose `copy` carries a `variants` array
- **WHEN** `generatePostJson` is called
- **THEN** the returned `post.json`'s `copy.variants` deep-equals the Asset's own `copy.variants`, as a
  freshly-allocated array (not the same reference)

#### Scenario: An Asset's Copy with no variants field yields a post.json copy with no variants key

- **GIVEN** an Asset whose `copy` has only `caption`/`hashtags`
- **WHEN** `generatePostJson` is called
- **THEN** the returned `post.json`'s `copy` has only `caption`/`hashtags` — no `variants` key

#### Scenario: captionText renders every variant, labeled by platform, paste-ready

- **GIVEN** a Copy carrying `variants` for `facebook`, `linkedin`, and `x`
- **WHEN** `captionText` is called
- **THEN** the output contains an `=== FACEBOOK ===`, an `=== LINKEDIN ===`, and an `=== X ===` block,
  each containing ONLY that platform's own caption and hashtags — never another platform's text

#### Scenario: An absent or empty variants array renders byte-identical output to before this capability

- **GIVEN** a Copy with no `variants` field, and separately one with `variants: []`
- **WHEN** `captionText` is called on each
- **THEN** both render the exact same single caption + hashtag block `captionText` already produced
  before this capability — no `=== PLATFORM ===` label appears

#### Scenario: post.json carries a variant's unresolvedMentions, deep-cloned

- **GIVEN** an Asset whose `copy.variants` includes a LinkedIn entry with `unresolvedMentions: ["Unknown
  Startup"]`
- **WHEN** `generatePostJson` is called
- **THEN** the returned `post.json`'s LinkedIn variant carries `unresolvedMentions: ["Unknown Startup"]`
  as a freshly-allocated array, not the same reference as the Asset's own

#### Scenario: captionText flags a variant's unresolved mentions in its own block, for Operator review

- **GIVEN** a Copy carrying a LinkedIn variant with `unresolvedMentions: ["Unknown Startup"]` alongside
  a Facebook variant with none
- **WHEN** `captionText` is called
- **THEN** the LinkedIn block contains a note naming `"Unknown Startup"`
- **AND** the Facebook block contains no such note

#### Scenario: A variant with no unresolvedMentions renders byte-identical to before issue #130

- **GIVEN** a Copy carrying variants where every entry either omits `unresolvedMentions` or sets it to
  `[]`
- **WHEN** `captionText` is called
- **THEN** the output is byte-for-byte identical to this capability's rendering before issue #130 — no
  flagged note appears anywhere
