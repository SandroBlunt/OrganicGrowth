# Slice Handoff — issue-53-format-files-formatstore

> Bidirectional developer ⇄ qa channel for this slice. The developer writes the Build Report; qa appends
> a Verdict; retries append Round-N blocks. Nothing is overwritten.

## Build Report (developer)

### What changed

Slice 1 of the 7-slice multi-format epic (#53–#60): made **Format** (a Brand's editorial line —
ADR-0009) a first-class, on-disk concept and scoped trend research to one Format at a time
(ADR-0013), behind a typed store boundary (ADR-0014).

- **Per-Format YAML file schema + typed `FormatStore`** (`src/format/store.ts`): a pure, defensive
  parser (`parseFormatFile`, `deriveSourceMode`) and a thin I/O shell (`loadFormat`,
  `listFormatSlugs`, `formatFilePath`, `formatIdeasRoot`) reading
  `data/brands/<slug>/formats/<formatSlug>.yaml` — `{ name, niche, voice, media_focus, sources:
  {mode, seed_pages, curated_sources, keywords, lookback_days, overperformance_only},
  ideas_per_run, default_recipes }`. Reuses `normalizeSeeds`/`NormalizedSeed` from
  `readiness/check-config.ts` for off-niche seed handling (one rule, not two). A missing Format
  throws a clear, actionable error listing the Brand's actually-available Formats; a malformed one
  throws naming the file path. `src/brand/resolver.ts` gains `BrandPaths.formatsRoot`.
- **mundotip and straw-motion are migrated**: `data/brands/mundotip/formats/life-hacks.yaml` (peer
  mode, its real seed pages including the structured `off_niche` entry) and
  `data/brands/straw-motion/formats/unhypped-news.yaml` (curated mode, its real curated sources) —
  both carry `default_recipes: [character-explainer-with-cast]`. `brand-profile.yaml`'s old
  media-sense `formats: [reel]` field is removed everywhere (schema, template, both real Brands).
- **`/run-trends <brand> <format>` now requires the Format argument** (no silent default); its Run
  output is namespaced under `data/brands/<slug>/ideas/<format>/<run>/`. `trend-scout` reads its
  peer-vs-curated `sources.mode` and actual sources from the Format file (never `seeds.yaml` — that
  file now only supplies Apify actor slugs, per data-handling rule 2). `idea-strategist` reads
  `voice`/`ideas_per_run` from the Format file and tags every brief + ledger record with
  `format: <formatSlug>`; the brief body's old "**Format:** Reel…" media-sense heading is renamed to
  "**Suggested Recipe:**" (ADR-0009's retirement of the media sense of "format").
- **Scaffolder gains a `formats/` directory** (`templates/brand-skeleton/formats/.gitkeep`) so every
  newly scaffolded Brand has one from day one.
- This slice touches **zero Magnific Space code** — Format files are plain YAML resolved and parsed
  entirely on disk. The existing Magnific-fake-backed test suite (`space-driver/**`,
  `production-spec/**`) is completely untouched.

See `proposal.md`'s **Non-Goals** section for what is intentionally deferred (Recipe registry #54,
per-Asset ledger/queue re-grain #55/#56, the Producer's Spec path, and readiness/`/run-pipeline`
Format-awareness) and why each is safe to defer without breaking today's single-recipe path.

### Files touched

**New:**
- `src/format/store.ts` — the FormatStore deep module.
- `src/format/store.test.ts` — 44 tests (pure parsing, path resolution, directory listing, I/O
  errors, and a describe block that loads the two REAL migrated Brand Format files).
- `src/format/format-docs.test.ts` — 10 tests pinning the Format-scoping requirements in
  `run-trends.md`/`trend-scout.md`/`idea-strategist.md` (a regular `.test.ts`, not `.docs-test.ts`,
  since these prompt-level behaviors ARE the acceptance criteria here, not incidental doc
  conformance — see "Fakes / fixtures used" below).
- `data/brands/mundotip/formats/life-hacks.yaml`, `data/brands/straw-motion/formats/unhypped-news.yaml`.
- `templates/brand-skeleton/formats/.gitkeep`.
- `openspec/changes/issue-53-format-files-formatstore/{proposal.md,tasks.md,handoff.md,specs/**}`.

