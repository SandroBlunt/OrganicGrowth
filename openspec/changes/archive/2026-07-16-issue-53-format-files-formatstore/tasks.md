## 1. Brand resolver: expose the Format-file root

- [x] 1.1 Write failing tests (`resolver.test.ts`): `resolveBrand` returns `formatsRoot` =
  `<brandsRoot>/<slug>/formats` for the default root, an explicit root, and a custom root.
- [x] 1.2 Implement `BrandPaths.formatsRoot` in `src/brand/resolver.ts`.

## 2. FormatStore — pure parser (test-first)

- [x] 2.1 Write failing tests (`format/store.test.ts`): `FORMAT_SLUG_PATTERN`/`isValidFormatSlug`/
  `assertValidFormatSlug` accept/reject the same slug shapes as the Brand-slug guard (tenancy
  boundary — a Format slug is untrusted CLI input joined into a path).
- [x] 2.2 Write failing tests: `deriveSourceMode` — explicit `mode` wins; infers `curated` when
  `curated_sources` is non-empty and `mode` is absent; defaults to `peer`; prefers `curated` when
  both are set without an explicit mode (mirrors `trend-scout.md`'s documented tie-break).
- [x] 2.3 Write failing tests: `parseFormatFile` — a fully-populated object parses verbatim; off-niche
  seed entries normalize via the REUSED `normalizeSeeds`/`NormalizedSeed` from
  `readiness/check-config.ts`; every field defaults sensibly (never throws) on missing/garbled input;
  non-string array entries are dropped, not crashed on.
- [x] 2.4 Implement `FormatSourceMode`, `FormatSources`, `FormatFile`, `deriveSourceMode`,
  `parseFormatFile`, and the slug guards in `src/format/store.ts`.

## 3. FormatStore — I/O shell (test-first)

- [x] 3.1 Write failing tests: `formatFilePath`/`formatIdeasRoot` resolve the documented path shapes
  and reject a path-traversal Format slug (and delegate Brand-slug validation to `resolveBrand`).
- [x] 3.2 Write failing tests: `listFormatSlugs` enumerates `.yaml` basenames under a Brand's
  `formats/` directory (sorted, dotfiles/non-`.yaml` excluded); returns `[]` for a Brand with no
  `formats/` directory yet (no throw).
- [x] 3.3 Write failing tests: `loadFormat` reads + parses a real temp-dir Format file; throws a
  clear, actionable error naming the Brand+Format and listing the Brand's actually-available Formats
  when the file is missing; throws a clear parse error naming the path for malformed YAML.
- [x] 3.4 Implement `formatFilePath`, `formatIdeasRoot`, `listFormatSlugs`, `loadFormat` in
  `src/format/store.ts`.

## 4. Retire the media-sense of "format" from brand-profile.yaml

- [x] 4.1 Update `check-config.test.ts`'s `HEALTHY_PROFILE` fixture to drop `formats` (it is unused
  by `checkConfig`'s logic — confirmed by full-repo grep before removal).
- [x] 4.2 Remove `BrandProfile.formats?` from `src/readiness/check-config.ts`.
- [x] 4.3 Update `scaffolder.test.ts`: replace the `formats: ['reel']` assertions with a "does NOT
  set a formats field" assertion; drop the round-trip assertion on `.formats`.
- [x] 4.4 Remove `formats: string[]` from `BrandProfileContent` and `buildBrandProfile`'s output in
  `src/brand/scaffolder.ts`.
- [x] 4.5 Remove the `formats: [reel]` line from `templates/brand-skeleton/brand-profile.yaml` and
  from both real Brands' `brand-profile.yaml`; add a short pointer comment to the new Format file(s).

## 5. Migrate mundotip and straw-motion to Format files

- [x] 5.1 Add `data/brands/mundotip/formats/life-hacks.yaml` — niche/voice/seed_pages (incl. the
  structured `off_niche` entry)/keywords/lookback_days/overperformance_only/`ideas_per_run:10`/
  `default_recipes:[character-explainer-with-cast]`, copied from the pre-migration
  `brand-profile.yaml`+`seeds.yaml` content (never fabricated).
- [x] 5.2 Add `data/brands/straw-motion/formats/unhypped-news.yaml` — same shape, `sources.mode:
  curated`, `curated_sources` from the pre-migration `seeds.yaml`.
- [x] 5.3 Write a committed test (`format/store.test.ts`, "issue #53 AC2" describe block) that loads
  BOTH real files through `loadFormat`/`listFormatSlugs` (default `brandsRoot`, no temp-dir override)
  and asserts their mode/voice/sources — a durable regression check, not just a manual smoke test.

## 6. Scaffolder gains a formats/ directory

- [x] 6.1 Write a failing test (`scaffold-brand.test.ts`): `scaffoldBrand` creates a `formats/`
  subdirectory.
- [x] 6.2 Add `templates/brand-skeleton/formats/.gitkeep` so `cp(templatePath, brandDir, {recursive})`
  materialises it for every new Brand.

## 7. Format-scoped research: /run-trends, trend-scout, idea-strategist (prompt-level)

- [x] 7.1 Rewrite `.claude/commands/run-trends.md`: usage becomes `/run-trends <brand> <format>`
  (both required, no silent default); Format-namespaced Ideas root
  (`data/brands/<slug>/ideas/<format>/<run>/`); unknown-Format handling (list available Formats,
  never fall back); `ideas_per_run` sourced from the Format file.
- [x] 7.2 Rewrite `.claude/agents/trend-scout.md`: reads `sources.mode`/`sources.*`/`media_focus`
  from the Format file (`data/brands/<slug>/formats/<format>.yaml`) instead of `seeds.yaml`; writes
  Trends to the Format-namespaced path; keeps reading Apify actor slugs from `seeds.yaml` (the ONLY
  thing still read from there — data-handling rule 2 pins actor slugs to `seeds.yaml`).
- [x] 7.3 Rewrite `.claude/agents/idea-strategist.md`: reads `voice`/`ideas_per_run` from the Format
  file instead of `brand-profile.yaml`/`seeds.yaml`; tags every brief's front-matter and every ledger
  record with `format: <formatSlug>`; renames the brief body's media-shape heading from
  "**Format:**" to "**Suggested Recipe:**" (the media-sense retirement, ADR-0009).
- [x] 7.4 ~~Update `.claude/commands/review-ideas.md`'s brief-loading step to derive the
  Format-namespaced brief path from each ledger Idea's own `format` field~~ — **superseded by
  Round 2, §10** (this naive derivation is exactly what QA Round 1's D1 defect caught: it breaks on
  real pre-existing Ideas. See §10.2 for the fix that replaced it.)
- [x] 7.5 Update the one `/run-trends` mention in `src/commands/run-pipeline.ts`'s Gate-1 message to
  name `<format>` (string-only change; conductor stays Brand-scoped — Non-Goals).
- [x] 7.6 Write failing tests, THEN make them pass (`format/format-docs.test.ts`, a regular
  `.test.ts` so `npm test` proves these prompt-level requirements): `/run-trends` requires
  `<format>`, namespaces the Ideas path, and reads `ideas_per_run` from the Format file;
  `trend-scout` names the Format file (not the Brand) as the source of `sources.mode`/sources and
  writes to the Format-namespaced path; `idea-strategist` reads voice from the Format file, tags
  every brief/ledger record with `format:`, and drops the media-sense "Format:" heading.

## 8. OpenSpec

- [x] 8.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `format-store`,
  ADDED `format-scoped-trend-research`, MODIFIED `brand-resolver`, MODIFIED `brand-commands`.
- [x] 8.2 `npx openspec validate issue-53-format-files-formatstore --strict` green.

## 9. Self-review

- [x] 9.1 `npm test` green (type-check + full suite, 739+ tests); confirm the pre-existing
  `producer-agent.docs-test.ts` failures (3, unrelated — stale honesty-string pins from before the
  attended Producer was restored, see repo memory) are unchanged before/after this slice (verified
  via `git stash`).
- [x] 9.2 Simplify / dead-code pass: removed an unused `nonNegativeInt` helper from
  `src/format/store.ts`; confirmed every issue #53 acceptance criterion maps to a named test.
- [x] 9.3 Write the Build Report into `handoff.md`, explicitly flagging that this slice makes zero
  Magnific Space calls (no Space involvement at all — Format files are plain YAML) and listing the
  Non-Goals/Known Limits transparently.

## 10. QA Round 1 fixes (D1 high, D2 low)

- [x] 10.1 Write failing tests (`format/brief-path.test.ts`): a pure `resolveBriefPathCandidates`
  trusts a recorded `brief_path` EXCLUSIVELY (even when `format` is stale/wrong); falls back to
  `[Format-namespaced, legacy]` candidates only when `brief_path` is absent; never throws on a
  garbled `format` value; and — the exact QA repro — every one of the REAL, currently-pending
  `data/brands/straw-motion/ledger.json` `status: suggested` Ideas resolves to a Brief path that
  actually exists on disk.
- [x] 10.2 Implement `resolveBriefPathCandidates` in `src/format/brief-path.ts` (reuses
  `briefShortName`, exported from `src/production-spec/store.ts` for this purpose — the SAME
  id→filename rule the Producer's Spec path already uses, not re-derived).
- [x] 10.3 Rewrite `.claude/commands/review-ideas.md` step 2 to delegate to
  `resolveBriefPathCandidates` instead of hand-building the path from `format`/`run`: try the
  ledger's own `brief_path` first (exclusively, when present), else the Format-namespaced path, else
  the legacy Brand-level path; STOP and report if none exist.
- [x] 10.4 Update `.claude/agents/idea-strategist.md` step 8 to always write `brief_path` VERBATIM
  onto every new ledger record (matching the pre-existing convention the real straw-motion data
  already used, now made explicit) — so every record `resolveBriefPathCandidates` sees going forward
  hits the trusted, single-candidate path, and the Format-namespaced/legacy reconstruction stays a
  rarely-needed fallback for old/hand-authored records only.
- [x] 10.5 Migrate `data/brands/straw-motion/ledger.json`'s 7 real `status: suggested` Ideas'
  `format` field from the retired media-sense value `"reel"` to the real Format slug
  `"unhypped-news"` — a pure data fix (every other field, including `brief_path`, is byte-for-byte
  unchanged) that closes acceptance criterion #2 for this real, currently-pending data, on top of
  (not instead of) the `brief_path`-trusting resolver fix in §10.1–10.3 (which is what actually keeps
  `/review-ideas` working — see the handoff's Round-2 justification for why both were done).
- [x] 10.6 Add spec deltas (`specs/format-store/spec.md`): ADDED "A suggested Idea's Brief path is
  resolved by trusting the ledger's own brief_path first" (+4 scenarios) and ADDED "Pre-existing
  per-Idea format values are migrated off the retired media-sense" (+1 scenario).
- [x] 10.7 Add `format-docs.test.ts` coverage: `idea-strategist.md` always writes `brief_path`
  verbatim; `review-ideas.md` delegates to `resolveBriefPathCandidates`, trusts `brief_path`
  exclusively, and documents the Format-namespaced-then-legacy fallback order.
- [x] 10.8 D2: remove the stale, inert `formats: [reel]` line from the `HEALTHY_PROFILE_YAML` fixture
  strings in `src/commands/run-pipeline.test.ts` and `src/commands/run-pipeline-onboarding.test.ts`.
- [x] 10.9 Re-run `npm test` (755/755), `npm run build` (exit 0), and
  `npx openspec validate issue-53-format-files-formatstore --strict` (valid) — all green.
