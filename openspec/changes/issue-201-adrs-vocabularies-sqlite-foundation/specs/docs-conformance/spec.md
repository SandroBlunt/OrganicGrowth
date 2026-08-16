## ADDED Requirements

### Requirement: CONTEXT.md defines Hook Type and Theme as closed vocabularies, term-for-term matching their TypeScript source

`CONTEXT.md` SHALL define **Hook Type** and **Theme** as their own glossary headings, each explicitly
stated as a CLOSED vocabulary (not free text), and each SHALL list every value from
`src/vocabulary/hook-type.ts`'s `HOOK_TYPES` / `src/vocabulary/theme.ts`'s `THEMES` together with that
value's EXACT one-line meaning sentence — so the doc and the TypeScript source cannot silently drift
apart.

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

### Requirement: CONTEXT.md's Recipe entry states the registry's real wired count, never a stale one

`CONTEXT.md`'s **Recipe** entry SHALL state the CURRENT number of wired Recipes in words, name every
one of them by its human name (including *News Short Script*), and SHALL NOT describe any currently-wired
Recipe as "build pending". It SHALL cite `src/recipe/registry.ts` as the source of truth for the wired
count, rather than asserting a count of its own that can go stale.

#### Scenario: CONTEXT.md states three Recipes are wired, naming all three

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Recipe glossary entry is read
- **THEN** it states "Today three Recipes are wired", names Character Explainer with Cast, News
  Carousel, and News Short Script, and does not call News Short Script "build pending"

#### Scenario: CONTEXT.md cites the registry as the source of truth for the wired count

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the sentence stating the wired count is read
- **THEN** it names `registry.ts`

### Requirement: The two superseding ADRs exist, record the Operator decision date, and cross-reference what they supersede

`docs/adr/0028-post-is-its-own-record.md` SHALL state it supersedes ADR-0011 (naming the reversal: Post
becomes its own record rather than scalar fields on the Asset), record the Operator decision date
`2026-08-16`, and state the new `post` table's key shape (`asset_id`, `channel_id`).
`docs/adr/0029-local-sqlite-behind-the-store-boundary.md` SHALL state it supersedes ADR-0014, record the
SAME Operator decision date, state local SQLite via `node:sqlite` explicitly as never hosted/never
Postgres/never multi-tenant, and state ADR-0014's store-boundary principle is KEPT and FULFILLED (not
abandoned).

#### Scenario: ADR-0028 cites ADR-0011, the decision date, and the new table's key shape

- **GIVEN** `docs/adr/0028-post-is-its-own-record.md` as shipped
- **WHEN** it is read
- **THEN** it states it supersedes ADR-0011, records `2026-08-16`, and names `asset_id`/`channel_id`

#### Scenario: ADR-0029 cites ADR-0014, the decision date, and states "never hosted/Postgres/multi-tenant"

- **GIVEN** `docs/adr/0029-local-sqlite-behind-the-store-boundary.md` as shipped
- **WHEN** it is read
- **THEN** it states it supersedes ADR-0014, records `2026-08-16`, states "never a hosted service, never
  Postgres, never multi-tenant", names `node:sqlite`, and states its store-boundary principle is "KEPT
  and FULFILLED"

### Requirement: ADR-0011 and ADR-0014 each carry a forward-pointer to their superseding ADR, never a silent contradiction

`docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` SHALL carry a blockquote stating it is
partially superseded by ADR-0028. `docs/adr/0014-canonical-state-in-files-behind-store-boundary.md` SHALL
carry a blockquote stating it is superseded by ADR-0029. Neither file's original decision text SHALL be
edited — only a forward-pointer is added, mirroring this repository's established pattern (ADRs
0015–0018 pointing back at 0010/0013/0014).

#### Scenario: ADR-0011 states it is partially superseded by ADR-0028

- **GIVEN** `docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` as shipped
- **WHEN** it is read
- **THEN** it contains the phrase "Partially superseded by ADR-0028"

#### Scenario: ADR-0014 states it is superseded by ADR-0029

- **GIVEN** `docs/adr/0014-canonical-state-in-files-behind-store-boundary.md` as shipped
- **WHEN** it is read
- **THEN** it contains the phrase "Superseded by ADR-0029"

### Requirement: Always-rule 7 cites the new SQLite foundation without overclaiming the store swap

`.claude/rules/always/organicgrowth-rules.md`'s rule 7 SHALL cite `docs/adr/0029` and SHALL state the
SQLite foundation is NOT YET the backing of any store — it SHALL NOT claim any store's backing has
already swapped to it (that swap is issue #202, not this ticket).

#### Scenario: Rule 7 cites ADR-0029 and states the store swap has not happened yet

- **GIVEN** `.claude/rules/always/organicgrowth-rules.md` as shipped
- **WHEN** rule 7 is read
- **THEN** it cites `docs/adr/0029` and states the SQLite foundation is "not yet the backing of any
  store"

### Requirement: CONTEXT.md's Post entry reflects the ADR-0028 reversal

`CONTEXT.md`'s **Post** entry SHALL cite `ADR-0028` and SHALL state a Post is keyed on `(Asset,
Channel)`, not a scalar field on the Asset.

#### Scenario: CONTEXT.md's Post entry cites ADR-0028 and the (Asset, Channel) key

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Post glossary entry is read
- **THEN** it cites ADR-0028 and states the key is `(Asset, Channel)`
