## Why

Slices #53–#58 built the multi-format model end-to-end on `main`: Format files + `FormatStore` (#53),
the in-repo Recipe registry (#54), the per-Asset ledger + `AssetStore` (#55), the Recipe-aware queue +
re-grained commands + `/log-post <brand> <idea> <recipe> <url>` (#56), the generic run-until-gate driver
+ generic `/pick` with `/pick-cast` as a thin alias (#57), and the per-Recipe Spec shape + out-of-Space
copy composition (#58). Two documentation debts are left over from that build:

1. **`CLAUDE.md` and `.claude/agents/producer.md` still narrate the OLD single-recipe build.** `CLAUDE.md`
   marks the multi-format model "decided … in build" and appends `*Target (ADR-000X):*` footnotes to the
   pipeline steps, saying they "still describe today's single-recipe build … being migrated onto that
   model." That is no longer true — the model is built. Left uncorrected, the docs actively mislead about
   what exists today (e.g. `/run-trends` with no `<format>` argument, `/log-post` with no `<recipe>`
   argument, an Idea-level `casting`/`produced` lifecycle that ADR-0011 retired). `producer.md` and
   `.claude/commands/run-pipeline.md` similarly carry stale vocabulary (a queue-job schema with the
   retired `phase: cast|render` / `awaiting_cast` fields; a flat Idea `casting → produced` transition;
   `run-pipeline.md`'s multi-format paragraph is still marked "Not built yet").
2. **Three `docs-test.ts` subtests pin FALSE "not yet wired" honesty strings.** They were written to hold
   the line during the 2026-07-07 codebase-audit window, when the `producer` agent's attended, live-Space
   runtime genuinely had not been restored (audit finding C2: "the documented production runtime cannot
   execute — no live Space adapter, no worker host"). PR #46 restored the attended producer (superseding
   ADR-0004 with ADR-0008) before this epic even started, and slices #53–#58 then wired the whole
   multi-format flow on top of it. The three subtests (`src/commands/report.docs-test.ts`'s pick-cast
   check, `src/commands/run-pipeline.docs-test.ts`'s C2 describe block, and
   `src/production-spec/producer-agent.docs-test.ts`'s Spec-composition check) still REQUIRE the docs to
   say "not yet wired" / cite an audit doc ("C2") that is not even present in the repository (it exists
   only as an unmerged git stash, parked deliberately while this epic was built) — so today they fail
   `npm run test:docs` (20/23 green) for the RIGHT reason (the docs no longer say the false thing) but the
   WRONG diagnosis (the tests, not the docs, are stale).

Additionally, the issue asks to confirm the ADR-0004 unattended-background-worker code is gone. It
mostly already is — but the issue text (written before #56/#57 landed) names BOTH `worker.ts` AND
`scheduler.ts` as dead, which is only half right.

## What Changes

- **`CLAUDE.md` is rewritten to present tense, whole-file.** The intro callout, the Agents-table
  `producer` row, the pipeline's step 1–7 narrative, the "Pipeline rules" paragraph, and the `## State`
  section's ledger description all drop their `*Target (ADR-000X):*` future-tense footnotes and describe
  the multi-format model as it runs TODAY: `/run-trends <brand> <format>`, Review picking Recipes,
  `data/queue.json` keyed `(brand, idea, recipe)`, the per-Asset ADR-0011 lifecycle
  (`queued → in_production → produced → posted → tracking → scored`, `casting` retired), the generic
  `/pick` + `/pick-cast` alias, and `/log-post <brand> <idea-id> <recipe> <post-url>`. It is honest that
  only ONE Recipe is wired today (*Character Explainer with Cast*) — the registry is multi-Recipe-ready,
  a second Recipe is future work (issue #60) — never over-claiming a second Recipe exists.
- **`.claude/agents/producer.md` is corrected to match the live schema and lifecycle**, and gains a short,
  honest multi-format framing note. Concretely: the "Queue jobs follow the store schema" guardrail is
  rewritten from the retired `phase: cast|render` / `awaiting_cast` shape to the CURRENT
  `recipe` / `gate` / `awaiting_pick` / `pick` shape (`src/production-queue/queue.ts`); Phase A/B's flat
  `accepted → casting` / `casting → produced` Idea-status language is corrected to the real per-Asset
  status transitions (`in_production` with `pending_gate: "cast"`, then `→ produced`); the Spec save path
  gains its Format + Recipe segments; a stray "Two human gates inside production" heading (which only ever
  named one gate) is corrected to "One human gate inside production"; and a new bullet names the attended
  runtime explicitly (ADR-0008). No false "not yet wired" wording is added — the flow IS wired.
- **`.claude/commands/run-pipeline.md`'s multi-format paragraph flips from "Not built yet" to present
  tense** — gates are per-Recipe today (ADR-0009/0010), the Recipe registry is multi-Recipe-ready with one
  entry wired, and the Gate 1/2/3 narrative + in-flight detection are corrected to the per-Asset
  vocabulary (`in_production`/`pending_gate`, not the retired flat `casting`/`produced` Idea status), and
  the `/log-post` hint gains its required `<recipe>` argument.
- **Three docs-test subtests are rewritten to assert the CURRENT, true claim instead of the stale
  disclaimer** — `report.docs-test.ts`'s pick-cast check, `run-pipeline.docs-test.ts`'s describe block, and
  `producer-agent.docs-test.ts`'s Spec-composition check now assert: the doc states production is
  ATTENDED, in the Operator's own session, with no unattended background worker (citing ADR-0008); the doc
  does NOT re-add the old "not yet wired" language; and (for `producer.md`, replacing the removed
  assertion with an equally meaningful one) the doc's queue-job schema description matches the CURRENT
  `recipe`/`awaiting_pick` fields, not the retired `phase`/`awaiting_cast` ones — a real, checkable pin
  against production code, not a rubber stamp. `report.docs-test.ts`'s CLAUDE.md-lifecycle test is also
  updated from the retired flat lifecycle string to the ADR-0011 per-Asset one.
- **Dead-code reconciliation (documented, not further code deleted beyond confirmation).**
  `src/production-queue/worker.ts` (+ its test) was ALREADY deleted in slice #56 (merge commit `8891b60`,
  PR #65, 2026-07-16) — confirmed gone and unreferenced. `src/production-queue/scheduler.ts` is **NOT**
  dead: `src/commands/pick.ts` imports its `markPickConsumed` for the live generic pick/resume flow
  (issue #57); it is kept. Its docstring's "a future `/57` generic run-until-gate driver" phrasing (stale
  now that #57 shipped) is corrected, and a line makes the worker/scheduler distinction explicit inline —
  so a future reader searching for "ADR-0004 dead code" finds the answer in the module itself, not just in
  this proposal. A repo-wide search for other ADR-0004 remnants (`worker.tick`/`worker.drain`,
  `SpaceSession`, a headless-permission-classifier module, an unattended-tick loop) found none — the
  incidental hits for the word "worker" elsewhere in the codebase (a doc comment, a test describe-block
  name, the generic `SpaceMcpPort` docstring) are unrelated English usage, not the deleted module.
- **`.claude/commands/pick-cast.md` is corrected (Round 2, QA defect QA-1).** Round 1 left this file
  unedited on the strength of a narrow grep for future-tense scaffolding phrases; it in fact still stated
  the RETIRED flat Idea-status model as present-tense fact in three places ("A `casting` Idea is paused
  at the Cast gate", "Status moves `casting → produced`", "the Idea's status (`casting → produced`)") plus
  one looser instance ("move the Idea to `produced`"). All four are corrected to the real per-Asset
  lifecycle (the Idea stays `accepted`; the Asset pauses `in_production` with `pending_gate: "cast"`, then
  moves `→ produced`), matching the language `CLAUDE.md`/`producer.md`/`run-pipeline.md` already used. A
  parallel loose (not false, but imprecise) instance in `.claude/commands/pick.md` is tightened the same
  way. A new regression test in `report.docs-test.ts` pins the corrected vocabulary and is verified to
  fail against the pre-fix text.

## Non-Goals (explicitly deferred)

- **A second wired Recipe.** Only one Recipe is wired (*Character Explainer with Cast*); issue #60/HITL.
  Docs are corrected to frame this honestly (multi-Recipe-ready machinery, one Recipe wired) rather than
  either overclaiming a second Recipe or denying the machinery is multi-format-ready.
- **Re-pointing `producer.md` at the Recipe registry for Space targeting.** ADR-0010/0013 intend the
  Recipe to become the single source of truth for which Space a Recipe drives; `src/recipe/registry.ts`'s
  own docstring says this re-point is deferred (untestable without the live Space) and that today's
  `brand-profile.yaml`'s `production.space_id` and the registry's Space id already agree. This slice keeps
  that as-is and adds an honest note rather than pretending the re-point happened.
- **Any behavior change to `src/production-queue/scheduler.ts`.** Its transition functions, FIFO/lock
  rules, and exports are untouched — only its module docstring's stale forward-reference is corrected. No
  test changes there beyond the (unnecessary) confirmation the existing suite stays green.
- **`report.md`'s tolerance of the legacy `casting` string.** `report.ts`'s `PRODUCTION_STATES` constant
  and `report.md`'s prose both intentionally still mention `casting` as a value `renderReport` TOLERATES
  for a Brand whose ledger has not been run through the one-time `ledger/migrate-assets.ts` migration
  (ADR-0011) — this is accurate, defensive behavior, not stale scaffolding, so `report.md` is left
  unchanged.

## Capabilities

### New Capabilities

- `docs-conformance`: the engineering documentation set (`CLAUDE.md`, the content-agent `.md` definitions,
  the command `.md` definitions) describes the built, attended, multi-format production flow in present
  tense, with no stale "not yet wired" disclaimers for capabilities that are actually wired — and the
  repository retains no dead ADR-0004 unattended-background-worker code.

### Modified Capabilities

None. No existing capability's runtime BEHAVIOR changes in this slice — `CLAUDE.md`/`producer.md`/
`run-pipeline.md` are prose, and `scheduler.ts`'s edit is a docstring only (its exported behavior,
already specified under `production-queue`, is unchanged and un-retested here beyond the pre-existing
green suite).

## Impact

- **Docs touched:** `CLAUDE.md`, `.claude/agents/producer.md`, `.claude/commands/run-pipeline.md`
  (Round 1); `.claude/commands/pick-cast.md`, `.claude/commands/pick.md` (Round 2, QA-1 fix).
- **Tests touched:** `src/commands/report.docs-test.ts` (Round 1: 2 subtests updated + Round 2: 1
  regression subtest added), `src/commands/run-pipeline.docs-test.ts`,
  `src/production-spec/producer-agent.docs-test.ts` (docs-conformance suite — `npm run test:docs`, kept
  out of `npm test`'s glob by design).
- **Code touched:** `src/production-queue/scheduler.ts` (docstring only — zero behavior change; no
  `.test.ts` change needed or made).
- **Code deleted:** none in this slice — `worker.ts` was already deleted in #56; confirmed, not repeated.
- **Hermetic:** no `spaces_*`/`creations_*` call anywhere in this slice — it touches no Magnific port at
  all (pure docs + a docstring). No fixture/fake is exercised; `npm run test:docs` reads plain files.
- **Always-rules upheld:** generate-never-publish, public-metrics-only, relative-not-absolute, and
  explicit-attribution are unaffected (no runtime code changed); ledger-as-source-of-truth is unaffected
  and, if anything, better documented (the corrected `CLAUDE.md`/`producer.md` now accurately describe
  which ledger fields live on the Idea vs. the Asset).
