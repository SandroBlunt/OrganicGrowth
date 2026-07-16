# Slice Handoff — issue-56-recipe-aware-queue

Bidirectional channel between `developer` and `qa`. Nothing is overwritten; retries append `Round-N`
blocks.

---

## Build Report (Round 1)

### What changed

Re-grained the Production Queue's job/lock identity from `(brand, idea_id)` to
`(brand, idea_id, recipe)` (ADR-0009/0011), so a second Recipe chosen for the same Idea gets its own
job instead of being silently dropped as a duplicate. The old hard-coded `phase: "cast" | "render"` +
`awaiting_cast` status became a **generic gate cursor** (`gate: string | null`, `status:
"awaiting_pick"`) driven by a Recipe's own ordered gate list from the registry, rather than a
hard-coded two-step split. `enqueueOnAccept` now takes the Operator's chosen Recipe set explicitly and
enqueues one job per Recipe. `/pick-cast` resolves the RESOLVED Asset's own Recipe onto the enqueued
next leg and refuses (never guesses) when more than one Asset is paused at the Cast gate at once.

Built `/log-post` as a real, tested command for the first time (it was previously markdown-only) with
a **required `<recipe>` argument**: attribution is keyed `(Idea, Recipe)`, and the command refuses —
listing the Idea's actual Assets — when the given recipe doesn't match one of them, even when the Idea
happens to have exactly one Asset. `/report` re-scopes to a per-Recipe Asset breakdown with an explicit
best-of-N Performance summary against the one per-Idea Fit Score, plus a dedicated Posts section (one
row per `(Idea, Recipe)` with a logged URL) — exactly one Channel baseline is preserved throughout. The
Production-Spec save path gained a Recipe segment (`idea-NN.<recipe>.spec.json`) so two Recipes of one
Idea never overwrite each other's Spec.

