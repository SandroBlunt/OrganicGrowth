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
