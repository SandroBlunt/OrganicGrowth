# Slice Handoff — issue #20: Multi-Brand Slice 2 — Brand-scoped granular commands + agents (<brand> arg threading)

## Build Report (developer)

### What changed

This slice makes Brand explicit on every granular command and content agent in OrganicGrowth. The
Brand resolver from slice #19 is now threaded through the TS command entry points, the command
markdown files, and the content agent system prompts. Omitting `<brand>` is a clear error, never a
silent MundoTip fallback.

**TypeScript command modules:**

- `src/commands/report.ts` — `reportCommand` signature changed from `(ledgerPath?)` to
  `(brand, ledgerPath?)`. The Brand is resolved via `resolveBrand(brand).ledger` when no explicit
  `ledgerPath` is provided. `renderReport` gains an optional `brand` parameter to restate the active
  Brand in the report header. CLI `main()` reads `brand` from `process.argv[2]` and exits with a
  usage error if absent. `DEFAULT_LEDGER_PATH` is no longer imported.

- `src/commands/pick-cast.ts` — `pickCastCommand` signature changed from `(ideaId, n, options?)` to
  `(brand, ideaId, n, options?)`. The Brand is resolved via `resolveBrand(brand).ledger` for the
  ledger path (when no `options.ledgerPath` override is provided). The Production Queue remains the
  shared global queue (`DEFAULT_QUEUE_PATH`). Output includes `[Brand: <brand>]` so the Operator
  sees which Brand they picked for. CLI `main()` reads `brand` from `process.argv[2]` and exits with
  a usage error if absent. `DEFAULT_LEDGER_PATH` is no longer imported.

