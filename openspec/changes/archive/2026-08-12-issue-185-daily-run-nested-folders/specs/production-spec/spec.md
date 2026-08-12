## MODIFIED Requirements

### Requirement: Compose and persist a Production Spec beside the Brief, segmented by Recipe

The Producer SHALL compose a contract-conformant Production Spec from an accepted Brief and persist it
to the Brand's `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` (the machine-readable
sibling of the Brief, now segmented by the chosen Recipe — ADR-0011, issue #56), so the Operator can
inspect exactly what will drive a render and so a SECOND chosen Recipe for the same Idea gets its OWN
Spec file rather than overwriting the first Recipe's. `recipe` SHALL be a required, explicit parameter
(never defaulted or inferred) to both `specPathFor` and `composeSpec`'s options. The persisted Spec
SHALL pass `validate()` and the brand-safety filter; a Spec that fails either SHALL NOT be written.

`specPathFor(ideaId, run, ideasRoot, recipe, cadence?)` SHALL accept an OPTIONAL `cadence`
(`FormatCadence`, ADR-0023, issue #185) parameter, DEFAULTING to `"weekly"` when omitted — so every
call site that predates cadence-awareness keeps producing the exact same flat
`<ideasRoot>/<run>/idea-NN.<recipe>.spec.json` path, byte-for-byte unchanged. WHEN `cadence` is
`"daily"`, the `<run>` segment SHALL instead expand to `runPathSegments(run, "daily")`
(`src/format/run-id.ts`) — the Run's ISO week, then its weekday-DD-month leaf — nesting the Spec under
`<ideasRoot>/<ISO-week>/<weekday>-<DD>-<month>/idea-NN.<recipe>.spec.json`.

`src/production-spec/generate.ts`'s `Brief` (the deterministic author-phase composer's own input, and
the Character Explainer Recipe's `produce-character-explainer` Skill's real-world counterpart) SHALL
carry a matching OPTIONAL `companies` field, `readonly string[]`. WHEN `Brief.companies` is supplied
(non-empty OR an explicit `[]`), `generate()` SHALL carry it through UNCHANGED onto the generated
Spec's own top-level `companies` field. WHEN `Brief.companies` is `undefined`, the generated Spec SHALL
carry NO `companies` field at all (never invented to fill it).

#### Scenario: Composing an accepted Idea writes a valid, Recipe-segmented Spec beside the Brief

- **GIVEN** an accepted Brief for Idea `idea-NN` in run `<run>`, composed for Recipe `<recipe>`
- **WHEN** the Producer composes its Production Spec
- **THEN** a file `data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` is written
- **AND** the written Spec passes `validate()` and the brand-safety filter

#### Scenario: Two Recipes of one Idea each get their own Spec file

- **GIVEN** one accepted Idea with TWO chosen Recipes, `character-explainer-with-cast` and `carousel`
- **WHEN** a Production Spec is composed and saved for each Recipe
- **THEN** the two Specs are written to two DIFFERENT paths, each segmented by its own Recipe
- **AND** neither Spec overwrites the other

#### Scenario: A failing Spec is refused, not written

- **GIVEN** a candidate Spec that fails validation or contains a banned word
- **WHEN** persistence is attempted
- **THEN** no `idea-NN.<recipe>.spec.json` is written and the failure is reported

#### Scenario: A Brief naming real companies writes a Spec whose companies list survives to disk (issue #125)

- **GIVEN** an accepted Brief whose `companies` field is `["OpenAI", "Anthropic"]`
- **WHEN** `composeSpec` composes and persists its Production Spec (Recipe
  `character-explainer-with-cast`)
- **THEN** the written Spec's `companies` field, re-read from disk, deep-equals
  `["OpenAI", "Anthropic"]`

#### Scenario: A Brief naming no companies writes a Spec with no companies field — never fabricated

- **GIVEN** an accepted Brief with no `companies` field at all
- **WHEN** `composeSpec` composes and persists its Production Spec (Recipe
  `character-explainer-with-cast`)
- **THEN** the written Spec, re-read from disk, has no `companies` field at all

#### Scenario: Omitting cadence is byte-identical to specPathFor's pre-ADR-0023 behavior

- **GIVEN** `specPathFor("idea-2026-W22-01", "2026-W22", "root", "news-carousel")` (no 5th argument)
- **WHEN** compared against `specPathFor("idea-2026-W22-01", "2026-W22", "root", "news-carousel",
  "weekly")` (explicit weekly)
- **THEN** the two calls return the identical string

#### Scenario: A daily cadence nests the Spec under its ISO week + weekday-DD-month leaf (issue #185)

- **GIVEN** `specPathFor("idea-01", "2026-08-12", "root", "news-carousel", "daily")`
- **WHEN** the path is computed
- **THEN** it returns `"root/2026-W33/wednesday-12-august/idea-01.news-carousel.spec.json"`
