## ADDED Requirements

### Requirement: createIdea enforces the openly-readable-source rule at the store boundary, not merely by agent memory

`createIdea` SHALL reject an `IdeaInput` whose `trendId` points at a Trend committed with
`isPaywalled: true` when the Idea's OWN `sourceUrls` holds no non-blank entry (omitted, `[]`, or every
entry blank/whitespace-only after trimming), raising the store's EXISTING `IdeaValidationError` — never
a new error type — before the `INSERT` is issued. This is the Operator rule already documented as prose
in `.claude/agents/idea-strategist.md` (step 6, lines ~69-79, 2026-08-11 — idea-03 of the first daily
Run was rejected exactly for this): a paywalled feed item (FT, NYT, WIRED) is a momentum signal, never a
citation on its own — a story needs a source a human could actually open before it can be briefed. Issue
#223 made the paywalled-visibility fact QUERYABLE (`TrendStore.listBriefableTrends`) but enforced
nothing; this Requirement is the actual store-boundary gate #223's own AC4 asked for.

A blank (`""`) or whitespace-only (`"   "`) `sourceUrls` entry SHALL be treated as ABSENT, never as
satisfying the rule (QA round-1 finding on this Requirement: the rule is "there is a source a human
could actually open," not merely "the array is non-empty"). `createIdea` SHALL NOT additionally require
a non-blank entry be URL-shaped (no scheme/format check) — a review of the real Briefs under every
Brand's `ideas` directory found the "## Source(s)" section legitimately carries non-URL editorial and
verification notes alongside clean links, and no other `{ db }` store in this codebase validates URL
format/content; inventing that check here, ahead of issue #204's importer (the thing that will actually
populate `sourceUrls` from real data) and unasked by any acceptance criterion, is explicitly out of
scope for this Requirement.

This Requirement SHALL NOT block an Idea merely because its `trendId` is paywalled: an Idea legitimately
citing a paywalled Trend as a momentum signal, while carrying at least one non-blank `sourceUrls` entry
of its own, SHALL be accepted — that is the intended workflow, never a loophole. An Idea whose `trendId`
is omitted, or whose `trendId` points at a Trend that is NOT paywalled, SHALL NEVER be rejected by this
rule regardless of `sourceUrls`. An Idea whose `trendId` names no committed Trend row SHALL NOT be
rejected by this rule either — that case is left to the schema's own FOREIGN KEY, mirroring `createIdea`'s
existing not-pre-validated convention for `runId`/`brandId`/`formatId`.

#### Scenario: createIdea accepts a paywalled trendId when the Idea carries its own sourceUrls (the case a naive implementation breaks)

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and
  `sourceUrls: ["https://an-open-source.example/article"]`
- **THEN** the Idea is created successfully, `trendId` and `sourceUrls` both stored verbatim

#### Scenario: createIdea rejects a paywalled trendId when the Idea's own sourceUrls is empty

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and `sourceUrls` omitted (or `[]`)
- **THEN** it throws `IdeaValidationError`, and no `idea` row is created

#### Scenario: createIdea rejects a paywalled trendId when every sourceUrls entry is blank or whitespace-only

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and `sourceUrls: [""]` (or
  `["   "]`, or `["", "   ", ""]`)
- **THEN** it throws `IdeaValidationError`, and no `idea` row is created — a blank/whitespace-only entry
  is treated exactly as if `sourceUrls` were empty

#### Scenario: createIdea accepts a paywalled trendId when sourceUrls mixes one blank entry with one real entry

- **GIVEN** a Trend committed with `isPaywalled: true`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and
  `sourceUrls: ["   ", "https://an-open-source.example/article"]`
- **THEN** the Idea is created successfully — only ONE non-blank entry is required, and blank entries
  elsewhere in the array do not cancel it out

#### Scenario: createIdea never blocks on a non-paywalled trendId, even with no sourceUrls

- **GIVEN** a Trend committed with `isPaywalled: false`
- **WHEN** `createIdea` is called with that Trend's id as `trendId` and `sourceUrls` omitted
- **THEN** the Idea is created successfully — this rule is about the Idea's OWN sources, never the
  Trend's paywall status alone

#### Scenario: createIdea never blocks when trendId is omitted entirely

- **GIVEN** an `IdeaInput` with no `trendId` at all
- **WHEN** `createIdea` is called, regardless of `sourceUrls`
- **THEN** the Idea is created successfully

#### Scenario: createIdea never pre-validates a dangling trendId — it falls through to the schema's own FOREIGN KEY

- **GIVEN** a `trendId` naming no committed Trend row
- **WHEN** `createIdea` is called with that `trendId`
- **THEN** it throws a foreign-key error (never `IdeaValidationError`) — this rule is deliberately NOT
  pre-validated, mirroring `createIdea`'s existing not-pre-validated convention for
  `runId`/`brandId`/`formatId`
