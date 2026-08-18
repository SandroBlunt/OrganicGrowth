## Why

Issue #255 corrects a false premise in its parent, #212 ("The catalogue ships"): #212's brief called the
11 model-prompting Skills' `scripts/build-prompt.py` "6,578 lines of untested Python." That count folds
the 244 passing tests in as if they were untested source. The real position, confirmed by running all 11
Python test files on 2026-08-17: **4,077 lines of script, 2,501 lines of tests, 244 tests, all passing.**

The actual defect is narrower and more specific: **none of those 244 tests run in CI.** `package.json`
and the workflow files carry no reference to `python` at all, so `npm test` never touches them and
nothing would report a break — the same "green and blind" shape the #195 epic hit five times, one step
removed (here the tests are not even green-and-blind; they are simply invisible to the harness that
would make them green).

The Operator decided on 2026-08-17: **port the scripts to TypeScript**, rather than the two cheaper
alternatives (wiring the existing Python tests into CI as-is, or dropping `python3` and the validation
logic it carries entirely). The port puts everything on one runtime, brings all 244 tests inside
`npm test`, and removes a runtime dependency a licensee installing one of these catalogue entries would
otherwise need — the same "no `python3` interpreter needed" outcome issue #212's own `docs/catalogue-
manifest-format.md` already predicted this change would produce (`tools: []` for every entry once #255
lands).

The scripts are not glue to be dropped: they enforce a clause skeleton, reject negation-only prompts,
enforce mutually-exclusive modes (Veo's Ingredients vs first-and-last-frame; a Recipe's own mode-of-the-
day), check per-model reference-count caps, verify timestamp segments sum to a requested duration, and
accept legacy argument aliases. That validation logic is exactly what issue #255 requires survive the
port, provably, not merely by inspection.

## What Changes

- **Port all 11 `scripts/build-prompt.py` to `scripts/build-prompt.ts`** (`chatgpt-image-2`,
  `grok-imagine`, `grok-imagine-1-5`, `happy-horse`, `kling-3-0`, `kling-3-0-omni`, `nano-banana-2`,
  `seedance-2-0`, `seedream-4-5`, `seedream-5-0-pro`, `veo-3-1`) — same validation rules, same CLI
  argument shape, same stdout/stderr/exit-code contract (`PromptValidationError: <message>` on stderr,
  exit 2; the assembled prompt on stdout, exit 0), runnable with `npx tsx scripts/build-prompt.ts ...`
  from inside the entry's own folder, exactly mirroring how the Python script was invoked. Every
  script's own doc-comment states, verbatim, that it is a port of the equivalent `build-prompt.py`.
- **Port all 11 `scripts/test_build_prompt.py` to `scripts/build-prompt.test.ts`**, Node's built-in test
  runner (`node:test` + `node:assert/strict`), one `describe` per Python `unittest.TestCase` class, one
  `it` per Python `test_*` method (a Python `subTest` loop inside one test method stays one `it` with an
  internal loop, matching the Python test-count semantics — `unittest`'s own "tests run" counter does not
  inflate on `subTest`, confirmed by direct run of the original suite before porting).
- **Wire the ported tests into `npm test`.** `package.json`'s `test` script glob gains
  `".claude/skills/**/*.test.ts"` alongside the existing `src/**/*.test.ts` /
  `src/**/*.docs-test.ts` globs, so the 244 ported tests run on every `npm test`, not merely on request.
  `tsconfig.json`'s `include` gains `.claude/skills/**/*.ts` (and its `rootDir` restriction is removed,
  since a shared `rootDir` cannot legally span both `src/` and `.claude/skills/`) so the `tsc --noEmit`
  type-check step that gates `npm test` also type-checks the ported scripts under this repository's
  strict compiler settings. `tsconfig.build.json` gains an explicit `rootDir: "src"` override and excludes
  `.claude/skills/**`, so `npm run build`'s `dist/` output is unaffected — the Skill scripts need no
  build step (`npx tsx` runs them directly), matching every other Skill script in this catalogue.
- **Update each of the 11 `SKILL.md`'s "Closing — validation" section and each `metadata.yaml`'s
  `scripts:`/`evals:` entries** to name the TypeScript entry point (`scripts/build-prompt.ts`,
  `scripts/build-prompt.test.ts`) and the `npx tsx` / `node --import tsx --test` invocation, in place of
  `python3 scripts/build-prompt.py` / `python3 scripts/test_build_prompt.py`.
- **Each `metadata.yaml`'s `tools:` array becomes `[]`** — no runtime interpreter is declared as a
  dependency any more, exactly as `docs/catalogue-manifest-format.md` (issue #212) already stated this
  change would produce. The existing manifest-completeness guard (`src/claude-skills/reference-citation-
  guard.docs-test.ts`, issue #212) already accepts an empty `tools` array (its own check is "present, each
  item if any has non-empty name/kind") — no guard change is required, and none is made.
  `evals[].path` is updated to `scripts/build-prompt.test.ts`, still naming one of that same entry's own
  `scripts:` paths — the guard's "an `evals` path must name a declared `scripts:` entry" check (issue
  #212 Round 2) continues to pass without modification.
- **Delete all 22 `.py` files** (`build-prompt.py` + `test_build_prompt.py` × 11), only once every port's
  tests pass and the Python-vs-TypeScript identical-output check (below) is done.
- **No `python3` reference survives anywhere under `.claude/`** — verified by `grep -rn "python3" .claude/`
  returning nothing (see `handoff.md`).

## What does not change

- The five shared craft-reference documents at `.claude/references/` (issue #252) are untouched.
- `docs/catalogue-manifest-format.md` is untouched — its own text already anticipated this exact change
  ("Once #255 lands, this `tools` block becomes `[]` for every entry — a follow-up to that change, not
  this one").
- `src/claude-skills/manifest-completeness-scan.ts`, `reference-citation-scan.ts`, and
  `reference-citation-guard.docs-test.ts` are untouched — the existing guards already accept the shape
  this change produces (empty `tools`, `evals`/`scripts` paths that agree with each other) without any
  code change.
- The 5 workflow Skills that carry no `metadata.yaml` (`fetch-curated-source`,
  `produce-character-explainer`, `produce-news-carousel`, `produce-news-short-script`,
  `write-social-copy`) are out of scope, per the same reasoning issue #212 already used.
- No production runtime module (`src/`) other than `tsconfig.json` / `tsconfig.build.json` /
  `package.json`'s build tooling is touched — this is a Skill-catalogue and toolchain change only.
- No live Magnific or Apify call is made anywhere in this change; it is hermetic by construction (pure
  text-in/text-out CLI scripts and their tests).

## Impact

- **Added:** 11 × `scripts/build-prompt.ts`, 11 × `scripts/build-prompt.test.ts` under
  `.claude/skills/<entry>/`.
- **Modified:** 11 × `SKILL.md` ("Closing — validation" section only), 11 × `metadata.yaml`
  (`scripts:`, `evals:`, `tools:` fields only); `package.json` (`test` script glob); `tsconfig.json`
  (`include`, `rootDir` removed); `tsconfig.build.json` (`rootDir` override, `exclude`).
- **Deleted:** 11 × `scripts/build-prompt.py`, 11 × `scripts/test_build_prompt.py`.
- **Untouched:** every other file under `.claude/skills/`, `.claude/references/`, and every file under
  `src/` other than none (no `src/` production module is touched by this change at all).
