## Why

Issue #199 (parent #195) named seven acceptance criteria. Before any code was written for this slice, the
coordinator re-measured the repo (the issue's own comment, 2026-08-16/17) after PR #213 undid the
Antigravity harness migration that #199 was originally scoped around, and found **four of the seven
already satisfied on `main`** — not by this slice, but as a side effect of #213 restoring the pre-migration
`.claude/` layout:

- the 30 failing doc-conformance checks (`npm run test:docs` at `8f7c8f6`: 249 tests, 219 pass / 30 fail)
  were caused by that migration deleting `.claude/commands/` and rewriting the paths the checks pin
  against — undoing it (`e01eeb7`) recovered the prose rather than papering over the checks, and the
  suite is green at its original count (249/249).
- the ~7,300 words of command documentation the migration deleted are recovered: `.claude/commands/`
  holds all 12 of the files the migration deleted (`build-issue.md`, `run-trends.md`, `review-ideas.md`,
  `queue.md`, `pick.md`, `pick-cast.md`, `log-post.md`, `track-performance.md`, `report.md`,
  `run-pipeline.md`, `export-schedule.md`, `cleanup-schedule-media.md`) again. The directory holds **13**
  files today, not 12 — `wc -w .claude/commands/*.md` and `ls .claude/commands/ | wc -l`, re-measured
  directly rather than assumed, both confirm it — because a 13th, `backup-media.md`, was added afterward
  by the unrelated issue #197 (PR #215, `6a0b06b`), never touched by the Antigravity migration or its
  undo. `wc -w` across all 13 totals 10,475 words, well over the ~7,300-word figure. (QA Round-1 Defect
  D3: an earlier draft of this proposal stated "12" for the current total, inherited unchecked from the
  coordinator's own issue comment rather than recounted against the directory listing sitting right next
  to it — corrected here.)
- exactly one agent-definition tree remains: `.agents/` no longer exists on disk, and `git grep` for
  `\.agents/`, `Antigravity`, and `GEMINI.md` across every tracked file returns zero matches. Only
  `.claude/agents/` (6 definitions: `developer.md`, `idea-strategist.md`, `performance-tracker.md`,
  `producer.md`, `qa.md`, `trend-scout.md`) remains.
- the dangling `.claude/` pointers are repaired: `.claude/skills/` is restored (16 Recipe Skill
  directories, including `produce-news-carousel` and `produce-character-explainer`), so
  `src/recipe/registry.ts` resolving a Recipe's `producerSkill` slug against
  `.claude/skills/<slug>/SKILL.md` finds a real file again.

Re-doing any of that here would be wasted, duplicate work fighting a fait accompli; inventing new work to
"fill out" the slice would violate the instruction to keep changes honest and minimal. This proposal
therefore scopes ONLY the three criteria PR #213 did not touch:

1. `npm test` does not run the `*.docs-test.ts` suite at all today (`package.json`'s `test` script globs
   only `src/**/*.test.ts`; `test:docs` is a separate script). A doc can drift for days, exactly as #199's
   own history shows, without failing the command anyone actually runs.
2. There is no `.github` directory in this repository at all — no workflow, so nothing runs either suite
   automatically on push or pull request.
3. No baseline has been posted on issue #199 (the issue's own comment posted the `main`-at-`e01eeb7`
   baseline as a courtesy for whoever builds this, but the acceptance criterion asks for the *before/after*
   of THIS slice, taken from `main` at the moment this slice started).

## What Changes

- **`npm test` merges the two suites; `npm run test:docs` stays available standalone.** The `test` script's
  `node --import tsx --test` invocation gets a second glob argument (`"src/**/*.docs-test.ts"`) alongside
  the existing `"src/**/*.test.ts"`. The two globs are disjoint by construction (a file named
  `*.docs-test.ts` never matches the suffix pattern `*.test.ts` — the character immediately before
  `test.ts` is `-`, not `.`), so merging is a straight union with no double-count and no skip: measured
  directly, `node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"` reports exactly
  **2670 tests / 664 suites / 0 fail** against the `main` baseline of 2411+259 tests and 598+66 suites.
  `tsc -p tsconfig.json --noEmit` still runs first, unchanged — a doc-conformance failure now fails the
  same command that gates type-checking, which is the point: prose drift becomes a build failure, exactly
  like a type error does today. **Guarded by a persisted test, not just true-today behaviour**
  (`src/ci/package-scripts.ts` + `.test.ts`, added Round 2 for QA Round-1 Defect D1): reads the REAL
  `package.json`, parses it, and pins that the typecheck step runs first and that both globs are covered
  — so a future silent revert (someone quietly dropping the `*.docs-test.ts` glob back out) fails this
  suite instead of staying green forever unnoticed, which is exactly the class of drift #199 itself was
  filed to close.
