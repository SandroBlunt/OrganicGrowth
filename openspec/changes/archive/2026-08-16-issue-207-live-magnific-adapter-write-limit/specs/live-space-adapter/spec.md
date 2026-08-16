## ADDED Requirements

### Requirement: The live spaces_edit write limit is modelled explicitly and checked before every write

The system SHALL model the live `spaces_edit` tool's write limit as an explicit, named constant
(`SPACES_EDIT_WRITE_LIMIT_CHARS`) rather than an assumed/undocumented number, citing the measured value
established across prior live Producer sessions. `LiveSpaceAdapter.edit(goal)` SHALL check `goal`
against this limit BEFORE the injected `LiveMcpTransport` is ever called. A goal at or under the limit
SHALL be forwarded to the transport unchanged. A goal over the limit SHALL be refused with a clear,
typed error citing the goal's actual length and the modelled cap, and the transport SHALL NOT be called
at all for that goal — no live call, no credit spent, no board mutation, and never a silently truncated
write.

#### Scenario: A goal at or under the limit is forwarded to the transport unchanged

- **GIVEN** a natural-language edit goal at or under `SPACES_EDIT_WRITE_LIMIT_CHARS`
- **WHEN** `LiveSpaceAdapter.edit(goal)` is called
- **THEN** the injected transport's `spacesEdit` is called once, with that exact goal text

#### Scenario: A goal over the limit is refused before any transport call

- **GIVEN** a natural-language edit goal one character over `SPACES_EDIT_WRITE_LIMIT_CHARS`
- **WHEN** `LiveSpaceAdapter.edit(goal)` is called
- **THEN** it rejects with a `WriteLimitExceededError` naming the goal's actual length and the limit
- **AND** the injected transport's `spacesEdit` is never called

#### Scenario: A ~17 KB single-shot goal (a whole carousel Spec) is refused, never silently truncated

- **GIVEN** a natural-language edit goal roughly 17,000 characters long
- **WHEN** `LiveSpaceAdapter.edit(goal)` is called
- **THEN** it rejects with `WriteLimitExceededError`
- **AND** the transport is never called — the goal is never sent partially or truncated

### Requirement: A fresh threadId is generated for every live edit, never reused

`LiveMcpTransport.spacesEdit` SHALL take an explicit `threadId` parameter. `LiveSpaceAdapter` SHALL
generate a fresh thread id for EVERY `edit()` call (default: `crypto.randomUUID()`; injectable for
deterministic tests) and SHALL NOT reuse a thread id across calls — a shared thread reused across many
edits was found, live, to truncate the JSON node after roughly 40 edits.

#### Scenario: Two consecutive edits receive two different thread ids

- **GIVEN** a `LiveSpaceAdapter` with its default thread-id generator
- **WHEN** `edit()` is called twice in succession
- **THEN** the transport's `spacesEdit` receives two DIFFERENT `threadId` values, each a real generated
  identifier (never empty, never a placeholder)

#### Scenario: An injected thread-id generator is threaded through verbatim, never reused

- **GIVEN** a `LiveSpaceAdapter` constructed with an injected thread-id generator producing a distinct
  value on each call
- **WHEN** `edit()` is called three times
- **THEN** the transport receives the three generated values, in order, none repeated

### Requirement: A ~17 KB News Carousel Spec reaches the canvas intact via chunked, within-limit writes

The system SHALL provide a way to get a News Carousel Production Spec (`{ slides: [...] }`, typically
15-30 KB in real production data) onto its target canvas node intact even though a single `spaces_edit`
write cannot carry it whole. A Spec whose single-shot inject goal already fits within
`SPACES_EDIT_WRITE_LIMIT_CHARS` SHALL be injected exactly as today (delegating to the existing
single-shot inject, unchanged). A Spec whose single-shot goal exceeds the limit SHALL be planned as an
ORDERED sequence of within-limit writes: one "skeleton" write establishing an empty, right-length
`slides` placeholder array, followed by one SURGICAL write per slide that replaces ONLY that slide's own
array element — leaving every other slide and field untouched — never an append and never a whole-node
replace carrying more than one slide's data. Planning SHALL fail clearly, before any edit is issued,
when the Spec cannot be chunked within the limit at all (no `slides` array to chunk by, or a single
slide's own surgical goal alone still exceeds the limit). Execution SHALL stop immediately on the first
edit that fails, never continuing to issue further edits past a failure.

#### Scenario: A Spec that already fits is injected in exactly one edit, unchanged

- **GIVEN** a News Carousel Spec whose single-shot inject goal is under the write limit
- **WHEN** the chunked-injection entry point is called
- **THEN** it issues exactly ONE edit, identical to today's single-shot `injectSpec`

#### Scenario: A ~17 KB Spec is chunked into one skeleton write plus one write per slide, all within limit

- **GIVEN** a realistic ~17 KB, 7-slide News Carousel Spec whose single-shot goal exceeds the write limit
- **WHEN** the chunked-injection entry point is called
- **THEN** it issues exactly 8 edits (1 skeleton + 1 per slide)
- **AND** every single issued edit's goal is at or under the write limit
- **AND** no single edit ever embeds the Spec's FULL data
- **AND** reassembling the per-slide edits' embedded JSON reproduces the ORIGINAL slides array exactly,
  in order — no slide's data is lost or corrupted across the sequence

#### Scenario: A single oversized slide fails planning before any edit is issued

- **GIVEN** a News Carousel Spec whose overall size exceeds the write limit AND whose surgical
  replace-goal for one specific slide, alone, ALSO exceeds the write limit
- **WHEN** the chunked-injection entry point is called
- **THEN** it fails, naming that specific slide and its size against the limit
- **AND** zero edits are ever issued

#### Scenario: A mid-sequence edit failure stops immediately, never issuing the remaining edits

- **GIVEN** a chunked injection plan of 8 edits, where the 3rd edit fails at the agent
- **WHEN** the chunked-injection entry point executes the plan
- **THEN** it reports the failure
- **AND** only the first 3 edits were ever issued — the remaining 5 are never attempted

### Requirement: A manual smoke script exercises the live-adapter write-limit boundary, never run by npm test

The system SHALL provide a manual, one-off smoke script (mirroring the shape of the existing
`media-host` live smoke script: not a `*.test.ts` file, imported by no other module, never matched by
the `npm test`/`npm run test:docs` globs) that runs standalone with zero live calls and proves the
write-limit refusal genuinely happens at the `LiveSpaceAdapter` boundary — a within-limit goal reaches
the transport with a real generated thread id; an oversized goal is refused by a transport that would
throw if ever called at all. The script SHALL also print the exact runbook for the portion that
genuinely requires a real, attended live session (a real edit + readback + thread-freshness
confirmation), since a spawned script process has no way to invoke the `magnific` MCP tools itself.

#### Scenario: The smoke script is excluded from both test suites

- **GIVEN** the full repository test suite (`npm test`) and the docs-conformance suite
  (`npm run test:docs`)
- **WHEN** either runs
- **THEN** neither matches or executes `src/space-driver/live/smoke.ts`

#### Scenario: The smoke script's standalone part proves the write-limit refusal with zero live calls

- **GIVEN** `src/space-driver/live/smoke.ts` run directly (`npx tsx` / `npm run space-driver-smoke`)
- **WHEN** it exercises a within-limit goal and an oversized goal against `LiveSpaceAdapter`
- **THEN** the within-limit goal reaches its (recording, non-live) transport with a real thread id
- **AND** the oversized goal is refused before its (poisoned) transport is ever invoked
- **AND** the script prints the manual runbook for the Operator's own attended-session verification
