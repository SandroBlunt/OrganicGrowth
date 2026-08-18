## ADDED Requirements

### Requirement: Readiness probes every configured Apify actor slug for existence, reporting unreachable rather than failing hard

`runReadiness` (`src/commands/run-pipeline-readiness.ts`) SHALL, at every readiness pass, collect every DISTINCT non-placeholder Apify actor slug configured across `apify.<platform>.<trends_actor|post_actor>` in the Brand's already-parsed `seeds.yaml` (via the existing pure `resolveApifyActor`), and probe each ONCE — a slug shared by two purposes (e.g. YouTube's single actor for both `trends_actor` and `post_actor`) SHALL be probed exactly once, not twice — via a new port method, `ApifyReadinessPort.probeActorExists(actorSlug): Promise<"ok" | "not_found" | "unreachable">`. The live adapter for this port SHALL be deferred at runtime (mirroring `probeToken`/`probeSpace`'s own deferred-adapter convention) — tests ALWAYS inject a fake. A `"not_found"` or `"unreachable"` result SHALL produce a Finding with `severity: "advisory"` and `phase: "research"` — NEVER `severity: "block"`, on any phase, for either outcome — naming the exact slug and which platform/purpose combination(s) it is configured for. The Finding's `code` SHALL be unique per slug (`apify_actor_not_found:<slug>` / `apify_actor_unreachable:<slug>`) so two different bad slugs are never collapsed into one Finding by `runReadiness`'s existing seen-by-code deduplication. A probe that throws SHALL be caught and treated as `"unreachable"`, never crashing `runReadiness`. A Brand with no `apify` block configured at all SHALL never invoke `probeActorExists`.

#### Scenario: A confirmed-dead actor slug produces a non-blocking research advisory naming the slug and its usage

- **GIVEN** a Brand's `seeds.yaml` with `apify.facebook.post_actor: "apify/facebook-post-scraper"` (the
  real dead slug the #253 investigation found, confirmed via curl: 404)
- **AND** an injected `ApifyReadinessPort` whose `probeActorExists` returns `"not_found"` for that slug
- **WHEN** `runReadiness` is called
- **THEN** the returned findings include one with `severity: "advisory"`, `phase: "research"`, and
  `code: "apify_actor_not_found:apify/facebook-post-scraper"`
- **AND** its `message` names the slug and `facebook.post_actor`
- **AND** no finding in the result has `severity: "block"`

#### Scenario: An actor-existence probe that cannot complete is reported as unreachable, distinct from not-found, and never blocks

- **GIVEN** a Brand's `seeds.yaml` with one configured, non-placeholder Apify actor slug
- **AND** an injected `ApifyReadinessPort` whose `probeActorExists` throws (simulating a network blip)
- **WHEN** `runReadiness` is called
- **THEN** the returned findings include one with `severity: "advisory"`, `phase: "research"`, and a
  `code` starting with `"apify_actor_unreachable:"`
- **AND** no finding has a `code` starting with `"apify_actor_not_found:"`
- **AND** no finding in the result has `severity: "block"`

#### Scenario: A confirmed-existing actor slug produces no actor-existence finding

- **GIVEN** a Brand's `seeds.yaml` with a configured, non-placeholder Apify actor slug
- **AND** an injected `ApifyReadinessPort` whose `probeActorExists` returns `"ok"` for that slug
- **WHEN** `runReadiness` is called
- **THEN** the returned findings include no `code` starting with `"apify_actor_"` for that slug

#### Scenario: A Brand with no configured apify block is never probed

- **GIVEN** a Brand's `seeds.yaml` with no `apify` block at all
- **WHEN** `runReadiness` is called
- **THEN** the injected `ApifyReadinessPort`'s `probeActorExists` is never invoked
- **AND** the returned findings include no `code` starting with `"apify_actor_"`

#### Scenario: One actor slug configured for two purposes is probed exactly once

- **GIVEN** a Brand's `seeds.yaml` with the SAME actor slug configured as both `apify.youtube.trends_actor`
  and `apify.youtube.post_actor`
- **WHEN** `runReadiness` is called
- **THEN** the injected `ApifyReadinessPort`'s `probeActorExists` is invoked exactly once for that slug
- **AND** if that probe returns `"not_found"`, the resulting Finding's `message` names both
  `youtube.trends_actor` and `youtube.post_actor`

### Requirement: The conductor prints an actor-existence advisory to the Operator even when it is the only finding present

`runPipelineCommand` (`src/commands/run-pipeline.ts`) SHALL print every actor-existence Finding produced by `probeConfiguredActors` (a `code` starting with `apify_actor_not_found:` or `apify_actor_unreachable:`, identified by `run-pipeline-readiness.ts`'s `isActorExistenceFinding`) regardless of whether a `block`-severity Finding also exists that run — a narrow, named carve-out from the base "Readiness runs every launch, is silent when healthy, and surfaces gaps with phase-scoped blocking" Requirement's general default, applying only to this one finding class, because a computed-but-never-printed advisory is indistinguishable from no advisory at all, which is the exact "and nothing notices" failure issue #253 exists to close. Printing this advisory SHALL NEVER stop or block any phase — the run proceeds exactly as it would if no finding existed at all.

#### Scenario: A dead actor slug's advisory reaches the Operator even when it is the ONLY finding that run

- **GIVEN** a Brand whose config is otherwise entirely healthy (valid Apify token, accessible Space,
  sufficient credits, a clean `checkConfig` result) except that one configured Apify actor slug is
  reported `"not_found"` by `probeActorExists`
- **WHEN** `runPipelineCommand` runs
- **THEN** the printed output contains a `[WARN]` line naming the dead slug
- **AND** the conductor is NOT stopped by it — it proceeds past readiness to the `/rename` hint and Gate 1

#### Scenario: An unreachable actor-existence probe's advisory also reaches the Operator when it is the only finding

- **GIVEN** a Brand whose config is otherwise entirely healthy except that `probeActorExists` throws for
  one configured slug
- **WHEN** `runPipelineCommand` runs
- **THEN** the printed output contains a `[WARN]` line
- **AND** the conductor is NOT stopped by it — it proceeds past readiness to the `/rename` hint

#### Scenario: A co-occurring block finding still surfaces the actor advisory alongside it

- **GIVEN** a Brand whose Apify token is invalid (forcing an unrelated research block) AND one configured
  Apify actor slug is reported `"not_found"`
- **WHEN** `runPipelineCommand` runs
- **THEN** the printed output contains both a `[BLOCK]` line for the invalid token and a `[WARN]` line
  naming the dead slug
