## ADDED Requirements

### Requirement: The engineering documentation set describes the built attended, multi-format flow in present tense

The engineering documentation set SHALL describe capabilities that are actually built and green on
`main` in present tense — `CLAUDE.md`, the content-agent definitions (`.claude/agents/*.md`), and the
command definitions (`.claude/commands/*.md`) — never marked `Target (…)`, "not yet wired", "not built
yet", or "being migrated onto that model" once the capability is shipped. Conversely, a capability that
is genuinely NOT built (e.g. a
second wired Recipe beyond the one *Character Explainer with Cast* entry) SHALL NOT be described as if it
already exists. Concretely: `CLAUDE.md`'s pipeline steps SHALL document `/run-trends <brand> <format>`
(Format-scoped Runs, ADR-0013), Review picking Recipes (ADR-0009), the Production Queue keyed
`(brand, idea, recipe)`, the generic `/pick` command alongside its `/pick-cast` alias (ADR-0010), and
`/log-post <brand> <idea-id> <recipe> <post-url>` (Recipe-explicit attribution, ADR-0011) — none of these
behind a `Target`/`not built yet` marker.

#### Scenario: CLAUDE.md carries no future-tense scaffolding for shipped capabilities

- **GIVEN** `CLAUDE.md` as shipped in this repository
- **WHEN** it is searched for `Target (`, `not yet`, `not built`, `being migrated`, or `single-recipe`
- **THEN** no match describes the multi-format model, the per-Recipe Production Queue, or the per-Asset
  ledger grain as future/unbuilt — those capabilities are described as they run today

#### Scenario: CLAUDE.md documents the ADR-0011 split lifecycle, not the retired flat one

- **GIVEN** `CLAUDE.md`'s `## State` section
- **WHEN** it is read
- **THEN** it states the Idea's own lifecycle is `suggested / accepted / rejected`
- **AND** it states each chosen Recipe's Asset separately moves through
  `queued → in_production → produced → posted → tracking → scored`
- **AND** it does NOT claim the Idea itself carries a flat `casting`/`produced`/`posted` status (that
  status moved onto the Asset in ADR-0011)

#### Scenario: producer.md's queue-job schema description matches the live schema, not the retired one

- **GIVEN** `.claude/agents/producer.md`'s "Queue jobs follow the store schema" guardrail
- **WHEN** it is compared against `src/production-queue/queue.ts`'s exported `QueueJob`/`JobStatus` types
- **THEN** it names the CURRENT fields (`recipe`, `gate`, `status` including `awaiting_pick`, and the
  optional `pick`)
- **AND** it does NOT name the retired `phase: cast|render` field or the retired `awaiting_cast` status

#### Scenario: A doc never claims a second Recipe is wired

- **GIVEN** any of `CLAUDE.md`, `.claude/agents/producer.md`, `.claude/commands/run-pipeline.md`
- **WHEN** they describe the Recipe registry
- **THEN** they state exactly one Recipe is wired today (*Character Explainer with Cast*) and that the
  registry is multi-Recipe-ready — never implying a second Recipe already exists (that is issue #60,
  explicitly future work)

### Requirement: Docs-conformance tests pin the CURRENT reality, never a superseded honesty disclaimer

The `*.docs-test.ts` suite (`npm run test:docs`) SHALL assert claims that are true of the code as it
stands on `main` today. A subtest SHALL NOT require a doc to carry a "not yet wired"/"not yet
operational"/audit-finding-citation disclaimer once the described capability is actually wired and
tested — doing so would force the doc to say something false to keep the test green. Where a prior
disclaimer is retired, the replacement assertion SHALL still pin a real, checkable claim (not merely
assert the disclaimer's absence with nothing to replace it) wherever a meaningful positive claim is
available.

#### Scenario: report.docs-test.ts asserts pick-cast.md's attended-runtime claim, not the retired disclaimer

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc states the render runs in the Operator's session, that there is no
  unattended background worker, and that it cites ADR-0008
- **AND** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT
- **AND** the suite still asserts the doc promises the command records the Character correctly (the
  positive claim carried over unchanged)

#### Scenario: run-pipeline.docs-test.ts asserts the attended runtime and per-Recipe gates, not "not built yet"

- **GIVEN** `.claude/commands/run-pipeline.md` as shipped
- **WHEN** `src/commands/run-pipeline.docs-test.ts` reads it
- **THEN** the suite asserts the doc names the attended runtime, cites ADR-0008, and states production
  runs "in your session"
- **AND** the suite asserts the doc describes gates as per-Recipe (ADR-0009) without calling the
  multi-format model unbuilt (no "being migrated"/"single-recipe build" wording)

#### Scenario: producer-agent.docs-test.ts asserts the live queue schema instead of the retired "not yet wired" claim

- **GIVEN** `.claude/agents/producer.md` as shipped
- **WHEN** `src/production-spec/producer-agent.docs-test.ts` reads it
- **THEN** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT, that the doc cites
  ADR-0008, and that it states it runs attended in the Operator's own session
- **AND** the suite asserts the doc's queue-job schema description names the CURRENT `recipe` field and
  `awaiting_pick` status, and does NOT name the retired `awaiting_cast` status — a real, checkable pin
  against production code that replaces the retired assertion, not a rubber stamp

### Requirement: The repository retains no dead ADR-0004 unattended-background-worker code

ADR-0008 superseded ADR-0004's unattended, background Production Queue worker; that code SHALL NOT be
present or referenced. `src/production-queue/scheduler.ts` is NOT part of that dead code — it is the
LIVE decision logic the generic gate-resume flow (`/pick`, `/pick-cast`) drives (issue #57) — and SHALL
be retained.

#### Scenario: worker.ts is absent and unreferenced

- **GIVEN** the repository as shipped
- **WHEN** it is searched for `src/production-queue/worker.ts` and any import of it
- **THEN** no such file and no such import exists

#### Scenario: scheduler.ts is retained because it is live, not dead

- **GIVEN** the repository as shipped
- **WHEN** `src/commands/pick.ts` is inspected
- **THEN** it imports `markPickConsumed` from `src/production-queue/scheduler.ts`
- **AND** `scheduler.ts` and its test file are present (not deleted)
