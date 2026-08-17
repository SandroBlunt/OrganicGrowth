## ADDED Requirements

### Requirement: A catalogue entry's manifest is documented as the union of its `SKILL.md` frontmatter and its `metadata.yaml`, naming every required field and where each one lives

`docs/catalogue-manifest-format.md` SHALL document, for a `.claude/skills/` catalogue entry, that its manifest is the union of its `SKILL.md` YAML frontmatter (`name`, `description` — the entry's purpose) and its `metadata.yaml` (`name`, `version`, `licence`, `owner`, `target_model` with `fallbacks`, `entities` with `reads`/`writes`, `tools`, `inputs`/`outputs` as its config, `scripts`, `references`, `evals`, `source_tracking`, and `shared_references` with `required`/`install`), SHALL state which file each field lives in, and SHALL record the shared-reference-dependency install decision (installer-side copy-alongside) and the two rejected alternatives (per-entry vendoring, declare-and-refuse-without) with the reasoning against each.

#### Scenario: the manifest-format document names every field the issue's own acceptance criterion lists

- **GIVEN** `docs/catalogue-manifest-format.md` as shipped
- **WHEN** it is read
- **THEN** it names, for a catalogue entry's manifest: name, version, licence, owner, purpose, the
  entities it reads and writes, its tools, its model and fallbacks, its config, and its evals
- **AND** it states `purpose` is satisfied by `SKILL.md`'s own frontmatter `description` field, not a
  second, duplicated field in `metadata.yaml`

#### Scenario: the document records the shared-reference install decision and argues the rejected alternatives

- **GIVEN** `docs/catalogue-manifest-format.md` as shipped
- **WHEN** its shared-reference-dependency section is read
- **THEN** it states the decision (installer-side copy-alongside) and names the two rejected
  alternatives (per-entry vendoring; declare-and-refuse-without-running), each with a stated reason

### Requirement: All 11 model-prompting Skills carry a complete manifest, formalizing what already existed and adding what was genuinely missing

Every `.claude/skills/<entry>/metadata.yaml` file that already exists for one of the 11 model-prompting Skills SHALL carry `licence` and `owner` matching the repository's own `LICENSE` file's licence type and copyright holder, `target_model.fallbacks` as an explicit array, `entities.reads` (non-empty) and `entities.writes` (present, may be empty), `tools` (present), `evals` (non-empty, naming at least one existing test script already declared under `scripts:`), and `shared_references.required` (`true`) plus `shared_references.install` (one of `copy-alongside`, `vendored`, `refuse-without`) — and every corresponding `SKILL.md`'s frontmatter `name` SHALL equal its `metadata.yaml`'s own `name`.

#### Scenario: every one of the 11 model-prompting Skills' metadata.yaml carries every new field

- **GIVEN** all 11 `.claude/skills/{chatgpt-image-2,grok-imagine,grok-imagine-1-5,happy-horse,kling-3-0,kling-3-0-omni,nano-banana-2,seedance-2-0,seedream-4-5,seedream-5-0-pro,veo-3-1}/metadata.yaml` files as shipped
- **WHEN** each is parsed
- **THEN** each carries `licence: MIT`, `owner: Sandro Franco`, a `target_model.fallbacks` array, an
  `entities` block with `reads` and `writes`, a `tools` array, an `evals` array naming an existing
  `scripts:` entry, and a `shared_references` block with `required: true` and `install: copy-alongside`

#### Scenario: no .py file or Python-invoking SKILL.md prose is touched by this change

- **GIVEN** this change's full diff
- **WHEN** it is inspected
- **THEN** no `.py` file appears in it, and no `SKILL.md` section that invokes `python3` is modified —
  the new `tools` field is declarative metadata only, added to `metadata.yaml`

### Requirement: An automated check fails when a catalogue entry has an incomplete manifest, extending the existing dangling-reference-citation guard rather than duplicating it

`src/claude-skills/reference-citation-guard.docs-test.ts` (the same file #252 landed) SHALL contain a check that walks every `.claude/skills/<entry>/` directory that has a `metadata.yaml`, parses its `SKILL.md` frontmatter and `metadata.yaml` via the pure `src/claude-skills/manifest-completeness-scan.ts`, and fails when any required manifest field (per the Requirement above) is missing, empty, or does not match its cross-checked source (the `LICENSE` file's licence/owner; the `SKILL.md`/`metadata.yaml` name pair) — no second, separate guard file SHALL be added for this purpose. The check SHALL assert a non-trivial corpus floor (at least 11 catalogue entries found) so a silently-empty walk cannot pass vacuously, and its `purpose`-length threshold SHALL be justified against the real corpus's shortest description at authoring time rather than picked arbitrarily.

#### Scenario: the guard passes against the real, complete tree

- **GIVEN** all 11 `.claude/skills/<entry>/{SKILL.md,metadata.yaml}` pairs and the root `LICENSE` file as
  shipped by this change
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run
- **THEN** it reports zero incomplete-manifest defects, and asserts at least 11 catalogue entries were
  actually walked (never a silently-vacuous zero-entries pass)

#### Scenario: the guard is proven non-vacuous — a hand-mutated missing field is caught, one field at a time, across several different fields

- **GIVEN**, in turn, a real `metadata.yaml`'s `licence` field removed, then restored and its `owner`
  field removed, then restored and its `target_model.fallbacks` field removed, then restored and its
  `entities.reads` emptied, then restored and its `shared_references.install` field blanked
- **WHEN** the guard is run after each individual mutation
- **THEN** it fails each time, naming exactly the one field mutated
- **AND** after each restore, re-running the guard passes, and `git status` on the mutated file is clean

#### Scenario: the guard's pure scanner is unit-tested with zero disk access

- **GIVEN** `src/claude-skills/manifest-completeness-scan.ts`'s exported functions
- **WHEN** `src/claude-skills/manifest-completeness-scan.test.ts` is run
- **THEN** every test passes using only in-memory string fixtures — no `node:fs` import in that file —
  covering a missing/invalid case for every required field individually, plus a complete-manifest fixture
  that passes

### Requirement: Installing one catalogue entry into a genuinely clean checkout is verified end to end, automated and reproducible

`src/claude-skills/install-catalogue-entry.ts` SHALL provide a pure `planInstall` function that, given an already-parsed `metadata.yaml` object, decides which directories an install must copy for that entry's declared `shared_references.install` strategy, and a thin `installCatalogueEntry` shell that performs the copy into a destination directory. `src/claude-skills/install-catalogue-entry.docs-test.ts` SHALL install one real catalogue entry into a freshly created, genuinely empty temporary directory — never a subfolder of this repository — and SHALL then re-run the #252 pure citation scanner against the installed copy's own files, asserting zero dangling citations there.

#### Scenario: installing veo-3-1 into a fresh temp directory reproduces a citation-clean tree

- **GIVEN** a freshly created `mkdtemp` directory containing nothing else
- **WHEN** `installCatalogueEntry` installs the `veo-3-1` entry into it
- **THEN** the destination contains `.claude/skills/veo-3-1/` (the whole entry) and `.claude/references/`
  (the shared dependency, per its `copy-alongside` install strategy)
- **AND** re-running the pure citation scanner against the installed copy's own files finds zero dangling
  citations

#### Scenario: planInstall is pure and covers all three declared install strategies

- **GIVEN** three fixture `metadata.yaml` objects, one per `shared_references.install` value
  (`copy-alongside`, `vendored`, `refuse-without`)
- **WHEN** `planInstall` is called on each, with no disk access
- **THEN** `copy-alongside` plans to copy both the entry and the shared references folder,
  `vendored` plans to copy only the entry (its own `references/` folder already carries what it needs),
  and `refuse-without` plans no copy and signals the entry cannot be installed without the shared
  dependency being separately supplied
