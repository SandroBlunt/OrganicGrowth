# Slice Handoff — issue #112: News Carousel self-contained publish + tracking output bundle

Bidirectional handoff for `112-output-bundle`. This file carries `developer` ⇄ `qa` communication only —
not a session handoff, not OpenSpec's `tasks.md`.

## Build Report (developer, Round 1)

### What changed

Each Recipe's Asset now writes and keeps refreshed a **self-contained bundle folder**,
`idea-NN.<recipe>.output/` (renamed from `idea-NN.<recipe>.assets/`), holding everything the Operator
needs to post and later track that Asset:

- the media, in post order (unchanged mechanism — `downloadAssetFiles`, only the destination folder's
  name changes);
- `caption.txt` — the composed Copy's caption + hashtags, paste-ready;
- `post.json` — a **generated VIEW of the ledger's own Asset record** (brand, idea id, recipe, format,
  copy, ordered media filenames, and the tracking fields: post URL, posted-at, metrics, score) — never a
  second, hand-maintained store (always-rule 7).

**One new deep module, `src/asset/output-bundle.ts`,** is the entire mechanism:

- `outputDirFor(ideaId, run, ideasRoot, recipe)` — pure; mirrors `production-spec/store.ts`'s
  `specPathFor`/`briefShortName` convention exactly, with `.output` in place of `.assets`. This is the
  ONE call site anywhere in the codebase that picks the new folder name — used only at produce time,
  before an Asset has any `asset_paths` yet.
- `generatePostJson(brand, idea, asset)` — **the single, pure ledger→bundle generator.** Given the same
  three arguments it always returns a deep-equal result, because it reads nothing else — no disk, no
  clock, no hidden state. `post.json`'s idempotence guarantee IS this function's purity: there is no
  second input for it to drift from.
- `captionText(copy)` — pure; caption body, blank line, space-joined hashtags, paste-ready.
- `writePostJson` / `writeCaptionText` — thin atomic-write shells.
- `refreshOutputBundle(brand, ideaId, recipe, { ledgerPath })` — **the one shell every lifecycle step
  calls.** Loads the named Asset fresh from the ledger, resolves the bundle directory as `dirname` of
  the Asset's OWN first `asset_paths` entry (never a name reconstructed from the Idea/run/Recipe),
  regenerates `post.json` via `generatePostJson`, and writes it there. Never throws for an unresolvable
  target (unknown Idea/Recipe, or an Asset with no `asset_paths` yet) — it returns
  `{ ok: false, reason }` and writes nothing.

**This is also the entire backward-compatibility mechanism, with zero filesystem migration.** Because
`refreshOutputBundle` resolves a bundle directory from the Asset's own recorded `asset_paths` rather than
reconstructing a name, an Asset produced before this slice — whose `asset_paths` still point into an
`.assets/`-named folder — keeps working with no code path change at all: `post.json` simply starts
appearing inside that SAME old folder the next time `/log-post` or `/track-performance` touches it. No
folder is ever renamed, no `asset_paths` entry is ever rewritten.

**Wired at all three lifecycle steps, exactly as the issue asked:**

