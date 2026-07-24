## Why

Epic #120 asked for LinkedIn `@mention` tagging of the companies/products a Post names. The chain that
gets there is now fully built except this last link: #127 made a Brand's `channel` a list (ADR-0019),
#128 built the per-platform `CopyShape` bounds + a LinkedIn `@mention` TEXT-SYNTAX checker
(`validateCopyForPlatform`), #129 wired `composeCopyForChannels` to actually compose one Copy variant
per targeted platform, and #126 built a global, Operator-maintained lookup
(`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`) resolving a company/product's plain name to
its committed LinkedIn Page handle. Nothing yet CALLS that lookup from Copy composition — today's
LinkedIn variant is "just a normally-composed caption" (`write-social-copy/SKILL.md`'s own words),
whatever `@mention`s it happens to contain checked only for well-formed syntax, never resolved.

Issue #130 closes that gap: for the LinkedIn variant only, resolve every company/product named in the
chosen Recipe's own STRUCTURED companies data (News Carousel's `CopySlideBeat.companies`, PR #122;
Character Explainer's `CopyInput.companies`, #125 — never free prose) through #126's lookup, and weave
the result into the caption — the literal `@Name` text (the Operator's own dropdown-pick target,
since OrganicGrowth can never embed a functioning tag itself: LinkedIn only creates a real tag when a
human picks it from its own compose-box UI at typing time) for every name that resolves, or the plain
name, flagged for Operator review, for every name that doesn't. This is the LAST issue in epic #120's
chain — #131 (if any) is not filed against this chain.

## What Changes

- **NEW `src/copy/linkedin-mentions.ts`** — a pure deep module (mirroring `inject.ts`'s pure-logic
  shape) plus one thin async shell:
  - `companiesFromCopyInput(input)` gathers every company/product named in `CopyInput`'s STRUCTURED
    companies data ONLY — `input.companies` (Character Explainer, #125) and every
    `input.slideNarrative[].companies` beat (News Carousel, PR #122) — deduped case-insensitively, in
    order. Never reads free prose (`title`/`angle`/`mediaContext`) — grounded, never invented (mirrors
    PR #122's rule; always-rule 8).
  - `buildLinkedInMentionResolutions(companies, handles)` builds one `LinkedInMentionResolution` per
    company from an already-resolved name→handle map: `mention: "@Name"` (the plain name string, never
    the raw handle slug) + `resolved: true` when a handle is present; `mention: name` (unchanged) +
    `resolved: false` when it isn't.
  - `injectLinkedInMentions(caption, resolutions)` deterministically weaves each resolution's `mention`
    into `caption` — appending, as one trailing sentence, every resolution whose mention text isn't
    already present (case-insensitive substring match), mirroring `inject.ts`'s append-if-missing/
    dedupe-if-present pattern exactly. Zero resolutions returns `caption` UNCHANGED.
  - `unresolvedMentionNames(resolutions)` — the plain names with no committed handle, for the
    Operator-review flag.
  - `weaveLinkedInMentions(caption, input, linkedInHandlesPath?)` — the thin async shell: gathers
    companies, resolves each via `resolveLinkedInHandle` (#126), weaves the result in, and reports
    unresolved names. Zero companies short-circuits BEFORE any I/O — the caption returns byte-for-byte
    unchanged, matching #129's baseline LinkedIn variant exactly (AC4).
- **`src/copy/contract.ts`** — `CopyVariant` gains an OPTIONAL `unresolvedMentions?: readonly string[]`
  field, present only when non-empty (mirrors `Copy.variants`'s own additive-optional convention). Only
  ever populated for a platform whose `PlatformCopyShape` sets `supportsMentions: true` (today:
  `linkedin` alone).
- **`src/copy/compose.ts`** — `ComposeCopyOptions` gains an optional `linkedInHandlesPath` (defaults to
  `DEFAULT_LINKEDIN_HANDLES_PATH`). Inside `composeCopyForChannels`'s per-Channel loop, for a platform
  whose `platformCopyShapeFor(...)?.supportsMentions` is `true`, `weaveLinkedInMentions` runs on the
  injected caption BEFORE that variant is validated — so the syntax checker (`validateCopyForPlatform`,
  #128) always checks the FINAL, mention-woven text, and a malformed mention this step introduces would
  still be caught (it never is, by construction: `@Name` always starts with a plausible handle
  character). Every other platform (including the primary) is completely untouched by this step —
  `composeCopy` itself is not modified at all.
- **`src/asset/output-bundle.ts`** — `cloneCopy` deep-clones each variant's `unresolvedMentions` too
  (never a shared reference, mirroring its existing purity guarantee); `captionText` appends one flagged
  note line under a variant whose `unresolvedMentions` is non-empty, naming every unresolved company —
  "for Operator review" surfaced right where the Operator reads the paste-ready caption before
  publishing. Absent/empty `unresolvedMentions` renders BYTE-FOR-BYTE identical output to before this
  change.
- **`.claude/skills/write-social-copy/SKILL.md`** / **`.claude/agents/producer.md`** — updated to
  describe the now-built LinkedIn mention-resolution step (naming `linkedin-mentions.ts`/
  `weaveLinkedInMentions`/`resolveLinkedInHandle`) in place of the old "defers to issue #130" language.

## Non-Goals

- **Resolving a mention from a caption's free prose.** This slice only ever mentions a company/product
  already present in the Recipe's own structured companies data — it never scans the drafted caption
  text for company-looking substrings to tag.
- **A real LinkedIn API call, or embedding a functioning tag.** `data/linkedin-handles.yaml` stays
  Operator-maintained and static (#126); OrganicGrowth can never make a `@mention` a real, clickable
  LinkedIn tag itself — only a human, picking the name from LinkedIn's own compose-box dropdown at
  typing time, does that. This slice hands the human the exact name to pick.
- **Tracking/publishing to the LinkedIn Channel.** Unaffected — still 100% manual (ADR-0002, ADR-0019).
- **Per-Channel performance tracking.** Explicitly deferred by ADR-0019 to a future epic; unrelated to
  this slice.
- **CONTEXT.md.** The **Copy** glossary entry already names "mentions" as part of Copy's shape
  (#129's own edit) — no new domain term is coined by this slice, so CONTEXT.md is not touched.

## Capabilities Touched

- `copy-composition` — new mention-resolution module, `CopyVariant.unresolvedMentions`,
  `composeCopyForChannels` wiring.
- `asset-output-bundle` — surfaces unresolved mentions in `caption.txt` for Operator review.

## Impact

- Affected code: `src/copy/linkedin-mentions.ts` (new), `src/copy/linkedin-mentions.test.ts` (new),
  `src/copy/contract.ts`, `src/copy/compose.ts`, `src/copy/compose.test.ts`, `src/asset/output-bundle.ts`,
  `src/asset/output-bundle.test.ts`, `src/copy/write-social-copy-skill.docs-test.ts`,
  `.claude/skills/write-social-copy/SKILL.md`, `.claude/agents/producer.md`, plus a small fixture
  `src/copy/fixtures/linkedin-handles.copy-tests.yaml`.
- No Magnific Space / MCP code touched at all — this is pure Copy-composition + lookup wiring, hermetic
  by construction (no `spaces_*`/`creations_*` calls anywhere in the diff).
- `resolveLinkedInHandle`'s own store/lookup module (`src/linkedin-handle/`) is unmodified — this slice
  only adds a new CALLER.
