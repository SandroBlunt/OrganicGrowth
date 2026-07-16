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

---

## QA Verdict — Round 1: FAIL

### Suite result

All four commands were run directly by qa and are genuinely green, exactly as claimed:

- `npm test` → **994/994 pass**, 0 fail (283 suites).
- `npm run test:docs` → **24/24 pass**, 0 fail (5 suites).
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, no output, exit 0.
- `npx openspec validate issue-59-docs-present-tense --strict` → `Change 'issue-59-docs-present-tense' is valid`.
- `npx openspec validate --all --strict` → `Totals: 19 passed, 0 failed (19 items)`.

The suite result is **PASS** in isolation. The overall verdict is **FAIL** on job (b)/(c) grounds below —
a doc in the acceptance-criteria's own scope still makes a false claim that no test in this slice catches.

### Per-criterion results

| # | Acceptance criterion | Result | Test / evidence |
|---|---|---|---|
| 1 | `CLAUDE.md` steps 1–7 and `producer.md` describe the multi-format flow in present tense; stale `Target (…)`/`not built yet` notes removed | **FAIL (partial)** | `CLAUDE.md` and `.claude/agents/producer.md` themselves are clean — `grep -n "Target (\|not yet\|not built\|being migrated\|single-recipe" CLAUDE.md .claude/agents/producer.md` → zero hits, and every new claim (`/pick <brand> <idea-id> <recipe> <gate> <pick>`, `QueueJob`'s `recipe`/`gate`/`awaiting_pick`/`pick` fields, the Recipe registry's one wired slug `character-explainer-with-cast`, the shared `space_id` for `mundotip`, `specPathFor`'s Format+Recipe path shape) was cross-checked against the actual source (`src/production-queue/queue.ts`, `src/commands/pick.ts`, `src/recipe/registry.ts`, `src/production-spec/store.ts`, `data/brands/mundotip/brand-profile.yaml`) and is TRUE. **But** the orchestrator's own instructions (and the issue's intent — "flip docs to present tense... remove the scaffolding") extend this criterion to the sibling command docs; `.claude/commands/pick-cast.md` still narrates the RETIRED flat Idea-status model as current fact: "A `casting` Idea is paused at the Cast gate..." (line 8), "Status moves `casting → produced`" (line 12), "The ledger still owns the Idea's status (`casting → produced`)" (line 30). See Defect QA-1. |
| 1b | `pick-cast.md` and `run-pipeline.md` also updated so the docs-tests pass | **PASS (docs-tests only) / FAIL (doc accuracy)** | `run-pipeline.md` is genuinely and fully corrected — verified against `src/commands/pick.ts`, `src/recipe/registry.ts`. `pick-cast.md` needed **no test to go green**, but that is exactly the gap: the Build Report's claim "already accurate/present-tense... confirmed by grep... zero hits" is not true — the grep used was too narrow to catch a stale, false claim that doesn't use any of the four scaffolding phrases. See Defect QA-1. |
| 2 | Dead `worker.ts`/`scheduler.ts` (+ tests) deleted; nothing references them — reconciled honestly | **PASS** | `test -f src/production-queue/worker.ts` → absent (confirmed by qa directly). `git log --oneline --diff-filter=D -- src/production-queue/worker.ts` → `8891b60 Slice issue-56...` (confirmed pre-dates this slice). `grep -rln scheduler src --include="*.ts"` → `scheduler.ts`, `scheduler.test.ts`, `commands/pick.ts` (live import of `markPickConsumed`, confirmed by reading `pick.ts`). `git diff main -- src/production-queue/scheduler.ts` is docstring-only — no logic/export/test change. `proposal.md` and `handoff.md` both state the reconciliation honestly and accurately, matching what qa independently verified. |
| 3 | `producer-agent.docs-test.ts` passes against the updated `producer.md`, with no false honesty strings | **PASS** | `node --import tsx --test src/production-spec/producer-agent.docs-test.ts` → 4/4 pass. Diffed against `main`: the rewritten subtest asserts the OLD "not yet wired" disclaimer's ABSENCE, `ADR-0008` citation, `awaiting_pick` presence, and `awaiting_cast` absence — all four checked against `producer.md`'s actual text and against `queue.ts`'s real `QueueJob`/`JobStatus` shape. Not a rubber stamp — it pins the live schema, not just an absence. |
| 4 | Strict validate + full test suite + docs-test green | **PASS** | Reproduced directly by qa (see Suite result above); all four commands genuinely green. |

### Per-scenario results (`openspec/changes/issue-59-docs-present-tense/specs/docs-conformance/spec.md`, ADDED-only — no MODIFIED/REMOVED/RENAMED headers, so no archive-safety conflict against `openspec/specs/`, confirmed: no `docs-conformance` capability exists yet under `openspec/specs/`)

| Scenario | Result | Covering test / evidence |
|---|---|---|
| CLAUDE.md carries no future-tense scaffolding for shipped capabilities | **PASS** | Direct grep by qa, zero hits. |
| CLAUDE.md documents the ADR-0011 split lifecycle, not the retired flat one | **PASS** | `report.docs-test.ts`'s "CLAUDE.md documents the final lifecycle" subtest, plus direct reading of `CLAUDE.md`'s `## State` section (lines 192–205). |
| producer.md's queue-job schema description matches the live schema, not the retired one | **PASS** | `producer-agent.docs-test.ts`'s rewritten subtest, cross-checked by qa directly against `src/production-queue/queue.ts`'s `QueueJob`/`JobStatus` exports — exact field-name match. |
| A doc never claims a second Recipe is wired | **PASS** | `CLAUDE.md`, `producer.md`, `run-pipeline.md` each explicitly say one Recipe wired, second is issue #60. `src/recipe/registry.ts`'s `REGISTRY` Map literally has one entry — confirmed by qa. **Scope note:** `pick-cast.md` also makes no such claim (it just doesn't discuss the Recipe registry at all), so this specific Scenario is not violated by Defect QA-1. |
| report.docs-test.ts asserts pick-cast.md's attended-runtime claim, not the retired disclaimer | **PASS (narrowly)** | Test passes exactly as scoped (attended-runtime claim + disclaimer absence + "records the Character" claim) — but the Scenario, and the test, are silent on the rest of `pick-cast.md`'s content, which is where Defect QA-1 lives. Passing this Scenario does not make the doc accurate end-to-end. |
| run-pipeline.docs-test.ts asserts the attended runtime and per-Recipe gates, not "not built yet" | **PASS** | Test passes; diff reviewed — substantive, not weakened. |
| producer-agent.docs-test.ts asserts the live queue schema instead of the retired "not yet wired" claim | **PASS** | As above. |
| worker.ts is absent and unreferenced | **PASS** | Confirmed directly. |
| scheduler.ts is retained because it is live, not dead | **PASS** | Confirmed directly (`pick.ts` imports `markPickConsumed`). |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | `CLAUDE.md`, `producer.md`, `run-pipeline.md` all restate this; `producer.md`'s "Hard boundary" section still says "You never post to Facebook, never log a Post URL, never touch a Channel." No code path changed. |
| Public-metrics-only | **PASS (unaffected)** | No metrics/Apify code touched by this slice. |
| Relative-not-absolute | **PASS (unaffected)** | No scoring code touched by this slice. |
| Explicit-attribution | **PASS** | `/log-post <brand> <idea-id> <recipe> <post-url>` (or `<facebook-url>`) consistently documented in `CLAUDE.md`, `run-pipeline.md`, `log-post.md`, and matches `src/commands/log-post.ts`'s actual usage string, confirmed by grep. |
| Ledger-as-source-of-truth | **PASS (code) / FAIL (doc accuracy)** | The actual ledger code (`src/ledger/ledger.ts`'s `IdeaStatus = "suggested" \| "accepted" \| "rejected"`, `src/asset/asset.ts`'s Asset-grain lifecycle) is unchanged and correct. But `pick-cast.md` — a live, Operator-facing command doc — describes a ledger write pattern (`Idea's status: casting → produced`) that the ledger's own type system does not support and that ADR-0011 explicitly retired ("`casting` is retired as a status.", `docs/adr/0011-...md` line 18). This is a documentation-accuracy gap, not a code violation — see Defect QA-1. |
| Magnific fake / no live-Space calls | **PASS** | `git diff main --name-only` touches 11 files: 3 prose docs, 3 `*.docs-test.ts` (plain `readFile`/`assert`, no Magnific import), 1 docstring-only `.ts` file, 4 openspec files. `grep` for `spaces_*`/`creations_*`/`mcp__magnific` in the diff finds only descriptive prose inside `producer.md` (unchanged behavior, describing what the interactive agent already does) — no test or fixture code calls any Magnific tool, live or fake. `src/space-driver/fixtures/fake-space.ts` is untouched. Confirmed **critical-defect-free** on this axis. |
| Scope discipline (docs/dead-code-only slice) | **PASS** | `git diff main --name-only` confirms no product-code behavior change beyond `scheduler.ts`'s docstring (verified char-by-char via `git diff` — only the module-header comment changed, no code line). |

### Defect list

**QA-1 — `pick-cast.md` still describes the retired flat Idea-status model as current, live behavior — the Build Report's claim that this file is "already accurate" is incorrect (severity: high)**

What's wrong: `.claude/commands/pick-cast.md` (untouched by this slice) states, as present-tense fact:
- Line 8: "A `casting` Idea is paused at the Cast gate with its rendered **Cast** on the Brand's ledger."
- Line 11–12: "...Status moves `casting → produced`."
- Line 26, 30: "The ledger still owns the Idea's status (`casting → produced`); the pick itself lives on the queue job."

This is FALSE under the current (and this-slice-documented) model. Per `docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` line 18, "`casting` is retired as a status" — for the **Idea**. Per `src/ledger/ledger.ts` line 24, `export type IdeaStatus = "suggested" | "accepted" | "rejected"` — there is no code path in which an Idea's own `status` field is ever `"casting"`. The Idea stays `accepted`; it is the **Asset** that moves `in_production` (with `pending_gate: "cast"`) `→ produced` (confirmed directly in `src/asset/asset.ts`'s `ideaAtGate`/`AssetStatus`, and in `src/commands/pick-cast.ts`'s own `assetsAtCastGate` implementation, which checks `a.status === "in_production" && a.pending_gate === "cast"` — never `idea.status === "casting"`).

This directly contradicts the SAME slice's own, correctly-fixed sibling docs:
- `CLAUDE.md` line 78/197: "ADR-0011 retires the old `casting` status" / "the old flat `casting`" Idea-status.
- `.claude/agents/producer.md` line 94: "the retired flat `casting` status lived there before" (Idea stays `accepted`).
- `.claude/commands/run-pipeline.md` line 57: "the old flat `casting` Idea-status is retired; the Idea itself stays `accepted`."

So three of the four docs this slice touches correctly retire this vocabulary, and the fourth (`pick-cast.md`) — deliberately left unedited because the developer's grep for `Target (`/`not yet`/`not built`/`being migrated`/`single-recipe` returned zero hits — still asserts the opposite. That grep was too narrow: it only catches future-tense *scaffolding* phrases, not a present-tense *false* claim written in the confident, current-tense style the rest of the fix uses. This is exactly the "self-consistent-but-wrong" trap job (c) exists to catch: `pick-cast.md` reads fluently and matches its own internal narrative, but it does not match the issue's target reality (ADR-0011) or the rest of this same PR's docs.

This is distinct from `report.md`'s legitimate, deliberately-kept `casting` mention (self-review notes, correctly explained): `report.ts`'s `PRODUCTION_STATES` constant genuinely still *tolerates* a literal `"casting"` value for a Brand whose ledger hasn't run the one-time `ledger/migrate-assets.ts` migration (confirmed: `const PRODUCTION_STATES: readonly string[] = ["casting", "in_production", "produced"];`), and `report.md`'s prose is framed as a rollup/tolerance note, not as "this is how a fresh pick behaves." `pick-cast.md`'s framing carries no such legacy caveat — it states the Idea's status IS `casting` then `produced`, unconditionally, as the primary/current behavior of a fresh `/pick-cast` invocation.

No existing or new docs-test in this slice (or on `main`) asserts this specific claim's absence — `report.docs-test.ts`'s `pick-cast.md` subtest only checks the attended-runtime/ADR-0008 claim, not the Idea-vs-Asset status vocabulary — so this defect passes `npm run test:docs` cleanly and would not be caught by the developer's own "24/24" evidence.

Why "high" not "critical": this is documentation-only — no test breaks, no runtime code path is affected (the actual `pickCastCommand` implementation never writes `"casting"` to the ledger; it correctly follows the Asset-grain model), and no live-Space/Magnific/ledger-corruption risk exists in the *code*. But it is a materially false statement in a live, Operator-facing command doc, it directly contradicts the canonical ADR this whole epic is built on, it contradicts sibling docs fixed in this very slice, and the Build Report's self-assessment incorrectly certifies this file as already correct — which is precisely the "never fabricate a pass" failure mode QA exists to catch on the developer's behalf.

Repro steps:
1. `grep -n "casting" .claude/commands/pick-cast.md` → 4 hits, all describing the **Idea's own status**, none framed as legacy tolerance.
2. Compare against `docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` line 18 ("`casting` is retired as a status") and `src/ledger/ledger.ts` line 24 (`IdeaStatus = "suggested" | "accepted" | "rejected"`).
3. Compare against this same slice's corrected sibling docs: `CLAUDE.md:78,197`, `.claude/agents/producer.md:94`, `.claude/commands/run-pipeline.md:57` — all three explicitly say the Idea's status stays `accepted` and the `casting` Idea-status is retired.
4. Note `src/commands/pick-cast.ts`'s own implementation (`assetsAtCastGate`, line 78–80) never reads or writes `idea.status === "casting"` — it reads `Asset.status === "in_production" && Asset.pending_gate === "cast"`, confirming the doc's claim has no code counterpart.

Suggested fix (for the developer, not prescriptive): rewrite `pick-cast.md`'s three "casting" mentions to describe the Asset-level transition (`in_production` with `pending_gate: "cast"` → `produced`), mirroring the language already used in `CLAUDE.md`/`producer.md`/`run-pipeline.md`; consider adding a `report.docs-test.ts` (or new) assertion pinning the Asset-grain wording so this can't regress, the way `producer-agent.docs-test.ts`'s `awaiting_cast` `doesNotMatch` guard already does for the queue-job schema.

### Overall

**QA Verdict — Round 1: FAIL.** The build/test/validate machinery is genuinely green and the developer's
engineering work on `CLAUDE.md`, `producer.md`, `run-pipeline.md`, the three docs-tests, and the
worker.ts/scheduler.ts reconciliation is careful, well cross-checked against source, and honestly
reported — no rubber-stamping and no over-claiming found in any of those five artifacts. The single
defect (QA-1) is narrow in scope (one doc, three related sentences) but is a real, verified factual error
that contradicts this slice's own governing ADR and its own sibling docs, sits inside the acceptance
criterion's intended scope (this issue exists specifically to eliminate exactly this class of staleness),
and was incorrectly certified as correct in the Build Report. Per the gate rules, a defect must be fixed
and re-verified, not waived — hand this back to the developer for a Round-2 fix limited to `pick-cast.md`
(and, ideally, a regression test for it), then re-run `npm run test:docs` and re-submit.

---

## Build Report — Round 2

### What changed (in response to Defect QA-1)

QA's Round-1 defect (QA-1, high) was correct and specific: `.claude/commands/pick-cast.md` — certified
"already accurate/present-tense" in the Round-1 Build Report on the strength of a grep for
`Target (`/`not yet`/`not built`/`being migrated`/`single-recipe` (zero hits) — still stated the RETIRED
flat Idea-status model as present-tense fact. That grep only catches *future-tense scaffolding* phrases;
it cannot catch a *present-tense false claim* written in the same confident style as the rest of the
(correct) fix. Round 2:

1. **Fixed all four instances in `pick-cast.md`** (three exactly as QA quoted, plus one QA didn't quote
   but is the same class of bug, found during the re-sweep):
   - Frontmatter `description`: "for a casting Idea of the named Brand" → "for an Idea of the named
     Brand whose Asset is paused at the Cast gate".
   - Opening paragraph: "A `casting` Idea is paused at the Cast gate... Status moves `casting →
     produced`." → "An Idea with an Asset **paused at the Cast gate** (`in_production`, `pending_gate:
     "cast"` — ADR-0011; the Idea itself stays `accepted`)... That Asset moves `in_production →
     produced`."
   - "Gate 2 — Brand" paragraph: "The ledger still owns the Idea's status (`casting → produced`)" → "The
     ledger still owns that Asset's status (`in_production → produced`; the Idea itself stays `accepted`
     throughout — ADR-0011)".
   - "How the render runs" callout: "recording the pick does not move the Idea to `produced` on its own"
     → "recording the pick does not move that Asset to `produced` on its own (the Idea itself stays
     `accepted` throughout)". This exact sentence wasn't in QA's three quoted lines but is the same
     Idea-vs-Asset conflation — caught while re-reading the whole file line-by-line rather than trusting
     the original narrow grep a second time.
   All four now match the language already used in `CLAUDE.md`/`producer.md`/`run-pipeline.md` (fixed
   correctly in Round 1) — the Idea stays `accepted`; the **Asset** pauses `in_production` with
   `pending_gate: "cast"`, then moves `→ produced`.

2. **Re-swept every other command/agent doc** for the same class of miss (task 3 in the QA hand-back):
   `queue.md`, `log-post.md`, `report.md`, `review-ideas.md`, `track-performance.md`, `run-trends.md`,
   `pick.md`, and the four content-agent `.md` files — grepped for `casting`, "Idea to `produced`", "the
   Idea's status (`...`)", and "move the Idea", then read the two remaining hits (`report.md`, `pick.md`)
   in context:
   - **`report.md`** — NOT a second instance. `report.ts`'s `PRODUCTION_STATES` constant genuinely
     tolerates the literal `"casting"` value defensively for a Brand whose ledger predates the one-time
     `ledger/migrate-assets.ts` migration; `report.md`'s prose is framed as that rollup/tolerance note,
     never as "this is what a fresh `/pick-cast` does." This is exactly the distinction QA's own Round-1
     verdict independently drew and explicitly cleared ("report.md's legitimate, deliberately-kept
     `casting` mention... distinct from [QA-1]") — left unchanged, consistent with QA's own finding, not
     re-litigated.
   - **`pick.md`** — one looser (not literally false, but imprecise) instance: "recording it does not
     move the Idea forward on its own" doesn't name a specific false status value the way pick-cast.md's
     bug did, but for full precision and consistency with the now-fixed sibling docs it is tightened to
     "does not move that Asset forward on its own (the Idea itself is untouched by the pick)".
   No other doc had any hit at all.

3. **Added a regression test** to `src/commands/report.docs-test.ts` (same describe block as the
   existing pick-cast.md subtest): `pick-cast.md describes the Asset-grain Cast-gate lifecycle, not the
   retired flat Idea status (QA-1 regression)`. Two `doesNotMatch` guards target the EXACT defect
   phrasing (`` /casting\s*→\s*produced/i `` and `` /`casting`\s+Idea\s+is\s+paused/i ``) plus two
   positive `match` assertions (`in_production`, `pending_gate` both present in the doc). **Verified,
   not assumed**, that the guards actually catch the regression: round-tripped the ORIGINAL (pre-fix)
   `pick-cast.md` text back into the file, re-ran `node --import tsx --test
   src/commands/report.docs-test.ts`, confirmed the new subtest fails (`not ok 14`) against that text,
   then restored the fixed file (`diff` confirmed byte-identical to the fix) and re-ran the full suite
   green. This mirrors `producer-agent.docs-test.ts`'s existing `awaiting_cast` `doesNotMatch` guard
   pattern, per QA's suggested fix.

4. **Updated the OpenSpec change** (`specs/docs-conformance/spec.md`): one new Scenario under "The
   engineering documentation set describes the built attended, multi-format flow in present tense"
   (pick-cast.md's Asset-grain lifecycle) and one new Scenario under "Docs-conformance tests pin the
   CURRENT reality, never a superseded honesty disclaimer" (the new regression guard, including the
   verified-against-pre-fix-text property). Both spec deltas stay under the same `## ADDED Requirements`
   header used in Round 1 — the `docs-conformance` capability is not yet archived under `openspec/specs/`
   (confirmed by both my Round-1 check and QA's independent Round-1 confirmation), so there is no
   `MODIFIED`/`RENAMED` header-matching concern; adding Scenarios to an as-yet-unarchived `ADDED`
   Requirement is archive-safe by construction. `proposal.md` and `tasks.md` gained matching Round-2
   sections/bullets documenting the fix (this handoff is not the only record of it).

### Files touched (Round 2, on top of Round 1)

- `.claude/commands/pick-cast.md` — the QA-1 fix (4 corrected passages).
- `.claude/commands/pick.md` — one precision tightening (same class, not literally false).
- `src/commands/report.docs-test.ts` — 1 new regression subtest appended.
- `openspec/changes/issue-59-docs-present-tense/proposal.md` — new "What Changes" bullet + updated
  "Impact" file lists.
- `openspec/changes/issue-59-docs-present-tense/tasks.md` — new `## 9. Round-2 fix` section.
- `openspec/changes/issue-59-docs-present-tense/specs/docs-conformance/spec.md` — 2 new Scenarios.
- `openspec/changes/issue-59-docs-present-tense/handoff.md` — this Round-2 Build Report.

**Not touched** (checked, found already correct): `queue.md`, `log-post.md`, `review-ideas.md`,
`track-performance.md`, `run-trends.md`, `report.md` (deliberately, per the reasoning above), all four
content-agent `.md` files, and every file already corrected in Round 1 (`CLAUDE.md`, `producer.md`,
`run-pipeline.md`, `scheduler.ts`, `run-pipeline.docs-test.ts`, `producer-agent.docs-test.ts`).

### How to run

Same four commands as Round 1 — all re-verified green after the Round-2 fix:

```bash
npm test                                              # 994/994 — still unaffected (docs + test-file only)
npm run test:docs                                     # 25/25 — was 24/24 after Round 1, +1 new regression test
npm run build                                         # tsc -p tsconfig.build.json — clean
npx openspec validate issue-59-docs-present-tense --strict   # green
npx openspec validate --all --strict                  # 19/19 specs + this change, all green
```

To verify the new regression test actually catches the regression (not just that it passes today):
```bash
# From the pre-fix commit (main, before this branch), diff .claude/commands/pick-cast.md against the
# fixed version on this branch, swap the old text in, and re-run:
node --import tsx --test src/commands/report.docs-test.ts   # the new subtest fails against old text
# restore the fixed file, re-run — green again.
```

### Defect QA-1 — resolution self-assessment

| Item | Status | Evidence |
|---|---|---|
| Fix all 3 quoted false claims in `pick-cast.md` | **Done** | `git diff` on `.claude/commands/pick-cast.md`; `grep -n "casting" .claude/commands/pick-cast.md` now shows exactly one hit, the historical/explanatory sentence ("the retired flat `casting` Idea-status is gone"), not a present-tense claim. |
| Fix the 4th (unquoted) instance found on re-read | **Done** | The "How the render runs" callout's "move the Idea to `produced`" phrase, same conflation, fixed alongside the other three. |
| Consider a docs-test pinning `pick-cast.md`'s status vocabulary | **Done** | New subtest in `report.docs-test.ts`, verified (not assumed) to fail against the pre-fix text via an actual round-trip test run, not just written and trusted. |
| Re-check sibling docs for a second instance | **Done** | All 10 remaining command/agent docs re-grepped; the 2 hits found (`report.md`, `pick.md`) were individually read in context and resolved (one correctly left as-is per QA's own Round-1 reasoning, one tightened for precision). |
| Re-run all four gates green | **Done** | `npm test` 994/994, `npm run test:docs` 25/25, `npm run build` clean, `npx openspec validate issue-59-docs-present-tense --strict` valid — all reproduced above. |
| Update OpenSpec change, keep headers archive-safe | **Done** | 2 new Scenarios added under the existing `ADDED Requirements` (no capability archived yet, confirmed both rounds — no header-matching risk). |

### Self-review notes (Round 2)

- Did not simply trust QA's three quoted lines as the complete defect — re-read the WHOLE file
  line-by-line and found a fourth instance of the same conflation QA didn't quote. A narrower fix
  matching only QA's exact quotes would have left a live false claim in the same file.
- Deliberately did NOT re-open `report.md`, despite it containing the word "casting" — QA's own Round-1
  verdict already analyzed that exact file/line and explicitly cleared it with reasoning I re-verified
  independently (traced `report.ts`'s `PRODUCTION_STATES` tolerance logic and `loadReport`'s
  normalization path myself before concluding the doc's framing is accurate, not just deferring to QA's
  say-so).
- The new regression test's negative guards were not just written by pattern-matching the bug — they were
  mechanically verified against the actual pre-fix file content (round-tripped in, tested, round-tripped
  back out, diffed byte-identical) before being trusted as "would have caught this."

### Known limits (unchanged from Round 1, still accurate)

See the Round-1 Build Report above — nothing in Round 2 changes any of Round 1's documented known limits
(a second wired Recipe remains future work / issue #60; `producer.md`'s Space-targeting re-point remains
deferred per `src/recipe/registry.ts`'s own docstring; there is still no standing lint beyond the
`*.docs-test.ts` convention this slice extends).

---

## QA Verdict — Round 2: PASS

### Suite result

All four gates re-run directly by qa, genuinely green:

- `npm test` → **994/994 pass**, 0 fail (283 suites) — unaffected, as expected.
- `npm run test:docs` → **25/25 pass**, 0 fail (5 suites) — up from 24/24 (one net-new regression subtest).
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, exit 0.
- `npx openspec validate issue-59-docs-present-tense --strict` → `Change 'issue-59-docs-present-tense' is valid`.
- `npx openspec validate --all --strict` → `Totals: 19 passed, 0 failed (19 items)`.

### Defect QA-1 — verified fixed

Re-read `.claude/commands/pick-cast.md` in full. All four instances of the retired flat Idea-status
claim are gone:
- Frontmatter, opening paragraph, "Gate 2 — Brand" paragraph, and the "How the render runs" callout now
  all correctly say the Idea stays `accepted` and the **Asset** moves `in_production`
  (`pending_gate: "cast"`) `→ produced`.
- `grep -n "casting" .claude/commands/pick-cast.md` → exactly **one** hit left, and it is the
  historical/explanatory sentence ("the retired flat `casting` Idea-status is gone, the Idea itself stays
  `accepted`") — correctly framed as past-tense explanation, not a present-tense claim. Confirmed by qa
  directly reading the file, not by trusting the Build Report.
- Cross-checked the replacement wording against the real code: `src/ledger/ledger.ts`'s
  `IdeaStatus = "suggested" | "accepted" | "rejected"` and `src/asset/asset.ts`'s `ideaAtGate` (checks
  `status === "in_production" && pending_gate === gate`) — the doc's new claims match exactly.
- `.claude/commands/pick.md`'s parallel tightening ("does not move that Asset forward... the Idea itself
  is untouched by the pick") is a genuine precision improvement, consistent and not overstated.

**Regression test judged genuinely load-bearing, not a rubber stamp.** qa independently reproduced the
developer's own claimed verification: checked out the pre-fix (Round-1, commit `f38730f`) text of
`pick-cast.md` into the working tree, ran `node --import tsx --test src/commands/report.docs-test.ts`,
and confirmed the new subtest ("pick-cast.md describes the Asset-grain Cast-gate lifecycle, not the
retired flat Idea status (QA-1 regression)") **fails** (`not ok 14`) with the exact expected assertion
message ("must not claim the Idea's status chain runs casting → produced..."). Restored the fixed file
(`git status --short` clean afterward) and re-ran the same test file — green (14/14). The two
`doesNotMatch` guards target the exact defect phrasing, and the two `match` guards pin real, checkable
positive claims (`in_production`, `pending_gate`) rather than only asserting an absence — matches the
`producer-agent.docs-test.ts` `awaiting_cast` guard pattern already judged non-rubber-stamp in Round 1.

### Own independent sweep for the same defect class (instruction 4)

qa ran its own grep across every command/agent doc, independent of the developer's claimed sweep:
```
grep -rn "casting" .claude/commands/*.md .claude/agents/*.md CLAUDE.md
grep -rln "awaiting_cast\|phase: *cast\|accepted → casting" .claude/commands/*.md .claude/agents/*.md CLAUDE.md docs/*.md
```
Result: the only remaining `casting` hits are the four legitimate, already-cleared cases (`pick-cast.md`'s
one historical note; `report.md`'s two legacy-tolerance mentions, matching `report.ts`'s
`PRODUCTION_STATES` constant; `producer.md`/`run-pipeline.md`/`CLAUDE.md`'s "retired" explanatory notes).
No `awaiting_cast`/`phase: cast`/`accepted → casting` hits anywhere. A broader sweep of the remaining
untouched command docs (`log-post.md`, `queue.md`, `review-ideas.md`, `run-trends.md`,
`track-performance.md`, the four content-agent `.md` files, plus the engineering `developer.md`/`qa.md`/
`build-issue.md`) for `Target (`/`not yet`/`not built`/`being migrated`/`single-recipe`/`casting` turned
up only unrelated, accurate uses of "not yet" (a real Asset-status guard in `log-post.md`, a genuine v1
scope note in `review-ideas.md`, a genuine onboarding-copy caveat in `trend-scout.md`) — none describing
the multi-format model itself as unbuilt. No new defect found.

### OpenSpec re-check (archive-safety + no Round-1 regression)

- `grep -n "^## " openspec/changes/issue-59-docs-present-tense/specs/docs-conformance/spec.md` →
  `## ADDED Requirements` only, still the sole header — the two new Scenarios were added under existing
  `ADDED` Requirements, no `MODIFIED`/`REMOVED`/`RENAMED` header introduced. `ls openspec/specs/` still has
  no `docs-conformance` directory, so there is nothing to conflict against — archive-safe by construction,
  confirmed independently (not just re-trusting Round 1's finding).
- `npx openspec validate --all --strict` (19/19) confirms none of the 18 already-archived capability specs
  regressed.
- `git diff f38730f c839227 --name-only` confirms Round 2 touched exactly 7 files
  (`pick-cast.md`, `pick.md`, `report.docs-test.ts`, `handoff.md`, `proposal.md`, `tasks.md`,
  `specs/docs-conformance/spec.md`) — nothing from Round 1's already-passed set (`CLAUDE.md`,
  `producer.md`, `run-pipeline.md`, `scheduler.ts`, `run-pipeline.docs-test.ts`,
  `producer-agent.docs-test.ts`) was touched or reopened.

### Always-rules + Magnific-fake re-check

- **Ledger-as-source-of-truth** — now **PASS** outright (was PASS-code/FAIL-doc in Round 1): the doc/code
  mismatch that was the only gap here is fixed; `pick-cast.md` now accurately describes the Asset-grain
  ledger write.
- **Generate-never-publish, public-metrics-only, relative-not-absolute, explicit-attribution** — unchanged
  from Round 1's PASS (no code touched; `pick-cast.md`'s attribution/publish language untouched by the
  Round-2 diff).
- **Magnific fake / no live-Space calls** — **PASS**. `git diff f38730f c839227 -- .claude/commands/pick-cast.md .claude/commands/pick.md src/commands/report.docs-test.ts | grep -n "spaces_\|creations_\|mcp__magnific"` → zero hits. Round 2 touches no Magnific-port code, no fixtures.
- **Scope discipline** — **PASS**. `git diff f38730f c839227 --name-only` confirms product code is
  untouched in Round 2 (only two `.md` docs, one `.docs-test.ts` file, and OpenSpec/handoff files).

### Per-criterion results (Round 2)

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | `CLAUDE.md`/`producer.md` present tense, stale notes removed (extended to sibling docs per orchestrator scope) | **PASS** | `pick-cast.md` now correctly matches `CLAUDE.md`/`producer.md`/`run-pipeline.md`'s Asset-grain vocabulary; qa's own grep sweep confirms no remaining false claim anywhere in the command/agent doc set. |
| 1b | `pick-cast.md`/`run-pipeline.md` updated, docs-tests pass | **PASS** | `pick-cast.md` now genuinely accurate (not just test-green); new regression test pins it. |
| 2 | Dead worker.ts/scheduler.ts reconciled | **PASS** (unchanged from Round 1 — not touched in Round 2, re-confirmed still true). |
| 3 | `producer-agent.docs-test.ts` passes, no false honesty strings | **PASS** (unchanged from Round 1). |
| 4 | Strict validate + full suite + docs-test green | **PASS** — 994/994, 25/25, build clean, both validate commands green, all reproduced directly by qa. |

### Overall

**QA Verdict — Round 2: PASS.** Defect QA-1 is fully and correctly resolved: all four instances of the
false, retired flat Idea-status claim in `pick-cast.md` are fixed and now match the real per-Asset
lifecycle, the parallel imprecision in `pick.md` is tightened, the developer's own independent re-sweep
of every other command/agent doc found nothing else (confirmed by qa's own independent sweep — no new
defect), a genuinely load-bearing regression test was added and independently re-verified by qa
(round-tripped the pre-fix text, confirmed the new test fails, restored, confirmed green again), and the
OpenSpec delta remains archive-safe (`ADDED`-only, no capability archived yet). All four required gates
are genuinely green, no product-code behavior changed, no live-Space/Magnific calls anywhere in the diff,
and all five always-rules now hold cleanly including ledger-as-source-of-truth (the one rule that was only
partially satisfied in Round 1). This slice is ready to proceed to a PR.
