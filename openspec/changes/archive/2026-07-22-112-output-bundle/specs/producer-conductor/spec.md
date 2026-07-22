## ADDED Requirements

### Requirement: The Save phase writes the Asset's self-contained .output/ bundle, never the retired .assets/ name

`.claude/agents/producer.md`'s Save phase SHALL compute the downloaded-media destination directory via
`src/asset/output-bundle.ts`'s `outputDirFor(ideaId, run, ideasRoot, recipe)` — `idea-NN.<recipe>
.output/`, replacing the retired `idea-NN.<recipe>.assets/` name — download every finished creation's
bytes there (`downloadAssetFiles`, unchanged mechanism), write `caption.txt` from the composed Copy
(`writeCaptionText`), write the Asset to the Brand's ledger exactly as ADR-0011 already shapes it
(`asset_paths` pointing into that SAME `.output/` directory, in slide order), and — AFTER that ledger
write — call `refreshOutputBundle(brand, ideaId, recipe, { ledgerPath })` to write the initial
`post.json`. It SHALL also state, in plain terms, that an Asset produced BEFORE this slice keeps
whatever `.assets/`-named directory its `asset_paths` already point into — the Save phase never renames
an existing directory, and `refreshOutputBundle` keeps refreshing `post.json` there in place.

#### Scenario: producer.md documents the .output/ destination, caption.txt, and the post-write refresh

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Save phase section is read
- **THEN** it names `outputDirFor` and the `.output/` directory (not `.assets/`) as the download
  destination for a NEW Asset, names `writeCaptionText`/`caption.txt`, and states that
  `refreshOutputBundle` is called AFTER the ledger write to produce the initial `post.json`

#### Scenario: producer.md states the backward-compat rule for an already-produced Asset

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** its Save phase section is read
- **THEN** it states that an Asset produced before this slice keeps its existing `.assets/`-named
  directory (never renamed), and that `post.json` still refreshes there

#### Scenario: Every pre-existing pinned fact in producer.md survives this rewrite

- **GIVEN** the current `.claude/agents/producer.md`
- **WHEN** it is checked against every substring `src/production-spec/producer-agent.docs-test.ts`
  already pinned before this slice (Production Spec, never publish, ADR-0008, `awaiting_pick`, no
  `awaiting_cast`, the thin/recipe-generic-conductor phrase, `bindMediaSlots`/ADR-0016,
  `auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase`/ADR-0017, `driveToNextGate`/`Recipe.gates`,
  the watermark-step block, and the absence of "Selected Character"/"Character Variants
  Generator"/"Slides Prompts"/quoted "Brand Logo")
- **THEN** every one of those pins still holds
