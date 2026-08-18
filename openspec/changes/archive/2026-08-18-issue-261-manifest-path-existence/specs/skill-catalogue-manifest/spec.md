## MODIFIED Requirements

### Requirement: An automated check fails when a catalogue entry has an incomplete manifest, extending the existing dangling-reference-citation guard rather than duplicating it

`src/claude-skills/reference-citation-guard.docs-test.ts` (the same file #252 landed) SHALL contain a check that walks every `.claude/skills/<entry>/` directory that has a `metadata.yaml`, parses its `SKILL.md` frontmatter and `metadata.yaml` via the pure `src/claude-skills/manifest-completeness-scan.ts`, and fails when any required manifest field (per the Requirement above) is missing, empty, or does not match its cross-checked source (the `LICENSE` file's licence/owner; the `SKILL.md`/`metadata.yaml` name pair) — no second, separate guard file SHALL be added for this purpose. The check SHALL assert a non-trivial corpus floor (at least 11 catalogue entries found) so a silently-empty walk cannot pass vacuously, and its `purpose`-length threshold SHALL be justified against the real corpus's shortest description at authoring time rather than picked arbitrarily. **(Issue #261.)** The check SHALL ALSO fail when a declared `scripts[].path`, `evals[].path`, `references[].path`, or `shared_references.path` does not resolve to a real file (or, for `shared_references.path`, a real directory) on disk — via an OPTIONAL `pathExists` predicate `src/claude-skills/manifest-completeness-scan.ts`'s `checkManifestCompleteness` accepts, which the real guard always supplies, backed by `existsSync`, resolved against each entry's own real directory. This existence check SHALL run IN ADDITION TO, and SHALL NOT weaken or replace, the pre-existing evals-cites-a-declared-script consistency check — the two catch different errors (a well-formed path naming the wrong thing vs. a well-formed, correctly-named path that is nonetheless dead) and both SHALL remain independently enforced.

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

#### Scenario: a declared scripts[].path that does not resolve to a real file is caught, naming the entry and the exact field

- **GIVEN** a real `.claude/skills/<entry>/metadata.yaml` whose `scripts[0].path` is hand-mutated to name
  a file that does not exist on disk, its sibling `scripts[].path` entries and its `evals[].path`
  left untouched and still pointing at real, existing files
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run
- **THEN** it fails, naming that entry and exactly `scripts[0].path`, and reports no other defect for
  that entry's other scripts or evals entries
- **AND** after the file is restored byte-identically, re-running the guard passes and `git status` on
  the mutated file is clean

#### Scenario: a declared evals[].path that does not resolve to a real file is caught even though it still names a real, declared scripts[] entry

- **GIVEN** a real `.claude/skills/<entry>/metadata.yaml` whose `scripts[].path` entry AND the
  `evals[].path` entry citing that same script are BOTH hand-mutated to the SAME nonexistent file name
  (kept mutually consistent with each other, reproducing a script renamed with its eval left pointing at
  the old, dead name)
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run
- **THEN** it fails, naming that entry, `scripts[N].path`, AND `evals[0].path`, each for existence (not
  for the pre-existing consistency check, which still passes since the two remain mutually consistent)
- **AND** after the file is restored byte-identically, re-running the guard passes and `git status` on
  the mutated file is clean

#### Scenario: the pre-existing evals-cites-a-declared-script consistency check still fires independently of the new existence check

- **GIVEN** a fixture `evals[].path` that resolves to a real file (via an injected `pathExists` that
  always returns `true`) but names no entry in that same catalogue entry's own `scripts:` list
- **WHEN** `checkManifestCompleteness` is run
- **THEN** it reports an `evals[0].path` defect whose reason references this entry's own `scripts:` list
  — proving the consistency check is untouched by, and independent of, the new existence check

## ADDED Requirements

### Requirement: Every other path-shaped manifest field is evaluated for the same existence-guard treatment, and the decision is recorded

For each path-shaped `metadata.yaml` field beyond `scripts[].path` and `evals[].path`, the guard's own coverage SHALL be evaluated and the decision recorded in `docs/catalogue-manifest-format.md`'s "Path-shaped fields" section. `references[].path` (this entry's own reference documents) SHALL gain the same existence check as `scripts[].path`/`evals[].path`, because no other guard resolves a same-directory `references/<name>.md` citation — the dangling-reference-citation guard's regex only matches a `(../)+(<segment>/)*references/(<name>.md)?`-shaped CLIMBING citation, which a same-directory value never satisfies. `shared_references.path` SHALL ALSO gain a direct existence check in `manifest-completeness-scan.ts`, layered on top of (not instead of) the existing dangling-reference-citation guard, because that sibling guard's coverage of this field is CONFIRMED to be real but PARTIAL: it catches a value corrupted to the wrong climb depth or carrying a bogus intervening segment (its regex still recognises the citation shape), but it CANNOT catch a value whose literal `references` folder-name segment is itself mistyped or renamed, because such a value no longer matches the citation shape the guard's regex scans for at all — a gap living in the seam between two individually-correct guards (issues #235, #238's own documented failure mode), found live while confirming this field's coverage rather than assumed. `tools[].required_for` (every real entry declares `tools: []` today, per issue #255, so there is no live data to check and this field itself has no presence/shape validation of its own yet), `entities.reads`/`entities.writes` (glob-shaped, not a single literal path — any literal, named citation their real values contain is already walked by the dangling-reference-citation guard's own corpus-wide scan), `domain_path` (a categorisation label, not a filesystem path), and `source_tracking`'s URLs (external, never a path into this repository's own tree) SHALL NOT gain an existence check, each for the stated reason.

#### Scenario: a declared references[].path that does not resolve to a real file is caught

- **GIVEN** a real `.claude/skills/<entry>/metadata.yaml` whose `references[0].path` is hand-mutated to
  name a file that does not exist on disk
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run
- **THEN** it fails, naming that entry and exactly `references[0].path`
- **AND** after the file is restored byte-identically, re-running the guard passes and `git status` on
  the mutated file is clean

#### Scenario: the sibling dangling-reference-citation guard's coverage of shared_references.path is confirmed for a wrong-depth corruption

- **GIVEN** a real `.claude/skills/<entry>/metadata.yaml`'s `shared_references.path` hand-mutated to
  insert a bogus intervening path segment before the literal `references/` segment (e.g.
  `../../bogus-segment/references/`), so the value still matches the citation shape but resolves nowhere
- **WHEN** `src/claude-skills/reference-citation-guard.docs-test.ts` is run
- **THEN** the EXISTING dangling-reference-citation guard (the `describe` block from issue #252) fails,
  naming the citing file and the raw path — confirming its coverage of this corruption shape live
- **AND** after the file is restored byte-identically, re-running the guard passes and `git status` on
  the mutated file is clean

#### Scenario: shared_references.path gains its own direct existence check because the sibling guard's coverage is partial, not total

- **GIVEN** a fixture `shared_references.path` value for which an injected `pathExists` predicate
  returns `false`
- **WHEN** `checkManifestCompleteness` is run with that predicate supplied
- **THEN** it reports a `shared_references.path` defect for existence — proving this field is checked
  directly by `manifest-completeness-scan.ts` itself, not left solely to the sibling guard's own,
  narrower citation-shape match

#### Scenario: the fields deliberately left without an existence check are named with reasons in the manifest-format document

- **GIVEN** `docs/catalogue-manifest-format.md`'s "Path-shaped fields" section as shipped
- **WHEN** it is read
- **THEN** it names `tools[].required_for`, `entities.reads`/`entities.writes`, `domain_path`, and
  `source_tracking`'s URLs as deliberately not given an existence check, each with a stated reason

