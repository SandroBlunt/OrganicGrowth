## Why

ADR-0010 moved a Recipe's how-to-run plan — its ordered **gate list**, its Production-Spec shape, its
copy shape, and which Space it drives — off the Space and into the in-repo **Recipe** (issue #54's
registry). The Space keeps only its media run-points (the Execution Protocol). But the driver
(`src/space-driver/driver.ts`) and the protocol parser (`src/execution-protocol/parse.ts`) never caught
up: the driver still hard-splits on a fixed two-phase `composeAndCast`/`pickAndRender` keyed on
`gate === "cast"`, and the parser's valid-gate set is still the fixed `Set(["cast"])`. Neither can drive
a Recipe with zero gates (an unattended end-to-end render) or more than one gate — the exact shapes
ADR-0010 designed for. `/pick-cast` is the only "submit a pick" command, and it is Cast-gate-specific
code, not a friendly alias over something generic.

## What Changes

- **The protocol parser accepts arbitrary Recipe-declared gate names.** `RunPointGate` widens from the
  fixed `"cast" | null` to `string | null`; `parse()`'s gate validation drops the hard-coded
  `Set(["cast"])` and instead accepts any non-empty gate-NAME string (or `null`) — which names are
  valid for a given production plan is the in-repo Recipe's own concern, never this parser's.
