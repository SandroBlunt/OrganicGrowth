# media-backup Specification

## Purpose
TBD - created by archiving change issue-197-secrets-and-media-backup. Update Purpose after archive.
## Requirements
### Requirement: collectLedgerMediaRefs folds a Brand's asset_paths and Cast candidate paths off an already-loaded ledger

`collectLedgerMediaRefs(ideas, brand)` (`src/media-backup/ledger-media-refs.ts`) SHALL, PURELY (no
I/O), fold every Idea's Assets across `ideas` into a flat list of `LedgerMediaRef`s: one entry per
`LedgerAssetRecord.asset_paths` array element (`source: "asset_paths"`), and one entry per
`LedgerCastCandidate` that carries a `path` (`source: "cast_path"`), skipping a candidate with no
local path. Each ref SHALL carry `brand`, the owning Idea's `id`, the Asset's `recipe`, and the raw
`path` EXACTLY as recorded in the ledger — never normalized. Duplicate paths SHALL be preserved, not
deduplicated (deduplication is the caller's responsibility, keyed on the resolved absolute path).

#### Scenario: Collects every asset_paths entry, tagged with brand/idea/recipe

- **GIVEN** one Idea with one Asset carrying two `asset_paths` entries
- **WHEN** `collectLedgerMediaRefs` is called
- **THEN** it returns two refs, each carrying the correct `brand`/`ideaId`/`recipe`/`path` and
  `source: "asset_paths"`

#### Scenario: Collects Cast candidate paths, skipping a candidate with no local path yet

- **GIVEN** one Asset with two Cast candidates, one carrying a `path` and one carrying only a remote
  `url`
- **WHEN** `collectLedgerMediaRefs` is called
- **THEN** it returns exactly one ref, for the candidate carrying a `path`, with `source: "cast_path"`

#### Scenario: An Idea with no Assets, or an empty ideas list, yields no refs

- **GIVEN** an Idea with no `assets` field, and separately an empty `ideas` array
- **WHEN** `collectLedgerMediaRefs` is called on each
- **THEN** both calls return `[]`

### Requirement: A ledger-recorded media path resolves whether it is relative or already absolute

`resolveRawLedgerPath(rawPath, repoRoot)` (`src/media-backup/path-resolve.ts`) SHALL return `rawPath`
UNCHANGED when it is already an absolute filesystem path, and SHALL resolve it against `repoRoot`
otherwise. `backupKeyFor(absPath, repoRoot, brand)` SHALL return `absPath`'s path relative to
`repoRoot` when `absPath` lives inside `repoRoot`, mirroring the source tree exactly at the backup
destination. When `absPath` does NOT live inside `repoRoot` — including when `repoRoot` itself equals
`absPath` — it SHALL return `external/<brand>/<12-hex-char-fingerprint-of-absPath>-<basename>`,
deterministic for a given `absPath` and never colliding two different out-of-tree paths that happen to
share a basename.

#### Scenario: A relative ledger path resolves against repoRoot; an absolute one is returned unchanged

- **GIVEN** a relative raw path and, separately, an already-absolute raw path
- **WHEN** `resolveRawLedgerPath` is called with a given `repoRoot`
- **THEN** the relative path resolves to `repoRoot` joined with it, and the absolute path is returned
  byte-for-byte unchanged

#### Scenario: backupKeyFor mirrors the repo-relative path for a file inside repoRoot

- **GIVEN** an absolute path that lives inside `repoRoot`
- **WHEN** `backupKeyFor` is called
- **THEN** it returns that path's location relative to `repoRoot`

#### Scenario: backupKeyFor falls back to a brand-namespaced, fingerprinted key outside repoRoot, never colliding

- **GIVEN** two different absolute paths that both live OUTSIDE `repoRoot` and share the same basename
- **WHEN** `backupKeyFor` is called on each
- **THEN** both keys start with `external/<brand>/`, and the two keys are different from each other

### Requirement: collectProducedMediaFiles walks a Brand's whole produced-media tree, not just ledger-referenced files

`collectProducedMediaFiles(ideasRoot)` (`src/media-backup/produced-media-tree.ts`) SHALL recursively
collect every file that sits inside a directory whose name ends in `.output` or `.assets`, at any depth
under `ideasRoot` (covering both a flat legacy run and a `cadence: daily` Format's nested run path,
ADR-0023). It SHALL NOT collect a file that sits outside any such bundle directory (a Brief `.md`, a
`.spec.json`), and SHALL skip hidden entries (names starting with `.`). A missing or unreadable
`ideasRoot` SHALL yield `[]` rather than throw. The returned list SHALL be sorted for determinism.

#### Scenario: Collects files under both current (.output) and legacy (.assets) bundle directory names

- **GIVEN** an `ideasRoot` containing one `.output`-named bundle and one `.assets`-named bundle, each
  with a file inside
- **WHEN** `collectProducedMediaFiles` is called
- **THEN** both files are returned

#### Scenario: Does not collect files outside any bundle directory

- **GIVEN** an `ideasRoot` containing a Brief `.md` file and a `.spec.json` file, neither inside a
  `.output`/`.assets` directory
- **WHEN** `collectProducedMediaFiles` is called
- **THEN** it returns `[]`

#### Scenario: A missing ideasRoot yields an empty list rather than throwing

- **GIVEN** a path that does not exist on disk
- **WHEN** `collectProducedMediaFiles` is called with it as `ideasRoot`
- **THEN** it returns `[]` without throwing

### Requirement: runMediaBackup copies the union of ledger-referenced media and the produced-media tree, for every discovered Brand

`runMediaBackup(destination, options)` (`src/media-backup/backup-runner.ts`) SHALL, for every Brand
slug returned by `listBrands` (never a hardcoded pair): load that Brand's ledger via `loadIdeas`
(never throwing the whole run when one Brand's ledger is missing or unreadable — that Brand simply
contributes zero ledger refs and the run continues for every other Brand); resolve every
`collectLedgerMediaRefs` entry's raw path via `resolveRawLedgerPath`, checking existence; UNION the
set of EXISTING resolved files with every file `collectProducedMediaFiles` finds under that Brand's
`ideasRoot`, deduplicated by resolved absolute path (a file referenced by both sources is copied
EXACTLY ONCE); copy each unioned file to `destination` at its `backupKeyFor` location via
`copyFileWithDigest`; and record one `ManifestEntry` (brand, backup key, SHA-256, size) per copied
file. It SHALL write the whole run's result to `<destination>/manifest.json`. Every ledger media path
whose resolved file does NOT exist SHALL be recorded (never silently dropped) as a
`MissingLedgerPath` (brand, Idea id, Recipe, raw path exactly as recorded), attributed per Brand. A
relative `brandsRoot` SHALL be resolved against `repoRoot` explicitly (never left to an underlying
filesystem call's implicit `process.cwd()`-relative resolution), so the ledger's own relative-path
resolution and the produced-media tree walk always agree on which filesystem tree they are looking at,
independent of the calling process's current working directory.

#### Scenario: Copies an existing ledger-referenced file and reports the per-Brand count

- **GIVEN** one Brand whose ledger references one file that exists on disk
- **WHEN** `runMediaBackup` is called
- **THEN** that Brand's result reports `copiedCount: 1`, and the file exists at its mirrored location
  under `destination`

#### Scenario: A ledger media path pointing at a file that no longer exists is listed, never skipped

- **GIVEN** one Brand whose ledger references one file that does NOT exist on disk
- **WHEN** `runMediaBackup` is called
- **THEN** that Brand's result reports `copiedCount: 0` and exactly one `MissingLedgerPath` naming the
  Idea, Recipe, and the exact raw path recorded in the ledger; the SAME entry appears in the written
  manifest's `missingLedgerPaths`

#### Scenario: Produced-media tree files the ledger never references individually are still backed up

- **GIVEN** one Brand with an empty ledger and one file present inside a `.output` bundle on disk
- **WHEN** `runMediaBackup` is called
- **THEN** that file is copied and counted, even though no ledger record points at it

#### Scenario: A file referenced by BOTH the ledger and present in the produced-media tree is copied exactly once

- **GIVEN** one Brand whose ledger references a file that also happens to sit inside a `.output` bundle
  discovered by the tree walk
- **WHEN** `runMediaBackup` is called
- **THEN** that Brand's `copiedCount` is 1, not 2

#### Scenario: Every Brand under brandsRoot is backed up, discovered via listBrands, not a hardcoded pair

- **GIVEN** three Brand directories under `brandsRoot`, each with one media file
- **WHEN** `runMediaBackup` is called
- **THEN** the result includes all three Brands, each with `copiedCount: 1`

#### Scenario: A Brand directory with no ledger.json at all does not crash the run

- **GIVEN** one Brand directory containing no `ledger.json`
- **WHEN** `runMediaBackup` is called
- **THEN** it does not throw, and that Brand's result reports `copiedCount: 0` and no missing paths

#### Scenario: An absolute ledger path resolving outside repoRoot is still backed up, under the external/ fallback key

- **GIVEN** a ledger `asset_paths` entry recorded as an absolute path to a real file OUTSIDE the given
  `repoRoot` (the real shape behind some existing records in this repository's own ledgers, produced on
  a different checkout of the same Brand)
- **WHEN** `runMediaBackup` is called
- **THEN** that file is copied, is NOT listed as missing, and its manifest entry's path starts with
  `external/<brand>/`

#### Scenario: A relative brandsRoot resolves against repoRoot, independent of process.cwd()

- **GIVEN** a relative `brandsRoot`, an explicit `repoRoot`, and the calling process's current working
  directory pointed at neither
- **WHEN** `runMediaBackup` is called
- **THEN** it still finds and copies that Brand's media — resolution is anchored to `repoRoot`, not to
  wherever the process happens to be running from

#### Scenario: Zero Brands yields an empty result and an empty manifest

- **GIVEN** a `brandsRoot` containing no Brand directories
- **WHEN** `runMediaBackup` is called
- **THEN** it returns `brands: []`, and the written manifest's `entries` is `[]`

### Requirement: verifyMediaBackup checks a backup's own manifest against the destination and reports zero mismatches when intact

`verifyMediaBackup(destination)` (`src/media-backup/verify-runner.ts`) SHALL read
`<destination>/manifest.json` and, for every entry, re-digest the file at that entry's backup-relative
location UNDER `destination` (never consulting the original source repository) and report a
`VerifyMismatch` — `missing-at-destination` when no file exists there, `checksum-mismatch` when the
digest differs, `size-mismatch` when only the size differs — or nothing when the file matches exactly.
It SHALL throw a clear, named error (naming the manifest path) when no manifest exists at
`destination`, rather than a bare `ENOENT`.

#### Scenario: A fresh, untouched backup verifies with zero mismatches

- **GIVEN** a destination just written by `runMediaBackup`, untouched since
- **WHEN** `verifyMediaBackup` is called
- **THEN** it reports `mismatches: []`

#### Scenario: A corrupted backed-up file is reported as a checksum-mismatch

- **GIVEN** a backup whose destination copy of one file has since been overwritten with different bytes
- **WHEN** `verifyMediaBackup` is called
- **THEN** it reports exactly one mismatch for that file, with `reason: "checksum-mismatch"`

#### Scenario: A deleted backed-up file is reported as missing-at-destination

- **GIVEN** a backup whose destination copy of one file has since been deleted
- **WHEN** `verifyMediaBackup` is called
- **THEN** it reports exactly one mismatch for that file, with `reason: "missing-at-destination"`

#### Scenario: Verifying a destination with no manifest throws a clear, named error

- **GIVEN** a destination directory with no `manifest.json`
- **WHEN** `verifyMediaBackup` is called
- **THEN** it throws an error naming the missing manifest path, instructing that a backup be run first

### Requirement: The backup destination is never a hardcoded personal path — argument, then env var, then a ~-expanded default

`resolveBackupDestination(options)` (`src/media-backup/destination.ts`) SHALL prefer, in order: a
non-blank `argDest`; a non-blank `env.MEDIA_BACKUP_DEST`; else `~/OrganicGrowth-Backups`. `~` and
`~/...` SHALL be expanded against the CALLER-SUPPLIED `homeDir` argument — this module SHALL NEVER
read `os.homedir()` or any other ambient source directly, so the resolved default is never a hardcoded
personal path anywhere in source.

#### Scenario: An explicit argument wins over the env var and the default

- **GIVEN** both a non-blank `argDest` and a non-blank `env.MEDIA_BACKUP_DEST`
- **WHEN** `resolveBackupDestination` is called
- **THEN** the returned destination is the `~`-expanded `argDest`

#### Scenario: The env var wins over the default when no argument is given

- **GIVEN** no `argDest` and a non-blank `env.MEDIA_BACKUP_DEST`
- **WHEN** `resolveBackupDestination` is called
- **THEN** the returned destination is the `~`-expanded env value

#### Scenario: The default tracks whatever homeDir is passed — never one hardcoded path

- **GIVEN** neither `argDest` nor `env.MEDIA_BACKUP_DEST` set, called once with one `homeDir` and once
  with a different `homeDir`
- **WHEN** `resolveBackupDestination` is called each time
- **THEN** each call returns `<that call's homeDir>/OrganicGrowth-Backups` — the two results differ

#### Scenario: A blank argument or env value is treated as absent

- **GIVEN** `argDest` is an empty or whitespace-only string
- **WHEN** `resolveBackupDestination` is called
- **THEN** it falls through to the env var, or the default, exactly as if `argDest` were omitted

### Requirement: /backup-media is the orchestration shell — backup by default, --verify to check an existing one

`backupMediaCommand(args, options)` (`src/commands/backup-media.ts`) SHALL recognize a `--verify` flag
anywhere in `args` (no required argument order) and an optional positional destination argument. Without
`--verify`, it SHALL run `runMediaBackup` against the resolved destination and report, per Brand, the
number of files copied and every missing ledger media path (Idea, Recipe, raw path). With `--verify`,
it SHALL run `verifyMediaBackup` against the resolved destination and report the total entries checked
and either "0 mismatches" or each mismatch's path and reason. The destination SHALL be resolved via
`resolveBackupDestination`, honoring the same argument/env-var/default precedence.

#### Scenario: Reports per-Brand counts and lists missing ledger paths

- **GIVEN** one Brand whose ledger references one existing and one missing media file
- **WHEN** `backupMediaCommand` is run without `--verify`
- **THEN** the report names the Brand's copied count, and lists the missing path under that Brand

#### Scenario: --verify reports zero mismatches for an intact backup, then a mismatch after corruption

- **GIVEN** a backup already written to a destination
- **WHEN** `backupMediaCommand` is run with `--verify` against the same destination, once before and
  once after one backed-up file is corrupted
- **THEN** the first report states 0 mismatches, and the second names the corrupted file with reason
  `checksum-mismatch`

### Requirement: /backup-media is registered as an invocable slash command, matching sibling granular commands

`.claude/commands/backup-media.md` SHALL exist and document `/backup-media` in the same shape and
depth as its sibling granular commands (e.g. `export-schedule.md`, `cleanup-schedule-media.md`):
frontmatter (`name`, `description`), a Usage line, a "code-backed" paragraph naming the real
orchestration shell and every real deep module it wraps, a numbered Steps section, and a Guardrails
section. It SHALL document that both `<destination>` and `--verify` are optional, the destination
resolution precedence and its no-hardcoded-personal-path rule, that every Brand is discovered via
`listBrands` rather than a hardcoded pair, that a missing ledger media path is listed rather than
silently skipped, the manifest's checksum+size shape, `--verify`'s three mismatch reasons, that tests
always use temp directories and fixture ledgers (never the real corpus), and that a fresh worktree's
report of missing files is a filesystem-locality fact rather than a defect. A docs-conformance test
(`src/commands/backup-media.docs-test.ts`, run via `npm run test:docs`, kept OUT of `npm test`) SHALL
read this file at its real, registered path and pin every one of these claims against the actual
shipped text — never against free-floating prose that is not checked against what ships.

#### Scenario: backup-media.md exists, documents optional arguments, and names the real code

- **GIVEN** `.claude/commands/backup-media.md` as shipped
- **WHEN** it is read
- **THEN** it documents `<destination>` and `--verify` as optional
- **AND** it names `src/commands/backup-media.ts`, `backupMediaCommand`, and every real
  `src/media-backup/*.ts` module the command wraps, each by its full path

#### Scenario: backup-media.md documents the no-hardcoded-personal-path destination rule and the missing-path reporting rule

- **GIVEN** `.claude/commands/backup-media.md` as shipped
- **WHEN** it is read
- **THEN** it documents the `MEDIA_BACKUP_DEST` env var, the `~/OrganicGrowth-Backups` default, and
  states the destination is never a hardcoded personal path
- **AND** it states a missing ledger media path is listed in the report, never silently skipped

