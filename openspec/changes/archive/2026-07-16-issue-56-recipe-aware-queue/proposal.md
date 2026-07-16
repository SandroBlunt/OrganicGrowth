## Why

ADR-0009 lets the Operator choose **1..N Recipes per Idea** at Review; ADR-0011 (issue #55, merged)
already moved production state onto a per-Recipe **Asset**. But the Production Queue itself, and the
commands that drive it, are still keyed on the OLD `(brand, idea_id)` pair with a hard-coded two-phase
`cast`/`render` split. With two Recipes chosen for one Idea, today's queue would enqueue the SECOND
Recipe's job, find a LIVE job already exists for `(brand, idea_id)` (the first Recipe's), and silently
drop it as a "duplicate" — one Recipe's production would vanish. `/log-post` has the matching gap:
there is no compiled command at all, and ADR-0011 anticipates `(Idea, Recipe)`-keyed attribution that
does not exist yet. This is the re-grain issue #55's own proposal named as the very next slice.

## What Changes

- **Re-key the Production Queue's job/lock identity from `(brand, idea_id)` to
  `(brand, idea_id, recipe)`** (`src/production-queue/queue.ts`). `QueueJob` gains a required
  `recipe` field. `enqueue`/`enqueueNextLeg`/`hasJobFor`/`hasJobAtGate` all key on the composite
  triple, so a second Recipe's job for the same Idea is never masked or dropped by the first's.
- **The `phase` (`cast`/`render`) + `awaiting_cast` status become a GENERIC gate cursor.** `QueueJob`
  gains `gate: string | null` — the gate name a leg's Space run works toward, or `null` for the FINAL
  leg (renders the Asset, no further gate). `JobStatus` renames `awaiting_cast` → `awaiting_pick`.
  `enqueue(state, ideaId, now, brand, recipe, gate)` starts a leg; `enqueueNextLeg(state, ideaId, now,
  brand, recipe, nextGate, pick)` — generalizing the old `character` field to `pick` — enqueues the
  leg after a gate's pick resolves. `scheduler.ts`'s pure transitions (`markRunning`,
  `markAwaitingPick`, `markPickConsumed` — generalizing `markCastConsumed`, `markDone`, `markFailed`,
  `requeueFailed`, `nextReady`) all key on `(brand, idea_id, recipe)`.
- **`enqueueOnAccept` takes the chosen Recipe set explicitly** and enqueues ONE job per
  `(brand, idea, recipe)`, resolving each Recipe's first gate from the Recipe registry
  (`src/production-queue/enqueue-on-accept.ts`). An unwired Recipe slug is defensively skipped, never
  fabricating a gate. `.claude/commands/review-ideas.md`'s accept step now passes `chosen` (the
  Operator's resolved Recipe selection, issue #54) instead of the old Recipe-unaware call.
