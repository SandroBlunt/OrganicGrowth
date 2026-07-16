## Why

OrganicGrowth was built around one hard-wired Brand-level voice + one trend-source mode
(peer-scrape vs curated), so a Brand cannot run two distinct editorial lines with different voices
or sources. ADR-0009 splits "format" into **Format** (a Brand's editorial line — subject + treatment,
e.g. Straw Motion's "Unhypped News") and **Recipe** (a production plan; out of scope here — issue
#54). ADR-0013 gives each Format its own file and scopes a Trend Research Run to exactly one Format;
ADR-0014 says canonical state (even a human-editable YAML document) belongs behind a typed store
boundary. Issue #53 is slice 1 of the 7-slice multi-format epic (#53–#60): it makes **Format**
first-class on disk and scopes trend research to it, without touching Recipes, the per-Asset ledger,
or the Production Queue re-grain (later slices).

## What Changes

- **Add a per-Format YAML file schema** at `data/brands/<slug>/formats/<formatSlug>.yaml`:
  `{ name, niche, voice, media_focus, sources: { mode, seed_pages, curated_sources, keywords,
  lookback_days, overperformance_only }, ideas_per_run, default_recipes }`. `media_focus` is the
  renamed `format_focus` (a media/trend-quality filter) — deliberately NOT called `format_focus`
  inside a Format's own file, since "format" now means only the editorial line (ADR-0009).
- **Add a typed `FormatStore`** (`src/format/store.ts`): a pure, defensive parser
  (`parseFormatFile`, `deriveSourceMode`) plus a thin I/O shell (`loadFormat`, `listFormatSlugs`,
  `formatFilePath`, `formatIdeasRoot`) — the only place a Format file is read. Reuses
  `normalizeSeeds`/`NormalizedSeed` from `readiness/check-config.ts` for off-niche seed handling
  (one normalization rule, not two). A genuinely missing Format throws a clear, actionable error
  listing the Brand's actually-available Formats (mirrors `ledger.ts`'s "unknown Brand" pattern) —
  silently defaulting to an empty Format would let a Run silently research nothing.
- **Extend the Brand resolver** (`src/brand/resolver.ts`) with `BrandPaths.formatsRoot`
  (`<brandsRoot>/<slug>/formats`) — the one place the Format-file directory convention is defined.
