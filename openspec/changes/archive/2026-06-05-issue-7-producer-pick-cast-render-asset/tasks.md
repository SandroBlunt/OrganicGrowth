## 1. Magnific fake — Phase-B render mode (test-first scaffolding)

- [x] 1.1 Extend `src/space-driver/fixtures/fake-space.ts` (composing the existing `fakeSpaceState()`,
  which already has `Clip extractor`, `Video Combiner`, `Final Output`, and the duplicate `Character #2`
  nodes) with a Phase-B mode that models: a Character-pin `edit` whose readback confirms the chosen
  `Character` creation node is pinned (record the pin goal so a test can assert the Fallback Protocol);
  a `downstream` clip run started at `Clip extractor` that fires the clip → Video Combiner → Final
  Output chain and yields exactly ONE final Asset creation; and the fetch of that Asset's URL. NO
  network, NO live Space, NO credits.

## 2. pinCharacter — Fallback Protocol pin + readback (test-first)

- [x] 2.1 Write failing tests (`driver.test.ts`): `pinCharacter` issues a natural-language `edit` naming
  the chosen Character (the Fallback Protocol), polls the edit to terminal, reads back the Space, and
  confirms the chosen `Character` creation node is pinned. A readback that does not show the pin is
  reported as an identifiable failure.
- [x] 2.2 Implement `pinCharacter(port, character)` in `src/space-driver/driver.ts`: edit → poll
  editStatus to terminal → read back → confirm the pin. Returns confirmation on success, an identifiable
  failure (`pin_edit_failed` / `pin_unconfirmed`) otherwise. Mirrors `injectSpec`'s shape.

## 3. clip runRunPoint — render the clip chain (test-first)

- [x] 3.1 Write failing tests: running the clip run-point (`Clip extractor`, `downstream`) via the
  reused `runRunPoint` primitive fires the clip → Video Combiner → Final Output chain and yields exactly
  one final Asset creation. The clip run-point is resolved by NAME from the parsed Execution Protocol
  (the run-point that is NOT the Cast gate — `gate: null`), never hard-coded.
- [x] 3.2 No new driver primitive is needed for the run itself — assert the reused `runRunPoint` drives
  the resolved clip node. (The orchestration is `pickAndRender`, task 5.)

## 4. fetchAsset — Asset creation → media URL (test-first)

- [x] 4.1 Write failing tests: `fetchAsset` resolves the finished Asset's creation identifier to its
  media URL through the port (the single Asset creation the clip run produced).
- [x] 4.2 Implement `fetchAsset(port, creationId)`: fetch the creation and return its URL (reuses
  `fetchCreations`).

## 5. pickAndRender — Phase-B orchestration (test-first)

- [x] 5.1 Write failing tests: `pickAndRender(port, spaceState, character)` pins the chosen Character,
  resolves the clip run-point (gate === null) from the parsed Execution Protocol, runs it `downstream`,
  fetches the Asset URL, and returns the Asset — asserting the Video Combiner / Final Output fired and
  one Asset surfaced. A test asserts NO publish action is taken (the orchestrator returns the Asset and
  stops). A pin that cannot be confirmed returns the identifiable pin failure.
- [x] 5.2 Implement `pickAndRender(port, spaceState, character)`: pin → resolve clip run-point via
  `parse()` → run → fetch. Returns `{ ok:true, asset }` or `{ ok:false, error }`. Renders and stops; it
  never publishes.

## 6. Ledger — record character / asset_url / produced_at with the produced transition (test-first)

- [x] 6.1 Write failing tests (`ledger.test.ts`): `applyIdeaAsset` purely sets one Idea's `character` /
  `asset_url` / `produced_at` and changes no other Idea; the `writeIdeaAsset` shell records those fields,
  preserving unrelated fields; an unknown ideaId leaves the file untouched; a round-trip writes BOTH
  `status: produced` (via the existing `writeIdeaStatus`, status derived from `ledgerStatusForTransition`
  for a `render → done` transition) AND the Asset fields for an Idea moving `casting → produced`. The
  `produced_at` value is INJECTED (passed in), never read from the clock.
- [x] 6.2 Implement `applyIdeaAsset` (pure, new array) and `writeIdeaAsset` (thin shell: load → set the
  three fields → save) in `src/ledger/ledger.ts`, mirroring `applyIdeaCast`/`writeIdeaCast`. Reuse the
  existing `ledgerStatusForTransition` (`render → done ⇒ produced`); do not duplicate it. The ledger
  stays canonical; an unknown ideaId leaves the file untouched.

## 7. /pick-cast command shell (test-first)

- [x] 7.1 Write failing tests (`pick-cast.test.ts`): `pickCastCommand(ideaId, n, ...)` selects the nth
  (1-based) Cast member from the Idea's `ledger.cast` as the Character; out-of-range `n` and an unknown
  Idea return identifiable, non-crashing messages. The returned string names the chosen Character.
- [x] 7.2 Implement `src/commands/pick-cast.ts` mirroring `src/commands/queue.ts`: a testable
  `pickCastCommand(...)` returning a string + an `import.meta.url`-guarded `main()`. Add a `"pick-cast"`
  script to `package.json` mirroring `"queue"`.

## 8. Self-review

- [x] 8.1 `npx openspec validate issue-7-producer-pick-cast-render-asset --strict` green.
- [x] 8.2 `npm test` green; `npm run build` exit 0.
- [x] 8.3 Simplify / dead-code pass; confirm each of the 5 acceptance criteria maps to a specific named
  test.
- [x] 8.4 Write the Build Report into `handoff.md`.
