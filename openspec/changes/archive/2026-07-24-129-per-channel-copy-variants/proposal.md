## Why

Epic #120 asked for captions "optimized in tone, content, and length for each social media channel."
Issue #127 (merged) made a Brand's `channel` field a LIST (`{ platform, url?, primary? }`, ADR-0019).
Issue #128 (merged) built the SHAPE + VALIDATION half: a documented, per-platform `CopyShape` table
(`src/copy/platform-shape.ts`) and `validateCopyForPlatform` (`src/copy/validate.ts`), both purely
additive — `Copy` (`src/copy/contract.ts`) still stayed exactly `{ caption, hashtags }`, and nothing
composed more than one caption.

This slice (#129) is the COMPOSING half: extend `Copy` to carry one variant per targeted Channel
platform, wire `write-social-copy`/the thin Producer to actually compose a distinct caption per
platform (using #128's bounds), and make the ledger + output bundle (`post.json`/`caption.txt`) carry
and present every variant, clearly labeled, so the Operator can paste the right one per Channel at
Publish. The human-publish gate is unchanged (ADR-0002) — OrganicGrowth still never posts anything.

### Design decision: what counts as "targeted"

ADR-0019 itself already resolves this (its own Consequences section): "`#128`/`#129` consume the
non-primary entries too, to know which platforms need a Copy variant." Both real Brands' migrated
`brand-profile.yaml` (issue #127) list ALL their platforms up front — Straw Motion:
facebook (primary)/instagram/linkedin/x/tiktok (5 entries); MundoTip: facebook (primary)/instagram/x/
tiktok (4 entries) — even though only the primary's `url` is filled in today (the others are `""`,
not yet configured for manual posting). "Targeted" therefore means **every entry on the Brand's
`channel` list**, regardless of whether its `url` is filled in yet — not just the entries with a URL.
This matches CONTEXT.md's own Channel glossary entry, already written during #127/#128's authoring:
"Straw Motion targets Facebook, Instagram, LinkedIn, X, and TikTok." Consequence: Straw Motion now
composes 5 variants going forward, MundoTip 4 — this is the INTENDED, already-decided behavior, not an
open question this slice re-litigates. A Brand with exactly ONE `channel` entry (a fresh/hypothetical
Brand, or either real Brand before its own #127 migration) still gets exactly ONE variant, byte-for-byte
unchanged from before this slice (AC1/AC5) — proven with an in-memory single-entry Channel fixture,
since neither live Brand is single-Channel today.

### Design decision: the primary Channel keeps the Recipe's own copyShape

`platform-shape.ts`'s own doc comment (written during #128) already commits to this: "The two WIRED
Recipes never consult this entry for their own primary Facebook Channel — they keep using their own
`copyShape` (180/2200) unchanged." This slice wires that rule for the first time: composing the PRIMARY
Channel's variant always uses the chosen Recipe's own `copyShape` (`validateCopy`, no platform
resolution at all) — never `platform-shape.ts`'s generic `facebook` table entry (477 chars) — while
every OTHER (non-primary) targeted platform resolves its own documented bounds via
`resolveCopyShapeForPlatform`/`validateCopyForPlatform`. This is also what makes the single-Channel
regression provable BY CONSTRUCTION: with exactly one (primary) Channel, the new multi-variant compose
path runs the exact same draft → inject → validate sequence, against the exact same shape, as the
existing `composeCopy` — so the two are asserted deep-equal in tests, not just "similar."

## What Changes

- **`src/copy/contract.ts`** — `Copy` gains an OPTIONAL `variants?: readonly CopyVariant[]` field
  (`CopyVariant = { platform, caption, hashtags }`). Purely additive: `caption`/`hashtags` stay
  required and, when `variants` is present, mirror the PRIMARY Channel's own variant, so every existing
  single-variant consumer (`validateCopy`, the output bundle, `/log-post`'s surfaced Copy) keeps working
  unmodified. A Brand with exactly one Channel never gets a `variants` field at all — the exact pre-#129
  shape.
- **`src/copy/compose.ts`** — new `composeCopyForChannels(input, baseShape, channels, options)`: composes
  ONE variant per entry in the Brand's FULL Channel list (`channelsFrom`/`loadChannels`,
  `production-spec/brand-profile.ts`), from the SAME `CopyInput` material. The primary Channel's variant
  uses `baseShape` (the Recipe's own `copyShape`) + `validateCopy`, exactly as `composeCopy` already
  does; every other targeted platform resolves its own bounds (`resolveCopyShapeForPlatform`) and
  validates via `validateCopyForPlatform` (issue #128), including LinkedIn's inline `@mention` TEXT
  SYNTAX check (never a lookup/insertion — that stays issue #130). Collects EVERY targeted platform's
  failures (never stops at the first) and never partially applies a Copy — only a fully valid set of
  variants is ever returned, mirroring `composeCopy`'s own all-or-nothing contract. `composeCopy` itself
  is completely unmodified (same signature, same body) — every existing caller keeps working exactly as
  before.
- **`src/asset/asset.ts`** — `parseCopy` additively parses an optional `variants` array (new
  `parseCopyVariant`/`parseCopyVariants`), dropping malformed entries defensively (data-handling rule 4)
  and degrading to the plain `{ caption, hashtags }` shape when `variants` is absent or every entry is
  malformed. The ledger (`writeAsset`/`upsertAsset`) already passes any extra `Copy` fields through
  unchanged, so saving a multi-variant Copy onto an Asset just works — the ledger records every variant
  (always-rule 7, ledger-as-source-of-truth).
- **`src/asset/output-bundle.ts`** — `generatePostJson` carries `copy.variants` through onto `post.json`
  (deep-cloned, never a shared reference — mirrors its existing purity guarantee) when present, `null`
  copy unaffected. `captionText` renders EVERY variant, each headed by an `=== PLATFORM ===` label and
  separated by a blank line, when `copy.variants` is present; when absent (today's shape), the output is
  BYTE-FOR-BYTE unchanged from before this slice (verified against the exact existing byte strings in
  `output-bundle.test.ts`).
- **`.claude/skills/write-social-copy/SKILL.md`** — instructs reading the Brand's FULL Channel list
  (`loadChannels`) first; when it targets more than one platform, drafting a DISTINCT caption per
  targeted platform (never one shared caption reused everywhere) from the same produced material,
  checking the primary Channel's variant with `validateCopy` and every other targeted platform's with
  `validateCopyForPlatform`; saving `caption`/`hashtags` as the primary's own variant plus `variants`
  carrying the full, labeled set. Explicitly states it does NOT resolve a LinkedIn `@mention` to a real
  Page handle (issue #130, separate). A single-Channel Brand's instructions are unchanged.
- **`.claude/agents/producer.md`** — the Copy-phase section gets the same instructions, briefly, plus a
  note that the output bundle's `caption.txt` labels every variant by platform when more than one is
  targeted. Every pre-existing pinned reference in this section (`copySkill`, `injectRequiredParts`,
  `validateCopy`, `auditCopyPhase`, `ADR-0012`) is retained verbatim.
- **`CONTEXT.md`** — the **Copy** glossary entry is updated to state one Copy per Asset can hold one
  variant per targeted Channel platform, and a single-Channel Brand still gets exactly the one caption
  it always has. No new term is coined; **Copy**, **Asset**, and **Channel** stay exactly as defined.
- **Tests, test-first, hermetic** — `src/copy/compose.test.ts`, `src/asset/asset.test.ts`,
  `src/asset/output-bundle.test.ts` all gain new coverage; `src/production-spec/producer-agent.docs-test.ts`
  and `src/copy/write-social-copy-skill.docs-test.ts` gain new pinned assertions for the doc changes.
  Nothing here touches the Magnific Space at all (this slice is Copy/ledger/output-bundle code, per the
  issue's own scope note) — no `spaces_*`/`creations_*` call anywhere in the diff.

## Non-Goals (explicitly deferred / out of scope)

- **LinkedIn `@mention` insertion / resolving a company name to a real Page handle.** Issue #130. This
  slice's LinkedIn variant is just a normally-composed caption satisfying LinkedIn's #128 bounds; any
  `@mention` it happens to include is checked for well-formed TEXT SYNTAX only
  (`validateCopyForPlatform`), never resolved or inserted. `src/linkedin-handle/` is not imported here.
- **Per-Channel performance tracking / baseline / ledger attribution.** ADR-0019 already scoped this to
  a future epic; `/track-performance`, the baseline, and `/log-post`'s attribution stay keyed on the one
  `primary` Channel, unchanged.
- **Publishing to any Channel.** OrganicGrowth still never publishes (ADR-0002) — composing more
  variants does not change the human-publish gate; the Operator still manually posts each variant to its
  own platform and logs one URL per (Idea, Recipe) via `/log-post`.
- **Rewiring the two wired Recipes' own tracer-bullet test
  (`src/producer/two-recipes-end-to-end.test.ts`) onto the new multi-variant path.** That test keeps
  calling the existing single-variant `composeCopy` exactly as before — deliberately left untouched, so
  it doubles as a structural regression guard (AC5): if it still passes unmodified, the pre-#129 wired
  path provably still works byte-for-byte.

## Capabilities

### Modified Capabilities (none — see below)

No existing capability's REQUIREMENT TEXT is changed by this slice; every requirement header this slice
adds is genuinely new (checked with `grep -n "^### Requirement" openspec/specs/*/spec.md` against every
title below before writing it — none already exists verbatim).

### Added Requirements, by capability

- `copy-composition`: `Copy` gains an optional per-platform `variants` field;
  `composeCopyForChannels` composes one variant per targeted Channel; `write-social-copy` documents
  composing one variant per targeted platform.
- `asset-store`: `parseCopy`/`parseCopyVariant` parse an Asset's Copy variants defensively; the ledger
  records every variant.
- `asset-output-bundle`: `generatePostJson`/`captionText` carry and render every Copy variant, labeled
  by platform.
- `producer-conductor`: `producer.md` documents composing one Copy variant per targeted Channel
  platform.

## Impact

- **Added:** nothing new on disk besides this OpenSpec change folder — every code change is additive to
  an existing file (no new `.ts` module).
- **Modified:** `src/copy/contract.ts`, `src/copy/compose.ts`, `src/asset/asset.ts`,
  `src/asset/output-bundle.ts`, `.claude/skills/write-social-copy/SKILL.md`, `.claude/agents/producer.md`,
  `CONTEXT.md`, plus their test/docs-test files (`src/copy/compose.test.ts`, `src/asset/asset.test.ts`,
  `src/asset/output-bundle.test.ts`, `src/production-spec/producer-agent.docs-test.ts`,
  `src/copy/write-social-copy-skill.docs-test.ts`).
- **Not touched:** `src/copy/draft.ts`, `src/copy/inject.ts`, `src/copy/validate.ts`,
  `src/copy/platform-shape.ts`, `src/recipe/registry.ts`, `src/linkedin-handle/*`, any Brand Profile
  YAML, `src/producer/two-recipes-end-to-end.test.ts` (deliberately, see Non-Goals).
- **Hermetic:** no Space/MCP call anywhere in this diff (`grep -rn "spaces_\|creations_"` over every
  touched file returns nothing) — this slice is pure Copy-composition/ledger/output-bundle code, no
  Magnific fake needed or used, per the issue's own scope note.
- **Always-rules upheld:** generate-never-publish (no publish-path code touched; the Skill/agent docs
  explicitly restate the human still posts every variant); public-metrics-only/relative-not-absolute (no
  metrics/baseline code touched); explicit-attribution (no `post_url`/`/log-post` code touched — still
  one URL per (Idea, Recipe), unchanged); ledger-as-source-of-truth (every variant is written onto the
  Asset's `copy` field via the EXISTING `writeAsset` write path — no second store; `post.json` stays a
  GENERATED VIEW, never hand-maintained); never-fabricate (an undocumented platform falls back to the
  Recipe's own `baseShape`, never an invented bound; a zero-Channel Brand Profile degrades to the
  existing single-variant compose rather than crashing).
