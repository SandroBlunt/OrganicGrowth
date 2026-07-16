## 1. Re-key the Production Queue's pure deep module (test-first)

- [x] 1.1 Write failing tests (`production-queue/queue.test.ts`): `QueueJob` carries `recipe` +
  generic `gate` (string | null); `enqueue`/`enqueueNextLeg` key idempotency on
  `(brand, idea_id, recipe)` — a SECOND Recipe's job for the same `(brand, idea)` is NOT dropped as a
  duplicate; `hasJobFor`/`hasJobAtGate` keyed on the composite triple; a gateless first leg
  (`gate: null`) is supported; purity preserved.
- [x] 1.2 Implement `src/production-queue/queue.ts`: `JobStatus` renames `awaiting_cast` →
  `awaiting_pick`; `QueueJob`/`JobRef` gain `recipe`; `enqueue(state, ideaId, now, brand, recipe,
  gate)` replaces the old cast-only `enqueue`; `enqueueNextLeg(state, ideaId, now, brand, recipe,
  nextGate, pick)` replaces `enqueueRender`, generalizing `character` → `pick`.

## 2. Re-key the scheduler's pure transitions (test-first)

- [x] 2.1 Write failing tests (`production-queue/scheduler.test.ts`): every `mark*` transition
  (`markRunning`, `markAwaitingPick`, `markPickConsumed`, `markDone`, `markFailed`, `requeueFailed`)
  and `nextReady` keyed on `(brand, idea_id, recipe)`; two Recipes of one Idea (or two Brands of one
  Idea id) never cross-contaminate a transition; `markPickConsumed` generalizes `markCastConsumed`.
- [x] 2.2 Implement `src/production-queue/scheduler.ts`: rename `markAwaitingCast` →
  `markAwaitingPick`, `markCastConsumed` → `markPickConsumed`; every function signature gains
  `recipe`.

## 3. Re-key queue persistence + the `/queue` formatter (test-first)

- [x] 3.1 Write failing tests (`production-queue/store.test.ts`, `format.test.ts`): `parseJob`
  requires a non-empty `recipe` (drops + warns otherwise); `gate` parses as a non-empty string or
  `null` (drops + warns on anything else); the lock ref requires `recipe` too; `formatQueue` shows
  `recipe` and the `gate` cursor (`final` label for `null`) instead of `phase`; two Recipes of one
  Idea render as distinct lines.
- [x] 3.2 Implement `src/production-queue/store.ts` (`parseJob`/`parseJobRef`/`parseQueueState`) and
  `format.ts` (`formatQueue`) against the re-keyed shape.

## 4. Recipe-aware `enqueueOnAccept` (test-first)

- [x] 4.1 Write failing tests (`production-queue/enqueue-on-accept.test.ts`): `planEnqueue`/
  `enqueueOnAccept` take a `recipes: readonly string[]` parameter and enqueue ONE job per recipe,
  each resolving its first gate from the Recipe registry; an existing job for a DIFFERENT Recipe of
  the same Idea never blocks enqueuing this one (issue #56 AC1, proven registry-independently by
  seeding the OTHER job via the pure `enqueue()`); an unwired Recipe slug is skipped defensively
  (never fabricates a gate); accepted-only + no-duplicate-per-triple + empty-list-enqueues-nothing all
  hold.
- [x] 4.2 Implement `src/production-queue/enqueue-on-accept.ts`: `planEnqueue`/`enqueueOnAccept` gain
  the `recipes` parameter; per-Recipe `EnqueueOutcome` list; `getRecipe` resolves each Recipe's first
  gate.
