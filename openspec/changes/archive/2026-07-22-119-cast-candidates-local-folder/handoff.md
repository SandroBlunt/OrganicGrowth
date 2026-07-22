# Slice Handoff — issue #119: Cast-pick candidates need a local, inspectable folder

This is the one bidirectional Slice Handoff doc for this change (`developer` ⇄ `qa`). Nothing here is
overwritten across rounds — a retry appends a new `Round-N Build` section below the QA Verdict.

## Build Report (developer, Round 1)

### What changed

Today, when a Recipe's gated first leg (the wired *Character Explainer with Cast* Recipe's Cast
run-point) renders its candidates, the Producer records each one on the ledger as `{ identifier, url }`
only — no local file is ever downloaded. This slice extends the SAME pattern already used for a produced
Asset's final media (`downloadAssetFiles` + `outputDirFor`) to a Recipe's PRE-gate candidates:

- **`LedgerCastCandidate` gains an optional `path` field** (`src/asset/asset.ts`) — mirrors
  `LedgerAssetRecord.asset_paths` vs its legacy `asset_url`: the durable local file is preferred, the
  remote `url` remains the fallback. `parseCastCandidate`'s defensive parsing includes `path` only when
  it is a non-empty string; a missing/malformed `path` degrades gracefully rather than dropping the
  whole candidate or throwing.
- **New deep module `src/asset/cast-candidates.ts`** — a gate-scoped sibling of `output-bundle.ts`:
  - `castCandidatesDirFor(ideaId, run, ideasRoot, recipe)` — the folder-naming function, same four
    inputs as `outputDirFor`, returning `<ideasRoot>/<run>/idea-NN.<recipe>.cast` (a distinctly-named
    sibling of the Brief, the Spec, and the `.output/` bundle).
  - `castCandidateFilename(index, candidate)` — a stable per-candidate filename
    (`<index>-<identifier><ext>`, extension guessed from the URL, defaulting to `.png`).
  - `downloadCastCandidates(destDir, candidates, fetchImpl?)` — downloads every candidate via the SAME
    `downloadAssetFiles` primitive the Save phase already uses, and returns each candidate ready for the
    ledger (`identifier`/`url` unchanged, `path` set).
  - Recipe- and gate-generic throughout: takes `recipe`/candidate-set as explicit parameters, never
    hard-coded to the one wired Recipe.
- **`/pick-cast`'s successful-pick message now names the picked candidate's local file** when present
  (falling back to its remote URL when absent — never fails or changes behavior otherwise).
- **`.claude/agents/producer.md`** documents the new step: for ANY leg that pauses
  (`DriveOutcome.kind === "paused"`), download every candidate into `castCandidatesDirFor`'s folder and
  write the downloaded `cast` onto the ledger in the SAME write that records the gate pause — generalized
  to any Recipe with a gated first leg, never hard-coded to the wired one.
- **Docs updated** to describe the new `.cast/` folder convention: `CLAUDE.md`'s State section,
  `README.md`'s State table, `.claude/commands/pick-cast.md`, and new pins in
  `src/production-spec/producer-agent.docs-test.ts`.

### Files touched

**Added**
- `src/asset/cast-candidates.ts` — the new deep module.
- `src/asset/cast-candidates.test.ts` — its unit tests.
- `src/producer/cast-candidates-end-to-end.test.ts` — the full composition proof against the Magnific
  fake (drives `driveToNextGate` to a real paused Cast gate, then downloads + records it).
- `openspec/changes/119-cast-candidates-local-folder/` — this OpenSpec change (proposal, tasks, spec
  deltas for `cast-candidate-bundle` (ADDED), `asset-store`, `cast-render`, `producer-conductor`
  (MODIFIED), this handoff).

