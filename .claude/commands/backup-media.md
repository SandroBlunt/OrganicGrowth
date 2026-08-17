---
name: backup-media
description: "Copy every Brand's ledger-referenced media plus its whole produced-media tree to a durable destination outside this working folder, with a checksummed manifest; --verify re-checks an existing backup."
---

# /backup-media

Usage: `/backup-media [<destination>] [--verify]`

The **media backup** (issue #197). The ~800 MB of produced media the ledgers point at (every Brand's
own `.output`/`.assets` bundles, walked by `src/media-backup/produced-media-tree.ts`) exists in exactly
one place on one machine — it is gitignored by design (issue #112) and has no history and no backup.
This command copies it somewhere durable. `<destination>` and `--verify` are both OPTIONAL, in any
order: with no arguments it runs a full backup to the resolved destination; with `--verify` it checks
an EXISTING backup at that destination against its own manifest instead of copying anything.

**Every Brand, discovered, never hardcoded.** Backs up every Brand slug `listBrands`
(`src/brand/resolver.ts`) finds — not a fixed pair — so a Brand added later is covered automatically,
with no code change.

**The destination is never a hardcoded personal path.** Resolved in order: the `<destination>`
argument, then the `MEDIA_BACKUP_DEST` environment variable, then `~/OrganicGrowth-Backups` (`~`
expanded against the real home directory at run time).

**Code-backed (issue #197).** `src/commands/backup-media.ts` (the orchestration shell,
`backupMediaCommand`) is a thin layer over pure/deep modules: `src/media-backup/ledger-media-refs.ts`
(folds a Brand's `asset_paths`/Cast candidate paths off its already-loaded ledger),
`src/media-backup/path-resolve.ts` (relative vs. absolute vs. out-of-tree ledger paths),
`src/media-backup/produced-media-tree.ts` (walks every `.output`/`.assets` bundle),
`src/media-backup/checksum.ts` + `src/media-backup/copy.ts` (SHA-256 digest + crash-safe copy),
`src/media-backup/manifest.ts` (the manifest shape + verify-diff logic), `src/media-backup/destination.ts`
(`resolveBackupDestination`), `src/media-backup/backup-runner.ts` (`runMediaBackup`, the backup
orchestration), and `src/media-backup/verify-runner.ts` (`verifyMediaBackup`). Never touches the
Magnific Space or any Zoho MCP tool — pure local filesystem I/O, always hermetic; every test runs
against temp directories and tiny fixture files, never the real ~800 MB corpus.

## Steps

1. **Resolve the destination.** `<destination>` argument > `MEDIA_BACKUP_DEST` env var >
   `~/OrganicGrowth-Backups`. State it: "Media backup written to `<destination>`."
2. **Without `--verify`, run** `npm run backup-media -- [<destination>]` (or call
   `backupMediaCommand()` in `src/commands/backup-media.ts`). It:
   - **Discovers** every Brand via `listBrands` — not a hardcoded pair.
   - **Loads** each Brand's ledger (`loadIdeas`) and **collects** every `asset_paths`/Cast-candidate
     `path` it references (`collectLedgerMediaRefs`).
   - **Resolves** each raw path (relative against the repo root; an already-absolute one used as-is)
     and checks it exists — a path pointing at a file that no longer exists is LISTED in the report,
     per Idea/Recipe/raw-path, never silently skipped.
   - **Walks** that Brand's whole produced-media tree (every file under any `.output`/`.assets`
     bundle — including a file the ledger never references individually, e.g. a stray `caption.txt`
     from a superseded run).
   - **Unions** both sources by resolved absolute path (a file referenced by both is copied EXACTLY
     ONCE) and **copies** each to the destination, mirroring the repo-relative path when the source
     lives inside the repo root, or a collision-safe `external/<brand>/` key when it doesn't (e.g. an
     older record's absolute path from a different checkout).
   - **Writes** `<destination>/manifest.json`: every copied file's Brand, backup-relative path,
     SHA-256 checksum, and byte size.
3. **With `--verify`, run** `npm run backup-media -- <destination> --verify`. It reads that
   destination's own `manifest.json`, re-digests every entry's file AT THE DESTINATION (never
   consulting the source repository), and reports either "0 mismatches" or each mismatch's path and
   reason (`missing-at-destination`, `checksum-mismatch`, `size-mismatch`).
4. **Report:** per Brand, how many files were copied and every missing ledger media path; or, in
   `--verify` mode, the total entries checked and any mismatches.

## Guardrails

- **No hardcoded personal path anywhere.** The destination default expands `~` against the real home
  directory at run time; the argument and `MEDIA_BACKUP_DEST` both override it.
- **Never silently skips a missing ledger media path.** Every one is listed in the report, per Idea and
  Recipe, with the exact raw path recorded in the ledger.
- **Generate-never-publish (ADR-0002).** This command only reads the ledger and copies files; it never
  calls Magnific, Zoho, Facebook, or any other platform API, and never writes to a Brand's `ledger.json`.
- **Hermetic build.** Every test uses temp directories and hand-written fixture ledgers — never a real
  Brand's own ledger and never the real default destination.
- **Run from the actual working checkout, not a fresh worktree.** The produced-media tree is
  gitignored and per-checkout — a worktree that never produced any media will report most
  ledger-referenced files as missing; that is a filesystem-locality fact, not a bug.
