## ADDED Requirements

### Requirement: Each of the 11 model-prompting Skills' `build-prompt.py` is ported to a `build-prompt.ts` that preserves its validation behaviour and CLI contract exactly

Every `.claude/skills/{chatgpt-image-2,grok-imagine,grok-imagine-1-5,happy-horse,kling-3-0,kling-3-0-omni,nano-banana-2,seedance-2-0,seedream-4-5,seedream-5-0-pro,veo-3-1}/scripts/build-prompt.ts` SHALL be runnable with `npx tsx scripts/build-prompt.ts` from inside that entry's own folder, SHALL enforce the same clause/mode/reference-cap/negation/word-budget/timestamp-sum validation rules its Python predecessor enforced, and SHALL preserve the same stdout-prompt/exit-0 success shape and the same `PromptValidationError: <message>`-on-stderr/exit-2 failure shape for equivalent input.

#### Scenario: an identical CLI invocation of the Python script and the TypeScript port produces byte-identical stdout

- **GIVEN** a skill's `build-prompt.py` (before its deletion) and its ported `build-prompt.ts`
- **WHEN** both are invoked with the same CLI arguments producing a successful build
- **THEN** their stdout is byte-identical
- **AND** this holds for at least three skills of differing script size (verified for four:
  `chatgpt-image-2`, `kling-3-0`, `veo-3-1`, `seedream-5-0-pro`) — transcripts recorded in this change's
  `handoff.md`

#### Scenario: a validation failure in the TypeScript port raises the same class of error the Python script raised

- **GIVEN** a `build-prompt.ts` invoked with arguments that violate one of its ported validation rules
  (e.g. a negation-only clause set, an out-of-range reference count, mismatched timestamp-segment
  durations)
- **WHEN** `buildPrompt(...)` is called with those arguments
- **THEN** it throws `PromptValidationError` with a message describing the same violation the Python
  `PromptValidationError` described for the equivalent input

### Requirement: Each of the 11 Skills' `test_build_prompt.py` is ported to Node's built-in test runner and runs inside `npm test`, preserving every ported rule's own test coverage

Every `.claude/skills/<entry>/scripts/build-prompt.test.ts` SHALL use `node:test` and `node:assert/strict`, SHALL be discovered and executed by `npm test` (via `package.json`'s `test` script glob), and the total ported test count across all 11 entries SHALL equal 244 — the same total the issue's own re-derivation of the Python suite found — with each individual entry's count matching its own Python count exactly (chatgpt-image-2: 10, grok-imagine: 21, grok-imagine-1-5: 35, happy-horse: 26, kling-3-0: 26, kling-3-0-omni: 13, nano-banana-2: 26, seedance-2-0: 12, seedream-4-5: 22, seedream-5-0-pro: 33, veo-3-1: 20).

#### Scenario: `npm test` runs and passes all 244 ported tests alongside the existing suite

- **GIVEN** the repository with all 11 skills' tests ported and `package.json`'s `test` script glob
  extended to include `.claude/skills/**/*.test.ts`
- **WHEN** `npm test` is run
- **THEN** the total test count is the pre-port baseline plus exactly 244, with 0 failures

#### Scenario: a broken validation rule is caught by its own ported test, proving the port is not vacuous

- **GIVEN** one ported validation rule deliberately disabled in a `build-prompt.ts` (e.g. the negation
  guard in `chatgpt-image-2`, changed to `if (false && allNegation(...))`)
- **WHEN** that skill's `build-prompt.test.ts` is run
- **THEN** exactly the test(s) asserting that rule go red, while every other test in the file stays
  green
- **AND** restoring the rule makes the full file green again with no residual diff

#### Scenario: the ported script's own type-checking is included in `npm test`'s pretest step

- **GIVEN** `tsconfig.json`'s `include` extended to `.claude/skills/**/*.ts` and its `rootDir`
  restriction removed (a single `rootDir` cannot legally span both `src/` and `.claude/skills/`)
- **WHEN** `npm test`'s `tsc -p tsconfig.json --noEmit` pretest step runs
- **THEN** every ported `build-prompt.ts` and `build-prompt.test.ts` is type-checked under this
  repository's strict compiler settings (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, etc.), and a type error in either would fail `npm test` before any test runs

### Requirement: The ported Skill scripts are excluded from `npm run build`'s compiled output, matching every other Skill script in the catalogue

`tsconfig.build.json` SHALL set an explicit `rootDir: "src"` override and SHALL exclude `.claude/skills/**`, so that `npm run build`'s `dist/` output contains no compiled artifact for any ported `build-prompt.ts` — the Skill scripts run only via `npx tsx`, requiring no build step, exactly as documented for every other Skill script in this catalogue.

#### Scenario: `npm run build` succeeds and `dist/` contains no `.claude/skills` output

- **GIVEN** `tsconfig.build.json` as shipped by this change
- **WHEN** `npm run build` is run
- **THEN** it exits 0
- **AND** no path under `dist/` corresponds to any file under `.claude/skills/`

### Requirement: Each ported Skill's `SKILL.md` and `metadata.yaml` name the TypeScript entry point, and no `python3` reference survives anywhere under `.claude/`

Every one of the 11 ported Skills' `SKILL.md` "Closing — validation" section SHALL invoke `npx tsx scripts/build-prompt.ts` (not `python3 scripts/build-prompt.py`) and SHALL name `scripts/build-prompt.test.ts` run via `node --import tsx --test` (not `scripts/test_build_prompt.py` run via `python3`); every one of the 11 `metadata.yaml` files' `scripts:` and `evals:` entries SHALL name the `.ts` paths, and `tools:` SHALL be an empty array. `grep -rn "python3" .claude/` SHALL return no results.

#### Scenario: every one of the 11 metadata.yaml files declares an empty tools array and .ts script/eval paths

- **GIVEN** all 11 `.claude/skills/<entry>/metadata.yaml` files as shipped by this change
- **WHEN** each is parsed
- **THEN** `tools` is `[]`, every `scripts[].path` ends in `.ts`, and every `evals[].path` names one of
  that same entry's own `scripts[].path` values (the existing manifest-completeness guard's own
  cross-check, unmodified by this change, continues to pass)

#### Scenario: grepping the whole `.claude/` tree for `python3` finds nothing

- **GIVEN** this change's full diff, including the deletion of all 22 `.py` files
- **WHEN** `grep -rn "python3" .claude/` is run
- **THEN** it returns no matches

#### Scenario: the existing manifest-completeness and dangling-citation guard stays green with no code change

- **GIVEN** `src/claude-skills/reference-citation-guard.docs-test.ts` (issue #212/#252, unmodified by
  this change) run against the real, ported tree
- **WHEN** it is run
- **THEN** it reports zero incomplete-manifest defects and zero dangling reference citations across all
  11 entries, proving the existing guard's own field checks (an empty `tools` array is a valid "present"
  array; a `.ts`-suffixed `evals[].path` still names a real `scripts[].path`) already covered this
  change's shape without needing to change

### Requirement: All 22 `.py` files are deleted only after every port is proven green

The 11 `scripts/build-prompt.py` and 11 `scripts/test_build_prompt.py` files SHALL be deleted from the repository only once every one of the 11 skills' TypeScript ports passes its own ported test suite, the identical-output comparisons for the sampled skills are complete, and the non-vacuousness proof is complete — never before.

#### Scenario: no .py file remains under .claude/skills after this change ships

- **GIVEN** this change's final tree
- **WHEN** `find .claude/skills -name "*.py"` is run
- **THEN** it returns no results
