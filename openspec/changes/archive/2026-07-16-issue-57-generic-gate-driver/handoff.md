# Slice Handoff — issue-57-generic-gate-driver

Bidirectional channel between `developer` and `qa`. Nothing is overwritten; retries append `Round-N`
blocks.

---

## Build Report (Round 1)

### What changed

Replaced the fixed two-phase Space driver (`composeAndCast`/`pickAndRender`, hard-split on
`gate === "cast"`) with **one generic run-until-gate engine**, `driveToNextGate`
(`src/space-driver/driver.ts`). It drives ONE leg of a Recipe's Execution Protocol at a time — a
**first** leg (injects the Spec, resolves and runs the run-point matching a caller-supplied
`targetGate` by name) or a **resumed** leg (pins the Operator's resolved pick into a caller-supplied,
Recipe-declared node BEFORE resolving/running its own run-point) — and either PAUSES with that gate's
candidates or FINISHES with the rendered Asset when `targetGate` is `null`. Fallback-Protocol recovery
(missing/stale run-point → the in-canvas agent) applies only to a Recipe's FIRST leg, exactly mirroring
the old Cast-gate-only recovery scope; a resumed leg's unresolved run-point fails directly
(`run_point_unresolved`), matching the old Phase-B (clip) behavior, which never attempted recovery
either. `pinCharacter`/`pinGoal` generalized to `pinPick`/`pinGoal(pick, nodeName)`, taking the target
node name explicitly instead of the hard-coded `CHARACTER_NODE_NAME` constant.

Opened the Execution Protocol parser's valid-gate set (`src/execution-protocol/parse.ts`,
`protocol.ts`): `RunPointGate` widened from the fixed `"cast" | null` to `string | null`; the parser now
accepts `null` or ANY non-empty gate-name string, rejecting only a malformed shape (not a string, or an
empty string) rather than a fixed allow-list.

Added the generic pick/resume command, `/pick <brand> <idea-id> <recipe> <gate> <pick>`
(`src/commands/pick.ts`): it resolves the gate AFTER `<gate>` from the named Recipe's own declared
`gates` list, enqueues the Production Queue's generic next leg carrying the ALREADY-RESOLVED `<pick>`,
and clears `<gate>`. `/pick-cast` (`src/commands/pick-cast.ts`) is now a **thin alias**: its
ledger-reading half (finding the Idea's Asset paused at the Cast gate, mapping the 1-based `<n>` to a
Character, every refusal message) is completely UNCHANGED, but its queue-resume tail now calls the
SAME `resumeGate` primitive `/pick` uses — the two commands can never drift on how a pick actually
resumes production.

Proved zero-gate and multi-gate genericity with a new test-only `ConfigurableFakeSpace`
(`src/space-driver/driver.test.ts`, never reusing the wired `FakeSpace`'s hard-coded Cast/Character node
names): a single gateless run-point runs straight through to a finished Asset with no pause at all, and
a 2-gate-plus-final-render sequence pauses and resumes at each gate in order, pinning a DIFFERENT
Recipe-declared node name at each resumed leg.

### Files touched

**New:**
- `src/commands/pick.ts`, `src/commands/pick.test.ts`
- `.claude/commands/pick.md`
- `openspec/changes/issue-57-generic-gate-driver/{proposal.md,tasks.md,handoff.md}`,
  `specs/generic-gate-driver/spec.md` (new capability), `specs/execution-protocol/spec.md` (delta),
  `specs/cast-render/spec.md` (delta)

**Modified:**
- `src/space-driver/driver.ts` — `composeAndCast`/`pickAndRender`/`pinCharacter`/`castFallbackGoal`
  replaced by `driveToNextGate`/`pinPick`/`fallbackGoal`; `injectSpec`/`runRunPoint`/`fetchCast`/
  `fetchAsset` (already gate-agnostic) untouched
- `src/space-driver/driver.test.ts` — rewritten for the new API; wired-recipe scenarios preserved
  1:1 (same fake, same fault scenarios); zero/multi-gate `ConfigurableFakeSpace` suite added
- `src/execution-protocol/protocol.ts` — `RunPointGate` widened to `string | null`
- `src/execution-protocol/parse.ts` — dropped the hard-coded `VALID_GATES` set
- `src/execution-protocol/parse.test.ts` — old "gate: review is invalid" test replaced (it's now
  valid); added malformed-shape tests (non-string, empty-string gate) + arbitrary-gate-name tests
- `src/space-driver/live/contract.test.ts`, `src/space-driver/live/driver-over-live.test.ts` — call
  sites updated to the renamed/generalized driver API (still 100% hermetic replay, issue #40's
  `LiveSpaceAdapter`/`ReplayMcpTransport` fixtures, no live calls)
