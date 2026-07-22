## 1. Ground the current Save phase + backward-compat surface before touching anything

- [x] 1.1 Read `src/asset/asset.ts`, `src/asset/store.ts`, `src/asset/migrate.ts`,
  `src/ledger/migrate-assets.ts` in full: confirm `LedgerAssetRecord.asset_paths` already exists
  (durable local paths, in slide order) and needs NO schema change; confirm `AssetStore.writeAsset`'s
  merge-patch shape so `refreshOutputBundle` can read the SAME ledger `writeAsset` just wrote.
- [x] 1.2 Read `src/asset/download.ts` + `download.test.ts` in full: confirm `downloadAssetFiles` is
  already destDir-agnostic (never hardcodes a folder name) — only the CALLER's chosen `destDir` needs
  to change from `.assets` to `.output`, not this module.
- [x] 1.3 Read `src/production-spec/store.ts` in full: confirm `briefShortName`/`specPathFor`'s exact
  path-construction convention (`<ideasRoot>/<run>/idea-NN.<recipe>.<suffix>`) to mirror for
  `outputDirFor`, and that `briefShortName` is already exported for reuse.
- [x] 1.4 Read `src/ledger/ledger.ts` in full: confirm `LedgerIdea.format` is already carried through
  read-only, and `loadIdeas`/`findIdea` are the right, already-tolerant (un-migrated-safe) read path
  for `refreshOutputBundle` to build on — never a second raw ledger reader.
  Read `src/recipe/registry.ts`, `src/phase-resolver/resolve.ts` fully too, per the issue's "where to
  look" list — confirmed NEITHER needs a change (no Recipe-specific output-bundle config; no
  phase-resolver involvement — the bundle is Asset-grain, not phase-grain).
- [x] 1.5 Read `src/commands/log-post.ts` + `log-post.test.ts`, `src/commands/track-performance.ts` +
  `track-performance.test.ts` in full: confirm every existing test asserts the returned string with
  `assert.match` (substring), never full equality — so appending a new, silent side effect after the
  existing `writeAsset` call cannot break any pre-existing assertion.
  Read `src/commands/pick.ts` in full: confirmed it is queue-mechanics only (never touches the ledger),
  so it is NOT a Save-phase call site — the ledger Asset write (and therefore the FIRST `post.json`)
  only ever happens via the live `producer` agent's own `writeAsset` call, per `producer.md`'s Save
  phase (mirrored by the fake-Space-driven end-to-end tests).
- [x] 1.6 Grep the whole repo for the literal `.assets/` — confirms exactly the four non-generated
  touch points beyond the guardrail-protected data files: `README.md`, `.claude/agents/producer.md`,
  CLAUDE.md, and `src/asset/download.test.ts`'s own example path string (cosmetic). Confirm the
  guardrail-protected leftover files (`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}
  .news-carousel.spec.json`, `data/brands/straw-motion/ledger.json`) are the ONLY other hits and are
  never edited by this slice.
- [x] 1.7 Read `openspec/specs/asset-store/spec.md`, `post-attribution/spec.md`,
  `performance-tracking/spec.md`, and `producer-conductor/spec.md` in full to ground the spec deltas in
  the REAL current capability text, never duplicating or contradicting an existing Requirement.

## 2. `src/asset/output-bundle.ts` — the generator + path builder (test-first)

- [x] 2.1 Write `src/asset/output-bundle.test.ts` FIRST (failing): `outputDirFor` mirrors
  `specPathFor`'s convention but with `.output` in place of `.spec.json`; `generatePostJson` returns
  every AC4-listed field, with explicit `null`s for not-yet-known tracking fields, `media` as ORDERED
  BASENAMES of `asset_paths` (never full paths, never re-ordered), and is provably pure/idempotent
  (same inputs → deep-equal output, called twice); `captionText` is paste-ready (caption, blank line,
  space-joined hashtags, trailing newline) and degrades cleanly with zero hashtags.
