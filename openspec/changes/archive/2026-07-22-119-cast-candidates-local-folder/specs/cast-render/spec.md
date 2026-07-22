## ADDED Requirements

### Requirement: Producing a Recipe's gated leg downloads every candidate to a local folder before/at the same time the ledger records the gate pause

The producer SHALL download every one of a paused leg's rendered candidates to a local folder when a
Recipe's gated leg PAUSES (`DriveOutcome.kind === "paused"` — today: the wired *Character Explainer with
Cast* Recipe's Cast gate; this generalizes to ANY Recipe whose first leg is gated, never hard-coded to
the one wired Recipe) — via `src/asset/cast-candidates.ts`'s `downloadCastCandidates`, into
`castCandidatesDirFor(ideaId, run, ideasRoot, recipe)`'s directory — and SHALL write the Idea's Asset to
the Brand's ledger with the DOWNLOADED candidates (each carrying `path` alongside its existing
`identifier`/`url`) in the SAME write that records `status: "in_production"` /
`pending_gate: "<gate>"`. A paused Asset SHALL NEVER be left on the ledger with remote-only candidates
once this step exists in the production path.

A worked composition (end-to-end against the fake, never the live Space): drive the Recipe's first leg
to its gate via `driveToNextGate` against a fake implementing `SpaceMcpPort`, download every one of
`outcome.candidates` via `downloadCastCandidates`, then write the Asset via `AssetStore.writeAsset` with
the downloaded `cast` — proven fully hermetic, no live `spaces_*`/`creations_*` call.

#### Scenario: A paused Cast gate's candidates are downloaded and recorded with local paths

- **GIVEN** a fake Space and a Production Spec, driven to the wired Recipe's Cast gate
  (`driveToNextGate` with `targetGate: "cast"`), yielding 6 paused candidates
- **WHEN** the producer downloads them (`downloadCastCandidates` into `castCandidatesDirFor`'s folder)
  and writes the Idea's Asset to the ledger
- **THEN** the gate-candidate folder holds all 6 downloaded images
- **AND** the ledger's Asset is `in_production`/`pending_gate: "cast"` with `cast` holding 6 candidates,
  each carrying `identifier`, `url`, AND its own downloaded `path`

#### Scenario: The gate-candidate folder is distinct from the eventual produced-Asset bundle

- **GIVEN** the same Idea/run/Recipe
- **WHEN** `castCandidatesDirFor(...)` and `outputDirFor(...)` (`src/asset/output-bundle.ts`) are both
  computed
- **THEN** they return two DIFFERENT directories — `.cast` vs `.output` — never the same path

### Requirement: /pick-cast surfaces the picked candidate's local file when present, falling back to its remote URL

`/pick-cast <brand> <idea-id> <n>`'s successful-pick output SHALL name the picked candidate's own media
reference: its downloaded LOCAL `path` when one is recorded on the ledger (issue #119), or its remote
`url` when `path` is absent (a candidate recorded before this field existed, or whose download genuinely
could not complete) — the command SHALL NEVER fail or crash over a missing `path`; the selection and
queue-resume behavior SHALL be unchanged from before this Requirement (AC5: the pick still works exactly
as it did against a legacy candidate).

#### Scenario: A picked candidate with a local path surfaces that file

- **GIVEN** an Idea at the Cast gate whose candidates each carry a downloaded `path`
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>` for a valid `<n>`
- **THEN** the output names that candidate's own local `path` — not only its remote `url`

#### Scenario: A picked LEGACY candidate with no local path falls back to its remote URL

- **GIVEN** an Idea at the Cast gate whose candidates carry NO `path` (recorded before issue #119, or a
  download that could not complete)
- **WHEN** the Operator runs `/pick-cast <brand> <idea-id> <n>` for a valid `<n>`
- **THEN** the pick still succeeds exactly as before, and the output names that candidate's remote `url`

#### Scenario: A mixed Cast resolves each pick's own correct media reference

- **GIVEN** a Cast where some candidates carry `path` and others do not
- **WHEN** the Operator picks a candidate WITH a `path`, and separately a candidate WITHOUT one
- **THEN** each pick's output names exactly that candidate's own media — its `path` when present, its
  `url` when not — never the other candidate's or a stale reference
