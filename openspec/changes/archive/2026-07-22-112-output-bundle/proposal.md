## Why

Issue #112 (epic #106, item 13 + the Round-4 expansion). Today, once a Recipe's Asset is produced, its
downloaded media sits in `idea-NN.<recipe>.assets/` — but the caption/hashtags and the tracking facts
(post URL, posted-at, metrics, score) live only inside `data/brands/<slug>/ledger.json`. To actually
publish, the Operator has to open the ledger, hunt down the right `(Idea, Recipe)` Asset, copy the
caption out by hand, then post the media files from a *different* folder. To later verify how it did,
they repeat the ledger hunt. The one moment the loop most needs to be simple — "here is everything you
need to post this, and later, everything about how it did" — is instead the most scattered.

## What Changes

**One self-contained bundle folder per Asset**, renamed `idea-NN.<recipe>.assets/` →
`idea-NN.<recipe>.output/`, holding:
- the media, in post order (unchanged mechanism — `src/asset/download.ts`'s `downloadAssetFiles`, only
  the destination folder's name changes);
- `caption.txt` — the composed Copy's caption + hashtags, formatted ready to paste into the platform;
- `post.json` — **a generated VIEW of the ledger's own Asset record** (brand, idea id, recipe, format,
  the copy, the ordered media filenames, and the tracking fields: post URL, posted-at, metrics, score) —
  **never a second, hand-maintained store** (always-rule 7). Regenerating it from an unchanged ledger
  yields a byte-identical file.

**A single ledger→bundle generator**, `src/asset/output-bundle.ts`'s `generatePostJson` (pure) plus its
shell `refreshOutputBundle` (loads the named `(brand, idea, recipe)` Asset fresh from the ledger,
resolves the Asset's OWN bundle directory, regenerates `post.json`, writes it) — called at all three
lifecycle steps that touch this Asset's record: the Save phase (produce), `/log-post`, and
`/track-performance`. No second write path exists anywhere for `post.json` — it is only ever produced by
this one function, fed only by the ledger.

**Backward compatible, with no filesystem migration.** `refreshOutputBundle` resolves a given Asset's
bundle directory from the DIRECTORY its own `asset_paths` entries already point into (`dirname` of the
first path) — never from reconstructing a path by name. A brand-new Asset's `asset_paths` point into a
freshly-computed `.output/` directory (`outputDirFor`, the one call site that picks the new name); an
Asset produced before this slice keeps whatever `asset_paths` it already has (typically inside an
`.assets/`-named folder) and `refreshOutputBundle` keeps refreshing `post.json` right there, in place —
no folder is ever renamed on disk, and no ledger entry's `asset_paths` are ever rewritten by this slice.

## Non-Goals (explicitly deferred / out of scope)

- **No filesystem rename/migration of existing `.assets/` folders**, and no rewrite of any existing
  ledger's `asset_paths` strings. Backward compatibility is achieved by resolving from the ledger's own
  recorded paths, never by moving files or editing old records.
- **No change to `LedgerAssetRecord`'s schema.** `post.json` is a projection of fields that already
  exist on the Asset (`asset.ts`) — no new ledger field is added.
- **The leftover, in-progress HITL run files**
  (`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json`,
  `data/brands/straw-motion/ledger.json`) — a separate, concurrent run; explicitly left untouched. Their
  `asset_paths` (if any) may still say `.assets/`; that is exactly the backward-compat case this slice
  is designed to leave alone, not "fix".
- **Live-Magnific / live-Apify testing.** `output-bundle.ts` has no Space/Apify call of its own — it only
  reads the ledger (already-fake-driven in every caller's own tests) and writes plain files.
- **A CLI-visible text change to `/log-post`/`/track-performance`'s own printed output.** The bundle
  refresh is a documented side effect proven by reading the written files, not by a new substring in the
  commands' returned message (keeps every pre-existing exact-text assertion in both commands' test
  suites unaffected).

## Capabilities

### Added Capabilities

- `asset-output-bundle`: the new `src/asset/output-bundle.ts` deep module — `outputDirFor`,
  `generatePostJson`/`PostJson`, `captionText`, `writePostJson`/`writeCaptionText`,
  `refreshOutputBundle` — the self-contained publish + tracking bundle and its one ledger→bundle
  generator.

### Modified Capabilities

- `post-attribution`: `/log-post` additionally refreshes the named Asset's `post.json` (via
  `refreshOutputBundle`) once it has written `post_url`/`posted_at`.
- `performance-tracking`: `/track-performance` additionally refreshes each tracked Asset's `post.json`
  (via `refreshOutputBundle`) once it has written `metrics`/`performance_score`.
- `producer-conductor`: `producer.md`'s Save phase downloads media into the Asset's `.output/` directory
  (`outputDirFor`, replacing the old `.assets/` name), writes `caption.txt`, and — after the ledger
  write — calls `refreshOutputBundle` for the initial `post.json`.

## Impact

- **Added:** `src/asset/output-bundle.ts`, `src/asset/output-bundle.test.ts`.
- **Modified:** `src/commands/log-post.ts` (+ test), `src/commands/track-performance.ts` (+ test),
  `.claude/agents/producer.md` (Save phase), `src/production-spec/producer-agent.docs-test.ts` (new pins
  for the Save-phase rewrite), `.claude/commands/log-post.md`, `.claude/commands/track-performance.md`,
  `CLAUDE.md`, `README.md`, `src/asset/download.test.ts` (example path only, cosmetic).
- **Not touched:** `src/asset/asset.ts`, `src/asset/store.ts`, `src/asset/migrate.ts`,
  `src/ledger/migrate-assets.ts`, `src/recipe/registry.ts`, `src/phase-resolver/resolve.ts` (studied per
  the issue's "where to look" list; none needed a change — `LedgerAssetRecord`'s schema and the
  Recipe registry are both untouched by this slice), any `data/brands/**` file.
- **Hermetic:** no live `spaces_*`/`creations_*`/Apify call anywhere in the diff; every new/changed test
  uses plain temp files and the existing `downloadAssetFiles` fetch-stub pattern.
- **Always-rules upheld:** ledger-as-source-of-truth (rule 7) is the spine of this whole slice —
  `post.json` is provably a generated, never a parallel, store; generate-never-publish, public-metrics-
  only, relative-not-absolute, and explicit-attribution are all untouched by this slice's scope.
