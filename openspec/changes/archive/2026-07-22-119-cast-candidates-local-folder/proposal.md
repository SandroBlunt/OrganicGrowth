## Why

Issue #119. Today, when a Recipe's gated first leg (today: the wired *Character Explainer with Cast*
Recipe's Cast run-point) renders its candidates, the Producer records each one on the ledger's
`LedgerAssetRecord.cast` field as `{ identifier, url }` ONLY — no local file is ever downloaded. The
Operator has to be handed a raw, login-gated, expiring Magnific URL (`https://www.magnific.com/app/
creation/<id>`) to review a candidate before picking with `/pick-cast`. This is exactly the gap News
Carousel's (and any produced Asset's) OWN media closed in issue #112: a produced Asset's final media is
downloaded to a durable local file (`src/asset/download.ts`'s `downloadAssetFiles`) inside a
consistently-named bundle folder (`src/asset/output-bundle.ts`'s `outputDirFor`) — but neither primitive
was ever wired up for a Recipe's PRE-gate candidates. The download mechanism is not missing; it is simply
not reused here.

## What Changes

**A local, inspectable folder for a Recipe's rendered gate candidates**, parallel to (and following the
SAME naming-convention family as) the existing produced-Asset `.output/` bundle:
- `src/asset/cast-candidates.ts`'s `castCandidatesDirFor(ideaId, run, ideasRoot, recipe)` — a new
  folder-naming function, same four inputs as `outputDirFor`, returning
  `<ideasRoot>/<run>/idea-NN.<recipe>.cast` (a sibling of the Brief, the Spec, and the eventual
  `.output/` bundle, distinctly named so it is never mistaken for either).
- `downloadCastCandidates(destDir, candidates, fetchImpl?)` — downloads every candidate's image via the
  SAME `downloadAssetFiles` primitive a produced Asset's final media already uses, and returns each
  candidate ready to record on the ledger with its downloaded local `path` set.
- `LedgerCastCandidate` gains an optional `path` field — mirroring `LedgerAssetRecord.asset_paths` vs its
  legacy `asset_url`: the durable local file is preferred, the remote URL remains the fallback for a
  candidate recorded before this field existed (or whose download genuinely could not complete).
  `parseCastCandidate`'s defensive parsing includes `path` only when it is itself a non-empty string —
  a missing/malformed `path` degrades to an identifier/url-only candidate, never drops the whole
  candidate and never throws.
- `/pick-cast`'s successful-pick output now names the picked candidate's own local file when one exists,
  falling back to its remote URL exactly as before when it does not.
- `.claude/agents/producer.md`'s Cast-gate step documents downloading every paused leg's candidates into
  `castCandidatesDirFor`'s folder and recording each result's local `path` on the ledger IN THE SAME
  write that records the gate pause — generalized to ANY Recipe whose first leg is gated (never
  hard-coded to the one wired Recipe), mirroring the Save phase's own download step.

This generalizes beyond the one wired Recipe: `castCandidatesDirFor`/`downloadCastCandidates` take a
`recipe` slug (and an arbitrary candidate set) as explicit parameters — never a hard-coded Recipe name —
so ANY future Recipe that declares a gated first leg with multiple candidates reuses the SAME functions.

## Non-Goals (explicitly deferred / out of scope)

- **Backfilling local paths for the 10 already-in-flight straw-motion W30 Cast picks.** Those stay
  exactly as they are; this only changes behavior for Cast gates rendered AFTER this ships. No
  `data/brands/**` file is hand-edited by this change.
- **A general audit of every OTHER piece of generated media** (Baseline Prompt renders, Brand Asset
  uploads, etc.) for a consistent folder home — a broader, separate concern the issue itself flags as out
  of scope here.
- **The unrelated Idea-id collision bug** noted in the issue's own session context — a distinct latent
  bug, not part of this fix.
- **Renaming or migrating any EXISTING output-bundle folder naming.** This only adds a new, additional
  folder for gate candidates; `outputDirFor`/`.output/` and `specPathFor`/`.spec.json` are untouched.
- **No change to `AssetStatus`, `pending_gate`, or any OTHER `LedgerAssetRecord` field** — only
  `LedgerCastCandidate` gains the new optional `path`.

## Capabilities

### Added Capabilities

- `cast-candidate-bundle`: the new `src/asset/cast-candidates.ts` deep module — `castCandidatesDirFor`,
  `castCandidateFilename`, `downloadCastCandidates` — the gate-candidate folder-naming + download
  primitives, parallel to (and reusing the download mechanism from) the produced-Asset output bundle.

### Modified Capabilities

- `asset-store`: `LedgerCastCandidate` gains an optional `path` field; `parseCastCandidate` parses it
  defensively (present only when a non-empty string, never crashes on a missing/malformed value).
- `cast-render`: producing a Recipe's Cast gate downloads every rendered candidate to a local folder
  before/at the same time the ledger records the gate pause; `/pick-cast`'s output surfaces the picked
  candidate's local file when present, falling back to its remote URL exactly as before when absent.
- `producer-conductor`: `producer.md`'s Cast-gate step documents the new download-before-pause behavior,
  generalized to any Recipe with a gated first leg (never hard-coded to the wired Recipe).

## Impact

- **Added:** `src/asset/cast-candidates.ts`, `src/asset/cast-candidates.test.ts`,
  `src/producer/cast-candidates-end-to-end.test.ts`.
- **Modified:** `src/asset/asset.ts` (+ `asset.test.ts`), `src/commands/pick-cast.ts` (+
  `pick-cast.test.ts`), `.claude/agents/producer.md`, `src/production-spec/producer-agent.docs-test.ts`
  (new pins), `.claude/commands/pick-cast.md`, `CLAUDE.md`, `README.md`.
- **Not touched:** `src/asset/output-bundle.ts`, `src/asset/download.ts`, `src/asset/store.ts`,
  `src/asset/migrate.ts`, `src/recipe/registry.ts`, `src/space-driver/driver.ts`, `src/commands/pick.ts`,
  any `data/brands/**` file, `data/queue.json`.
- **Hermetic:** no live `spaces_*`/`creations_*`/Apify call anywhere in the diff. The new deep module's
  own unit tests use the same plain-fetch-stub pattern `download.test.ts`/`output-bundle.test.ts` already
  established; the new end-to-end composition test drives the REAL `driveToNextGate` against the
  existing Magnific FAKE (`FakeSpace`, `src/space-driver/fixtures/fake-space.ts`) to prove the download
  step composes correctly with a genuinely paused leg — no credits spent, no board mutation.
- **Always-rules upheld:** ledger-as-source-of-truth (rule 7) — every downloaded candidate's local path
  is written onto the SAME Brand ledger record that already tracks the gate pause, never a second store;
  generate-never-publish, public-metrics-only, relative-not-absolute, and explicit-attribution are all
  untouched by this slice's scope.
