## Why

`apify/facebook-post-scraper` — singular `post` — does not exist and never has. Verified live via curl:
`https://api.apify.com/v2/acts/apify~facebook-post-scraper` → 404; `apify~facebook-posts-scraper`
(plural) → 200. Every other actor slug in the repo resolves. The dead slug was baked into
`data/brands/mundotip/seeds.yaml`, `templates/brand-skeleton/seeds.yaml`, `src/brand/scaffolder.ts`
(so every NEW Brand is scaffolded with it too), `src/apify/live/smoke.ts`, and
`.claude/agents/performance-tracker.md`'s runbook — and a green test (`scaffolder.test.ts`) **asserted**
it, defending a 404 as if it were correct.

This is the same class of bug the epic #195 session hit four times over (#212's manifest checker
verifying a field was *a boolean* rather than *true*; #210's server binding every interface while every
test hardcoded loopback): **a check was green, and blind to the thing it was supposed to be checking.**
Two structural gaps let the dead slug survive undetected:

1. `src/apify/live/smoke.ts` — the ONE script whose entire purpose is verifying the live Facebook
   mapping — hardcoded its actor slug as a string literal instead of reading the Brand's configured
   one. It never actually exercised the configured actor at all.
2. Nothing in the suite, and nothing in the readiness check, ever confirmed that a configured actor
   slug resolves to a real Apify actor. `resolveApifyActor` correctly refuses to fabricate a slug for
   an unconfigured platform, but a WRONG, confidently-configured slug sails straight through — that is
   precisely the shape of bug this ticket exists to close.

## What Changes

