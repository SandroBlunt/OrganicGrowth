## 1. The credential scanner — pure detector (test-first)

- [x] 1.1 Write failing tests (`scanner.test.ts`) for `findCredentialShapedStrings`: catches the
  historical URL-path-token shape (synthetic 32-hex fixture); does not match a token shorter than the
  calibrated minimum; does not match a query-string HMAC signature (`asset_url` shape); does not match
  a bare hex identifier outside a URL; does not match a git commit SHA in prose; does not match a
  shorter CDN-style path id (the real Webflow calibration example, reproduced synthetically); labels
  each finding with its own path/line across multiple files; catches/does-not-catch the
  named-secret-field pattern (secret-shaped key + placeholder-shaped value guard); never throws on
  empty input; `fingerprintValue`/`redactSecret` behavior; `isBinaryContent` NUL-byte sniffing.
- [x] 1.2 Implement `src/secrets-scan/scanner.ts` — no filesystem, no `git`, no clock; no allowlist of
  any path or directory anywhere in this module.

## 2. The `git ls-files`-driven I/O shell (test-first)

- [x] 2.1 Write failing tests (`tracked-files.test.ts`) against a disposable temp `git` repo: lists
  exactly the committed files, never an untracked or `.gitignore`d one carrying the same secret shape
  (proves "tracked file list, not the working tree"); returns `[]` for a non-git directory rather than
  throwing; skips binary content and a since-deleted tracked file without throwing;
  `scanRepo` finds the tracked secret and nothing else.
- [x] 2.2 Implement `src/secrets-scan/tracked-files.ts` (`listTrackedFiles`, `readScannableFiles`,
  `scanRepo`).

## 3. Proof against the real historical incident (no secret literal ever written to source)

- [x] 3.1 Write `historical-incident.test.ts`: reads `.agents/mcp_config.json`'s actual committed
  content at commits `bb955eb` and `8f7c8f6` via `git show <sha>:<path>` AT TEST RUN TIME and asserts
  `findCredentialShapedStrings` catches it — the real value is never typed into any file in this
  change.

## 4. Ledger media references — pure fold (test-first)

