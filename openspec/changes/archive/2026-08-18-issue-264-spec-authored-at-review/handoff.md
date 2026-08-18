# Slice Handoff — issue #264: Production Spec authored at Review

One bidirectional doc: `developer` writes the Build Report below, `qa` appends its Verdict beneath it.
Nothing here is ever overwritten; a retry round appends a new `Round-N Build` block.

---

## Build Report (Round 1)

### What changed

Implements ADR-0031 (`docs/adr/0031-production-spec-authored-at-review.md`), the authoritative decision
issue #264 asked for: **the Production Spec is now authored at Review (accept time), synchronously, per
(Idea, Recipe), before a job is ever written to either the file queue or the SQL `job` table.** This
closes the gap #254's own QA found: an accepted Idea reached the unattended SQL job queue, but nothing
in the codebase could author the Spec its own author-phase check requires, so the worker retried three
times and died.

Concretely:

1. **Recipe registry** — every Recipe entry now carries a required `producerSkill: string` field naming
   the Skill that authors its Spec (`produce-character-explainer`, `produce-news-carousel`,
   `produce-news-short-script`) — the same shape as the existing `copySkill` field, replacing the mapping
   that used to live only as prose inside `.claude/agents/producer.md`.
2. **Deterministic Spec authors** — one per wired Recipe (`src/production-spec/generate.ts`'s existing
   `generate` for the character Recipe, new `news-carousel-generate.ts`/`news-short-script-generate.ts`
   for the other two), mirroring `src/copy/draft.ts`'s `CopyDrafter`/`skillDraftCopy` pattern: a
   hermetic, no-model-call stand-in for that Recipe's `producerSkill`, always producing a Spec that
   satisfies that Recipe's own `specShape.validate`.
3. **`authorSpecForRecipe`** (`src/production-spec/author-at-review.ts`) — authors a candidate Spec via
   the Recipe's default author, then self-checks it against the EXISTING `auditAuthorPhase`
   (`src/recipe/phase-contract.ts`) — the SAME function the worker's own author-phase check already
   calls. Returns `{ ok: true, spec, audit }` or `{ ok: false, audit }`, never throws.
4. **Command surface** (`src/command-surface/production-spec.ts`) — `saveAssetSpec` (wraps the SQL-backed
   `saveProductionSpec`, its first production caller) and `refreshSpecFile` (reads the Spec back off SQL
   and writes the human-readable per-Idea file — a GENERATED VIEW, never a second, independently-authored
   copy). Both live inside `src/command-surface/`, so the store-write-boundary guard needed no new
   allow-list entry.
5. **`acceptIdeaCommand`** (`src/commands/accept-idea.ts`) — for each chosen Recipe, authors + self-checks
   its Spec BEFORE either queue is written. A failing Recipe is reported loudly in the returned message
   and dropped from what gets enqueued (in EITHER queue); the ledger still records the Operator's full
   chosen-Recipe decision regardless. Once the SQL sync lands, each newly-enqueued Recipe's authored Spec
   is persisted via `saveAssetSpec` and regenerated as the on-disk file view via `refreshSpecFile`.
