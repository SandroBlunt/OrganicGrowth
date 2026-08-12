## MODIFIED Requirements

### Requirement: outputDirFor names a new Asset's bundle directory `idea-NN.<recipe>.output`

`src/asset/output-bundle.ts` SHALL export `outputDirFor(ideaId, run, ideasRoot, recipe, cadence?)` — a
pure function returning `<ideasRoot>/<run>/idea-NN.<recipe>.output`, mirroring
`src/production-spec/store.ts`'s `specPathFor`/`briefShortName` id→filename convention exactly (reusing
`briefShortName`, never re-deriving it), but with the `.output` suffix in place of `.assets`. This is
the ONE call site that picks the new folder name for a brand-new Asset; every other function in this
module resolves an EXISTING Asset's bundle directory from its own recorded `asset_paths` instead (see
the backward-compatibility Requirement below), never by re-deriving this path.

`cadence` (`FormatCadence`, ADR-0023, issue #185) is an OPTIONAL 5th parameter, DEFAULTING to
`"weekly"` — every call site that predates cadence-awareness keeps returning the exact same flat
`<ideasRoot>/<run>/idea-NN.<recipe>.output` path, byte-for-byte unchanged. WHEN `cadence` is
`"daily"`, the `<run>` segment SHALL instead expand to `runPathSegments(run, "daily")`
(`src/format/run-id.ts`) — nesting the bundle under `<ideasRoot>/<ISO-week>/<weekday>-<DD>-<month>/
idea-NN.<recipe>.output`.

#### Scenario: outputDirFor mirrors specPathFor's own id/run/recipe convention

- **GIVEN** `ideaId: "idea-2026-W29-01"`, `run: "2026-W29"`, `ideasRoot: "data/brands/straw-motion/ideas"`,
  `recipe: "news-carousel"`
- **WHEN** `outputDirFor(ideaId, run, ideasRoot, recipe)` is called
- **THEN** it returns `data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.output`

#### Scenario: outputDirFor never returns the retired .assets name

- **GIVEN** any well-formed `(ideaId, run, ideasRoot, recipe)`
- **WHEN** `outputDirFor` is called
- **THEN** the returned path ends with `.output`, never `.assets`

#### Scenario: Omitting cadence is byte-identical to outputDirFor's pre-ADR-0023 behavior

- **GIVEN** `outputDirFor("idea-01", "2026-W22", "ideas", "news-carousel")` (no 5th argument)
- **WHEN** compared against `outputDirFor("idea-01", "2026-W22", "ideas", "news-carousel", "weekly")`
- **THEN** the two calls return the identical string

#### Scenario: A daily cadence nests the output bundle under its ISO week + weekday-DD-month leaf

- **GIVEN** `outputDirFor("idea-01", "2026-08-12", "ideas/unhypped-daily", "news-carousel", "daily")`
- **WHEN** the path is computed
- **THEN** it returns `"ideas/unhypped-daily/2026-W33/wednesday-12-august/idea-01.news-carousel.output"`