**Modified:**
- `src/brand/resolver.ts` (+ `resolver.test.ts`) — `BrandPaths.formatsRoot`.
- `src/brand/scaffolder.ts` (+ `scaffolder.test.ts`) — drops `formats` from `BrandProfileContent`/
  `buildBrandProfile`.
- `src/brand/scaffold-brand.test.ts` — asserts the `formats/` dir is created.
- `src/readiness/check-config.ts` (+ `check-config.test.ts`) — drops the unused `formats?` field.
- `src/commands/run-pipeline.ts` — one string: the Gate-1 `/run-trends` hint now names `<format>`.
- `templates/brand-skeleton/brand-profile.yaml`, `data/brands/{mundotip,straw-motion}/brand-profile.yaml`
  — drop `formats: [reel]`; add a pointer comment to the new Format file.
- `.claude/commands/run-trends.md`, `.claude/agents/trend-scout.md`, `.claude/agents/idea-strategist.md`
  — rewritten for real (not "target") Format-scoped behavior.
- `.claude/commands/review-ideas.md` — one paragraph: briefs load from the Format-namespaced path
  via each ledger Idea's own `format` field.

**Not touched (see Non-Goals):** `producer.md`, `CLAUDE.md`, `CONTEXT.md`, `src/production-spec/**`,
`src/production-queue/**`, `src/ledger/ledger.ts`, `src/space-driver/**`, `src/readiness/classify.ts`,
`src/commands/run-pipeline-readiness.ts`.

### How to run

```bash
npm test                     # tsc -p tsconfig.json --noEmit  +  node --import tsx --test "src/**/*.test.ts"
npm run build                 # tsc -p tsconfig.build.json (exit 0)
npx openspec validate issue-53-format-files-formatstore --strict

# just this slice:
node --import tsx --test "src/format/*.test.ts"
node --import tsx --test "src/brand/*.test.ts" "src/readiness/*.test.ts" "src/commands/run-pipeline.test.ts"
```

Full suite: **743 tests / 223 suites, all passing.** Type-check (`tsc --noEmit`) and `npm run build`
both exit 0.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | Per-Format YAML schema + typed `FormatStore`; voice/sources/mode read from the Format, not the Brand | `src/format/store.test.ts` (`parseFormatFile`, `deriveSourceMode` describe blocks — 20 tests); `format-docs.test.ts`'s "trend-scout reads..." and "idea-strategist tags... and reads voice from it" blocks assert the prompts name the Format file, explicitly NOT the Brand |
| 2 | mundotip + straw-motion migrated; media-sense `formats:[reel]`/per-Idea `format` no longer means media type | `store.test.ts`'s "mundotip and straw-motion are migrated..." describe block (4 tests, loads the REAL files + confirms `brand-profile.yaml` carries no `formats` key); `scaffolder.test.ts`'s "does NOT set a formats field" test; `format-docs.test.ts`'s "retires the media-sense 'Format:' heading" test |
| 3 | `/run-trends <brand> <format>` requires the format arg; run path namespaced by Format; `ideas_per_run` per-Format | `format-docs.test.ts`'s "/run-trends requires an explicit Format argument" describe block (3 tests: usage line, namespaced path, `ideas_per_run` source) |
| 4 | trend-scout reads mode+sources from the Format file; idea-strategist tags every Idea with its Format | `format-docs.test.ts`'s trend-scout (3 tests) and idea-strategist (4 tests) describe blocks |
| 5 | Built test-first against the fake Magnific Space; single-recipe path stays green; `openspec validate --strict` + full suite green | No Space code touched at all (see "Fakes / fixtures used"); `space-driver/**`/`production-spec/**`/`production-queue/**` test suites unchanged and still pass (part of the 743); `npx openspec validate issue-53-format-files-formatstore --strict` → "is valid"; `npm test` → 743/743 pass |

Every task in `tasks.md` is checked off with the test(s) that satisfy it named inline.

### Fakes / fixtures used

- **The Magnific fake is NOT invoked by this slice at all** — no code added or changed here touches
  `src/space-driver/**`, and no test in this slice constructs a `FakeSpace`. Format files are plain
  YAML, resolved and parsed entirely on disk (`node:fs/promises` + the `yaml` package). No live
  `spaces_*`/`creations_*` calls, no credits, no board mutation — trivially true since the Space is
  never reached for.
