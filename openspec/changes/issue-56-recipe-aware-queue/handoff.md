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