- `src/commands/pick-cast.ts` — tail delegates to `resumeGate` (`pick.ts`); its own private
  `nextGateAfter` removed (moved, generalized, to `pick.ts`); ledger-reading half byte-for-byte
  unchanged
- `package.json` — `pick` npm script
- `.claude/commands/pick-cast.md` — "Target" note resolved to present tense (thin-alias relationship)

**Untouched (confirmed, deliberately in scope-of-no-change):** `production-queue/**`
(`queue.ts`/`scheduler.ts`/`store.ts` are already fully generic since issue #56 — `gate: string | null`,
generic `mark*` transitions — nothing there needed to change), `recipe/registry.ts`, `production-spec/**`,
`space-driver/fixtures/fake-space.ts` (the wired-recipe Magnific fake).

### How to run

```bash
# Full suite (type-check + unit tests)
npm test

# One file
node --import tsx --test src/space-driver/driver.test.ts
node --import tsx --test src/commands/pick.test.ts
node --import tsx --test src/commands/pick-cast.test.ts
node --import tsx --test src/execution-protocol/parse.test.ts

# Build (emits dist/, catches anything npm test's tsc might not)
npm run build

# OpenSpec
npx openspec validate issue-57-generic-gate-driver --strict
npx openspec validate --all --strict   # confirm nothing else broke
```