- **`/pick-cast` re-grains onto the composite key.** It resolves the RESOLVED Asset's own Recipe and
  stamps it (and the registry-derived next gate) onto the enqueued next-leg job. It REFUSES — rather
  than guessing — when more than one of an Idea's Assets is paused at the Cast gate simultaneously
  (explicit attribution, always-rules #5). `/pick-cast` itself stays Cast-only scoped (generalizing to
  any Recipe's own pick-gate is issue #57).
- **`/log-post` is built as a real, tested command** (`src/commands/log-post.ts` — there was no
  compiled command before this slice) with a REQUIRED `<recipe>` argument:
  `/log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]`. It matches `<recipe>` EXACTLY
  against the Idea's recorded Assets (`findAsset`) and REFUSES — listing the Idea's actual Assets — when
  no match exists, even when the Idea happens to have exactly one Asset. It never infers. On success it
  writes `post_url`/`posted_at` (and advances `produced → posted`) onto ONLY that Asset via
  `AssetStore.writeAsset`.
- **`/track-performance`, `/report`, `/queue` read/write per-Asset.** `ledger.ts`'s `loadReport`
  re-scopes `ReportIdea` to carry a per-Recipe `assets` breakdown (`recipe`, `status`,
  `performance_score`, `post_url`) plus `best_performance_score` — the BEST measured score among an
  Idea's Assets, kept as an EXPLICIT 1:N summary against the one per-Idea `fit_score`, never a 1:1
  judgement of a single Post (ADR-0011 "Fit vs Performance"). `/report`'s renderer adds a "Posts" section
  listing every `(Idea, Recipe)` with a logged Post. Exactly ONE Channel baseline is preserved
  (`ReportBaseline`, unchanged) — never a per-Recipe baseline.
- **The Production-Spec save path gains a Recipe segment**: `specPathFor(ideaId, run, ideasRoot,
  recipe)` now writes `idea-NN.<recipe>.spec.json` (was `idea-NN.spec.json`), so two Recipes of one
  Idea never overwrite each other's Spec. `composeSpec`'s options gain a required `recipe`.
- **Concurrency stays serial (ADR-0008)** — one attended Space generation at a time; the pure
  single-active-run lock (now a composite triple) is unchanged in spirit, just re-keyed.
- **The dead ADR-0004 background worker (`src/production-queue/worker.ts` + its test) is DELETED.**
  It was never wired to any live command (confirmed in issue #55's own QA pass) and is explicitly
  slated for deletion in issue #59 ("delete the abandoned background-worker code"). Re-keying the
  queue's job shape it depended on made it either dead-and-broken or dead-and-artificially-patched;
  deleting it is the smaller, correct move — it narrows (not completes) issue #59's remaining scope,
  which stays focused on the docs flip and `producer-agent.docs-test.ts`. The worker-only seam in the
  Magnific fake (`FakeSpaceSession` in `src/space-driver/fixtures/fake-space.ts`) is removed with it;
  the REST of that fake (`FakeSpace`, the driver-facing `SpaceMcpPort` implementation every other
  hermetic Space-driver test depends on) is untouched.
- **`ledger.ts`'s `loadIdeas` carries an Idea's `recipes` (issue #54's recorded selection) through
  read-only**, so `/run-pipeline`'s stranded-Idea re-enqueue can re-enqueue the SAME Recipes an Idea
  was originally accepted with (falling back to the one wired Recipe for an Idea accepted before
  Recipe selection existed — every real Idea today).

## Non-Goals (explicitly deferred)

- **A generic, multi-Recipe pick UX.** `/pick-cast` stays Cast-only-gate scoped; generalizing "submit
  a pick" to any Recipe's own gate name is issue #57's run-until-gate driver.
- **Per-Recipe Copy composed outside the Space.** Issue #58.
- **Flipping CLAUDE.md/producer.md to present tense and deleting `scheduler.ts` too.** Issue #59 — its
  remaining scope after this slice is exactly the docs flip and the stale
  `producer-agent.docs-test.ts` fix. `scheduler.ts`'s pure transitions are NOT deleted here: unlike
  `worker.ts` (a full, unwired orchestration shell), `scheduler.ts` is a reusable, gate-cursor-based
  pure module that `/pick-cast` actively depends on today (`markPickConsumed`) and that issue #57's
  driver will build on directly.
- **A second real wired Recipe.** Issue #60. This slice's multi-Recipe guarantees are proven at the
  queue/orchestration layer with synthetic Recipe slugs (queue identity does not depend on registry
  wiring); the single wired Recipe's end-to-end path is what stays exercised and green.

## Capabilities

### New Capabilities

- `post-attribution`: `/log-post`'s (Idea, Recipe)-keyed, never-inferred Post attribution — the pure
  decision (`planLogPost`, `isFacebookPermalink`) and the orchestration shell that writes onto exactly
  one Asset via `AssetStore`.

### Modified Capabilities

- `production-queue`: job/lock identity re-keyed `(brand, idea, recipe)`; the `phase`/`awaiting_cast`
  model becomes a generic gate cursor; `enqueueOnAccept` takes the chosen Recipe set; the dead
  background-worker requirements (drain-on-trigger, periodic tick, permission allowlist, worker-owned
  ledger writes) are removed as they described code this slice deletes.
- `cast-render`: `/pick-cast` resolves and stamps the Asset's own Recipe onto the queue, refuses on
  gate ambiguity across Recipes, and enqueues the generic next leg instead of a hard-coded render job.
- `report-surface`: the production-state summary and read-only/attribution requirements re-scope to
  the per-Recipe Asset breakdown and the explicit best-of-N Performance summary.
- `production-spec`: the persisted Spec path gains a Recipe segment.

## Impact

- **New code:** `src/commands/log-post.ts` (+`log-post.test.ts`).
- **Re-keyed:** `src/production-queue/queue.ts`, `scheduler.ts`, `store.ts`, `format.ts`,
  `enqueue-on-accept.ts` (all + their tests).
- **Modified:** `src/commands/pick-cast.ts`, `src/commands/report.ts`, `src/commands/run-pipeline.ts`
  (stranded-Idea re-enqueue passes recipes), `src/ledger/ledger.ts` (`loadIdeas` carries `recipes`;
  `loadReport` re-scoped; dead worker-compat re-exports removed), `src/production-spec/store.ts` +
  `compose.ts` (Recipe-segmented path), `src/phase-resolver/resolve.test.ts` (fixture field rename
  only — `resolve.ts` itself is untouched, `isLiveJob`/`idea_id` do not depend on `phase`/`recipe`).
- **Deleted:** `src/production-queue/worker.ts` + `worker.test.ts`; the `FakeSpaceSession` seam in
  `src/space-driver/fixtures/fake-space.ts` (the rest of that fake is untouched).
- **Docs:** `.claude/commands/queue.md`, `pick-cast.md`, `log-post.md`, `track-performance.md`,
  `report.md`, `review-ideas.md` updated to the live behavior; `producer.md`/`CLAUDE.md` are
  deliberately NOT touched (issue #59's scope).
- **Hermetic:** no code or test this slice adds/changes touches `spaces_*`/`creations_*` or constructs
  a live Space client — the pre-existing `FakeSpace`/`SpaceMcpPort` fake (driver-facing) is untouched;
  every new/changed test in this slice exercises pure logic or plain-file I/O only.
- **Always-rules upheld:** explicit-attribution is the load-bearing rule this slice implements for
  `/log-post` (keyed `(Idea, Recipe)`, refuses rather than infers) and for `/pick-cast` (refuses on
  gate ambiguity); relative-not-absolute holds — exactly one Channel baseline, never per-Recipe;
  generate-never-publish/public-metrics-only are unaffected (no publish or metrics-scraping code
  touched); ledger-as-source-of-truth holds — every write goes through `AssetStore.writeAsset`'s thin
  shell, which preserves every sibling Asset/Idea untouched.
