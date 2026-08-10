## Why

Unhypped Daily's second treatment (design session 2026-08-10): every accepted story Idea also becomes a
ready-to-record short video script. The Operator records ~6 per morning (≤1 hour total) and publishes to
YouTube — https://www.youtube.com/@strawmotion, the measured Channel for this Recipe. ADR-0021
(`docs/adr/0021-space-less-recipe-script-assets.md`, built generically in issue #170) decided a Recipe's
Space target becomes optional and proved the generic Space-less plumbing against a throwaway fixture.
This slice registers the REAL **News Short Script** Recipe on top of that plumbing: its own
Production-Spec contract (a teleprompter script + Shot List), its own best-effort Shot List media
collector (this Recipe's "render" step, since it has no Space), its own YouTube-native Copy shape
(title + description), and its own authoring Skill (`produce-news-short-script`, ADR-0018).

## What Changes

- **The `news-short-script` Recipe is registered** (`src/recipe/registry.ts`): zero gates, no `space`/
  `canvasInputs` (ADR-0021) — offered at Review the instant it is wired, via the existing
  `isWiredRecipe`/`offeredRecipes` machinery (no changes needed there). Its `copySkill` stays
  `"write-social-copy"`, the same shared copy step both other Recipes already use.
- **A new Production-Spec contract, validator, and banned-word scan**
  (`src/production-spec/news-short-script-contract.ts` / `-validate.ts` / `-brand-safety.ts`), mirroring
  the News Carousel Recipe's own per-Recipe-shape pattern: an ordered `beats` array (`"hook"` first,
  `"cta"` last, at least one `"story"` beat between), each beat carrying `text` (the teleprompter line),
  `source_url`, an optional `media_url` ("when one is identifiable"), and a one-line `show_cue` — plus a
  whole-Spec total word-count band (120–150 words, targeting 45–60 seconds at a fast pace). The
  banned-word scan covers EVERY beat text field (`text`, `show_cue`, `source_url`, `media_url`).
- **A new, best-effort Shot List media collector** (`src/asset/shot-list-media.ts`) — this Recipe's own
  "render" step (ADR-0021: a Space-less Recipe's render step collects media instead of rendering it): for
  each beat with a `media_url`, attempts a download (video preferred, i.e. whatever the author identified
  as the specific clip); on success the file lands in the `.output/` bundle; on failure — or when a beat
  names no `media_url` at all — it falls back to a link, explicitly marked with why. A failed download
  (or fetch throwing) NEVER fails the job — every beat always resolves to either `"downloaded"` or
  `"link"`, never an exception. Downloading is fully injectable (`ShotListDownloader`); tests use a local
  fake, never a real network fetch.
- **Copy widens, additively, to support a title + description shape** — `CopyShape` gains an optional
  `titleMaxChars` (`src/copy/contract.ts`), `Copy` gains an optional `title`; `validateCopy`
  (`src/copy/validate.ts`) checks `title` (required, length-bounded, banned-word/dash-scanned) ONLY when
  `shape.titleMaxChars` is set — a no-op for both existing Recipes, which never set it. YouTube's
  documented platform bounds (`src/copy/platform-shape.ts`) gain `titleMaxChars: 100`, so
  `validateCopyForPlatform(copy, "youtube", ...)` enforces the same ≤100-char title rule. YouTube is added
  to Straw Motion's `brand-profile.yaml` Channel list. A new deterministic drafter,
  `newsShortScriptDraftCopy` (`src/copy/news-short-script-draft.ts`), is this Recipe's own
  "deterministic, testable proof" stand-in for the real Skill's drafting step (mirroring `skillDraftCopy`'s
  role for `write-social-copy`) — it derives a ≤100-char `title` from the Idea's own title and a
  description body from `angle`/`mediaContext`, both through the SAME shared assembly/validation
  machinery. `injectRequiredParts` and `parseCopy`/`cloneCopy` are updated to carry `title` through
  untouched (never silently dropped on a ledger round-trip or in `post.json`).
- **The output bundle gains a title line and a script file** — `captionText` (`src/asset/output-bundle.ts`)
  prepends a `Title: …` line when `copy.title` is present (a no-op otherwise — byte-for-byte unchanged for
  both existing Recipes). A new module, `src/asset/news-short-script-output.ts`, renders the Spec's beats
  into ONE clean, copy-paste-ready teleprompter text (`scriptText`/`writeScriptText`, written as
  `script.txt`) and a separate human-readable Shot List manifest (`shotListText`/`writeShotListText`,
  written as `shot-list.txt`) naming each beat's show cue, source, and whether its media was downloaded or
  linked.
- **A new authoring Skill, `produce-news-short-script`** (`.claude/skills/produce-news-short-script/`,
  ADR-0018): reads the Format's Baseline Prompt pointer (`baseline_prompts: news-short-script`), authors
  the script + Shot List in that voice, self-checks against the author Phase Contract, and emits the Spec
  through the spec store — mirroring `produce-news-carousel`'s shape. `write-social-copy`'s own SKILL.md
  gains a short, additive section describing how to compose a title + description Copy for a Recipe whose
  `copyShape` declares `titleMaxChars` (today: this Recipe alone) — through the SAME deterministic
  checkers, never a second copy Skill.
- **A new end-to-end test** (`src/producer/news-short-script-end-to-end.test.ts`) drives the REAL, wired
  `news-short-script` Recipe through author → bind-media (no-op) → gate (no-op) → Shot List media
  collection (fake downloader, mixed downloaded/link outcomes) → copy (title + description) → save →
  output bundle (media + `script.txt` + `shot-list.txt` + `caption.txt` + `post.json`) — importing no
  `SpaceMcpPort`/Magnific fake anywhere, proving zero Magnific calls in this Recipe's whole path.

## Non-Goals (explicitly out of scope for this slice)

- The real Unhypped Daily Baseline Prompt document from issue #173 is NOT depended on — this slice
  builds/tests against a fixture Baseline Prompt document only (per the issue's own instruction); wiring
  a real `formats/unhypped-daily.yaml` Format file (with a `news-short-script.md` Baseline Prompt pointer)
  is out of scope (launch dependency, tracked separately).
- The daily curated feed list (issue #168) and any live YouTube publishing workflow are out of scope.
- Per-Channel performance tracking for YouTube specifically (ADR-0019 keeps tracking scoped to the
  Brand's one primary Channel) — this slice only adds YouTube to the Channel LIST for Copy composition
  purposes; it is not marked `primary` and `/track-performance` is untouched.
- Any change to the Schedule Batch / Zoho bulk-export path — a script Asset publishes manually, exactly
  as ADR-0021's own "Consequences" section says.

## Capabilities

### Added Capabilities

- `news-short-script-recipe`: the Recipe's own Production-Spec contract, Shot List media collection, and
  script/shot-list output rendering — the headline new behavior this slice adds.

### Modified Capabilities

- `recipe-registry`: a third registry entry, `news-short-script` (zero gates, no Space).
- `production-spec`: two new Requirements — the News Short Script Spec's validator and its banned-word
  scan (mirroring the News Carousel Requirements' own shape).
- `copy-composition`: `CopyShape`/`Copy` gain an optional `title`/`titleMaxChars`; `validateCopy` checks
  it when declared; YouTube's platform bounds gain `titleMaxChars: 100`; a new deterministic drafter.
- `asset-output-bundle`: `captionText` renders an optional title line.
- `producer-conductor`: the wired News Short Script Recipe runs end-to-end with zero Magnific calls.
- `producer-skill`: the new `produce-news-short-script` Skill; `write-social-copy` documents composing a
  title + description Copy.

## Impact

- **New code:** `src/production-spec/news-short-script-contract.ts` (+`.test.ts`),
  `-validate.ts` (+`.test.ts`), `-brand-safety.ts` (+`.test.ts`), a fixtures file
  (`src/production-spec/fixtures/news-short-script-specs.ts`); `src/asset/shot-list-media.ts`
  (+`.test.ts`); `src/asset/news-short-script-output.ts` (+`.test.ts`);
  `src/copy/news-short-script-draft.ts` (+`.test.ts`); `src/producer/news-short-script-end-to-end.test.ts`;
  `.claude/skills/produce-news-short-script/SKILL.md` (+
  `src/production-spec/produce-news-short-script-skill.docs-test.ts`).
- **Modified code:** `src/recipe/registry.ts` (+`.test.ts`) — third Recipe entry; `src/copy/contract.ts`,
  `src/copy/validate.ts` (+`.test.ts`), `src/copy/inject.ts` (+`.test.ts`), `src/copy/platform-shape.ts`
  (+`.test.ts`), `src/copy/draft.ts` (export two previously-private helpers, zero behavior change);
  `src/asset/output-bundle.ts` (+`.test.ts`), `src/asset/asset.ts` (`parseCopy` carries `title` through);
  `data/brands/straw-motion/brand-profile.yaml` (YouTube added to the Channel list, non-primary);
  `.claude/skills/write-social-copy/SKILL.md` (+`src/copy/write-social-copy-skill.docs-test.ts`, additive
  assertions only).
- **Hermetic, no live Space anywhere.** This Recipe has no Space at all — no new Magnific fake is added
  or needed; `news-short-script-end-to-end.test.ts` imports none. The Shot List media collector's own
  test uses a local, in-memory fake downloader — never a real network fetch.
- **Always-rules upheld:** generate-never-publish (the Asset is written, never posted); public-metrics-
  only/relative-not-absolute (no metrics code touched); explicit-attribution (`/log-post` untouched);
  ledger-as-source-of-truth (the new end-to-end test writes through the same, unmodified `writeAsset`).
