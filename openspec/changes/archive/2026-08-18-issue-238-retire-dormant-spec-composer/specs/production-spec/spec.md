## REMOVED Requirements

### Requirement: Compose and persist a Production Spec beside the Brief, segmented by Recipe

**Reason**: Described `src/production-spec/compose.ts`'s `composeSpec` — "the Producer SHALL compose a
contract-conformant Production Spec from an accepted Brief and persist it..." — a module that predates
the Recipe/multi-format model, is not Recipe-aware (hardcodes the single original `generate.ts`
generator), and has zero production callers (re-confirmed fresh by grep, issue #238). ADR-0031 (issue
#264, merged) moved Spec authorship to Review at accept time, through a completely different,
Recipe-generic path (`author-at-review.ts`'s `authorSpecForRecipe`, self-checked against
`auditAuthorPhase`, persisted via `command-surface/production-spec.ts`'s `saveAssetSpec`/
`refreshSpecFile`) — never through `composeSpec`. Keeping this Requirement's wording (the Producer
composes and persists, gated by `validate()` + the brand-safety scan) would leave the spec set
self-contradictory alongside `spec-authored-at-review`'s "Review is the single authorship point" and this
same file's own "authorSpecForRecipe authors a candidate Spec and self-checks it..." Requirements. The
`composeSpec` module and its dedicated test suite are deleted by the same change that removes this
Requirement.

**Migration**: The authorship + validation + brand-safety gate this Requirement described is now covered
by "A deterministic Spec author exists for every wired Recipe, mirroring the Copy step's own drafter
seam" and "authorSpecForRecipe authors a candidate Spec and self-checks it against auditAuthorPhase in
one call" (both already present in this same capability), plus `accept-idea-command`'s "acceptIdeaCommand
authors and self-checks each chosen Recipe's Production Spec before either queue is written (ADR-0031)"
and "A Recipe's authored Spec is persisted through the SQL-backed writer and regenerated as the
human-readable file view" — together they cover the same ground (authoring, self-checking, refusing a
failing Spec, and persisting the result) for the CURRENT design. The still-true, still-tested technical
facts this Requirement also carried — `specPathFor`'s Recipe segmentation and cadence-aware path nesting,
and `generate()`'s `Brief.companies` passthrough — survive under the new, actor-neutral "The file-backed
Production Spec is located and persisted beside its Brief, segmented by Recipe" Requirement ADDED by this
same change.

## ADDED Requirements

### Requirement: The file-backed Production Spec is located and persisted beside its Brief, segmented by Recipe

`src/production-spec/store.ts`'s `specPathFor(ideaId, run, ideasRoot, recipe, cadence?)` and `saveSpec(spec, path)` SHALL locate and write a Production Spec beside its Brief, at
`data/brands/<slug>/ideas/<run>/idea-NN.<recipe>.spec.json` — the machine-readable sibling of the Brief
(`idea-NN.md`) — so a SECOND chosen Recipe for the same Idea gets its OWN Spec file rather than
overwriting the first Recipe's. `recipe` SHALL be a required, explicit parameter (never defaulted or
inferred) — today's caller (`src/commands/accept-idea.ts`'s `acceptIdeaCommand`, via
`src/command-surface/production-spec.ts`'s `refreshSpecFile`, ADR-0031) always knows it explicitly, as
Review's own chosen-Recipe selection.

`specPathFor` SHALL accept an OPTIONAL `cadence` (`FormatCadence`, ADR-0023, issue #185) parameter,
DEFAULTING to `"weekly"` when omitted — so every call site that predates cadence-awareness keeps
producing the exact same flat `<ideasRoot>/<run>/idea-NN.<recipe>.spec.json` path, byte-for-byte
unchanged. WHEN `cadence` is `"daily"`, the `<run>` segment SHALL instead expand to
`runPathSegments(run, "daily")` (`src/format/run-id.ts`) — the Run's ISO week, then its
weekday-DD-month leaf — nesting the Spec under
`<ideasRoot>/<ISO-week>/<weekday>-<DD>-<month>/idea-NN.<recipe>.spec.json`.

`src/production-spec/generate.ts`'s `generate` — the `character-explainer-with-cast` Recipe's
deterministic Spec author (ADR-0031's "A deterministic Spec author exists for every wired Recipe"
Requirement) — SHALL accept a `Brief` carrying an OPTIONAL `companies` field, `readonly string[]`. WHEN
`Brief.companies` is supplied (non-empty OR an explicit `[]`), `generate()` SHALL carry it through
UNCHANGED onto the generated Spec's own top-level `companies` field. WHEN `Brief.companies` is
`undefined`, the generated Spec SHALL carry NO `companies` field at all (never invented to fill it).

#### Scenario: Two Recipes of one Idea each get their own Spec file

- **GIVEN** one Idea, one Run, and TWO Recipe slugs (`character-explainer-with-cast` and `carousel`)
- **WHEN** `specPathFor` is called once per Recipe with the same Idea/Run/root
- **THEN** the two calls return two DIFFERENT paths
- **AND** saving a Spec to each via `saveSpec` writes two DIFFERENT files — neither overwrites the other

#### Scenario: Omitting cadence is byte-identical to specPathFor's pre-ADR-0023 behavior

- **GIVEN** `specPathFor("idea-2026-W22-01", "2026-W22", "root", "news-carousel")` (no 5th argument)
- **WHEN** compared against `specPathFor("idea-2026-W22-01", "2026-W22", "root", "news-carousel",
  "weekly")` (explicit weekly)
- **THEN** the two calls return the identical string

#### Scenario: A daily cadence nests the Spec under its ISO week + weekday-DD-month leaf (issue #185)

- **GIVEN** `specPathFor("idea-01", "2026-08-12", "root", "news-carousel", "daily")`
- **WHEN** the path is computed
- **THEN** it returns `"root/2026-W33/wednesday-12-august/idea-01.news-carousel.spec.json"`

#### Scenario: A Brief naming real companies yields a Spec whose companies list matches exactly (issue #125)

- **GIVEN** a Brief whose `companies` field is `["OpenAI", "Anthropic"]`
- **WHEN** `generate(brief)` is called (the `character-explainer-with-cast` Recipe's deterministic author)
- **THEN** the resulting Spec's `companies` field deep-equals `["OpenAI", "Anthropic"]`

#### Scenario: A Brief naming no companies yields a Spec with no companies field — never fabricated

- **GIVEN** a Brief with no `companies` field at all
- **WHEN** `generate(brief)` is called
- **THEN** the resulting Spec has no `companies` field at all

## MODIFIED Requirements

### Requirement: Producer agent definition

OrganicGrowth SHALL define a content `producer` agent (model Opus) joining trend-scout /
idea-strategist / performance-tracker. Its definition SHALL describe the Producer's role per CLAUDE.md
and CONTEXT.md: it drives a pre-defined Magnific Space — reads the Production Spec Review already
authored and self-checked at accept time (ADR-0031), runs the cast stage, pauses at the Cast gate, and
renders the Asset after the Operator picks the Character — and it **generates, never publishes**.

#### Scenario: The producer agent definition exists and is Opus

- **GIVEN** the repository's agent definitions
- **WHEN** the `producer` agent definition is read
- **THEN** it specifies model `opus`
- **AND** it describes reading an already-authored Production Spec (ADR-0031) and that the Producer
  generates but never publishes