- **Migrate mundotip and straw-motion**: add `data/brands/mundotip/formats/life-hacks.yaml` and
  `data/brands/straw-motion/formats/unhypped-news.yaml`, each capturing that Brand's current
  editorial line (niche, voice, trend sources, peer-vs-curated mode, `ideas_per_run`,
  `default_recipes: [character-explainer-with-cast]` — the only wired Recipe today, named as a
  free-text slug since the in-repo Recipe registry, issue #54, is not wired yet).
- **Retire the media-sense of "format"**: remove `formats: [reel]` from `brand-profile.yaml`
  entirely (`BrandProfileContent`, `buildBrandProfile`, the skeleton template, both real Brands) —
  it is unused by `readiness/check-config.ts` today, so this is a clean, zero-behavior-risk removal.
  `idea-strategist`'s brief body is reworded from a "**Format:** Reel…" heading (the old media sense)
  to "**Suggested Recipe:** …" so "Format" only ever means the editorial line in a Brief.
- **`/run-trends <brand> <format>` requires the Format argument** (no silent default — a Brand may
  run several Formats; there is no "the" default one). Its Run output path becomes
  Format-namespaced: `data/brands/<slug>/ideas/<format>/<run>/` (was `ideas/<run>/`).
  `trend-scout` reads `sources.mode`/`sources.*` from the Format file (never `seeds.yaml`);
  `idea-strategist` reads `voice`/`ideas_per_run` from the Format file and tags every suggested Idea
  (brief front-matter + ledger record) with `format: <formatSlug>`.
- **Scaffolder gains a `formats/` directory**: `templates/brand-skeleton/formats/.gitkeep` is copied
  into every newly scaffolded Brand, so `formats/` exists from day one. The full Format-interview
  onboarding flow (asking the Operator for a Format's voice/sources conversationally) is **out of
  scope** — deferred to whichever future slice reworks the new-Brand interview; today's interview
  (`run-pipeline.ts`) is unchanged (see Non-Goals).

## Non-Goals (explicitly deferred to later slices in the epic)

- **The Recipe registry** (`default_recipes` validated against real Recipes) — issue #54.
- **Per-Asset ledger / AssetStore / queue re-key to `(brand, idea, recipe)`** — issues #55/#56. The
  ledger's per-Idea `format` field is written by `idea-strategist` (a prompt-level change) but is
  NOT given a typed reader in `ledger.ts` here — that reshape rides with the ledger grain change.
- **The Producer's Production Spec path** (`production-spec/store.ts::specPathFor`) is NOT made
  Format-aware. The single-recipe Producer (`producer.md`, `driver.ts`, `compose.ts`) is completely
  unchanged and keeps writing Specs beside Briefs at the OLD Brand-level `ideas/<run>/` path. This is
  a known, intentional seam: a brand-new Format-scoped Idea accepted today would have its Brief under
  `ideas/<format>/<run>/` but (if produced) its Spec under the old `ideas/<run>/` path, breaking the
  "Spec sits beside its Brief" sibling-file convention until the Producer/Spec-path slice (#58) lands.
  Documented in the handoff's Known Limits — not silently papered over.
- **`readiness/check-config.ts` and `/run-pipeline`'s conductor stay Brand-scoped**, NOT
  Format-aware. `brand-profile.yaml`'s `voice`/`niche` and `seeds.yaml`'s `seed_pages`/
  `curated_sources`/etc. are deliberately LEFT IN PLACE (not deleted) as legacy Brand-level
  fallbacks, even though `trend-scout`/`idea-strategist` no longer read them — deleting them would
  make `checkConfig`'s `voice_unset`/`no_valid_seed` checks permanently false-positive/false-block
  for every Brand (readiness has no Format awareness to check the *Format's* voice/sources instead).
  Only the media-sense `formats: [reel]` field (unused by readiness) is removed. Full retirement of
  the Brand-level legacy copies is deferred to whichever slice makes readiness/`/run-pipeline`
  Format-aware.
- **Multiple Formats per Brand are not exercised via `/run-pipeline`'s "loop over Formats"** — the
  conductor's Gate-1 message is updated to name `<format>` in the `/run-trends` invocation it
  suggests, but the loop-over-Formats orchestration itself is not built here.

## Capabilities

### Added Capabilities

- `format-store`: the per-Format YAML file schema + the typed `FormatStore` (pure defensive parser,
  path resolution, directory listing, a clear not-found error) — files behind the store boundary
  (ADR-0014). Includes the mundotip/straw-motion migration and the `formats:[reel]` media-sense
  retirement from `brand-profile.yaml`.
- `format-scoped-trend-research`: `/run-trends <brand> <format>` requiring the Format argument, its
  Format-namespaced Run output path, and `trend-scout`/`idea-strategist` reading
  sources/mode/voice/`ideas_per_run` from the Format file and tagging every Idea with its Format.

### Modified Capabilities

- `brand-resolver`: `BrandPaths` gains `formatsRoot`.
- `brand-commands`: the "Content agents thread the Brand" requirement's trend-scout scenario is
  updated for Format-scoping (reads the Format file, writes to the Format-namespaced Ideas path).

## Impact

- **New code:** `src/format/store.ts` (+ `store.test.ts`, `format-docs.test.ts`),
  `data/brands/{mundotip,straw-motion}/formats/*.yaml`, `templates/brand-skeleton/formats/.gitkeep`.
- **Modified code:** `src/brand/resolver.ts` (+test), `src/brand/scaffolder.ts` (+test — drops
  `formats`), `src/readiness/check-config.ts` (+test — drops unused `formats` field),
  `src/commands/run-pipeline.ts` (one string: the Gate-1 `/run-trends` hint now names `<format>`),
  `templates/brand-skeleton/brand-profile.yaml`, `data/brands/{mundotip,straw-motion}/brand-profile.yaml`
  (drop `formats: [reel]`; add a pointer comment to the new Format file), `.claude/commands/run-trends.md`,
  `.claude/agents/trend-scout.md`, `.claude/agents/idea-strategist.md`, `.claude/commands/review-ideas.md`
  (one paragraph: briefs load from the Format-namespaced path via each ledger Idea's own `format` field).
- **Not touched:** `producer.md`, `src/production-spec/**`, `src/space-driver/**`, `src/ledger/ledger.ts`,
  `src/production-queue/**`, `CLAUDE.md` (deferred to issue #59's "flip docs to present tense"),
  `CONTEXT.md` (already documents the target Format model from PR #61 — no further change needed).
- **Hermetic:** every test is plain filesystem + markdown-text assertions — zero `spaces_*`/
  `creations_*` calls, zero credits, zero board mutation. The existing Magnific-fake-backed test
  suite (`space-driver/**`) is completely untouched and stays green.
- **Always-rules upheld:** never-fabricate (a missing Format file/seed source stops the Run rather
  than guessing); explicit-attribution and ledger-as-source-of-truth are unaffected (no ledger/queue
  writer changes in this slice); relative-not-absolute and public-metrics-only are unaffected
  (trend-scout's over-performance logic is unchanged, only its config source moved).