Current state: **929/929 unit tests green** (0 failures), `npm run build` clean, `npx openspec validate
--all --strict` green (17/17 items, including this change).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (from issue #57) | Proven by |
|---|---|---|
| 1 | One `driveToNextGate`-style loop replaces the fixed two-phase split; the wired recipe still behaves identically (cast → pick → render) | `src/space-driver/driver.ts`'s `driveToNextGate` (single exported function; `composeAndCast`/`pickAndRender` deleted). `driver.test.ts` → **"driveToNextGate — the wired recipe: first leg (targetGate: cast) pauses with the Cast"** (4 tests, incl. Fallback-Protocol recovery, `inject_unconfirmed`) and **"driveToNextGate — the wired recipe: resumed leg (targetGate: null) pins, renders, and FINISHES"** (4 tests, incl. `pin_unconfirmed`, no-publish-action) — same fake (`FakeSpace`), same fault scenarios as the predecessor's tests, now driven through the ONE generic function. `commands/pick-cast.test.ts`'s full 28 tests pass UNCHANGED against the refactored command, proving the "pick" leg of cast → pick → render is unaffected |
| 2 | The protocol parser accepts arbitrary Recipe-declared gate names (not only `"cast"`) | `src/execution-protocol/parse.ts` drops `VALID_GATES`. `parse.test.ts` → **"parse — accepts arbitrary Recipe-declared gate names (ADR-0010, issue #57)"** → **"accepts a gate name other than \"cast\" — the valid-gate set is not hard-coded"** and **"accepts several distinct gate names on one protocol (a multi-gate Recipe)"**; malformed-shape rejection preserved distinctly (**"rejects a run-point whose gate is not a string or null"**, **"...is an empty string"**) |
| 3 | A generic pick/resume command works for any gate; `/pick-cast` is a thin alias for the wired recipe's Cast gate | `src/commands/pick.ts`'s `pickCommand`/`resumeGate`. `pick.test.ts` → **"pickCommand — submits a resolved pick for any Recipe's any gate and resumes production"** → **"works for a Recipe/gate pair not tied to the wired Cast Recipe (generic — never Cast-specific)"** (uses `"future-recipe"`/`"review"`, nothing Cast-related) + idempotency + empty-pick-refusal tests. The alias: `pick-cast.ts`'s tail now calls `resumeGate` directly (read the diff — the private `nextGateAfter` + inline `enqueueNextLeg`/`markPickConsumed`/`saveQueue` calls are gone, replaced by one `resumeGate(...)` call); `pick-cast.test.ts`'s full pre-existing suite (28 tests) passes byte-for-byte against this refactor, proving the alias changed nothing observable |
| 4 | A zero-gate recipe runs straight through; a multi-gate recipe pauses/resumes at each (exercised with fake/test recipes) | `driver.test.ts` → **"driveToNextGate — a ZERO-gate recipe runs straight through, no pause"** → **"a single gateless run-point: first leg injects the Spec, runs it, and FINISHES with the Asset"** (asserts no pin edit, `pick: undefined`) and **"driveToNextGate — a MULTI-gate recipe pauses at each declared gate and resumes with each pick"** → **"walks 2 gates (gateA, gateB) plus a final render — 3 legs, 3 runs, pausing/resuming at each"** (asserts each resumed leg pins into its OWN Recipe-declared node name, 3 runs, correct candidates/pick at each leg) — both against the new test-only `ConfigurableFakeSpace`, never reusing the wired `FakeSpace`'s Cast/Character node names |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | 929/929 unit tests green, `npm run build` clean, `npx openspec validate issue-57-generic-gate-driver --strict` valid, `npx openspec validate --all --strict` 17/17. The single wired Recipe's path is exercised end-to-end by `driver.test.ts`'s wired-recipe suite + `pick-cast.test.ts`'s full pre-existing suite, both against the real `"character-explainer-with-cast"` slug |

### Fakes / fixtures used

- **The Magnific fake is explicitly flagged: `FakeSpace`/`SpaceMcpPort`
  (`src/space-driver/fixtures/fake-space.ts`) is used, UNCHANGED, for every wired-recipe
  `driveToNextGate` test** — the same fake the predecessor `composeAndCast`/`pickAndRender` tests used.
  No test in this slice constructs a live Magnific client or calls `spaces_*`/`creations_*` — confirmed
  by `grep -rn "spaces_\|creations_"` across every file this slice touches, which finds ONLY pre-existing
  docstring vocabulary (describing what the port models), never a live call.
- **New test-only fixture: `ConfigurableFakeSpace`** (`src/space-driver/driver.test.ts`, local to the
  test file) — a minimal, fully parameterizable `SpaceMcpPort` implementation used ONLY to prove
  zero-gate/multi-gate genericity (AC4), per the issue's explicit permission to add test-only
  recipes/fixtures. It never touches live Magnific either (in-memory only, no network).
- **Hermetic live-replay harness (issue #40, unchanged):** `LiveSpaceAdapter`/`ReplayMcpTransport`
  (`src/space-driver/live/`) — its two test files were updated only at CALL SITES (renamed API), still
  driven entirely by recorded/synthetic replay fixtures, never a live MCP call.
- Plain-file fixtures: temp `queue.json` files via `mkdtemp` (`pick.test.ts`), matching every
  pre-existing test pattern in this codebase.
- No credits spent, no board mutation, no network, in any test this slice adds or changes.

### Self-review notes

- Removed the now-dead `cast_run_point_unresolved` `DriverErrorCode` (defined but never actually
  constructed by the predecessor `composeAndCast` either — unresolved always triggered recovery, never a
  hard fail) and renamed `clip_run_point_unresolved` → the generic `run_point_unresolved` (used by ANY
  resumed leg, not just the clip-specific case).
- Renamed `cast_empty` → `candidates_empty` (an empty result can now occur at any paused gate, not only
  the Cast).
- Considered keeping `composeAndCast`/`pickAndRender` alongside the new `driveToNextGate` for extra
  safety, but the issue's AC1 explicitly says the loop "**replaces**" the fixed split — keeping two
  parallel APIs that must be kept in sync forever is the worse outcome, and the full pre-existing test
  coverage (fault scenarios, poll-budget, pin confirmation via the port) was ported 1:1 onto the new API
  rather than dropped, so nothing lost coverage.
- Generalized the Fallback-Protocol goal text (`fallbackGoal(targetGate)` replaces the hard-coded
  `castFallbackGoal()`) rather than special-casing `"cast"` inside a "generic" driver — this is an
  internal LLM-goal string the FAKE never parses for content (only whether it targets `JSON Master` or a
  pin), so genericizing it does not change any OBSERVABLE state-level behavior; `driver.test.ts` still
  asserts the fallback edit's exact text via `fallbackGoal("cast")` for the wired case.
- `nextGateAfter` moved from `pick-cast.ts` (private) to `pick.ts` (exported) — it was already fully
  generic before this slice (issue #56 had already parameterized it over `recipe`/`gate`); this slice
  just gave it a second caller and a shared home so the two pick commands can't drift.
- Ran a read-only "dry fold" check (OpenSpec's own `findSpecUpdates`/`buildUpdatedSpec` +
  `Validator.validateSpecContent`, invoked via `applySpecs(..., { dryRun: true })` — no file writes, no
  `archive` CLI invocation) before finishing, specifically because a prior slice (issue #56) tripped on a
  MODIFIED-header mismatch that `validate --strict` alone did not catch. Result: `cast-render` (5
  modified), `execution-protocol` (1 added), `generic-gate-driver` (7 added) — all resolved cleanly
  against the current base specs with zero errors; `git status --porcelain openspec/specs/` confirmed no
  file was written.

### Known limits

- **Only one Recipe is truly wired** (`character-explainer-with-cast`, `gates: ["cast"]`) — a second
  real Recipe is issue #60/HITL. The zero/multi-gate driver guarantees (AC4) are therefore proven at the
  `driveToNextGate` layer with a synthetic, test-only fake Space/protocol (never the wired one), per the
  issue's own explicit permission. `nextGateAfter`'s "resolves to a MIDDLE gate of a multi-gate Recipe"
  path similarly can't be exercised against the REAL registry today (only "last gate → null" and
  "unwired/unknown → null" are reachable there) — `pick.test.ts` covers both real-registry paths plus
  the fully generic case via a synthetic recipe slug. This mirrors issue #56's own documented precedent
  (proving multi-Recipe queue guarantees with synthetic Recipe slugs before a second Recipe existed).
- **`driveToNextGate`'s Spec-input node target (`JSON Master`) is not parameterized.** Only the PIN
  target (`pinnedReferenceNodeName`) is generalized per-leg, since that is what the multi-gate proof
  needed; every Recipe's Spec injection still goes through `injectSpec`'s existing, unparameterized
  `JSON_MASTER_NODE_NAME` target. Noted as a Non-Goal in the proposal; the seeded Recipe's `specInput`
  field already happens to equal this constant, so it is not a regression, just an unexercised axis of
  genericity.
- **`/pick`'s ambiguity handling is out of scope** (unchanged from `/pick-cast`'s existing behavior): it
  requires an explicit `<recipe>` argument and never disambiguates conversationally — matches the
  issue's own Non-Goals.
- **Pre-existing, NOT introduced by this slice:** `npm run test:docs` has 3 failing subtests (2 in
  `report.docs-test.ts`, 1 in `producer-agent.docs-test.ts`) — confirmed via `git stash` that the
  IDENTICAL 3 failures exist on this branch's parent commit (`8891b60`, issue #56's merge) before any of
  this slice's changes. These are the audit-C2/queue-schema-staleness class of `.claude/agents/
  producer.md` drift explicitly owned by issue #59 ("flip the stale docs-test honesty strings"/"rewrite
  producer.md from the current single-recipe narrative"). `npm test`'s glob (`"src/**/*.test.ts"`)
  deliberately excludes `*.docs-test.ts`, so the 929/929 green bar is unaffected.
- **`producer.md` (the content agent doc) is deliberately untouched.** It still describes the pre-#57
  driving model in its own prose (Phase A/B, `Producer Protocol` `steps` shape) — re-pointing the live
  content `producer` agent at the generic engine (and at the Recipe registry for Space-targeting) is
  explicitly deferred per `recipe/registry.ts`'s own docstring ("re-pointing `producer.md` at the
  registry is deferred... not part of this slice's zero-behaviour-change bar") and issue #59's scope.

---

## QA Verdict — Round 1: PASS

### Suite result

All commands run directly by QA (not merely trusted from the Build Report), on branch
`issue-57-generic-gate-driver` at commit `6ed4d5d`, working tree clean before and after verification.

| Command | Result |
|---|---|
| `npm test` | **929/929 pass, 0 fail** (267 suites). Matches the Build Report's claimed count exactly. |
| `npm run build` | Clean — `tsc -p tsconfig.build.json` produced no errors/output. |
| `npx openspec validate issue-57-generic-gate-driver --strict` | `Change 'issue-57-generic-gate-driver' is valid` (exit 0). |
| `npx openspec validate --all --strict` | `Totals: 17 passed, 0 failed (17 items)` (exit 0). |
| `npm run test:docs` | 20/23 pass, **3 pre-existing failures**: `command surface — final and matches the shipped Producer feature` (subtest 1), `C2: run-pipeline.md is honest that unattended production is not yet wired` (subtest 4), `producer agent definition` (subtest 5). |

**Docs-test regression check:** verified via an isolated `git worktree` at parent commit `8891b60`
(issue-56's merge) — ran `npm run test:docs` there and got the **identical 3 failing subtest names**,
confirming issue #57 introduced **zero new** docs-test failures and made none of the pre-existing three
worse. Worktree was removed after the check; the primary working tree was untouched by this comparison
(see note below on a transient QA-tooling mistake, fully reverted before any test/build/validate command
above was run).

**QA process note (transparency, not a code defect):** mid-verification, QA mistakenly ran
`git checkout 8891b60 -- .` directly against the working tree while investigating the docs-test
baseline, which briefly overwrote 10 tracked files with the parent commit's versions. This was caught
immediately via `git status --porcelain`, reverted with `git checkout HEAD -- .` before any further
commands, and confirmed clean (`git status --porcelain` empty, `git diff HEAD` empty) before any of the
suite/build/validate runs recorded above. The comparison was then redone safely via a separate
`git worktree` so the primary tree was never at risk again. No product code, test, or spec file was
edited or committed by QA at any point — this note exists only so the record is complete.

### Per-criterion results (issue #57 acceptance criteria)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | One `driveToNextGate`-style loop replaces the fixed two-phase split; the wired recipe still behaves identically (cast → pick → render) | **PASS** | `src/space-driver/driver.ts` exports exactly one orchestrator, `driveToNextGate`; `composeAndCast`/`pickAndRender` no longer exist (confirmed by reading the file). `driver.test.ts`'s wired-recipe suites (`"driveToNextGate — the wired recipe: first leg..."`, `"...resumed leg..."`) run against the SAME, byte-for-byte UNCHANGED `FakeSpace` fixture (`git diff 8891b60 6ed4d5d -- src/space-driver/fixtures/fake-space.ts` is empty) and assert the same pin node (`CHARACTER_NODE_NAME = "Character #2"`), same cast node (`CAST_START_NODE_NAME`), same clip node (`CLIP_START_NODE_NAME`), same fault codes as before. `pick-cast.test.ts` — the command that drives the "pick" leg — has **zero diff** (`git diff 8891b60 6ed4d5d -- src/commands/pick-cast.test.ts` is empty) and its full 28-test suite is green against the refactored implementation, proving the alias changed nothing observable. |
| 2 | The protocol parser accepts arbitrary Recipe-declared gate names (not only `"cast"`) | **PASS** | `src/execution-protocol/parse.ts` no longer references any `VALID_GATES` set; gate validation is `gateRaw !== null && (typeof gateRaw !== "string" || gateRaw.trim() === "")` — accepts any non-empty string. `parse.test.ts`'s new describe block **"parse — accepts arbitrary Recipe-declared gate names (ADR-0010, issue #57)"** exercises `gate: "review"` and `gate: "gateA"`/`"gateB"` (names with zero relationship to `"cast"`) and both parse successfully. Malformed-shape rejection is still separately and distinctly tested (`gate: 123`, `gate: ""`) — confirms the parser did not become a rubber stamp. |
| 3 | A generic pick/resume command works for any gate; `/pick-cast` is a thin alias for the wired recipe's Cast gate | **PASS** | `src/commands/pick.ts`'s `pickCommand`/`resumeGate` take an explicit `<recipe>`/`<gate>` and never reference "cast" or "Character" anywhere in their logic (confirmed by reading the file). `pick.test.ts`'s **"works for a Recipe/gate pair not tied to the wired Cast Recipe (generic — never Cast-specific)"** test uses `"future-recipe"`/`"review"`/`"candidate-9"` — none of which exist in the wired Recipe's vocabulary — and passes. `/pick-cast`'s alias claim verified by reading `src/commands/pick-cast.ts`: its ledger-reading half (`assetsAtCastGate`, `findGateCandidateAsset`, `selectCharacter`, every refusal string) is present unchanged, and its tail calls `resumeGate(brand, ideaId, recipe, CAST_GATE, selected.character, queuePath, now)` — the exact same function `pickCommand` calls. `pick-cast.test.ts` has a **literal zero-line diff** from the parent commit and its full suite passes, which is the strongest possible proof the alias is genuinely thin (not just documented as one). |
| 4 | A zero-gate recipe runs straight through; a multi-gate recipe pauses/resumes at each (exercised with fake recipes) | **PASS** — verified genuine, not tautological | See "Zero/multi-gate genuineness" below for the detailed check. Summary: `ConfigurableFakeSpace` uses node/gate names (`"Zero Gate Render"`, `"gateA"`/`"gateB"`, `"Gate A Reference"`/`"Gate B Reference"`) that share **zero** vocabulary with the wired `FakeSpace` (`"Character Variants Generator"`, `"cast"`, `"Character #2"`) — confirmed by grep, these strings appear nowhere in `fake-space.ts`. The zero-gate test asserts exactly 1 edit (the inject) and 1 run, `outcome.kind === "finished"`, and `asset.pick === undefined` — genuinely no pause path taken. The multi-gate test asserts exactly 3 runs total, 2 `"paused"` outcomes with correct candidate sets per gate, then a `"finished"` outcome, and — critically — that each RESUMED leg's pin edit named its OWN distinct node (`"Gate A Reference"` with pick `"a-1"`, `"Gate B Reference"` with pick `"b-2"`), which would be impossible to assert truthfully if the driver were secretly reusing one hard-coded node/gate. |
| 5 | Built test-first against the fake; single-recipe path green; strict validate + suite green | **PASS** | `tasks.md` documents every implementation step preceded by a "write failing tests" step (1.1→1.2, 2.1-2.3→2.4-2.5, 3.1→3.2, 4.1→4.2), all checked off. 929/929 suite green, `npm run build` clean, both `openspec validate --strict` invocations green — all confirmed directly by QA, not merely asserted by the Build Report. |

### Zero/multi-gate genuineness — detailed check (per the task's explicit instruction)

Read `src/space-driver/driver.test.ts`'s `ConfigurableFakeSpace` (lines ~532-600) and the two describe
blocks that use it (lines ~602-677) directly, plus `src/space-driver/fixtures/fake-space.ts` (the wired
fake) for comparison:

- **No shared vocabulary.** `ConfigurableFakeSpace`'s test data — run-point names `"Zero Gate
  Render"`, `"Gate A Generator"`, `"Gate B Generator"`, `"Final Render"`; gate names `"gateA"`,
  `"gateB"`; pin node names `"Gate A Reference"`, `"Gate B Reference"`; creation ids `"asset-zero"`,
  `"a-1"`/`"a-2"`, `"b-1"`/`"b-2"`, `"asset-final"` — never appears in `fake-space.ts`'s wired
  vocabulary (`"Character Variants Generator"`, `"Clip extractor"`, `"cast"`, `"Character #2"`,
  `cast-1..6`). Grepped both files to confirm zero overlap.
- **Zero-gate test genuinely takes the no-pause path.** The test constructs a SINGLE run-point with
  `gate: null`, calls `driveToNextGate` with `kind: "first", targetGate: null`, and asserts
  `outcome.kind === "finished"` (not `"paused"`), `space.editGoals.length === 1` (only the Spec inject,
  no pin edit), `space.runs.length === 1`, and `outcome.asset.pick === undefined` (no preceding gate to
  carry a pick from). A driver that secretly paused somewhere would fail this assertion set.
- **Multi-gate test genuinely pauses and resumes at each gate, in order, with distinct state per leg.**
  Three explicit `driveToNextGate` calls (leg1/leg2/leg3), each constructing its own `DriveLegInput` by
  hand (not looped/generated), asserting: leg 1 (`kind: "first", targetGate: "gateA"`) →
  `outcome.kind === "paused"`, `gate === "gateA"`, candidates `["a-1","a-2"]`; leg 2 (`kind: "resumed",
  targetGate: "gateB", pick: "a-1", pinnedReferenceNodeName: "Gate A Reference"`) → `outcome.kind ===
  "paused"`, `gate === "gateB"`, candidates `["b-1","b-2"]`; leg 3 (`kind: "resumed", targetGate: null,
  pick: "b-2", pinnedReferenceNodeName: "Gate B Reference"`) → `outcome.kind === "finished"`, `asset.pick
  === "b-2"`. Final assertions confirm exactly 3 runs total and that the edit log contains a goal
  mentioning BOTH `"Gate A Reference"` AND `"a-1"` together, and separately BOTH `"Gate B Reference"` AND
  `"b-2"` together — i.e. each resumed leg pinned its OWN Recipe-declared node with its OWN resolved
  pick, not a single shared node/value. This is not reachable by a driver that hard-codes one pin target
  or short-circuits after the first gate.
- **Conclusion: genuine, not a tautology.** Both tests would fail if `driveToNextGate` silently
  special-cased `"cast"`/`"Character #2"` internally, or if it collapsed a multi-gate walk into fewer
  legs than declared, or if it reused one pin target across legs.

### Per-scenario results (spec deltas)

**`openspec/changes/issue-57-generic-gate-driver/specs/generic-gate-driver/spec.md`** (new capability,
all ADDED):

| Requirement / Scenario | Verdict | Covering test |
|---|---|---|
| `driveToNextGate drives one leg...generically` | PASS | `driver.test.ts` wired + `ConfigurableFakeSpace` suites collectively |
| `The wired Recipe behaves identically under the generic engine` | PASS | `driver.test.ts`'s wired-recipe describe blocks + `pick-cast.test.ts` (unchanged) |
| `Fallback-Protocol recovery applies only to a Recipe's first leg` | PASS | `"falls back to the in-canvas agent when the cast run-point is stale..."`, `"falls back when the cast run-point cannot be resolved..."` (first-leg recovery) vs. `"driveToNextGate — a resumed leg's unresolved run-point fails directly (no recovery)"` → `"fails run_point_unresolved when the target gate has no matching run-point, without falling back"` (resumed-leg NO recovery) |
| `pinPick generalizes the pin step over an explicit, Recipe-declared node name` | PASS | `pinPick — pin a resolved candidate...` describe block; multi-gate test's two distinct pin node names (`"Gate A Reference"`/`"Gate B Reference"`) |
| `A zero-gate Recipe drives straight through with no pause` | PASS | `"driveToNextGate — a ZERO-gate recipe runs straight through, no pause"` |
| `A multi-gate Recipe pauses and resumes at each declared gate in order` | PASS | `"driveToNextGate — a MULTI-gate recipe pauses at each declared gate and resumes with each pick"` |
| `A generic pick/resume command submits a resolved pick for any wired Recipe's any gate` | PASS | `pick.test.ts`'s `"works for a Recipe/gate pair not tied to the wired Cast Recipe..."` + idempotency/refusal tests |

**`openspec/changes/issue-57-generic-gate-driver/specs/execution-protocol/spec.md`** (ADDED):

| Scenario | Verdict | Covering test |
|---|---|---|
| A gate name other than "cast" parses successfully | PASS | `parse.test.ts` → `"accepts a gate name other than \"cast\"..."` |
| Several distinct gate names on one protocol all parse | PASS | `parse.test.ts` → `"accepts several distinct gate names on one protocol (a multi-gate Recipe)"` |
| A malformed gate shape is still rejected, distinctly from an unrecognized name | PASS | `parse.test.ts` → `"rejects a run-point whose gate is not a string or null"`, `"...is an empty string"` |

**`openspec/changes/issue-57-generic-gate-driver/specs/cast-render/spec.md`** (MODIFIED, 5 requirements
reworded, all headers pre-existing and unrenamed — see header-match check below):

| Scenario | Verdict | Covering test |
|---|---|---|
| A missing/stale cast run-point recovers via the agent fallback | PASS | `driver.test.ts` wired-recipe first-leg fallback tests |
| injectSpec/runRunPoint/fetchCast port-only scenarios | PASS | unchanged `injectSpec`/`runRunPoint`/`fetchCast` describe blocks |
| Pinning the chosen Character is confirmed by readback / unconfirmed pin fails | PASS | `pinPick` describe block + wired resumed-leg `pin_unconfirmed` test |
| pinPick/runRunPoint(clip)/fetchAsset port-only scenarios | PASS | unchanged describe blocks + wired resumed-leg tests |
| /pick-cast records the chosen Character and resumes production (5 sub-scenarios incl. the new "matches calling resumeGate directly") | PASS | `pick-cast.test.ts`'s full, byte-identical 28-test suite (zero diff from parent commit) |

### OpenSpec header-match check (delta headers vs. base specs — catching a prior-slice-class defect)

Explicitly checked, per the task's instruction, since a prior slice (issue #56) broke on exactly this:

- `specs/generic-gate-driver/spec.md`: **new capability** — `openspec/specs/generic-gate-driver/` does
  not exist yet (confirmed by `ls`), so all 7 headers are correctly ADDED with nothing to match against.
- `specs/execution-protocol/spec.md`: **ADDED only** — one new requirement header, no MODIFIED/REMOVED,
  nothing to match.
- `specs/cast-render/spec.md`: **5 MODIFIED headers**, each checked verbatim against
  `openspec/specs/cast-render/spec.md`'s existing `### Requirement:` headers (via `grep -n "^###
  Requirement:"` on the base spec) — all 5 match exactly, character-for-character:
  - `A missing or stale cast run-point falls back to the in-canvas agent` — matches base line 74.
  - `The driver depends only on a narrow injected Magnific port` — matches base line 90.
  - `Pin the chosen Character via the Fallback Protocol and confirm by readback` — matches base line 118.
  - `Phase B fits the existing narrow Magnific port` — matches base line 266.
  - `/pick-cast records the chosen Character and resumes production` — matches base line 204.
- No RENAMED or REMOVED headers appear anywhere in this change's spec deltas.
- **Conclusion: no archive-breaking header mismatch.** This slice's spec deltas would fold cleanly.

### OpenSpec change faithfulness to the issue + ADR-0010/0003/0009

- `proposal.md`'s "Why"/"What Changes" sections match the issue's "What to build" verbatim in substance:
  the fixed two-phase split → generic `driveToNextGate`; the parser's fixed `"cast"` allow-list →
  arbitrary gate names; a generic pick/resume command with `/pick-cast` kept as a thin alias. No
  criterion from the issue is dropped, and nothing is added beyond what ADR-0010 designed (spot-checked
  against ADR-0010's "Decision" section — the driver becomes a "generic run-until-gate engine", "a
  generic 'submit a pick' command covers any gate", "`/pick-cast` stays as a friendly alias" — all
  present, unchanged in substance).
- ADR-0010's "Concurrency stays serial" consequence and the "no per-Space parallelism" non-goal are
  respected: this slice touches no worker/scheduler code (`production-queue/**` confirmed untouched by
  diff), and the driver still drives exactly one leg per call with no concurrency introduced.
- ADR-0003's original two-phase model is correctly treated as superseded for the general case while the
  wired Recipe's own behavior is preserved byte-for-byte (per criterion 1's evidence above) — this
  matches ADR-0010's own "Consequences": "the character Recipe still behaves identically (the seeded
  entry)".
