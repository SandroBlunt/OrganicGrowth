## MODIFIED Requirements

### Requirement: CONTEXT.md defines Hook Type and Theme as closed vocabularies, term-for-term matching their TypeScript source

`CONTEXT.md` SHALL define **Hook Type** and **Theme** as their own glossary headings, each explicitly
stated as a CLOSED vocabulary (not free text), and each SHALL list every value from
`src/vocabulary/hook-type.ts`'s `HOOK_TYPES` / `src/vocabulary/theme.ts`'s `THEMES` together with that
value's EXACT one-line meaning sentence — so the doc and the TypeScript source cannot silently drift
apart.

Both entries SHALL additionally explain the explicit `unclassified` member (issue #219, Operator
decision 2026-08-17) beyond just listing it in the closed set: naming the **importer** (issue #204) as
who assigns it, and stating it, in a query, is **distinguishable** from every real, classified value —
so the doc records WHY this value exists (an honest `NOT NULL`-compatible default, never a nullable
escape hatch that would conflate "not yet classified" with "has nothing to classify"), not merely THAT
it exists.

#### Scenario: CONTEXT.md's Hook Type entry lists every HOOK_TYPES value with its exact meaning

- **GIVEN** `CONTEXT.md` as shipped and `src/vocabulary/hook-type.ts`'s `HOOK_TYPES`
- **WHEN** the Hook Type glossary entry is read
- **THEN** it states the vocabulary is closed, and for every `HOOK_TYPES` entry it contains that exact
  `value` (as inline code) and that exact `meaning` sentence

#### Scenario: CONTEXT.md's Theme entry lists every THEMES value with its exact meaning

- **GIVEN** `CONTEXT.md` as shipped and `src/vocabulary/theme.ts`'s `THEMES`
- **WHEN** the Theme glossary entry is read
- **THEN** it states the vocabulary is closed, and for every `THEMES` entry it contains that exact
  `value` (as inline code) and that exact `meaning` sentence

#### Scenario: CONTEXT.md's Hook Type entry explains 'unclassified' beyond just listing it (issue #219)

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Hook Type glossary entry is read
- **THEN** it names the importer as who assigns `unclassified`, and states `unclassified` is
  distinguishable, in a query, from every real, classified value

#### Scenario: CONTEXT.md's Theme entry explains 'unclassified' beyond just listing it (issue #219)

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Theme glossary entry is read
- **THEN** it names the importer as who assigns `unclassified`, and states `unclassified` is
  distinguishable, in a query, from every real, classified value