- [x] 4.1 Write failing tests (`ledger-media-refs.test.ts`) for `collectLedgerMediaRefs`: collects
  every `asset_paths` entry tagged with brand/idea/recipe; collects Cast candidate `path`s, skipping a
  candidate with no local path yet; collects both sources across multiple Assets on one Idea; returns
  `[]` for an Idea with no Assets and for an empty ideas list; preserves duplicates (dedup is the
  caller's job).
- [x] 4.2 Implement `src/media-backup/ledger-media-refs.ts`.

## 5. Path resolution — relative / absolute / out-of-tree (test-first)

- [x] 5.1 Write failing tests (`path-resolve.test.ts`) for `resolveRawLedgerPath` (relative resolves
  against repoRoot; absolute returned unchanged) and `backupKeyFor` (mirrors the repo-relative path
  when inside repoRoot; falls back to a brand-namespaced, fingerprinted key when outside; deterministic;
  never collides two different out-of-tree files sharing a basename; repoRoot itself is never treated
  as "inside").
- [x] 5.2 Implement `src/media-backup/path-resolve.ts`.

## 6. Produced-media tree discovery (test-first)

- [x] 6.1 Write failing tests (`produced-media-tree.test.ts`) for `collectProducedMediaFiles`: collects
  files under a flat legacy run's `.output` bundle and a legacy `.assets`-named one; collects files
  nested under a daily-cadence Format's deeper run path (ADR-0023); does NOT collect files outside any
  bundle directory (a Brief `.md`, a `.spec.json`); skips hidden entries; returns `[]` for a missing
  `ideasRoot`; returns a sorted, deterministic list.
- [x] 6.2 Implement `src/media-backup/produced-media-tree.ts`.

## 7. Checksum + copy (test-first)

- [x] 7.1 Write failing tests (`checksum.test.ts`) for `digestBuffer`/`digestFile`: correct SHA-256 +
  size; deterministic; differs for different content; propagates `ENOENT` for a missing file.
- [x] 7.2 Implement `src/media-backup/checksum.ts`.
- [x] 7.3 Write failing tests (`copy.test.ts`) for `copyFileWithDigest`: copies byte-for-byte and
  returns the matching digest; creates missing parent directories; propagates a read failure for a
  missing source.
- [x] 7.4 Implement `src/media-backup/copy.ts` (via `writeFileAtomic`, the same crash-safe writer every
  other durable file write in this codebase uses).

## 8. Manifest shape + verify-diff logic (test-first)

- [x] 8.1 Write failing tests (`manifest.test.ts`) for `perBrandCounts`/`perBrandMissingCounts`
  (per-Brand aggregation, `{}` for empty input) and `diffManifestEntry` (matches -> `undefined`;
  missing-at-destination; checksum-mismatch; size-mismatch; checksum-mismatch preferred over a
  redundant size-mismatch report when both differ).
- [x] 8.2 Implement `src/media-backup/manifest.ts`.

## 9. Destination resolution — no hardcoded personal path (test-first)

- [x] 9.1 Write failing tests (`destination.test.ts`) for `expandTilde` and `resolveBackupDestination`:
  argument > `MEDIA_BACKUP_DEST` env var > `~/OrganicGrowth-Backups` default; `~`-expansion on both the
  argument and the env var; blank argument/env value treated as absent; the default always tracks
  whatever `homeDir` is passed, never a specific hardcoded path.
- [x] 9.2 Implement `src/media-backup/destination.ts`.

## 10. Backup + verify orchestration runners (test-first)

- [x] 10.1 Write failing tests (`backup-runner.test.ts`) against temp source/dest directories and
  fixture ledgers: copies an existing ledger-referenced file and reports the per-Brand count; lists a
  missing ledger media path rather than skipping it; also copies produced-media-tree files the ledger
  never references individually; copies a file exactly once when referenced by BOTH sources; discovers
  every Brand via `listBrands` (not a hardcoded pair); never throws when a Brand has no `ledger.json`
  at all; writes a `manifest.json` with checksum/size per entry and the injected clock's timestamp;
  handles zero Brands; copies an ABSOLUTE ledger path resolving OUTSIDE `repoRoot`, keyed under
  `external/<brand>/` (the real shape this build's own smoke check against the real ledgers surfaced).
- [x] 10.2 Implement `src/media-backup/backup-runner.ts` (`runMediaBackup`).
- [x] 10.3 Write failing tests (`verify-runner.test.ts`): zero mismatches for a fresh backup;
  checksum-mismatch on a corrupted backed-up file; missing-at-destination on a deleted one; a clear,
  named error when no manifest exists; an empty manifest verifies as zero mismatches.
- [x] 10.4 Implement `src/media-backup/verify-runner.ts` (`verifyMediaBackup`).

## 11. The `/backup-media` orchestration shell (test-first)

- [x] 11.1 Write failing tests (`backup-media.test.ts`) for `backupMediaCommand`/`main`: reports
  per-Brand counts and missing ledger paths; reports nothing-to-back-up for zero Brands; `--verify`
  reports zero mismatches, then a mismatch after corrupting a backed-up file; resolves the destination
  from `MEDIA_BACKUP_DEST` when no positional argument is given; `main()` runs against real
  `process.argv` and prints to stdout without throwing.
- [x] 11.2 Implement `src/commands/backup-media.ts`.
- [x] 11.3 Add the `backup-media` script to `package.json`, in the style of every other command.

## 12. OpenSpec + full-suite green + self-review + Build Report

- [x] 12.1 Author spec deltas (`specs/secrets-scan`, `specs/media-backup`) as Requirements +
  Scenarios; run `openspec validate --strict` until green.
- [x] 12.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — both green, more tests than the
  2310-test baseline.
- [x] 12.3 Self-review pass: remove dead code (a leftover unused-helper computation in the CLI shell,
  an unused `stat` import, an unused `mkdir` import), tighten module boundaries, confirm every
  in-scope issue #197 acceptance criterion maps to a specific test.
- [x] 12.4 Write the Build Report into `handoff.md`, including the coordinator's mid-build scope
  narrowing and the Known Limits it implies.

## 13. Round-2 fixes — QA Round 1 Defect 1 (critical) and Defect 2 (low)

- [x] 13.1 **Defect 1.** Write `src/secrets-scan/self-scan.test.ts`: calls `scanRepo(REPO_ROOT)` — with
  `REPO_ROOT` resolved from the test's own on-disk location via `import.meta.url`, exactly like
  `historical-incident.test.ts` — against THIS repository's real, currently-tracked file set, and
  asserts zero findings (redacted on failure, never the raw value); a companion sanity check that a
  real, non-trivial number of tracked files was actually scanned.
- [x] 13.2 Found and fixed two of this branch's OWN fixture files that tripped the new real self-scan
  (a realistic named-secret-field example literal appeared, by design, in `scanner.test.ts` and in
  `specs/secrets-scan/spec.md`'s prose): rebuilt `scanner.test.ts`'s fixture value via string
  concatenation (`PLAUSIBLE_SECRET_VALUE`) so the file's own tracked source never carries the matching
  string as one contiguous run, while the RUNTIME value the function under test receives is unchanged;
  rewrote the two affected spec Scenarios to describe the value's shape in prose instead of giving a
  concrete literal.
- [x] 13.3 Manually, temporarily, and safely proved the new guard genuinely fails: appended a
  credential-shaped line to an already-tracked, unrelated file (`README.md`), re-ran
  `self-scan.test.ts`, confirmed it failed with a REDACTED value in the failure message, then reverted
  the file via `git checkout --` and confirmed a byte-identical, clean revert.
- [x] 13.4 Add a matching Requirement + 3 Scenarios to `specs/secrets-scan/spec.md` for the new guard.
- [x] 13.5 **Defect 2.** Write `.claude/commands/backup-media.md`, matching the shape/depth of sibling
  granular commands (`export-schedule.md`, `cleanup-schedule-media.md`): frontmatter, Usage, a
  code-backed paragraph naming every real module by full path, Steps, Guardrails.
- [x] 13.6 Write `src/commands/backup-media.docs-test.ts`, mirroring
  `cleanup-schedule-media.docs-test.ts`'s own pattern — every assertion reads the doc at its real,
  registered path (`.claude/commands/backup-media.md`) and pins real, checkable substrings, never
  free-floating prose. Add a matching Requirement + 2 Scenarios to `specs/media-backup/spec.md`.
- [x] 13.7 Run `openspec validate --all --strict`, `npx tsc --noEmit`, `npm test`, and `npm run
  test:docs` — all green, more tests than both the `main` baseline and this branch's own Round-1 count.
- [x] 13.8 Append a `Round-2 Build` block to `handoff.md` (never overwrite the Round-1 report or the QA
  Verdict).