The re-key forced a decision on `src/production-queue/worker.ts` — the ADR-0004 background-worker
orchestration shell that was never wired to any live command (confirmed in issue #55's own QA pass)
and is explicitly slated for deletion in issue #59 ("delete the abandoned background-worker code"). It
depended structurally on the old two-phase job shape; rather than patching ~600 lines of dead-code
tests to a shape they'd never really needed, I deleted `worker.ts` + `worker.test.ts` and trimmed the
now-unused `FakeSpaceSession` seam out of the Magnific fake (the driver-facing `FakeSpace`/
`SpaceMcpPort` fake every other hermetic Space-driver test depends on is untouched). This narrows, but
does not complete, issue #59's remaining scope (the docs flip + `producer-agent.docs-test.ts` fix).
`scheduler.ts`'s pure transitions were **not** deleted — they're a reusable, gate-cursor-based module
`/pick-cast` actively depends on today and issue #57's driver will build on directly.

### Files touched

**New:**
- `src/commands/log-post.ts`, `src/commands/log-post.test.ts`

**Re-keyed (queue core):**
- `src/production-queue/queue.ts`, `queue.test.ts`
- `src/production-queue/scheduler.ts`, `scheduler.test.ts`
- `src/production-queue/store.ts`, `store.test.ts`
- `src/production-queue/format.ts`, `format.test.ts`
- `src/production-queue/enqueue-on-accept.ts`, `enqueue-on-accept.test.ts`

**Modified:**
- `src/commands/pick-cast.ts`, `pick-cast.test.ts`
- `src/commands/report.ts`, `report.test.ts`
- `src/commands/queue.test.ts`
- `src/commands/run-pipeline.ts` (stranded-Idea re-enqueue passes recipes)
- `src/ledger/ledger.ts`, `ledger.test.ts` (`loadIdeas` carries `recipes`; `loadReport` re-scoped;
  dead worker-compat re-exports removed)
- `src/asset/asset.ts` (docstring only — dangling worker.ts reference removed)
- `src/production-spec/store.ts`, `store.test.ts`
- `src/production-spec/compose.ts`, `compose.test.ts`
- `src/phase-resolver/resolve.test.ts` (fixture field rename only; `resolve.ts` itself untouched)
- `src/recipe/review-docs.test.ts` (the `enqueueOnAccept(..., chosen, ...)` call text it pins)
- `src/space-driver/fixtures/fake-space.ts` (trimmed — see above)
- `package.json` (`log-post` npm script)

**Deleted:**
- `src/production-queue/worker.ts`, `worker.test.ts`

**Docs:**
- `.claude/commands/queue.md`, `pick-cast.md`, `log-post.md`, `track-performance.md`, `report.md`,
  `review-ideas.md`

**OpenSpec:**
- `openspec/changes/issue-56-recipe-aware-queue/proposal.md`, `tasks.md`, `handoff.md` (this file),
  `specs/production-queue/spec.md`, `specs/cast-render/spec.md`, `specs/report-surface/spec.md`,
  `specs/production-spec/spec.md`, `specs/post-attribution/spec.md` (new capability)

### How to run

```bash
# Full suite (type-check + unit tests)
npm test

# One file
node --import tsx --test src/commands/log-post.test.ts

# OpenSpec
npx openspec validate issue-56-recipe-aware-queue --strict
npx openspec validate --all --strict   # confirm nothing else broke

# Build (emits dist/, catches anything npm test's tsc might not)
npm run build
```

Current state: **914/914 unit tests green**, `npm run build` clean, `openspec validate --all --strict`
green (16/16 items, including this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (from issue #56) | Proven by |
|---|---|---|
| 1 | Queue lock/job identity re-keyed `(brand, idea, recipe)`; `enqueueOnAccept` enqueues one job per chosen Recipe; a second Recipe is NOT dropped as a duplicate | `src/production-queue/queue.test.ts` → *"enqueue"* → **"a SECOND Recipe on the SAME (brand, idea) is NOT dropped as a duplicate (issue #56 AC1)"**; *"hasJobFor"* → **"is keyed on recipe too — a different Recipe of the same Idea does not match"**. `src/production-queue/enqueue-on-accept.test.ts` → **"enqueues ONE JOB PER (brand, idea, recipe) for a MULTI-Recipe chosen set…"** and **"an existing job for a DIFFERENT Recipe of the same Idea does not block enqueuing this Recipe (issue #56 AC1)"** |
| 2 | `phase` cast/render + `awaiting_cast` become a generic gate cursor | `src/production-queue/queue.ts`'s `gate: string \| null` + `JobStatus`'s `awaiting_pick`; `queue.test.ts` → **"supports a gateless first leg (gate: null…)"**; `scheduler.test.ts` → the full `markAwaitingPick`/`markPickConsumed` suite; `format.test.ts` → **"shows queued, running, awaiting_pick, done, and failed jobs"** with the `gate=cast`/`gate=final` labels |
| 3 | `/log-post <brand> <idea> <recipe> <url>` writes onto that Asset; refuses (and lists the Assets) if the recipe isn't one of the Idea's produced Assets — never infers | `src/commands/log-post.test.ts` → **"planLogPost"** describe block (`"REFUSES when the recipe does not name one of the Idea's Assets"`, `"even with EXACTLY ONE Asset… still refuses"`); `"logPostCommand"` → **"REFUSES and lists the Idea's Assets when the recipe does not match any of them — writes nothing"** and **"with TWO Assets, writes onto ONLY the named Recipe's Asset — the other is untouched"** |
| 4a | `/queue` reads/writes per-Asset (per-Recipe job identity) | `src/production-queue/format.test.ts` → **"a second Recipe of the same Idea shows as a distinct line"** |
| 4b | `/pick-cast` reads/writes per-Asset | `src/commands/pick-cast.test.ts` → **"against a canonical, already-migrated ledger"** suite; **"refuses (and names both Recipes) when TWO Assets are paused at the Cast gate at once"** |
| 4c | `/report` reads/writes per-Asset; exactly one Channel baseline preserved; Fit vs best Post kept as an explicit 1:N | `src/ledger/ledger.test.ts` → **"loadReport — per-Recipe assets and the best-of-N Performance summary"** (5 scenarios incl. **"preserves the single Channel baseline unchanged (never per-Recipe)"**); `src/commands/report.test.ts` → **"labels the best-of-N Performance summary as an explicit 1:N relationship (ADR-0011)"**, **"shows exactly ONE baseline line regardless of how many Recipes/Assets exist"**, **"a two-Recipe Idea surfaces both Assets, each with its own attribution"** |
| 4d | `/track-performance` reads/writes per-Asset | No compiled TS command exists for `/track-performance` (conversational, delegated to the `performance-tracker` content agent) — unchanged by this slice. `.claude/commands/track-performance.md` rewritten to describe per-Asset selection/write and the single Channel baseline. The write mechanism it depends on (`AssetStore.writeAsset`) is exercised directly by `log-post.test.ts` and was already covered by `asset/store.test.ts` (issue #55). See **Known limits**. |
| 5 | Production-Spec save path gains a Recipe segment | `src/production-spec/store.test.ts` → **"segments by Recipe — two Recipes of the same Idea get DIFFERENT paths"**, **"two Recipes of one Idea each save to their own file — the second does not overwrite the first"**; `compose.test.ts` (all 4 tests now pass `recipe:` explicitly) |
| 6 | Concurrency stays serial — one attended generation at a time | `src/production-queue/scheduler.test.ts` → **"nextReady — single-Space lock (≤1 running)"** (unchanged behavior, now keyed on the composite triple — see the "transitions are keyed on (brand, idea_id, recipe)" describe block) |
| 7 | Built test-first against the fake; single-recipe path green (via the wired recipe); strict validate + suite green | 914/914 unit tests, `openspec validate --all --strict` green; the single wired Recipe's end-to-end path is proven by `pick-cast.test.ts`'s migrated-ledger suite + `log-post.test.ts`'s full produced→posted flow, both using the real `"character-explainer-with-cast"` slug throughout |

### Fakes / fixtures used

- **The Magnific fake is explicitly flagged: this slice does NOT touch it in any load-bearing way.**
  No test added or changed in this slice constructs a `FakeSpace`/`SpaceMcpPort`, calls
  `spaces_*`/`creations_*`, or drives the Space driver — confirmed by `grep -rn "spaces_\|creations_"`
  across every touched file, which finds only the pre-existing docstring vocabulary in
  `fake-space.ts` (unchanged by this slice's edits beyond removing the dead `FakeSpaceSession` seam).
  This slice is queue/orchestration/report plumbing over plain files — no Space interaction at all.
- Plain-file fixtures throughout: temp `ledger.json`/`queue.json` files via `mkdtemp` (Node's
  `node:fs/promises`), matching every pre-existing test pattern in this codebase.
- The real `data/brands/mundotip/ideas/2026-W22/idea-01.md` fixture (already existed) is read by one
  `production-spec/store.test.ts` scenario to confirm the Recipe-segmented path still matches the real
  tree convention — read-only, unchanged.
- No credits spent, no board mutation, no network, in any test this slice adds or changes.

### Self-review notes

- Deleted `src/production-queue/worker.ts` + `worker.test.ts` (≈1,090 lines) rather than patching
  them to a schema they never needed to model correctly — see "What changed" above for the reasoning.
  Trimmed the now-dead `FakeSpaceSession`/`CoreOpResult`/related imports out of
  `space-driver/fixtures/fake-space.ts`, leaving the driver-facing fake untouched.
- Removed `ledger.ts`'s `LedgerAsset` type and the `LedgerCastCandidate` re-export — both existed
  ONLY for `worker.ts`'s compatibility (documented as such in their own docstrings) and became dead
  the moment `worker.ts` was deleted. Removed the matching `ledger.test.ts` "legacy re-exports" describe
  block.
- Fixed two stale docstring references while touching these files: `pick-cast.ts`'s top comment still
  said "the unattended Phase-B render… is the deferred worker slice" (pre-dated the attended-Producer
  restoration, PR #46) and its `enqueueRender`/ADR-0004 prose; `ledger.ts`'s `writeIdeaRecipeSelection`
  said it "mirrors `writeIdeaCast`'s shape" — `writeIdeaCast` was removed in issue #55. Both corrected
  for accuracy while in the neighborhood; neither changes behavior.
- Kept `scheduler.ts`'s full transition API (`markRunning`/`markDone`/`markFailed`/`nextReady`/
  `requeueFailed`) even though only `markPickConsumed` has a live caller today (`/pick-cast`) — these
  are the reusable FIFO/single-lock primitives issue #57's generic driver will need directly; deleting
  them would just mean re-deriving the same pure module next slice. Documented this reasoning in the
  proposal's Non-Goals so it doesn't read as scope creep.
- Considered adding a `<recipe>` argument to `/pick-cast` for full symmetry with `/log-post`, but the
  issue explicitly scopes `/pick-cast` as staying Cast-only (its own doc's pre-existing "Target" note:
  generalizing to any Recipe's pick-gate is issue #57). Instead I made it detect and refuse ambiguity
  (multiple Assets gated at once) rather than silently picking one — the "never infer" principle holds
  without expanding this slice's command-surface scope.

### Known limits

- **`/track-performance` has no compiled TS command** (unchanged by this slice — it was already
  markdown/agent-driven before). Its doc is updated to describe the correct per-Asset,
  single-Channel-baseline behavior, but there is no new automated test proving the *documented*
  conversational flow beyond what `AssetStore.writeAsset`/`log-post.test.ts` already cover for the
  underlying write mechanism.
- **`producer.md` (the content agent doc) is deliberately untouched** and now describes a stale queue
  job schema (`idea_id`, `brand`, `phase` (`cast`|`render`), `status` including `awaiting_cast`) —
  this is explicitly issue #59's scope ("rewrite … `producer.md` from the current single-recipe
  narrative to the live multi-format flow"). Flagging it here so it isn't mistaken for an oversight.
- **`src/commands/report.docs-test.ts` has one pre-existing failing assertion** (`pick-cast.md` no
  longer cites audit finding C2 as literal text) — confirmed via `git stash` that this failure
  **pre-dates this slice** (present on `main` before any of this slice's changes). It's a
  `*.docs-test.ts` file, outside `npm test`'s glob, and the same class of staleness `producer-agent.
  docs-test.ts` has (both are issue #59's "fix the stale docs-test" scope). Not touched.
- **The multi-Recipe queue guarantees are proven at the queue/orchestration layer with synthetic
  Recipe slugs** (e.g. `"carousel"`), not with two real *wired* Recipes end-to-end — only one Recipe
  is wired in the registry today (issue #60 adds a second). Queue-level identity/dedup is
  registry-independent by design, so this is a faithful proof of the mechanism; a true second-Recipe
  end-to-end render is out of this slice's scope by the issue's own text.
- **`/pick-cast`'s ambiguity refusal (two Assets gated at once) can only be reached today via a
  hand-edited ledger** — with one wired Recipe, production can never naturally produce two
  simultaneously-gated Assets for one Idea. The refusal path is real, tested code, just not yet
  reachable through the live single-recipe flow.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`):
  **914/914 tests green, 0 failures**, type-check clean.
- `npm run build` (`tsc -p tsconfig.build.json`): clean, no errors.
- `npx openspec validate issue-56-recipe-aware-queue --strict`: **valid**.
- `npx openspec validate --all --strict`: **16/16 items passed**, nothing else broken.
- `npm run test:docs` (`node --import tsx --test "src/**/*.docs-test.ts"`): **20/23 pass, 3 fail**.
  All three failures are the pre-existing "audit C2 wiring honesty" staleness
  (`pick-cast.md`/`run-pipeline.md`/`producer.md` no longer say the unattended-render runtime is
  unwired, because ADR-0008 restored the attended Producer and these docs were never flipped back —
  owned by issue #59). **Verified by checking out `main` (commit `ff419ca`, this slice's parent) in a
  scratch worktree and running the identical `npm run test:docs`: same 3 failing subtest names, same
  20/23 pass, byte-identical failure set.** Not introduced or worsened by this slice.
  - Note for the record: the orchestrator's brief described this as "ONE failing subtest"
    (`report.docs-test.ts` → the pick-cast.md C2 string). In fact there are **three** failing subtests
    across two files (`report.docs-test.ts`'s pick-cast.md check, `run-pipeline.docs-test.ts`'s C2
    check, and `producer-agent.docs-test.ts`'s C2 check) — but all three are confirmed pre-existing and
    identical on `main`, all belong to the same issue #59 "flip the stale docs-test honesty strings"
    scope, and none is new or made worse by #56. Per the orchestrator's instruction this does not fail
    the slice, but flagging the discrepancy for accuracy.
- `npm test`'s glob deliberately excludes `*.docs-test.ts` (confirmed: `"src/**/*.test.ts"`), so the
  914/914 green bar is unaffected by the above.

### Per-criterion results (issue #56 acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Queue lock/job re-keyed `(brand, idea, recipe)`; `enqueueOnAccept` enqueues one job per chosen Recipe; a second Recipe is NOT dropped as a duplicate | **PASS** | `queue.ts`'s `isJob`/`hasJobFor`/`hasJobAtGate`/`enqueue`/`enqueueNextLeg` all key on the composite triple (read in full); `queue.test.ts:96` "a SECOND Recipe on the SAME (brand, idea) is NOT dropped as a duplicate (issue #56 AC1)" passes; `enqueue-on-accept.ts`'s `planEnqueue` loops `recipes` and calls `enqueue()` once per recipe; `enqueue-on-accept.test.ts:42/56` prove the multi-recipe enqueue and the different-recipe-does-not-block cases, both pass |
| 2 | `phase` cast/render + `awaiting_cast` become a generic gate cursor | **PASS** | `queue.ts`: `JobStatus` is `"queued"\|"running"\|"awaiting_pick"\|"done"\|"failed"`; `QueueJob.gate: string \| null`; `scheduler.ts`'s full `mark*` API keyed on the triple, all tests green (`scheduler.test.ts`, 30+ scenarios) |
| 3 | `/log-post <brand> <idea> <recipe> <url>` writes onto the named Asset; refuses (and lists the Assets) if the recipe isn't one of the Idea's produced Assets — never infers | **PASS** | `log-post.ts`'s `planLogPost` matches `recipe` exactly via `findAsset`, refuses with `unknown-recipe` + full Asset list otherwise (never defaults to "the only Asset"); `log-post.test.ts` — "REFUSES when the recipe does not name one of the Idea's Assets", "even with EXACTLY ONE Asset… still refuses", "REFUSES and lists the Idea's Assets… writes nothing" (byte-identical ledger before/after, asserted) — all pass |
| 4 | `/track-performance`, `/report`, `/queue`, `/pick-cast` operate per-Asset; exactly one Channel baseline; Fit(Idea) vs best Post kept as explicit 1:N | **PASS** (4d honest partial) | `/queue`: `format.ts`'s `formatQueue` shows one line per job (per (brand,idea,recipe)); `format.test.ts` "a second Recipe of the same Idea shows as a distinct line" passes. `/pick-cast`: `pick-cast.ts`'s `assetsAtCastGate`/`findGateCandidateAsset` resolve the gated Asset's own recipe, refuse on ambiguity; `pick-cast.test.ts` "refuses (and names both Recipes) when TWO Assets are paused at the Cast gate" passes. `/report`: `ledger.ts`'s `loadReport`/`ReportIdea.assets`/`best_performance_score`, single `ReportBaseline.updated_at`; `ledger.test.ts` "preserves the single Channel baseline unchanged (never per-Recipe)" and `report.test.ts` "shows exactly ONE baseline line regardless of how many Recipes/Assets exist" both pass. `/track-performance`: **no compiled TS command exists** (true before this slice too) — doc-only update, honestly flagged as a Known Limit by the developer; the underlying per-Asset write path (`AssetStore.writeAsset`) it depends on is exercised by `log-post.test.ts` and pre-existing `asset/store.test.ts`. This is a faithful, non-regressive treatment of an already-conversational command, not a gap introduced by this slice |
| 5 | Production-Spec save path is Recipe-segmented | **PASS** | `production-spec/store.ts`'s `specPathFor(ideaId, run, ideasRoot, recipe)` builds `idea-NN.<recipe>.spec.json`; `store.test.ts` "segments by Recipe — two Recipes of the same Idea get DIFFERENT paths" and "two Recipes of one Idea each save to their own file — the second does not overwrite the first" both pass |
| 6 | Built test-first against the fake; single-recipe path green; strict validate + suite green | **PASS** | 914/914 green, `openspec validate --all --strict` green (16/16); single wired-Recipe end-to-end path proven by `pick-cast.test.ts`'s migrated-ledger suite + `log-post.test.ts`'s full produced→posted flow, both against the real `"character-explainer-with-cast"` slug |

### Per-scenario results (spec deltas → issue #56)

**`production-queue` (ADDED/MODIFIED requirements):**
- "A second Recipe on the same accepted Idea is NOT dropped as a duplicate" → PASS (`queue.test.ts:96`)
- "The same (brand, idea, recipe) triple enqueued twice is idempotent" → PASS (`queue.test.ts` no-dup test)
- "A different Brand's identical (idea, recipe) pair is not masked (C6)" → PASS (`queue.test.ts` C6 test)
- "Two chosen Recipes enqueue two jobs, each resolving its own first gate" → PASS (`enqueue-on-accept.test.ts:42`)
- "An unwired Recipe slug is skipped, never fabricating a gate" → PASS (`enqueue-on-accept.test.ts`, unwired-recipe scenario)
- "A rejected or unknown Idea enqueues nothing for any requested Recipe" → PASS (`enqueue-on-accept.test.ts`)
- "The seeded one-gate Recipe's next leg targets the final (gate: null) leg" → PASS (`pick-cast.test.ts` migrated-ledger suite)
- "enqueueNextLeg carries the Operator's resolved pick onto the next leg" → PASS (`queue.test.ts` enqueueNextLeg suite)
- "Enqueued job carries the documented shape including brand and recipe" → PASS (`queue.test.ts`)
- "A missing queue file loads as the empty queue" → PASS (`store.test.ts`)
- "Queue listing shows each job's Brand, Recipe, gate cursor, and status" / "Two Recipes of one Idea show as two distinct lines" → PASS (`format.test.ts:79`)
- "A job paused at its gate does not hold the Space" → PASS (`scheduler.test.ts:91` "gate does not hold the Space")
- "mark transitions keyed on the composite triple" incl. "never touches a sibling Recipe's job" and "keyed across Brands too (C6)" → PASS (`scheduler.test.ts:238,326`)
- "Picking a Cast enqueues the next leg" → PASS (`pick-cast.test.ts`)
- "A failed job is isolated and /queue reflects every status" → PASS (`scheduler.test.ts` markFailed suite, `format.test.ts`)
- "parseJob validates brand + recipe + gate and defensively drops malformed jobs" → PASS (`store.test.ts`)
- REMOVED requirements (dead-worker requirement removal) → confirmed: no test anywhere still exercises the removed worker-orchestration requirements; `worker.ts`/`worker.test.ts` are deleted and nothing imports them (grep clean)

**`post-attribution` (ADDED):**
- "A recipe matching no Asset refuses and lists the Idea's actual Assets" → PASS (`log-post.test.ts`)
- "Even with exactly one Asset, a mismatched recipe still refuses" → PASS (`log-post.test.ts`)
- "With two Assets, the Post lands on exactly the named Recipe's Asset" → PASS (`log-post.test.ts` "with TWO Assets, writes onto ONLY the named Recipe's Asset")
- "A produced Asset advances to posted" / "not-yet-produced refuses" / "non-facebook.com URL refused" / "re-logging never regresses status" → PASS (all in `log-post.test.ts`)
- "/log-post is Brand-explicit and writes only through AssetStore" incl. refusal-never-touches-ledger and cross-Brand isolation → PASS (`log-post.test.ts` brand-routing describe block)

**`cast-render` (MODIFIED):**
- "pick-cast selects the nth Cast member from the Recipe's Asset" → PASS
- "pick-cast reports out-of-range/unknown without crashing" → PASS
- "pick-cast refuses when no Asset is paused at the Cast gate, naming the roll-up" → PASS
- "pick-cast refuses — never guesses — when TWO Assets are gated at once" → PASS (`pick-cast.test.ts:242` "refuses (and names both Recipes) when TWO Assets are paused at the Cast gate at once")
- "pick-cast works against a legacy, not-yet-migrated ledger record" → PASS

**`report-surface` (MODIFIED):**
- "Ideas rolled up to in_production/produced listed" → PASS
- "Un-migrated ledger's legacy casting Idea still appears" → PASS
- "Fit Score and best-of-N Performance summary kept distinct" → PASS
- "With two measured Assets, summary shows the BEST score, labelled 1:N" → PASS (`ledger.test.ts:444`, `report.test.ts:108`)
- "A measured score is shown relative to the ONE Channel baseline" → PASS (`report.test.ts:130`)
- "Rendering the report changes no state" → PASS
- "A Post is linked only via the logged URL, attributed to its own Recipe" → PASS
- "Two Recipes of one Idea each show their own Post, never collapsed" → PASS
- "An empty ledger renders a note, not a crash" → PASS

**`production-spec` (MODIFIED):**
- "Composing an accepted Idea writes a valid, Recipe-segmented Spec" → PASS
- "Two Recipes of one Idea each get their own Spec file" → PASS (`store.test.ts`)
- "A failing Spec is refused, not written" → PASS

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish (rule #1 / ADR-0002) | **PASS** | `/log-post` only records a URL the Operator already published (`isFacebookPermalink` validates a link, never posts); no code path in this slice's diff calls a publish API. `log-post.ts`'s own docstring: "it never touches the Space and never publishes anything itself." |
| Public-metrics-only (rule #2) | **PASS / not touched** | No Apify or metrics-scraping code is touched by this slice; `/track-performance`'s doc explicitly reiterates public-metrics-only and single-baseline scoring |
| Relative-not-absolute (rule #4) | **PASS** | Exactly one `ReportBaseline`/`ReportData.baseline` (one `updated_at`) at the report level — grepped `ledger.ts`/`report.ts` for "baseline"; every hit refers to the single Channel baseline, none per-Recipe. `ledger.test.ts` "preserves the single Channel baseline unchanged (never per-Recipe)" and `report.test.ts` "shows exactly ONE baseline line regardless of how many Recipes/Assets exist" both pass |
| Explicit-attribution (rule #5) | **PASS** | `/log-post` requires `<recipe>` and matches it exactly via `findAsset`, refusing (never guessing/defaulting) on any mismatch — even with exactly one Asset (`log-post.test.ts`, multiple scenarios, all pass). `/pick-cast` refuses rather than guessing when two Assets are gated at once (`pick-cast.test.ts:242`, passes) |
| Ledger-as-source-of-truth (rule #7) | **PASS** | All writes route through `AssetStore.writeAsset` (`log-post.ts`) or `saveQueue`'s atomic writer (`pick-cast.ts`, `enqueue-on-accept.ts`); `log-post.test.ts` proves a refused write leaves the ledger file byte-identical, and a write onto one Recipe's Asset leaves a sibling Recipe's Asset untouched |
| Concurrency stays serial (ADR-0008, criterion 6) | **PASS** | `scheduler.ts`'s `spaceBusy()` scans ALL jobs queue-wide (`state.lock.active_job !== null \|\| state.jobs.some(j => j.status === "running")`) — global across every Brand/Recipe, not per-recipe; unchanged in spirit from before the re-key, only the lock's ref shape gained `recipe`. `scheduler.test.ts:72` "nextReady — single-Space lock (≤1 running)" passes |
| Magnific fake (hermetic build) | **PASS** | `grep -rn "spaces_\|creations_"` across the full diff (`git diff ff419ca 994e9b5`) finds matches ONLY inside comments/docstrings of unrelated/deleted files (`worker.ts`, `fake-space.ts` docstrings) — zero live calls in any new or changed test or production code. `driver.test.ts` + `live/contract.test.ts` (the hermetic Space-driver suite that depends on the untouched `FakeSpace`/`SpaceMcpPort` fake) both still pass in full (41/41) after the `fake-space.ts` trim |

### worker.ts deletion / fake-space.ts trim — verified safe

- **(a) `worker.ts` was genuinely dead.** `git grep` on the parent commit (`ff419ca`) for
  `production-queue/worker` outside `worker.ts`/`worker.test.ts` themselves finds only docstring
  mentions (in `asset.ts`, `ledger.ts`, `fake-space.ts`) — no command or live code path imports it.
  Deletion is safe and removes no reachable behavior.
- **(b) The `fake-space.ts` trim did not weaken the hermetic fake.** Diffed `ff419ca` → `994e9b5`:
  only `FakeSpaceSession` (+ its `CoreOpResult` type and imports of `composeAndCast`/`pickAndRender`/
  `SpaceSession`/`SpaceOpResult`/`CastOpOutcome`/`RenderOpOutcome`/`validSpec`) were removed — all of
  which were used exclusively by `worker.test.ts` (confirmed via `git grep FakeSpaceSession` on the
  parent commit: only `worker.test.ts` and `fake-space.ts` itself reference it). `FakeSpace`,
  `FakeSpaceWithAgentFallbackCast`, `fakeSpaceState`, node-name constants, `expectedCastUrls`, etc. are
  byte-identical/untouched. `driver.test.ts` and `live/contract.test.ts` (15 suites, 41 tests) — the
  tests that actually exercise the driver-facing fake — pass in full.
- **(c) No dangling imports.** `grep -rn "production-queue/worker" src .claude` and
  `grep -rln "FakeSpaceSession"` across the current tree both return empty.

### Defect list

None. No defects found.

**PASS** — Round 1 clears on the full suite, every acceptance criterion, every spec-delta scenario, the
always-rules, and the Magnific-fake/hermeticity check. Ready to proceed to PR.

---

## Build Report — Round 2 (spec-fold fix)

QA's code Round-1 pass stands (no defects, no code changes made here — this round touches only
`openspec/changes/issue-56-recipe-aware-queue/specs/production-queue/spec.md`). The coordinator
reported that `openspec archive issue-56-recipe-aware-queue` failed to fold the deltas:

```
production-queue MODIFIED failed for header "### Requirement: Queue listing shows each job's Brand, Recipe, gate cursor, and status" - not found
```

### Root cause

`openspec validate --strict` only checks a change's internal structure (every requirement has a
scenario, etc.) — it never resolves delta headers against the CURRENT base specs, so it can't catch a
MODIFIED section whose header doesn't exist in `openspec/specs/<capability>/spec.md`. Only `archive`
does that resolution (confirmed by reading `node_modules/@fission-ai/openspec/dist/core/specs-apply.js`
directly). Its algorithm applies delta operations in order **RENAMED → REMOVED → MODIFIED → ADDED**,
and it enforces (via a pre-validation pass) that when a requirement's header text changes, the change
MUST declare it under `## RENAMED Requirements` (`FROM:` the exact base header, `TO:` the new one) —
the `## MODIFIED Requirements` block must then use the **TO** (post-rename) header, never the original.
`normalizeRequirementName` is a plain `.trim()` — matching is exact (case, punctuation, everything)
past leading/trailing whitespace.

Auditing every header in `specs/production-queue/spec.md` against the base
(`openspec/specs/production-queue/spec.md`) found **two** MODIFIED headers whose title text I had
changed without a matching `RENAMED` entry:

- `Queue listing shows each job` → I'd written the MODIFIED block under the NEW title
  (`"...Brand, Recipe, gate cursor, and status"`) with no `RENAMED` pairing.
- `mark transitions move a job through its lifecycle and maintain the lock` → same problem (I'd
  appended `", keyed on the composite triple"` to the title with no `RENAMED` pairing).

The other four renamed requirements in that file (`A job paused at the Cast gate…`, `Picking a Cast
enqueues the render…`, `A failed job is isolated and surfaced…`, `parseJob validates the brand
field…`) already had correct `RENAMED` entries and were not the cause.

**A second, related gap** surfaced during the audit (not reported by the coordinator, found while
verifying): the base spec's `### Requirement: Accepting an Idea enqueues a cast-phase job` (still
describing `phase: cast` and "idempotent per `idea_id`") was **never referenced** by my delta at all —
neither MODIFIED, REMOVED, nor RENAMED. Left alone, folding would have carried this stale, now-FALSE
requirement (jobs no longer have a `phase` field; `enqueueOnAccept` enqueues one job PER CHOSEN RECIPE,
not one per Idea) straight into the archived `openspec/specs/production-queue/spec.md`, self-
contradicting the new "Job identity is keyed on the composite (brand, idea, recipe)" and
"enqueueOnAccept enqueues one job per chosen Recipe…" requirements this same slice adds. Since this
would leave the archived spec internally inconsistent — not just a mechanical header-resolution
failure — I added it to `## REMOVED Requirements` (with Reason/Migration pointing at the two ADDED
requirements that supersede it) rather than leaving it untouched.

### Fix applied

In `openspec/changes/issue-56-recipe-aware-queue/specs/production-queue/spec.md`:

1. Added the two missing `RENAMED` pairs:
   - `FROM: Queue listing shows each job` → `TO: Queue listing shows each job's Brand, Recipe, gate cursor, and status`
   - `FROM: mark transitions move a job through its lifecycle and maintain the lock` → `TO: mark transitions move a job through its lifecycle and maintain the lock, keyed on the composite triple`
2. Added `### Requirement: Accepting an Idea enqueues a cast-phase job` to `## REMOVED Requirements`,
   with Reason (superseded by the composite re-key; keeping it would self-contradict the new ADDED
   requirements) and Migration (points to "Job identity is keyed on the composite (brand, idea,
   recipe)…" and "enqueueOnAccept enqueues one job per chosen Recipe…").

No other delta file (`cast-render`, `post-attribution`, `production-spec`, `report-surface`) had this
problem — each was audited the same way (see Verification below) and needed no change.

### Verification (no code touched; `archive` itself never invoked)

- `npx openspec validate issue-56-recipe-aware-queue --strict` → **valid**.
- `npx openspec validate --all --strict` → **16/16 passed**, nothing else broken.
- **A read-only "dry fold" check**, written for this round, that imports OpenSpec's own
  `findSpecUpdates`/`buildUpdatedSpec` (the exact pure functions `archive` calls internally — read the
  base spec, resolve every ADDED/MODIFIED/REMOVED/RENAMED header, build the rebuilt content **in
  memory**, never write to disk) plus `Validator.validateSpecContent` on the rebuilt output (the same
  validation pass `archive` runs before writing). This exercises the IDENTICAL header-resolution logic
  `archive` uses, with zero file writes and without invoking the `archive` CLI command at all — kept in
  the session scratchpad, not committed. Result, all five capability deltas:

  ```
  OK  cast-render:       +0 ~1 -0 ->0  (rebuilt content passes spec validation)
  OK  post-attribution:  +3 ~0 -0 ->0  (rebuilt content passes spec validation)
  OK  production-queue:  +3 ~7 -8 ->6  (rebuilt content passes spec validation)
  OK  production-spec:   +0 ~1 -0 ->1  (rebuilt content passes spec validation)
  OK  report-surface:    +0 ~2 -0 ->2  (rebuilt content passes spec validation)
  ```

  (`+`/`~`/`-`/`->` = ADDED/MODIFIED/REMOVED/RENAMED counts successfully resolved and folded for that
  capability.) This confirms every MODIFIED/REMOVED/RENAMED header across all five delta files now
  resolves cleanly against the current base specs, and the resulting merged spec content is itself
  well-formed — the exact two checks `archive` performs before it writes anything.
- `git status` after this round: only `openspec/changes/issue-56-recipe-aware-queue/{handoff.md,
  specs/production-queue/spec.md}` are modified; `openspec/specs/**` (the base specs) are byte-for-byte
  untouched — the change is left **un-archived**, ready for the coordinator to run `openspec archive`.
- `npm test` → **914/914 green**, unchanged from Round 1 (no product code was touched this round).

The change is now ready for `openspec archive issue-56-recipe-aware-queue` to be run by the
coordinator.
