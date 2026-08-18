# Slice Handoff — issue #253: The Facebook post actor slug is dead, and nothing notices

This is the one bidirectional Slice Handoff document for this change. The `developer` Build Report is
below; `qa` appends its Verdict beneath it. Nothing here is ever overwritten — a retry appends a new
`Round-N Build` block.

---

## Build Report (Round 1)

### What changed

`apify/facebook-post-scraper` (singular `post`) was a dead Apify actor slug — verified via the issue's
own curl evidence (404), against the real `apify/facebook-posts-scraper` (plural, 200) — baked into a
Brand's config, the new-Brand template, the scaffolder, the live smoke script, an agent's runbook, a
live OpenSpec spec Scenario, and a test that **asserted** it. This slice:

1. **Corrected every live occurrence** of the dead slug to the real, plural one, across config files,
   the scaffolder, the agent runbook, every test/fixture/doc-comment that taught it, and the two live
   OpenSpec spec files that documented it as a worked example.
2. **Closed the systemic gap**: `src/apify/live/smoke.ts` — the one script whose entire purpose is
   verifying the live Facebook mapping — now reads the Brand's own configured actor slug from its
   `seeds.yaml` (new module `src/apify/actor-config.ts`) instead of a hardcoded literal, and now
   distinguishes "the actor/request itself was rejected" (new module
   `src/apify/live/smoke-diagnose.ts`) from "the actor ran fine but found nothing" — a dead slug can
   never again read as an empty post.