**Modified**
- `src/asset/asset.ts` — `LedgerCastCandidate.path?`, `parseCastCandidate` defensive parsing.
- `src/asset/asset.test.ts` — new tests for the `path` field (present/absent/malformed, array-level).
- `src/commands/pick-cast.ts` — `pickedCandidateMedia`, used in the success message.
- `src/commands/pick-cast.test.ts` — new tests for the media-surfacing behavior.
- `.claude/agents/producer.md` — new "Download every paused gate's candidates..." paragraph.
- `src/production-spec/producer-agent.docs-test.ts` — new `describe` block pinning that paragraph.
- `.claude/commands/pick-cast.md` — short new paragraph documenting the local-file output.
- `CLAUDE.md`, `README.md` — new `.cast/` convention documented in the State sections.

**Not touched:** `src/asset/output-bundle.ts`, `src/asset/download.ts`, `src/asset/store.ts`,
`src/asset/migrate.ts`, `src/recipe/registry.ts`, `src/space-driver/driver.ts`, `src/commands/pick.ts`,
any `data/brands/**` file, `data/queue.json` — including the 10 in-flight straw-motion W30 Cast picks,
deliberately left untouched per the issue's "What NOT to do".

### How to run

```bash
# Type-check + full unit/integration suite
npm test

# Docs-conformance suite (producer.md / pick-cast.md pins)
npm run test:docs

# Just this slice's new/changed files
node --import tsx --test "src/asset/cast-candidates.test.ts" "src/asset/asset.test.ts" \
  "src/commands/pick-cast.test.ts" "src/producer/cast-candidates-end-to-end.test.ts"

# OpenSpec validation
npx openspec validate 119-cast-candidates-local-folder --strict
npx openspec validate --all --strict
```

Results at handoff time: `npm test` — **1490 pass / 0 fail** (398 suites). `npm run test:docs` — **113
pass / 0 fail** (30 suites). `openspec validate --all --strict` — **30/30 passed**.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (from the Agent Brief) | Proving test(s) |
|---|---|---|
| AC1 | Producing a Recipe's Cast gate downloads every rendered candidate to a local folder before/at the same time the ledger records the gate pause | `src/producer/cast-candidates-end-to-end.test.ts` → `"Cast-gate download, end to end against the FakeSpace (issue #119, AC1)"` → `"downloads every paused candidate to castCandidatesDirFor's folder and records local paths + the gate pause in the same ledger write"` — drives the REAL `driveToNextGate` to a paused Cast gate against `FakeSpace`, downloads the paused candidates, and writes them onto the ledger's Asset in the SAME `writeAsset` call that sets `pending_gate: "cast"` |
| AC2 | Each Cast candidate in the ledger carries a local path alongside its existing identifier/url | Same end-to-end test's per-candidate assertions (`candidate.identifier`/`url`/`path` all present, aligned by index); unit-level: `src/asset/asset.test.ts` → `"parseCastCandidate…"` → `"parses a candidate carrying a local download path alongside identifier/url"` |
| AC3 | The local folder's naming follows the same convention family as the existing produced-Asset output bundle (a sibling, not an unrelated scheme) | `src/asset/cast-candidates.test.ts` → `"castCandidatesDirFor — mirrors outputDirFor's id/run/recipe convention…"` (all 4 `it`s: mirrors the convention, never returns `.output`/`.assets`/`.spec.json`, short-id handling, Recipe-generic); end-to-end test's `"the gate-candidate folder is a DISTINCT sibling of the eventual produced-Asset .output/ bundle"` assertion |
| AC4 | The pick command's output surfaces the local file(s), not only the remote URL | `src/commands/pick-cast.test.ts` → `"pickCastCommand — surfaces the picked candidate's local file, falling back to its remote URL"` → `"names the picked candidate's downloaded LOCAL path when one is recorded on the ledger (AC4)"` |
| AC5 | A malformed/legacy Cast candidate with no local path still parses without throwing and the pick command still works against it, falling back to the remote URL exactly as it does today | `src/asset/asset.test.ts` → `"a candidate with NO path parses fine and carries no path key at all (AC5, legacy/un-downloaded)"` and `"a malformed path (empty string / non-string) is dropped, never the whole candidate"`; `src/commands/pick-cast.test.ts` → `"falls back to the remote URL exactly as before for a legacy candidate with no local path (AC5)"` and `"mixed Cast — path-having and path-less candidates each resolve their OWN correct media reference"` |
| AC6 | Unit tests cover: downloading a Cast candidate set, the new folder-naming function, defensive parsing of a candidate with/without a local path, and the pick command's message including a local path when present | Downloading: `src/asset/cast-candidates.test.ts` → `"downloadCastCandidates — downloads every candidate and returns it ready for the ledger"` (4 `it`s, incl. a non-OK-response failure and an empty set). Folder-naming: same file's `"castCandidatesDirFor…"` block. Defensive parsing: `src/asset/asset.test.ts`'s new `parseCastCandidate`/`parseCastArray` cases. Pick-command message: `src/commands/pick-cast.test.ts`'s new describe block (all 3 `it`s) |

