# Slice Handoff — issue #199: Both test suites green in CI, and one agent-definition tree

## Build Report (developer)

### What changed

Issue #199's ticket predates PR #213 (the Antigravity-migration undo). Four of its seven acceptance
criteria are already satisfied on `main` as a side effect of #213, confirmed fresh at the start of this
build (not taken on faith — see "Already satisfied" below). This slice builds only the three remaining
criteria:

1. **`npm test` now runs the `*.docs-test.ts` doc-conformance suite too**, in the same command that
   already type-checks (`tsc -p tsconfig.json --noEmit`). `npm run test:docs` is unchanged and still
   runs the doc suite alone.
2. **A GitHub Actions workflow** (`.github/workflows/ci.yml`, new — there was no `.github` directory at
   all before this slice) runs `npm test` on every `push` and `pull_request`, hermetically.
3. **A regression test for the workflow's own shape** (`src/ci/workflow.ts` + `.test.ts`) — proving the
   YAML file this repository actually ships triggers correctly, checks out full history, targets Node
   ≥22, runs exactly `npm test`, and carries no live-credential reference. Without this, a future edit to
   the YAML could silently narrow the trigger or drop hermeticity with nothing in `npm test` to catch it.
4. **The baseline posted on issue #199** via `gh issue comment 199` (before/after, both suites).

### Already satisfied (verified fresh, not redone)

Per the coordinator's own comment on the issue and re-verified independently in this build session:

- **The 30 failing doc-conformance checks.** `npm run test:docs` at `8f7c8f6` (migration in place): 249
  tests, 219 pass / 30 fail. At `e01eeb7` (migration undone, PR #213): 249/249 pass. At this branch's
  base `6a0b06b`: 259 tests, 66 suites, 0 fail (re-confirmed directly).
- **The ~7,300 words of deleted command documentation.** `.claude/commands/` holds all 12 files
  (`backup-media.md`, `build-issue.md`, `cleanup-schedule-media.md`, `export-schedule.md`, `log-post.md`,
  `pick-cast.md`, `pick.md`, `queue.md`, `report.md`, `review-ideas.md`, `run-pipeline.md`,
  `run-trends.md`, `track-performance.md`); `wc -w` totals 10,475 words — over the ~7,300-word figure.
- **Exactly one agent-definition tree.** `.agents/` does not exist on disk (`ls -la .agents` → "No such
  file or directory"). `git grep -n "\.agents/"` and `git grep -ni "antigravity\|GEMINI.md"` across all
  tracked files both return zero matches. `.claude/agents/` holds exactly 6 definitions (`developer.md`,
  `idea-strategist.md`, `performance-tracker.md`, `producer.md`, `qa.md`, `trend-scout.md`).
- **The dangling `.claude/` pointers.** `.claude/skills/` is restored (16 Recipe Skill directories,
  including `produce-news-carousel` and `produce-character-explainer`), so `src/recipe/registry.ts`'s
  `producerSkill` slug resolution finds a real `SKILL.md` again.

None of these four were re-done, weakened, or re-tested by this slice — they are recorded here, and in
`proposal.md`'s "Why", as evidence.

### Files touched

- **New:** `.github/workflows/ci.yml`, `src/ci/workflow.ts`, `src/ci/workflow.test.ts`,
  `openspec/changes/issue-199-suites-green-ci-one-agent-tree/` (this change's own `proposal.md`,
  `tasks.md`, `specs/ci-pipeline/spec.md`, `handoff.md`).
- **Modified:** `package.json` — the `test` script's glob list grows by one entry
  (`"src/**/*.docs-test.ts"`); `test:docs` untouched.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-199-suites-green-ci-one-agent-tree
npx tsc -p tsconfig.json --noEmit     # typecheck only
npm test                              # typecheck + BOTH suites (2694 tests / 670 suites / 0 fail)
npm run test:docs                     # doc-conformance suite alone (259 tests / 66 suites / 0 fail)
npx openspec validate issue-199-suites-green-ci-one-agent-tree --strict
```

### Acceptance-criteria self-assessment

| Acceptance criterion (issue #199) | Status | Proof |
|---|---|---|
| The 30 failing doc-conformance checks triaged and recovered | Already satisfied by #213 | `npm run test:docs` at `8f7c8f6` vs `e01eeb7`, both re-run this session; see "Already satisfied" |
| Documentation deleted in the migration is recovered, not deleted from the check | Already satisfied by #213 | `.claude/commands/` word count (10,475), all 12 files present |
| `npm test` runs `*.docs-test.ts`; `npm run test:docs` still exists alone | Built this slice | `package.json`'s `test` script (both globs); `src/ci/workflow.test.ts` is unaffected proof of the merge's mechanics is the direct `node --import tsx --test` invocation in `proposal.md`; the live counts: `npm test` → 2694/670/0, `npm run test:docs` → 259/66/0 (both run above) |
| A GitHub Actions workflow runs `npm test` on every push/PR, and is green | Built this slice | `.github/workflows/ci.yml`; `src/ci/workflow.test.ts`'s "This repository's real .github/workflows/ci.yml satisfies every check" suite (5 tests) proves the trigger, `fetch-depth: 0`, Node version, exact command, and no-live-credential properties directly against the shipped file. The literal green GitHub checkmark cannot be proven pre-push (see Known Limits) |
| Exactly one agent-definition tree remains | Already satisfied by #213 | `.agents/` absent on disk; `git grep` zero matches; `.claude/agents/` has 6 files |
| The dangling `.claude/` pointers are repaired | Already satisfied by #213 | `.claude/skills/` restored, 16 directories |
| The baseline is posted on this issue | Built this slice | `gh issue comment 199` — https://github.com/SandroBlunt/OrganicGrowth/issues/199#issuecomment-5310115778 |

### Fakes / fixtures used

- **No Magnific fake needed.** This slice touches no Producer/Recipe/Space code at all — it is
  test-runner wiring, a CI YAML file, and a pure YAML-parsing regression test. `src/ci/workflow.test.ts`
  uses only synthetic in-memory YAML strings (fixtures for the pure `workflow.ts` checks) and this
  repository's own already-committed `.github/workflows/ci.yml` (read from disk, not fetched over the
  network). **No live Magnific, Zoho, Apify, or AWS call of any kind is made anywhere in this slice** —
  confirmed by `src/ci/workflow.test.ts`'s own "references no live credential" assertions against the
  real shipped workflow file, and by inspection (the new module has no network/process-spawning code at
  all).
- The pre-existing `npm test` suite this slice now folds `*.docs-test.ts` into already includes its own
  hermetic fixtures elsewhere in the repo (unaffected by this slice).

### Self-review notes

- Un-exported `allSteps` in `src/ci/workflow.ts` after confirming nothing outside the module (including
  the test file) needed it — it is purely an internal fold helper for `findStepsUsingAction` and
  `runCommands`. Tightened the module's public surface to exactly the five functions + three interfaces
  the spec's Requirement actually names.
- Confirmed no duplicated logic between `workflow.ts`'s structural checks and the workflow YAML's own
  content — the checks are generic (any workflow shape), the YAML is one concrete instance; the
  real-file test in `workflow.test.ts` is the only place they're compared.
- Confirmed `npm run build` (`tsc -p tsconfig.build.json`) still succeeds with the new `src/ci/` module
  included.
- Did not touch any of the four already-satisfied criteria's files — verified only, never edited.

### Known limits

- **The literal GitHub Actions green checkmark cannot be proven before this branch is pushed.** Per the
  coordinator's explicit instruction, this branch is committed but not pushed and no PR is opened here.
  The workflow's correctness is proven two ways short of that: (a) the exact commands the workflow runs
  (`npm ci`-equivalent install, then `npm test`) were run directly in this sandbox and are green; (b) a
  dedicated regression test parses and checks the real, on-disk `.github/workflows/ci.yml` file's shape.
  Once pushed, the coordinator/qa should confirm the Actions tab shows a green run, not only rely on this
  local proof.
- **CI runs on `ubuntu-latest`; this build was verified on macOS (the sandbox's own OS).** No
  platform-specific code exists anywhere in `src/` (checked via `grep -rn "process.platform"` — zero
  matches outside this note), and no docker was available in this sandbox to rehearse the exact Ubuntu
  runner locally. This is a reasonable-confidence gap, not a proven one.
- **`fetch-depth: 0` fetches the full repository history on every CI run**, which is slightly slower than
  a shallow clone but is required correctness (`historical-incident.test.ts` needs `bb955eb` and
  `8f7c8f6` resolvable, and both are confirmed real ancestors of `origin/main`). No caching or
  optimization was added for this — out of scope for "keep it minimal."
- **No `npm audit` / dependency-vulnerability step, no lint step, no build (`tsc -p tsconfig.build.json`)
  step in the workflow** — the issue asked specifically for `npm test` on every push/PR, kept minimal;
  adding more steps was treated as scope creep.
