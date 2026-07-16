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
