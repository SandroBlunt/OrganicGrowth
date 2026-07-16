# Slice Handoff — issue-59-docs-present-tense

This is the one bidirectional **Slice Handoff** document (developer ⇄ qa). The developer writes the
Build Report below; qa appends a **QA Verdict**; retries append `Round-N Build` blocks. Nothing here is
overwritten.

## Build Report (Round 1)

### What changed

Issue #59 asked for three things, now all done:

1. **`CLAUDE.md` and `.claude/agents/producer.md` flipped to present tense.** Both documents narrated the
   OLD single-recipe build with `*Target (ADR-000X):*` footnotes saying the multi-format model was "not
   built yet" / "being migrated onto that model." Slices #53–#58 built that model on `main` before this
   slice started, so the framing was actively false. Both docs are rewritten to describe the multi-format
   flow as it runs TODAY: `/run-trends <brand> <format>` (Format-scoped Runs), Review picking Recipes,
   the Production Queue keyed `(brand, idea, recipe)`, the per-Asset ADR-0011 lifecycle
   (`queued → in_production → produced → posted → tracking → scored`, the flat `casting` status retired),
   the generic `/pick` command + `/pick-cast` alias, and `/log-post <brand> <idea-id> <recipe> <post-url>`.
   `producer.md` additionally had two real, independent-of-tense bugs fixed while making this pass: its
   "Queue jobs follow the store schema" guardrail named the RETIRED `phase: cast|render` / `awaiting_cast`
   fields instead of the live `recipe` / `gate` / `awaiting_pick` / `pick` fields
   (`src/production-queue/queue.ts`), and its Phase A/B narrative said "set the Idea `accepted → casting`"
   / "`casting → produced`" — but ADR-0011 retired that flat Idea-status; it is the ASSET that moves
   `in_production` (with `pending_gate: "cast"`) `→ produced`, while the Idea itself stays `accepted`.
   Both docs are honest that only ONE Recipe is wired today (*Character Explainer with Cast*) and frame a
   second Recipe as future work (issue #60) — never over-claiming.
2. **`.claude/commands/run-pipeline.md` flipped too** (in scope per the developer brief's explicit
   instruction to update it alongside the docs-test fix). Its Gate 1/2/3 narrative used the same retired
   flat `casting`/`produced` Idea-status language, its `/log-post` hint was MISSING the required
   `<recipe>` argument, its in-flight-detection step (step 4) used the same retired vocabulary, and its
   trailing multi-format paragraph was explicitly marked "Not built yet." All four are corrected.
3. **The three stale docs-tests are fixed, and `npm run test:docs` is fully green (24/24, was 20/23).**
   All three failing subtests pinned a "not yet wired"/audit-C2 disclaimer that predates PR #46 (which
   restored the attended producer) and this whole epic. The disclaimer is now FALSE, so the correct fix is
   to update the TESTS to assert the CURRENT true claim, not to re-add the false claim to the docs (the
   brief was explicit about this). See "Acceptance-criteria self-assessment" below for the exact mapping.

