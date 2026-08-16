## 0. Verify the four already-satisfied criteria (evidence only — no code changes)

- [x] 0.1 Confirm `npm run test:docs` on `main`/this branch's base commit (`6a0b06b`): 259 tests, 66
  suites, 0 fail. Confirm the historical 30-failure baseline was measured against `8f7c8f6` (migration
  in place) vs `e01eeb7` (migration undone), per the issue's own comment.
- [x] 0.2 Confirm `.claude/commands/` holds all 12 command docs, `wc -w` totals 10,475 words (over the
  ~7,300-word figure).
- [x] 0.3 Confirm `.agents/` does not exist on disk and `git grep` for `\.agents/`, `Antigravity`,
  `GEMINI.md` across tracked files returns zero matches; `.claude/agents/` holds exactly 6 definitions.
- [x] 0.4 Confirm `.claude/skills/` is restored (16 Recipe Skill directories) so `src/recipe/registry.ts`
  resolves a Recipe's `producerSkill` slug against a real `SKILL.md`.
- [x] 0.5 Record all four as satisfied-by-#213 in `proposal.md`'s "Why", with the reproducible evidence.

## 1. Merge the two test suites into `npm test` (test-first: prove the merge is safe BEFORE editing package.json)

- [x] 1.1 Prove, by direct invocation (not yet wired into `package.json`), that
  `node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"` reports exactly
  2670 tests / 664 suites / 0 fail — the disjoint-union of the 2411/598 and 259/66 baselines, with no
  double-count and no skip.
- [x] 1.2 Edit `package.json`'s `test` script to add the second glob argument. Leave `test:docs`
  untouched (still runs the docs suite alone).
- [x] 1.3 Re-run `npm test` end-to-end (including the `tsc --noEmit` step that runs first) and confirm
  the same 2670/664/0 result. Re-run `npm run test:docs` standalone and confirm it is unaffected
  (259/66/0, unchanged).

## 2. The workflow-shape module — pure parser/checks (test-first)

- [x] 2.1 Write failing tests (`src/ci/workflow.test.ts`) against synthetic fixture YAML strings for:
  `triggersOnPushAndPullRequest` (true only when both `push` and `pull_request` keys are present, under
  every `on:` shape GitHub Actions accepts — mapping, list, or bare string); `checkoutFetchDepth` (reads
  the `fetch-depth` `with:` value off the first `actions/checkout` step, `undefined` when absent or no
  such step); `setupNodeVersion` (reads `node-version` off the first `actions/setup-node` step);
  `runsExactNpmTest` (true only when some `run:` step's trimmed command is exactly `npm test` — false for
  `npm test:docs`, `npm run test`, or `npm test -- --extra`); `referencesLiveCredentials` (true for
  `secrets.`, and for `MAGNIFIC`/`ZOHO`/`APIFY`/`AWS_`-shaped names anywhere in the raw text,
  case-insensitively; false for ordinary workflow text with none of those).
- [x] 2.2 Implement `src/ci/workflow.ts` (`parseWorkflow` via the existing `yaml` dependency, plus the
  five functions above) — pure, no filesystem, no `git`, no clock.

## 3. The GitHub Actions workflow itself + proof it matches (test-first ordering: the module in step 2 was
   written expecting this shape; this step supplies the real file and re-proves against it)

- [x] 3.1 Create `.github/workflows/ci.yml`: `name: CI`; triggers on `push` and `pull_request` (no
  branch/path filter); one `test` job on `ubuntu-latest`; `actions/checkout@v4` with
  `fetch-depth: 0`; `actions/setup-node@v4` with `node-version: "22"` and `cache: "npm"`; `npm ci`; then
  `npm test`. No `secrets:` block, no env var naming Magnific/Zoho/Apify/AWS.
- [x] 3.2 Add a real-file integration test in `workflow.test.ts`: reads `.github/workflows/ci.yml` from
  this repository's own root (resolved via `import.meta.url`, never `process.cwd()` or a hardcoded
  checkout path — same pattern as `secrets-scan/self-scan.test.ts`), parses it with `parseWorkflow`, and
  asserts `triggersOnPushAndPullRequest` is true, `checkoutFetchDepth` is `0`, `setupNodeVersion` names
  Node 22 or newer, `runsExactNpmTest` is true, and `referencesLiveCredentials` on the raw text is false.
- [x] 3.3 Confirm (by direct `git merge-base --is-ancestor` checks, recorded in the proposal) that the two
  commits `historical-incident.test.ts` shells out to (`bb955eb`, `8f7c8f6`) are real ancestors of
  `origin/main`, so `fetch-depth: 0` genuinely fixes the shallow-clone risk rather than papering over an
  untested assumption.

## 4. OpenSpec + full-suite green + self-review + Build Report

- [x] 4.1 Author the `ci-pipeline` spec delta (`specs/ci-pipeline/spec.md`) as Requirements + Scenarios;
  run `openspec validate --strict` until green.
- [x] 4.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` (2670/664/0), `npm run test:docs`
  (259/66/0 unchanged) — all green.
- [x] 4.3 Self-review pass: confirm no dead code, no duplicated logic between `workflow.ts`'s checks and
  the workflow YAML's own shape, every in-scope issue #199 acceptance criterion maps to a specific test
  or to the recorded #213 evidence.
- [x] 4.4 Post the baseline (`main` at the moment this slice started vs this branch, both suites) as a
  comment on issue #199 via `gh issue comment 199`.
- [x] 4.5 Write the Build Report into `handoff.md`, including the four already-satisfied criteria (with
  evidence) and the three actually built here.
