# cast-candidate-bundle Specification

## Purpose
TBD - created by archiving change 119-cast-candidates-local-folder. Update Purpose after archive.
## Requirements
### Requirement: castCandidatesDirFor names a Recipe's gate-candidate folder `idea-NN.<recipe>.cast`

`src/asset/cast-candidates.ts` SHALL export `castCandidatesDirFor(ideaId, run, ideasRoot, recipe)` — a
pure function returning `<ideasRoot>/<run>/idea-NN.<recipe>.cast`, mirroring
`src/asset/output-bundle.ts`'s `outputDirFor` id/run/recipe convention exactly (reusing
`src/production-spec/store.ts`'s `briefShortName`, never re-deriving it), but with the `.cast` suffix in
place of `.output`/`.spec.json` — a distinctly-named sibling directory, never mistaken for the produced
Asset's own bundle or its Spec. `recipe` SHALL be an explicit parameter (never hard-coded), so ANY
Recipe that declares a gated first leg reuses this SAME function for its own gate-candidate folder.

#### Scenario: castCandidatesDirFor mirrors outputDirFor's own id/run/recipe convention

- **GIVEN** `ideaId: "idea-2026-W30-01"`, `run: "2026-W30"`,
  `ideasRoot: "data/brands/straw-motion/ideas"`, `recipe: "character-explainer-with-cast"`
- **WHEN** `castCandidatesDirFor(ideaId, run, ideasRoot, recipe)` is called
- **THEN** it returns
  `data/brands/straw-motion/ideas/2026-W30/idea-01.character-explainer-with-cast.cast`

#### Scenario: castCandidatesDirFor never returns the .output, .assets, or .spec.json names

- **GIVEN** any well-formed `(ideaId, run, ideasRoot, recipe)`
- **WHEN** `castCandidatesDirFor` is called
- **THEN** the returned path ends with `.cast`, never `.output`, `.assets`, or `.spec.json`

#### Scenario: castCandidatesDirFor is Recipe-generic

- **GIVEN** two different `recipe` slugs for the same `(ideaId, run, ideasRoot)`
- **WHEN** `castCandidatesDirFor` is called once per slug
- **THEN** it returns two distinct directories, one per Recipe — never a hard-coded single Recipe's name

### Requirement: castCandidateFilename names each candidate's downloaded file, stably

`src/asset/cast-candidates.ts` SHALL export a pure `castCandidateFilename(index, candidate)` returning
`<index>-<identifier><ext>`, where `index` is the caller-supplied 1-based order among the candidate set
and `<ext>` is guessed from the candidate's own `url` path (ignoring any query string or fragment),
defaulting to `.png` when the URL has no recognizable extension or cannot be parsed as a URL at all —
never throwing on a malformed `url`.

#### Scenario: A well-formed image URL yields its own extension

- **GIVEN** `index: 1`, `candidate: { identifier: "cast-1", url: "https://magnific.example/cast/1.png" }`
- **WHEN** `castCandidateFilename(index, candidate)` is called
- **THEN** it returns `"1-cast-1.png"`

#### Scenario: A query string is ignored when guessing the extension

- **GIVEN** `candidate.url` ending in `1.png?token=abc123`
- **WHEN** `castCandidateFilename` is called
- **THEN** the returned filename ends in `.png`, not `.png?token=abc123`

#### Scenario: An unrecognizable or unparseable URL defaults to .png, never throws

- **GIVEN** a `candidate.url` with no recognizable extension, or one that is not a parseable URL at all
- **WHEN** `castCandidateFilename` is called
- **THEN** it returns a filename ending in `.png` — no error is thrown

### Requirement: downloadCastCandidates downloads every candidate and returns ledger-ready records

`src/asset/cast-candidates.ts` SHALL export `downloadCastCandidates(destDir, candidates, fetchImpl?)`
that downloads every candidate's image into `destDir` via the SAME `downloadAssetFiles` primitive
(`src/asset/download.ts`) a produced Asset's final media already uses — sequential, never partial: it
SHALL throw, naming the failed candidate, on the FIRST failed fetch or write, rather than recording some
candidates with a local path and others without. On success it SHALL return, in the SAME order as
`candidates`, one `LedgerCastCandidate` per input carrying the ORIGINAL `identifier`/`url` unchanged plus
`path` set to the just-downloaded durable local file. This function SHALL take no Recipe slug or gate
name of its own — the caller resolves `destDir` (via `castCandidatesDirFor`) for whichever Recipe/gate
the candidate set belongs to, so this function works identically for any candidate set.

#### Scenario: Every candidate downloads, in order, with identifier/url/path all present

- **GIVEN** a destination directory and 3 candidates, each with a distinct `identifier`/`url`
- **WHEN** `downloadCastCandidates(destDir, candidates, fetchImpl)` is called against a fetch stub
- **THEN** it returns 3 records, in the SAME order, each carrying its ORIGINAL `identifier`/`url` plus a
  `path` pointing at the file just written inside `destDir`

#### Scenario: A failed candidate download throws, naming it, before recording a partial Cast

- **GIVEN** a candidate set where the second candidate's fetch returns a non-OK response
- **WHEN** `downloadCastCandidates` is called
- **THEN** it throws an error naming the second candidate's filename and status — no `LedgerCastCandidate`
  array is returned, and no ledger write happens from a partial result

#### Scenario: An empty candidate set still creates the destination directory

- **GIVEN** an empty `candidates` array
- **WHEN** `downloadCastCandidates` is called
- **THEN** `destDir` is created and an empty array is returned — no error

