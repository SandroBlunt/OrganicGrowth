## ADDED Requirements

### Requirement: The wired News Short Script Recipe runs end-to-end with zero Magnific calls (issue #174)

The thin Producer's path for the `news-short-script` Recipe SHALL run author (Spec authored + saved,
self-audited) -> bind-media (`bindMediaSlots` with an empty resolutions map, vacuously `ok: true`,
nothing bound — no `canvasInputs` at all) -> gate (zero declared gates, nothing pauses) -> render (this
Recipe's OWN render step: `collectShotListMedia`, best-effort, never throwing) -> copy (a title +
description Copy, composed + self-audited) -> save (`writeAsset` with `asset_paths` set to the
downloaded Shot List media's local paths, then the `.output/` bundle written: media + `script.txt` +
`shot-list.txt` + `caption.txt` + `post.json`) — with `usesSpace(recipe)` `false` throughout and NO
`SpaceMcpPort`/Magnific fake import anywhere in this path's test.

#### Scenario: usesSpace(news-short-script Recipe) is false

- **GIVEN** `getRecipe("news-short-script")`
- **WHEN** `usesSpace(recipe)` is called
- **THEN** it returns `false`

#### Scenario: The whole path produces a produced Asset carrying spec_path, asset_paths, and a title-carrying Copy

- **GIVEN** an accepted Idea and the `news-short-script` Recipe
- **WHEN** the Recipe's author -> bind-media -> gate -> render -> copy -> save path runs, using a LOCAL
  FAKE Shot List downloader (never a real network fetch)
- **THEN** the ledger's Asset for `(idea, "news-short-script")` has `status: "produced"`, a non-empty
  `spec_path`, a non-empty `asset_paths` (the downloaded beats' local file paths), and a `copy.title`
  within the Recipe's own `copyShape.titleMaxChars`

#### Scenario: The .output/ bundle carries the teleprompter script, the Shot List manifest, the paste-ready caption, and post.json

- **GIVEN** the same produced Asset
- **WHEN** its `.output/` bundle directory is inspected
- **THEN** `script.txt`, `shot-list.txt`, `caption.txt`, and `post.json` all exist, `script.txt` contains
  no beat labels or URLs (a single copy-paste-ready teleprompter file), and `post.json`'s `copy.title`
  round-trips the composed title

### Requirement: producer.md documents branching on usesSpace, skipping canvas work for a Space-less Recipe (ADR-0021, issue #174)

`.claude/agents/producer.md` SHALL document checking `src/producer/uses-space.ts`'s `usesSpace(recipe)`
as part of resolving the Recipe (step 1 of "The queue job"): when `true`, the Bind/Watermark/Drive-the-
canvas phases run exactly as already documented; when `false` (a **Space-less Recipe**, ADR-0021 —
today: `news-short-script`), the Producer SHALL skip Bind, Watermark, and Drive-the-canvas ENTIRELY and
instead run that Recipe's own render step — collecting the Shot List's media via
`src/asset/shot-list-media.ts`'s `collectShotListMedia(spec, destDir, options)`, `destDir` being the
SAME `outputDirFor(...)` directory the Save phase writes into, best-effort and never failing the job —
before continuing into the shared Copy phase exactly as any other Recipe does. The Save phase SHALL be
documented to set a Space-less Recipe's `asset_paths` from `downloadedMediaPaths(shotListResults)`
(never `downloadAssetFiles`, which has no Magnific creation to download for this kind of Recipe) and to
write two Recipe-specific files into the same `.output/` directory alongside `caption.txt`/`post.json`:
`script.txt` (`src/asset/news-short-script-output.ts`'s `writeScriptText` — the single, copy-paste-ready
teleprompter script) and `shot-list.txt` (`writeShotListText` — the Shot List manifest).

#### Scenario: producer.md instructs checking usesSpace before any canvas work

- **GIVEN** `.claude/agents/producer.md`
- **WHEN** its "Resolve the Recipe" step and its Bind/Watermark/Drive-the-canvas section headers are
  inspected
- **THEN** each names `usesSpace(recipe)` and states that phase applies only when it is `true`

#### Scenario: producer.md documents the Space-less render step and its two extra output-bundle files

- **GIVEN** `.claude/agents/producer.md`
- **WHEN** it is inspected for its Space-less Recipe documentation
- **THEN** it names `collectShotListMedia`, `downloadedMediaPaths`, `writeScriptText`/`script.txt`, and
  `writeShotListText`/`shot-list.txt` by name, and states a failed download never fails the job
