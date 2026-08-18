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

---

## QA Verdict — Round 1: FAIL

### Suite result

All commands run for real from the worktree (`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-253-facebook-actor-slug`), not assumed:

- `npm test` → **3677 tests / 956 suites / 0 fail** — confirmed against baseline `cdb68a0` (3662/953/0):
  +15 tests / +3 suites, matching the three new test files/blocks exactly.
- `npm run test:docs` → **351 / 94 / 0**, green.
- `npm run build` → clean (`tsc -p tsconfig.build.json`, no output).
- `openspec validate issue-253-facebook-actor-slug --strict` → `Change 'issue-253-facebook-actor-slug' is valid`.
- `openspec validate --all --strict` → `Totals: 69 passed, 0 failed (69 items)`.
- Also independently re-ran the three most-directly-touched files (`actor-config.test.ts`,
  `smoke-diagnose.test.ts`, `run-pipeline.test.ts`) as their own `node --import tsx --test` invocation
  → 62/62 pass, matching the Build Report's individual-file instructions.

### Per-criterion results (issue #253's "What to build" checklist)

1. **Correct every live occurrence of the dead slug** — PASS. `git grep -n "facebook-post-scraper"`
   repo-wide (excluding `openspec/changes/*/handoff.md|proposal.md|tasks.md`/archive) returns only
   deliberate historical/explanatory mentions (doc comments naming the dead slug as a fact, and the
   `smoke-diagnose.test.ts`/`run-pipeline.test.ts` fixtures that deliberately use the REAL dead slug as
   their proof value) plus one pre-existing, unrelated opaque fixture label in
   `src/performance/store.test.ts` (no `apify/` prefix, not read by any real code path — confirmed by
   reading it). Every file named in the issue's own table (`data/brands/mundotip/seeds.yaml`,
   `data/brands/straw-motion/seeds.yaml`, `templates/brand-skeleton/seeds.yaml`,
   `src/brand/scaffolder.ts`, `src/apify/live/smoke.ts`, `.claude/agents/performance-tracker.md`) was
   read directly and confirmed to now read the plural, correct slug.
2. **Update tests/fixtures/doc comments + the apify-live-client spec Scenario** — PASS. Confirmed zero
   remaining singular-slug occurrences in `check-config.test.ts`, `track-performance.test.ts`,
   `platform.test.ts`, `request.test.ts`, `client.test.ts`, `normalize-metrics.test.ts`,
   `normalize-metrics.ts`; `openspec/specs/apify-live-client/spec.md`'s Scenario now reads the plural
   slug.
3. **`smoke.ts` reads its actor from the Brand's own `seeds.yaml` via `resolveApifyActor`** — PASS.
   Read `smoke.ts` directly: it calls `loadConfiguredActorSlug(brandPaths.seeds, "facebook",
   "post_actor")`, which is a thin wrapper around the existing pure `resolveApifyActor`
   (`src/apify/actor-config.ts`). Proved with my own fixture (a `seedsPath` in a temp dir holding a slug
   I chose myself, `qa-own/totally-made-up-slug`) that `loadConfiguredActorSlug` resolves it verbatim
   and returns `null`, never a fabricated value, for a missing platform block.
4. **Distinguish "actor not found" from "no data" in the smoke script's output** — PASS. Read
   `smoke-diagnose.ts`/`smoke.ts` directly. Independently exercised `describeActorRequestFailure` with
   my own inputs (an `ApifyRequestError(410, "Gone")` against a slug I chose myself,
   `apify/my-own-canary-slug` — no live Apify call) and confirmed the message names the slug/status,
   never reads like "no data," and is textually distinct from the actual `raw === null` branch's
   message. No live Apify call made at any point (see Hermeticity below).
5. **Decide + record whether actor-slug existence is verified, and where** — **FAIL, see Defect 1**.
   The decision itself (readiness check, advisory-only severity) is well-argued in `proposal.md`, and
   `probeConfiguredActors`'s internal `Finding[]` computation is correct and well-tested (5/5 new tests
   green, including the shared-slug-probed-once case). But the proposal's own claim that this advisory
   is "surfacing on every launch" is empirically false: `runPipelineCommand` silently drops it in the
   exact scenario the ticket exists to fix (a healthy pipeline otherwise, one dead actor slug) — see
   Defect 1 for the live reproduction.