6. **`.claude/agents/producer.md`** — the Author phase is rewritten: the Producer reads the Spec Review
   already authored (SQL-backed for a worker-driven job, file-backed for the ordinary attended path) and
   re-runs `auditAuthorPhase` as defense-in-depth only. It never loads a Recipe's `producerSkill` and
   never calls `saveSpec`/`saveProductionSpec` itself. The Copy phase (still the Producer's own craft) is
   unchanged.
7. **`.claude/commands/review-ideas.md`** — documents that accepting now authors + self-checks each
   chosen Recipe's Spec as part of the same `npm run accept-idea` call, and that a failed check is
   relayed to the Operator verbatim, exactly like a SQL sync failure already is.
8. **`src/commands/run-worker.ts` / `src/command-surface/worker.ts`** — left completely untouched, as the
   issue specified. `runOneJob`'s existing author-phase check now always finds a Spec, because one is
   guaranteed before a job reaches the queue.

### Files touched

New:
- `src/production-spec/news-carousel-generate.ts` + `.test.ts`
- `src/production-spec/news-short-script-generate.ts` + `.test.ts`
- `src/production-spec/author-at-review.ts` + `.test.ts`
- `src/command-surface/production-spec.ts` + `.test.ts`
- `src/commands/accept-to-produced-e2e.test.ts` (the end-to-end proof)
- `openspec/changes/issue-264-spec-authored-at-review/` (`proposal.md`, `tasks.md`, `handoff.md`,
  `specs/{recipe-registry,production-spec,command-surface,accept-idea-command,spec-authored-at-review}/spec.md`)

Edited:
- `src/recipe/registry.ts` — `producerSkill` field + values on all three Recipes.
- `src/recipe/registry.test.ts` — `producerSkill` assertions per Recipe + a cross-Recipe distinctness test.
- `src/recipe/fixtures/space-less-recipe.ts` — `producerSkill` added to the throwaway fixture Recipe.
- `src/command-surface/index.ts` — exports `saveAssetSpec`/`refreshSpecFile`.
- `src/commands/accept-idea.ts` — the authoring-before-enqueue + Spec-persistence logic.
- `src/commands/accept-idea.test.ts` — two new describe blocks (successful authoring + regenerated file
  view; forced authorship failure blocking that Recipe).
- `src/producer/carousel-end-to-end.test.ts` — a new describe block proving the attended path against a
  Spec `authorSpecForRecipe` produced (the SAME function `acceptIdeaCommand` calls).
- `.claude/agents/producer.md` — front-matter description, intro paragraph, Author phase section
  rewritten, Drive/Space-less/Copy-phase cross-references fixed, two Guardrails bullets updated.
- `src/production-spec/producer-agent.docs-test.ts` — the "runs the Recipe's own producer Skill" test
  replaced with a "never authors a Production Spec" test matching the rewritten prose.
- `.claude/commands/review-ideas.md` — a new sub-bullet under the accept step + an extension to the
  "relay verbatim" sentence, both added without touching any of `review-docs.test.ts`'s pinned substrings.

### How to run

```bash
npm test              # full suite incl. tsc --noEmit — 4058 tests, 0 fail
npm run test:docs     # documentation-conformance suite — 351 tests, 0 fail
npx openspec validate issue-264-spec-authored-at-review --strict   # "is valid"
```

Run just this slice's own new/changed tests:

```bash
node --import tsx --test \
  src/recipe/registry.test.ts \
  src/production-spec/news-carousel-generate.test.ts \
  src/production-spec/news-short-script-generate.test.ts \
  src/production-spec/author-at-review.test.ts \
  src/command-surface/production-spec.test.ts \
  src/commands/accept-idea.test.ts \
  src/commands/accept-to-produced-e2e.test.ts \
  src/producer/carousel-end-to-end.test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #264 Agent Brief) | Proven by |
|---|---|---|
| 1 | Accepting an Idea + choosing the zero-gate News Carousel Recipe authors that Recipe's Spec synchronously, before the job is enqueued | `src/commands/accept-idea.test.ts` — "persists the authored Spec onto the SQL Asset row..." (asserts the Spec exists on the SQL row and the file view is regenerated once `acceptIdeaCommand` returns, and that `data/queue.json` gained the job); design-level: `acceptIdeaCommand` runs the authoring loop, then filters `enqueueTargets`, BEFORE calling `enqueueOnAccept` at all (`src/commands/accept-idea.ts` lines ~152-194) |
| 2 | A failing self-check blocks that Recipe's accept, is reported to the Operator in-conversation, and no job is enqueued | `src/commands/accept-idea.test.ts` — "a forced banned-word violation in the Idea's title blocks that Recipe's accept, loudly — no job in either queue, no Spec anywhere" (asserts the message names the Recipe + failing check, `data/queue.json` gains 0 jobs, no SQL job exists); `src/production-spec/author-at-review.test.ts` — "a banned word in the Brief's title fails the audit" |
| 3 | The Spec is persisted through the SQL-backed writer, not only the file-backed one | `src/command-surface/production-spec.test.ts` — `saveAssetSpec` tests prove `saveProductionSpec` (SQL) is called and readable via `loadProductionSpec`; `accept-idea.test.ts`'s authoring test reads the Spec straight off the SQL Asset row |
| 4 | The per-Idea Spec file on disk is still produced and matches the SQL-authored Spec (regenerated view, not independently authored again) | `src/command-surface/production-spec.test.ts` — `refreshSpecFile` reads back FROM `loadProductionSpec` before writing, never from an in-memory value; `accept-idea.test.ts`'s authoring test reads the on-disk file and asserts `assert.deepEqual(onDisk, asset.spec)` |
| 5 | Which Skill authors a Recipe's Spec is a typed registry field, not prose | `src/recipe/registry.test.ts` — `producerSkill` assertions per Recipe + the "all three declare their OWN, DISTINCT producerSkill" test |
| 6 | A News Carousel job accepted this way, run through the unattended worker with NO attended session, reaches `produced` — **real transcript required** | `src/commands/accept-to-produced-e2e.test.ts` — see the full transcript below. `acceptIdeaCommand` is called, then `drainQueue` (`src/commands/run-worker.ts`, the EXACT function `/run-worker` runs) alone drains the SQL queue against `FakeCarouselSpace`; `runOneJob` is never called directly anywhere in this test |
| 7 | The unattended worker still parks (never renders past) a job whose Recipe declares a pick-gate | `src/commands/accept-to-produced-e2e.test.ts`'s second describe block — Character Explainer with Cast, same `acceptIdeaCommand` -> `drainQueue` path, asserts `outcome.status === "parked"`, `outcome.gate === "cast"`, Asset stays `in_production`/`pending_gate: "cast"` |
| 8 | The attended Producer's flow completes correctly reading the Spec Review already authored — never authoring its own, result unaffected | `src/producer/carousel-end-to-end.test.ts`'s new describe block — calls `authorSpecForRecipe` (the SAME function `acceptIdeaCommand` calls) then drives `driveToNextGate` DIRECTLY (never `runOneJob`/`drainQueue`), reaching `finished` with the expected asset id — proving the attended path's own drive is unaffected by Spec provenance; `.claude/agents/producer.md`'s rewritten Author phase + `producer-agent.docs-test.ts`'s new "never authors a Production Spec" test pin the PROSE contract |
| 9 | Deliberately breaking authorship produces a loud, visible failure at accept time — never a silently empty/partial Spec reaching the queue | `src/commands/accept-idea.test.ts`'s forced-failure test (see #2) — the returned message contains `AUTHORSHIP FAILED for Recipe "news-carousel"` and names the banned-words check; zero rows in either queue; `src/production-spec/author-at-review.test.ts`'s "a malformed candidate Spec... fails the shape check, never throws" covers the shape-failure sibling case |

### The end-to-end unattended proof — full transcript

Command: `node --import tsx --test --test-reporter=tap src/commands/accept-to-produced-e2e.test.ts`

```
TAP version 13
# (node:23055) ExperimentalWarning: SQLite is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: accept -> drainQueue -> produced — a News Carousel job reaches produced with ZERO attended session (ADR-0031, issue #264)
    # Subtest: acceptIdeaCommand authors the Spec; drainQueue alone (never runOneJob called by hand) carries the job to done/produced
    ok 1 - acceptIdeaCommand authors the Spec; drainQueue alone (never runOneJob called by hand) carries the job to done/produced
      ---
      duration_ms: 32.057375
      type: 'test'
      ...
    1..1
ok 1 - accept -> drainQueue -> produced — a News Carousel job reaches produced with ZERO attended session (ADR-0031, issue #264)
  ---
  duration_ms: 32.45975
  type: 'suite'
  ...
# Subtest: accept -> drainQueue -> parked — a gated Recipe still parks at its Cast gate, never rendering past it (ADR-0031, issue #264)
    # Subtest: Character Explainer with Cast: drainQueue parks at awaiting_pick through the SAME accept-then-drain path
    ok 1 - Character Explainer with Cast: drainQueue parks at awaiting_pick through the SAME accept-then-drain path
      ---
      duration_ms: 15.166625
      type: 'test'
      ...
    1..1
ok 2 - accept -> drainQueue -> parked — a gated Recipe still parks at its Cast gate, never rendering past it (ADR-0031, issue #264)
  ---
  duration_ms: 15.379875
  type: 'suite'
  ...
1..2
# tests 2
# suites 2
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 339.070458
```

What this proves, step by step (`src/commands/accept-to-produced-e2e.test.ts`):

1. A throwaway SQLite database is seeded with a Brand, a Format, a primary Channel, and a `brand-logo`
   Brand Asset — no other setup.
2. `acceptIdeaCommand(BRAND, "idea-01", ["news-carousel"], [], { brandsRoot, queuePath, db, now })` is
   called — the SAME compiled function `/review-ideas` runs. Its own output is asserted to contain
   `Spec persisted for "news-carousel"` and to NOT contain `AUTHORSHIP FAILED`. Immediately afterward,
   the SQL Asset row is read back directly and asserted to already carry the authored Spec, at
   `status: "queued"` — BEFORE the job is ever drained.
3. `drainQueue(db, new FakeCarouselSpace(), { poll: FAKE_POLL, fetchImpl })` — the EXACT function
   `src/commands/run-worker.ts`'s CLI entry calls — is invoked directly. This is the whole proof: nothing
   else touches the job between accept and drain. `runOneJob` is never called by this test at all; only
   `drainQueue` is.
4. The summary reports exactly one processed job, `outcome.status === "done"`. The SQL Asset is re-read
   and asserted `status: "produced"`, carrying `produced_at`, one `asset_media` row (`image/png`), and a
   saved Copy Variant for the Brand's primary Channel — the full ADR-0011 lifecycle, reached with zero
   attended-session involvement.
5. A second, sibling test repeats steps 2-3 for `character-explainer-with-cast` (one declared gate) and
   asserts `drainQueue` reports `outcome.status === "parked"` at `gate: "cast"`, never rendering past it —
   proving the gate mechanics are unaffected by moving authorship to Review.

### Fakes / fixtures used

- **Magnific fake (explicitly flagged — no live Space touched anywhere in this slice):**
  `src/producer/fixtures/fake-carousel-space.ts`'s `FakeCarouselSpace` (News Carousel Recipe) and
  `src/space-driver/fixtures/fake-space.ts`'s `FakeSpace` (Character Explainer with Cast Recipe) — both
  pre-existing, purpose-built stands-in for the real Magnific Space, driven through the SAME
  `SpaceMcpPort` the real MCP-backed port implements. Every test in this slice that touches "the Space"
  goes through one of these two — no `spaces_*`/`creations_*` call, no credits, no board mutation,
  anywhere.
- **Fake `fetch`:** a local `fakeFetch` helper (mirroring `command-surface/worker.test.ts`'s own) stands
  in for downloading a rendered creation's bytes — no real network call.
- **Throwaway SQLite:** every test opens a real, on-disk-but-temp SQLite file (`withTempDb`, never
  `:memory:`, never the committed `data/organicgrowth.db`).
- **Throwaway `brandsRoot`/ledger/queue:** every test writes its own `ledger.json`/Brief/`queue.json`
  under a fresh `mkdtemp` directory, cleaned up in a `finally` block — never the committed `data/brands/`.
- **The "LLM authoring Skill" fake:** `src/production-spec/author-at-review.ts`'s `DEFAULT_SPEC_AUTHORS`
  — deterministic, hermetic functions (`generate`, `generateNewsCarouselSpec`,
  `generateNewsShortScriptSpec`) standing in for each Recipe's real, interactive `producerSkill`. No
  model call anywhere in this slice's code or tests, mirroring the pre-existing `skillDraftCopy`/
  `defaultDraftCopy` pattern this codebase already established for the Copy step.

### Self-review notes

- Hoisted `resolveCadenceSafely`'s call out of the per-Recipe persistence loop in `accept-idea.ts` (it
  doesn't depend on the Recipe, so it was being needlessly re-computed per Recipe — one call now covers
  every newly-enqueued Recipe in a single accept).
- Deliberately did NOT touch `src/production-queue/sql-sync.ts` (`syncAcceptToSql`) or
  `src/production-queue/enqueue-on-accept.ts` at all — every acceptance criterion is satisfiable by
  layering the authoring step in `acceptIdeaCommand` itself, ahead of both, which keeps the blast radius
  on two already-heavily-audited, multi-QA-round modules at zero. All of `accept-idea.test.ts`'s
  PRE-EXISTING tests (from issue #254) pass completely unmodified, proving this is additive, not a
  behavior change to the paths they already cover.
- Deliberately did NOT touch `src/commands/run-worker.ts` or `src/command-surface/worker.ts` at all, per
  the issue's own explicit instruction — `git diff` on both is empty.
- Considered routing the authored Spec through `acceptIdeaCommand`'s CLI argument list (a JSON blob),
  but rejected it: it would have required changing the documented
  `npm run accept-idea -- <brand> <ideaId> "<chosen-csv>" '<declined-json>'` invocation shape
  `review-docs.test.ts` already pins, and a multi-slide Spec's JSON is too large to pass safely as a
  shell argument. Authoring inside the compiled command via a deterministic stand-in (mirroring the
  Copy step's own established `CopyDrafter` pattern) avoids both problems and keeps the whole path
  hermetic and unit-testable.
- Kept `syncAcceptToSql`'s per-Recipe Asset-row creation (`status: "queued"`, no Spec) exactly as #254
  left it; `acceptIdeaCommand` attaches the Spec in a SEPARATE step immediately after, once the Asset id
  is known — this reads slightly less atomic than "the Asset is born with its Spec", but keeps the two
  already-independently-tested modules (`sql-sync.ts`, `author-at-review.ts`) fully decoupled, and the
  window between the two writes is a single synchronous `await` chain inside one function, not a
  real concurrency hazard for a single-Operator accept flow.
- Both new deterministic Spec generators (`news-carousel-generate.ts`, `news-short-script-generate.ts`)
  ground their output in the Brief's own `title` (never a fixed template) specifically so a banned word
  anywhere in an Idea's real material is provably caught by the SAME author-phase scan the worker
  already runs — verified by each generator's own "carries a banned word through" test.
- Removed the old Author-phase paragraph in `producer.md` about checking the canvas for the configured
  video model before writing a `video_prompt` (ADR-0007) — that was authorship craft, and authorship no
  longer happens in the Producer at all under ADR-0031. No test pinned that paragraph's content, and its
  removal is the correct, honest consequence of the redesign, not an oversight.

### Known limits

- **Cadence resolution for the regenerated file view is best-effort.** `resolveCadenceSafely` degrades to
  `"weekly"` on any Format-file read problem — the canonical SQL Spec is unaffected either way, but a
  `cadence: daily` Idea accepted while its Format file happens to be unreadable would get its file view
  written to the flat, non-nested path instead of the ISO-week/weekday-nested one, until the next
  successful regeneration. This mirrors `specPathFor`'s own pre-existing default-parameter behavior, not
  a new risk this ticket introduces.
- **The SQL-vs-file degraded mode is unchanged from #254's own accepted limitation.** When `data/
  organicgrowth.db` cannot even be opened, `acceptIdeaCommand` still authors + self-checks every chosen
  Recipe's Spec and still enqueues into `data/queue.json`, but NEITHER `saveAssetSpec` NOR
  `refreshSpecFile` ever runs (there is no SQL row to attach the Spec to). In that rare, already-flagged
  degraded case, an attended Producer resuming that file-queue job would find no pre-authored file Spec
  either — out of this ticket's scope to fix (the primary, default path always opens the database; this
  is the same "file queue only" degradation #254 already documented and accepted).
- **News Short Script's deterministic author is built and tested, but not exercised by the end-to-end
  proof** (explicitly out of scope per the issue — its own Recipe drives no Space and is not this
  ticket's proof target). `author-at-review.test.ts` proves it authors and self-checks correctly in
  isolation.
- **Pre-existing stuck `queued`/`failed` jobs from before this change are untouched**, exactly as the
  issue specifies out of scope — no revival/requeue mechanism was built.
- **Issue #238** (the dormant `compose.ts` allow-list entry) is explicitly NOT touched, per the task
  brief's own instruction — `saveProductionSpec` now has a real caller (via `saveAssetSpec`), which is
  exactly the trigger ADR-0031's own "Consequences" section names for re-triaging #238, but that
  re-triage is left for its own, separate ticket.

---

## QA Verdict — Round 1: PASS

Verified independently against GitHub issue #264 (Agent Brief comment), ADR-0031, `CONTEXT.md`'s
already-merged terminology, and the built code itself — not the Build Report's claims alone. Every file
cited below was read directly; the full suite and docs suite were actually re-run in this session, not
assumed from the report.

### Suite result

- `npm test` (type-checks via `tsc --noEmit` first, then the full `node:test` suite): **4058 tests, 1078
  suites, 0 fail, 0 cancelled, 0 skipped** — actually run this session, matches the Build Report exactly.
- `npm run test:docs`: **351 tests, 94 suites, 0 fail** — actually run this session.
- `npx openspec validate issue-264-spec-authored-at-review --strict`: `Change 'issue-264-spec-authored-at-review' is valid` — actually run this session.

### Per-criterion results (issue #264 Agent Brief, verbatim acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Accepting + choosing zero-gate News Carousel authors the Spec synchronously, before enqueue | PASS | `src/commands/accept-idea.ts` lines 152-194: the authoring loop (`authorSpecForRecipe`) runs and builds `enqueueTargets` BEFORE `enqueueOnAccept` is ever called (line 226). Confirmed by direct read of the function body, not just the Build Report's line-number claim. |
| 2 | A failing self-check blocks that Recipe's accept, is reported in-conversation, no job enqueued | PASS | `src/commands/accept-idea.test.ts` "a forced banned-word violation..." test (read in full): asserts the message matches `/AUTHORSHIP FAILED for Recipe "news-carousel"/`, `data/queue.json` has 0 jobs, and the SQL job table (via `listJobsForComposite`) has 0 jobs for that Recipe. This genuinely asserts absence of a job, not merely that an error string appeared. |
| 3 | Spec persisted through the SQL-backed writer, a REAL production caller | PASS | `src/command-surface/production-spec.ts`'s `saveAssetSpec` wraps `saveProductionSpec` (`src/production-spec/store.ts`); grepped and confirmed `acceptIdeaCommand` calls `saveAssetSpec` at a real, non-test call site (`src/commands/accept-idea.ts:247`) — this is production code, not a test fixture. |
| 4 | The on-disk per-Idea Spec file is a generated view, never independently authored | PASS | `refreshSpecFile` (`src/command-surface/production-spec.ts`) reads `loadProductionSpec` off SQL and writes it via the file-backed `saveSpec` — never from an in-memory value. `accept-idea.test.ts`'s "persists the authored Spec..." test reads the on-disk file back and asserts `assert.deepEqual(onDisk, asset.spec)`. Confirmed this mirrors `refreshPostJson`'s ADR-0028 pattern by reading `production-spec.ts`'s own doc comment and cross-checking `saveAssetSpec`/`refreshSpecFile`'s bodies directly. |
| 5 | Which Skill authors a Recipe's Spec is a typed registry field, not prose | PASS | `src/recipe/registry.ts`: `producerSkill: string` is a required field on the `Recipe` interface (line 307) and set on all three registry entries (`produce-character-explainer`, `produce-news-carousel`, `produce-news-short-script` — all three directories verified to exist under `.claude/skills/`). `git diff main -- .claude/agents/producer.md` confirms the front-matter description and Author-phase section no longer instruct loading a Recipe's `producerSkill` — it is cited for context only, never loaded. `producer-agent.docs-test.ts`'s new "never authors a Production Spec" test pins `doesNotMatch(/load(s|ing)? (a |the )?Recipe'?s producerSkill/i)`. |
| 6 | Real end-to-end unattended proof: accept -> real `drainQueue` -> `produced`, zero attended session | PASS | Read `src/commands/accept-to-produced-e2e.test.ts` in full. It imports `drainQueue` from `src/commands/run-worker.ts` — confirmed via `grep` that this is the SAME function `run-worker.ts`'s own CLI entry (`main()`) calls, which itself calls `runOneJob` (`command-surface/worker.ts`) internally as its real, unmodified worker mechanics. The test calls `acceptIdeaCommand` then `drainQueue` directly — `runOneJob` is never called by the test itself, only by `drainQueue`'s own internals, exactly as intended ("the same function `/run-worker` runs" is a true claim, not a shortcut). Confirmed the Asset really reaches `status: "produced"` with `produced_at`, one `asset_media` row (`image/png`), and a saved Copy Variant — the full ADR-0011 lifecycle. No `Skill`/model/Magnific-MCP tool call anywhere in the path (Spec authored deterministically at accept time; media rendered against `FakeCarouselSpace`). |
| 7 | The worker still parks a gated Recipe's job at its pick-gate | PASS | The sibling describe block in the same test file: `acceptIdeaCommand` for `character-explainer-with-cast`, then `drainQueue(db, new FakeSpace(), ...)` — asserts `outcome.status === "parked"`, `outcome.gate === "cast"`, and the SQL Asset stays `in_production`/`pending_gate: "cast"`. |
| 8 | The attended Producer's flow reads the pre-authored Spec, never authors its own; result unaffected | PASS | `src/producer/carousel-end-to-end.test.ts`'s new describe block calls `authorSpecForRecipe` directly (the SAME function `acceptIdeaCommand` calls) then drives `driveToNextGate` directly (never `runOneJob`/`drainQueue`) to `finished`. `.claude/agents/producer.md`'s rewrite is a real rewrite, not a patch: the old "Author phase — this is your core craft" section (which instructed loading a Recipe's producer Skill and writing the Spec) is fully replaced with "read the Spec Review already authored" language; the old video-model-selection authoring paragraph is removed entirely (confirmed via `git diff main`), not left dormant alongside new text. `producer-agent.docs-test.ts` pins this with executable assertions, not just prose review. |
| 9 | Deliberately breaking authorship produces a loud, visible failure at accept time | PASS | Same `accept-idea.test.ts` forced-failure test as #2 — verified the failure path is exercised via a real banned word (`VERBOTEN`) configured in a real `brand-profile.yaml` and present in the Idea's real title, proving the deterministic Spec author genuinely grounds its output in Brief material (checked `news-carousel-generate.ts`: `image_prompt` carries the Brief's full, untruncated title) rather than the test rigging the audit result directly. |
| 10 | Out-of-scope untouched: no requeue mechanism, Copy step unaffected, worker files genuinely untouched, no worker LLM credentials | PASS | `git diff main -- src/commands/run-worker.ts src/command-surface/worker.ts` returns **empty** — confirmed directly, not taken on the report's word. `grep -rn requeueJob src/` shows it exists only in its pre-existing, already-not-wired form (`job-store.ts`'s definition + `worker.ts`'s own bounded-retry usage, both pre-existing) — no new caller. No new file grants Magnific MCP tools or an LLM credential to the worker; `author-at-review.ts`'s `DEFAULT_SPEC_AUTHORS` are plain deterministic functions with no model call, confirmed by reading their full source. Copy step (`src/copy/`) has zero files touched in `git status --porcelain`. |

### Per-scenario results (spec deltas, `openspec/changes/issue-264-spec-authored-at-review/specs/*/spec.md`)

All Scenarios read in full across `recipe-registry`, `production-spec`, `command-surface`,
`accept-idea-command`, and `spec-authored-at-review` capabilities. Every Scenario traces to an issue
acceptance criterion and to ADR-0031's Decision section; no scenario asserts anything the issue did not
ask for or that contradicts CONTEXT.md (already updated on `main` in the ADR-0031 commit, `6d9fcfa`,
and read directly — its Review/Production Spec/Producer/Recipe/Recipe Skill entries already state
"authored at Review" consistently, confirming this build did not misread the decision).

| Requirement (capability) | Scenario | Result | Covering test |
|---|---|---|---|
| Review is the single authorship point (`spec-authored-at-review`) | Attended Producer completes against a pre-authored Spec | PASS | `carousel-end-to-end.test.ts` new describe block |
| News Carousel reaches produced via unattended worker alone (`spec-authored-at-review`) | accept -> drainQueue -> produced, zero attended session | PASS | `accept-to-produced-e2e.test.ts`, first describe block |
| Worker still parks a gated Recipe (`spec-authored-at-review`) | Cast gate never rendered past | PASS | `accept-to-produced-e2e.test.ts`, second describe block |
| Deliberately broken authorship fails loudly (`spec-authored-at-review`) | Forced failure never reaches the queue | PASS | `accept-idea.test.ts` forced-failure test |
| `acceptIdeaCommand` authors before either queue is written (`accept-idea-command`) | Well-formed accept authors + enqueues | PASS | `accept-idea.test.ts` "persists the authored Spec..." test |
| `acceptIdeaCommand` authors before either queue is written (`accept-idea-command`) | Forced banned-word blocks accept | PASS | `accept-idea.test.ts` forced-failure test |
| Spec persisted + regenerated as file view (`accept-idea-command`) | File view matches SQL Spec exactly | PASS | Same test, `assert.deepEqual(onDisk, asset.spec)` |
| `saveAssetSpec`/`refreshSpecFile` (`command-surface`) | Persist + read-back | PASS | `command-surface/production-spec.test.ts` |
| `saveAssetSpec`/`refreshSpecFile` (`command-surface`) | File view reads from SQL, not memory | PASS | Same file |
| `producerSkill` typed field (`recipe-registry`) | Each Recipe declares its own, distinct value | PASS | `recipe/registry.test.ts` |
| Deterministic Spec authors + `authorSpecForRecipe` (`production-spec`) | Each Recipe's author passes its own audit; banned word fails it | PASS | `author-at-review.test.ts` |

### Always-rules + Magnific-fake checks

- **Generate-never-publish**: PASS — no publish call anywhere in the touched/new code; `drainQueue`/`runOneJob` only ever move an Asset to `produced`, never `posted`. `git diff` on `run-worker.ts`/`worker.ts` is empty, so publication behavior is provably unchanged.
- **Public-metrics-only**: PASS — unaffected; no metrics code touched (`git status --porcelain` shows no file under `src/performance/`).
- **Relative-not-absolute**: PASS — unaffected; no scoring code touched.
- **Explicit-attribution**: PASS — unaffected; `log-post.ts`/ledger attribution code untouched.
- **Ledger-as-source-of-truth**: PASS — the SQL Spec write does not create a rival source of truth: `refreshSpecFile` only ever reads the file view back FROM the SQL row (`loadProductionSpec`) and never accepts an independently-authored value, verified by reading the function body directly (`src/command-surface/production-spec.ts` lines 43-48). This is the exact ADR-0028 `post.json`-mirroring pattern the Build Report claims, confirmed by code, not by the report's assertion alone.
- **Magnific fake check**: PASS — `git diff main --name-only` (all changed/new `.ts` files) grepped for `mcp__magnific`/`spaces_run`/`spaces_edit`/`creations_wait`/`creations_show`: **zero hits**. `FakeCarouselSpace implements SpaceMcpPort` (confirmed directly in `src/producer/fixtures/fake-carousel-space.ts`) — a pre-existing, purpose-built stand-in, not the live client. The "producer Skill authors a Spec" step is a deterministic, hermetic function (`DEFAULT_SPEC_AUTHORS`, no model call, no I/O, no clock — read in full) — not a rigged test asserting a hand-picked literal: the forced-failure test proves it genuinely scans real Brief material for a real configured banned word, and the Character/Carousel/Short-Script happy-path tests prove each generator's output genuinely satisfies that Recipe's own independent validator.

### Defect list

None. No defects found at any severity.

### Minor note (not a defect, does not affect the verdict)

`openspec/changes/issue-264-spec-authored-at-review/tasks.md` still shows every checkbox as `[ ]`
(unchecked) despite every task described being demonstrably complete and tested. This is a
documentation-hygiene nit only — it does not affect correctness, test coverage, or the openspec
`validate --strict` result (which passed) — but the developer should check these off on the next round
this file is touched, for an accurate paper trail.

### Overall verdict

**PASS.** All 10 acceptance criteria verified against real code and real, independently-run tests (not
taken on the Build Report's word); the full suite and docs suite are genuinely green; `openspec validate
--strict` passes; the spec deltas faithfully match both issue #264's Agent Brief and ADR-0031's Decision
section, with no self-consistent-but-wrong drift detected against CONTEXT.md; every always-rule holds;
no live Magnific call exists anywhere in this slice. This slice may proceed to a PR.
