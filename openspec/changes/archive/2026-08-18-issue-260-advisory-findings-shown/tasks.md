## 1. Confirm the terrain before writing any code

- [x] 1.1 Read `src/commands/run-pipeline.ts`'s readiness-print block, `src/commands/
  run-pipeline-readiness.ts` (`isActorExistenceFinding`, `probeConfiguredActors`), `src/readiness/
  classify.ts`, `src/readiness/check-config.ts` — enumerate every advisory `code` that exists today
  (8 total: `space_inaccessible_advisory`, `credits_low_advisory`, `null_baseline`, `off_niche_seed`,
  `niche_unset`, `config_todo`, `voice_unset`, `empty_banned_words`) plus the two actor-existence codes
  #253 already fixed via its carve-out.
- [x] 1.2 Read issue #253's archived change (`openspec/changes/archive/
  2026-08-18-issue-253-facebook-actor-slug/`) — `proposal.md`'s Decision + Round 2 addendum, and
  `handoff.md`'s QA Round 2 Verdict — to ground this ticket's general fix in the exact gap that change
  left open, and to reuse its print-format convention (`[BLOCK]`/`[WARN]` under `"Readiness check:"`).
- [x] 1.3 Read `src/commands/run-pipeline.test.ts` end to end for every assertion that depends on the
  OLD silent-when-advisory-only behaviour — the C21 "forces a block to observe an advisory" test, and
  the two "no readiness output when healthy" tests whose default fixture (`baseline.updated_at: null`)
  already computes a `null_baseline` advisory that was merely never printed before this change.

## 2. Decide and record the conductor's advisory-print policy (autonomous — argued, not assumed)

- [x] 2.1 Write `proposal.md`'s "Decision" section BEFORE implementing: every Finding prints
  unconditionally; silence only when there are zero Findings; printing is fully decoupled from
  blocking. Argue why NOT keeping any advisory suppressed (per the issue's own instruction to argue,
  not assume, since some advisories could in principle be noisy enough to deserve suppression).

## 3. Implement the general print rule (test-first)

- [x] 3.1 Rewrite the C21 tests in `run-pipeline.test.ts` FIRST, so they assert the actual wanted
  behaviour (the `null_baseline` advisory prints on its own, no forced block) — confirm they FAIL
  against the current code (a block-free run currently prints nothing).
- [x] 3.2 Fix the two "no readiness output when healthy" tests (AC2's `"produces no readiness output
  when the Brand is healthy"` and the actor-existence describe block's `"prints no readiness output at
  all when every configured actor probes OK and nothing else is wrong"`) to use a ledger with a
  baseline already measured — otherwise both fixtures silently already carry a `null_baseline` advisory
  that the OLD code happened to swallow and the NEW code will now correctly print, breaking their
  "no output" assertion for the wrong reason.
- [x] 3.3 Add the new describe block proving the general rule for every previously-silent code named in
  the issue, each asserting on `runPipelineCommand`'s printed `turns` (never `runReadiness`'s bare
  return value) — the exact blind spot #253's own QA verdict flagged.
- [x] 3.4 Implement: replace `run-pipeline.ts`'s conditional print branch (`blockFindings.length > 0`
  else actor-carve-out) with a single unconditional `if (findings.length > 0) { print every finding }`.
  Remove the now-dead `isActorExistenceFinding` (`run-pipeline-readiness.ts`) and its import.
- [x] 3.5 Run `run-pipeline.test.ts` alone — confirm every rewritten/new test goes GREEN against the
  fixed code (having confirmed RED against the old code in 3.1/3.3's initial run).
- [x] 3.6 Break-it-on-purpose proof: temporarily revert the print branch to the OLD
  `blockFindings.length > 0` gate (no unconditional branch), re-run `run-pipeline.test.ts`, confirm
  exactly the new/rewritten advisory-alone tests go red, restore, confirm green again — captured in
  `handoff.md`.

## 4. Update the conductor's own documentation

- [x] 4.1 `.claude/commands/run-pipeline.md` — correct the stale "Only surfaces issues when there are
  blocking gaps" line to describe the new unconditional-print, decoupled-from-blocking policy.

## 5. Full suite, build, self-review, Build Report

- [x] 5.1 `npm test` (type-checks via `tsc --noEmit` first) — green, compare test count against the
  pre-change baseline.
- [x] 5.2 `npm run test:docs` — green (no docs-test pins the old "silent when advisory-only" wording
  verbatim, confirmed by grep before editing `run-pipeline.md`).
- [x] 5.3 `npm run build` — clean.
- [x] 5.4 `openspec validate issue-260-advisory-findings-shown --strict` and `openspec validate --all
  --strict` — green.
- [x] 5.5 Self-review/simplify pass: confirm `isActorExistenceFinding` has zero remaining references
  anywhere in `src/`; confirm no leftover dead code from the break-it-on-purpose mutation in 3.6;
  confirm every acceptance criterion in the issue maps to a specific test in the Build Report's table.
- [x] 5.6 Write the Build Report into `handoff.md`, explicitly flagging every fake used and confirming
  no live Apify/Magnific call was made anywhere in this change's tests.
