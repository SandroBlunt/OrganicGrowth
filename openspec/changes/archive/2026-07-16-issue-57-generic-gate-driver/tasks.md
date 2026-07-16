## 1. Open the protocol parser's valid-gate set (test-first)

- [x] 1.1 Write failing tests (`execution-protocol/parse.test.ts`): a gate name other than `"cast"`
  parses successfully; several distinct gate names on one protocol all parse; a non-string gate (e.g. a
  number) and an empty-string gate are still rejected as `run_point_gate_invalid`. Replace the old
  `gate: "review"` rejection test (now a VALID gate) with a genuinely-invalid-shape test.
- [x] 1.2 Implement: `execution-protocol/protocol.ts`'s `RunPointGate` widens to `string | null`;
  `parse.ts` drops the hard-coded `VALID_GATES` set and instead accepts `null` or any non-empty string.

## 2. Generalize the Space driver into `driveToNextGate` (test-first)

- [x] 2.1 Write failing tests (`space-driver/driver.test.ts`) proving the WIRED recipe behaves
  identically through the new API: a first leg (`targetGate: "cast"`) injects the Spec, runs the cast
  run-point, and PAUSES with the Cast candidates (matching the old `composeAndCast`'s cast-empty,
  stale-run-point-recovery, and unresolved-run-point-recovery cases); a resumed leg
  (`targetGate: null`) pins the resolved pick and FINISHES with the rendered Asset (matching the old
  `pickAndRender`'s pin-unconfirmed and clip-run cases); a resumed leg's unresolved run-point fails
  `run_point_unresolved` with NO recovery attempt (mirrors old Phase-B's no-fallback behavior).
- [x] 2.2 Write failing tests proving `pinPick`/`pinGoal` generalize over an explicit target node name
  (not the hard-coded `CHARACTER_NODE_NAME`), and that `C9`/`C10`/`C36`(now `candidates_empty`) hold
  against the new API exactly as they held against the old one.
- [x] 2.3 Write failing tests (a new, test-only `ConfigurableFakeSpace` — never reusing `FakeSpace`'s
  hard-coded Cast/Character node names) proving: (a) a single gateless run-point (`targetGate: null`,
  first leg) runs straight through with NO pause; (b) a 2-gate + final-render sequence PAUSES and
  RESUMES at each declared gate in order, pinning a DIFFERENT Recipe-declared node name per gate.
- [x] 2.4 Implement `space-driver/driver.ts`: replace `composeAndCast`/`pickAndRender`/
  `pinCharacter`/`castFallbackGoal` with `driveToNextGate`/`pinPick`/`fallbackGoal`; keep
  `injectSpec`/`runRunPoint`/`fetchCast`/`fetchAsset` (already gate-agnostic) untouched.
- [x] 2.5 Update call sites in the hermetic live-replay tests (`space-driver/live/contract.test.ts`,
  `driver-over-live.test.ts`, issue #40) to the new API — still 100% hermetic replay, no live calls.

## 3. The generic pick/resume command (test-first)

- [x] 3.1 Write failing tests (`commands/pick.test.ts`): `nextGateAfter` resolves a Recipe's own gate
  list defensively (null for the last/only gate, an unwired Recipe, or a gate absent from the Recipe's
  list); `resumeGate` enqueues the generic next leg carrying the resolved pick, is idempotent per
  `(brand, idea, recipe, nextGate)`, and clears an `awaiting_pick` job at the resolved gate; `pickCommand`
  works for a Recipe/gate pair with NO tie to the wired Cast Recipe (proving genericity), is idempotent,
  and refuses an empty pick value without touching the queue; CLI usage-error path.
- [x] 3.2 Implement `commands/pick.ts`: `nextGateAfter`, `resumeGate`, `pickCommand`, `main()`. Add the
  `pick` npm script.

## 4. `/pick-cast` becomes a thin alias (test-first — prove NO behavior change)

- [x] 4.1 Confirm every pre-existing `commands/pick-cast.test.ts` scenario still passes UNCHANGED
  (ledger-reading, refusal messages, next-leg enqueue, gate-clear, brand-routing, legacy-ledger
  normalization) once the tail is refactored.
- [x] 4.2 Implement: `commands/pick-cast.ts` deletes its own private `nextGateAfter` and replaces its
  direct `enqueueNextLeg`/`markPickConsumed`/`saveQueue` calls with one call to `resumeGate`
  (`commands/pick.ts`) — the CAST_GATE-scoped ledger-reading half (`assetsAtCastGate`,
  `findGateCandidateAsset`, `selectCharacter`, the refusal messages) is untouched.

## 5. Docs

- [x] 5.1 Add `.claude/commands/pick.md` (usage, relationship to `/pick-cast`, guardrails).
- [x] 5.2 Update `.claude/commands/pick-cast.md`'s "Target" note to present tense, naming the thin-alias
  relationship to `/pick`/`resumeGate`.

## 6. OpenSpec

- [x] 6.1 Author `proposal.md`, this `tasks.md`, and spec deltas: ADDED `generic-gate-driver`; MODIFIED
  `execution-protocol` (arbitrary gate names — a new requirement; no header rename needed);
  MODIFIED `cast-render` (pin/recovery requirements reworded for the generalized primitives; the
  `/pick-cast` requirement's forward reference resolved — same headers throughout, no RENAMED needed).
- [x] 6.2 `npx openspec validate issue-57-generic-gate-driver --strict` green.
- [x] 6.3 A read-only "dry fold" check (OpenSpec's own `findSpecUpdates`/`buildUpdatedSpec` +
  `Validator.validateSpecContent`, run in-memory, no file writes, `archive` itself never invoked) to
  confirm every MODIFIED header in this change's deltas resolves cleanly against the CURRENT base specs
  — `validate --strict` does not check this, and a prior slice (issue #56) tripped on exactly this gap.

## 7. Self-review

- [x] 7.1 `npm test` green (type-check + full suite); confirm every pre-slice test is either passing
  unchanged (`pick-cast.test.ts`, byte-identical assertions) or deliberately, faithfully updated for the
  genericity change (`parse.test.ts`, `driver.test.ts`, `live/contract.test.ts`,
  `live/driver-over-live.test.ts` — never silently weakened).
- [x] 7.2 Simplify / dead-code pass; confirm every issue #57 acceptance criterion maps to a named test;
  confirm no live-Space (`spaces_*`/`creations_*`) call was added (grep across the full diff).
- [x] 7.3 Write the Build Report into `handoff.md`, explicitly flagging the Magnific fake(s) used, and
  listing known limits (single-wired-Recipe scope for a true end-to-end multi-gate render; the
  `specInput` node genericity deferral; the pre-existing, NOT-introduced-by-this-slice
  `producer-agent.docs-test.ts`/`report.docs-test.ts` staleness owned by issue #59).
