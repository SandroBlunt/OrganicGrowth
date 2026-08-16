# Slice Handoff — issue #197: secrets and media backup

## Build Report (developer)

### Scope note — read this first

Two mid-build corrections from the coordinator changed this slice's scope after work had already
started, and both are reflected below and in `proposal.md`'s own "Why" section:

1. **Backup destination.** The Operator decided the default destination is `~/OrganicGrowth-Backups`
   (`~` expanded against the real home directory at run time — never a hardcoded personal path),
   overridable by argument or the `MEDIA_BACKUP_DEST` env var. Built exactly this way from the start.
2. **The `.agents/mcp_config.json` untracking work was dropped entirely.** The Operator decided,
   mid-build, to undo the whole Antigravity migration on a SEPARATE branch — deleting `.agents/`
   entirely and restoring `.claude/` — so untracking that one file here would fight that branch's own
   work. Nothing in this branch touches `.agents/mcp_config.json`, its tracking status, or
   `docs/zoho-mcp-server-setup.md`. The credential scanner was built to be **completely
   harness-agnostic** — no path or directory exception anywhere — specifically so it stays correct
   regardless of which harness/config-file shape the repo uses after that other branch lands.

### What changed

Two independent, hermetic capabilities, both wired into `npm test`:

1. **`secrets-scan`** (`src/secrets-scan/`) — a credential-shaped-string scanner. Two patterns: a long
   hex run standing alone as a URL path segment (the real incident's exact shape — a bearer token in
   an MCP server URL), and a JSON `"<key>": "<value>"` pair whose key names something secret-shaped and
   whose value is long/un-placeholder-shaped. Calibrated against every currently tracked file in this
   repository (checked by hand before writing a single line of the real regex) to a **zero
   false-positive rate today** — see `scanner.ts`'s own docstring for exactly which real shapes were
   checked and why each does or doesn't match. Driven by `git ls-files`, never a raw working-tree walk.
   Proven against the REAL historical incident (`.agents/mcp_config.json` at commits `bb955eb`/
   `8f7c8f6`) by reading it from git history AT TEST RUN TIME — the actual secret value is never typed
   into this repository's source anywhere (an early attempt to hardcode even a fingerprint of it was
   blocked by this environment's own write-time safety classifier, which is the right outcome and
   shaped the final design: no baseline/allowlist mechanism exists at all — every tracked file is
   scanned identically, always).

2. **`media-backup`** (`src/media-backup/` + `src/commands/backup-media.ts`) — `/backup-media
   [<destination>] [--verify]`. Backs up, for every Brand `listBrands` discovers (not a hardcoded
   pair), the UNION of every file its ledger references (`asset_paths`, Cast candidate `path`s) and its
   whole produced-media tree (every file under any `.output`/`.assets` bundle, including files the
   ledger never references individually). Writes `<destination>/manifest.json` (Brand, backup-relative
   path, SHA-256, size per entry). Lists — never silently skips — a ledger media path pointing at a
   file that no longer exists. `--verify` re-digests the destination against its own manifest and
   reports mismatches (or zero).

### Files touched

New:
- `src/secrets-scan/scanner.ts`, `scanner.test.ts`
- `src/secrets-scan/tracked-files.ts`, `tracked-files.test.ts`
- `src/secrets-scan/historical-incident.test.ts`
- `src/media-backup/ledger-media-refs.ts`, `ledger-media-refs.test.ts`
- `src/media-backup/path-resolve.ts`, `path-resolve.test.ts`
- `src/media-backup/produced-media-tree.ts`, `produced-media-tree.test.ts`
- `src/media-backup/checksum.ts`, `checksum.test.ts`
- `src/media-backup/copy.ts`, `copy.test.ts`
- `src/media-backup/manifest.ts`, `manifest.test.ts`
- `src/media-backup/destination.ts`, `destination.test.ts`
- `src/media-backup/backup-runner.ts`, `backup-runner.test.ts`
- `src/media-backup/verify-runner.ts`, `verify-runner.test.ts`
- `src/commands/backup-media.ts`, `backup-media.test.ts`
- `openspec/changes/issue-197-secrets-and-media-backup/` (this change: `proposal.md`, `tasks.md`,
  `specs/secrets-scan/spec.md`, `specs/media-backup/spec.md`, `handoff.md`)

Modified:
- `package.json` — one new line, the `backup-media` script.

Nothing under `.agents/`, `.claude/`, `docs/`, or any ledger/data file was touched.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-197-secrets-and-media-backup
npm install                                  # first time only, per worktree
npx tsc -p tsconfig.json --noEmit            # strict typecheck
npm test                                     # full suite (includes the secrets scan + all new tests)
npx openspec validate issue-197-secrets-and-media-backup --strict
npx openspec validate --all --strict         # whole repo, confirms nothing else broke

