# asset-output-bundle Specification

## Purpose
TBD - created by archiving change 112-output-bundle. Update Purpose after archive.
## Requirements
### Requirement: outputDirFor names a new Asset's bundle directory `idea-NN.<recipe>.output`

`src/asset/output-bundle.ts` SHALL export `outputDirFor(ideaId, run, ideasRoot, recipe)` — a pure
function returning `<ideasRoot>/<run>/idea-NN.<recipe>.output`, mirroring
`src/production-spec/store.ts`'s `specPathFor`/`briefShortName` id→filename convention exactly (reusing
`briefShortName`, never re-deriving it), but with the `.output` suffix in place of `.assets`. This is
the ONE call site that picks the new folder name for a brand-new Asset; every other function in this
module resolves an EXISTING Asset's bundle directory from its own recorded `asset_paths` instead (see
the backward-compatibility Requirement below), never by re-deriving this path.

#### Scenario: outputDirFor mirrors specPathFor's own id/run/recipe convention

- **GIVEN** `ideaId: "idea-2026-W29-01"`, `run: "2026-W29"`, `ideasRoot: "data/brands/straw-motion/ideas"`,
  `recipe: "news-carousel"`
- **WHEN** `outputDirFor(ideaId, run, ideasRoot, recipe)` is called
- **THEN** it returns `data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.output`

#### Scenario: outputDirFor never returns the retired .assets name

- **GIVEN** any well-formed `(ideaId, run, ideasRoot, recipe)`
- **WHEN** `outputDirFor` is called
- **THEN** the returned path ends with `.output`, never `.assets`

### Requirement: generatePostJson is the ONE pure ledger→bundle generator; post.json is never a second store

