## MODIFIED Requirements

### Requirement: Every business-rule refusal is a returned, clearly-worded result — never a throw

`buildMcpSchedulePlan` SHALL return `{ ok: false, reason, message }` — never throw — for each of these
business-rule refusals: an empty (or, after excluding non-`news-carousel` entries, effectively empty)
run of eligible Assets (`reason: "empty-run"`); a Brand with no usable Zoho configuration, i.e. a
`ZohoConfigLookup` with `configured: false` for either its `"not_configured"` or `"malformed"` reason
(`reason: "zoho-not-configured"`, carrying that lookup's own `message` verbatim); any derived schedule
slot landing inside the 1-hour lead window (`reason: "lead-window"`, naming every violating Asset, never
just the first); and, since issue #198 (QA Round 1 Defect #1), any derived schedule slot whose signed
media link cannot survive to reach its own post time, beyond AWS's own ~7-day presign ceiling
(`reason: "presign-window"`, via `src/schedule-batch/media-expiry.ts`'s `validateWithinPresignWindow`,
naming every violating Asset, never just the first — mirroring `"lead-window"`'s own refusal shape
exactly). No file is written and no plan is returned for any of these four cases.

#### Scenario: An empty run of eligible Assets is refused clearly, never thrown

- **GIVEN** an empty `eligible` list
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "empty-run" }` with a clear message
- **AND** no exception is thrown

#### Scenario: A Brand with no Zoho configuration is refused clearly, carrying that lookup's message

- **GIVEN** one eligible Asset and a `ZohoConfigLookup` with `configured: false`
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "zoho-not-configured" }` whose `message` equals the
  lookup's own `message`
- **AND** no exception is thrown

#### Scenario: A slot inside the 1-hour lead window is refused, naming the violation

- **GIVEN** one eligible Asset, a configured Brand, and a start date/`nowMs` pair whose derived slot is
  less than 1 hour after `nowMs`
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "lead-window" }` whose message names that Asset's Idea id
- **AND** no exception is thrown

#### Scenario: A slot beyond AWS's presign ceiling is refused, naming the violation (issue #198)

- **GIVEN** one eligible Asset, a configured Brand, and a start date/`nowMs` pair whose derived slot's
  signed media link cannot reach that slot's own scheduled time (beyond AWS's ~7-day presign ceiling
  from `nowMs`)
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: false, reason: "presign-window" }` whose message names that Asset's Idea
  id and the ~7-day ceiling
- **AND** no exception is thrown

#### Scenario: A slot exactly AT AWS's presign ceiling is NOT refused (boundary is inclusive)

- **GIVEN** one eligible Asset, a configured Brand, and a start date/`nowMs` pair whose derived slot's
  signed media link reaches EXACTLY its own scheduled time (exactly AWS's ~7-day presign ceiling from
  `nowMs`, no further)
- **WHEN** `buildMcpSchedulePlan` is called
- **THEN** the result is `{ ok: true }` — a schedule that is merely `cappedByAwsLimit` but still reaches
  its own post time is not a violation