Every pre-existing test in every touched file still passes unchanged (28→31 in `pick-cast.test.ts`,
etc.) — no regressions.

### Fakes / fixtures used

- **The Magnific fake, explicitly flagged:** `src/space-driver/fixtures/fake-space.ts`'s `FakeSpace`,
  used in `src/producer/cast-candidates-end-to-end.test.ts` via the real `driveToNextGate`. This is the
  SAME fake `driver.test.ts` already uses for the wired Recipe's Cast-gate pause — no live `spaces_*`/
  `creations_*` MCP call was made; every interaction went through `FakeSpace`'s in-memory
  `editGoals`/`runs`/`fetchCreations`, asserted directly in the test (`space.editGoals.length`,
  `space.runs.length`).
- **Hand-rolled `fetch` stubs** (`stubFetch`/`stubFetchForCandidateUrls`), mirroring the exact pattern
  already established in `download.test.ts`/`output-bundle.test.ts` — no network call anywhere in the
  new tests.
- **Temp directories** (`mkdtemp`/`rm` in `os.tmpdir()`) for every filesystem-touching test — no real
  `data/brands/**` path is ever written to by a test.

### Self-review notes

- Decided `castCandidatesDirFor`/`downloadCastCandidates`/`castCandidateFilename` belong in a NEW
  sibling module (`src/asset/cast-candidates.ts`), not folded into `output-bundle.ts`: the two modules
  serve genuinely different moments (a PRE-gate candidate set that may never become the final Asset, vs.
  the produced Asset's own publish+tracking bundle) and mixing them would blur `output-bundle.ts`'s
  single responsibility (documented in the issue's own "Suggested next steps" as an open design fork —
  resolved here).
- `castCandidateFilename` deliberately does NOT try to name a candidate by its character-concept/art-style
  (the issue's suggested `1a-<slug>.png` example) — `LedgerCastCandidate`/the Space driver's `Creation`
  carry only `identifier`/`url`, no concept/style metadata, and this module is explicitly Recipe-generic
  (works for any future gated Recipe's candidate set). Naming by `<index>-<identifier>` is unambiguous,
  stable, and requires no Recipe-specific knowledge.
- `pickedCandidateMedia` is a tiny, separate function (not folded into `selectCharacter`) so the pure
  1-based-selection logic stays untouched and its own existing tests keep proving exactly what they did
  before — the new behavior is additive at the call site only.
- Removed an initially-unused `extname` import from `cast-candidates.ts` (caught by
  `noUnusedLocals`) in favor of a small regex-based `guessExtension` that also strips a URL's query
  string, which `path.extname` alone would not do correctly.
- Fixed two OpenSpec-authoring mistakes caught by `openspec validate --strict`: the tool requires
  SHALL/MUST to appear on the FIRST LINE of a Requirement's body text (not merely somewhere in the
  paragraph) — reworded one Requirement's opening sentence to surface it there.
- Fixed two `producer-agent.docs-test.ts` regex misses against my own producer.md wording (a missing
  word, and a line-wrap the regex's literal space didn't tolerate) — adjusted the doc text and one regex
  to use `\s*\n?\s*` for the line-wrap case, consistent with this file's existing pattern for other
  multi-line-wrapped pins.

### Known limits

- The real, attended `producer` content agent (not built here — that's a different pipeline) still needs
  to actually CALL `downloadCastCandidates`/`castCandidatesDirFor` at Cast-gate time in a live session;
  this slice wires the primitives and documents the step in `producer.md`'s prose, proven via the
  end-to-end test against the fake, but does not (and per this repo's build/content pipeline split,
  cannot) drive a live Magnific Space to prove it against production.
- No backfill for the 10 already-in-flight straw-motion W30 Cast picks — explicitly out of scope per the
  issue; they keep their `{identifier, url}`-only candidates and still work (AC5 is exactly this case).
- The broader "audit every OTHER piece of generated media for a consistent folder home" ask from the
  original issue (Baseline Prompt renders, Brand Asset uploads, etc.) is explicitly out of scope here, as
  the issue itself flags.
- `castCandidateFilename`'s extension-guessing is a best-effort cosmetic hint (defaults to `.png` on any
  unparseable/unrecognized URL) — never a correctness dependency; the ledger's `path` field is what
  matters, not the file's extension.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` — **1490 pass / 0 fail** (398 suites), run in full at
  `.claude/worktrees/issue-119-cast-candidates-local-folder`. Confirmed actually green (not assumed):
  ran to completion, `# fail 0`.
- `npm run test:docs` — **113 pass / 0 fail** (30 suites). Confirmed green, including the 5 new
  `producer.md`-pinning `it`s for issue #119 (all pass).
- `npx openspec validate --all --strict` — **30/30 passed**, including
  `change/119-cast-candidates-local-folder`.
- Targeted re-run of just this slice's new/changed files (`cast-candidates.test.ts`, `asset.test.ts`,
  `pick-cast.test.ts`, `cast-candidates-end-to-end.test.ts`) via the exact command in the Build
  Report — **101 pass / 0 fail** (31 suites).

All three commands were run exactly as the Build Report specifies, from this worktree, and all three
were genuinely green — no assumed passes.

### Per-criterion results (issue #119 Agent Brief)

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| AC1 | Producing a Recipe's Cast gate downloads every rendered candidate to a local folder before/at the same time the ledger records the gate pause | PASS | `src/producer/cast-candidates-end-to-end.test.ts` drives the REAL `driveToNextGate` against `FakeSpace` to a genuine `paused`/`cast` outcome, downloads via `downloadCastCandidates`, then calls the real `writeAsset` with `{ status: "in_production", pending_gate: "cast", cast: downloadedCast }` in one write — verified by reading the test and its assertions (folder holds 6 files; ledger Asset has both the pause and the downloaded `cast` in the same write) |
| AC2 | Each Cast candidate in the ledger carries a local path alongside its existing identifier/url | PASS | Same end-to-end test asserts `candidate.identifier`/`url`/`path` per entry, index-aligned; `src/asset/cast-candidates.ts`'s `downloadCastCandidates` returns `{ identifier, url, path }` unconditionally for every input candidate (read in full — no code path omits `path` on success) |
| AC3 | The local folder's naming follows the same convention family as the existing produced-Asset output bundle | PASS | `castCandidatesDirFor` (read in full) reuses `briefShortName` from `src/production-spec/store.ts` — the exact function `outputDirFor` uses — and only swaps the suffix to `.cast`; unit tests in `cast-candidates.test.ts` confirm the mirrored convention and that it never collides with `.output`/`.assets`/`.spec.json` |
| AC4 | The pick command's output surfaces the local file(s), not only the remote URL | PASS | `src/commands/pick-cast.ts`'s `pickedCandidateMedia` returns `candidate.path ?? candidate.url`, used in the success message (`media: ${media}`); `pick-cast.test.ts`'s new tests assert the local path string appears in the output and the remote URL does NOT when a `path` exists |
| AC5 | A malformed/legacy candidate with no local path still parses without throwing and the pick command still works, falling back to the remote URL | PASS | `parseCastCandidate` (read in full) only ever spreads `path` in when `nonEmptyString(raw.path)` is true — a missing/empty/non-string `path` is silently dropped, never throws, never drops the candidate; `asset.test.ts` and `pick-cast.test.ts` both cover this explicitly, including the mixed-array case |
| AC6 | Unit tests cover: downloading a candidate set, the folder-naming function, defensive parsing with/without a path, and the pick command's message including a local path when present | PASS | `cast-candidates.test.ts` covers `downloadCastCandidates` (success, ordering, first-failure-throws, empty-set) and `castCandidatesDirFor`/`castCandidateFilename`; `asset.test.ts` covers `parseCastCandidate`/`parseCastArray` with/without/malformed `path`; `pick-cast.test.ts` covers the message surfacing a local path, falling back to URL, and the mixed case |

All 6 acceptance criteria verified against the actual code and actual passing tests, not merely the
developer's self-assessment table (which QA independently reproduced and confirms is accurate).

### Per-scenario results (OpenSpec spec deltas)

**`cast-candidate-bundle` (ADDED)** — all traced to the issue, all covered:
- `castCandidatesDirFor` mirrors `outputDirFor`'s convention — PASS (`cast-candidates.test.ts`, 3 `it`s)
- `castCandidatesDirFor` never returns `.output`/`.assets`/`.spec.json` — PASS (same file)
- `castCandidatesDirFor` is Recipe-generic — PASS (same file, "is Recipe-generic" `it`)
- `castCandidateFilename` extension-guessing (well-formed / query-string / unparseable) — PASS (3 `it`s
  in `cast-candidates.test.ts`)
- `downloadCastCandidates` downloads in order with ledger-ready records — PASS
- `downloadCastCandidates` throws naming the failed candidate on first failure, no partial write — PASS
  (verified the test stubs a non-OK response on the second candidate and asserts the throw)
- `downloadCastCandidates` creates the dest dir even for an empty candidate set — PASS

**`asset-store` (MODIFIED)** — new `path` Requirement:
- Candidate with a local path parses with `path` alongside identifier/url — PASS
- Candidate with no path omits the key entirely (never `undefined`) — PASS (`"path" in c!` assertion)
- Malformed path (empty string / non-string) dropped, candidate kept — PASS
- Mixed array preserves each candidate's own path independently — PASS

**`cast-render` (MODIFIED)** — two new Requirements:
- Paused gate's candidates downloaded + recorded with local paths in the same ledger write — PASS
  (end-to-end test)
- Gate-candidate folder distinct from the produced-Asset bundle — PASS (`assert.notEqual` in the
  end-to-end test, and `castCandidatesDirFor` vs `outputDirFor` return different suffixes by construction)
- `/pick-cast` surfaces local path when present — PASS
- `/pick-cast` falls back to remote URL for a legacy candidate — PASS
- Mixed Cast resolves each pick's own correct media reference — PASS

**`producer-conductor` (MODIFIED)** — doc-pin Requirement:
- `producer.md` names `castCandidatesDirFor`/`downloadCastCandidates`/`.cast/` — PASS (grep-verified the
  actual `producer.md` diff contains all three)
- States the step generalizes, never hard-coded to one Recipe — PASS
- States the download happens in the SAME ledger write as the pause — PASS
- States `/pick-cast` surfaces the local path, falling back to URL — PASS
- All pre-existing pinned facts in `producer.md` survive — PASS (`npm run test:docs` green, all
  pre-existing docs-test `it`s in the same file still pass)

Every Requirement's every Scenario in the spec deltas traces cleanly back to a specific Agent Brief
acceptance criterion or key interface — no scenario invents behavior the issue didn't ask for, and no
acceptance criterion is left uncovered by a Requirement. The spec is faithful to the issue, not merely
self-consistent.

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| **Generate-never-publish** | PASS | This slice only downloads pre-gate candidate IMAGES to local disk and records their paths — no code path in the diff calls anything Facebook/publish-related; `pick-cast.ts`'s only change is message text |
| **Public-metrics-only** | PASS (N/A) | This slice touches no metrics/Apify code path at all — confirmed by reading the full diff (`git diff --stat`), no `src/performance/**` file touched |
| **Relative-not-absolute** | PASS (N/A) | No scoring/comparison logic touched by this slice |
| **Explicit-attribution** | PASS | `/pick-cast` still keys entirely off the Operator's `<n>` pick and the ledger's own recorded Asset/Recipe; the new `pickedCandidateMedia` only changes what string is displayed, never which candidate is attributed to which Recipe/Idea |
| **Ledger-as-source-of-truth** | PASS | The end-to-end test proves the downloaded `cast` (with `path`) is written via the real `writeAsset` in the SAME write that records `pending_gate: "cast"` — never a second store; `parseCastCandidate`'s defensive parsing (data-handling rule 4) never throws on a missing/malformed `path`, verified by 3 dedicated tests plus the mixed-array case |
| **Magnific fake only, no live-Space calls** | PASS | Grepped every new/changed test and source file in this slice for `spaces_*`/`creations_*`: the only matches are in a code COMMENT in `cast-candidates-end-to-end.test.ts` describing that no such call is made — zero actual invocations. The end-to-end test drives the real `driveToNextGate` against `FakeSpace` (`src/space-driver/fixtures/fake-space.ts`), the same fake `driver.test.ts` already uses; all downloads go through hand-rolled `fetch` stubs (`stubFetch`/`stubFetchForCandidateUrls`), never the network |
| **No live `data/brands/**`/`data/queue.json` touched by any test** | PASS | `git status --porcelain data/` and `git diff --stat data/` both return empty after the full `npm test` run. Every filesystem-touching test in this slice uses `mkdtemp`/`os.tmpdir()` (`cast-candidates.test.ts`, `cast-candidates-end-to-end.test.ts`) or an isolated temp ledger/queue (`pick-cast.test.ts`'s `withLedger`). The `"data/brands/..."` strings appearing in `cast-candidates.test.ts`/`asset.test.ts`/`pick-cast.test.ts` are only used as INPUT ARGUMENTS to the pure `castCandidatesDirFor` function or as fixture path STRINGS being parsed — never an actual disk path written to |

### Out-of-scope compliance

Verified via `git diff --stat` against every file the issue/Build Report says must stay untouched:
`src/asset/output-bundle.ts`, `src/asset/download.ts`, `src/asset/store.ts`, `src/asset/migrate.ts`,
`src/recipe/registry.ts`, `src/space-driver/driver.ts`, `src/commands/pick.ts`, `data/brands/**`,
`data/queue.json` — all show zero diff. `migrate.ts` still calls the shared `parseCastArray` (unchanged
call site), so the `path` field flows through legacy folding automatically without needing its own edit,
exactly as the Build Report claims.

### Defect list

None. No defects found in this round.

### Verdict rationale

Every acceptance criterion is proven by a real, currently-passing test that actually exercises the
claimed behavior (verified by reading the test bodies, not just their names). The OpenSpec spec deltas
trace faithfully to the issue's Agent Brief — no scope creep, no dropped criterion, no contradiction with
CONTEXT.md/ADRs. The build is hermetic: no live Magnific call, no real ledger/queue file touched. All
always-rules hold. `npm test`, `npm run test:docs`, and `openspec validate --all --strict` are all
genuinely green as run by QA independently in this worktree.

**Result: PASS. Slice is ready to proceed to a PR.**