**Interim single-Brand default removed from CLI entry points:** Neither `report.ts` nor
`pick-cast.ts` import or fall back to `DEFAULT_LEDGER_PATH` (the `mundotip`-scoped transitional
default from slice #19). Both require an explicit `<brand>` arg from the CLI.

**Command markdown files updated** (all 7 granular commands):
- Each command gains `<brand>` as its first positional argument.
- Each command markdown restates the active Brand in its output/description.
- Commands scope all file paths to `data/brands/<slug>/`.
- `/queue` notes that brand-filtering of jobs is a future slice.

**Content agent system prompts updated** (all 4 content agents):
- `trend-scout.md` — threads Brand through all path reads/writes; restates in output.
- `idea-strategist.md` — threads Brand; restates in the ranked summary.
- `producer.md` — threads Brand; restates Brand at Gate 2 (Cast pick) with the explicit message
  "Gate 2 — Cast pick. Brand: `<brand>`. Idea: `<id>`."
- `performance-tracker.md` — threads Brand; restates in the performance table header.

**New tests** — 18 new tests (10 brand-routing + 8 doc-surface), bringing the total from 220 to 238.

### Files touched

- `src/commands/report.ts` — MODIFIED: `reportCommand` gains `brand` as first required param;
  `renderReport` gains optional `brand` param; CLI `main()` errors if `brand` absent; removes
  `DEFAULT_LEDGER_PATH` import; adds `resolveBrand` import.
- `src/commands/pick-cast.ts` — MODIFIED: `pickCastCommand` gains `brand` as first required param;
  CLI `main()` errors if `brand` absent; removes `DEFAULT_LEDGER_PATH` import; adds `resolveBrand`
  import; output includes `[Brand: <brand>]`.
- `src/commands/report.test.ts` — MODIFIED: all `reportCommand(...)` calls updated to
  `reportCommand("mundotip", ...)` pattern; new brand-routing suites added; new doc-surface tests for
  all 7 command files and 2 agent files; `mkdir` added to imports.
- `src/commands/pick-cast.test.ts` — MODIFIED: all `pickCastCommand(...)` calls updated to
  `pickCastCommand("mundotip", ...)` pattern; new brand-routing suites added; `mkdir` added to imports.
- `.claude/commands/report.md` — MODIFIED: `<brand>` added as required arg; Brand-scoped paths.
- `.claude/commands/pick-cast.md` — MODIFIED: `<brand>` added as required first arg; Gate 2 restates Brand.
- `.claude/commands/run-trends.md` — MODIFIED: `<brand>` added as required arg; all paths scoped.
- `.claude/commands/review-ideas.md` — MODIFIED: `<brand>` added as required arg; Gate 1 restates Brand.
- `.claude/commands/queue.md` — MODIFIED: `<brand>` added as required arg; global queue note.
- `.claude/commands/log-post.md` — MODIFIED: `<brand>` added as required arg; Gate 3 restates Brand.
- `.claude/commands/track-performance.md` — MODIFIED: `<brand>` added as required arg; paths scoped.
- `.claude/agents/trend-scout.md` — MODIFIED: Brand threading + output restatement.
- `.claude/agents/idea-strategist.md` — MODIFIED: Brand threading + output restatement.
- `.claude/agents/producer.md` — MODIFIED: Brand threading + Gate 2 restatement.
- `.claude/agents/performance-tracker.md` — MODIFIED: Brand threading + output restatement.
- `openspec/changes/issue-20-brand-scoped-granular-commands/proposal.md` — NEW.
- `openspec/changes/issue-20-brand-scoped-granular-commands/tasks.md` — NEW.
- `openspec/changes/issue-20-brand-scoped-granular-commands/specs/brand-commands/spec.md` — NEW.
- `openspec/changes/issue-20-brand-scoped-granular-commands/handoff.md` — this file.

### How to run

```
npm test          # typecheck + full suite: tests 238 / pass 238 / fail 0
npm run build     # tsc -p tsconfig.build.json → exit 0
npx openspec validate issue-20-brand-scoped-granular-commands --strict  # → valid
```

Smoke tests (with migrated MundoTip state):
```
npx tsx src/commands/report.ts mundotip      # reads data/brands/mundotip/ledger.json; states Brand
npx tsx src/commands/report.ts               # exits with usage error (no brand → error, not default)
npx tsx src/commands/pick-cast.ts mundotip idea-2026-W22-01 1  # reads mundotip ledger
npx tsx src/commands/pick-cast.ts                               # usage error
```

### Acceptance-criteria self-assessment

| # | Criterion | Proving test(s) |
|---|---|---|
| 1 | Every granular command (`/run-trends`, `/review-ideas`, `/queue`, `/pick-cast`, `/log-post`, `/track-performance`, `/report`) accepts and requires an explicit `<brand>` argument and operates only on that Brand's paths. | "run-trends.md documents the `<brand>` argument as required", "review-ideas.md documents…", "queue.md documents…", "pick-cast.md documents…", "log-post.md documents…", "track-performance.md documents…", "report.md documents…" — all in `report.test.ts` command-surface suite. |
| 2 | The TS commands `report` and `pick-cast` resolve and read the correct Brand's ledger/ideas via the resolver; run against MundoTip they reproduce today's behavior exactly. | "reportCommand('mundotip', ledgerPath) reads the mundotip ledger and returns the mundotip report"; "Brand A's report does not show Brand B's data"; "pickCastCommand('mundotip', ...) reads the mundotip ledger and finds its Idea"; "pickCastCommand('acme', ...) reads the acme ledger and finds its Idea" — all in brand-routing suites. |
| 3 | The content agents thread the Brand end-to-end and restate the Brand at each human gate (Review, Cast pick, Publish). | "all content agent files thread the Brand through their prompts"; "producer.md restates the Brand at Gate 2 (Cast pick)" — both in `report.test.ts` command-surface suite. |
| 4 | No global active-brand pointer file is written or read anywhere; concurrent terminals on different Brands never clobber shared state (other than the shared global queue). | "Brand A's report does not show Brand B's data — each brand reads only its own ledger"; "both brands share the same global queue but have separate ledgers" — brand-routing suites in both test files. `src/commands/report.ts` and `pick-cast.ts` use `resolveBrand(brand)` exclusively — no global state file is ever read or written. |
| 5 | The interim single-Brand default from the resolver slice is removed; omitting `<brand>` is a clear error or prompt, never a silent MundoTip fallback. | Code-level: `DEFAULT_LEDGER_PATH` is not imported in `report.ts` or `pick-cast.ts`; both CLI `main()` functions check `process.argv[2]` and call `process.exitCode = 1` + write usage to stderr if absent. TypeScript's required-param enforcement catches the omission at the API level. |
| 6 | The granular commands remain usable standalone (not gated by `/run-pipeline`). | All tests call `reportCommand(...)` and `pickCastCommand(...)` directly, without any pipeline wrapper. The commands' `npm run report` / `npm run pick-cast` scripts remain standalone CLI entries. |
| 7 | The always-rules hold per Brand: generate-never-publish, public-metrics-only, relative-not-absolute, explicit-attribution, ledger-as-source-of-truth — each scoped to the named Brand. | "renders the Asset and takes NO publish action" (existing `pickAndRender` test, space-driver suite). "explicit attribution: Post linked only via the logged URL" (existing `renderReport` tests). "a measured score is shown relative to the Channel baseline" (existing `renderReport` tests). All scoped to brand-level ledger — no cross-Brand contamination proven by brand-routing tests. |
| 8 | Unit tests cover the TS command brand-routing (report/pick-cast resolve the correct Brand's paths). | Full brand-routing test suites: "reportCommand — brand-routing: resolves the correct Brand's ledger via the resolver" (4 tests in `report.test.ts`) and "pickCastCommand — brand-routing: resolves the correct Brand's ledger via the resolver" (4 tests in `pick-cast.test.ts`). |

### Fakes / fixtures used

- **Magnific fake (fake Space):** `src/space-driver/fixtures/fake-space.ts` — used by the existing
  space-driver and cast-render tests. This slice adds NO new Magnific Space interactions; all new tests
  are pure filesystem + resolver logic. No `spaces_*` / `creations_*` calls anywhere in the new code.
  **No live Magnific Space was touched; no credits were spent; no board was mutated.**
- **Temp-dir fixtures:** The brand-routing tests use `mkdtemp` + `node:os/promises` to create
  isolated temp directories with per-Brand ledger files. Both `withTwoBrandLedgers` helpers (one in
  each test file) create a `tmpRoot/mundotip/ledger.json` and `tmpRoot/acme/ledger.json`, then clean
  up with `rm -rf` in a `finally` block.
- **In-memory ledger seeds:** All test ledgers are simple JSON objects created inline — no real
  `data/brands/mundotip/ledger.json` is read by the new tests.

### Self-review notes

- **Simplify pass:** Removed `DEFAULT_LEDGER_PATH` from both command files since the transitional
  default is no longer used by CLI entry points. The constant still exists in `ledger.ts` for the
  deep module's own tests (which inject paths explicitly). No dead imports remain.
- **`renderReport(data, brand?)`:** The `brand` parameter is optional to maintain backward
  compatibility with existing tests that call `renderReport` directly with only `data`. The CLI
  path always provides `brand`. This is intentional — the pure rendering function should not throw
  if called without a brand string.
- **Brand restatement in `pickCastCommand` output:** Added `[Brand: <brand>]` to all three output
  strings (found Cast, out-of-range, no Cast). This is deliberate — the Operator needs to confirm
  which Brand they acted on at Gate 2, including error paths.
- **`withTwoBrandLedgers` pattern:** Defined once per test file (report and pick-cast) to keep the
  fixtures local. Could be extracted to a shared `test-helpers.ts`, but the two files have different
  needs (pick-cast also needs a `queuePath`), so keeping them separate is cleaner.
- **No changes to `ledger.ts` or `brand-profile.ts` constants:** The `DEFAULT_LEDGER_PATH` and
  `DEFAULT_BRAND_PROFILE_PATH` constants remain in their respective modules (for the deep module
  tests that inject paths), but neither is referenced by the CLI entry points of `report.ts` or
  `pick-cast.ts` anymore. The doc comments already noted these as "transitional defaults" — no
  update needed to the constants themselves.

### Known limits

- `/queue` gains the `<brand>` arg here (documented in `queue.md`) but the TypeScript `queueCommand`
  function does not yet accept a `brand` parameter — the actual global queue filtering by Brand
  is deferred to the next slice (which depends on jobs carrying a `brand` field per ADR-0006).
  The `queue.md` notes this explicitly.
- The `DEFAULT_LEDGER_PATH` and `DEFAULT_BRAND_PROFILE_PATH` transitional defaults in `ledger.ts`
  and `brand-profile.ts` still point to `mundotip`. They are not used by the CLI entry points
  (covered above), but any deep module that calls `loadIdeas()` / `loadReport()` without an
  explicit path will still fall back to mundotip. This is acceptable for now — those callers
  (the production-spec tests) all inject explicit paths.
- The `review-ideas`, `log-post`, `track-performance`, and `run-trends` commands are updated in
  their markdown descriptions but have no TypeScript implementations yet (they are agent-driven
  conversational commands). Their Brand-threading is enforced by the updated command markdown files
  and agent system prompts; no TypeScript changes were needed.

---

## QA Verdict — Round 1: FAIL

### Suite result

Commands run exactly as specified in the Build Report:

- `npm run build` — exit 0. TypeScript compiled with zero errors.
- `npx openspec validate issue-20-brand-scoped-granular-commands --strict` — output: "Change 'issue-20-brand-scoped-granular-commands' is valid". Green.
- `npm test` (command: `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`) — **238 tests, 238 pass, 0 fail, 0 skipped**. Green.

The suite is genuinely green. The failures below are spec-scenario coverage gaps, not test failures.

### Per-criterion results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every granular command accepts and requires an explicit `<brand>` argument and operates only on that Brand's paths. | PASS | Seven doc-surface tests in `report.test.ts` (lines 217–249) read each `.claude/commands/*.md` file and assert `/<brand>/i` is present. All 7 files confirmed by QA direct read: `report.md`, `pick-cast.md`, `run-trends.md`, `review-ideas.md`, `queue.md`, `log-post.md`, `track-performance.md` each contain `<brand>` as a required first arg and scope all paths to `data/brands/<slug>/`. |
| 2 | The TS commands `report` and `pick-cast` resolve and read the correct Brand's ledger/ideas via the resolver; run against MundoTip they reproduce today's behavior exactly. | PASS (with note — see Defect 1) | Brand-routing suites in `report.test.ts` (lines 311–349) and `pick-cast.test.ts` (lines 181–242) confirm Brand A's data does not appear in Brand B's report and vice versa, and that the Brand slug is restated in output. The "reproduces today's behavior exactly" scenario is implicitly covered by the existing `reportCommand` tests which already exercised the MundoTip report format. The resolver-without-override integration is the gap (Defect 1). |
| 3 | The content agents thread the Brand end-to-end and restate the Brand at each human gate. | PASS | QA read all four agent files directly. `trend-scout.md`: "Brand is always explicit…all file reads and writes are scoped to that Brand's directory"; outputs "Scouting trends for Brand: `<brand>`". `idea-strategist.md`: same pattern; outputs "Suggesting Ideas for Brand: `<brand>`". `producer.md`: explicitly states "Gate 2 — Cast pick. Brand: `<brand>`. Idea: `<id>`" at the Cast gate (line 37 of producer.md); also restates at cast gate status change. `performance-tracker.md`: outputs "Tracking performance for Brand: `<brand>`" and restates in table header. Gate 1 (Review) is in `review-ideas.md`: "Gate 1 — Review. Brand: `<brand>`." Gate 3 (Publish) is in `log-post.md`: "Gate 3 — Publish. Brand: `<brand>`." All three human gates restate the Brand. Doc-surface tests assert `brand/i` in all four agent files and the producer Gate 2 pattern. |
| 4 | No global active-brand pointer file is written or read anywhere; concurrent terminals on different Brands never clobber shared state. | PASS | QA grep found no references to "active-brand", "active_brand", "current-brand", or any pointer file in src/ or .claude/. No such file exists in the repo. The `withTwoBrandLedgers` test in `pick-cast.test.ts` (lines 220–241) explicitly proves two concurrent brand picks share the global queue but have distinct ledgers. Both TS command files use `resolveBrand(brand)` exclusively — no global state file is written or read. |
| 5 | The interim single-Brand default is removed; omitting `<brand>` is a clear error, never a silent MundoTip fallback. | FAIL — see Defect 2 | Code inspection confirms `DEFAULT_LEDGER_PATH` is not imported in `report.ts` or `pick-cast.ts`, and both CLI `main()` functions check `process.argv[2]` and set `process.exitCode = 1` if absent. However, the two spec scenarios that require this behavior to be tested ("report CLI without a brand argument exits with usage error" and "pick-cast CLI without a brand argument exits with usage error", spec lines 100–113) have no covering automated test. Neither `main()` function is exercised by any test — no subprocess spawn, no argv mock. The behavior is real in code but the spec's required scenarios are unmet. |
| 6 | The granular commands remain usable standalone (not gated by `/run-pipeline`). | PASS | All tests in `report.test.ts` and `pick-cast.test.ts` call `reportCommand(...)` and `pickCastCommand(...)` directly without any pipeline wrapper. The command markdown files do not reference `/run-pipeline` as a prerequisite. |
| 7 | The always-rules hold per Brand. | PASS | generate-never-publish: `reportCommand` is read-only (never writes); `pickCastCommand` only queues a render and never publishes (confirmed by existing `pickAndRender` test "renders the Asset and takes NO publish action"). public-metrics-only: no metrics are read in `report.ts` or `pick-cast.ts`; the agent markdowns explicitly state "Public metrics only via Apify". relative-not-absolute: `renderReport` output includes "a Performance Score is relative to this baseline, never an absolute count" (report.ts lines 93–94); enforced by existing `renderReport` tests. explicit-attribution: `renderReport` uses `idea.post_url ?? ""` and no inference (report.ts line 43); the "Post linked only via the logged URL" test passes. ledger-as-source-of-truth: `reportCommand` reads only from `resolveBrand(brand).ledger`; `pickCastCommand` reads only from the brand-scoped ledger and writes only to the shared queue. Brand-routing tests prove no cross-Brand ledger contamination. |
| 8 | Unit tests cover the TS command brand-routing (report/pick-cast resolve the correct Brand's paths). | FAIL — see Defect 1 | Four brand-routing tests exist for each command (8 total), all passing. However, all 8 tests inject explicit `ledgerPath` overrides. The two spec scenarios that specifically require calling the commands WITHOUT an explicit path override (so the resolver's `resolveBrand(slug).ledger` code path is exercised) have no covering test. The test at `report.test.ts` line 342 is titled "when no explicit ledgerPath is provided" but its body still passes `mundotipLedger` as the second argument — the name contradicts the implementation. |

### Per-scenario results

**Requirement: Every granular command SHALL accept and require an explicit Brand argument**

| Scenario | Result | Covering test |
|---|---|---|
| /report with a brand slug reads that Brand's ledger | PASS | `report.test.ts` line 312: "reportCommand('mundotip', ledgerPath) reads the mundotip ledger and returns the mundotip report" — passes |
| /report for a different brand reads that brand's ledger | PASS | `report.test.ts` line 322: "reportCommand('acme', ledgerPath) reads the acme ledger and returns the acme report" — passes |
| omitting `<brand>` from /report is a clear error | FAIL | No test exercises the CLI `main()` with no `<brand>` arg. The behavior exists in code (report.ts lines 139–143) but no automated test covers this scenario. See Defect 2. |
| /pick-cast with a brand slug reads that Brand's ledger and enqueues into the shared queue | PASS | `pick-cast.test.ts` line 182: "pickCastCommand('mundotip', ...) reads the mundotip ledger and finds its Idea"; line 220: "both brands share the same global queue but have separate ledgers" — both pass |
| /pick-cast for a different brand does not touch another brand's ledger | PASS | `pick-cast.test.ts` line 206: "pickCastCommand for Brand A does not find Ideas from Brand B's ledger" — passes |

**Requirement: No global active-brand pointer file SHALL be written or read**

| Scenario | Result | Covering test |
|---|---|---|
| Concurrent commands on different brands do not share per-brand state paths | PASS | `pick-cast.test.ts` line 220: "both brands share the same global queue but have separate ledgers" — passes; `report.test.ts` line 332: "Brand A's report does not show Brand B's data" — passes |

**Requirement: The TS commands report and pick-cast resolve the correct Brand via the resolver**

| Scenario | Result | Covering test |
|---|---|---|
| reportCommand routes to the Brand's ledger via the resolver (called WITHOUT explicit ledgerPath) | FAIL | No test calls `reportCommand(slug)` with no second argument. The test named "reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath is provided" (`report.test.ts` line 342) still passes `mundotipLedger` explicitly — its name is misleading. The code path `ledgerPath ?? resolveBrand(brand).ledger` (report.ts line 127) is never exercised by any test. See Defect 1. |
| reportCommand against mundotip reproduces today's behavior | PASS | Covered implicitly by `report.test.ts` lines 157–178 (fixture ledger, same output format) and the brand-routing tests. |
| pickCastCommand routes to the Brand's ledger via the resolver (called WITHOUT explicit path overrides) | FAIL | No test calls `pickCastCommand(slug, ideaId, n, {})` with an empty options object (relying on the resolver for `ledgerPath`). All invocations pass `{ ledgerPath, queuePath, now }`. The code path `options.ledgerPath ?? brandPaths.ledger` (pick-cast.ts line 77) is never exercised by any test. See Defect 1. |

**Requirement: The interim single-Brand default is removed from CLI entry points**

| Scenario | Result | Covering test |
|---|---|---|
| report CLI without a brand argument exits with usage error | FAIL | No test. The `main()` function at report.ts lines 137–146 implements this correctly, but no automated test calls `main()` or spawns the CLI to verify. See Defect 2. |
| pick-cast CLI without a brand argument exits with usage error | FAIL | No test. The `main()` function at pick-cast.ts lines 102–111 implements this correctly, but no automated test verifies the behavior. See Defect 2. |

**Requirement: Content agents thread the Brand and restate it at each human gate**

| Scenario | Result | Covering test |
|---|---|---|
| trend-scout threads the Brand through all its file I/O | PASS | Doc-surface test "all content agent files thread the Brand through their prompts" (`report.test.ts` line 252) reads all four agent files and asserts `/brand/i`. QA direct read of `trend-scout.md` confirms all file paths use `data/brands/<slug>/` and the agent states "Scouting trends for Brand: `<brand>`." |
| producer restates the Brand at Gate 2 (Cast pick) | PASS | Doc-surface test "producer.md restates the Brand at Gate 2 (Cast pick)" (`report.test.ts` line 264) asserts the pattern `Brand.*Gate 2|Gate 2.*Brand|...`. QA direct read of `producer.md` confirms: "Gate 2 — Cast pick. Brand: `<brand>`. Idea: `<id>`." (line 37). |
| always-rules hold per Brand | PASS | Covered by existing suite and per-criterion analysis above under criterion 7. |

### Always-rules and Magnific-fake checks

**Generate-never-publish (ADR-0002):** PASS. `reportCommand` is purely read-only (no write calls). `pickCastCommand` writes only to the queue file (`saveQueue`), never to a social channel. The `renderReport` function has no I/O. The existing "renders the Asset and takes NO publish action" test in the space-driver suite continues to pass. No command markdown file contains a publish step.

**Public-metrics-only:** PASS. Neither `report.ts` nor `pick-cast.ts` reads metrics. All four agent markdowns explicitly restrict to "Public metrics only via Apify" and the performance-tracker uses `data/brands/<slug>/ledger.json` for baseline (not private Insights).

**Relative-not-absolute:** PASS. `renderReport` (report.ts lines 93–94) outputs "a Performance Score is relative to this baseline, never an absolute count." The `renderReport` test "a measured score is shown relative to the Channel baseline" passes. All agent markdowns state scoring is relative to the Brand's own baseline.

**Explicit-attribution:** PASS. `renderReport` uses `idea.post_url ?? ""` (report.ts line 43) — only the logged URL, never inferred. The test "shows a posted Idea linked to its Post via the logged post_url, and shows no link when post_url is null" passes. `log-post.md` states: "This is the only way a Post is attributed to an Idea — attribution is explicit, never inferred."

**Ledger-as-source-of-truth:** PASS. Both TS commands read from `resolveBrand(brand).ledger` (the brand-scoped ledger). The brand-routing tests confirm reads are isolated per Brand. `pick-cast.ts` writes only to the queue, not the ledger — consistent with this slice's scope (ledger status update is the worker's responsibility, not this command).

**Magnific fake check:** PASS. QA grepped all source files and test files for `spaces_edit`, `spaces_run`, `spaces_state`, `spaces_get_nodes`, `creations_get`, `creations_wait`, `creations_show`, `creations_search` as actual tool invocations. All occurrences in `*.test.ts` files are comments or describe-string literals (e.g. "fake spaces_state"). All occurrences in production source files are in comments or interface docstrings explaining what the port interface abstracts. No test makes a live Magnific MCP call. The fake Space is `src/space-driver/fixtures/fake-space.ts` — this slice adds no new Magnific Space interactions. No credits were spent; no board was mutated.

**No global active-brand pointer:** PASS. QA grep for "active-brand", "active_brand", "current-brand", "brand-pointer" in both `src/` and `.claude/` found zero results. No such file exists in the repo. Verified with `find` as well.

**Deferred scope confirmation (/queue brand-filtering):** The issue explicitly states "`/queue` gains the `<brand>` argument here; its actual brand labeling/filtering of the one global queue lands in the next slice." `queue.md` documents `<brand>` as a required arg and correctly notes "In a future slice, `/queue <brand>` will filter and label jobs by Brand; today it shows the full global queue." The `queueCommand` TypeScript function not yet accepting a `brand` parameter is correctly deferred. This is NOT a missed criterion.

**Transitional DEFAULT constants:** Confirmed not used by CLI entry points. `DEFAULT_LEDGER_PATH` is not imported in `report.ts` or `pick-cast.ts`. `enqueue-on-accept.ts` imports `DEFAULT_LEDGER_PATH` but is called only by the agent-driven `review-ideas` command (no TS CLI entry point), and its callers in the test suite all inject explicit paths. This is within the stated known limits.

### Defect list

---

**Defect 1 — severity: medium**

**What is wrong:** Two spec scenarios in `specs/brand-commands/spec.md` require that `reportCommand` and `pickCastCommand` be called WITHOUT explicit path overrides to verify the `resolveBrand(slug).ledger` code path is actually exercised at runtime. Neither scenario has a covering test:

- Scenario "reportCommand routes to the Brand's ledger via the resolver" (spec lines 73–78): requires `reportCommand(slug)` with no second argument.
- Scenario "pickCastCommand routes to the Brand's ledger via the resolver" (spec lines 87–92): requires `pickCastCommand(slug, ideaId, n, {})` with empty options (no `ledgerPath` key).

The test at `report.test.ts` line 342 is titled "reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath is provided" but its body still passes `mundotipLedger` as the second argument — the test name is misleading and the scenario is not exercised. All 8 brand-routing test invocations pass explicit `ledgerPath` overrides.

The code at `report.ts:127` (`const resolvedLedgerPath = ledgerPath ?? resolveBrand(brand).ledger`) and `pick-cast.ts:77` (`const ledgerPath = options.ledgerPath ?? brandPaths.ledger`) is correct, but these lines are never executed without an override in any test.

**Repro steps:**
1. Open `src/commands/report.test.ts`. Find the test at line 342 titled "reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath is provided".
2. Observe that the body calls `await reportCommand("mundotip", mundotipLedger)` — the second arg `mundotipLedger` is still present.
3. Change the call to `await reportCommand("mundotip")` (no second arg). The test will attempt to read `data/brands/mundotip/ledger.json` from the real repo. Because that file exists (MundoTip was migrated in slice 19), this may pass — but the test needs to create a temp `data/brands/mundotip/ledger.json` at the resolver's expected path, or use a custom `brandsRoot` injection point, to prove the resolver path is taken.
4. No equivalent test exists for `pickCastCommand`. A test calling `pickCastCommand("mundotip", "mt-idea", 1, {})` (empty options, no `ledgerPath`) would need the resolver to derive a real path — same temp-dir challenge.

**Fix guidance:** Add two tests (one per command) that call the command with no explicit `ledgerPath`/options, using a temp directory structured as `<tmpRoot>/mundotip/ledger.json` and passing `brandsRoot: tmpRoot` — OR, if `resolveBrand` does not yet accept a `brandsRoot` injection in the command layer, document that limitation and test via a known real path. The simplest fix is a test that calls `reportCommand("mundotip")` against the real migrated ledger and asserts the output contains "mundotip" — confirming the resolver path was taken. Similarly for `pickCastCommand`.

---

**Defect 2 — severity: medium**

**What is wrong:** Two spec scenarios require that the CLI `main()` behavior for a missing `<brand>` argument be covered by automated tests:

- Scenario "report CLI without a brand argument exits with usage error" (spec lines 100–106): requires invoking `main()` with no brand arg, observing stderr usage message and non-zero exitCode.
- Scenario "pick-cast CLI without a brand argument exits with usage error" (spec lines 108–113): same for pick-cast.

Neither test file contains any reference to `main`, `process.argv`, `exitCode`, `spawn`, `spawnSync`, or `fork`. The `main()` functions in `report.ts` (lines 137–146) and `pick-cast.ts` (lines 102–111) implement the correct behavior, but that behavior is not exercised by any automated test. Acceptance criterion 5 states "omitting `<brand>` is a clear error or prompt, never a silent MundoTip fallback" — the spec's own scenarios for this criterion are the two unmet scenarios above.

**Repro steps:**
1. Open `src/commands/report.test.ts`. Search for any test that references `main`, `process.argv`, `exitCode`, `spawnSync`, or spawns the CLI as a subprocess. None exists.
2. Open `src/commands/pick-cast.test.ts`. Same search — none exists.
3. Observe that the code at `report.ts:139` (`if (brand === undefined)`) and `pick-cast.ts:104` (`if (brand === undefined || ...)`) is not covered by any test assertion.

**Fix guidance:** Add one test per file that exercises the CLI usage-error path. The simplest approach is to spawn the CLI as a child process with no arguments (e.g. using `node:child_process` `spawnSync`) and assert: (a) exit code is non-zero, (b) stderr contains "usage". Alternatively, if `main()` is exported, call it directly after mocking `process.argv` and checking `process.exitCode`. The subprocess approach is most robust since it matches the actual user-facing behavior exactly.

---

**Summary:** The slice is correct in its implementation — code, markdown files, and agent prompts are all properly updated and the suite is genuinely green. The two defects are coverage gaps against spec scenarios that the developer's own spec committed to covering. Both are medium severity: the behavior is correct in code, but the spec scenarios are unmet, which means the contract is not fully tested. The verdict is FAIL; the developer should add the four missing test cases (two for Defect 1, two for Defect 2) and resubmit.

---

## Round-2 Build (developer)

### Defect 1 fix — Resolver fallback path never exercised

**Root cause:** Every brand-routing test passed an explicit `ledgerPath` override, so the
`ledgerPath ?? resolveBrand(brand).ledger` branch in `reportCommand` and
`options.ledgerPath ?? brandPaths.ledger` branch in `pickCastCommand` were never taken by any test.
The test named "when no explicit ledgerPath is provided" in `report.test.ts` still passed
`mundotipLedger` as the second argument — the name contradicted the implementation.

**Changes made:**

- `src/commands/report.ts` — added optional `brandsRoot?: string` as a third parameter to
  `reportCommand`. When `ledgerPath` is absent, it calls `resolveBrand(brand, brandsRoot).ledger`
  (passing `brandsRoot` through). This is the minimal change: `resolveBrand` already accepted
  `brandsRoot`; the command just needed to thread it through.

- `src/commands/pick-cast.ts` — added `brandsRoot?: string` to `PickCastOptions`. When
  `options.ledgerPath` is absent, the command calls `resolveBrand(brand, options.brandsRoot)`.
  Same minimal pattern.

- `src/commands/report.test.ts` — rewrote the misleadingly-named test
  "reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath
  is provided" so it actually calls `reportCommand("mundotip", undefined, tmpRoot)` with NO
  `ledgerPath` argument. The temp directory is structured as `<tmpRoot>/mundotip/ledger.json`
  (exactly the layout `resolveBrand` derives), seeded with a distinctive fixture
  (`"Resolver Fallback Idea"` / `mt-resolver-01`). The assertion confirms the resolver-derived
  path was read, not any fallback or override.

- `src/commands/pick-cast.test.ts` — added a new test
  "pickCastCommand routes to the Brand's ledger via the resolver when no explicit ledgerPath is
  provided" (appended to the existing brand-routing `describe` block). It calls
  `pickCastCommand("mundotip", "mt-resolver-idea", 1, { brandsRoot: tmpRoot, queuePath, now })` —
  no `ledgerPath` key in options — and asserts: (a) the Idea is found and `cast-1` is selected,
  (b) one render job lands in the queue. Both confirm the `options.ledgerPath ?? brandPaths.ledger`
  branch was taken.

**New tests (Defect 1):**
- `report.test.ts`: "reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath is provided" — now genuinely tests `reportCommand(brand, undefined, brandsRoot)`. Covers spec scenario "reportCommand routes to the Brand's ledger via the resolver (called WITHOUT explicit ledgerPath override)" (spec lines 73–78).
- `pick-cast.test.ts`: "pickCastCommand routes to the Brand's ledger via the resolver when no explicit ledgerPath is provided" — tests `pickCastCommand(brand, ideaId, n, { brandsRoot })` with no `ledgerPath`. Covers spec scenario "pickCastCommand routes to the Brand's ledger via the resolver (called WITHOUT explicit path overrides)" (spec lines 87–92).

### Defect 2 fix — CLI usage-error behavior untested

**Root cause:** The `main()` functions in `report.ts` and `pick-cast.ts` were not exported, so no
test could invoke them. Neither test file referenced `main`, `process.argv`, `exitCode`, or any
subprocess spawning.

**Changes made:**

- `src/commands/report.ts` — exported `main` (`async function main()` → `export async function main()`).
- `src/commands/pick-cast.ts` — same.

- `src/commands/report.test.ts` — added import of `main as reportMain`; added new describe block
  "report CLI main() — exits with usage error when <brand> is absent" with one test
  "writes a usage message to stderr and sets a non-zero exit code when no brand arg is given".
  The test sets `process.argv = ["node", "report.ts"]` (no brand arg), captures `process.stderr.write`
  output, calls `await reportMain()`, then asserts: (a) stderr contains `/usage/i`, (b)
  `process.exitCode` is non-zero. Originals are restored in a `finally` block.

- `src/commands/pick-cast.test.ts` — same pattern: import `main as pickCastMain`; new describe block
  "pick-cast CLI main() — exits with usage error when <brand> is absent" with one test
  "writes a usage message to stderr and sets a non-zero exit code when no args are given".

**New tests (Defect 2):**
- `report.test.ts`: "writes a usage message to stderr and sets a non-zero exit code when no brand arg is given" — covers spec scenario "report CLI without a brand argument exits with usage error" (spec lines 100–106).
- `pick-cast.test.ts`: "writes a usage message to stderr and sets a non-zero exit code when no args are given" — covers spec scenario "pick-cast CLI without a brand argument exits with usage error" (spec lines 108–113).

### Results

- Tests: 241 pass / 0 fail / 0 skip (up from 238; 3 new tests added — the two new tests for Defect 2, plus the rewritten Defect 1 test for `pick-cast` is genuinely new; the `report` Defect 1 test replaced the misleading test rather than adding a net-new one).
- `npm run build` — exit 0, zero TypeScript errors.
- `npx openspec validate issue-20-brand-scoped-granular-commands --strict` — "Change 'issue-20-brand-scoped-granular-commands' is valid".

### Files changed in Round 2

- `src/commands/report.ts` — `reportCommand` gains optional `brandsRoot?` third param; `main` exported.
- `src/commands/pick-cast.ts` — `PickCastOptions` gains `brandsRoot?`; `pickCastCommand` passes `options.brandsRoot` to `resolveBrand`; `main` exported.
- `src/commands/report.test.ts` — rewritten resolver-fallback test (no longer misleadingly named / no longer passes an explicit ledger path); added `main()` usage-error test suite; import updated to include `main as reportMain`.
- `src/commands/pick-cast.test.ts` — new resolver-fallback test added to brand-routing suite; new `main()` usage-error test suite; import updated to include `main as pickCastMain`.

---

## QA Verdict — Round 2: PASS

### Suite result

Commands run exactly as specified in the Round-2 Build Report:

- `npm run build` — exit 0. TypeScript compiled with zero errors.
- `npx openspec validate issue-20-brand-scoped-granular-commands --strict` — output: "Change 'issue-20-brand-scoped-granular-commands' is valid". Green.
- `npm test` (command: `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`) — **241 tests, 241 pass, 0 fail, 0 skipped**. Green. (Up from 238 in Round 1; 3 net new tests added.)

### Defect 1 re-verification: FIXED

**Evidence that the resolver fallback branch is now genuinely exercised:**

`report.test.ts` line 364: `const out = await reportCommand("mundotip", undefined, tmpRoot)` — the second argument is literally `undefined`, not a path string. The `??` branch at `report.ts:129` (`const resolvedLedgerPath = ledgerPath ?? resolveBrand(brand, brandsRoot).ledger`) is necessarily taken. The temp directory is structured as `<tmpRoot>/mundotip/ledger.json` — the exact layout `resolveBrand` derives — seeded with the distinctive id `"mt-resolver-01"` and title `"Resolver Fallback Idea"`. The assertion `assert.match(out, /Resolver Fallback Idea/)` proves the resolver-derived path was read, not any override. If the `??` branch were not taken (e.g. if `ledgerPath` were somehow truthy), the test would fail because no other path could produce "Resolver Fallback Idea". The test passes in the actual suite run.

`pick-cast.test.ts` line 269: `await pickCastCommand("mundotip", "mt-resolver-idea", 1, { brandsRoot: tmpRoot, queuePath, now: () => PICK_NOW })` — the options object contains `brandsRoot`, `queuePath`, and `now`, but no `ledgerPath` key. The `??` branch at `pick-cast.ts:84` (`const ledgerPath = options.ledgerPath ?? brandPaths.ledger`) is necessarily taken. The test asserts both that the Idea is found (`/mt-resolver-idea/`) and the Character selected (`/cast-1/`), and that one render job lands in the queue. Both assertions can only pass if the resolver-derived path (`<tmpRoot>/mundotip/ledger.json`) was actually read. The test passes.

Suite output confirms both: `"reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath is provided" (6.098833ms)` and `"pickCastCommand routes to the Brand's ledger via the resolver when no explicit ledgerPath is provided" (14.675208ms)` — both marked with checkmarks.

The `brandsRoot` parameter introduced by the fix does not introduce a silent MundoTip default. When `brandsRoot` is `undefined` in the CLI path (i.e. `reportCommand(brand)` called from `main()`), `resolveBrand` defaults to `DEFAULT_BRANDS_ROOT = "data/brands"` — a directory root, not a brand-specific path. The brand slug is still required as the first argument; omitting it remains a usage error (the `main()` guard runs before `reportCommand` is called). No silent fallback is introduced.

### Defect 2 re-verification: FIXED

**Evidence that the CLI usage-error behavior is now tested:**

`report.test.ts` line 8: `import { renderReport, reportCommand, main as reportMain } from "./report.ts"` — `main` is now exported and imported. Test at line 391: sets `process.argv = ["node", "report.ts"]` (no brand arg), intercepts `process.stderr.write`, calls `await reportMain()`, then asserts `assert.match(stderr, /usage/i)` and `assert.notEqual(process.exitCode, 0)`. Both assertions directly test the spec scenarios. The test passes: suite output shows `"writes a usage message to stderr and sets a non-zero exit code when no brand arg is given" (0.326333ms)`.

`pick-cast.test.ts` line 7: `import { pickCastCommand, selectCharacter, main as pickCastMain } from "./pick-cast.ts"` — same pattern. Test at line 289 sets `process.argv = ["node", "pick-cast.ts"]` (no args), intercepts stderr, calls `await pickCastMain()`, asserts `/usage/i` on stderr and `process.exitCode !== 0`. The test passes: `"writes a usage message to stderr and sets a non-zero exit code when no args are given" (0.316542ms)`.

The exported-`main` change is purely additive (adding `export` to an existing function declaration). It does not alter the function body or the `import.meta.url` guard that prevents `main()` from running on import. The guard at `report.ts:152` (`if (import.meta.url === \`file://${process.argv[1]}\`)`) is unchanged — `main()` still only auto-runs when the file is invoked directly as a script.

### Per-criterion results — Round 2

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every granular command accepts and requires an explicit `<brand>` argument and operates only on that Brand's paths. | PASS | Unchanged from Round 1. Seven doc-surface tests read each `.claude/commands/*.md` and assert `/<brand>/i`. All 7 files confirmed. |
| 2 | The TS commands `report` and `pick-cast` resolve and read the correct Brand's ledger/ideas via the resolver; run against MundoTip they reproduce today's behavior exactly. | PASS | Brand-routing suites pass. The resolver-fallback tests (Defect 1 fix) now confirm the `resolveBrand` path is taken when no `ledgerPath` override is supplied. "Reproduces today's behavior" covered by the existing `reportCommand` fixture tests (format, fields, baseline). |
| 3 | The content agents thread the Brand end-to-end and restate the Brand at each human gate. | PASS | Unchanged from Round 1. All four agent files confirmed. Three human gates confirmed (Review in `review-ideas.md`, Cast pick in `producer.md`, Publish in `log-post.md`). |
| 4 | No global active-brand pointer file is written or read anywhere. | PASS | Unchanged from Round 1. Grep confirms no pointer file exists or is referenced. Brand-routing tests confirm isolation. |
| 5 | The interim single-Brand default is removed; omitting `<brand>` is a clear error, never a silent MundoTip fallback. | PASS | Defect 2 is fixed. Both `main()` functions are now tested: `process.argv` is mocked to simulate no `<brand>` arg; tests assert stderr contains `/usage/i` and `process.exitCode !== 0`. Neither command reads any ledger file in the no-brand path (the guard returns before `reportCommand`/`pickCastCommand` is called). `DEFAULT_LEDGER_PATH` remains absent from both command files. |
| 6 | The granular commands remain usable standalone (not gated by `/run-pipeline`). | PASS | Unchanged from Round 1. All tests invoke `reportCommand` and `pickCastCommand` directly without a pipeline wrapper. |
| 7 | The always-rules hold per Brand. | PASS | Unchanged from Round 1. generate-never-publish, public-metrics-only, relative-not-absolute, explicit-attribution, and ledger-as-source-of-truth all confirmed — see detail in Round 1 verdict and always-rules section below. |
| 8 | Unit tests cover the TS command brand-routing (report/pick-cast resolve the correct Brand's paths). | PASS | Defect 1 is fixed. The brand-routing suites now include tests that call `reportCommand(brand, undefined, brandsRoot)` and `pickCastCommand(brand, ideaId, n, { brandsRoot })` — no `ledgerPath` in either call. The `??` resolver branch is genuinely exercised and proven by distinctive fixtures. |

### Per-scenario results — Round 2

**Requirement: Every granular command SHALL accept and require an explicit Brand argument**

| Scenario | Result | Covering test |
|---|---|---|
| /report with a brand slug reads that Brand's ledger | PASS | `report.test.ts` line 312 — passes |
| /report for a different brand reads that brand's ledger | PASS | `report.test.ts` line 322 — passes |
| omitting `<brand>` from /report is a clear error | PASS | `report.test.ts` line 391: `main as reportMain` called with no brand arg; asserts stderr `/usage/i` + non-zero exitCode — passes |
| /pick-cast with a brand slug reads that Brand's ledger and enqueues into the shared queue | PASS | `pick-cast.test.ts` lines 182, 220 — passes |
| /pick-cast for a different brand does not touch another brand's ledger | PASS | `pick-cast.test.ts` line 206 — passes |

**Requirement: No global active-brand pointer file SHALL be written or read**

| Scenario | Result | Covering test |
|---|---|---|
| Concurrent commands on different brands do not share per-brand state paths | PASS | `pick-cast.test.ts` line 220 and `report.test.ts` line 332 — both pass |

**Requirement: The TS commands report and pick-cast resolve the correct Brand via the resolver**

| Scenario | Result | Covering test |
|---|---|---|
| reportCommand routes to the Brand's ledger via the resolver (called WITHOUT explicit ledgerPath) | PASS | `report.test.ts` line 342: `reportCommand("mundotip", undefined, tmpRoot)` — no ledgerPath; distinctive fixture id `mt-resolver-01` proved; passes |
| reportCommand against mundotip reproduces today's behavior | PASS | `report.test.ts` lines 157–178 and brand-routing suite — passes |
| pickCastCommand routes to the Brand's ledger via the resolver (called WITHOUT explicit path overrides) | PASS | `pick-cast.test.ts` line 243: `{ brandsRoot: tmpRoot, queuePath, now }` — no ledgerPath key; Idea found and render enqueued via resolver-derived path; passes |

**Requirement: The interim single-Brand default is removed from CLI entry points**

| Scenario | Result | Covering test |
|---|---|---|
| report CLI without a brand argument exits with usage error | PASS | `report.test.ts` line 391: `reportMain()` called with `process.argv = ["node", "report.ts"]`; stderr `/usage/i` + non-zero exitCode asserted — passes |
| pick-cast CLI without a brand argument exits with usage error | PASS | `pick-cast.test.ts` line 289: `pickCastMain()` called with `process.argv = ["node", "pick-cast.ts"]`; stderr `/usage/i` + non-zero exitCode asserted — passes |

**Requirement: Content agents thread the Brand and restate it at each human gate**

| Scenario | Result | Covering test |
|---|---|---|
| trend-scout threads the Brand through all its file I/O | PASS | Doc-surface test `report.test.ts` line 252; QA direct read of `trend-scout.md` confirmed |
| producer restates the Brand at Gate 2 (Cast pick) | PASS | Doc-surface test `report.test.ts` line 264; QA direct read of `producer.md` line 37 confirmed |
| always-rules hold per Brand | PASS | See always-rules section below |

### Always-rules and Magnific-fake checks — Round 2

**Generate-never-publish (ADR-0002):** PASS. No changes to the always-rules posture from Round 1. `reportCommand` remains read-only. `pickCastCommand` writes only to the queue. The existing "renders the Asset and takes NO publish action" test (241-test suite) continues to pass. The `brandsRoot` and exported-`main` additions do not touch any publish path.

**Public-metrics-only:** PASS. No changes. Neither `report.ts` nor `pick-cast.ts` reads metrics. Agent markdowns unchanged from Round 1.

**Relative-not-absolute:** PASS. No changes. `renderReport` output unchanged; test "a measured score is shown relative to the Channel baseline" passes.

**Explicit-attribution:** PASS. No changes. `renderReport` uses `idea.post_url ?? ""` only. Test "shows a posted Idea linked to its Post via the logged post_url" passes.

**Ledger-as-source-of-truth:** PASS. Both TS commands read from the brand-scoped ledger (via the resolver or explicit override). `pick-cast.ts` writes only to the queue. Brand-routing tests confirm no cross-Brand ledger contamination. The new resolver-fallback tests confirm the ledger path is brand-scoped in the no-override case.

**Magnific fake check:** PASS. QA re-grepped all `*.test.ts` files for `spaces_edit`, `spaces_run`, `spaces_state`, `spaces_get_nodes`, `creations_get`, `creations_wait`, `creations_show`, `creations_search`. The only hit is a describe-string literal in `src/execution-protocol/parse.test.ts`: `"parse — correct resolution against the fake spaces_state"` — this is a test suite name, not a tool invocation. No test makes a live Magnific MCP call. The new Round-2 tests (resolver-fallback and main() usage-error) are pure filesystem and process-state logic with no Magnific interactions whatsoever. No credits were spent; no board was mutated.

**No global active-brand pointer:** PASS. Grep for "active-brand", "active_brand", "current-brand", "brand-pointer" in `src/` and `.claude/` returns zero results. Unchanged from Round 1.

**brandsRoot criterion-5 safety check:** The `brandsRoot` parameter added by the Defect 1 fix defaults to `undefined`, which causes `resolveBrand` to use `DEFAULT_BRANDS_ROOT = "data/brands"`. This is a directory root, not a brand slug. The brand slug is still required as the first argument to `reportCommand` and `pickCastCommand` — it comes from `process.argv[2]`, and the `main()` guard exits before the command is called if it is absent. There is no path by which `brandsRoot: undefined` produces a silent MundoTip default. Criterion 5 is not regressed.

### Defect list

No new defects found. Defect 1 and Defect 2 from Round 1 are both closed.

**Defect 1 (medium) — CLOSED.** The resolver fallback branch (`ledgerPath ?? resolveBrand(brand, brandsRoot).ledger` in `report.ts:129` and `options.ledgerPath ?? brandPaths.ledger` in `pick-cast.ts:84`) is now exercised by tests that genuinely omit the override, use a distinctive temp-dir fixture, and assert the resolver-derived path was read. The previously misleading test name is corrected and the test body matches its claim.

**Defect 2 (medium) — CLOSED.** Both `main()` functions are exported and directly invoked by new tests. The tests mock `process.argv`, intercept `process.stderr.write`, and assert both `/usage/i` on stderr and a non-zero `process.exitCode`. The spec scenarios "report CLI without a brand argument exits with usage error" (spec lines 100–106) and "pick-cast CLI without a brand argument exits with usage error" (spec lines 108–113) are fully covered.
