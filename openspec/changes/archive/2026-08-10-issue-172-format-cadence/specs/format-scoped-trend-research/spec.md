## ADDED Requirements

### Requirement: /run-trends defaults the Run name from the invoked Format's cadence (ADR-0022)

When `<run-id>` is omitted, `/run-trends <brand> <format> [<run-id>]` SHALL default it from the
invoked Format's own `cadence` field (`FormatFile.cadence`, `src/format/store.ts`), via
`defaultRunId(cadence, date)` (`src/format/run-id.ts`): the current ISO week (e.g. `2026-W23`) for a
`"weekly"` Format, or the current ISO calendar date (e.g. `2026-08-11`) for a `"daily"` Format. When
`<run-id>` IS supplied, it is used verbatim regardless of cadence. Either way, the resolved Run id
SHALL be validated (`assertValidRunId`, same module) as a safe path segment BEFORE
`data/brands/<slug>/ideas/<format>/<run>/` is created — a path-traversal value is rejected loudly,
before any directory is created.

#### Scenario: The documented usage states the cadence-derived default

- **GIVEN** the `/run-trends` command documentation
- **WHEN** its usage/intro section is read
- **THEN** it names `defaultRunId` (`src/format/run-id.ts`) as computing the default, states the
  current-ISO-week default for a weekly Format and the current-ISO-date default for a daily Format,
  and gives a concrete example date (`2026-08-11`)

#### Scenario: The documented Steps validate the run id before creating any directory

- **GIVEN** the `/run-trends` command documentation's Steps section
- **WHEN** "Determine the run id" is read
- **THEN** it names `assertValidRunId` and states the guard runs BEFORE the Run's Ideas directory is
  created

#### Scenario: defaultRunId picks the ISO week for a weekly Format and the ISO date for a daily Format

- **GIVEN** a fixed clock reading of `2026-08-11T09:00:00.000Z`
- **WHEN** `defaultRunId("weekly", date)` and `defaultRunId("daily", date)` are called
- **THEN** the first equals `"2026-W33"` (`isoWeek(date)`) and the second equals `"2026-08-11"`
  (`isoDateString(date)`)
