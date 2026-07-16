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

---

## QA Verdict — Round 1: FAIL

### Suite result

All automated checks are actually green:

- `npm test` (= `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`) →
  **743 tests / 223 suites / 0 fail / 0 skipped.** Type-check passed first.
- `npm run build` (`tsc -p tsconfig.build.json`) → exit 0.
- `npx openspec validate issue-53-format-files-formatstore --strict` → `Change
  'issue-53-format-files-formatstore' is valid`.
- Ran the Magnific-fake-backed suites directly to double-check the "single-recipe path stays green"
  claim: `node --import tsx --test "src/space-driver/**/*.test.ts" "src/production-spec/**/*.test.ts"
  "src/production-queue/**/*.test.ts" "src/ledger/**/*.test.ts"` → **263 tests / 98 suites / 0 fail**,
  and confirmed via `git diff 31f91f4 34fc7fd -- src/space-driver/ src/production-spec/
  src/production-queue/ src/ledger/` that none of those directories were touched by this slice (0
  diff lines) — the claim holds for the *compiled, tested* single-recipe path.
- Confirmed the 3 pre-existing `producer-agent.docs-test.ts` failures are unrelated: that file was
  last modified in commit `a3dd20a` (well before this slice), is excluded from `npm test` (only
  `src/**/*.test.ts` is globbed; `.docs-test.ts` runs under the separate `npm run test:docs`), and is
  therefore neither a regression from nor a gate for this slice.

Suite result: **green, and honestly so** — the "Suite result" job (a) passes cleanly. The FAIL verdict
below comes from job (b)/(c): a real acceptance-criterion gap the test suite does not catch.