`src/asset/output-bundle.ts` SHALL export a pure function `generatePostJson(brand, idea, asset)` that
builds the ENTIRE `PostJson` view from only its three arguments — no disk access, no clock, no hidden
state — carrying `brand`, `idea_id`, `recipe`, `format` (the Idea's own `format`, or `null` when
absent), `copy` (the Asset's structured `{ caption, hashtags }`, or `null` when not yet composed),
`media` (the Asset's `asset_paths`, mapped to their bare FILENAMES only, in the SAME order — never
re-ordered, never a full path), `post_url`, `posted_at`, `performance_score`, `metrics`, and
`tracked_at` (each the Asset's own value, or `null` when absent). This SHALL be the ONLY function in
the codebase that assembles a `PostJson`; no other module SHALL construct one by hand. Because it is
pure and reads nothing but its arguments, calling it twice with equal arguments SHALL always return
deep-equal results — this is the idempotence guarantee `post.json` depends on: regenerating it from an
UNCHANGED ledger can never drift, because there is no second input it could drift from.

#### Scenario: A freshly-produced Asset's fields all appear, tracking fields explicitly null

- **GIVEN** an Asset with `recipe`, `asset_paths` (3 entries), and `copy`, but no `post_url`/
  `performance_score`/`metrics`/`tracked_at` yet
- **WHEN** `generatePostJson(brand, idea, asset)` is called
- **THEN** the result's `copy` and `media` are populated, and `post_url`, `posted_at`,
  `performance_score`, `metrics`, `tracked_at` are all explicitly `null` (present as keys, not omitted)

#### Scenario: media lists ordered basenames, never full paths, never re-ordered

- **GIVEN** an Asset with `asset_paths: ["data/brands/x/ideas/r/idea-01.recipe.output/1-then.png",
  "data/brands/x/ideas/r/idea-01.recipe.output/0-hook.png"]` (deliberately NOT alphabetical — the
  Asset's own recorded ORDER is post order, and must be preserved exactly)
- **WHEN** `generatePostJson` is called
- **THEN** the result's `media` is `["1-then.png", "0-hook.png"]` — same order as `asset_paths`, bare
  filenames only

#### Scenario: generatePostJson is pure — identical inputs always yield deep-equal output

- **GIVEN** the same `(brand, idea, asset)` triple
- **WHEN** `generatePostJson` is called twice
- **THEN** both results are deep-equal, and neither call mutates its inputs

### Requirement: captionText renders a paste-ready caption + hashtags

`src/asset/output-bundle.ts` SHALL export a pure `captionText(copy)` returning the caption body,
followed by a blank line and the hashtags space-joined (when any are present), ready to paste directly
into the platform — never re-wrapping or otherwise rewriting the caption text itself. With zero
hashtags it SHALL return just the caption body (no dangling blank line).

#### Scenario: Caption + hashtags render as caption, blank line, then space-joined hashtags

- **GIVEN** `{ caption: "Three AI giants shipped agentic tools this week.", hashtags: ["#AInews",
  "#tech"] }`
- **WHEN** `captionText(copy)` is called
- **THEN** the result is the caption, a blank line, then `"#AInews #tech"`

#### Scenario: Zero hashtags renders just the caption, no dangling blank line

- **GIVEN** `{ caption: "See what changed.", hashtags: [] }`
- **WHEN** `captionText(copy)` is called
- **THEN** the result contains the caption and no trailing blank-line-plus-nothing artifact

### Requirement: refreshOutputBundle resolves an Asset's OWN bundle directory — backward compatible by construction

`refreshOutputBundle(brand, ideaId, recipe, options)` SHALL load `ideaId` fresh from the Brand's ledger
(`options.ledgerPath`), find `recipe`'s Asset, and resolve the bundle directory to write into as the
DIRECTORY of the Asset's OWN FIRST `asset_paths` entry (`dirname`) — NEVER by reconstructing a path from
the Idea/run/recipe by name. This is what makes an Asset produced before this slice (whose `asset_paths`
still point into an `.assets/`-named folder) keep working with zero migration: `refreshOutputBundle`
writes `post.json` wherever that Asset's files actually already live, whatever that folder is named — it
never renames a folder and never rewrites `asset_paths`. It SHALL then call the SAME `generatePostJson`
every other caller uses and write the result to `<that directory>/post.json`.

#### Scenario: A NEW Asset's post.json lands in its .output/ directory

- **GIVEN** an Asset whose `asset_paths` all point inside an `idea-01.news-carousel.output/` directory
- **WHEN** `refreshOutputBundle(brand, ideaId, "news-carousel", options)` is called
- **THEN** `post.json` is written inside that SAME `.output/` directory

#### Scenario: A LEGACY Asset's post.json lands in its existing .assets/ directory — never renamed

- **GIVEN** an Asset produced before this slice, whose `asset_paths` all point inside an existing
  `idea-01.news-carousel.assets/` directory (real files already there)
- **WHEN** `refreshOutputBundle(brand, ideaId, "news-carousel", options)` is called
- **THEN** `post.json` is written inside that SAME `.assets/` directory — no folder is renamed, no
  `asset_paths` entry is rewritten, and the pre-existing media files are untouched

#### Scenario: Regenerating post.json from an unchanged ledger yields a byte-identical file

- **GIVEN** a ledger that does not change between two calls
- **WHEN** `refreshOutputBundle` is called twice in a row for the same `(brand, ideaId, recipe)`
- **THEN** the `post.json` file's bytes on disk are identical after both calls

### Requirement: refreshOutputBundle never fabricates — an unresolvable Asset is skipped, never a thrown error or an invented directory

`refreshOutputBundle` SHALL return a discriminated `{ ok: false, reason }` — never throw, and never
write any file — when: `ideaId` does not exist in the ledger (`"unknown-idea"`); `recipe` does not name
one of that Idea's recorded Assets (`"unknown-recipe"`); or the found Asset has no `asset_paths` at all
yet (`"no-local-media"` — there is no known local bundle directory to write into). This mirrors the
codebase's existing never-fabricate posture (`/log-post`'s `unknown-recipe` refusal, `/track-performance`'s
SKIPPED lines) at this module's own boundary.

#### Scenario: An unknown Idea returns ok:false without writing anything

- **GIVEN** a ledger with no Idea matching `ideaId`
- **WHEN** `refreshOutputBundle(brand, ideaId, recipe, options)` is called
- **THEN** it returns `{ ok: false, reason: "unknown-idea" }` and writes no file

#### Scenario: An Asset with no asset_paths yet is skipped, not guessed at

- **GIVEN** an Idea whose named Recipe's Asset exists but has no `asset_paths` (e.g. still `queued`, or
  a legacy record that only ever carried the remote `asset_url` fallback)
- **WHEN** `refreshOutputBundle` is called
- **THEN** it returns `{ ok: false, reason: "no-local-media" }` and writes no file — it never invents a
  directory to write into