- [x] 4.3 Update `.claude/commands/review-ideas.md`'s accept step to call `enqueueOnAccept(ideaId,
  brand, chosen, { ledgerPath })` — passing the Operator's resolved Recipe selection instead of the
  old Recipe-unaware 3-arg call. Update the matching prompt-conformance test
  (`src/recipe/review-docs.test.ts`).
- [x] 4.4 Update `src/commands/run-pipeline.ts`'s stranded-Idea re-enqueue to pass the Idea's own
  recorded `recipes` (falling back to `DEFAULT_ASSET_RECIPE` when absent — every real accepted Idea
  today). Extend `ledger.ts`'s `loadIdeas` to carry `recipes` through read-only (omitted when
  absent/empty, never fabricated).

## 5. Re-grain `/pick-cast` onto the composite key (test-first)

- [x] 5.1 Write failing tests (`commands/pick-cast.test.ts`): the enqueued next-leg job carries the
  RESOLVED Asset's own `recipe` and the registry-derived next gate; a pick REFUSES (naming both
  Recipes) when two Assets are simultaneously paused at the Cast gate; every pre-existing scenario
  (unknown Idea, out-of-range pick, stale re-pick, brand-routing, migrated-ledger) passes against the
  re-keyed queue.
- [x] 5.2 Implement `src/commands/pick-cast.ts`: `assetsAtCastGate`/`findGateCandidateAsset` split out
  the ambiguity check; `nextGateAfter(recipe, gate)` resolves the Recipe's next gate via
  `getRecipe`; the shell calls `enqueueNextLeg`/`markPickConsumed` with the resolved recipe.

## 6. Build `/log-post` as a real command (test-first — issue #56's other headline requirement)

- [x] 6.1 Write failing tests (`commands/log-post.test.ts`): `isFacebookPermalink` (pure URL
  predicate); `planLogPost` — unknown Idea, invalid URL, unknown recipe (REFUSES and returns every
  one of the Idea's Assets, even when there is exactly one), not-yet-produced Asset, a `produced`
  Asset advances to `posted`, an already `posted`/`tracking`/`scored` Asset never regresses;
  `logPostCommand` — writes onto ONLY the named Recipe's Asset (a sibling Recipe's Asset is
  untouched), a refusal writes nothing (byte-identical ledger), brand-routing, CLI usage-error
  (including "omitting only `<recipe>`" is still a usage error).
- [x] 6.2 Implement `src/commands/log-post.ts`: `isFacebookPermalink`, `planLogPost`,
  `logPostCommand`, `main()`. Add the `log-post` npm script.
- [x] 6.3 Rewrite `.claude/commands/log-post.md` for the required `<recipe>` argument and the
  refuse-and-list-Assets behavior.

## 7. Re-scope `/report`, `/track-performance`, `/queue` docs to per-Asset (test-first for `/report`)

- [x] 7.1 Write failing tests (`ledger/ledger.test.ts`, `commands/report.test.ts`): `loadReport`'s
  `ReportIdea` carries a per-Recipe `assets` breakdown and `best_performance_score` (the BEST among
  them, explicit 1:N); a legacy un-migrated Idea's top-level `post_url`/`performance_score` still
  fold onto its one Asset; exactly one Channel baseline is preserved; `renderReport` shows a
  best-of-N summary column plus a separate per-Recipe "Posts" section, never collapsing two Recipes'
  Posts onto one row.
- [x] 7.2 Implement: `src/ledger/ledger.ts`'s `loadReport`/`ReportIdea`/`ReportAssetRow`; remove the
  dead `LedgerAsset`/`LedgerCastCandidate` re-export section (worker.ts-only compat, now unused).
  `src/commands/report.ts`'s `renderReport` (best-of-N column + Posts section).
- [x] 7.3 Update `.claude/commands/queue.md` (flip the "Target — not built yet" note to present
  tense: recipe/gate cursor), `.claude/commands/pick-cast.md` (queue-field prose; the multi-Recipe
  pick UX note stays deferred to issue #57), and `.claude/commands/track-performance.md` (per-Asset
  selection/write, one Channel baseline).

## 8. Delete the dead ADR-0004 background worker (forced by the re-key; narrows issue #59)

- [x] 8.1 Delete `src/production-queue/worker.ts` and `worker.test.ts` (never wired to any live
  command; explicitly slated for deletion in issue #59).
- [x] 8.2 Trim `src/space-driver/fixtures/fake-space.ts`: remove the `FakeSpaceSession` seam (+ its
  now-unused imports from `worker.ts`/`driver.ts`); the driver-facing `FakeSpace`/`SpaceMcpPort` fake
  every other hermetic Space-driver test depends on is untouched.
- [x] 8.3 Remove `ledger.ts`'s worker-only compat re-exports (`LedgerAsset`, the `LedgerCastCandidate`
  re-export) and the matching `ledger.test.ts` describe block.

## 9. Production-Spec save path gains a Recipe segment (test-first)

- [x] 9.1 Write failing tests (`production-spec/store.test.ts`, `compose.test.ts`): `specPathFor`
  takes a required `recipe` and segments the filename (`idea-NN.<recipe>.spec.json`); two Recipes of
  one Idea resolve to two DIFFERENT paths and can both be saved without collision; `composeSpec`'s
  options require `recipe`.
- [x] 9.2 Implement `src/production-spec/store.ts` (`specPathFor`) and `compose.ts` (`ComposeOptions`,
  `composeSpec`).

## 10. OpenSpec

- [x] 10.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `post-attribution`; MODIFIED
  `production-queue` (re-key + generic gate cursor + dead-worker-requirement removal), `cast-render`
  (`/pick-cast` re-grain), `report-surface` (per-Asset breakdown), `production-spec` (Recipe-segmented
  path).
- [x] 10.2 `npx openspec validate issue-56-recipe-aware-queue --strict` green.

## 11. Self-review

- [x] 11.1 `npm test` green (type-check + full suite); confirm every pre-slice test is either passing
  unchanged or deliberately, faithfully updated for the re-key (never silently weakened).
- [x] 11.2 Simplify / dead-code pass; confirm every issue #56 acceptance criterion maps to a named
  test; confirm no live-Space (`spaces_*`/`creations_*`) call was added.
- [x] 11.3 Write the Build Report into `handoff.md`, explicitly flagging the Magnific fake used, and
  listing known limits (the worker.ts deletion narrowing issue #59; `/pick-cast` staying Cast-only
  scoped; the pre-existing, NOT-introduced-by-this-slice `report.docs-test.ts` staleness that is
  issue #59's to fix).
