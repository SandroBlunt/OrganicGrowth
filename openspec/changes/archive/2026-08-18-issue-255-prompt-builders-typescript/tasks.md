## 1. Ground the slice before writing a line

- [x] 1.1 Read issue #255 in full, including the per-skill line/test-count table and the correction of
  parent issue #212's "untested Python" premise.
- [x] 1.2 Confirm no "Blocked by" issue is open (none listed) and that #212 (the cross-ticket manifest
  interaction) is already merged on `main` at the branch point.
- [x] 1.3 Read all 11 `scripts/build-prompt.py` and `scripts/test_build_prompt.py` files in full, and
  independently re-run each `python3 scripts/test_build_prompt.py` to confirm the issue's own
  per-skill test counts before porting a single line.
- [x] 1.4 Read `docs/catalogue-manifest-format.md` (issue #212) before touching any `metadata.yaml`, per
  its own instruction — confirmed the `tools: []` outcome and the `evals[].path` / `scripts:`
  consistency requirement this change must preserve.
- [x] 1.5 Read the manifest-completeness guard (`src/claude-skills/manifest-completeness-scan.ts`,
  `src/claude-skills/reference-citation-guard.docs-test.ts`) to confirm an empty `tools:` array and a
  `.ts`-suffixed `evals`/`scripts` pair both already satisfy the existing checks — no guard change
  needed.

## 2. Toolchain: make `.claude/skills/**/*.test.ts` runnable under `npm test`, verified against one skill first

- [x] 2.1 Spike the tsconfig/package.json changes against a scratch fixture outside the repo, confirming
  a `rootDir` spanning two disjoint trees throws `TS6059` even under `--noEmit`, and that removing
  `rootDir` from the base config (used only for the `--noEmit` type-check step) resolves it without
  side effects.
- [x] 2.2 Apply the toolchain changes for real: `tsconfig.json` (`include` gains
  `.claude/skills/**/*.ts`, `rootDir` removed), `tsconfig.build.json` (explicit `rootDir: "src"`
  override, `exclude` gains `.claude/skills/**`), `package.json` (`test` script glob gains
  `".claude/skills/**/*.test.ts"`).
- [x] 2.3 Port `chatgpt-image-2` (the smallest skill, 10 tests) end to end first — test file, then
  script, then run `tsc -p tsconfig.json --noEmit` and `npm run build` to prove the toolchain change
  itself is correct (tests execute, types check, `dist/` is unaffected) before repeating for the other
  10.

## 3. Port each skill, tests before script (test-first, per skill)

For each of `chatgpt-image-2`, `grok-imagine`, `grok-imagine-1-5`, `happy-horse`, `kling-3-0`,
`kling-3-0-omni`, `nano-banana-2`, `seedance-2-0`, `seedream-4-5`, `seedream-5-0-pro`, `veo-3-1`:

- [x] 3.1 Read the skill's `build-prompt.py` and `test_build_prompt.py` in full.
- [x] 3.2 Port `test_build_prompt.py` to `build-prompt.test.ts` FIRST — one `describe` per Python
  `class`, one `it` per `test_*` method, same fixture values, same assertions (translated to
  `node:assert/strict`), same grouping. Run it and confirm it fails (module not found) before the
  script exists.
- [x] 3.3 Port `build-prompt.py` to `build-prompt.ts` — same validation order, same error messages
  (verbatim where the Python message is behaviour-neutral prose), same CLI argument names and shapes,
  same exit codes (0 success / 2 `PromptValidationError`).
- [x] 3.4 Run the ported test file until every test passes; confirm the ported test count matches the
  issue's own per-skill count exactly (chatgpt-image-2: 10, grok-imagine: 21, grok-imagine-1-5: 35,
  happy-horse: 26, kling-3-0: 26, kling-3-0-omni: 13, nano-banana-2: 26, seedance-2-0: 12,
  seedream-4-5: 22, seedream-5-0-pro: 33, veo-3-1: 20 — 244 total).
- [x] 3.5 Run `tsc -p tsconfig.json --noEmit` after each skill to keep the whole tree type-checking
  clean incrementally, not just once at the end.
- [x] 3.6 Update that skill's `SKILL.md` "Closing — validation" section and `metadata.yaml`
  (`scripts:`, `evals:`, `tools: []`) to the TypeScript entry points.

## 4. Cross-cutting verification (once all 11 are ported)

- [x] 4.1 Run the full `npm test` suite; confirm the delta over the `cdb68a0` baseline (3662 tests / 953
  suites / 0 fail) is exactly +244 tests, 0 fail.
- [x] 4.2 Run `src/claude-skills/reference-citation-guard.docs-test.ts` directly (the manifest-
  completeness + dangling-citation guard) and confirm it stays green with `tools: []` and the renamed
  `evals`/`scripts` paths, with no code change to the guard itself.
- [x] 4.3 For three skills of differing size (`chatgpt-image-2` — 179/189 lines; `kling-3-0` —
  395/264 lines; `seedream-5-0-pro` — 445/316 lines, the largest script) and a fourth for extra
  confidence (`veo-3-1`, timestamp-segment JSON), run the Python script and the TypeScript port on
  identical CLI arguments and `diff` the stdout; all four transcripts are byte-identical. Recorded in
  `handoff.md`.
- [x] 4.4 Prove the ported tests are not vacuous: disable `chatgpt-image-2`'s negation guard on purpose
  (`if (false && allNegation(...))`), run its test file, observe the "negation-only subject raises"
  test go red (9 pass / 1 fail), restore the guard, observe 10/10 green again, confirm no diff remains.
  Transcript in `handoff.md`.
- [x] 4.5 Delete all 22 `.py` files (11 `build-prompt.py` + 11 `test_build_prompt.py`) — only now that
  every port is green and the identical-output/non-vacuousness proofs are done.
- [x] 4.6 `grep -rn "python3" .claude/` returns nothing; fix the one incidental hit (a doc-comment in
  `grok-imagine-1-5`'s ported test file that named `python3 scripts/test_build_prompt.py` as historical
  provenance) to describe the fact without the literal string.
- [x] 4.7 Re-run the full `npm test` suite after deletion; confirm still +244 / 0 fail (nothing depended
  on the deleted `.py` files).
- [x] 4.8 Run `npm run build`; confirm `dist/` contains no `.claude/skills` output (the ported scripts
  are `tsx`-run only, never compiled).
- [x] 4.9 Run `npm run test:docs`; confirm no docs-test regression (none of the 11 model-prompting
  Skills' `SKILL.md` prose was pinned by an existing docs-test; the ones that are — `write-social-copy`,
  `produce-news-*`, `produce-character-explainer` — are untouched by this change).

## 5. OpenSpec + self-review + Build Report

- [x] 5.1 Author `proposal.md`, this `tasks.md`, and the `prompt-builder-scripts` spec delta (ADDED
  Requirements only — a new capability). Run `openspec validate issue-255-prompt-builders-typescript
  --strict` until green, then `openspec validate --all --strict`.
- [x] 5.2 Self-review / simplify pass: re-diff every touched file; confirm every ported script's
  doc-comment states it is a port; confirm no dead code; confirm each acceptance criterion maps to a
  specific test or transcript.
- [x] 5.3 Write the Build Report into `handoff.md`, including the per-skill test-count table, the four
  identical-output transcripts, and the non-vacuousness transcript.
