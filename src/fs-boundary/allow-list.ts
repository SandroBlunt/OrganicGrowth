/**
 * The `node:fs` allow-list — issue #205 AC7's ratchet guard.
 *
 * Every entry here was individually audited (the audit posted on issue #205; see also this change's
 * `proposal.md`) and given one of three verdicts: **moved behind a store** (removed from this list once
 * moved — see `git log` on this file for the shrink), **moved behind an existing port** (none of today's
 * violators needed this), or **legitimately direct, with a stated reason** (every entry remaining here).
 * `node-fs-guard.test.ts` asserts this list is EXACTLY the set of non-test production modules that import
 * `node:fs`/`node:fs/promises` today — no more (a new, un-audited violation would fail the build), and no
 * fewer (a stale entry that no longer imports `node:fs` would also fail the build, so this list can never
 * silently drift from reality in either direction).
 *
 * Grouped by the audit's own verdict category so a reader does not have to re-derive WHY each entry is
 * here — the full reasoning for each lives in this change's `proposal.md` and the issue #205 audit
 * comment; this file carries only the one-line pointer.
 */

export const NODE_FS_ALLOW_LIST: readonly string[] = [
  // --- Produced media / output-bundle writers: media stays on local disk (ADR-0029) -----------------
  "src/asset/carousel-real-media.ts",
  "src/asset/download.ts",
  "src/asset/news-short-script-output.ts",
  "src/asset/output-bundle.ts",
  "src/asset/shot-list-media.ts",

  // --- Already-the-store: the file-backed half of a store that ALSO exists (ADR-0029 carve-out) -----
  "src/brand-asset/store.ts",
  "src/format/store.ts",
  "src/production-spec/store.ts",

  // --- Foundational I/O primitives the (file-backed halves of) stores are built on ------------------
  "src/brand/resolver.ts",
  "src/db/connection.ts",
  "src/fs/safe-io.ts",

  // --- Documents ADR-0029 explicitly names as staying files (Brand Profile / Format / Baseline Prompt /
  //     Mention Handle Registry / a hand-maintained seeds.yaml of the same class) -------------------
  "src/commands/run-pipeline-readiness.ts",
  "src/commands/track-performance.ts",
  "src/format/baseline-prompt.ts",
  "src/mention-handle/store.ts",
  "src/production-spec/brand-profile.ts",

  // --- Reads a produced Asset's own on-disk artifact (never duplicated store data) -------------------
  "src/commands/upload-camera-hub-scripts.ts",

  // --- New-Brand bootstrap: two permanently-file documents plus the still-transitional file ledger ---
  "src/brand/scaffold-brand.ts",

  // --- Third-party desktop app's own storage — explicitly out of the store boundary (epic #195) ------
  "src/camera-hub/upload.ts",

  // --- Generated export/scratch artifacts; the actual ledger write already goes through AssetStore ---
  "src/commands/export-schedule.ts",
  "src/commands/schedule-via-zoho-mcp.ts",

  // --- Phase-00 media backup/verify tool: raw byte copy/checksum/walk, not domain store data ---------
  "src/media-backup/backup-runner.ts",
  "src/media-backup/checksum.ts",
  "src/media-backup/copy.ts",
  "src/media-backup/produced-media-tree.ts",
  "src/media-backup/verify-runner.ts",

  // --- Test/fixture support and deferred, never-`npm test`-exercised live-adapter code ---------------
  "src/media-host/fixtures/tiny-png.ts",
  "src/media-host/live/env.ts",
  "src/media-host/live/smoke.ts",
  "src/space-driver/live/replay/transport.ts",

  // --- Schedule Batch's own manifest housekeeping — explicitly separate from the ledger ---------------
  "src/schedule-batch/cleanup-runner.ts",

  // --- The CI credential scanner: reads arbitrary git-tracked files, unrelated to domain stores -------
  "src/secrets-scan/tracked-files.ts",
] as const;
