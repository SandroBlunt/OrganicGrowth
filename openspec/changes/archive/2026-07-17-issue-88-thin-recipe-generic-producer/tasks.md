## 1. Ledger — resolve the Idea's Format (test-first)

- [x] 1.1 Write failing tests (`ledger.test.ts`): a recorded `format` carries through; an old
  (pre-multi-format) record with no `format` field omits it entirely (never fabricated, never
  crashes); a garbled (non-string / blank) `format` degrades to omitted.
- [x] 1.2 Add `format?: string` to `LedgerIdea` and defensive `parseFormat` parsing in `loadIdeas`
  (`src/ledger/ledger.ts`).
- [x] 1.3 Write failing tests (`src/producer/resolve-format.test.ts`): resolves `ok:true` when
  present; STOPs with a clear message (never guessing) when absent/blank; never throws.
- [x] 1.4 Implement `resolveIdeaFormat` (`src/producer/resolve-format.ts`).

## 2. Driver — the Recipe's OWN prompt node; bind a Brand Asset into a named node (test-first)

- [x] 2.1 Update `driver.test.ts`'s existing `injectSpec`/`injectGoal`/`driveToNextGate` call sites to
  pass `promptNode: JSON_MASTER_NODE_NAME` explicitly (same value — zero behaviour change) —
  confirms these fail to compile/pass against the OLD hard-coded signature first.
- [x] 2.2 Implement: `injectGoal(spec, promptNode)`, `injectSpec(port, spec, promptNode, poll)`,
  `DriveLegInput.first.promptNode: string`, `driveToNextGate` passes `input.promptNode` through;
  rename `json_master_missing` -> `prompt_node_missing` (never asserted by name in any test).
- [x] 2.3 Update `space-driver/live/driver-over-live.test.ts`'s 3 call sites the same way (byte-value
  identical, `JSON_MASTER_NODE_NAME`) — the live adapter itself needs no change.
- [x] 2.4 Write failing tests (`driver.test.ts`): `bindMediaGoal` embeds path/media/node;
  `bindMediaAsset` succeeds via `edit`+`verifyPinned` (a small local stub port, mirroring
  `PinConfirmingSpace`), fails `media_bind_edit_failed` when the edit fails, fails
  `media_bind_unconfirmed` when the port can't confirm.
- [x] 2.5 Implement `bindMediaGoal`/`bindMediaAsset` in `driver.ts` — reuses `port.edit`/
  `pollEdit`/`port.verifyPinned`; no new `SpaceMcpPort` method. Update `port.ts`'s `verifyPinned` doc
  comment to reflect the generalized reuse (doc-only).