3. **Made a configured actor slug's existence checkable at all**: the readiness check
   (`runReadiness`/`ApifyReadinessPort`, `src/commands/run-pipeline-{readiness,ports}.ts`) now probes
   every distinct configured Apify actor slug and surfaces a non-blocking `advisory` finding — never a
   `block`, on any phase — when a slug is confirmed dead or the probe itself is unreachable. The
   decision of *where* this check lives, and *why* it never blocks, is argued in `proposal.md`'s
   "Decision" section (not assumed — per the issue's own instruction).

### Files touched

**Corrected (dead-slug occurrences):**
- `data/brands/mundotip/seeds.yaml`, `data/brands/straw-motion/seeds.yaml`,
  `templates/brand-skeleton/seeds.yaml`
- `src/brand/scaffolder.ts`, `src/brand/scaffolder.test.ts` (the actual bug — a green test asserting a
  404)
- `.claude/agents/performance-tracker.md`
- `src/readiness/check-config.test.ts`, `src/commands/track-performance.test.ts`,
  `src/apify/platform.test.ts`, `src/apify/live/request.test.ts`, `src/apify/live/client.test.ts`,
  `src/apify/normalize-metrics.test.ts`
- `src/apify/normalize-metrics.ts`, `src/apify/live/request.ts`, `src/apify/fixtures/README.md`
  (doc-comment-only, rewritten to say ONE real actor serves both purposes)
- `openspec/specs/apify-live-client/spec.md`, `openspec/specs/apify-platform-integration/spec.md`
  (direct correction — see proposal.md's "Spec delta scope" for why this is not a MODIFIED delta)

**New (systemic fix):**
- `src/apify/actor-config.ts` + `src/apify/actor-config.test.ts` — `loadConfiguredActorSlug`
- `src/apify/live/smoke-diagnose.ts` + `src/apify/live/smoke-diagnose.test.ts` —
  `describeActorRequestFailure`
- `src/apify/live/smoke.ts` — rewritten: `<brand> <facebook-post-url>` (Brand now required, explicit),
  resolves the actor via `loadConfiguredActorSlug`, distinguishes the failure mode

**New (readiness actor-existence probe):**
- `src/commands/run-pipeline-ports.ts` — `ApifyReadinessPort.probeActorExists` + `ActorProbeResult`
- `src/commands/run-pipeline-readiness.ts` — `probeConfiguredActors`, wired into `runReadiness`
- `src/commands/run-pipeline.ts` — `DEFAULT_APIFY_PORT.probeActorExists` (deferred, `"unreachable"`)
- `src/commands/run-pipeline.test.ts` — fake port updated + 5 new tests
- `src/commands/run-pipeline-onboarding.test.ts` — fake port updated

**Guard housekeeping:**
- `src/fs-boundary/allow-list.ts` — `src/apify/actor-config.ts` added (it reads `seeds.yaml` directly,
  same category as `run-pipeline-readiness.ts`/`track-performance.ts`)

**OpenSpec (this change):**
- `openspec/changes/issue-253-facebook-actor-slug/{proposal.md,tasks.md,handoff.md}`
- `openspec/changes/issue-253-facebook-actor-slug/specs/{run-pipeline-conductor,
  apify-platform-integration,apify-live-client}/spec.md` (ADDED Requirements only)

### How to run

```bash
npm test                                                   # full suite (type-checks first)
npm run test:docs                                          # docs-conformance suite
npm run build                                               # tsc -p tsconfig.build.json
openspec validate issue-253-facebook-actor-slug --strict     # this change
openspec validate --all --strict                             # every spec + change

# Individual files touched most directly by this slice:
node --import tsx --test src/apify/actor-config.test.ts
node --import tsx --test src/apify/live/smoke-diagnose.test.ts
node --import tsx --test src/commands/run-pipeline.test.ts
node --import tsx --test src/fs-boundary/node-fs-guard.test.ts
```

Results at handoff time: `npm test` → **3677 tests / 956 suites / 0 fail** (baseline on `cdb68a0` was
3662/953/0 — +15 tests, +3 suites, exactly the three new test files/blocks). `npm run test:docs` →
351/94/0. `npm run build` clean. Both `openspec validate` commands green.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #253) | Proof |
|---|---|---|
| 1 | Correct every live occurrence of the dead slug (mundotip/straw-motion/template seeds.yaml, scaffolder.ts, smoke.ts, performance-tracker.md) | `git diff` on each listed file; `src/brand/scaffolder.test.ts`'s corrected assertion (`post_actor === "apify/facebook-posts-scraper"`) proves the scaffolder path; `grep -rn "facebook-post-scraper"` repo-wide (excluding `node_modules`/`openspec/changes/archive/`) returns only deliberate, explanatory mentions of the dead slug (see below) |
| 2 | Update tests/fixtures/doc comments + the apify-live-client spec Scenario | Every test file listed under "Files touched" above is green; `openspec/specs/apify-live-client/spec.md`'s Scenario now reads the plural slug, confirmed by `openspec validate --all --strict` passing |
| 3 | smoke.ts reads its actor from the Brand's own seeds.yaml via resolveApifyActor | `src/apify/actor-config.test.ts` (6 tests, all green) proves `loadConfiguredActorSlug` — the function `smoke.ts` now calls — resolves a configured slug and defensively returns `null` for every broken-input case, built directly on `resolveApifyActor` |
| 4 | Distinguish "actor not found" from "no data" in the smoke script's output | `src/apify/live/smoke-diagnose.test.ts` (4 tests, all green) proves `describeActorRequestFailure` produces a message naming the actor slug/status for an `ApifyRequestError` and explicitly asserts that message never reads like a "no data" result; `smoke.ts`'s catch block now calls it before falling through to the old undifferentiated path |
| 5 | Decide + record whether actor-slug existence is verified, and where | `proposal.md`'s "Decision: where actor-existence verification lives, and why it never blocks" section argues (not assumes) the readiness check, and argues the never-block severity policy with three concrete reasons; recorded formally as a Requirement in `openspec/changes/issue-253-facebook-actor-slug/specs/run-pipeline-conductor/spec.md` |
| 6 | Prove the check fails (point at a slug known to 404, watch it go red, restore) | See "Prove the check fails" transcript below — TWO independent red→green cycles, both against the REAL dead slug from the issue's own evidence |

**Deliberate remaining mentions of `facebook-post-scraper` (not bugs):** `.claude/agents/
performance-tracker.md`, `src/brand/scaffolder.ts`, `src/apify/actor-config.ts`, and
`src/commands/run-pipeline-ports.ts` each carry one explanatory doc-comment naming the dead slug as a
historical fact (why the check/module exists); `src/apify/live/smoke-diagnose.test.ts` and
`src/commands/run-pipeline.test.ts` use it as the REAL known-404 slug in their own test
fixtures/assertions (deliberately, to ground the proof in real evidence rather than a hypothetical
slug); `src/performance/store.test.ts` has an unrelated, pre-existing opaque test-fixture label
(`"facebook-post-scraper"`, no `apify/` prefix, not read by any real code path) — left untouched as
out of scope (not in the issue's file list, not a configured actor slug anywhere).

### Prove the check fails — two red→green transcripts

**1. Compile-time proof (adding the required port method breaks every existing caller until updated):**

```
$ npx tsc -p tsconfig.json --noEmit
src/commands/run-pipeline-onboarding.test.ts(52,3): error TS2741: Property 'probeActorExists' is
  missing in type '{ probeToken(): Promise<boolean>; }' but required in type 'ApifyReadinessPort'.
src/commands/run-pipeline.test.ts(51,3): error TS2741: Property 'probeActorExists' is missing in type
  '{ probeToken(): Promise<boolean>; }' but required in type 'ApifyReadinessPort'.
```
→ fixed both fakes (`probeActorExists` returning `"ok"`) → `tsc` clean again.

**2. Runtime proof — pointed the new tests at the REAL dead slug (`apify/facebook-post-scraper`),
then disabled `probeConfiguredActors` and watched the specific tests that depend on it go red:**

```
$ # src/commands/run-pipeline-readiness.ts, probeConfiguredActors() temporarily short-circuited:
$ #   async function probeConfiguredActors(...) { return []; ... }
$ node --import tsx --test src/commands/run-pipeline.test.ts
not ok 1 - reports a confirmed-dead actor slug as a non-blocking research advisory, naming the slug and where it's used
  error: 'a confirmed-dead actor slug must surface an advisory finding'
not ok 2 - reports an unreachable actor-existence probe as advisory too, distinct from not-found
  error: "a probe FAILURE must surface as 'unreachable', never silently dropped"
not ok 5 - the SAME slug configured for both trends_actor and post_actor is probed exactly once
  error: 'a slug shared by two purposes must be probed once, not twice / 0 !== 1'
# tests 52 / pass 49 / fail 3
```

(Tests 3 and 4 — "confirmed-OK produces no finding" and "no apify block means never probed" —
correctly stayed green even with the probe disabled, since a broken-and-disabled probe also happens to
produce zero findings/zero calls for those two specific scenarios; only the tests that assert a
POSITIVE finding or a POSITIVE call-count went red, which is the right shape of proof.)

Restored `probeConfiguredActors` to its real implementation → re-ran → **52/52 pass, 0 fail.**

**3. Bonus, unplanned red→green (found live, not staged) — `smoke-diagnose.test.ts`'s own first run:**

The very first run of the new `describeActorRequestFailure` test caught a real bug in the message
wording itself:

```
$ node --import tsx --test src/apify/live/smoke-diagnose.test.ts
not ok 1 - names the dead slug, status, and statusText for a 404 — the real, evidenced case from issue #253
  error: "an actor/request failure must NEVER read like the 'no data' message — that is exactly the #253 bug"
  actual: '... This is NEVER the same as "no data for this URL". ...'
# tests 4 / pass 3 / fail 1
```

The message's own clarifying sentence had literally quoted the phrase `"no data for this URL"` to
explain the distinction — which tripped the very assertion meant to prove the distinction held. Fixed
the wording ("a DIFFERENT, distinct failure from an empty/routine result" instead of quoting the banned
phrase) → re-ran → **4/4 pass, 0 fail.**

### Fakes / fixtures used

- **`ApifyReadinessPort` fakes** (`src/commands/run-pipeline.test.ts`, `run-pipeline-onboarding.test.ts`)
  — every `probeToken`/`probeActorExists` call is a fake; **no live Apify HTTP request is ever made.**
- **`ApifyFetch` fakes** (`src/apify/live/client.test.ts`, pre-existing, untouched behavior) — the
  `LiveApifyClient` this slice's `smoke.ts`/`actor-config.ts` build on top of is already only ever
  exercised against an injected fake `fetchImpl` in its own test suite; this slice adds no new live
  network path.
- **Temp-directory YAML fixtures** (`src/apify/actor-config.test.ts`) — real files on disk, in a
  `mkdtemp` temp dir, cleaned up after each test; never touches `data/brands/`.
- **`src/apify/live/smoke.ts` itself is NEVER run by this build** — it is explicitly excluded from
  `npm test`/`npm run test:docs` (its own module docstring), spends a real Apify credit, and requires
  `APIFY_API_TOKEN` + a real Brand + a real post URL. Not run at any point during this slice's build.
- **FLAGGED: the Magnific fake.** This slice touches no Magnific/Space code at all — `makeMagniticFake`
  (pre-existing, unmodified) is reused as-is in the new readiness tests purely because `runReadiness`
  requires a `MagnificReadinessPort` argument; no Magnific behavior was added, changed, or exercised
  beyond its pre-existing healthy-default shape. No `spaces_*`/`creations_*` call, no credit, no board
  mutation — confirmed by the `developer` agent not holding the `magnific` MCP tools at all.

### Self-review notes

- Extracted the smoke script's error-classification logic into a separate pure module
  (`smoke-diagnose.ts`) rather than inlining it in `smoke.ts`, specifically so it could be unit-tested —
  `smoke.ts` itself is permanently excluded from the test suite by convention, so anything
  decision-worthy needed to live somewhere testable. This is the "orchestration shell + deep module"
  split applied to a script that was previously 100% untested logic.
- Considered adding the actor-existence probe logic to the PURE `classify`/`checkConfig` modules
  instead of the I/O shell — rejected: both modules' own docstrings and an existing spec Requirement
  ("Both classify and checkConfig are pure and isolation-tested... Neither module SHALL import anything
  that performs I/O") forbid it outright; a network probe belongs in `run-pipeline-readiness.ts`
  alongside the two pre-existing live probes it already owns.
- Considered routing the new actor-existence finding through `classify.ts`'s existing `ReadinessInputs`
  shape (adding fields there) instead of building findings directly in `run-pipeline-readiness.ts` —
  rejected as a needless MODIFIED-header risk to an existing, "authoritative" (per its own docstring)
  pure-function contract, for no behavioral benefit; building the findings in the I/O shell, the same
  place `loadConfigFile`'s parse-error findings are already built, is the simpler, lower-risk shape.
- No dead code left behind: the temporary mutation used for the runtime red-proof
  (`return [];` short-circuit) was fully reverted; `git diff` on `run-pipeline-readiness.ts` shows only
  the intended, permanent implementation.

### Known limits

- **The live Apify adapter for `probeActorExists` is deferred**, exactly like `probeToken`'s/
  `probeSpace`'s live adapters already were before this slice — `DEFAULT_APIFY_PORT` returns
  `"unreachable"` at runtime until a real adapter is wired (tracked implicitly by the same
  "deferred, live adapter TODO" convention `run-pipeline.ts` already carries for the other two ports;
  no new issue filed, since this exactly matches existing precedent rather than introducing a new gap).
- **`linkedin` is never probed** — `resolveApifyActor` already returns `null` for its `"..."`
  placeholder before `probeConfiguredActors` ever sees it. Out of scope for this ticket.
- **Actor input/output schema drift stays explicitly out of scope**, per the issue's own instruction —
  `src/apify/normalize-metrics.ts`'s field-mapping logic is untouched; only its doc comments moved.
- **`smoke.ts` itself has no automated coverage** (by design/convention — never run by `npm test`); its
  correctness rests on the fully-tested modules it now composes (`loadConfiguredActorSlug`,
  `describeActorRequestFailure`) plus a manual read-through.