- [x] 2.2 Implement `outputDirFor`, `PostJson`, `generatePostJson`, `captionText` in
  `src/asset/output-bundle.ts` (pure; no disk, no clock). Run 2.1: green.
- [x] 2.3 Add `describe` blocks to 2.1 FIRST (failing) for the shell half: `writePostJson`/
  `writeCaptionText` write to disk (pretty JSON + trailing newline / paste-ready text) and are
  idempotent at the FILE level (two consecutive writes from an unchanged input → byte-identical file);
  `refreshOutputBundle` — ok case (resolves the dir from `asset_paths`' own dirname, writes `post.json`
  there), unknown-idea / unknown-recipe / no-local-media skip cases (never throws, never writes), and
  the AC5 backward-compat case (a LEGACY `.assets/`-named `asset_paths` resolves and refreshes IN THAT
  SAME folder — never renamed, never crashes).
- [x] 2.4 Implement `writePostJson`, `writeCaptionText`, `refreshOutputBundle`. Run 2.3: green.
- [x] 2.5 Write ONE composition test proving AC1 end-to-end against the fake fetch stub (mirrors
  `download.test.ts`'s own stub pattern — no Magnific fake needed, since media download is already
  decoupled from the Space driver at this boundary): `outputDirFor` → `downloadAssetFiles` (N ordered
  targets) → `writeCaptionText` → `writeAsset` (ledger, `asset_paths` = the download results, in order)
  → `refreshOutputBundle`; asserts the `.output/` directory contains the media files (in order) +
  `caption.txt` + `post.json`, and `post.json`'s `media` array matches the download order exactly.
- [x] 2.6 Write the explicit AC2 idempotence test at the SHELL level (not just the pure-function level):
  call `refreshOutputBundle` twice against an unchanged ledger; read `post.json` after each call; assert
  the two reads are byte-identical strings, not just deep-equal objects.

## 3. Wire the refresh into `/log-post` and `/track-performance` (test-first)

- [x] 3.1 Add a NEW test to `log-post.test.ts` FIRST (failing): seed a `produced` Asset whose
  `asset_paths` point into a temp `.output/`-style directory; after `logPostCommand` succeeds, read
  `post.json` from that directory and assert it carries the just-logged `post_url`/`posted_at`. Add a
  second test proving the pre-existing "no asset_paths yet" case (every OTHER seed in this file) still
  returns its EXACT prior message and still writes nothing extra — no regression.
- [x] 3.2 Call `refreshOutputBundle(brand, ideaId, recipe, { ledgerPath })` in `logPostCommand`, right
  after the existing `writeAsset` call, on the success path only. Run 3.1 + the WHOLE pre-existing
  `log-post.test.ts` file: green, zero regressions.