- [x] 2.6 Run the FULL existing `driver.test.ts`/`driver-over-live.test.ts` suites; confirm 100% green
  with zero assertion changes beyond the mechanical `promptNode` threading (proves the character
  Recipe's behaviour is unchanged).

## 3. Bind-media resolution — STOP on a missing required slot (test-first)

- [x] 3.1 Write failing tests (`src/producer/bind-media.test.ts`): binds a found brand-asset slot;
  binds a found idea-pick slot; STOPs with a clear message (naming the slot, ADR-0016 wording) when a
  REQUIRED slot has no resolution or a `found:false` one; an OPTIONAL slot's missing resolution is
  skipped, never blocking.
- [x] 3.2 Implement `bindMediaSlots` + its types (`src/producer/bind-media.ts`).

## 4. The News Carousel Recipe end-to-end against a NEW, purpose-built Magnific fake (test-first)

- [x] 4.1 Write `src/producer/fixtures/fake-carousel-space.ts` — a SECOND, independent
  `SpaceMcpPort` fake for the News Carousel Recipe's shape (a "Slides Prompts" prompt/run-point node +
  a logo-reference node + the carousel's own Execution Protocol) — never reusing the character-Recipe
  `FakeSpace`'s hard-coded node names.
- [x] 4.2 Write failing tests (`src/producer/carousel-end-to-end.test.ts`): the wired
  `news-carousel` Recipe declares zero gates; the real, committed Straw Motion Spec fixture (#87)
  self-audits `ok` against both the generic `auditAuthorPhase` and the graduated
  `auditNewsCarouselAuthorPhase`; binding the found Brand Logo + auditing bind-media both pass, then
  `driveToNextGate` (gate-free) FINISHES with the Asset through the SAME generic driver, with the
  exact edit/run call counts asserted (1 bind + 1 inject edit, 1 run); a valid Copy self-audits ok via
  `auditCopyPhase`; a MISSING required Brand Asset STOPs `bindMediaSlots` with a clear message and the
  fake's `edit`/`run` call counts stay at zero (never touched).
- [x] 4.3 Confirm all pass (this is the AC3 proof: "a carousel job runs gate-free end-to-end against
  the fake; a missing required Brand Asset STOPs with a clear message").

## 5. Extract `produce-character-explainer` — behaviour-identical (test-first)

- [x] 5.1 Write failing docs-test (`src/production-spec/produce-character-explainer-skill.docs-test.ts`,
  mirroring `produce-news-carousel-skill.docs-test.ts`'s shape): exists, slug, references the exact
  contract/validator/banned-word-scan/auditor/spec-store modules by name, STOP semantics, "does not
  run the Space / pin the Character / compose Copy", never publishes.
- [x] 5.2 Write `.claude/skills/produce-character-explainer/SKILL.md`: the SAME authoring craft
  `producer.md` described inline today (3 character concepts, 3 Pixar-3D clips ending in the exact
  `ASPECT_RATIO_LINE`, 3 top-level thumbnails, `REQUIRED_*` counts from `contract.ts`), self-audited via
  `auditAuthorPhase`, saved via `saveSpec`/`specPathFor` — zero behaviour change from today's real
  output shape.

## 6. Rewrite `.claude/agents/producer.md` as a thin, recipe-generic conductor (test-first)

- [x] 6.1 Update `producer-agent.docs-test.ts`: keep the pre-existing assertions (opus model,
  generate-never-publish, Magnific, Cast mentioned, ADR-0008, attended, `recipe`/`awaiting_pick`
  fields, no `awaiting_cast`); ADD assertions proving genericity — resolves via `getRecipe(job.recipe)`,
  never reads `production.space_id`, runs the Recipe's Skill BY SLUG (`produce-character-explainer` /
  `produce-news-carousel`), resolves the Idea's Format via `resolveIdeaFormat`, binds media via
  `bindMediaSlots`, self-audits via `auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase`, drives
  via `driveToNextGate` pausing only at `Recipe.gates`, and never hard-codes the wired Recipe's OWN
  canvas node names (`Character Variants Generator`, `Selected Character`).
- [x] 6.2 Rewrite `.claude/agents/producer.md` to satisfy every assertion above — no recipe-specific
  procedure anywhere in the doc.

## 7. Retire `production.space_id` (migration note) + full self-review

- [x] 7.1 Remove `production.space_id`/`production.space_url` from
  `data/brands/mundotip/brand-profile.yaml`; add a migration-note comment pointing at
  `Recipe.space.id`. Update `src/recipe/registry.ts`'s doc comments (historical, not-still-read).
- [x] 7.2 Grep the whole repo for `production.space_id`/`space_id`: confirm every remaining hit is
  either an ADR's historical decision prose, this change's own migration-note comment, or a test's own
  literal assertion string — never a live code path or an agent-doc instruction to read it.
- [x] 7.3 Re-read every new/changed module for dead code, unused exports, drifted docstrings; confirm
  the character Recipe's behaviour is provably unchanged (the untouched `driver.test.ts` wired-Recipe
  describe blocks all still pass, byte-identical assertions).
- [x] 7.4 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, `npm run build`,
  and `openspec validate --all --strict`; all green.
- [x] 7.5 Write the Build Report into `handoff.md`, mapping every issue #88 acceptance criterion to
  its proving test(s), flagging the Magnific fakes used (BOTH the existing character-Recipe `FakeSpace`
  and the new `FakeCarouselSpace`), the `production.space_id` retirement + migration note, self-review
  notes, and known limits.