- **Produce** (proven end-to-end in `output-bundle.test.ts`'s composition test — see Fakes below):
  `outputDirFor` → `downloadAssetFiles` → `writeCaptionText` → `writeAsset` (the ledger write) →
  `refreshOutputBundle` (the initial `post.json`). `.claude/agents/producer.md`'s Save phase now
  documents this exact sequence, replacing the retired `.assets/` destination.
- **`/log-post`** (`src/commands/log-post.ts`): calls `refreshOutputBundle` right after its existing
  `writeAsset` call, on the success path only — never changing the command's own returned text.
- **`/track-performance`** (`src/commands/track-performance.ts`): calls `refreshOutputBundle` inside its
  per-Asset loop, right after that Asset's own `writeAsset` call — independently per Asset, so two
  Recipes on one Idea each refresh their OWN `post.json`.

### Files touched

**Added:**
- `src/asset/output-bundle.ts` — the module described above.
- `src/asset/output-bundle.test.ts` — 23 tests.
- `openspec/changes/112-output-bundle/{proposal.md,tasks.md,handoff.md,specs/**}`.

**Modified — the rename + wiring:**
- `src/commands/log-post.ts` — calls `refreshOutputBundle` after `writeAsset`; doc comment updated.
- `src/commands/log-post.test.ts` — 3 new tests (`+76` lines).
- `src/commands/track-performance.ts` — calls `refreshOutputBundle` per Asset after `writeAsset`; doc
  comment updated.
- `src/commands/track-performance.test.ts` — 4 new tests (`+131` lines).
- `.claude/agents/producer.md` — Save-phase section rewritten: `.output/` (via `outputDirFor`) replaces
  `.assets/` as a NEW Asset's download destination; documents `caption.txt`/`writeCaptionText`,
  `refreshOutputBundle`/`post.json` (called AFTER the ledger write), and the backward-compat rule for an
  Asset produced before this slice.
- `src/production-spec/producer-agent.docs-test.ts` — new `describe` block, 6 tests, pinning the
  rewritten Save-phase section (names `outputDirFor`/`.output/`, never the retired `.assets/` destination
  string, `caption.txt`/`writeCaptionText`, `refreshOutputBundle`/`post.json`, "GENERATED VIEW"/"always-
  rule 7", the backward-compat statement, and that every issue #102 finding #3/#4 pin still holds).
- `CLAUDE.md` — State section's `.assets/` bullet rewritten to `.output/` (bundle contents + generator +
  backward-compat sentence).
- `README.md` — State table row rewritten to `.output/`; new "Worth knowing" bullet.
- `.claude/commands/log-post.md` / `.claude/commands/track-performance.md` — one new bullet each,
  documenting the `post.json` refresh.
- `src/asset/download.test.ts` — cosmetic: the example `destDir` literal renamed
  `idea-01.news-carousel.assets` → `.output` (`downloadAssetFiles` itself is destDir-agnostic, so this
  is a naming-consistency fix only, not a behavior change — re-run standalone, still 5/5).
- `src/asset/asset.test.ts` — cosmetic: one example `asset_paths` string in the "parses every optional
  field" fixture renamed `.assets` → `.output` (same reasoning; `parseAssetRecord` does not interpret the
  path's own name — re-run standalone, still 52/52).

**Explicitly NOT touched (studied per the issue's "where to look" list; none needed a change):**
`src/asset/asset.ts`, `src/asset/store.ts`, `src/asset/migrate.ts`, `src/ledger/migrate-assets.ts`,
`src/recipe/registry.ts`, `src/phase-resolver/resolve.ts` (`LedgerAssetRecord`'s schema is unchanged —
`asset_paths` already existed; neither the Recipe registry nor the phase resolver hold any folder-naming
config), `openspec/changes/archive/2026-07-21-110-logo-guardrail-shrink-pill/proposal.md` (archived —
historical record, its own `.assets/` example path documents what was true when it was written; archived
changes are never edited retroactively), and — per the hard guardrails —
`data/brands/straw-motion/ideas/2026-W29/idea-0{1,2,3}.news-carousel.spec.json` and
`data/brands/straw-motion/ledger.json` (confirmed via file mtimes: still Jul 21, before this session
started, vs. Jul 22 for every file this slice actually edited — these were never opened this session).

### How to run

```bash
npm test                    # type-check + full suite (1459 pass / 0 fail)
npm run test:docs           # docs-conformance suite (102 pass / 0 fail)
npx openspec validate 112-output-bundle --strict   # valid
npx openspec validate --all --strict               # Totals: 29 passed, 0 failed

# Individual new/changed files:
node --import tsx --test src/asset/output-bundle.test.ts                     # 23/23
node --import tsx --test src/commands/log-post.test.ts                       # 29/29
node --import tsx --test src/commands/track-performance.test.ts              # 23/23
node --import tsx --test src/production-spec/producer-agent.docs-test.ts     # 24/24
node --import tsx --test src/asset/asset.test.ts                             # 52/52
node --import tsx --test src/asset/download.test.ts                          # 5/5
node --import tsx --test src/producer/two-recipes-end-to-end.test.ts src/producer/carousel-end-to-end.test.ts  # 11/11 (unaffected — neither test sets asset_paths, so refreshOutputBundle degrades to a harmless no-op there)
```

Baseline before this slice (this branch, stacked on #108–#111): 1429 pass / 0 fail (`npm test`), 96 pass
/ 0 fail (`npm run test:docs`). After: **1459 pass / 0 fail** (`npm test`, net +30, zero regressions),
**102 pass / 0 fail** (`npm run test:docs`, net +6, zero regressions).

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| AC1 | Producing an Asset writes its media + `caption.txt` + `post.json` into `idea-NN.<recipe>.output/`, media in post order | `src/asset/output-bundle.test.ts`'s "produce-flow composition (AC1)" block (1 test): composes `outputDirFor` → `downloadAssetFiles` (3 ordered targets) → `writeCaptionText` → `writeAsset` → `refreshOutputBundle` against a fetch stub, and asserts the directory's exact contents (media in order + `caption.txt` + `post.json`), `post.json`'s `media` array matching download order, and `caption.txt`'s exact paste-ready bytes |
| AC2 | `post.json` is generated from the ledger — regenerating it yields the same file; not a separate writable source of truth | `generatePostJson`'s own purity tests (4 tests: pure/idempotent at the object level, never mutates inputs) + `output-bundle.test.ts`'s two shell-level idempotence tests: `writePostJson`'s "writing twice from an unchanged PostJson yields a byte-identical file" and `refreshOutputBundle`'s "regenerating post.json from an UNCHANGED ledger yields a byte-identical file" (reads the actual bytes on disk twice, asserts string equality, not just deep-equal objects) |
| AC3 | `/log-post` refreshes `post.json` with post URL + posted-at; `/track-performance` refreshes it with metrics + score | `log-post.test.ts`'s "refreshes the named Asset's output-bundle post.json" block (3 tests: refresh happens, only the NAMED Recipe's bundle is touched with two Assets, no-asset_paths case never fails the command) + `track-performance.test.ts`'s "refreshes each tracked Asset's output-bundle post.json" block (4 tests: refresh happens with metrics/score, two Assets refresh independently, a SKIPPED Asset's `post.json` is left untouched, no-asset_paths case never fails the run) |
| AC4 | `post.json` carries all listed fields; `caption.txt` is paste-ready (caption + hashtags) | `generatePostJson`'s field-coverage tests (7 tests: every field present with explicit nulls, media as ordered basenames — deliberately unsorted input proves order preservation, empty-asset_paths case, tracking fields once populated, null format, null copy) + `captionText`'s 2 tests (caption + blank line + space-joined hashtags; zero-hashtags case has no dangling blank line) |
| AC5 | `.assets/` → `.output/` rename reflected in `asset_paths` and everywhere the old path was used; nothing breaks — existing runs still resolve | `output-bundle.test.ts`'s explicit "AC5" test: seeds a ledger Asset whose `asset_paths` point into a REAL, pre-existing `.assets/`-named directory (with a real file already inside), calls `refreshOutputBundle`, and asserts `post.json` lands in that SAME `.assets/` directory (never a new `.output/` one), the pre-existing media file is byte-identical/untouched, and no sibling `.output/` directory was ever created. `outputDirFor`'s own 3 tests confirm the NEW-Asset path always ends in `.output`, never `.assets`. `producer-agent.docs-test.ts`'s new block additionally confirms producer.md's prose itself was updated (never describes a NEW Asset's destination as `.assets/`) while still stating the backward-compat rule in plain terms |
| AC6 | `npm test` green, with coverage for the generate + refresh-at-each-lifecycle-step flow | `npm test`: 1459/1459. Direct new-code coverage: `output-bundle.test.ts` (23 tests: path builder, generator, caption renderer, both disk writers, the refresh shell's ok/backward-compat/idempotence/skip paths, and the full produce-flow composition) + `log-post.test.ts`'s 3 new tests + `track-performance.test.ts`'s 4 new tests — 30 tests total directly exercising the new module and its three wired call sites |

### The generator design + how idempotence is guaranteed

`generatePostJson(brand, idea, asset)` is a **pure function with exactly three inputs and no others** —
no disk read, no clock, no ambient state of any kind. It builds and returns a brand-new `PostJson` object
literal every call. Idempotence therefore isn't a property I had to separately enforce (e.g. by sorting
keys or diffing) — it falls straight out of purity: the same `(brand, idea, asset)` triple can only ever
produce the same `PostJson`, because there is nothing else for the output to depend on. `refreshOutputBundle`
is the ONE shell that re-derives its `(brand, idea, asset)` triple from a fresh ledger read every time it
runs, then calls this same function and writes the result — so "regenerate from the ledger" is a literal
description of what happens, not just an aspiration: load → generate → write, every single call, with no
in-memory caching or diffing that could let `post.json` drift out of step with the ledger. The file-level
idempotence tests (byte-identical bytes across two consecutive writes / two consecutive `refreshOutputBundle`
calls against an unchanged ledger) are the end-to-end proof that this purity actually reaches disk
unmodified — `JSON.stringify` on a freshly-built, fixed-key-order object literal is itself deterministic,
so no extra sorting step is needed the way `migrate-assets.ts`'s `deepEqual` needed one for its own,
differently-shaped merge problem.

### The backward-compat mechanism, precisely

`refreshOutputBundle` never asks "is this Asset old or new?" and never branches on a folder-name pattern.
It asks one question only: *where do this Asset's own `asset_paths` already point?* — `dirname(asset_paths[0])`.
That is the bundle directory, whatever it is named. The RENAME is entirely concentrated in ONE function,
`outputDirFor`, which is used ONLY at produce time, before `asset_paths` exists — it is the thing that
DECIDES a brand-new Asset's directory will be called `.output`, not `.assets`. Once `asset_paths` is
written to the ledger (by the Save phase, or already present on an old record), every subsequent
`refreshOutputBundle` call is 100% agnostic to the directory's name. This is why zero filesystem migration
and zero rewriting of existing `asset_paths` entries was needed: an old `.assets/`-named Asset's
`asset_paths` already say `.assets/`, so `refreshOutputBundle` naturally keeps writing `post.json` there
forever, with no special-casing anywhere in the code.

### Fakes / fixtures used

- **No Magnific fake was needed or invoked.** This slice's whole surface — the output-bundle module, its
  wiring into `/log-post`/`/track-performance`, and the Save-phase doc rewrite — sits entirely AFTER
  where the Space has already finished rendering: it works off already-downloaded local files and the
  ledger. `downloadAssetFiles` (unchanged, reused as-is) is itself Space-agnostic — it only needs URLs,
  which is why AC1's produce-flow composition test could prove the whole chain with the SAME hand-rolled
  `fetch` stub `src/asset/download.test.ts` already used (never the network, never a Magnific tool).
  **Explicitly confirmed:** grepped every added/modified file for `spaces_[a-z_]+\(` / `creations_[a-z_]+\(`
  / `mcp__magnific` — zero hits. The `developer` agent was not given, and did not use, the Magnific MCP
  tools this session.
- No Apify fake was needed either — `refreshOutputBundle` never touches `track-performance-port.ts`; the
  new `track-performance.test.ts` tests reuse that file's own pre-existing `fakePort` helper for the
  scrape step exactly as every other test in that file already does.
- The one "fake" in the literal sense is the hand-rolled `fetch` stub (`stubFetch`), copied verbatim in
  shape from `src/asset/download.test.ts`'s own existing helper, used only to prove AC1's produce-flow
  composition never touches the network.

### Self-review notes

- Confirmed `generatePostJson`/`refreshOutputBundle` is the ONLY place `post.json` is ever assembled or
  written: grepped the whole diff for the string literal `"post.json"` — the single hit outside test
  files is `output-bundle.ts`'s own `writePostJson`.
- Confirmed `outputDirFor` is the ONLY call site anywhere in the diff (or the rest of the repo) that
  constructs a NEW `.output`-suffixed path — every other function resolves an EXISTING Asset's directory
  from its own `asset_paths`, which is the deliberate design point that makes backward compatibility free.
- Removed an earlier draft's stray dynamic `await import("./store.ts")` inside the AC1 composition test
  (no reason for a dynamic import there — nothing circular) in favor of a plain top-level `import`.
  Removed a throwaway "sanity check the fixture pattern itself" test from an early draft of
  `track-performance.test.ts` that didn't actually exercise `trackPerformanceCommand` at all.
- `writePostJson`/`writeCaptionText` each call `mkdir(dir, { recursive: true })` — a one-line, harmless
  duplication kept deliberately: each function needs to be independently correct/safe to call in
  isolation (both are exercised standalone in tests), so extracting a shared one-line helper would trade
  a trivial duplication for an extra indirection with no real benefit.
- Confirmed `noUncheckedIndexedAccess` is satisfied by construction: `asset.asset_paths?.[0]` already
  types as `string | undefined`, matching the explicit `undefined` check used to decide `"no-local-media"`
  — no `!` non-null assertions were needed anywhere in the new module.
- `tsc --noEmit` (part of `npm test`) is clean; no unused imports/locals anywhere in the diff.
- Verified via `git status` + file mtimes (the guardrail-protected files are all `Jul 21`, every file
  this slice touched is `Jul 22`) that the leftover W29/ledger files were never opened this session, and
  confirmed no `git` command (add/commit/stash/push/checkout/branch-switch) was run at any point.

### Known limits

- **No filesystem migration tool.** This slice deliberately does not add one — the design goal was
  exactly to make one unnecessary (see "The backward-compat mechanism, precisely" above). A future slice
  COULD add an opt-in one-time renamer for Operators who want every folder to say `.output/` uniformly,
  but nothing in issue #112's acceptance criteria asks for that, and adding it would have meant touching
  on-disk media files this slice's own guardrails say to leave alone.
- **`post.json`'s `media` field lists bare filenames, not full paths** — a deliberate reading of "the
  ordered media filenames" (the issue's own wording); since `post.json` always sits alongside its own
  media in the same directory, a bare filename is suffient and keeps the file portable if the Brand's
  `data/` tree is ever moved. If a future need arises for `post.json` to be readable independent of its
  own folder, that would be a new, separate acceptance criterion.
- **No CLI-visible text change to `/log-post`/`/track-performance`'s own output** — the bundle refresh is
  a documented, tested side effect, not a new line in the printed report. This was a deliberate choice
  (see the proposal's Non-Goals) to keep every pre-existing exact/substring text assertion in both
  commands' large existing test suites untouched; nothing in the issue's acceptance criteria requires a
  visible message change, only the file-level behavior, which the new tests verify directly by reading
  `post.json` off disk.
- **The live producer agent's actual Save-phase behavior is not exercised by any automated test** (it
  never is, in this codebase — production is attended and prose-driven, per ADR-0008). AC1 is proven at
  the CODE level (the produce-flow composition test proves the mechanism is correct when driven in the
  documented order) and at the DOC level (`producer-agent.docs-test.ts` proves the agent is instructed to
  use it) — the same dual-proof pattern this repo already uses for every other Save-phase fact.

## QA Verdict — Round 1: FAIL

Verified against GitHub issue #112 (`SandroBlunt/OrganicGrowth`), on branch `112-output-bundle`
(uncommitted working tree — `HEAD` is exactly the `111-copy-quality-skill` tip; no new commits yet). QA
reads/runs/reports only; no product code, test, spec, or data file was edited.

### Suite result — both green, counts match the Build Report exactly

| Command | Result | Baseline (pre-slice, this branch) |
|---|---|---|
| `npm test` (type-check + full suite) | **1459 pass / 0 fail** — 390 suites, 0 cancelled/skipped/todo | 1429 pass / 0 fail (net +30) |
| `npm run test:docs` | **102 pass / 0 fail** — 27 suites | 96 pass / 0 fail (net +6) |
| `npx openspec validate 112-output-bundle --strict` | `Change '112-output-bundle' is valid` | — |
| `npx openspec validate --all --strict` | `Totals: 29 passed, 0 failed (29 items)` | — |

All four commands were actually executed by QA (not taken on faith) and produced the results above.

### Per-criterion results

| # | Criterion | Verdict | Proving evidence |
|---|---|---|---|
| AC1 | Produce writes media + `caption.txt` + `post.json` into `idea-NN.<recipe>.output/`, media in post order | **PASS** | `output-bundle.test.ts` "produce-flow composition (AC1)" — composes the real chain (`outputDirFor` → `downloadAssetFiles` → `writeCaptionText` → `writeAsset` → `refreshOutputBundle`) against a fetch stub; asserts directory contents `["0-hook.png","1-then.png","2-shift.png","caption.txt","post.json"]` and `post.json.media` matches download order exactly. Independently read the source of `downloadAssetFiles` (`src/asset/download.ts`) and confirmed it is destDir-agnostic (no hardcoded folder name) |
| AC2 | `post.json` generated from the ledger; regenerating yields the same file; never a separate writable store | **PASS** | Read `generatePostJson` in full — three arguments only, no disk/clock/hidden state, builds a fresh object literal every call. Grepped `src/` for the string literal `"post.json"`: the only write site is `output-bundle.ts:141` (`writePostJson`); every other hit is a test reading the file back. Two independent byte-identical idempotence tests: `writePostJson` "writing twice from an unchanged PostJson" and `refreshOutputBundle` "regenerating post.json from an UNCHANGED ledger" (both compare raw bytes with `assert.equal`, not `deepEqual`). Confirmed `writeAsset` (`src/asset/store.ts`) re-reads the ledger from disk on every call (`readJsonFile`) — no shared cache exists anywhere that `refreshOutputBundle`'s subsequent `loadIdeas` could read stale data from |
| AC3 | `/log-post` refreshes post URL + posted-at; `/track-performance` refreshes metrics + score | **PASS** | Read both command sources in full: `logPostCommand` calls `refreshOutputBundle` immediately after its `writeAsset` call, success path only (`src/commands/log-post.ts:165`); `trackPerformanceCommand` calls it inside the per-Asset loop right after that Asset's own `writeAsset` (`src/commands/track-performance.ts:241`). Diffed both test files against base branch `111-copy-quality-skill`: 3 new tests in `log-post.test.ts` (refresh happens; two-Asset isolation; no-asset_paths never fails the command), 4 new in `track-performance.test.ts` (refresh happens; two-Asset independence; SKIPPED Asset's `post.json` left untouched; no-asset_paths never fails the run) — all green |
| AC4 | `post.json` carries every listed field; `caption.txt` is paste-ready | **PASS** | Read the `PostJson` interface and `generatePostJson`'s field mapping against the issue's own field list (brand, idea id, recipe, format, copy, ordered media filenames, post URL, posted-at, metrics, score) — every field present, with `?? null` correctly handling `undefined` (including for `performance_score: 0`, which is not falsy-coalesced away). 7 field-coverage tests + 2 `captionText` tests (caption + blank line + space-joined hashtags; zero-hashtags has no dangling blank line) |
| AC5 | `.assets/`→`.output/` rename reflected in `asset_paths` and everywhere the old path was used; nothing breaks | **PARTIAL — see judgment + Defect 1 below** | The no-migration DESIGN is accepted (see below). However, an independent repo-wide grep found ONE real, unmigrated "old path" reference the Build Report did not catch: `.gitignore`. See Defect 1 |
| AC6 | `npm test` green, with generate + refresh-at-each-lifecycle-step coverage | **PASS** | `npm test`: 1459/1459 (verified by actually running it, not from the Build Report's claim). 23 tests in `output-bundle.test.ts` + 3 in `log-post.test.ts` + 4 in `track-performance.test.ts` + 6 docs-tests directly exercise the new module and all three wired call sites |

### AC5 — explicit judgment on the no-migration interpretation

**The core no-migration DESIGN is ACCEPTABLE, not a defect.** Reasoning:

1. **The mechanism genuinely satisfies "nothing breaks — existing runs still resolve."**
   `refreshOutputBundle` resolves a bundle directory from the Asset's OWN recorded `asset_paths`
   (`dirname` of the first entry) rather than reconstructing a name — so it is structurally incapable of
   drifting from wherever an Asset's files actually live, regardless of what that folder is named. This
   is proven against REAL data, not a hypothetical: `output-bundle.test.ts`'s "AC5" test seeds a genuine
   pre-existing `.assets/`-named directory with a real file inside, and confirms `post.json` lands there,
   the pre-existing media is untouched, and no sibling `.output/` directory is ever created.
2. **Checked both specific sub-claims the developer made:**
   - (i) NEW-Asset writes always use `.output/`, never `.assets/`: `outputDirFor` is the ONE call site
     anywhere in `src/` or `.claude/` that constructs a `.output`-suffixed path, and it always returns
     `.output` (confirmed by reading the function and its 3 tests, plus a whole-repo grep for
     `.assets\`` / `.assets"` / `'.assets'` / `assets${` template-literal variants — zero hits besides
     doc prose describing the legacy case).
   - (ii) An existing `.assets/` entry fully resolves: proven by the same AC5 test above, seeding a REAL
     directory (not a mock).
3. **A forced physical migration would have been actively harmful right now.** This repo currently has a
   REAL, in-flight, concurrent Operator run sitting in the working tree
   (`data/brands/straw-motion/ideas/2026-W29/*`, `data/brands/straw-motion/ledger.json` — confirmed via
   `git diff` content: fresh `produced_at` timestamps, regenerated captions, new `asset_url`s dated
   Jul 21, i.e. a live re-run in progress, not stale data) whose `asset_paths` still literally say
   `.assets/`. QA's own task instructions explicitly forbid touching these files. That is concrete,
   present-tense proof that an actual filesystem/ledger migration in this slice would have collided with
   real Operator work — the no-migration design is not just theoretically safer, it is the only
   defensible choice available today.
4. The Non-Goals section of `proposal.md` states this decision explicitly and up front ("No filesystem
   rename/migration of existing `.assets/` folders, and no rewrite of any existing ledger's `asset_paths`
   strings") — this is the correct way to handle a genuinely ambiguous mandate: surface the reading for
   review rather than deciding silently either way.

**However, AC5 also says "and everywhere the old path was used" — and one real spot was missed: see
Defect 1.** This is why AC5 is graded PARTIAL rather than a clean PASS: the design judgment call is
sound, but its execution left one literal `.assets/` reference in place that should have become
`.output/` (or been extended to cover both). This is a concrete, reproducible gap against the acceptance
criterion's own text, not a stylistic nitpick — see repro steps below.

### Per-scenario results (spec deltas)

**`asset-output-bundle` (ADDED):**

| Scenario | Verdict | Covering test |
|---|---|---|
| outputDirFor mirrors specPathFor's own id/run/recipe convention | PASS | `output-bundle.test.ts` "builds \<ideasRoot\>/\<run\>/idea-NN.\<recipe\>.output for a full ledger id" |
| outputDirFor never returns the retired .assets name | PASS | `output-bundle.test.ts` "never returns the retired .assets name" |
| A freshly-produced Asset's fields all appear, tracking fields explicitly null | PASS | `generatePostJson` "carries every AC4-listed field, with explicit nulls..." |
| media lists ordered basenames, never full paths, never re-ordered | PASS | `generatePostJson` "media lists ORDERED BASENAMES of asset_paths, never re-sorted..." |
| generatePostJson is pure — identical inputs always yield deep-equal output | PASS | `generatePostJson` "is PURE — identical inputs always yield deep-equal output..." |
| Caption + hashtags render as caption, blank line, then space-joined hashtags | PASS | `captionText` "renders caption, a blank line, then space-joined hashtags" |
| Zero hashtags renders just the caption, no dangling blank line | PASS | `captionText` "renders just the caption, no dangling blank line..." |
| A NEW Asset's post.json lands in its .output/ directory | PASS | `refreshOutputBundle` "a NEW Asset's post.json lands inside its .output/ directory..." |
| A LEGACY Asset's post.json lands in its existing .assets/ directory — never renamed | PASS | `refreshOutputBundle` "AC5 — a LEGACY .assets/-named Asset resolves and refreshes IN THAT SAME folder..." |
| Regenerating post.json from an unchanged ledger yields a byte-identical file | PASS | `refreshOutputBundle` "regenerating post.json from an UNCHANGED ledger yields a byte-identical file (AC2, shell level)" |
| An unknown Idea returns ok:false without writing anything | PASS | `refreshOutputBundle` "returns ok:false / unknown-idea..." |
| An Asset with no asset_paths yet is skipped, not guessed at | PASS | `refreshOutputBundle` "returns ok:false / no-local-media..." |

**`post-attribution` (MODIFIED — added requirement):**

| Scenario | Verdict | Covering test |
|---|---|---|
| Logging a Post refreshes that Asset's post.json with the new URL and posted_at | PASS | `log-post.test.ts` "a produced Asset with a known local bundle directory gets its post.json refreshed..." |
| With two Assets, only the NAMED Recipe's post.json is refreshed | PASS | `log-post.test.ts` "with TWO Assets, only the NAMED Recipe's post.json is refreshed..." |
| An Asset with no local bundle directory yet never fails the command | PASS | `log-post.test.ts` "an Asset with no local bundle directory yet (no asset_paths) never fails the command..." |

**`performance-tracking` (MODIFIED — added requirement):**

| Scenario | Verdict | Covering test |
|---|---|---|
| A tracked Post's post.json gains its metrics and score | PASS | `track-performance.test.ts` "a tracked Asset with a known local bundle directory gets its post.json refreshed with metrics/score" |
| Two tracked Assets on one Idea each refresh their OWN post.json independently | PASS | `track-performance.test.ts` "two tracked Assets on one Idea each refresh their OWN post.json, independently" |
| A skipped Asset's post.json (if any) is left untouched | PASS | `track-performance.test.ts` "a SKIPPED Asset's post.json (if any) is left untouched by this run" |

**`producer-conductor` (MODIFIED — added requirement):**

| Scenario | Verdict | Covering test |
|---|---|---|
| producer.md documents the .output/ destination, caption.txt, and the post-write refresh | PASS | `producer-agent.docs-test.ts` new block, tests 1 + 3 |
| producer.md states the backward-compat rule for an already-produced Asset | PASS | `producer-agent.docs-test.ts` new block, test 5 |
| Every pre-existing pinned fact in producer.md survives this rewrite | PASS | `producer-agent.docs-test.ts` new block, test 6 — plus independently confirmed via `git diff 111-copy-quality-skill -- .claude/agents/producer.md` that the edit is scoped to the Save-phase section only, and via direct grep that `issue #102 finding #3`/`finding #4`, `stat_callout`, `STOP`/`never publish` all still appear unchanged |

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No new code path publishes anything. `producer.md`'s Save-phase rewrite still ends "**STOP.** You never publish — a human does, then runs `/log-post`..." (unchanged position/wording, confirmed by diff). `/log-post` and `/track-performance` only log/measure an already-published Post |
| Public-metrics-only | PASS (unaffected) | `refreshOutputBundle` never calls Apify; it only reads fields already on the ledger Asset record. `track-performance.ts`'s scrape/normalize pipeline is untouched by this diff |
| Relative-not-absolute | PASS (unaffected) | `computePerformanceScore`/baseline logic untouched by this diff |
| Explicit-attribution | PASS | `refreshOutputBundle` is always called with an explicit `(brand, ideaId, recipe)` triple matching the Asset just written. Proven by test: `log-post.test.ts`'s two-Asset test shows only the NAMED Recipe's bundle is touched; `track-performance.test.ts`'s two-Asset test shows each Recipe's `post.json` gets its OWN metrics, never the sibling's |
| **Ledger-as-source-of-truth (rule 7)** — the spine of this slice | **PASS** | `generatePostJson` is provably pure (3 args, no disk/clock/hidden state — read in full). `refreshOutputBundle` always re-derives its `(brand, idea, asset)` triple from a FRESH `loadIdeas` disk read, never a cache. Grep for the `"post.json"` string literal across `src/` shows exactly one write site (`output-bundle.ts`'s `writePostJson`). Two independent byte-identical idempotence tests exist at both the shell (file-bytes) and pure-function (object) level. This is the best-evidenced part of the whole slice |
| Magnific fake used; no live Space calls | **PASS** | Grepped every new/modified file for `spaces_[a-z_]+\(`, `creations_[a-z_]+\(`, `mcp__magnific` — zero hits in any source or test file. The one hit anywhere in the diff's file set is `.claude/agents/producer.md`'s pre-existing YAML frontmatter `tools:` list (declares the CONTENT `producer` agent's own attended-mode Magnific tool grant for when a human runs it live — not part of this diff, confirmed via `git diff` that line is untouched, and not a test/build-loop artifact). This slice's whole surface sits after the Space has already rendered — it only touches already-downloaded local files and the ledger, confirmed by reading `output-bundle.ts` and `download.ts` in full. No credits spent, no board mutation, hermetic |

### Defect list

**Defect 1 — medium — `.gitignore` was not updated for the new `.output/` bundle directories, so newly-produced Asset media is no longer git-ignored.**

The issue's own AC5 text says the rename must be reflected "everywhere the old path was used." `.gitignore`
line 15 is exactly such a place — it contains the literal substring `.assets/` — and a plain repo-wide
grep for `.assets/` (the same method task 1.6 in `tasks.md` says was used) turns it up:

```
$ grep -rln "\.assets/" . --include="*" | grep -v "node_modules\|/.git/\|worktrees"
./.claude/agents/producer.md
./.gitignore                     <-- missed
./CLAUDE.md
./README.md
./data/brands/straw-motion/ledger.json   (guardrail-protected, correctly left alone)
...
```

**Repro (read-only, no files created — `git check-ignore` matches pure path strings against `.gitignore`
patterns without requiring the file to exist on disk):**

```
$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.output/0-hook.png"
(no output, exit code 1 — NOT ignored)

$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.assets/0-hook.png"
.gitignore:15:data/brands/*/ideas/**/*.assets/    data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.assets/0-hook.png
(exit code 0 — ignored, and names the matching line)
```

`.gitignore`'s only relevant pattern (line 15) is:
```
data/brands/*/ideas/**/*.assets/
```
There is no sibling pattern for `*.output/`, and no broader pattern that would catch it.

**Why this matters:** this directly contradicts the slice's OWN new documentation. `CLAUDE.md` (line
~201) now claims the `.output/` bundle is "git-ignored, durable on the Operator's disk"; `README.md`
(line 120) claims it is "kept on your disk, not in git." Neither is true as shipped — the next time a
real Asset is produced (this repo currently has a live, in-progress Operator re-run of the News Carousel
Format sitting in the working tree right now), its `.output/` folder — media (~8 MB per carousel, per
the existing `.gitignore` comment on line 13-14), `caption.txt`, and `post.json` — would show up as
ordinary untracked files, one `git add -A`/`git add .` away from being committed as binary blobs into
git history (expensive to undo). This is a real, near-term-exploitable gap, not a hypothetical one.

**Fix:** add a sibling ignore line next to the existing one (keep the `.assets/` line too — legacy
Assets still need it, per the accepted no-migration design), e.g.:
```
data/brands/*/ideas/**/*.assets/
data/brands/*/ideas/**/*.output/
```
and update the comment on lines 13-14 (currently says "the Save phase's downloaded slides/clips") to
also mention `caption.txt`/`post.json`, since the whole bundle — not just the media — is meant to stay
out of git per this slice's own stated design.

**Scope check:** everything else audited under "everywhere the old path was used" — `README.md`,
`CLAUDE.md`, `.claude/agents/producer.md`, `.claude/commands/log-post.md`,
`.claude/commands/track-performance.md`, `openspec/specs/**` (no folder-naming coupling exists there —
confirmed by reading `asset-store/spec.md`), `src/recipe/registry.ts` (only mentions the `asset_paths`
*field* name, never a folder-name string, confirmed by reading the relevant lines), `package.json`,
`tsconfig*.json` — was found correctly and completely migrated or correctly left alone. `.gitignore` is
the one miss.

**This is the only defect found.** Everything else in this round — AC1–AC4, AC6, every spec Scenario,
every always-rule (rule 7 especially well-evidenced), and the Magnific-fake/hermeticity check — passes on
real, independently-verified evidence, not on the Build Report's word alone. The fix is a two-line,
low-risk change; recommend a fast Round 2.

**Overall verdict: FAIL (Round 1)** — solely because of Defect 1's concrete AC5 gap. Please add the
`.gitignore` line (and the comment touch-up), re-run `npm test` / `npm run test:docs` /
`openspec validate --all --strict` to confirm still green (no reason to expect otherwise — this change
touches no code, only `.gitignore`), and resubmit for a Round 2 re-verify.

---

## Round 2 — Build (developer)

### What changed

Fixed the ONE medium-severity defect: `.gitignore` had no sibling ignore pattern for the new
`idea-NN.<recipe>.output/` bundle folders — only the old `.assets/` pattern existed, so a freshly
produced Asset's bundle would NOT have been git-ignored, contradicting this slice's own new docs
(CLAUDE.md/README.md both say the bundle is "git-ignored, durable on the Operator's disk") and
literally missing AC5's "everywhere the old path was used" (`.gitignore` is exactly one of those
places — a plain grep for `.assets/` turns it up, as QA's repro noted).

**Fix — `.gitignore`, mirroring the existing pattern's exact shape, old pattern kept:**

```diff
-# Produced Asset media (the Save phase's downloaded slides/clips — ~8 MB per carousel). Durable on
-# the Operator's disk beside the Brief/Spec; the ledger's asset_paths point here. Too heavy for git.
+# Produced Asset output bundle (the Save phase's downloaded slides/clips, caption.txt, post.json —
+# ~8 MB per carousel). Durable on the Operator's disk beside the Brief/Spec; the ledger's asset_paths
+# point here. Too heavy for git. `.output/` is the current name (issue #112); `.assets/` is kept for
+# Assets produced before that rename — never migrated, so both must stay ignored.
+data/brands/*/ideas/**/*.output/
 data/brands/*/ideas/**/*.assets/
```

The new `.output/` line is byte-for-byte the same pattern SHAPE as the pre-existing `.assets/` line
(`data/brands/*/ideas/**/*.<suffix>/`) — no new glob syntax introduced. The comment now names both
`.output/` (current) and `.assets/` (kept, backward-compat — never migrated, per this slice's own
no-migration design) and calls out that `caption.txt`/`post.json` are inside the ignored bundle too
(the whole directory is ignored, so no separate pattern is needed for those two files specifically).

No product code touched — this is a one-file, two-line diff.

### Verification (read-only — creates nothing)

```
$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.output/0-hook.png"
.gitignore:17:data/brands/*/ideas/**/*.output/	data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.output/0-hook.png

$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png"
.gitignore:18:data/brands/*/ideas/**/*.assets/	data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png
```

Both the NEW `.output/` bundle and the LEGACY `.assets/` bundle are ignored, each matched by its own
line (17 and 18 respectively) — confirming the fix is additive, not a replacement.

### How to run / results

```bash
npm test           # 1459 pass / 0 fail — UNCHANGED from Round 1 (a .gitignore edit touches no test)
npm run test:docs  # 102 pass / 0 fail — UNCHANGED from Round 1
npx openspec validate 112-output-bundle --strict   # valid
npx openspec validate --all --strict               # Totals: 29 passed, 0 failed
```

Both suites confirmed at their EXACT Round 1 baselines (1459/0, 102/0) — expected, since `.gitignore` is
a git-mechanics file with no test coverage of its own; the fix is proven instead by the
`git check-ignore -v` evidence above.

### Files touched (Round 2, in addition to Round 1's list)

- `.gitignore` — the two-line addition + comment update shown above. Nothing else.

### Self-review notes

- Confirmed the new pattern is a true SIBLING of the existing one (same glob shape, same directory
  scope `data/brands/*/ideas/**/`), not a broader or narrower match that could accidentally ignore
  something else (e.g. a Brief `.md` or a Spec `.json` sitting beside the bundle) — verified with a
  THIRD `git check-ignore -v` check that a sibling `idea-01.news-carousel.spec.json` path is NOT
  matched by either pattern.
- Confirmed via `git status --porcelain` that this round touched only `.gitignore` — no other file, no
  git command run (staging/commit/push/branch-switch), and the guardrail-protected W29 leftover files
  remain untouched (still absent from any diff I produced; only their pre-existing, pre-session
  modifications show in `git status`, as in Round 1).

### Known limits

Unchanged from Round 1 — see that section above. This round fixed exactly the one defect QA reported
and nothing else.

```
$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json"
(no output — correctly NOT ignored; the sibling Spec file stays tracked)
```

## QA Verdict — Round 2: PASS

Re-verified against the SAME GitHub issue #112 and branch `112-output-bundle`. Per the developer's Round
2 Build Report, the change since Round 1 is claimed to be `.gitignore` only. QA independently re-derived
every piece of that claim from scratch (fresh `git diff`, fresh `git check-ignore -v` probes, a fresh
full test run) rather than trusting the Round-2 report's own numbers — all confirmed.

### Defect 1 — RESOLVED, independently confirmed

**Scope of the Round-2 change — confirmed `.gitignore`-only:**

```
$ git diff --stat HEAD
 .gitignore                                         |   7 +-
 ...(every other file's insertion/deletion count is BYTE-IDENTICAL to Round 1's diff --stat)...
 17 files changed, 434 insertions(+), 162 deletions(-)
```

Every file other than `.gitignore` shows the exact same line counts QA recorded in Round 1 (e.g.
`track-performance.test.ts` still `131`, `producer-agent.docs-test.ts` still `49`, `CLAUDE.md` still
`15`) — proving nothing else changed. `git diff -- .gitignore` shows exactly the two-line addition +
comment rewrite the Build Report describes (old `.assets/` pattern kept as-is, new `.output/` line added
above it).

**The fix itself, re-verified read-only (no files created — `git check-ignore` matches pure path strings
against gitignore patterns without needing the file to exist on disk):**

```
$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.output/0-hook.png"
.gitignore:17:data/brands/*/ideas/**/*.output/	data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.output/0-hook.png
(exit 0 — NOW ignored, matched by the NEW line 17)

$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.assets/0-hook.png"
.gitignore:18:data/brands/*/ideas/**/*.assets/	data/brands/straw-motion/ideas/2026-W29/idea-99.news-carousel.assets/0-hook.png
(exit 0 — STILL ignored, matched by the kept line 18 — backward-compat preserved, not a replacement)
```

Went one step further than the Build Report's own verification and also confirmed `post.json` and
`caption.txt` themselves (not just the media) fall inside the ignored `.output/` directory, and that
BOTH sibling non-bundle files stay correctly un-ignored — a Brief, not just a Spec:

```
$ git check-ignore -v ".../idea-99.news-carousel.output/post.json"     -> matched, line 17 (ignored)
$ git check-ignore -v ".../idea-99.news-carousel.output/caption.txt"   -> matched, line 17 (ignored)
$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json"  -> no match (exit 1, correctly tracked)
$ git check-ignore -v "data/brands/straw-motion/ideas/2026-W29/idea-01.md"                        -> no match (exit 1, correctly tracked)
```

This closes Defect 1 completely: new Assets' whole `.output/` bundle (media + `caption.txt` +
`post.json`) is git-ignored exactly as `CLAUDE.md`/`README.md` now claim; legacy `.assets/` Assets stay
ignored too (no regression to the accepted no-migration backward-compat design); Briefs and Specs — the
files that must stay tracked in git — are untouched by either pattern.

**AC5 is now a clean PASS** (upgraded from Round 1's PARTIAL): the no-migration design was already
accepted on its merits in Round 1; the one concrete execution gap ("everywhere the old path was used"
missing `.gitignore`) is now closed, with no new gap found on this fully independent re-audit.

### Suite result — unchanged from Round 1, re-run and re-confirmed (not assumed)

| Command | Result |
|---|---|
| `npm test` (type-check + full suite) | **1459 pass / 0 fail** — 390 suites |
| `npm run test:docs` | **102 pass / 0 fail** — 27 suites |
| `npx openspec validate 112-output-bundle --strict` | `Change '112-output-bundle' is valid` |
| `npx openspec validate --all --strict` | `Totals: 29 passed, 0 failed (29 items)` |

Identical counts to Round 1, as expected — a `.gitignore`-only change touches no code and no test. No
regression.

### Re-affirmed from Round 1 (nothing in scope changed, so nothing to re-litigate)

Since the ONLY change this round is the two-line `.gitignore` addition, every other Round-1 finding
carries forward unchanged and re-verified by the fresh full-suite run above: AC1–AC4 and AC6 all PASS,
every Requirement Scenario across all four spec deltas PASSes, and all five always-rules PASS (rule 7 —
ledger-as-source-of-truth — remains the best-evidenced part of this slice: one pure generator, one write
site, byte-identical idempotence at both the shell and object level). The Magnific-fake / hermeticity
check is unaffected (a `.gitignore` edit cannot introduce a live-Space call; re-grepped anyway for
`spaces_[a-z_]+\(` / `creations_[a-z_]+\(` / `mcp__magnific` across the full diff including the new
`.gitignore` line itself — zero hits, as expected for a non-code file).

### Guardrails — confirmed held

- File mtimes: `.gitignore` is freshly modified (Jul 22); `data/brands/straw-motion/ledger.json` and
  `data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json` remain at their Round-1
  mtimes (Jul 21) — the W29 leftover concurrent run was not touched this round either.
- `git status --porcelain` shows the identical modified/untracked file set as Round 1, plus `.gitignore`
  — no stray edits.
- No git command (add/commit/stash/push/checkout/branch-switch) was run by QA at any point in either
  round. QA's only write, in both rounds, is this `handoff.md` file.

### Defect list

None remaining. Defect 1 is resolved and independently re-verified above.

### Final verdict

**PASS.** Both suites green (1459/0, 102/0, unchanged from Round 1), `openspec validate --strict` green
for the change and for the whole repo (29/29), every acceptance criterion AC1–AC6 now a clean PASS
(AC5's one gap closed), every spec-delta Scenario passes on a real covering test, all five always-rules
hold — ledger-as-source-of-truth (rule 7) especially well-proven — and the Magnific-fake/hermeticity
check is clean (no live `spaces_*`/`creations_*`/`mcp__magnific` calls anywhere in the diff). The
no-migration AC5 design is accepted on its merits, and its one execution gap (`.gitignore`) is now fully
closed and independently confirmed, not just re-asserted. This slice is ready to proceed to a branch +
PR per the standard gate behavior.
