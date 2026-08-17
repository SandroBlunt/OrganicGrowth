## RENAMED Requirements

- FROM: `### Requirement: HOOK_TYPES is a closed, ten-value vocabulary with a one-line meaning per value`
- TO: `### Requirement: HOOK_TYPES is a closed, eleven-value vocabulary with a one-line meaning per value`

- FROM: `### Requirement: THEMES is a closed, nine-value vocabulary with a one-line meaning per value`
- TO: `### Requirement: THEMES is a closed, ten-value vocabulary with a one-line meaning per value`

## MODIFIED Requirements

### Requirement: HOOK_TYPES is a closed, eleven-value vocabulary with a one-line meaning per value

`src/vocabulary/hook-type.ts`'s `HOOK_TYPES` SHALL be a fixed array of exactly eleven `{ value, meaning }`
entries, each `value` a distinct, non-empty, snake_case string and each `meaning` a non-empty one-line
sentence. `isHookType(value)` SHALL return `true` for every `HOOK_TYPES[i].value` and `false` for any
string not in that set (matching is case-sensitive against the exact stored value). This module SHALL be
pure — no disk, network, or clock access.

One of the eleven values SHALL be the explicit sentinel `unclassified` (issue #219, Operator decision
2026-08-17) — a real, `NOT NULL`-compatible member of the closed set, never a nullable escape hatch —
exported as its own named constant `UNCLASSIFIED_HOOK_TYPE`, never a magic string a caller re-types. It
is the value an importer assigns to an Idea with no classifiable Hook concept, and SHALL be
distinguishable, in any query, from every one of the other ten real storytelling techniques.

#### Scenario: HOOK_TYPES holds exactly eleven distinct values, each with a meaning

- **GIVEN** `HOOK_TYPES` as exported by `src/vocabulary/hook-type.ts`
- **WHEN** its length, its values' distinctness, and each entry's `value`/`meaning` non-emptiness are
  checked
- **THEN** it holds exactly 11 entries, all eleven `value`s are distinct, and every entry carries a
  non-empty `meaning`

#### Scenario: isHookType recognizes every closed value, including 'unclassified', and rejects an outside one

- **GIVEN** every value in `HOOK_TYPES` (including `unclassified`) and one value not in that set
- **WHEN** `isHookType` is called on each
- **THEN** every real value returns `true` and the outside value returns `false`

#### Scenario: UNCLASSIFIED_HOOK_TYPE names the sentinel value, not a magic string

- **GIVEN** `src/vocabulary/hook-type.ts`'s exported `UNCLASSIFIED_HOOK_TYPE`
- **WHEN** it is read
- **THEN** it equals `"unclassified"`, and `HOOK_TYPES` contains an entry whose `value` is that same
  string

### Requirement: THEMES is a closed, ten-value vocabulary with a one-line meaning per value

`src/vocabulary/theme.ts`'s `THEMES` SHALL be a fixed array of exactly ten `{ value, meaning }` entries,
each `value` a distinct, non-empty, snake_case string and each `meaning` a non-empty one-line sentence.
`isTheme(value)` SHALL return `true` for every `THEMES[i].value` and `false` for any string not in that
set. This module SHALL be pure. The original nine SHALL be calibrated to span BOTH Brands' real content
(an AI/tech-news Idea and a household-tips Idea must each map onto one of these nine), not scoped to one
Brand's niche.

One of the ten values SHALL be the explicit sentinel `unclassified` (issue #219, Operator decision
2026-08-17) — a real, `NOT NULL`-compatible member of the closed set, never a nullable escape hatch —
exported as its own named constant `UNCLASSIFIED_THEME`, never a magic string a caller re-types. It is
the value an importer assigns to an Idea with no classifiable subject, and SHALL be distinguishable, in
any query, from every one of the other nine real categories.

#### Scenario: THEMES holds exactly ten distinct values, each with a meaning

- **GIVEN** `THEMES` as exported by `src/vocabulary/theme.ts`
- **WHEN** its length, its values' distinctness, and each entry's `value`/`meaning` non-emptiness are
  checked
- **THEN** it holds exactly 10 entries, all ten `value`s are distinct, and every entry carries a
  non-empty `meaning`

#### Scenario: isTheme recognizes every closed value, including 'unclassified', and rejects an outside one

- **GIVEN** every value in `THEMES` (including `unclassified`) and one value not in that set
- **WHEN** `isTheme` is called on each
- **THEN** every real value returns `true` and the outside value returns `false`

#### Scenario: UNCLASSIFIED_THEME names the sentinel value, not a magic string

- **GIVEN** `src/vocabulary/theme.ts`'s exported `UNCLASSIFIED_THEME`
- **WHEN** it is read
- **THEN** it equals `"unclassified"`, and `THEMES` contains an entry whose `value` is that same string