- **`driveToNextGate` replaces the fixed two-phase `composeAndCast`/`pickAndRender` split**
  (`src/space-driver/driver.ts`). One generic function drives ONE leg of a Recipe's Execution Protocol:
  a **first** leg (no gate resolved yet) injects the Spec, resolves the run-point matching the caller's
  `targetGate` by NAME from the parsed protocol, runs it, and either PAUSES with that gate's candidates
  or — for a gateless Recipe's `targetGate: null` — FINISHES straight through with the rendered Asset. A
  **resumed** leg (a preceding gate's pick has resolved) pins that pick into the Recipe-declared node
  BEFORE resolving/running its own run-point, then pauses at the NEXT gate or finishes. The
  Fallback-Protocol recovery (missing/stale run-point → the in-canvas agent) applies only to a Recipe's
  FIRST leg, mirroring today's Cast-gate recovery exactly — a resumed leg's unresolved run-point fails
  directly (`run_point_unresolved`), matching the old Phase-B behavior. `pinCharacter`/`pinGoal`
  generalize to `pinPick`/`pinGoal(pick, nodeName)`, taking the target node name explicitly (Recipe-
  declared, never hard-coded) rather than the fixed `CHARACTER_NODE_NAME` constant.
- **A generic pick/resume command, `/pick <brand> <idea-id> <recipe> <gate> <pick>`**
  (`src/commands/pick.ts`), submits an ALREADY-RESOLVED pick for any wired Recipe's any declared gate:
  it resolves the gate AFTER `gate` from that Recipe's own `Recipe.gates` list (`nextGateAfter`),
  enqueues the queue's generic next leg (`enqueueNextLeg`, issue #56) carrying the pick, and clears the
  gate (`markPickConsumed`). This command never reads the ledger — mapping a Recipe-specific selection
  UX (e.g. a 1-based index) to a resolved pick is each Recipe's own command's job.
- **`/pick-cast` becomes a thin alias.** It keeps its OWN ledger-reading half UNCHANGED byte-for-byte
  (finding the Idea's Asset paused at the Cast gate, selecting the nth Cast member, every refusal
  message) but DELEGATES its queue-resume mechanics to the SAME `resumeGate` primitive `/pick` uses —
  the two commands can never drift on how a pick actually resumes production.
- **Zero-gate and multi-gate coverage, proven with test-only fixtures.** Only one real Recipe is wired
  (`gates: ["cast"]`) — a second is issue #60/HITL — so `driveToNextGate`'s genericity is proven against
  a fully synthetic, configurable fake `SpaceMcpPort` (never reusing the wired `FakeSpace`'s hard-coded
  Cast/Character node names): a single gateless run-point runs straight through to a finished Asset with
  no pause, and a 2-gate + final-render sequence pauses and resumes at each gate in order, pinning a
  DIFFERENT Recipe-declared node name per gate.

## Non-Goals (explicitly deferred)

- **A second real wired Recipe.** Issue #60/HITL. The zero/multi-gate driver guarantees are proven at
  the driver layer with synthetic run-point/gate configurations (the driver carries no dependency on the
  Recipe registry itself — see below), mirroring issue #56's own precedent of proving multi-Recipe queue
  guarantees with synthetic Recipe slugs before a second Recipe existed.
- **Disambiguating `/pick` when several of an Idea's Assets are gated at once.** `/pick` requires an
  explicit `<recipe>` argument (never guesses), and `/pick-cast`'s existing MULTIPLE-Assets-gated
  refusal (issue #56) is unchanged. A conversational disambiguation UX is future work.
- **Re-pointing the Recipe's Space-input node name (`specInput`) generically.** `driveToNextGate`'s
  FIRST leg still injects via `injectSpec`'s existing, unparameterized `JSON Master` target — every
  Recipe's Spec-input node target genericity is not exercised by this slice (only the PIN target is
  parameterized, since that is what the multi-gate proof needs). Noted as a known limit.
- **Live-Magnific testing.** Deferred per CLAUDE.md; this slice is proven entirely against the Magnific
  fake (`FakeSpace`) plus a new test-only configurable fake and the pre-existing hermetic
  `LiveSpaceAdapter`/`ReplayMcpTransport` replay harness (issue #40) — no live `spaces_*`/`creations_*`
  call, no credits, no board mutation.

## Capabilities

### New Capabilities

- `generic-gate-driver`: the `driveToNextGate` run-until-gate engine (first/resumed legs, pause/finish,
  first-leg-only Fallback-Protocol recovery, zero-gate and multi-gate walks) and the generic `/pick`
  command's own requirements.

### Modified Capabilities

- `execution-protocol`: the parser accepts arbitrary Recipe-declared gate names (new requirement; no
  existing requirement's text was gate-name-specific, so nothing is renamed).
- `cast-render`: the wired Recipe's Cast-gate pin/recovery requirements are reworded to describe the
  now-generalized `pinPick`/`driveToNextGate` primitives (same observable behavior, same headers); the
  `/pick-cast` requirement's forward-reference to "issue #57" is resolved to name `/pick`/`resumeGate`
  now that they exist.

## Impact

- **New code:** `src/commands/pick.ts` (+ `pick.test.ts`), `.claude/commands/pick.md`.
- **Rewritten (same behavior, generalized API):** `src/space-driver/driver.ts` (+ `driver.test.ts`) —
  `composeAndCast`/`pickAndRender`/`pinCharacter`/`castFallbackGoal` are replaced by
  `driveToNextGate`/`pinPick`/`fallbackGoal`; `injectSpec`/`runRunPoint`/`fetchCast`/`fetchAsset`
  (already gate-agnostic) are untouched.
- **Modified:** `src/execution-protocol/protocol.ts` (`RunPointGate` widened), `parse.ts` (+
  `parse.test.ts`) (gate validation generalized); `src/commands/pick-cast.ts` (+ `pick-cast.test.ts`
  unchanged in behavior — delegates its tail to `resumeGate`); `src/space-driver/live/contract.test.ts`,
  `driver-over-live.test.ts` (call-site updates to the renamed/generalized driver API, still hermetic
  replay — issue #40's fixtures, no live calls); `package.json` (`pick` npm script);
  `.claude/commands/pick-cast.md` (Target note resolved to present tense).
- **Hermetic:** every test this slice adds or changes drives the Magnific fake (`FakeSpace`, a new
  test-only `ConfigurableFakeSpace`) or the pre-existing hermetic live-replay harness
  (`LiveSpaceAdapter`/`ReplayMcpTransport`) — no live `spaces_*`/`creations_*` call, no credits, no board
  mutation, confirmed by grep across the full diff.
- **Always-rules upheld:** generate-never-publish holds (a paused leg surfaces candidates and stops; a
  finished leg surfaces the Asset and stops — no publish path exists in the driver or either pick
  command); explicit-attribution holds (`/pick` requires an explicit `<recipe>`+`<gate>`, never guesses;
  `/pick-cast`'s existing ambiguity refusal is unchanged); ledger-as-source-of-truth is unaffected (this
  slice touches the Production Queue and the Space driver, never the ledger, directly); relative-not-
  absolute and public-metrics-only are unaffected (no baseline/metrics code touched).