- [x] 3.3 Add a NEW test to `track-performance.test.ts` FIRST (failing): seed a `posted` Asset with
  `asset_paths` set; after `trackPerformanceCommand` runs, read `post.json` and assert it carries the
  freshly-written `metrics`/`performance_score`/`tracked_at`. Add a second test for TWO Assets on one
  Idea (mirrors the file's own existing "two independent scores" scenario) proving each Asset's
  `post.json` is refreshed independently, in its own directory.
- [x] 3.4 Call `refreshOutputBundle(brand, pickIdeaId, asset.recipe, { ledgerPath })` inside
  `trackPerformanceCommand`'s per-Asset loop, right after the existing per-Asset `writeAsset` call. Run
  3.3 + the WHOLE pre-existing `track-performance.test.ts` file: green, zero regressions.
- [x] 3.5 Re-run `src/producer/two-recipes-end-to-end.test.ts` + `carousel-end-to-end.test.ts` (both call
  `logPostCommand`/`trackPerformanceCommand` but never set `asset_paths`): confirm both stay green
  unmodified — proves the new refresh call degrades to a harmless no-op (`no-local-media`) when there is
  no local bundle directory to refresh, exactly the pre-existing-test safety net task 1.5 predicted.

## 4. Rename `.assets/` → `.output/` everywhere it was used (docs + the one cosmetic test path)

- [x] 4.1 Rewrite `.claude/agents/producer.md`'s "Save phase" section: `destDir` computed via
  `outputDirFor` (→ `.output/`, not `.assets/`); write `caption.txt` via `writeCaptionText`; after the
  ledger write, call `refreshOutputBundle` for the initial `post.json`; state the backward-compat rule
  in plain terms (an Asset produced before this slice keeps its OLD `.assets/`-named folder — never
  renamed). Every pre-existing pinned substring in `producer-agent.docs-test.ts` stays present
  (`Production Spec`, `never publish`, `ADR-0008`, `awaiting_pick`, no `awaiting_cast`, `recipe`
  backtick, `thin,\s*recipe-generic conductor`, `bindMediaSlots`/`ADR-0016`, `auditAuthorPhase`/
  `auditBindMediaPhase`/`auditCopyPhase`/`ADR-0017`, `driveToNextGate`/`Recipe.gates`, no "Selected
  Character"/"Character Variants Generator"/"Slides Prompts"/quoted "Brand Logo", the whole watermark
  block).
- [x] 4.2 Add a new `describe` block to `src/production-spec/producer-agent.docs-test.ts` FIRST (failing
  against the pre-edit doc): pins that producer.md's Save phase names `outputDirFor`/`.output/`,
  `caption.txt`, `refreshOutputBundle`/`post.json`, and states the backward-compat rule for an existing
  `.assets/`-named Asset — never claims every Asset now lives under `.output/`. Then land 4.1; run
  green.
- [x] 4.3 Update `CLAUDE.md`'s State section (`ideas/…/idea-NN.<recipe>.assets/` bullet) and
  `README.md`'s State table row to describe the `.output/` bundle (media + `caption.txt` + `post.json`,
  generated view) and the same backward-compat rule, in each doc's own existing voice/format.
- [x] 4.4 Add a short new bullet to `.claude/commands/log-post.md` and `.claude/commands/
  track-performance.md` documenting that each command refreshes the Asset's `post.json`.
- [x] 4.5 Update `src/asset/download.test.ts`'s example destination-directory literal from
  `"idea-01.news-carousel.assets"` to `"idea-01.news-carousel.output"` (cosmetic — `downloadAssetFiles`
  itself is destDir-agnostic, proven unaffected by re-running the file). Confirm (by design, not by
  edit) that `openspec/changes/archive/2026-07-21-110-logo-guardrail-shrink-pill/proposal.md` and the
  guardrail-protected `data/brands/straw-motion/**` leftovers are NEVER touched — archived changes are
  historical record, not live documentation.

## 5. OpenSpec

- [x] 5.1 Author `proposal.md` (this file's sibling), this `tasks.md`, and four spec deltas:
  `asset-output-bundle` (ADDED), `post-attribution` (MODIFIED), `performance-tracking` (MODIFIED),
  `producer-conductor` (MODIFIED).
- [x] 5.2 `openspec validate 112-output-bundle --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite; baseline 1429 pass / 0 fail → record the new total,
  net delta, zero regressions).
- [x] 6.2 `npm run test:docs` green (baseline 96 pass / 0 fail → record the new total, zero
  regressions).
- [x] 6.3 Simplify pass: confirm every issue #112 acceptance criterion maps to a named, passing test;
  confirm `generatePostJson`/`refreshOutputBundle` is the ONLY place `post.json` is ever written
  (grep the whole diff for `"post.json"` string literals — every hit should be inside
  `output-bundle.ts` or a test); confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm
  the leftover W29/ledger files were never opened this session; confirm no git command was run; remove
  any dead code/unused import introduced along the way.
- [x] 6.4 Write the Build Report into `handoff.md`: what changed, files touched (incl. the full list of
  places the rename reached), how to run, per-AC self-assessment mapping each AC to its proving test,
  the generator's idempotence guarantee explained precisely, the backward-compat mechanism explained
  precisely, fakes/fixtures used (explicitly: no Magnific fake needed, only the pre-existing
  fetch-stub pattern), self-review notes, known limits.
