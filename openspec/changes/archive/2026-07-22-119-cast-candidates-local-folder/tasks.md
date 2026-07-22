## 1. Ground the current Cast-candidate + download surface before touching anything

- [x] 1.1 Read `src/asset/asset.ts` in full: confirm `LedgerCastCandidate` is `{ identifier, url }` only,
  no local-path field exists, and `parseCastCandidate` is the ONE defensive-parse entry point
  (`parseCastArray` maps over it; `migrate.ts` reuses `parseCastArray` for legacy folding, so a
  `path`-aware `parseCastCandidate` flows through both call sites automatically).
- [x] 1.2 Read `src/asset/output-bundle.ts` and `src/asset/download.ts` (+ both test files) in full:
  confirm `outputDirFor`'s exact id/run/recipe convention to mirror, and that `downloadAssetFiles` is
  already destDir/target-agnostic (never hardcodes a folder name or a Recipe) — the new module reuses it
  unchanged, only supplying its own destination + filenames.
- [x] 1.3 Read `src/production-spec/store.ts` in full: confirm `briefShortName`/`specPathFor`'s exact
  path-construction convention and that `briefShortName` is already exported for reuse.
- [x] 1.4 Read `src/space-driver/driver.ts` (`driveToNextGate`, `DriveOutcome`) and
  `src/space-driver/port.ts` (`Creation`) in full: confirm a PAUSED leg's `outcome.candidates` is exactly
  `{ identifier, url }[]` — the shape `downloadCastCandidates` needs to accept, without importing the
  Space driver itself (kept as this module's own narrow `CastCandidateSource` type).
- [x] 1.5 Read `src/commands/pick-cast.ts` (+ test) in full: confirm the exact point after
  `selectCharacter` succeeds where the picked candidate's own record is still in scope, and that every
  pre-existing test asserts with `assert.match`/`assert.doesNotMatch` (substring), never full-string
  equality — so appending new text to the success message cannot break any pre-existing assertion.
- [x] 1.6 Read `.claude/agents/producer.md`'s "Drive the canvas" + "Save phase" sections and
  `src/production-spec/producer-agent.docs-test.ts` in full: confirm the existing Save-phase download
  wording to mirror, and every pre-existing pinned substring that must survive the edit.
- [x] 1.7 Read `openspec/specs/asset-store/spec.md`, `cast-render/spec.md`, and
  `producer-conductor/spec.md` in full to ground the spec deltas in the REAL current capability text,
  never duplicating or contradicting an existing Requirement.

## 2. `src/asset/asset.ts` — the optional `path` field (test-first)

- [x] 2.1 Add failing tests to `src/asset/asset.test.ts` FIRST: `parseCastCandidate` parses a candidate
  carrying `path`; a candidate with NO `path` carries no `path` key at all (never `undefined`, under
  `exactOptionalPropertyTypes`); a malformed `path` (empty string / non-string) is dropped, never the
  whole candidate; `parseCastArray` preserves each candidate's own `path` (present or absent)
  independently, in order.
- [x] 2.2 Add the optional `path?: string` field to `LedgerCastCandidate` and extend
  `parseCastCandidate`'s defensive parsing to include it only when non-empty-string. Run 2.1: green.

## 3. `src/asset/cast-candidates.ts` — the new deep module (test-first)

- [x] 3.1 Write `src/asset/cast-candidates.test.ts` FIRST (failing): `castCandidatesDirFor` mirrors
  `outputDirFor`'s id/run/recipe convention with `.cast` in place of `.output`, never returns
  `.output`/`.assets`/`.spec.json`, handles an already-short idea id, and is Recipe-generic (two
  different `recipe` slugs produce two different directories); `castCandidateFilename` names
  `<index>-<identifier><ext>`, guesses the extension from the URL's own path (ignoring any query
  string), and defaults to `.png` for an unrecognizable or unparseable URL; `downloadCastCandidates`
  downloads every candidate in order and returns `{ identifier, url, path }` triples, throws naming the
  failed candidate on a non-OK response (never a partial Cast), handles an empty candidate list, and
  works identically for an arbitrary (non-wired-Recipe) candidate set.
- [x] 3.2 Implement `castCandidatesDirFor`, `castCandidateFilename`, `downloadCastCandidates` in
  `src/asset/cast-candidates.ts` (reusing `briefShortName` and `downloadAssetFiles`, no new runtime
  dependency). Run 3.1: green.
