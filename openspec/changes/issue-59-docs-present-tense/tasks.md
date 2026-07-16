## 1. Ground truth first (read before writing anything)

- [x] 1.1 Read issue #59, PRD #1, ADRs 0008–0014, `CONTEXT.md`, `CLAUDE.md`, and the always-rules.
- [x] 1.2 Confirm blockers #57 and #58 are CLOSED/merged (`gh issue view 57/58 --json state,stateReason`).
- [x] 1.3 Run `npm run test:docs` to capture the baseline: 20/23 green, 3 failing (all three pin FALSE
  "not yet wired / audit C2 / unattended not operational" strings from before the attended producer was
  restored).
- [x] 1.4 Reconcile the "delete worker.ts/scheduler.ts" AC against reality: `grep -rn "scheduler" src`
  shows `src/commands/pick.ts` imports `markPickConsumed` from `scheduler.ts` (the live generic
  `/pick`/`/pick-cast` gate-resume flow, issue #57) — it is NOT dead. `git log -- src/production-queue/
  worker.ts` shows it was already deleted in slice #56 (commit `8891b60`, PR #65). A repo-wide search for
  other ADR-0004 remnants (`worker.tick`/`drain`, `SpaceSession`, a headless-permission-classifier module,
  an unattended-tick loop) found none.

## 2. Flip `CLAUDE.md` to present tense (whole file)

- [x] 2.1 Grep `CLAUDE.md` for `Target (`, `not yet`, `not built`, `being migrated`, `single-recipe` — 6
  hits found, all in the multi-format callout, the Agents-table `producer` row, the pipeline intro
  sentence, the "Pipeline rules" paragraph, and the trailing multi-format `Target` block.
- [x] 2.2 Rewrite the intro callout, the `producer` Agents-table row, the pipeline-loop intro sentence,
  and steps 1–7 to present tense: `/run-trends <brand> <format>` (Format-scoped Runs, ADR-0013), Review
  picking Recipes (ADR-0009), the Production Queue keyed `(brand, idea, recipe)` (ADR-0011), the per-Asset
  `in_production`/`pending_gate` status (retiring the flat `casting` status), the generic `/pick` +
  `/pick-cast` alias (ADR-0010), and `/log-post <brand> <idea-id> <recipe> <post-url>`. Fold the trailing
  `Target (multi-format …)` block's content into the main text and delete the block (redundant once
  folded in).
- [x] 2.3 Rewrite the "Pipeline rules" paragraph and the `## State` section: the Idea's own lifecycle is
  `suggested / accepted / rejected` (ADR-0011); the per-Recipe Asset lifecycle is
  `queued → in_production → produced → posted → tracking → scored`; list `seeds.yaml` and
  `formats/<slug>.yaml` alongside `brand-profile.yaml`; the Spec path gains its Format + Recipe segments
  (`ideas/<format>/<run>/idea-NN.<recipe>.spec.json`, matching `production-spec/store.ts`'s real
  `specPathFor`). Keep backtick code-spans on one line (avoid a mid-span line-wrap that breaks a docs-test
  regex — caught and fixed during self-review).
- [x] 2.4 Be honest that only ONE Recipe is wired today (issue #60 is the second Recipe, HITL, not built)
  — never imply a second Recipe exists.

## 3. Flip `.claude/agents/producer.md` to present tense (test-first: 3.6/3.7 before 3.1–3.5 land)

- [x] 3.1 Fix the "Queue jobs follow the store schema" guardrail: the retired `phase: cast|render` /
  `awaiting_cast` shape is replaced with the CURRENT `recipe` / `gate` / `awaiting_pick` / `pick` shape,
  matching `src/production-queue/queue.ts` exactly.
- [x] 3.2 Fix Phase A/B's flat Idea-status language (`accepted → casting`, `casting → produced`) to the
  real per-Asset transitions (`in_production` with `pending_gate: "cast"`, then `→ produced`; ADR-0011 —
  the Idea itself stays `accepted`). Fix the Spec save path to include its Format + Recipe segments.
- [x] 3.3 Fix "Two human gates inside production" (only ever named one gate — Cast) to "One human gate
  inside production"; clarify Review is the gate before, Publish the gate after.
- [x] 3.4 Add a short, honest multi-format framing note (registry is multi-Recipe-ready; one Recipe wired
  today; a second is issue #60, future work) and an explicit ADR-0008 attended-runtime bullet.
- [x] 3.5 Add an honest note that Space-targeting still reads `brand-profile.yaml`'s `production.space_id`
  (re-pointing at the Recipe registry is deferred per `src/recipe/registry.ts`'s own docstring) — verified
  the two values actually agree for `mundotip` before writing the claim.
- [x] 3.6 Update `src/production-spec/producer-agent.docs-test.ts`'s stale "not yet wired (audit C2)" test:
  assert its ABSENCE (`doesNotMatch`) plus the presence of ADR-0008 + "attended"/"Operator's session", AND
  replace the removed assertion with an equally meaningful one — the doc's queue-job schema description
  must cite the CURRENT `recipe`/`awaiting_pick` fields and must NOT cite the retired `awaiting_cast`.
- [x] 3.7 `npm run test:docs -- src/production-spec/producer-agent.docs-test.ts` (via the full docs
  suite) green against the corrected doc.

## 4. Flip `.claude/commands/run-pipeline.md` to present tense (test-first)

- [x] 4.1 Rewrite Gate 1/2/3's narrative from the flat `casting`/`produced` Idea-status language to the
  per-Asset `in_production`/`pending_gate`/`produced` vocabulary; name the generic `/pick` command
  alongside `/pick-cast`; add the required `<recipe>` argument to the `/log-post` hint (it was missing).
- [x] 4.2 Rewrite the in-flight-detection step (step 4) off the retired flat `casting` status onto the
  per-Asset phase-resolver vocabulary.
- [x] 4.3 Flip the trailing `**Target (multi-format — ADR-0009/0011).** … Not built yet …` paragraph to
  present tense: gates are per-Recipe today; the registry is multi-Recipe-ready with one Recipe wired;
  no over-claim of a second Recipe.
- [x] 4.4 Rewrite `src/commands/run-pipeline.docs-test.ts`'s stale `describe("C2: … not yet wired")` block:
  rename it, assert the doc names the attended runtime + cites ADR-0008 + states "in your session" +
  does NOT re-add "not yet wired"; add a second assertion that gates are documented as per-Recipe
  (ADR-0009) without calling the model unbuilt.
- [x] 4.5 `npm run test:docs` green against the corrected doc (regex adjusted once for a markdown
  line-wrap inside a bold+newline span — caught by re-running the suite, not assumed).

## 5. Flip `src/commands/report.docs-test.ts`'s two stale/regressed assertions (test-first)

- [x] 5.1 Update "CLAUDE.md documents the final lifecycle" to assert the ADR-0011 split lifecycle
  (`suggested / accepted / rejected` on the Idea; `queued → in_production → produced → posted → tracking →
  scored` on each Asset) instead of the retired flat chain — kept meaningful (still pins two real, checkable
  strings), not weakened to a rubber stamp.
- [x] 5.2 Rename/rewrite "pick-cast.md is honest that the unattended render runtime is not yet wired
  (audit C2)" to assert the CURRENT true claim: the render runs in the Operator's session, there is no
  unattended background worker, ADR-0008 is cited, the stale "not yet wired" wording is ABSENT, and the
  doc still promises it records the Character correctly.

## 6. Dead-code reconciliation (confirm, document — no further deletion)

- [x] 6.1 Confirm (again, post-edits) `worker.ts` stays absent and unreferenced; `scheduler.ts` stays
  imported by `pick.ts`; fix its docstring's stale "a future `/57`…" forward-reference (comment-only,
  zero behavior change, no test change needed).
- [x] 6.2 Document the reconciliation explicitly in `proposal.md` and this file so the AC's "delete
  worker.ts/scheduler.ts" reads correctly against what actually happened across #56/#57/#59.

## 7. OpenSpec

- [x] 7.1 Author `proposal.md`, this `tasks.md`, and the ADDED `docs-conformance` capability spec delta
  (Requirements + Scenarios) capturing: engineering docs describe the built attended multi-format flow in
  present tense; docs-conformance tests pin current reality, not superseded disclaimers; the repo retains
  no dead ADR-0004 background-worker code.
- [x] 7.2 `npx openspec validate issue-59-docs-present-tense --strict` green.

## 8. Verify + self-review

- [x] 8.1 `npm test` green (994/994 baseline, no regressions — this slice touches no runtime logic other
  than one docstring).
- [x] 8.2 `npm run test:docs` green (24/24 — was 20/23; the fix is entirely in this slice's scope, no
  test weakened into a rubber stamp: every rewritten assertion still pins a real, checkable string).
- [x] 8.3 `npm run build` clean (`tsc -p tsconfig.build.json`).
- [x] 8.4 Self-review / simplify pass: re-grep the whole diff for `Target (`/`not yet`/`not built`/
  `casting`/`awaiting_cast`/`phase: cast` — only legitimate historical mentions of the RETIRED vocabulary
  remain (explaining what changed), no live false claims.
- [x] 8.5 Write the Build Report into `handoff.md`: what changed, files touched, how to run, an
  acceptance-criteria self-assessment mapping each AC to its test/evidence (explicitly reconciling the
  worker.ts/scheduler.ts AC), fakes/fixtures used (none — hermetic docs-only slice), self-review notes,
  known limits.
