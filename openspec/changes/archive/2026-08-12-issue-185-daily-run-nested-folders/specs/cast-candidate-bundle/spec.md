## MODIFIED Requirements

### Requirement: castCandidatesDirFor names a Recipe's gate-candidate folder `idea-NN.<recipe>.cast`

`src/asset/cast-candidates.ts` SHALL export `castCandidatesDirFor(ideaId, run, ideasRoot, recipe,
cadence?)` — a pure function returning `<ideasRoot>/<run>/idea-NN.<recipe>.cast`, mirroring
`src/asset/output-bundle.ts`'s `outputDirFor` id/run/recipe convention exactly (reusing
`src/production-spec/store.ts`'s `briefShortName`, never re-deriving it), but with the `.cast` suffix in
place of `.output`/`.spec.json` — a distinctly-named sibling directory, never mistaken for the produced
Asset's own bundle or its Spec. `recipe` SHALL be an explicit parameter (never hard-coded), so ANY
Recipe that declares a gated first leg reuses this SAME function for its own gate-candidate folder.

`cadence` (`FormatCadence`, ADR-0023, issue #185) is an OPTIONAL 5th parameter, DEFAULTING to
`"weekly"` — every call site that predates cadence-awareness keeps returning the exact same flat
`<ideasRoot>/<run>/idea-NN.<recipe>.cast` path, byte-for-byte unchanged. WHEN `cadence` is `"daily"`,
the `<run>` segment SHALL instead expand to `runPathSegments(run, "daily")` (`src/format/run-id.ts`) —
nesting the gate-candidate folder under `<ideasRoot>/<ISO-week>/<weekday>-<DD>-<month>/
idea-NN.<recipe>.cast`.

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

#### Scenario: Omitting cadence is byte-identical to castCandidatesDirFor's pre-ADR-0023 behavior

- **GIVEN** `castCandidatesDirFor("idea-01", "2026-W22", "ideas", "character-explainer-with-cast")`
  (no 5th argument)
- **WHEN** compared against the same call with an explicit trailing `"weekly"` argument
- **THEN** the two calls return the identical string

#### Scenario: A daily cadence nests the gate-candidate folder under its ISO week + weekday-DD-month leaf

- **GIVEN** `castCandidatesDirFor("idea-01", "2026-08-12", "ideas/unhypped-daily",
  "character-explainer-with-cast", "daily")`
- **WHEN** the path is computed
- **THEN** it returns
  `"ideas/unhypped-daily/2026-W33/wednesday-12-august/idea-01.character-explainer-with-cast.cast"`
