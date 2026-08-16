## Why

Two one-way doors, both getting more expensive daily (issue #197, parent #195):

1. A migration commit (`bb955eb`, then touched again in `8f7c8f6`) committed a live Zoho Social MCP
   bearer token as a URL path segment inside the tracked `.agents/mcp_config.json`. Both commits sit
   on local `main`, unpushed. Nothing today would stop a THIRD commit from reintroducing the same
   shape (in `.agents/`, or anywhere else a future agent-harness migration decides to put its config).
2. The ~800 MB of produced media the ledgers point at exists in exactly one place on one machine, with
   no backup and no history. None of it is tracked in git (`data/brands/<slug>/ideas/**/*.output/` and
   `*.assets/` are gitignored by design — issue #112). A disk failure loses it permanently.

**Scope note (mid-build correction from the coordinator, 2026-08-16/17):** this slice does **not**
untrack `.agents/mcp_config.json` or touch `docs/zoho-mcp-server-setup.md`. The Operator decided,
after this slice was already underway, to undo the whole Antigravity migration on a separate branch —
deleting `.agents/` entirely and restoring `.claude/` — so fixing that file's tracking status here
would fight that branch's own work. The credential has also since been rotated dead in Zoho's console
(Operator action), which lifted the original "do not push" freeze on this repository generally, but
this branch specifically still does not push (the sequencing of the two branches is the coordinator's
job). What stays firmly in THIS slice's scope, unaffected by that correction, is the automated
credential scanner (made deliberately harness-agnostic: no `.agents/`-specific logic anywhere) and the
whole media backup command.

## What Changes

- **A credential-shaped-string scanner** (`src/secrets-scan/`), wired into `npm test`, that fails when
  a tracked file (via `git ls-files`, never a raw working-tree walk) carries a string shaped like a
  live secret. Two independently-tested patterns: a long hex run standing alone as a URL PATH segment
  (the exact shape of the real incident — a bearer token embedded in an MCP server URL), and a JSON
  `"<key>": "<value>"` pair whose key names something secret-shaped and whose value is long and
  un-placeholder-shaped. Calibrated against every currently tracked file in this repository to keep
  the false-positive rate at zero today (documented in `scanner.ts`'s own docstring: Magnific creation
  identifiers and `asset_url` CDN query-string HMAC signatures in the ledgers, git commit SHAs in
  `openspec/` prose, and a real Webflow CDN asset id in a sourced `media_url` all correctly do NOT
  match). No allowlist of any path or directory exists anywhere in this scanner — every tracked file
  is scanned the same way, so a future harness leaking a secret into a *different* directory is still
  caught.
- **Proof against the real historical incident, without ever writing the real secret's text into this
  repository's source**: `historical-incident.test.ts` reads the actual committed content of
  `.agents/mcp_config.json` at commits `bb955eb`/`8f7c8f6` via `git show <sha>:<path>` AT TEST RUN
  TIME and asserts the scanner catches it — the literal value never appears as source text anywhere in
  this change. `scanner.test.ts` additionally proves detection/non-detection against a full set of
  synthetic fixtures reproducing every real shape found in this repository (the historical shape, the
  ledger HMAC/identifier shapes, the Webflow CDN-id shape, the git-SHA-in-prose shape, and the
  named-secret-field shape).
- **A backup command** (`/backup-media`, `src/commands/backup-media.ts` + `src/media-backup/`) that
  copies, for every Brand (discovered via `listBrands` — not a hardcoded pair, so a future third Brand
  is covered automatically), the UNION of every media file its ledger references (`asset_paths`, Cast
  candidate `path`s) and its whole produced-media tree (every file under any `.output`/`.assets`
  bundle directory, including files the ledger never references individually — a `caption.txt`, a
  superseded slide) to a durable destination outside this working folder. The destination defaults to
  `~/OrganicGrowth-Backups` (`~` expanded against the real home directory at run time — never a
  hardcoded personal path anywhere in source), overridable by a CLI argument or the `MEDIA_BACKUP_DEST`
  env var.
- **A manifest** (`<destination>/manifest.json`) listing every copied file's Brand, backup-relative
  path, SHA-256 checksum, and byte size, and a `--verify` mode that re-digests the destination against
  that manifest and reports zero mismatches (or names exactly which files are missing/corrupted).
- **Ledger media paths pointing at a file that no longer exists are LISTED in the run's report** (per
  Idea/Recipe/raw-path), never silently skipped. Verified against the real ledgers (read-only, never
  committed as a fixture): exactly 8 such paths exist today, all under Straw Motion's
  `news-short-script` Recipe (`2026-W33/friday-14-august`), all recorded as absolute paths from the
  Operator's own machine rather than the usual repo-relative shape — matching the issue's own count.
- **A both-relative-and-absolute ledger path resolver** (`src/media-backup/path-resolve.ts`): a
  relative ledger path resolves against the repo root as usual; an already-absolute one (the shape
  behind those 8 missing paths, and behind a handful of other real, EXISTING records too) is honored
  as-is; a file that resolves outside the given repo root gets a collision-safe, brand-namespaced
  backup key (`external/<brand>/<fingerprint>-<basename>`) rather than an in-tree mirror that would
  make no sense for it. Proven against a synthetic fixture reproducing this exact real shape.

## Non-Goals (explicitly out of scope for this slice)

- **Untracking `.agents/mcp_config.json`, or any edit to `docs/zoho-mcp-server-setup.md`.** Deferred
  to the separate, already-in-flight migration-undo branch (see the "Why" scope note above).
- **Zoho Social credential rotation and its scope confirmation.** A real-world action in the Zoho
  console that only the Operator can perform; noted in the Build Report's Known Limits.
- **Live Magnific or Zoho MCP calls of any kind.** This slice is pure local filesystem + `git`
  introspection; hermetic throughout.
- **Running the real ~800 MB backup against live data.** That is the Operator's own run, by hand,
  separate from this build; every test here uses temp directories and tiny fixture files.

## Capabilities

### Added Capabilities

- `secrets-scan`: the pure credential-shaped-string detector, the `git ls-files`-driven I/O shell, and
  the real-historical-incident proof — wired into `npm test`.
- `media-backup`: ledger media reference collection, produced-media tree discovery, path resolution
  (relative/absolute/out-of-tree), checksum + copy, the manifest shape and verify-diff logic, the
  destination resolver, the backup + verify orchestration runners, and the `/backup-media` command.

## Impact

- **New code:** `src/secrets-scan/scanner.ts` (+`.test.ts`), `src/secrets-scan/tracked-files.ts`
  (+`.test.ts`), `src/secrets-scan/historical-incident.test.ts`; `src/media-backup/ledger-media-refs.ts`
  (+`.test.ts`), `src/media-backup/path-resolve.ts` (+`.test.ts`),
  `src/media-backup/produced-media-tree.ts` (+`.test.ts`), `src/media-backup/checksum.ts` (+`.test.ts`),
  `src/media-backup/copy.ts` (+`.test.ts`), `src/media-backup/manifest.ts` (+`.test.ts`),
  `src/media-backup/destination.ts` (+`.test.ts`), `src/media-backup/backup-runner.ts` (+`.test.ts`),
  `src/media-backup/verify-runner.ts` (+`.test.ts`), `src/commands/backup-media.ts` (+`.test.ts`).
- **Modified code:** `package.json` — the new `backup-media` script, in the style of every other
  granular command.
- **Hermetic, no live Space or Zoho MCP calls anywhere.** Every test in both new modules runs against
  temp directories, synthetic fixture ledgers, and (for the scanner) a disposable temp `git` repo or
  synthetic in-memory fixtures — never the real ~800 MB corpus, and the one place real historical git
  content is read (`historical-incident.test.ts`) is a read-only `git show` against this repository's
  own already-existing history, not a live external call.
- **Always-rules upheld:** generate-never-publish/public-metrics-only/relative-not-absolute/explicit-
  attribution are untouched (this slice touches no content-generation or metrics code at all);
  ledger-as-source-of-truth is upheld by construction — the backup command only ever READS the ledger
  (via the same typed `loadIdeas` reader every other command uses) and never writes to it.
