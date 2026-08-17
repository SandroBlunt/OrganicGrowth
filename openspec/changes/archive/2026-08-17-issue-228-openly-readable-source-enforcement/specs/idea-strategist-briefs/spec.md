## ADDED Requirements

### Requirement: The openly-readable-source rule's prose and IdeaStore's real enforcement are pinned together by a docs-test

`.claude/agents/idea-strategist.md` SHALL keep stating its openly-readable-source rule (its "Never
suggest an Idea whose every source is paywalled" sentence, step 6, lines ~69-79) AND SHALL cite the
concrete store-boundary enforcement issue #228 adds (`createIdea`, `IdeaValidationError`,
`src/idea/store.ts`) — so the prose and the code cannot silently drift apart the way issue #223 left
them (a queryable view, `TrendStore.listBriefableTrends`, that nothing was obliged to call). This SHALL
be proven by a docs-test that (a) reads the agent doc and asserts it still carries the rule's stable,
citation-anchored wording (its 2026-08-11/idea-03 historical precedent, plus the code-level identifiers
it must cite — never a free-prose sentence alone, which would rot the first time someone rewords it),
and (b) separately exercises the REAL `createIdea` against a real, throwaway SQLite database to prove
the store actually behaves as the doc claims.

#### Scenario: The doc still states the rule, anchored on its historical precedent, not free prose alone

- **GIVEN** `.claude/agents/idea-strategist.md` as shipped
- **WHEN** its openly-readable-source rule sentence is read
- **THEN** it names paywalled feeds as momentum signals, requires an openly readable source before a
  story can be briefed, and cites its real precedent (2026-08-11, idea-03 of the first daily Run)

#### Scenario: The doc cites the store-boundary enforcement issue #228 adds

- **GIVEN** `.claude/agents/idea-strategist.md` as shipped
- **WHEN** it is searched for the enforcement citation
- **THEN** it names `createIdea`, `IdeaValidationError`, and `src/idea/store.ts`

#### Scenario: The docs-test proves the doc and the store agree, using the real store against a real database

- **GIVEN** the docs-test file for this rule (`src/idea/openly-readable-source-rule.docs-test.ts`)
- **WHEN** it is run
- **THEN** it calls the real `createIdea` (never a stub/fake) against a real, throwaway SQLite database
  (`withTempDb`, never `:memory:`) to prove both the rejection case (paywalled `trendId`, empty
  `sourceUrls`) and the acceptance case (paywalled `trendId`, the Idea's own `sourceUrls`) the doc
  describes