- The existing `space-driver/**` and `production-spec/**` test suites (which DO use the Magnific
  fake) are unchanged and still pass as part of the 743-test full suite — proving "the current
  single-recipe path stays green."
- Filesystem fixtures: `mkdtemp`/temp directories for `FormatStore` unit tests (mirrors
  `resolver.test.ts`/`scaffold-brand.test.ts`'s existing convention); the REAL
  `data/brands/{mundotip,straw-motion}/formats/*.yaml` files for the AC2 migration tests (default
  `brandsRoot`, no override — proves the actual repo state, not just a synthetic fixture).

### Self-review notes

- Removed an unused `nonNegativeInt` helper from `store.ts` (written speculatively, never called —
  `lookback_days`/`ideas_per_run` both use `positiveInt`).
- Chose to keep `format-docs.test.ts` as a **regular** `.test.ts` (participates in `npm test`)
  rather than a `.docs-test.ts` (excluded from `npm test`, per the existing convention documented in
  `report.docs-test.ts`): AC3/AC4 are core, checked acceptance criteria expressed only at the
  prompt level (there is no compiled runtime for `trend-scout`/`idea-strategist`), so `npm test`
  passing needed to actually prove them, not just documentation hygiene.
- Deliberately did NOT delete `brand-profile.yaml`'s `voice`/`niche` or `seeds.yaml`'s
  `seed_pages`/`curated_sources`/etc. — only `formats: [reel]` (confirmed dead/unused by
  `checkConfig`'s logic before removal, via a full-repo grep). Deleting the others would make
  `readiness/check-config.ts`'s `voice_unset`/`no_valid_seed` checks permanently
  false-positive/false-block for every Brand, since readiness is not Format-aware yet. This is
  spelled out as a Non-Goal in `proposal.md`, not silently left inconsistent.
- Added one committed regression test (`store.test.ts`'s AC2 describe block) instead of leaving the
  Format-file migration as a manual, uncommitted smoke check — the original task plan (5.3) was
  upgraded during self-review once I saw the migration deserved a durable proof, not just a one-time
  `tsx -e` check.
- Verified the 3 pre-existing `producer-agent.docs-test.ts` failures (unrelated stale honesty-string
  pins, see repo memory) are byte-identical before and after this slice via `git stash` — confirms
  this slice introduces zero new regressions in that suite (which is not part of `npm test` anyway).

### Known limits (explicit Non-Goals — see `proposal.md`)

- **The Producer's Spec path is not Format-aware.** A brand-new Format-scoped Idea, if accepted and
  produced today, would have its Brief under `ideas/<format>/<run>/` but its Spec written by the
  unchanged Producer under the OLD `ideas/<run>/` path — breaking the "Spec sits beside its Brief"
  sibling convention until the Recipe/Spec-path slices (#55/#58) land. Existing `accepted`/`casting`
  Ideas from before this slice are entirely unaffected (they have no `format` field and the Producer
  path for them is completely unchanged).
- **`readiness/check-config.ts` and `/run-pipeline`'s conductor stay Brand-scoped.** They still read
  `brand-profile.yaml`'s `voice`/`niche` and `seeds.yaml`'s `seed_pages`/`curated_sources` (now
  legacy/duplicated copies, not read by `trend-scout`/`idea-strategist` any more). Retiring those
  Brand-level copies is deferred to whichever future slice makes readiness Format-aware.
- **The Format-interview onboarding flow is not built.** `run-pipeline.ts`'s new-Brand interview is
  unchanged; only the `formats/` directory itself is scaffolded (empty). A freshly onboarded Brand
  has no Format file until one is hand-authored — `/run-trends` will name this clearly (lists
  available Formats, currently none) rather than silently failing.
- **`default_recipes` is free-text**, not validated against a real Recipe registry (issue #54 is not
  wired yet).
- **CLAUDE.md/CONTEXT.md prose are not flipped to present tense** for this slice (explicitly
  deferred to issue #59 per the epic's own build order) — `CONTEXT.md` already documents the target
  Format model from PR #61, so no further doc change was needed there; `CLAUDE.md`'s pipeline-step
  list still shows the pre-multi-format `/run-trends <brand>` — left alone on purpose.