- **Every live occurrence of the dead slug is corrected** to `apify/facebook-posts-scraper` (plural —
  the one real actor, which already handles both an account's recent posts (`trends_actor`) and one
  post by URL (`post_actor`), the same way `streamers/youtube-scraper` already does for YouTube):
  `data/brands/mundotip/seeds.yaml`, `data/brands/straw-motion/seeds.yaml` (committing the Operator's
  own uncommitted working-tree fix from the #195 session properly), `templates/brand-skeleton/seeds.yaml`,
  `src/brand/scaffolder.ts`, `.claude/agents/performance-tracker.md`. Every test/fixture/doc-comment that
  taught the dead slug is corrected too (`scaffolder.test.ts`'s assertion, `check-config.test.ts`,
  `track-performance.test.ts`, `platform.test.ts`, `request.test.ts`, `client.test.ts`,
  `normalize-metrics.test.ts`, `normalize-metrics.ts`'s three doc comments,
  `src/apify/fixtures/README.md`), and the two live spec files that documented it as a worked example
  (`openspec/specs/apify-live-client/spec.md`, `openspec/specs/apify-platform-integration/spec.md`) —
  corrected directly (a factual/typo-level correction, not a behavior change, so no MODIFIED-header
  delta is written against either Scenario in THIS change; see "Spec delta scope," below).
- **`src/apify/live/smoke.ts` now resolves its actor slug from the given Brand's own `seeds.yaml`**
  (`loadConfiguredActorSlug`, new module `src/apify/actor-config.ts`, built on the existing pure
  `resolveApifyActor`) instead of a hardcoded literal. Its CLI usage becomes `npx tsx
  src/apify/live/smoke.ts <brand> <facebook-post-url>` — Brand is now a required, explicit argument
  (never a silent default — data-handling rule 2, the same "always explicit" convention
  `trackPerformanceCommand` already follows).
- **The smoke script now distinguishes "the actor/request itself was rejected" from "the actor ran fine
  but found nothing."** Before this slice, `LiveApifyClient.scrapePost` throwing an `ApifyRequestError`
  (e.g. a 404 for a dead/wrong actor slug) fell all the way through to the script's generic top-level
  catch, while the ONLY case the script special-cased — `raw === null` — was mislabeled as "the post
  might not be public." A dead actor slug and a genuinely empty result were, in practice,
  indistinguishable to whoever read the output. A new pure, tested module,
  `src/apify/live/smoke-diagnose.ts`'s `describeActorRequestFailure`, classifies a caught error: an
  `ApifyRequestError` produces a message that names the actor slug, the HTTP status, and a
  verification `curl` command, and says explicitly this is NOT a "no data" result; anything else falls
  through to the script's existing generic handling unchanged.
- **The readiness check now probes every configured Apify actor slug for existence** — the "decide and
  record" acceptance criterion; see "Decision: where actor-existence verification lives," below.
  `ApifyReadinessPort` (`src/commands/run-pipeline-ports.ts`) gains `probeActorExists(actorSlug):
  Promise<"ok" | "not_found" | "unreachable">`, mirroring the port-injection pattern `probeToken` and
  `probeSpace` already use (hermetic — a fake in every test, a deferred live adapter at runtime).
  `runReadiness` (`src/commands/run-pipeline-readiness.ts`) gains `probeConfiguredActors`: it collects
  every DISTINCT, non-placeholder actor slug configured across `apify.<platform>.<trends_actor|
  post_actor>`, probes each once (a slug shared by two purposes, like YouTube's, is probed once, not
  twice), and turns a `"not_found"` or `"unreachable"` result into a `severity: "advisory"`,
  `phase: "research"` Finding naming the exact slug and where it is configured — **never a `"block"`
  finding, on any phase, for either outcome.**

## Decision: where actor-existence verification lives, and why it never blocks

**Where:** the readiness check (`runReadiness`'s `probeConfiguredActors`), not a unit test and not the
smoke script. A unit test cannot reach the network at all (hermetic build — this repo's own constraint),
so "verified by a passing test" was never on the table for the existence check itself, only for the
mechanics around it (the fake-port plumbing, the merge/dedup, the finding shape — all of which ARE
tested, extensively, in this change). The smoke script was considered and rejected as the primary home:
it is a manual, one-off, Operator-run script that spends a real credit and is never run automatically —
an actor could stay dead for months again with nobody noticing, which is the exact failure this ticket
exists to close. The readiness check, by contrast, already runs at EVERY `/run-pipeline` launch
(`docs/adr` / `run-pipeline-conductor`'s own "Readiness runs every launch, is silent when healthy"
Requirement) — wiring the actor probe in here means a dead slug surfaces on the very next pipeline run,
not only when someone happens to run the smoke script by hand.

**Severity — argued, not assumed, per the issue's own instruction:** BOTH a confirmed-dead slug
(`"not_found"`) and a probe that could not complete (`"unreachable"`) are reported as `advisory`,
NEVER `block`, on any phase. Three reasons:
1. **A dead actor slug degrades gracefully today, per-platform.** `resolveApifyActor` already returns
   `null` for a genuinely unconfigured platform and every real caller already handles that cleanly —
   `trackPerformanceCommand` reports "SKIPPED — not trackable" per Asset; `trend-scout`'s own docs
   require skipping a not-yet-wired platform rather than fabricating data. A WRONG-but-present slug
   fails the same way once probed (the scrape throws/returns nothing, the caller already handles
   failure without crashing or fabricating). Nothing catastrophic happens downstream from a bad slug
   TODAY — the actual damage is silence, which this advisory closes, not a crash this needs to prevent.
2. **Blocking research over ONE bad platform's actor would stop USEFUL work.** A Brand with a dead
   Facebook `post_actor` but healthy Instagram/YouTube actors should not have its entire Trend Research
   phase blocked — that is disproportionate to a single mistyped config value, and directly
   contradicts the existing phase-scoped gating philosophy (`classify.ts`'s own docstring: "a finding
   blocks ONLY the phase it is tagged with").
3. **A network blip to Apify's OWN actor-lookup endpoint must never gate the pipeline** — this is the
   issue's own explicit instruction ("reporting unreachable rather than failing hard, so a network blip
   never blocks a run"). `probeToken`'s existing `.catch(() => false)` already accepts turning an
   Apify-side hiccup into a hard `block` on research for the TOKEN probe — but a token failure is
   binary and total (nothing works without it); an actor-existence probe is per-slug and partial (most
   of the pipeline still works fine even with one bad slug), so the SAME blunt "unreachable = block"
   policy is not appropriate here. Distinguishing `"not_found"` from `"unreachable"` in the type itself
   (rather than collapsing both to `false`) is what makes the advisory MESSAGE honest either way: "this
   slug is confirmed dead, fix it" reads differently from "could not check right now, try again."

An advisory that names the exact dead slug and where it is configured — surfacing on every launch,
never gating anything — is the actionable, non-destructive design this ticket asks for.

## Spec delta scope

Three ADDED Requirements (no MODIFIED headers — this change deliberately never touches an existing
Requirement's wording, avoiding the `openspec archive` MODIFIED-header trap this repo has hit before):

- `run-pipeline-conductor`: the new `probeConfiguredActors` behavior (port shape, phase-scoped
  advisory-only severity, per-slug distinct codes, the shared-slug-probed-once behavior).
- `apify-platform-integration`: `loadConfiguredActorSlug` — the new I/O wrapper that reads one Brand's
  own `seeds.yaml` and resolves one actor slug via the existing pure `resolveApifyActor`.
- `apify-live-client`: `describeActorRequestFailure` — the smoke script's actor-not-found-vs-no-data
  distinction.

The two DIRECT corrections to `openspec/specs/apify-live-client/spec.md` and
`openspec/specs/apify-platform-integration/spec.md` (the dead slug in a worked-example Scenario/
Requirement body) are plain repo-file edits, not spec-delta material — they fix a pre-existing factual
error in a worked example, not a behavior this change introduces or modifies, so writing a MODIFIED
delta for them would be describing a change that never actually happened to the underlying behavior.

## Known gaps, decided, not dropped

- **The live Apify adapter for `probeActorExists` is deferred**, exactly like `probeToken`'s and
  `probeSpace`'s live adapters already are (`run-pipeline.ts`'s `DEFAULT_APIFY_PORT`/
  `DEFAULT_MAGNIFIC_PORT` — both explicit "runtime placeholder... deferred" comments predating this
  change). The default resolves to `"unreachable"` (honestly "never checked," not a fabricated `"ok"`)
  — never blocks either way, so this has no gating consequence, unlike `probeToken`'s permissive
  `true` default which DOES gate research if flipped.
- **`linkedin` stays the `"..."` not-yet-wired placeholder** and is never probed (`resolveApifyActor`
  already returns `null` for it before `probeConfiguredActors` ever sees it) — out of scope, unrelated
  to this ticket.
- **Actor input/output SCHEMA drift stays explicitly out of scope**, per the issue's own instruction —
  `src/apify/normalize-metrics.ts`'s defensive field mapping is untouched.

## Capabilities

### Modified Capabilities

None — every capability change below is additive (see "Spec delta scope").

### Added Requirements (per capability)

- `run-pipeline-conductor`: readiness probes every configured Apify actor slug for existence.
- `apify-platform-integration`: a Brand's configured Apify actor slug is loaded straight from its own
  `seeds.yaml`.
- `apify-live-client`: the smoke script distinguishes an actor/request failure from a routine "no
  data" result.

## Impact

- **Modified code:** `data/brands/mundotip/seeds.yaml`, `data/brands/straw-motion/seeds.yaml`,
  `templates/brand-skeleton/seeds.yaml`, `src/brand/scaffolder.ts`, `.claude/agents/
  performance-tracker.md`, `src/apify/live/smoke.ts`, `src/apify/normalize-metrics.ts`,
  `src/apify/live/request.ts`, `src/apify/fixtures/README.md`, `src/commands/run-pipeline-ports.ts`,
  `src/commands/run-pipeline-readiness.ts`, `src/commands/run-pipeline.ts`, `src/fs-boundary/
  allow-list.ts`, `openspec/specs/apify-live-client/spec.md`, `openspec/specs/
  apify-platform-integration/spec.md`, plus every test file listed under "What Changes."
- **New:** `src/apify/actor-config.ts` (+ test), `src/apify/live/smoke-diagnose.ts` (+ test),
  `openspec/changes/issue-253-facebook-actor-slug/` (this change).
- **Untouched:** `src/apify/normalize-metrics.ts`'s field-mapping logic (only its doc comments moved),
  `src/readiness/check-config.ts`/`src/readiness/classify.ts` (stay PURE, no I/O added to either — the
  new probe lives in the I/O shell, `run-pipeline-readiness.ts`), every other Recipe/Space/production
  code path.
- **Hermetic, no live Space/Apify calls.** Every new test injects a fake `ApifyReadinessPort` or a fake
  `fetchImpl`; `src/apify/live/smoke.ts` and `src/apify/live/smoke-diagnose.ts`'s own `.test.ts` never
  exercise the real `LiveApifyClient` against the network — see this change's `handoff.md` for the
  explicit fake/fixture list and the mutation-tested proof that the new checks actually fail on a
  known-dead slug.
- **Always-rules upheld:** no content generation, publication, or metrics fabrication. Rule 8
  ("never fabricate") is the throughline of this whole change — `resolveApifyActor`'s existing
  never-fabricate contract is exactly why a WRONG-but-present slug needed a NEW check (a missing slug
  was already safe; a wrong one was not).
