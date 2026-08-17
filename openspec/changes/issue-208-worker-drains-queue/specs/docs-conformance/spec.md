## MODIFIED Requirements

### Requirement: Docs-conformance tests pin the CURRENT reality, never a superseded honesty disclaimer

The `*.docs-test.ts` suite (`npm run test:docs`) SHALL assert claims that are true of the code as it
stands on `main` today. A subtest SHALL NOT require a doc to carry a "not yet wired"/"not yet
operational"/audit-finding-citation disclaimer once the described capability is actually wired and
tested — doing so would force the doc to say something false to keep the test green. Where a prior
disclaimer is retired, the replacement assertion SHALL still pin a real, checkable claim (not merely
assert the disclaimer's absence with nothing to replace it) wherever a meaningful positive claim is
available.

#### Scenario: report.docs-test.ts asserts pick-cast.md names both production paths, not the retired single-path claim

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc states the attended path's render runs in the Operator's session,
  cites ADR-0008, cites ADR-0030, and names the unattended worker path
- **AND** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT
- **AND** the suite asserts the OLD, now-false, unqualified "no unattended background worker" claim is
  ABSENT (`docs/adr/0030` partially supersedes that decision — issue #208)
- **AND** the suite still asserts the doc promises the command records the Character correctly (the
  positive claim carried over unchanged)

#### Scenario: run-pipeline.docs-test.ts asserts both production paths and per-Recipe gates, not "not built yet"

- **GIVEN** `.claude/commands/run-pipeline.md` as shipped
- **WHEN** `src/commands/run-pipeline.docs-test.ts` reads it
- **THEN** the suite asserts the doc names BOTH the attended and the unattended production runtime,
  cites ADR-0008 and ADR-0030, states the attended path runs "in your session", states the unattended
  worker runs "with no human present", and names the worker module (`run-worker`)
- **AND** the suite asserts the doc describes gates as per-Recipe (ADR-0009) without calling the
  multi-format model unbuilt (no "being migrated"/"single-recipe build" wording)
- **AND** the suite asserts the OLD, now-false, unqualified "no headless worker host" claim is ABSENT
  (`docs/adr/0030` partially supersedes that decision — issue #208)

#### Scenario: producer-agent.docs-test.ts asserts the live queue schema and both production paths, instead of the retired "not yet wired" claim

- **GIVEN** `.claude/agents/producer.md` as shipped
- **WHEN** `src/production-spec/producer-agent.docs-test.ts` reads it
- **THEN** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT, that the doc cites
  ADR-0008 and ADR-0030, and that it states it runs attended in the Operator's own session
- **AND** the suite asserts the doc's queue-job schema description names the CURRENT `recipe` field and
  `awaiting_pick` status, and does NOT name the retired `awaiting_cast` status — a real, checkable pin
  against production code that replaces the retired assertion, not a rubber stamp

#### Scenario: report.docs-test.ts pins pick-cast.md's Asset-grain status vocabulary (QA-1 regression guard)

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc names the Asset's `in_production` status and `pending_gate` field
- **AND** the suite asserts the doc does NOT claim the Idea's own status chain runs `casting → produced`
- **AND** the suite asserts the doc does NOT claim "a `casting` Idea is paused" at the Cast gate
- **AND** these two negative guards are verified (not merely asserted) to fail against the exact
  pre-fix doc text that caused QA Round-1's defect QA-1, so the guard is a genuine regression test, not
  a rubber stamp

#### Scenario: report.docs-test.ts asserts CLAUDE.md names both production paths, not the retired single-path claim

- **GIVEN** `CLAUDE.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc cites ADR-0008 and ADR-0030, names the unattended path, and states
  the unattended worker runs "with no human present"
- **AND** the suite asserts the OLD, now-false, unqualified "no headless worker host" claim is ABSENT

#### Scenario: report.docs-test.ts asserts README.md names both production paths, not the retired single-path claim

- **GIVEN** `README.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc cites ADR-0008 and ADR-0030, and names the unattended path
- **AND** the suite asserts the OLD, now-false, unqualified "there is no unattended background worker"
  claim is ABSENT
