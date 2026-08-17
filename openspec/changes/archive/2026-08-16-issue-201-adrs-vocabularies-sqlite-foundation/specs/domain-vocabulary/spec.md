## ADDED Requirements

### Requirement: HOOK_TYPES is a closed, ten-value vocabulary with a one-line meaning per value

`src/vocabulary/hook-type.ts`'s `HOOK_TYPES` SHALL be a fixed array of exactly ten `{ value, meaning }`
entries, each `value` a distinct, non-empty, snake_case string and each `meaning` a non-empty one-line
sentence. `isHookType(value)` SHALL return `true` for every `HOOK_TYPES[i].value` and `false` for any
string not in that set (matching is case-sensitive against the exact stored value). This module SHALL be
pure — no disk, network, or clock access.

#### Scenario: HOOK_TYPES holds exactly ten distinct values, each with a meaning

- **GIVEN** `HOOK_TYPES` as exported by `src/vocabulary/hook-type.ts`
- **WHEN** its length, its values' distinctness, and each entry's `value`/`meaning` non-emptiness are
  checked
- **THEN** it holds exactly 10 entries, all ten `value`s are distinct, and every entry carries a
  non-empty `meaning`

#### Scenario: isHookType recognizes every closed value and rejects an outside one

- **GIVEN** every value in `HOOK_TYPES` and one value not in that set
- **WHEN** `isHookType` is called on each
- **THEN** every real value returns `true` and the outside value returns `false`

### Requirement: THEMES is a closed, nine-value vocabulary with a one-line meaning per value

`src/vocabulary/theme.ts`'s `THEMES` SHALL be a fixed array of exactly nine `{ value, meaning }` entries,
each `value` a distinct, non-empty, snake_case string and each `meaning` a non-empty one-line sentence.
`isTheme(value)` SHALL return `true` for every `THEMES[i].value` and `false` for any string not in that
set. This module SHALL be pure. `THEMES` SHALL be calibrated to span BOTH Brands' real content (an
AI/tech-news Idea and a household-tips Idea must each map onto one of these nine), not scoped to one
Brand's niche.

#### Scenario: THEMES holds exactly nine distinct values, each with a meaning

- **GIVEN** `THEMES` as exported by `src/vocabulary/theme.ts`
- **WHEN** its length, its values' distinctness, and each entry's `value`/`meaning` non-emptiness are
  checked
- **THEN** it holds exactly 9 entries, all nine `value`s are distinct, and every entry carries a
  non-empty `meaning`

#### Scenario: isTheme recognizes every closed value and rejects an outside one

- **GIVEN** every value in `THEMES` and one value not in that set
- **WHEN** `isTheme` is called on each
- **THEN** every real value returns `true` and the outside value returns `false`