# Manual CLI smoke check (safe — no positional dest given here means it would default to
# ~/OrganicGrowth-Backups; ALWAYS pass an explicit scratch destination when trying this by hand):
npm run backup-media -- /tmp/some-scratch-dir
npm run backup-media -- /tmp/some-scratch-dir --verify
```

Baseline on `main` before this slice: 2310 tests / 575 suites, 0 fail.
**After this slice: 2409 tests / 597 suites, 0 fail.**

### Acceptance-criteria self-assessment

Mapped against the issue's checklist, per the coordinator's scope narrowing (two boxes explicitly
NOT this branch's job — see Known Limits):

| # | Acceptance criterion | In scope here? | Proof |
|---|---|---|---|
| 1 | `.agents/mcp_config.json` untracked and ignored; no tracked file contains a credential | **No** (coordinator scope change) | See Known Limits |
| 2 | Zoho Social credential rotated, scope confirmed, finding posted on the issue | **No** (Operator action) | See Known Limits |
| 3 | Every MCP server's credentials read from an untracked local config or env var; servers still connect | **No** (coordinator scope change) | See Known Limits |
| 4 | An automated check fails when a credential-shaped string appears in a tracked file, runs as part of the test suite | **Yes** | `src/secrets-scan/scanner.test.ts` (21 tests: the historical shape, every real false-positive shape checked by hand against this repo, the named-secret-field pattern, redaction/fingerprinting, binary detection); `src/secrets-scan/tracked-files.test.ts` (7 tests, real temp `git` repo, proves `git ls-files`-driven, not a working-tree walk); `src/secrets-scan/historical-incident.test.ts` (2 tests, the REAL `bb955eb`/`8f7c8f6` commit content via `git show`, no literal secret in source) — all run under `npm test`'s `src/**/*.test.ts` glob |
| 5 | A backup command copies every media file referenced by both Brands' ledgers, plus the produced-media tree, to a durable location outside this working folder | **Yes** | `src/media-backup/backup-runner.test.ts` (10 tests: ledger-referenced copy, produced-media-tree copy, union-dedup, per-Brand discovery via `listBrands`, absolute-path-outside-repoRoot handling, `process.cwd()`-independence); `src/media-backup/destination.ts`/`.test.ts` (12 tests: `~/OrganicGrowth-Backups` default, argument/env override, no hardcoded personal path) |
| 6 | The backup writes a manifest listing each file with checksum and size, and reports a per-Brand count of files copied | **Yes** | `src/media-backup/manifest.ts`/`.test.ts` (9 tests); `backup-runner.test.ts`'s "writes a manifest.json with checksum + size per entry" test; `src/commands/backup-media.test.ts`'s "reports per-Brand counts" test |
| 7 | Ledger media paths pointing at files that no longer exist are LISTED in the report, not skipped silently; the issue says 8 — verify and report what's actually found | **Yes** | `backup-runner.test.ts`'s "lists a ledger media path pointing at a file that does not exist" test (unit proof); **verified against the real ledgers, read-only, twice** (once early in the build, once again just before writing this report): `data/brands/straw-motion/ledger.json` has exactly **8** unique media paths pointing at files that do not exist on disk — all under the `news-short-script` Recipe, `unhypped-daily/2026-W33/friday-14-august`, all recorded as absolute paths. `data/brands/mundotip/ledger.json` has **0** (it has no media path references at all yet). The issue's stated count of 8 is correct. |
| 8 | The backup is verifiable: a re-run/verify mode checks the manifest against the backup and reports zero mismatches | **Yes** | `src/media-backup/verify-runner.test.ts` (5 tests: zero mismatches fresh, checksum-mismatch on corruption, missing-at-destination, clear error with no manifest, empty manifest); `backup-media.test.ts`'s two `--verify` tests |

### Fakes / fixtures used

- **No Magnific fake needed and none used.** This slice touches no `src/space-driver/`, no
  `src/producer/`, no Magnific SDK/tool call and no live Zoho MCP call anywhere — confirmed by `grep
  -rn "spaces_\|creations_\|zoho\|magnific" src/secrets-scan src/media-backup src/commands/backup-media.ts`: the only matches are the literal string `"zohomcp.com"` inside `scanner.ts`'s own docstring
  (describing the real incident's URL SHAPE) and inside two `secrets-scan` tests' synthetic fixture
  URLs (reproducing that same shape for detection tests) — inert string data, never an actual tool
  call, MCP client, or network access. Pure local filesystem + `git` introspection throughout.
- Every `media-backup` test uses `mkdtemp`-created temp directories and hand-written fixture
  `ledger.json` files (never the real `data/brands/*/ledger.json`).
- Every `secrets-scan` unit test uses synthetic, clearly-fake secret values (never the real historical
  credential's text). `tracked-files.test.ts` builds a disposable temp `git` repository per test run
  (`git init` in a `mkdtemp` dir) with synthetic fixtures, never this repository itself.
  `historical-incident.test.ts` is the one place real repository history is read — via `git show
  <sha>:<path>`, a local, read-only, hermetic operation (no network, no live service) — to prove
  detection against the real incident without ever writing its value into source.
- One manual (non-`npm test`) CLI smoke check was run against this worktree's own real, tracked
  `straw-motion`/`mundotip` ledgers, output verified, then the scratch destination deleted. It
  surfaced a real, useful finding — see Self-review notes below — and confirmed no write ever touches
  a ledger, only reads plus writes to the chosen scratch destination.

### Self-review notes

- Removed a dead, half-finished computation in `backup-media.ts` (an unused `perBrandCounts`/
  `perBrandMissingCounts` call built from synthetic placeholder entries) left over from an earlier
  draft — `describeBackup` already has everything it needs from `BackupRunResult.brands` directly.
- Removed an unused `stat` import (and the awkward `void stat;` placeholder that briefly stood in for
  it) from `verify-runner.ts`.
- Removed an unused `mkdir` import from `tracked-files.test.ts`.
- Fixed a doc-comment `*/` inside `scanner.ts`'s own module docstring that silently truncated the
  comment and broke the TypeScript parse (`data/brands/*/ledger.json` → `data/brands/<slug>/
  ledger.json`) — caught immediately by the first test run, not shipped.
- **A real correctness gap found via manual smoke-testing, fixed and covered by a new test**: running
  `/backup-media` against this worktree's own real ledger surfaced that a relative `brandsRoot`
  combined with an explicit, different `repoRoot` would have been resolved inconsistently (the
  produced-media tree walk implicitly followed `process.cwd()`, while ledger-path resolution
  explicitly followed `repoRoot`). Fixed in `backup-runner.ts` by anchoring `brandsRoot` to `repoRoot`
  explicitly before deriving any Brand path. New test: `backup-runner.test.ts`'s "is independent of
  process.cwd()" case (`chdir`s to a third, unrelated directory and proves resolution still works).
  This same smoke run is ALSO what surfaced that some real `asset_paths` entries in the live Straw
  Motion ledger are recorded as absolute paths from a specific machine/checkout — exactly the shape
  `path-resolve.ts`'s `external/<brand>/` fallback exists for; added `backup-runner.test.ts`'s matching
  end-to-end test for that shape too, using a synthetic fixture (never the real path).

### Known limits

- **`.agents/mcp_config.json` untracking, the credential-rotation finding, and the "MCP servers read
  from untracked/env config" criterion are NOT covered by this branch** — the Operator decided
  mid-build to undo the whole Antigravity migration on a separate branch (deleting `.agents/`,
  restoring `.claude/`), and this branch was told not to fight that work. The Operator has separately
  rotated the Zoho Social credential dead in Zoho's console; confirming the new credential's tool scope
  and posting that finding on the issue is an Operator action outside this branch's reach.
- **The credential scanner does not currently return zero findings if run against this repository's
  live tracked file set as-is**, because `.agents/mcp_config.json` is (deliberately, per the scope
  note above) still tracked here with the same credential-shaped string as of this branch — now
  rotated dead. This is NOT wired as a hard `npm test` assertion of "zero findings across the real
  repo" — only the pure-function/fixture proofs and the real-historical-incident proof are. Once the
  migration-undo branch lands (or this branch is rebased after it), a trivial follow-up test
  (`scanRepo(REPO_ROOT)` asserted empty) would close the loop for real; not added here to avoid
  either embedding the dead secret's text in source (blocked by this environment's own safety
  classifier when attempted) or building any path-based exception (explicitly ruled out by the
  coordinator).
- The named-secret-field pattern is a heuristic (key-substring + value-shape), not a parser or an
  entropy analysis — documented false-negative shapes are noted directly in `scanner.ts`'s own
  docstring (e.g. a bare 32-hex-digit UUID with dashes stripped, used as a CDN path id, would still
  match the url-path-token pattern; none exist in this repository today).
- The real ~800 MB production backup run against live data was never executed by this build (by
  design — hermetic, no large copies in tests) and remains the Operator's own run, by hand, separate
  from this slice.
- `copy.ts`/`checksum.ts` read a whole file into memory per copy/verify (mirrors every other durable
  media write in this codebase — `downloadAssetFiles`, `uploadTeleprompterScripts`), rather than
  streaming; fine for the Producer's actual per-file sizes (single-digit MB), not optimized for a
  hypothetical much larger single file.