- **A GitHub Actions workflow** (`.github/workflows/ci.yml`, new — there is no `.github` directory
  today) that runs on every `push` and `pull_request` (no branch filter, no path filter — every push,
  every PR, per the acceptance criterion's own wording), installs with `npm ci` against the committed
  `package-lock.json`, and runs exactly `npm test` (never a narrower or different command) on
  `ubuntu-latest` with Node 22 (matching `package.json`'s `engines.node: ">=22"`). The checkout step uses
  `fetch-depth: 0` (full history), not the `actions/checkout` default of a 1-commit shallow clone —
  required because `src/secrets-scan/historical-incident.test.ts` (already part of `npm test`, part of
  this repo's real regular suite, not new) shells to `git show <sha>:.agents/mcp_config.json` for two
  specific historical commits (`bb955eb`, `8f7c8f6`); both are confirmed ancestors of `origin/main`
  (`git merge-base --is-ancestor` checked directly), but a shallow clone would not fetch them and that
  test would fail in CI even though it passes locally. The workflow carries no `secrets:` block, no
  Magnific/Zoho/Apify/AWS credential or endpoint reference, and no other network-dependent step beyond
  the ordinary `npm ci`/`actions/checkout` package-registry and git-clone traffic every Node CI workflow
  makes — hermetic per the always-rules and ADR-0005's "no live `spaces_*`/`creations_*` calls, no
  credits, no board mutation" build-loop contract (this slice makes zero calls of any kind; it is pure
  config plus a test proving that config's own shape).
- **A regression test for the workflow's own shape** (`src/ci/workflow.ts` + `.test.ts`), because a CI
  YAML file is exactly the kind of thing that silently rots — a future edit could narrow the trigger,
  drop `fetch-depth: 0`, or add a secret without any other test noticing. `src/ci/workflow.ts` is a pure
  module (a `yaml`-backed parser plus small structural checks: does it trigger on both `push` and
  `pull_request`; what `fetch-depth` does its checkout step declare; what Node version does its
  `setup-node` step declare; does any `run:` step's command equal exactly `npm test`; does an exact
  `npm ci` step appear, in step order, BEFORE an exact `npm test` step (`runsNpmCiBeforeNpmTest`, added
  Round 2 for QA Round-1 Defect D2 — the presence AND the order are both checked, not merely presence);
  does the raw YAML text reference `secrets.` or a Magnific/Zoho/Apify/AWS-shaped credential name)
  proven first against synthetic fixture YAML, then proven a second time against THIS repository's
  actual `.github/workflows/ci.yml` on disk — the same "prove it against the real file" pattern
  `docs-conformance` and `secrets-scan`'s `self-scan.test.ts` already use elsewhere in this repo.
- **The baseline posted on issue #199** via `gh issue comment 199`, giving the *before* (measured fresh
  from `main` at the moment this slice started) and the *after* (this branch, both suites merged).

## Non-Goals (explicitly out of scope for this slice)

- **Re-triaging or re-recovering the 30 doc-conformance failures, the deleted command docs, the second
  agent tree, or the dangling `.claude/` pointers.** All four are already satisfied on `main` by PR #213,
  verified fresh in this proposal's "Why" section above with reproducible commands. Re-doing them would
  be wasted work; this proposal records the evidence instead of duplicating the fix.
- **Actually watching the workflow go green on GitHub.** This branch is built, committed, but explicitly
  NOT pushed and NOT opened as a PR (the coordinator's own instruction — `/build-issue` handles both after
  a qa pass). The workflow's correctness is proven locally (the exact same `npm ci`-equivalent install
  plus `npm test` invocation the workflow runs, run directly in this sandbox) and by the regression test
  above pinning its real shape; the literal "green tick on GitHub" only exists once this is pushed.
- **Editing any Producer feature code, Recipe, Format, or Brand data.** This slice touches only
  `package.json`, `.github/workflows/ci.yml`, and the new `src/ci/` module + its test — no Producer
  domain code changes at all.

## Capabilities

### Added Capabilities

- `ci-pipeline`: both test suites merged into `npm test` (with `npm run test:docs` still standalone,
  guarded by a persisted test against the real `package.json`), a GitHub Actions workflow that runs
  `npm test` on every push and pull request, and a regression test proving that workflow's own shape
  (trigger, checkout depth, Node version, exact command in the correct order, no live credentials).

## Impact

- **New code:** `.github/workflows/ci.yml`; `src/ci/workflow.ts` (+`workflow.test.ts`);
  `src/ci/package-scripts.ts` (+`.test.ts`, added Round 2 for QA Round-1 Defect D1).
- **Modified code:** `package.json` — the `test` script's glob list grows by one entry
  (`"src/**/*.docs-test.ts"`); `test:docs` is untouched.
- **Hermetic, no live Space/Zoho/Apify/AWS calls anywhere.** `src/ci/workflow.ts` and its tests never
  shell out, never touch the network — pure YAML-string parsing and structural assertions, run against
  synthetic fixtures plus this repo's own already-committed workflow file (read from disk, not fetched).
  The workflow file itself makes no such calls either — see "What Changes" above.
- **Always-rules upheld:** generate-never-publish/public-metrics-only/relative-not-absolute/explicit-
  attribution are untouched (this slice touches no content-generation, publishing, or metrics code at
  all); ledger-as-source-of-truth is untouched (no ledger read or write anywhere in this slice).
