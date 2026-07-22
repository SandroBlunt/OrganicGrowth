## ADDED Requirements

### Requirement: producer.md documents downloading a paused leg's candidates to a local .cast/ folder before recording the pause

`.claude/agents/producer.md`'s "Drive the canvas" section SHALL document that, for ANY leg that PAUSES
(`DriveOutcome.kind === "paused"`), the Producer downloads every one of that leg's rendered candidates
via `src/asset/cast-candidates.ts`'s `downloadCastCandidates(destDir, candidates)` into
`castCandidatesDirFor(ideaId, run, ideasRoot, recipe)`'s folder — `idea-NN.<recipe>.cast/`, distinct from
`.output/` and `.spec.json` — and writes the Idea's Asset to the ledger with the downloaded `cast`
(each candidate carrying `path` alongside its existing `identifier`/`url`) in the SAME write that records
`pending_gate`. This SHALL be documented as GENERIC to any Recipe with a gated first leg, never hard-coded
to the one wired *Character Explainer with Cast* Recipe. It SHALL also document that `/pick-cast`'s own
output then names the picked candidate's local `path` when present, falling back to its `url` otherwise.

#### Scenario: producer.md names the download primitives and the .cast/ destination

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it names `castCandidatesDirFor`, `downloadCastCandidates`, and the `.cast/` folder as the
  download destination for a paused leg's candidates

#### Scenario: producer.md states the step generalizes to any gated Recipe, never hard-coded

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it names `DriveOutcome.kind === "paused"` as the trigger and states the step is never
  hard-coded to one Recipe

#### Scenario: producer.md states the download happens in the SAME ledger write that records the pause

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it states the downloaded `cast` (carrying `LedgerCastCandidate.path`) is written in the SAME
  ledger write that records the gate pause

#### Scenario: producer.md states /pick-cast surfaces the local path, falling back to the remote url

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Cast-gate download paragraph is read
- **THEN** it states `/pick-cast`'s output names the picked candidate's local `path` when present,
  falling back to its `url` for a legacy/un-downloaded candidate

#### Scenario: Every pre-existing pinned fact in producer.md survives this addition

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** it is checked against every substring `src/production-spec/producer-agent.docs-test.ts`
  already pinned before this slice (Production Spec, never publish, ADR-0008, `awaiting_pick`, the
  thin/recipe-generic-conductor phrase, `driveToNextGate`/`Recipe.gates`, the watermark-step block, and
  the Save-phase `.output/`/`outputDirFor`/`refreshPostJson` block)
- **THEN** every one of those pins still holds
