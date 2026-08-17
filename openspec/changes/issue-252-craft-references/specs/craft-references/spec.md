## ADDED Requirements

### Requirement: The five shared craft-reference documents exist at `.claude/references/`, grounded in what the model-prompting Skills assume, and carry no brand content

`.claude/references/prompt-discipline.md`, `.claude/references/cinematography.md`, `.claude/references/lighting.md`, `.claude/references/photography.md`, and `.claude/references/production-design.md` SHALL exist, and each SHALL be genuinely useful craft-reference prose — never a thin placeholder that merely restates its own filename — grounded in what the eleven model-prompting Skills under `.claude/skills/` already assume about it (the cross-model prompt skeletons, the camera/light/photographic/production-design vocabulary their own templates and worked examples already use), rather than an independently invented scheme. None of the five documents SHALL contain the Operator's Brand names (`OrganicGrowth`, `Straw Motion`, `MundoTip`) or Format-specific vocabulary — these are craft references, never Brand rules, per #212's own "installs and runs without the Operator's brand baked in" criterion.

#### Scenario: prompt-discipline.md states the cross-model five-clause and six-clause skeletons

- **GIVEN** `.claude/references/prompt-discipline.md` as shipped
- **WHEN** it is read
- **THEN** it states the five-clause still-image skeleton (Subject, Action/pose, Setting/context,
  Style/medium, Camera/framing/light) and the six-clause video skeleton that extends it with a
  Motion/beat clause
- **AND** it states a model's own translation notes may override this default clause order (naming the
  documented exception where a model leads with cinematography instead of subject) rather than silently
  presenting the default as universal

#### Scenario: cinematography.md, lighting.md, photography.md, and production-design.md each cover their named subject matter

- **GIVEN** the four sibling documents as shipped
- **WHEN** each is read
- **THEN** `cinematography.md` covers shot size, camera position, camera movement, and lens choice as a
  storytelling decision
- **AND** `lighting.md` covers lighting direction, quality, and motivation, plus named setups
- **AND** `photography.md` covers exposure, depth of field, and composition
- **AND** `production-design.md` covers sets, wardrobe, props, colour, period, and place, plus named-
  tradition style anchors

#### Scenario: no shared craft-reference document names the Operator's Brand or Format vocabulary

- **GIVEN** the five documents under `.claude/references/` as shipped
- **WHEN** they are searched (case-insensitive) for `organicgrowth`, `straw motion`, `mundotip`, and
  `unhypped`
- **THEN** no match is found in any of the five files

### Requirement: The shared craft-reference documents are consistent with, and never contradict, an existing Recipe-level Skill's own craft rule

Where a Recipe-level Skill under `.claude/skills/` (e.g. `produce-news-carousel`) already states a specific, existing craft rule — its reserved-frame/placeholder-frame phrasing for real-media slides, its real-source-imagery rule, its likeness/identity-drift handling — the shared craft-reference documents this change adds SHALL NOT restate that rule in different, potentially conflicting words, and SHALL NOT assert a general policy that would contradict it. `production-design.md`'s own grounding note SHALL state that this document sets no policy of its own on depicting real, identifiable people, deferring that question to each model's own usage policy as stated in its own Skill's `translation-notes.md`.

#### Scenario: production-design.md defers real-person depiction policy rather than asserting its own

- **GIVEN** `.claude/references/production-design.md` as shipped
- **WHEN** its grounding note is read
- **THEN** it states it sets no policy of its own on depicting real, identifiable people
- **AND** it states that question is governed by each model's own usage policy, stated in that model's
  own Skill's `translation-notes.md`

#### Scenario: no shared craft-reference document restates produce-news-carousel's reserved-frame or real-source-imagery rule

- **GIVEN** `.claude/skills/produce-news-carousel/SKILL.md`'s existing REAL MEDIA CLAUSE / reserved-frame
  phrasing and its "grounded, not invented" leading-idea rule, both untouched by this change
- **WHEN** the five documents under `.claude/references/` are read
- **THEN** none of them restates that Recipe-specific phrasing or rule in its own words — the shared
  documents stay at the general, cross-model craft layer, and the Recipe-specific rule stays exactly
  where it already lives