- [x] 3.3 Write `src/producer/cast-candidates-end-to-end.test.ts` FIRST (failing): drive the wired
  *Character Explainer with Cast* Recipe's first leg to its Cast gate against the REAL Magnific FAKE
  (`FakeSpace`/`driveToNextGate`, mirroring `driver.test.ts`'s own pause case), download every paused
  candidate via `downloadCastCandidates` into `castCandidatesDirFor`'s folder, write the Idea's Asset to
  a temp ledger with `status: "in_production"`, `pending_gate: "cast"`, and the downloaded `cast` in the
  SAME `writeAsset` call, then assert: the folder holds all 6 downloaded images; the ledger's `cast`
  entries each carry `identifier`/`url`/`path` aligned; the gate-candidate folder is distinct from the
  eventual `.output/` bundle; no live Magnific call was made (only the in-memory fake's own
  `editGoals`/`runs`). This is already green once 3.2 lands (no separate implementation step — it proves
  composition of already-implemented pieces).

## 4. `/pick-cast` surfaces the local file (test-first)

- [x] 4.1 Add failing tests to `src/commands/pick-cast.test.ts` FIRST: a successful pick against a
  candidate carrying `path` names that local file in the output (and not the remote URL); a successful
  pick against a legacy candidate with NO `path` falls back to naming its remote `url`, exactly as
  before; a mixed Cast (some candidates with `path`, some without) resolves each pick's OWN correct
  media reference.
- [x] 4.2 Add `pickedCandidateMedia(cast, n)` to `src/commands/pick-cast.ts` and use it in the
  successful-pick message (`(media: <path-or-url>)`). Run 4.1 + the WHOLE pre-existing
  `pick-cast.test.ts` file: green, zero regressions (every pre-existing assertion is a substring match,
  so the appended text cannot break it).

## 5. Documentation (issue #119 explicitly asks for the new convention to be documented)

- [x] 5.1 Rewrite `.claude/agents/producer.md`'s "Drive the canvas" section: after the existing
  paused-gate messaging paragraph, add the new "Download every paused gate's candidates..." paragraph —
  names `castCandidatesDirFor`/`downloadCastCandidates`, the `.cast/` folder (distinct from `.output/`
  and `.spec.json`), that the download happens in the SAME ledger write that records the pause, that
  this generalizes to ANY paused leg (never hard-coded to the wired Recipe), and that `/pick-cast`
  surfaces the local path when present. Every pre-existing pinned substring in
  `producer-agent.docs-test.ts` (Production Spec, never publish, ADR-0008, `awaiting_pick`, the
  thin/recipe-generic-conductor phrase, `driveToNextGate`/`Recipe.gates`, the watermark block, the
  Save-phase `.output/`/`outputDirFor`/`refreshPostJson` block, issue #102 findings) stays present.
- [x] 5.2 Add a new `describe` block to `producer-agent.docs-test.ts` FIRST (failing against the pre-edit
  doc): pins `castCandidatesDirFor`/`downloadCastCandidates`/`.cast/`, the `DriveOutcome.kind ===
  "paused"` generalization + "never hard-coded to one Recipe" phrase, the "SAME write that records the
  pause" + `LedgerCastCandidate.path` phrase, the `/pick-cast` local-path-falls-back-to-url phrase, and
  the `.cast/` vs `.output/`/`.spec.json` distinction. Then land 5.1; run green.
- [x] 5.3 Add a short paragraph to `.claude/commands/pick-cast.md` documenting that a successful pick's
  output now names the picked candidate's local file when the Producer already downloaded one, falling
  back to the remote URL otherwise.
- [x] 5.4 Add the new `.cast/` convention to `CLAUDE.md`'s State section (beside the existing
  `.output/` bullet) and a new table row to `README.md`'s State table, in each doc's own existing
  voice/format.

## 6. OpenSpec

- [x] 6.1 Author `proposal.md` (this file's sibling), this `tasks.md`, and four spec deltas:
  `cast-candidate-bundle` (ADDED), `asset-store` (MODIFIED — new Requirement for the `path` field),
  `cast-render` (MODIFIED — two new Requirements: the download-before-pause behavior, and `/pick-cast`'s
  local-file surfacing), `producer-conductor` (MODIFIED — new Requirement for the doc update).
- [x] 6.2 `openspec validate 119-cast-candidates-local-folder --strict` green.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite; record the new total, confirm zero regressions vs
  the pre-change baseline).
- [x] 7.2 `npm run test:docs` green (record the new total, confirm zero regressions).
- [x] 7.3 Simplify pass: confirm every issue #119 acceptance criterion maps to a named, passing test;
  confirm `downloadCastCandidates` is the ONLY place a Cast candidate's local `path` is ever computed
  (grep the diff for `castCandidateFilename`/`downloadAssetFiles` call sites); confirm no
  `spaces_*`/`creations_*` call anywhere in the diff outside the FakeSpace fixture; confirm the 10
  in-flight straw-motion W30 Cast picks were never opened or edited this session; confirm no git command
  was run; remove any dead code/unused import introduced along the way.
- [x] 7.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly flagging the
  Magnific fake), self-review notes, known limits.