6. **Prove the check fails** — PASS. The Build Report's two red→green transcripts (compile-time port
   mismatch; runtime `probeConfiguredActors` short-circuit) are consistent with what I'd expect from
   reading the diff, and `git diff`/`git status` on the worktree show no leftover mutation (working tree
   clean, matching the claim that the temporary short-circuit was fully reverted). I additionally
   reproduced red→green **myself**, independently, without touching any tracked file: called the real
   `buildSeeds()` (scaffolder) directly and asserted its `post_actor` output against the OLD dead
   singular slug — this assertion correctly **fails** (red), then asserted it against the real plural
   slug — **passes** (green). `git status` confirmed clean before and after (no file was ever written
   to inside the repo for this proof).

### Per-scenario results (this change's spec deltas)

- **`apify-live-client`** (3 Scenarios: message-naming, tilde-conversion, null-for-other-errors) —
  PASS, covered by `smoke-diagnose.test.ts` (4/4 green) plus my own independent manual check with a
  self-chosen slug/status.
- **`apify-platform-integration`** (5 Scenarios: resolves/missing-file/unparseable/no-platform-block/
  placeholder) — PASS, covered by `actor-config.test.ts` (6/6 green) plus my own independent manual
  check (self-chosen slug, missing-platform case).
- **`run-pipeline-conductor`** (5 Scenarios: not-found-advisory, unreachable-advisory,
  confirmed-OK-no-finding, no-apify-block-never-probed, shared-slug-probed-once) — PASS **as literally
  written** (`run-pipeline.test.ts`, 5/5 green) — every one of these five Scenarios asserts only on
  `runReadiness`'s returned `Finding[]`, never on `runPipelineCommand`'s actual printed output. That is
  precisely the blind spot Defect 1 lives in: the Requirement text technically holds (a Finding IS
  produced, with the right severity/phase/code), but no Scenario anywhere in this delta proves the
  Finding is ever surfaced to a human, which is the actual, stated purpose of the check.

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS (unaffected code path; no publish logic touched).
- **Public-metrics-only** — PASS. This slice only concerns which Apify actor slug is configured/probed;
  no private Insights dependency introduced; `mapFacebookItem`'s field mapping is explicitly untouched
  (only doc comments moved, confirmed by reading `normalize-metrics.ts`'s diff).
- **Relative-not-absolute** — PASS (unaffected; no scoring/baseline logic touched).
- **Explicit-attribution** — PASS (unaffected; no Post/Idea/Recipe linkage touched).
- **Ledger-as-source-of-truth** — PASS. `git diff --stat` against `cdb68a0` confirms zero ledger/asset/
  production-queue files touched; no new ledger writes introduced.
- **Magnific fake / hermeticity (no live Space calls)** — PASS. `git grep` for `spaces_*`/`creations_*`
  across every file this slice touches shows only pre-existing, unrelated occurrences (fixtures/README/
  driver code from earlier slices); the new/changed tests' only `magnific` usage is the pre-existing
  `makeMagniticFake()` fixture, reused unmodified, exactly as the Build Report states. The `developer`
  agent does not hold the Magnific MCP tools.
- **No live Apify calls; `smoke.ts` never run by `npm test`** — PASS. `smoke.ts` is not a `*.test.ts`
  file and is not imported by any test (confirmed via its own module docstring and a read-through);
  `npm test`'s script glob (`"src/**/*.test.ts" "src/**/*.docs-test.ts"`) cannot reach it. Every
  `ApifyReadinessPort`/`ApifyFetch` in the test suite is a fake. All of my own independent
  reproductions (Defect 1's repro, the red/green scaffolder proof, the `describeActorRequestFailure`/
  `loadConfiguredActorSlug` manual checks) used only fakes/constructed errors/temp directories — zero
  network calls, zero credits spent.
- **No new runtime dependency** — PASS. `git diff cdb68a0..HEAD -- package.json package-lock.json` is
  empty.

### Direct OpenSpec spec-file edits (task 3 — scrutinised)

**Legitimate.** Read the diffs on both `openspec/specs/apify-live-client/spec.md` and
`openspec/specs/apify-platform-integration/spec.md` directly: each is a narrow, one-line-per-Scenario/
Requirement correction of a slug that never existed (a worked-example value), with the surrounding
WHEN/THEN transformation logic and the Requirement's normative SHALL text completely unchanged. No
behavior these Requirements describe actually changed — only a factually wrong example value did.
`openspec validate --all --strict` stays green (69/69) and this change's own delta carries ADDED-only
Requirements (no MODIFIED headers against either edited spec), so the archive process stays coherent —
there is no MODIFIED-header trap to hit here, and `proposal.md`'s "Spec delta scope" section argues this
explicitly rather than assuming it, per the developer's own stated convention.

### Shared `trends_actor`/`post_actor` actor (task 4)

Confirmed by reading `data/brands/mundotip/seeds.yaml`, `data/brands/straw-motion/seeds.yaml`,
`templates/brand-skeleton/seeds.yaml`, and `src/brand/scaffolder.ts`'s `APIFY_ACTORS.facebook` — all
four set `trends_actor === post_actor === "apify/facebook-posts-scraper"`. Confirmed nothing in the two
call paths assumed the two purposes resolve to different actors: `client.ts#scrapePost` builds its
request via `request.ts#apifyRunSyncInput`, which is keyed only on `platform`/`postUrl`, never on
whether the slug came from `trends_actor` or `post_actor` — the shared value flows safely through the
one `{ startUrls: [...] }` shape Facebook uses either way. The new readiness probe explicitly dedupes a
shared slug to one network probe (`run-pipeline-readiness.ts`'s `usagesBySlug` map), proven by its own
"probed exactly once" test.

### Defect list

**Defect 1 — HIGH — the new actor-existence advisory is silently dropped from the Operator-facing
output in the exact scenario issue #253 exists to fix; the proposal's "surfacing on every launch" claim
does not hold.**

What's wrong: `probeConfiguredActors` correctly computes an `advisory`-severity `Finding` for a dead or
unreachable actor slug (proven by 5 green tests). But `runPipelineCommand`
(`src/commands/run-pipeline.ts:592-603`) only prints ANY readiness output when at least one
`block`-severity finding is also present — its own comment says so plainly: "The conductor is SILENT
when all findings are advisory-only or there are none. It only surfaces output when blocking findings
exist." This mirrors a pre-existing, spec-mandated Requirement this slice did not modify
(`openspec/specs/run-pipeline-conductor/spec.md:40`: "When all findings are advisory-only or there are
no findings, the readiness output SHALL be silent (no output to the Operator)") — so this is not a
regression this slice introduced, but the slice built its whole self-checking mechanism on top of a
delivery path that structurally cannot deliver it in the common case, and neither `proposal.md` nor the
Build Report's "Known limits" discloses this. All 5 of this slice's own new `run-pipeline.test.ts`
Scenarios call `runReadiness` directly and assert only on the returned `Finding[]` — none calls
`runPipelineCommand` and inspects its actual printed `turns`, which is why the gap shipped green.
`proposal.md`'s "Decision" section states: "An advisory that names the exact dead slug and where it is
configured — **surfacing on every launch**, never gating anything — is the actionable, non-destructive
design this ticket asks for." That is not what the shipped code does.

Practical impact: for a Brand with a healthy Magnific Space, a valid Apify token, and a clean
`checkConfig`/`classify` result, but one dead configured actor slug (issue #253's own exact scenario),
running `/run-pipeline <brand>` prints **nothing** about the dead slug — the Operator gets no signal at
all. The next dead slug would go unnoticed by the live pipeline exactly the way this one did, unless it
happens to coincide with some other, unrelated block-level finding.

Repro steps (hermetic — no live Apify/Magnific call; no tracked file was ever modified; `git status`
confirmed clean immediately before and after):

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-253-facebook-actor-slug
node --import tsx -e "
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipelineCommand } from './src/commands/run-pipeline.ts';

const tmpRoot = await mkdtemp(join(tmpdir(), 'qa253-'));
const brandDir = join(tmpRoot, 'brands', 'testbrand');
await mkdir(brandDir, { recursive: true });
await writeFile(join(brandDir, 'brand-profile.yaml'), \`
channel:
  - platform: facebook
    url: \\\"https://www.facebook.com/testbrand\\\"
    primary: true
niche: \\\"n\\\"
voice: \\\"v\\\"
banned_words: [\\\"x\\\"]
\`.trim(), 'utf8');
await writeFile(join(brandDir, 'seeds.yaml'), \`
seed_pages:
  - \\\"https://www.facebook.com/seed1\\\"
apify:
  facebook:
    post_actor: \\\"apify/qa-canary-slug-does-not-exist\\\"
\`.trim(), 'utf8');
await writeFile(join(brandDir, 'ledger.json'), JSON.stringify({ ideas: [], baseline: { updated_at: null } }), 'utf8');

const turns = await runPipelineCommand('testbrand', {
  brandsRoot: join(tmpRoot, 'brands'),
  queuePath: join(tmpRoot, 'queue.json'),
  now: () => '2026-06-06T10:00:00.000Z',
  nowDate: () => new Date('2026-06-01T00:00:00.000Z'),
  magnific: { async probeSpace() { return { accessible: true, creditsOk: true }; } },
  apify: {
    async probeToken() { return true; },
    async probeActorExists(slug) { return slug.includes('qa-canary') ? 'not_found' : 'ok'; },
  },
});
console.log(turns.map(t => t.message).join('\\n---\\n'));
await rm(tmpRoot, { recursive: true, force: true });
"
```

Observed output: goes straight from `Running pipeline for Brand: testbrand` to the `/rename` hint to
`Gate 1 — Review` — never mentions `qa-canary`, `not_found`, `apify_actor_not_found`, or any warning.

Suggested fix direction (not prescriptive): either (a) print actor-existence advisories unconditionally
regardless of whether a `block` finding co-occurs — a narrow, arguable carve-out from the general
"silent when advisory-only" rule, given this finding class is specifically what "and nothing notices"
is about — or (b) if the existing silent-advisory house behavior is intentionally kept as-is here too,
add a `run-pipeline.test.ts` case that drives `runPipelineCommand` (not just `runReadiness`) with ONLY
the actor-existence advisory present and asserts on `turns`, honestly record in "Known limits" that the
advisory will not reach the Operator unless another block-level finding also fires that same run, and
correct `proposal.md`'s "surfacing on every launch" claim to match actual behavior.

### Overall

**FAIL — Round 1.** Everything else verified clean: the dead slug is genuinely gone everywhere live
(AC1–2), `smoke.ts` genuinely reads the Brand's configured actor and genuinely distinguishes the two
failure modes (AC3–4), the red→green proof is real and I independently reproduced an equivalent one
myself (AC6), the shared-actor design holds up under both call paths, the direct OpenSpec edits are a
legitimate factual correction that leaves `validate --all --strict` and the archive path coherent, and
every always-rule/hermeticity/no-new-dependency check passes. But Defect 1 means acceptance criterion 5
— "decide and record whether a configured actor slug should be verified to exist" — is not actually
delivered where it matters: the check is computed correctly but is not reliably reported to the
Operator, reproducing the ticket's own "and nothing notices" failure mode one layer down. This is
exactly the class of gap the standing lesson describes: a test suite that is green because it checks the
return value of a pure computation, never the artifact a human actually sees.

---

## Build Report — Round 2

### What changed (Round 2 fix for QA's Defect 1 — HIGH)

QA's Round 1 verdict was correct: `probeConfiguredActors` computed the advisory `Finding` correctly, but
`runPipelineCommand`'s existing print gate only surfaced ANY readiness output when a `block`-severity
Finding also existed that run — so for a healthy Brand with one dead actor slug (issue #253's own
scenario), the Operator saw nothing. This round:

1. **Made the advisory actually reach the Operator, without making it blocking.** Added
   `isActorExistenceFinding` (`src/commands/run-pipeline-readiness.ts`) — a named predicate identifying
   the two actor-existence Finding codes (`apify_actor_not_found:*` / `apify_actor_unreachable:*`).
   `runPipelineCommand` (`src/commands/run-pipeline.ts`) now prints these findings unconditionally —
   whether or not a `block` finding co-occurs that run — via a narrow, explicitly-commented carve-out
   from the general "silent when advisory-only" default. Every other advisory-only finding (see "Other
   swallowed advisories," below) is completely untouched: same silent behavior as before this slice and
   before this round.
2. **Closed the test gap that hid it.** Added 4 new tests in `run-pipeline.test.ts` that drive
   `runPipelineCommand` end to end (not `runReadiness` in isolation) and assert on its actual printed
   `turns`: a dead-slug-only scenario prints `[WARN]` and does not block; an unreachable-probe-only
   scenario prints `[WARN]` and does not block; a fully-healthy scenario (including a confirmed-OK
   configured actor) prints nothing; a scenario with an unrelated co-occurring block still prints the
   actor advisory alongside it (proving the pre-existing "print everything when a block exists" path is
   untouched).
3. **Recorded the fix in OpenSpec.** Added a new ADDED Requirement + 3 Scenarios to this change's
   `run-pipeline-conductor` spec delta (`specs/run-pipeline-conductor/spec.md`) describing the
   conductor-level printing behavior — distinct from the existing Requirement, which only describes what
   `runReadiness` computes. Added a "Round 2 addendum" paragraph to `proposal.md`'s Decision section
   correcting/grounding the "surfacing on every launch" claim in the actual delivery-path fix, and naming
   the other advisory codes this round deliberately does NOT touch.

### Files touched (Round 2, in addition to Round 1's list)

- `src/commands/run-pipeline-readiness.ts` — new exported `isActorExistenceFinding`
- `src/commands/run-pipeline.ts` — the narrow carve-out at the readiness-print call site (import +
  `else` branch); no other line changed
- `src/commands/run-pipeline.test.ts` — 4 new tests in a new
  `runPipelineCommand — actor-existence advisory reaches the Operator even with no block finding (issue
  #253, Round 2)` describe block
- `openspec/changes/issue-253-facebook-actor-slug/proposal.md` — Round 2 addendum under "Decision"
- `openspec/changes/issue-253-facebook-actor-slug/specs/run-pipeline-conductor/spec.md` — one new ADDED
  Requirement + 3 Scenarios
- `openspec/changes/issue-253-facebook-actor-slug/tasks.md` — new "## 8. Round 2" section
- `openspec/changes/issue-253-facebook-actor-slug/handoff.md` — this block

### How to run

```bash
npm test                                                   # full suite (type-checks first)
npm run test:docs                                          # docs-conformance suite
npm run build                                               # tsc -p tsconfig.build.json
openspec validate issue-253-facebook-actor-slug --strict     # this change
openspec validate --all --strict                             # every spec + change

# The file most directly touched this round:
node --import tsx --test src/commands/run-pipeline.test.ts
```

Results at Round 2 handoff time: `npm test` → **3681 tests / 957 suites / 0 fail** (Round 1 baseline was
3677/956/0 — +4 tests, +1 suite, exactly the one new describe block). `npm run test:docs` → 351/94/0,
unchanged. `npm run build` clean. Both `openspec validate` commands green
(`issue-253-facebook-actor-slug` valid; `--all --strict` → 69/69 passed).

### Defect 1 — status: FIXED

Re-ran QA's own repro script verbatim (same fixture, same `apify/qa-canary-slug-does-not-exist` slug)
against the fixed code:

```bash
$ cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-253-facebook-actor-slug
$ node --import tsx -e "
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipelineCommand } from './src/commands/run-pipeline.ts';

const tmpRoot = await mkdtemp(join(tmpdir(), 'dev253r2-'));
const brandDir = join(tmpRoot, 'brands', 'testbrand');
await mkdir(brandDir, { recursive: true });
await writeFile(join(brandDir, 'brand-profile.yaml'), \`
channel:
  - platform: facebook
    url: \\\"https://www.facebook.com/testbrand\\\"
    primary: true
niche: \\\"n\\\"
voice: \\\"v\\\"
banned_words: [\\\"x\\\"]
\`.trim(), 'utf8');
await writeFile(join(brandDir, 'seeds.yaml'), \`
seed_pages:
  - \\\"https://www.facebook.com/seed1\\\"
apify:
  facebook:
    post_actor: \\\"apify/qa-canary-slug-does-not-exist\\\"
\`.trim(), 'utf8');
await writeFile(join(brandDir, 'ledger.json'), JSON.stringify({ ideas: [], baseline: { updated_at: null } }), 'utf8');

const turns = await runPipelineCommand('testbrand', {
  brandsRoot: join(tmpRoot, 'brands'),
  queuePath: join(tmpRoot, 'queue.json'),
  now: () => '2026-06-06T10:00:00.000Z',
  nowDate: () => new Date('2026-06-01T00:00:00.000Z'),
  magnific: { async probeSpace() { return { accessible: true, creditsOk: true }; } },
  apify: {
    async probeToken() { return true; },
    async probeActorExists(slug) { return slug.includes('qa-canary') ? 'not_found' : 'ok'; },
  },
});
console.log(turns.map(t => t.message).join('\n---\n'));
await rm(tmpRoot, { recursive: true, force: true });
"
```

**Observed output (Operator-visible transcript):**

```
Running pipeline for Brand: testbrand
---
Readiness check:
  [WARN] (research) The configured Apify actor "apify/qa-canary-slug-does-not-exist" (used for facebook.post_actor) was confirmed NOT to exist (a 404 from Apify's own actor lookup). Trend research and/or performance tracking through it will keep failing until seeds.yaml is corrected — this never blocks the run, but should be fixed.
---
/rename testbrand · 2026-W23
---
Gate 1 — Review. Brand: testbrand
Run /run-trends testbrand <format> to discover Trends and generate Ideas for one of the Brand's Formats, then /review-ideas testbrand to accept or reject them.
When you have accepted Ideas, run /run-pipeline testbrand again to continue.
---
Gate 1 complete. Brand: testbrand
Any Ideas you accepted during /review-ideas were auto-enqueued for production; if you accepted none, nothing was enqueued.
After production drains to the Cast gate, run /run-pipeline testbrand again to continue.
```

The `[WARN]` line now appears, names the exact dead slug and where it's configured
(`facebook.post_actor`), and the conductor proceeds all the way through `/rename` to Gate 1 — **the run
is not blocked.** This is hermetic: no live Apify/Magnific call (both ports are inline fakes), no tracked
file was ever written to (a `mkdtemp` temp dir, removed at the end), `git status` was clean before and
after.

**Break-it-on-purpose proof (red→green):** temporarily short-circuited the new print branch in
`src/commands/run-pipeline.ts` to `if (false && actorAdvisories.length > 0) { ... }`, then ran
`node --import tsx --test src/commands/run-pipeline.test.ts`:

```
not ok 9 - runPipelineCommand — actor-existence advisory reaches the Operator even with no block finding (issue #253, Round 2)
# tests 56
# pass 54
# fail 2
```

Exactly the 2 tests that assert the advisory prints with **no** co-occurring block finding went red (the
dead-slug-only and unreachable-only cases); the "fully-healthy prints nothing" and "co-occurring block
still prints it" tests correctly stayed green, since neither depends on the carve-out being active. This
is the right shape of failure — restored the code (`git diff src/commands/run-pipeline.ts` afterward
showed only the intended permanent implementation, no leftover mutation), re-ran → **56/56 pass, 0
fail.**

### The wider question — are other advisory findings computed and never printed the same way?

**Yes.** The silent-when-advisory-only print gate in `run-pipeline.ts` is not new to this slice — it
predates it (the base, already-archived `run-pipeline-conductor` spec's own Requirement: "When all
findings are advisory-only or there are no findings, the readiness output SHALL be silent"). Every OTHER
advisory `code` the readiness system has ever produced is subject to the exact same swallow behavior this
round fixed only for the two actor-existence codes:

- From `src/readiness/classify.ts` (pure): `space_inaccessible_advisory`, `credits_low_advisory`,
  `null_baseline`, `off_niche_seed`.
- From `src/readiness/check-config.ts` (pure): `niche_unset`, `config_todo` (niche and voice each have
  their own TODO check, same code), `voice_unset`, `off_niche_seed` (duplicated by design — see that
  module's own docstring — from a different vantage point than classify's), `empty_banned_words`.

None of these ever reaches the Operator on a real launch unless a `block`-severity finding happens to
co-occur that same run. This is not hypothetical: `run-pipeline.test.ts`'s own PRE-EXISTING test at
`"still shows the no-baseline advisory when the ledger baseline has no updated_at"` (C21) already had to
**force** an unrelated research block (`apify: makeApifyFake({ tokenValid: false })`) specifically so the
`null_baseline` advisory would print — the test author already knew, and worked around it, rather than
fixing it. Likewise `"advisory findings do not stop the loop"` (the pre-existing `empty_banned_words`
test) only ever asserted the loop didn't stop, never that a `[WARN]` line for it actually appeared —
exactly the same blind spot QA's Defect 1 found in this slice's own new tests.

**This is deliberately left unfixed here.** It predates issue #253, it is not named in the issue's own
acceptance criteria, and fixing it for every advisory code is a materially bigger, more general change
(does the "surface-always" carve-out become the new default for ALL advisories, or does each one get its
own named carve-out like this round's? that is a real design decision, not a one-line fix, and touches
the base spec's own "silent when advisory-only" Requirement text, which this change has deliberately
avoided touching via a MODIFIED header throughout). Naming it here per the retry instructions: **a
follow-up issue should be filed** to decide, once, whether the conductor's advisory-print policy should
change generally (all seven other advisory codes above are equally subject to "and nothing notices"
today), rather than allowing individual tickets to keep adding one narrow carve-out at a time.

### Self-review notes (Round 2)

- Considered making the general "silent when advisory-only" behavior print ALL advisories instead of a
  narrow carve-out — rejected for this round: it would touch the base `run-pipeline-conductor` spec's own
  existing Requirement wording (a MODIFIED delta, the exact archive-time trap this change has avoided
  throughout), change behavior for seven other, unrelated advisory codes with no test coverage proving
  that's safe/wanted, and go beyond issue #253's own scope (which is about the Facebook actor slug
  specifically). The narrow, named, well-commented carve-out is the smaller, safer, more reviewable fix
  that still satisfies the acceptance criterion QA flagged.
- No dead code left behind: the temporary `if (false && ...)` mutation used for the break-it-on-purpose
  proof was fully reverted; `git diff` on `run-pipeline.ts` shows only the two intended hunks (the import
  and the new `else` branch).
- Kept the icon/format convention (`[WARN] (${phase}) ${message}`, prefixed with `"Readiness check:"`)
  identical to the existing block-present branch, rather than inventing a second output shape — the
  Operator sees a consistent readiness-output format regardless of which branch produced it.

### Known limits (Round 2, in addition to Round 1's)

- **Seven other pre-existing advisory codes stay silent-only**, unchanged by this round (see "The wider
  question," above): `space_inaccessible_advisory`, `credits_low_advisory`, `null_baseline`,
  `off_niche_seed`, `niche_unset`, `config_todo`, `voice_unset`, `empty_banned_words`. A follow-up issue
  is warranted to decide the conductor's advisory-print policy generally, rather than one narrow
  carve-out per ticket.
- The narrow carve-out is keyed on `Finding.code` string prefixes (`apify_actor_not_found:` /
  `apify_actor_unreachable:`), matching how `runReadiness`'s own per-slug-unique-code contract already
  works (see the base Requirement's own code-shape description) — not a new `Finding` shape or a new
  `severity` value, so no schema change was needed.

### Fakes / fixtures used (Round 2)

Same as Round 1 — no new fake types introduced. The 4 new tests use the same
`ApifyReadinessPort`/`MagnificReadinessPort` fake-injection pattern as every existing `run-pipeline.test.ts`
test (inline fakes or `makeApifyFake`/`makeMagniticFake`), and the same `withBrandFixture` temp-directory
helper. The QA-repro transcript above and the break-it-on-purpose mutation test both used only inline
fakes / a `mkdtemp` temp directory — no live Apify or Magnific call, no credits, no board mutation, no
tracked file ever written to. **FLAGGED: the Magnific fake** — `makeMagniticFake`/the inline
`probeSpace` fake are reused unmodified; no Magnific behavior was added or changed this round either.