### Requirement: Every `(../)+references/<name>.md` citation across `.claude/skills/` resolves to a real file

Every citation of the shape `(../)+references/<name>.md` inside a `.claude/skills/**/*.md` or `.claude/skills/**/*.yaml` file SHALL resolve, when its relative path is joined against the citing file's own directory and normalized, to a file that exists on disk. A citation from a `SKILL.md` or `metadata.yaml` file (one directory shallower than a `references/` subfolder) and a citation from a `references/*.md` sibling file (one directory deeper) both cite the SAME shared folder (`.claude/references/`) despite using a shallower `../../references/` text in the shallower case and the identical-looking `../../../references/` text in the deeper case — the citation DEPTH, not just the target folder's existence, SHALL be correct for both.

#### Scenario: issue #252's own reproduction script finds zero broken citations

- **GIVEN** every `.claude/skills/**/*.md` and `.claude/skills/**/*.yaml` file as shipped
- **WHEN** the citation-existence check `pat = re.compile(r'((?:\.\./)+references/([a-z-]+\.md))')`
  is run, resolving each match against `os.path.normpath(os.path.join(os.path.dirname(f), match))`
- **THEN** it reports zero broken citations, across all 129 filename-bearing citations found before this
  change

#### Scenario: a SKILL.md-depth citation resolves one level shallower than a references/*.md-depth citation citing the same folder

- **GIVEN** `.claude/skills/veo-3-1/SKILL.md` (citing `../../references/photography.md`) and
  `.claude/skills/veo-3-1/references/README.md` (citing `../../../references/photography.md`)
- **WHEN** each citation is resolved against its own file's directory
- **THEN** both resolve to the SAME path, `.claude/references/photography.md`

#### Scenario: every references/*.md sibling file is left untouched, because its existing depth already resolved correctly

- **GIVEN** `.claude/skills/<skill>/references/{README,translation-notes,official-guidelines}.md` as
  shipped, for every skill that has one
- **WHEN** each is diffed against `main` at the commit this change branched from
- **THEN** none of them appears in the diff — only `SKILL.md` and `metadata.yaml` files were edited by
  this change

### Requirement: An automated check fails when a `.claude/skills/` file cites a reference path that does not resolve

A test SHALL exist that walks every `.claude/skills/**/*.md` and `.claude/skills/**/*.yaml` file, extracts every `(../)+references/<name>.md` citation, and fails when any citation's resolved path does not exist on disk. The check's citation-parsing and path-resolution logic SHALL be implemented as a pure function, separate from the disk-touching walk, so the parsing/resolution logic itself is provable without any filesystem access. The check SHALL be demonstrated, not merely asserted, to fail on a genuinely broken citation and to pass once that citation is removed.

#### Scenario: the guard passes against the real, fixed .claude/skills/ tree

- **GIVEN** `.claude/skills/**/*.md` and `.claude/skills/**/*.yaml` as shipped by this change
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run
- **THEN** it reports zero dangling citations, and asserts a non-trivial citation count was actually
  found (never a silently-vacuous zero-citations pass)

#### Scenario: the guard is proven non-vacuous — a hand-introduced broken citation is caught, and removing it restores green

- **GIVEN** a citation to a nonexistent file (`../../references/does-not-exist-nonce.md`)
  hand-appended to `.claude/skills/veo-3-1/SKILL.md`
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run against the modified file
- **THEN** it fails, naming exactly that one dangling citation
- **AND** once the hand-appended line is removed and the file is restored to its shipped state, running
  the guard again passes

#### Scenario: the pure scanner module is unit-tested with zero disk access

- **GIVEN** `src/claude-skills/reference-citation-scan.ts`'s exported functions
  (`extractReferenceCitations`, `extractAllReferenceCitations`, `findDanglingReferenceCitations`,
  `resolveCitationPath`)
- **WHEN** `src/claude-skills/reference-citation-scan.test.ts` is run
- **THEN** every test passes using only in-memory fixtures — no `node:fs` read in that file
- **AND** among its cases is a fixture reproducing the exact pre-fix bug shape (a `SKILL.md`-depth file
  citing with one `../` too many), asserted to be caught as dangling