### Per-criterion results

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Per-Format YAML schema + typed `FormatStore`; voice/sources/mode read from the Format, not the Brand | **PASS** | `src/format/store.ts` (`parseFormatFile`, `deriveSourceMode`, `loadFormat`); `src/format/store.test.ts` (44 tests covering parsing, defaults, path resolution, directory listing, I/O errors); `.claude/agents/trend-scout.md`/`idea-strategist.md` explicitly say sources/mode/voice come from the Format file, "NOT from the Brand" (pinned by `format-docs.test.ts`) |
| 2 | mundotip + straw-motion migrated; media-sense `formats:[reel]` / per-Idea `format` no longer means the media type | **FAIL** | The Format-file migration itself is correct and verified (`store.test.ts`'s AC2 describe block loads the real `data/brands/{mundotip,straw-motion}/formats/*.yaml`; `brand-profile.yaml`'s `formats: [reel]` is cleanly removed from schema/template/both real Brands). **But** the *per-Idea* `format` field is not disambiguated from its pre-slice media-sense meaning for already-existing data: `data/brands/straw-motion/ledger.json` currently has 7 real, still-`status: suggested` Ideas (`idea-01`..`idea-07`, run `2026-W29`, created `2026-07-13`, pre-dating this slice) each carrying `format: "reel"` — the OLD media-sense tag. The new `.claude/commands/review-ideas.md` (touched by this slice) now instructs: *"load its brief from the Format-namespaced path `data/brands/<slug>/ideas/<Idea.format>/<run>/idea-NN.md`"* — for these real Ideas that resolves to `data/brands/straw-motion/ideas/reel/2026-W29/idea-01.md`, which does not exist. The real brief is at `data/brands/straw-motion/ideas/2026-W29/idea-01.md` (also already recorded verbatim in the ledger's own `brief_path` field, which the new instructions never consult). See Defect D1. |
| 3 | `/run-trends <brand> <format>` requires the format arg; run path namespaced by Format; `ideas_per_run` per-Format | **PASS** | `.claude/commands/run-trends.md` usage line `/run-trends <brand> <format> [<run-id>]`, "BOTH required"; Ideas root `data/brands/<slug>/ideas/<format>/<run>/`; step 5 sources `ideas_per_run` from the Format file. Pinned by `src/format/format-docs.test.ts`'s "/run-trends requires an explicit Format argument" describe block (3 tests) |
| 4 | trend-scout reads mode+sources from the Format file; idea-strategist tags every Idea with its Format | **PASS** | `.claude/agents/trend-scout.md` Inputs section names `data/brands/<slug>/formats/<format>.yaml` as the source of `sources.mode`/sources, explicitly not `seeds.yaml`; `.claude/agents/idea-strategist.md` step 7 "Tag every Idea with its Format" + guardrail "never omit it". Pinned by `format-docs.test.ts`'s trend-scout (3 tests) and idea-strategist (4 tests) blocks. (Forward-looking correctness only — see D1 for the backward-compatibility gap with pre-existing per-Idea `format` data.) |
| 5 | Built test-first against the fake Magnific Space; the current single-recipe path stays green; `openspec validate --strict` + full test suite green | **PASS for the automated/compiled path; caveat for the operator-facing prompt path** | Zero Space code touched (`git diff` confirms `src/space-driver/**` untouched); 743/743 `npm test`; `openspec validate --strict` green. However, "the current single-recipe path stays green" is not fully true for the *live, real* operator workflow: `/review-ideas straw-motion` (the very next natural command an Operator would run against the currently-pending, real `2026-W29` Ideas) would break per D1 below — this isn't caught by any test because `review-ideas.md` has no automated test coverage at all in this slice (only `run-trends.md`/`trend-scout.md`/`idea-strategist.md` got `format-docs.test.ts` pins). |

### Per-scenario results (spec deltas)

**`format-store` (ADDED) — all PASS:**
- "A fully-populated Format file parses to the typed shape verbatim" → `store.test.ts` "parses every field verbatim" — PASS
- "Off-niche seed pages normalize via the shared readiness helper" → `store.test.ts` "normalizes structured off_niche entries" — PASS
- "parseFormatFile never throws on garbled input" → `store.test.ts` "never throws on completely garbled input" — PASS
- "deriveSourceMode infers curated only when curated_sources is actually populated" → `store.test.ts` deriveSourceMode block — PASS
- "formatFilePath resolves under the Brand's formats/ directory" → `store.test.ts` "resolves the Format file path..." — PASS
- "A path-traversal Format slug is rejected before any I/O" → `store.test.ts` "rejects a path-traversal Format slug..." — PASS
- "listFormatSlugs returns exactly the .yaml basenames, sorted" → `store.test.ts` — PASS
- "listFormatSlugs on a Brand with no formats/ directory returns []" → `store.test.ts` — PASS
- "loadFormat throws naming the Brand, the missing Format, and the real alternatives" → `store.test.ts` — PASS
- "loadFormat throws a clear parse error naming the path for malformed YAML" → `store.test.ts` — PASS
- "Both real Brands' Format files load through the FormatStore" → `store.test.ts` AC2 block — PASS
- "A freshly scaffolded Brand's profile carries no formats field" → `scaffolder.test.ts` — PASS

**`format-scoped-trend-research` (ADDED):**
- "The documented usage requires both Brand and Format" → `format-docs.test.ts` — PASS
- "trend-scout and idea-strategist write to the Format-namespaced path" → `format-docs.test.ts` (text-pin only) — PASS
- "The documented behavior sources ideas_per_run from the Format file" → `format-docs.test.ts` — PASS
- "trend-scout's documented Inputs name the Format file..." → `format-docs.test.ts` — PASS
- "idea-strategist's documented process tags every Idea with its Format" → `format-docs.test.ts` — **PASS on its own narrow terms (the prompt text says the right thing going forward), but this Requirement's text never accounts for pre-existing per-Idea `format` values written before this slice under the old meaning — see D1.**
- "idea-strategist reads voice from the Format, not the Brand" → `format-docs.test.ts` — PASS
- "idea-strategist's documented brief shape uses Suggested Recipe, not a media Format heading" → `format-docs.test.ts` — PASS

**`brand-commands` (MODIFIED):**
- "trend-scout threads the Brand AND the Format through all its file I/O" → covered at the text level by `format-docs.test.ts`; no behavioral/integration test exists (inherent to a prompt-driven agent) — PASS (text-level)
- "producer restates the Brand at Gate 2 (Cast pick)" → unrelated to this slice (producer.md untouched); pre-existing behavior, not re-verified here — not this slice's responsibility
- "always-rules hold per Brand" → general/pre-existing, unaffected by this slice — PASS (unchanged)

**`brand-resolver` (MODIFIED):**
- "slug→paths resolution returns all per-Brand paths for a given slug (incl. `formatsRoot`)" → `resolver.test.ts` — PASS
- "listBrands returns exactly the Brand directories" → pre-existing, unaffected — PASS
- "brandExists returns true only when the Brand directory exists" → pre-existing, unaffected — PASS
- "slugify yields a filesystem-safe, lowercase slug" → pre-existing, unaffected — PASS

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish logic touched or added; `producer.md`/`src/space-driver/**` untouched (confirmed by empty `git diff`) |
| Public-metrics-only | PASS | trend-scout's Apify usage is unchanged; only its *config source* (mode/sources) moved from `seeds.yaml` to the Format file — the over-performance computation logic itself is untouched |
| Relative-not-absolute | PASS | `sources.overperformance_only` / baseline-relative over-performance logic is unchanged; only relocated to read from the Format file |
| Explicit-attribution | PASS | No changes to `/log-post` or Post↔Idea linking; unaffected by this slice |
| Ledger-as-source-of-truth | PASS (with the D1 caveat noted separately) | `src/ledger/ledger.ts` is untouched (0 diff lines); the ledger is still the sole thing `review-ideas.md`/`idea-strategist.md` read/write for status. D1 is a *path-resolution* bug in a downstream consumer of a ledger field, not a violation of the ledger being canonical |
| Magnific fake (no live-Space calls) | PASS | `grep -rn "spaces_\|creations_\|FakeSpace\|MagnificSpace" src/format/` → no matches; `git diff 31f91f4 34fc7fd -- src/space-driver/ src/production-spec/ src/production-queue/ src/ledger/` → 0 lines changed; this slice's own tests never construct a `FakeSpace`; the Magnific-fake-backed suites (263 tests) still pass unmodified |

### Defect list

**D1 — HIGH — `/review-ideas`'s new Format-namespaced brief-loading logic breaks on real, currently-pending Ideas whose per-Idea `format` field still carries the pre-slice media-sense value.**

What's wrong: `.claude/commands/review-ideas.md` step 2 (added by this slice) says every suggested
Idea's brief lives at `data/brands/<slug>/ideas/<Idea.format>/<run>/idea-NN.md`. This is correct for
Ideas suggested *after* this slice lands (their `format` is genuinely an editorial-Format slug like
`life-hacks`/`unhypped-news`, and their briefs really do live under that namespaced path). It is
**incorrect** for Ideas that were suggested *before* this slice, whose `format` field (when present)
still holds the retired *media-sense* value (e.g. `"reel"`) and whose briefs live at the
non-namespaced, Brand-level path `data/brands/<slug>/ideas/<run>/idea-NN.md`.

This is not a hypothetical: `data/brands/straw-motion/ledger.json` currently has 7 real Ideas
(`idea-01`..`idea-07`, run `2026-W29`, `status: "suggested"`, created `2026-07-13`) each with
`"format": "reel"`. Per the new instructions, loading their briefs resolves to
`data/brands/straw-motion/ideas/reel/2026-W29/idea-01.md` — a path that does not exist. Their real
brief is at `data/brands/straw-motion/ideas/2026-W29/idea-01.md`, which is also already recorded
verbatim in each Idea's own `brief_path` field in the ledger (`"brief_path":
"data/brands/straw-motion/ideas/2026-W29/idea-01.md"`) — a field the new instructions never consult.

Why this matters: this is squarely inside acceptance criterion #2 ("the media-sense `formats:[reel]`
/ per-Idea `format` no longer means the media type") and the issue's stated bar ("Keep the current
single-recipe path green throughout"). Straw Motion's 7 pending Ideas are real, awaiting-review
content from the current week — the very next natural `/review-ideas straw-motion` an Operator runs
would hit this. The developer's own Known Limits note ("Existing `accepted`/`casting` Ideas from
before this slice are entirely unaffected — they have no `format` field") is true for
`accepted`/`casting` Ideas but does not hold for `status: suggested` Ideas, which is exactly the
status `/review-ideas` operates on — this population was not checked before writing the Known Limits
section.

Repro steps:
1. `python3 -c "import json; d=json.load(open('data/brands/straw-motion/ledger.json')); [print(i['id'], i['status'], i.get('format'), i.get('brief_path')) for i in d['ideas']]"` — shows 7 Ideas, `status: suggested`, `format: "reel"`, and a real `brief_path` pointing at the non-namespaced path.
2. Read `.claude/commands/review-ideas.md` step 2 on the current branch: it directs loading the brief from `data/brands/<slug>/ideas/<Idea.format>/<run>/idea-NN.md`.
3. Compute that path for `idea-01`: `data/brands/straw-motion/ideas/reel/2026-W29/idea-01.md`.
4. `ls data/brands/straw-motion/ideas/reel/2026-W29/idea-01.md` → no such file or directory.
5. The real file is at `data/brands/straw-motion/ideas/2026-W29/idea-01.md` (confirm with `ls`), which is also already stored verbatim in the same ledger record's `brief_path` field from step 1.

Suggested direction for the fix (not prescriptive — developer's call): either (a) have
`review-ideas.md` prefer the ledger's own `brief_path` field when present, falling back to the
Format-namespaced path only when `brief_path` is absent, or (b) explicitly migrate/clear the stale
media-sense `format` value on pre-existing `status: suggested` ledger records as part of this slice's
migration step (alongside the `brand-profile.yaml` cleanup), or (c) have `review-ideas.md` fall back
to the legacy Brand-level `ideas/<run>/` path when the Format-namespaced path doesn't exist. Any of
these needs a regression test (there is currently no automated test at all for `review-ideas.md`'s
brief-loading step — `format-docs.test.ts` only pins `run-trends.md`/`trend-scout.md`/
`idea-strategist.md`).

**D2 — LOW — stale `formats: [reel]` left in two test fixtures after the field's removal.**

What's wrong: `src/commands/run-pipeline.test.ts:73` and
`src/commands/run-pipeline-onboarding.test.ts:94` still embed a literal `formats: [reel]` line inside
their `HEALTHY_PROFILE_YAML` fixture strings, even though `BrandProfile`/`BrandProfileContent` no
longer declare that field anywhere else in the codebase. This is inert (the YAML parser simply
ignores the unrecognised key, so no test behavior is affected — confirmed: `npm test` is green) and
is not a functional defect, but it is a leftover inconsistency from the migration that a `grep -rn
"formats:" src/` would have caught.

Repro steps:
1. `grep -n "formats: \[reel\]" src/commands/run-pipeline.test.ts src/commands/run-pipeline-onboarding.test.ts` — both hits.
2. Compare against `grep -n "formats" src/brand/scaffolder.ts src/readiness/check-config.ts` — the field is gone everywhere except these two fixtures.

### Overall

**QA Verdict — Round 1: FAIL.** The build compiles clean, the full test suite is genuinely green
(743/743), `openspec validate --strict` passes, no live Magnific/Space calls exist anywhere in this
slice, and 4 of the 5 acceptance criteria are fully met with real test coverage. The blocker is D1: a
concrete, reproducible regression against real, currently-pending production data (Straw Motion's 7
`status: suggested` Ideas) that acceptance criterion #2 and the issue's "keep the current single-recipe
path green" bar both require to keep working, caused by the updated `review-ideas.md` conflating the
old media-sense per-Idea `format` value with the new editorial-Format meaning without a migration or a
fallback. Handing D1 (and, optionally, the low-severity D2) back to the developer for a fix + a
regression test, then re-verifying, is the recommended next step.

---

## Build Report — Round 2 (developer)

### What changed (D1 + D2 fixes)

**D1 (high) — fixed by trusting the ledger's own `brief_path`, AND migrating the stale data.** QA's
repro was exact and reproducible: `review-ideas.md`'s Round-1 logic hand-built a Brief path from
`ideas/<Idea.format>/<run>/idea-NN.md`, which is wrong whenever a record's `format` doesn't match
where its Brief actually physically sits. I chose to do **both** of QA's suggested directions, not
just one, because they fix different things:

1. **Primary, load-bearing fix — trust `brief_path` (QA's option (a)).** Added
   `resolveBriefPathCandidates(idea, brand, brandsRoot?)` in a new deep module
   (`src/format/brief-path.ts`, PURE — no I/O): when a ledger record carries a non-empty
   `brief_path`, that value is returned VERBATIM as the ONLY candidate — never second-guessed by
   reconstructing a path from `format`/`run`. This is the fix that actually makes `/review-ideas`
   work again, and it is robust even against a CORRECT `format` value, because the real straw-motion
   Briefs physically live at the pre-namespacing path regardless of what their `format` field says
   (confirmed by a real-data test — see below). Only when `brief_path` is absent does the resolver
   reconstruct `[Format-namespaced, legacy]` candidates, in that order. Rewrote
   `.claude/commands/review-ideas.md` step 2 to delegate to this resolver instead of hand-building
   the path, and updated `.claude/agents/idea-strategist.md` step 8 to always write `brief_path`
   verbatim on every NEW ledger record going forward (matching the convention the real straw-motion
   data already used, now made an explicit, tested requirement) — so future records always hit the
   trusted, single-candidate branch, and the Format-namespaced/legacy reconstruction stays a rare
   fallback for old/hand-authored records only.
2. **Secondary, data-hygiene fix — migrate the stale value (QA's option (b)).** Also migrated
   `data/brands/straw-motion/ledger.json`'s 7 real `status: suggested` Ideas' `format` field from the
   retired media-sense value `"reel"` to the real Format slug `"unhypped-news"` (every other field,
   including `brief_path`, is byte-for-byte unchanged). This is NOT what fixes `/review-ideas` (fix
   #1 does that, and does it regardless of what `format` says) — it closes acceptance criterion #2
   ("the per-Idea `format` no longer means the media type") for real, currently-pending data, and
   avoids leaving these 7 records semantically wrong for whatever later slice (#55's per-Asset
   ledger reshape) next reads their `format` field meaningfully.

I did NOT pursue QA's option (c) (fall back to the legacy path when the Format-namespaced path
doesn't exist) as a separate mechanism — it's subsumed by fix #1's fallback order (Format-namespaced
THEN legacy), which only ever activates for the no-`brief_path` case anyway.

**D2 (low) — fixed.** Removed the stale, inert `formats: [reel]` line from the
`HEALTHY_PROFILE_YAML` fixture strings in `src/commands/run-pipeline.test.ts` and
`src/commands/run-pipeline-onboarding.test.ts` (confirmed via `grep -rn "formats:" src/` that no
other stale references remain anywhere in the codebase).

### Files touched (Round 2, on top of Round 1)

**New:**
- `src/format/brief-path.ts` — `resolveBriefPathCandidates` (pure).
- `src/format/brief-path.test.ts` — 7 tests: pure priority-order behavior (4 tests) PLUS a test that
  loads the REAL `data/brands/straw-motion/ledger.json` and asserts every one of its 7 real
  `status: suggested` Ideas resolves to a Brief path that **actually exists on disk** (the exact QA
  D1 repro, now a permanent regression test) — plus a sanity assertion that the Round-1 broken
  Format-namespaced reconstruction path does NOT exist, so this test would fail again if the old
  logic ever came back.

**Modified:**
- `.claude/commands/review-ideas.md` — step 2 rewritten to delegate to
  `resolveBriefPathCandidates`, trusting `brief_path` exclusively, falling back to
  Format-namespaced-then-legacy only when absent, and stopping to report if no candidate exists.
- `.claude/agents/idea-strategist.md` — step 8 now instructs always writing `brief_path` verbatim.
- `src/production-spec/store.ts` — added `export` to the existing, otherwise-UNCHANGED
  `briefShortName` helper, so `brief-path.ts` reuses the same idea-id→filename rule the Producer's
  Spec path already uses instead of re-deriving it. Zero behavior change to `specPathFor` or any
  Producer code path.
- `src/format/format-docs.test.ts` — +4 tests: `idea-strategist.md` always writes `brief_path`
  verbatim; `review-ideas.md` delegates to `resolveBriefPathCandidates`, trusts `brief_path`
  exclusively, and documents the Format-namespaced-then-legacy fallback order.
- `src/format/store.test.ts` — +1 test: straw-motion's real pending Ideas carry `format:
  "unhypped-news"`, never `"reel"`.
- `data/brands/straw-motion/ledger.json` — the 7-record `format` migration described above.
- `src/commands/run-pipeline.test.ts`, `src/commands/run-pipeline-onboarding.test.ts` — D2: dropped
  the stale `formats: [reel]` fixture line.
- `openspec/changes/issue-53-format-files-formatstore/{proposal.md,tasks.md,specs/format-store/spec.md}`
  — updated for the Round-2 changes (2 new ADDED Requirements + 5 new Scenarios in `format-store`;
  task §10 documents the D1/D2 fix work; `proposal.md`'s What Changes/Impact/Capabilities updated).

### How to run

Same commands as Round 1 (`npm test`, `npm run build`,
`npx openspec validate issue-53-format-files-formatstore --strict`). Just the D1 regression coverage:

```bash
node --import tsx --test "src/format/brief-path.test.ts"
node --import tsx --test "src/format/store.test.ts" -- # includes the migrated-format assertion
```

Full suite: **755 tests / 226 suites, all passing** (was 743/223 at Round 1 — +12 tests: 7 in
`brief-path.test.ts`, 4 in `format-docs.test.ts`, 1 in `store.test.ts`). Type-check and
`npm run build` both exit 0. `openspec validate --strict` → valid.

### Defect resolution self-assessment

| Defect | Fix | Proven by |
|---|---|---|
| D1 (high) | `resolveBriefPathCandidates` trusts `brief_path` exclusively; `review-ideas.md` delegates to it; `idea-strategist.md` always writes `brief_path`; straw-motion's 7 stale `format` values migrated | `brief-path.test.ts`'s real-data test (loads the actual `data/brands/straw-motion/ledger.json`, asserts every candidate exists on disk); `brief-path.test.ts`'s 6 pure unit tests (priority order, fallback, never-throws); `store.test.ts`'s new "carries the real Format slug" test; `format-docs.test.ts`'s 4 new prompt-conformance tests |
| D2 (low) | Removed stale `formats: [reel]` from 2 test fixtures | `grep -rn "formats:" src/` now shows zero stale hits (confirmed manually; the fixtures are string literals, not type-checked, so no compile-time proof was possible — verified by inspection instead) |

### Self-review notes (Round 2)

- Considered adding a `saveFormat`-style write shell so `idea-strategist.md`'s "always write
  brief_path" instruction could be backed by a typed writer, but that would mean building ledger
  write helpers that are squarely `ledger.ts`'s territory (out of scope — Non-Goals) — the prompt
  instruction is sufficient for this slice, matching how `format:` tagging itself was already
  prompt-only in Round 1.
- Deliberately made `resolveBriefPathCandidates` return an ORDERED LIST of candidates (not a single
  resolved path with internal existence-checking I/O) so it stays a PURE deep module, consistent with
  every other resolver in this codebase (`formatFilePath`, `specPathFor`) — the existence-checking
  loop belongs to the caller (the `/review-ideas` prompt, or a test), matching the "orchestration
  shell decides, deep module computes" split from CLAUDE.md.
- Verified with a fresh `grep -rn "formats:" src/ templates/ data/` that no other stale `formats:
  [reel]`-shaped leftovers exist anywhere else in the repo before closing out D2.
- Re-ran `npm test`/`npm run build`/`openspec validate --strict` after every edit in this round (not
  just once at the end) to catch a regression as early as possible; all green throughout.

### Known limits (unchanged from Round 1, still accurate)

All Round-1 Known Limits still hold (Producer Spec-path Format-unawareness, readiness/`run-pipeline`
staying Brand-scoped, no Format-interview onboarding flow, free-text `default_recipes`, docs prose
deferred to issue #59) — none of them are affected by the D1/D2 fixes. One addition:

- **`resolveBriefPathCandidates`'s Format-namespaced/legacy reconstruction branch is now largely
  theoretical for straw-motion/mundotip's CURRENT data** (every real `status: suggested` record has
  a `brief_path`), but is still real, tested behavior for whatever future record might lack one
  (e.g. a hand-authored brief, or a future writer that forgets to set it) — kept as a defensive
  fallback, not dead code.