- No self-consistent-but-wrong spec found: every Requirement's Scenarios trace back either to the issue
  text directly or to ADR-0010's Decision/Consequences, and none contradicts CONTEXT.md, the always-rules,
  or PRD #1 (checked against the "Always-rules" section below).

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| **Generate-never-publish** | PASS | No publish/post primitive exists on `SpaceMcpPort`, `driveToNextGate`, `pickCommand`, or `pickCastCommand` (confirmed by reading all four files in full). `driver.ts`'s own docstrings state this explicitly and the code matches: a paused leg returns candidates and stops; a finished leg returns `AssetResult` (id + URL) and stops. `grep -n "publish\|facebook\|Facebook"` across the touched driver/command files finds only docstring prose reaffirming the human gate, never a publish call. |
| **Public-metrics-only** | PASS (not applicable — no metrics code touched) | This slice touches only the Space driver, the protocol parser, and the pick commands; no Apify/metrics code is in the diff (`git diff 8891b60 6ed4d5d --stat` confirms no `performance-tracker`/metrics files). |
| **Relative-not-absolute** | PASS (not applicable — no scoring/baseline code touched) | Same reasoning; no scoring code in the diff. |
| **Explicit-attribution** | PASS | `/pick` requires an explicit `<recipe>` and `<gate>` argument and never infers or guesses one (confirmed in `pick.ts`: `pickCommand(brand, ideaId, recipe, gate, pick, ...)`, all required positional args, no disambiguation logic). `/pick-cast`'s pre-existing multiple-Assets-gated refusal (never guesses which Recipe) is untouched (`pick-cast.test.ts` zero-diff). |
| **Ledger-as-source-of-truth** | PASS | `resumeGate`/`pickCommand` never touch the ledger — confirmed by reading `pick.ts`'s imports (only `production-queue/*` and `recipe/registry.ts`, no `ledger/*`). `/pick-cast`'s ledger-reading half (the only ledger-touching code in this slice's surface) is byte-for-byte unchanged. The Production Queue (`data/queue.json`) is correctly treated as the mechanism for gate-cursor state, per ADR-0006/0008 — not a violation of ledger-as-source-of-truth, since the ledger was already the authority for Cast/Character/Asset data before this slice and remains so. |
| **Magnific fake used throughout — no live-Space calls** | PASS | `grep -rn "spaces_\|creations_"` across every file touched by this slice (`pick.ts`, `pick.test.ts`, `pick-cast.ts`, `driver.ts`, `driver.test.ts`, `parse.ts`, `parse.test.ts`, `protocol.ts`, `live/contract.test.ts`, `live/driver-over-live.test.ts`) returns **only doc-comment prose** describing what the port models (e.g. `"start a spaces_run..."`, `"the spaces_edit Fallback Protocol"`) — zero executable calls to any `spaces_*`/`creations_*` tool. Every test drives either the unchanged `FakeSpace` (zero-diff from parent commit), the new in-memory-only `ConfigurableFakeSpace` (no network, confirmed by reading its full implementation — it only pushes to in-memory arrays/maps), or the pre-existing hermetic `LiveSpaceAdapter`/`ReplayMcpTransport` replay harness (issue #40's recorded/synthetic fixtures — confirmed by reading the diff to `live/contract.test.ts`/`live/driver-over-live.test.ts`, which shows only call-site renames, not new transport logic). No credits, no board mutation, no network in any test this slice adds or changes. |

### Defect list

None. No defects found at any severity.

### Verdict rationale

- Suite, build, and both OpenSpec validations were run directly by QA and confirmed green (929/929,
  clean build, 1/1 and 17/17 respectively) — not merely trusted from the Build Report.
- Every acceptance criterion maps to a real, passing test that genuinely exercises it, including the
  zero/multi-gate criterion, which was independently verified to be non-tautological (distinct
  vocabulary from the wired path, genuine 3-leg walk with per-leg distinct pin targets).
- The wired Recipe's regression bar is met at the strongest level achievable: `pick-cast.test.ts` and
  `fake-space.ts` both have a **literal zero-line diff** from the pre-slice commit, and their full
  pre-existing suites pass unmodified against the refactored code.
- The OpenSpec change faithfully matches the issue and ADR-0010/0003/0009, with no dropped criteria, no
  scope creep, and no self-consistent-but-wrong spec. All MODIFIED spec-delta headers were individually
  checked against the base specs and resolve cleanly — no archive-breaking mismatch, unlike the class of
  defect a prior slice (issue #56) produced.
- No live-Space call exists anywhere in this slice's tests or fixtures; the Magnific fake (existing and
  new test-only) and the hermetic replay harness are used throughout.
- All five always-rules hold, with generate-never-publish specifically confirmed by the absence of any
  publish primitive on the driver or either pick command.

**Recommendation: proceed to PR.**