**Dead-code reconciliation (the two-part AC).** `src/production-queue/worker.ts` (the actual ADR-0004
unattended-worker code) was ALREADY deleted in slice #56 (commit `8891b60`, PR #65, 2026-07-16) —
confirmed absent and unreferenced (`test -f` fails; no import anywhere). `src/production-queue/
scheduler.ts` is **NOT** dead — `src/commands/pick.ts` imports its `markPickConsumed` for the live
generic `/pick`/`/pick-cast` gate-resume flow (issue #57) — it is **kept**. Its module docstring's stale
"a future `/57` generic run-until-gate driver" forward-reference (issue #57 is now merged) is corrected,
and a line makes the worker/scheduler distinction explicit inline (comment-only edit, zero behavior
change, no test change needed or made). A repo-wide search for other ADR-0004 remnants (`worker.tick`/
`worker.drain`, `SpaceSession`, a headless-permission-classifier module, an unattended-tick loop) found
none — the incidental hits for the English word "worker" elsewhere in the codebase (a doc comment on
`SpaceMcpPort`, a `describe()` block name, a Fallback-Protocol comment) are unrelated usage, not the
deleted module.

### Files touched

**Docs:**
- `CLAUDE.md` — whole-file present-tense pass (intro callout, Agents table, pipeline steps 1–7, Pipeline
  rules paragraph, `## State` section).
- `.claude/agents/producer.md` — present-tense pass + the two real accuracy fixes above (queue schema,
  Idea vs. Asset status vocabulary) + a corrected "One human gate inside production" heading (it
  previously said "Two" while only ever naming one) + an explicit ADR-0008 attended-runtime bullet + an
  honest note on the deferred Recipe-registry Space-targeting re-point.
- `.claude/commands/run-pipeline.md` — present-tense pass (Gate 1/2/3 narrative, in-flight detection,
  the trailing multi-format paragraph, the `/log-post` hint's missing `<recipe>` argument).
- `.claude/commands/pick-cast.md` — **read, not edited.** Already accurate/present-tense (confirmed by
  grep for `Target (`/`not yet`/`not built` — zero hits); the ONE thing wrong was the docs-TEST pinning a
  disclaimer the doc itself no longer carried, fixed in `report.docs-test.ts` instead.

**Tests (docs-conformance suite — `npm run test:docs`, not part of `npm test`'s glob):**
- `src/commands/report.docs-test.ts` — two subtests updated: the CLAUDE.md-lifecycle assertion (now pins
  the ADR-0011 split lifecycle instead of the retired flat one) and the pick-cast.md assertion (now pins
  the attended-runtime claim instead of the retired "not yet wired" disclaimer).
- `src/commands/run-pipeline.docs-test.ts` — the `describe("C2: … not yet wired")` block renamed and
  rewritten to assert the attended-runtime claim + per-Recipe gates, with an explicit `doesNotMatch` guard
  against the old disclaimer resurfacing.
- `src/production-spec/producer-agent.docs-test.ts` — the "not yet wired (audit C2)" subtest renamed and
  rewritten to assert the disclaimer's ABSENCE plus the ADR-0008 attended claim, AND (replacing the
  removed assertion with an equally meaningful one) that the doc's queue-job schema description matches
  the CURRENT `recipe`/`awaiting_pick` fields and does not mention the retired `awaiting_cast`.

**Code (docstring only, zero behavior change):**
- `src/production-queue/scheduler.ts` — module docstring corrected (stale "future `/57`" reference; the
  worker/scheduler distinction spelled out inline). No `.ts` logic, export, or test changed.

**OpenSpec:**
- `openspec/changes/issue-59-docs-present-tense/proposal.md`, `tasks.md`,
  `specs/docs-conformance/spec.md` (new capability — see below), `handoff.md` (this file).

### How to run

```bash
npm test                                              # 994/994 — unaffected (no runtime logic changed)
npm run test:docs                                     # 24/24 — was 20/23 before this slice
npm run build                                         # tsc -p tsconfig.build.json — clean
npx openspec validate issue-59-docs-present-tense --strict   # green
npx openspec validate --all --strict                  # 19/19 specs + this change, all green
```

To re-run just the three previously-failing suites:
```bash
node --import tsx --test src/commands/report.docs-test.ts
node --import tsx --test src/commands/run-pipeline.docs-test.ts
node --import tsx --test src/production-spec/producer-agent.docs-test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (from issue #59) | Status | Evidence |
|---|---|---|---|
| 1 | `CLAUDE.md` steps 1–7 and `producer.md` describe the multi-format flow in present tense; stale `Target (…)`/`not built yet` notes removed | **Met** | `grep -n "Target (\|not yet\|not built\|being migrated\|current single-recipe" CLAUDE.md .claude/agents/producer.md` returns zero matches for the scaffolding phrases (only legitimate historical mentions of the *retired* `casting` vocabulary remain, explaining what changed — verified by inspection, see `git diff CLAUDE.md .claude/agents/producer.md`). `docs-conformance/spec.md`'s "no future-tense scaffolding" Scenario pins this. |
| 1b | (extended in the developer brief) `pick-cast.md` and `run-pipeline.md` also updated so the docs-tests pass | **Met** | `pick-cast.md` needed no content change (confirmed already accurate); `run-pipeline.md`'s stale Gate narrative, missing `<recipe>` arg, and "Not built yet" paragraph are fixed — see diff. Both docs-tests below now read them and pass. |
| 2 | Dead `worker.ts`/`scheduler.ts` (+ tests) deleted; nothing references them — **reconciled**: `worker.ts` already deleted in #56; `scheduler.ts` is LIVE and kept | **Met (reconciled, not literally satisfied as originally worded — correctly so)** | `test -f src/production-queue/worker.ts` fails (absent); `git log -- src/production-queue/worker.ts` shows its deletion in commit `8891b60` (PR #65, slice #56), before this slice started. `grep -n "scheduler.ts" src/commands/pick.ts` shows a live import (`markPickConsumed`) — deleting it would break the build (confirmed by NOT deleting it and running `npm test`: 994/994 green). `docs-conformance/spec.md`'s "repository retains no dead ADR-0004 code" Requirement + its two Scenarios pin exactly this reconciliation. |
| 3 | `producer-agent.docs-test.ts` passes (`npm run test:docs` green) against the updated `producer.md`, with no false honesty strings | **Met** | `npm run test:docs` → `# pass 24 # fail 0`. The rewritten subtest in `src/production-spec/producer-agent.docs-test.ts` explicitly `doesNotMatch`es the old "not yet (runnable\|wired\|operational\|built)" pattern against the ACTUAL doc text — a false honesty string in `producer.md` would fail this test, not just leave it unasserted. |
| 4 | Strict validate + full test suite + docs-test green | **Met** | `npx openspec validate issue-59-docs-present-tense --strict` → "is valid"; `npx openspec validate --all --strict` → 19 passed, 0 failed; `npm test` → 994/994; `npm run test:docs` → 24/24; `npm run build` → clean. |

### Fakes / fixtures used

**None — and that is itself notable.** This slice is docs + a docstring + docs-test assertions; it
touches zero Magnific-port code, zero fixtures, zero Apify code. No `spaces_*`/`creations_*` call is
added anywhere (verified: `git diff` contains no such string). The Magnific fake
(`src/space-driver/fixtures/fake-space.ts`) is untouched and not exercised by this slice's new/changed
tests — there is nothing here that talks to a Space, live or fake, so there is nothing to flag beyond
confirming its total absence from the diff.

### Self-review notes

- Caught and fixed a markdown-authoring bug of my own during review: two lifecycle strings in `CLAUDE.md`
  (`suggested / accepted / rejected` and the six-stage Asset chain) were originally written with a
  backtick code-span split across a paragraph line-wrap, which put a literal newline INSIDE the codespan
  and broke my own docs-test regex (a real bug a naive regex-only review would have missed — caught by
  actually running `npm run test:docs` after each edit, not by inspection alone). Reflowed both
  paragraphs so no code-span crosses a line boundary.
- Fixed a small, pre-existing, unrelated accuracy bug in `producer.md` while in the neighborhood: "Two
  human gates inside production" only ever named ONE gate (Cast) in its body — corrected to "One human
  gate inside production" and clarified Review/Publish are the gates before/after, not inside, production.
- Deliberately did NOT touch `.claude/commands/report.md`'s tolerance of the legacy `casting` string —
  `report.ts`'s `PRODUCTION_STATES` constant intentionally still accepts `casting` as defensive tolerance
  for a Brand whose ledger has not been run through the one-time `ledger/migrate-assets.ts` migration
  (ADR-0011); that is accurate, working-as-designed behavior, not stale scaffolding, and its own
  docs-test (`report.md describes the production states (casting/produced)...`) was already green and
  correctly pins it. Changing it would have been scope creep against a doc that isn't wrong.
- Verified (not assumed) that `producer.md`'s new claim "`brand-profile.yaml`'s `production.space_id`" and
  `src/recipe/registry.ts`'s seeded Space id "already agree" is TRUE: both are the literal string
  `a1f05d67-1b98-4d10-9251-6603bea3b578` for `mundotip` — grepped both files before writing the claim.
- Considered and rejected weakening any of the three rewritten docs-test subtests into a bare
  `doesNotMatch("not yet wired")` rubber stamp — each one still pins at least two positive, checkable
  claims (e.g. producer.md's `awaiting_pick`/`recipe` schema fields; run-pipeline.md's "in your session" +
  ADR-0008 citation), so the suite still meaningfully pins the docs to reality.
- Ran `npx openspec validate --all --strict` (not just the one change) to confirm this slice didn't
  regress any of the 18 already-archived capability specs — 19/19 green.

### Known limits

- **A second wired Recipe is explicitly out of scope** (issue #60, HITL) — the docs are honest that the
  Recipe registry is multi-Recipe-ready but only one entry is wired; nothing here claims otherwise.
- **`producer.md`'s Space-targeting still reads `brand-profile.yaml`, not the Recipe registry.**
  ADR-0010/0013 intend the Recipe to become the single source of truth for which Space a Recipe drives;
  `src/recipe/registry.ts`'s own docstring says re-pointing `producer.md` at the registry is deferred
  (untestable without the live Space) and is explicitly not part of any slice's zero-behaviour-change bar
  so far. This slice adds an honest note about that gap rather than pretending it's closed — closing it
  is future work, not part of #59.
- **No new automated enforcement that CLAUDE.md/*.md stay present-tense going forward** beyond the
  existing `*.docs-test.ts` convention this slice extends — a future doc drift would need a human or a
  future slice to catch it the same way this one did (there is no generic "no future-tense scaffolding"
  linter; the `docs-conformance` capability's Scenarios describe the CURRENT state, not a standing CI
  gate beyond the existing pinned assertions).
- **This slice adds zero tests to `npm test`'s glob** (by design — `*.docs-test.ts` is deliberately
  excluded from `npm test` per the existing repo convention, documented in each docs-test file's header
  comment) — the 994/994 baseline is unchanged, not because nothing was tested, but because docs
  conformance is tested by a separate, purpose-built suite (`npm run test:docs`).
