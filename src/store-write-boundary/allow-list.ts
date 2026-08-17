/**
 * The store-write boundary allow-list — issue #233's ratchet guard, following up on #205's own AC2:
 * "the command surface is the only thing that writes." Extended by issue #235 to also cover a store's
 * file-backed write functions (see `scan.ts`'s own doc comment) and namespace imports.
 *
 * Every entry here was individually audited (`proposal.md`'s "The audit", #233's own, plus #235's own)
 * and is one of three verdicts: **a pre-existing, documented test/crash fixture** that legitimately needs
 * direct access (a store's own tests are already exempted by `isTestPath`; these three are NOT named
 * `*.test.ts`, so they need an explicit entry), **a pre-#205 live production caller** of
 * `AssetStore.writeAsset`'s file-backed `{ ledgerPath }` overload — the live `ledger.json` write path,
 * untouched by and pre-dating #205's SQL-side migration — or **a file-backed write's own orchestration
 * shell** (issue #235; today, `src/production-spec/compose.ts` — see its entry below for the full
 * reasoning). `store-write-guard.test.ts` asserts this list is EXACTLY the set of non-test,
 * non-`command-surface` modules that import a store write function today — no more (a new, un-audited
 * bypass fails the build), and no fewer (a stale entry that no longer imports that function also fails
 * the build, so this list can never silently drift from reality in either direction).
 *
 * No genuine store-write bypass was found by either ticket's audit — unlike #205's `node:fs` sweep, there
 * is nothing to move behind `src/command-surface/` here; every entry below is a legitimate, individually
 * reasoned exception, not a violation waiting to be fixed.
 */

import type { StoreWriteImport } from "./scan.ts";

export const STORE_WRITE_BOUNDARY_ALLOW_LIST: readonly StoreWriteImport[] = [
  // --- Cross-store SQL seed fixture: NOT *.test.ts-named, imported by 5 different stores' own test
  //     suites (job-store, gate-request-store, claim-concurrency, post/store, performance/store) to seed
  //     the brand -> format -> run -> idea -> asset (-> channel) chain those tests need. Calls the real
  //     writers because it IS the fixture that populates those tables, not a pipeline caller. ------------
  { path: "src/db/fixtures/seed-chain.ts", store: "src/brand/store.ts", functions: ["createBrand"] },
  { path: "src/db/fixtures/seed-chain.ts", store: "src/channel/store.ts", functions: ["createChannel"] },
  { path: "src/db/fixtures/seed-chain.ts", store: "src/format/store.ts", functions: ["createFormat"] },
  {
    path: "src/db/fixtures/seed-chain.ts",
    store: "src/asset/store.ts",
    // Uses writeAsset's SQL-backed `{ db }` overload, to seed the one Asset row its callers' tests need.
    functions: ["writeAsset"],
  },

  // --- Concurrency-test fixture: NOT *.test.ts-named (node --test would otherwise try to run it as a
  //     suite, which it is not) — spawned as its OWN OS process by claim-concurrency.test.ts, calling the
  //     REAL claimJob (never a re-implemented copy) so two sibling processes can genuinely race for the
  //     same job. ------------------------------------------------------------------------------------
  {
    path: "src/production-queue/fixtures/claim-worker.ts",
    store: "src/production-queue/job-store.ts",
    functions: ["claimJob"],
  },

  // --- Crash-simulation fixture (issue #209): NOT *.test.ts-named, same category as claim-worker.ts
  //     immediately above — spawned as its OWN OS process by crash-recovery.test.ts, calling the REAL
  //     reserveScheduleOutboxEntry (never a re-implemented copy) so a genuine process crash can be
  //     simulated between reserve and confirm. It deliberately never calls confirmScheduleOutboxEntry —
  //     that is the whole point of the fixture (a crash never gets there) — so only reserve is listed. ---
  {
    path: "src/schedule-outbox/fixtures/crash-schedule-worker.ts",
    store: "src/schedule-outbox/store.ts",
    functions: ["reserveScheduleOutboxEntry"],
  },

  // --- Pre-#205 live production callers of AssetStore.writeAsset's FILE-BACKED `{ ledgerPath }`
  //     overload — the live ledger.json write path (always-rule 7, ledger-as-source-of-truth),
  //     pre-dating and untouched by the SQL-side migration. `writeAsset` is one export name serving two
  //     overloads; a real-import-SITE detector cannot tell which overload a call site invokes without
  //     type-checking, so every import of it is a candidate — each of these five was individually
  //     confirmed (by reading its actual call site) to pass `{ ledgerPath }`, never `{ db }`. ------------
  { path: "src/asset/attribution.ts", store: "src/asset/store.ts", functions: ["writeAsset"] },
  { path: "src/commands/export-schedule.ts", store: "src/asset/store.ts", functions: ["writeAsset"] },
  { path: "src/commands/schedule-via-zoho-mcp.ts", store: "src/asset/store.ts", functions: ["writeAsset"] },
  { path: "src/commands/track-performance.ts", store: "src/asset/store.ts", functions: ["writeAsset"] },
  {
    path: "src/commands/upload-camera-hub-scripts.ts",
    store: "src/asset/store.ts",
    functions: ["writeAsset"],
  },

  // --- The file-backed Production Spec write's own orchestration shell (issue #235) -------------------
  //     composeSpec IS the write-gate for the file-backed Spec (generate -> validate -> brand-safety scan
  //     -> save) — it is the boundary itself, not a caller reaching around one, the same relationship
  //     src/command-surface/ has to the SQL-backed stores it wraps. It is not routed onto
  //     src/command-surface/ because that surface's own spec Requirement fixes its shape to "an
  //     already-open, already-migrated DatabaseSync as its first argument" (openspec/specs/command-
  //     surface/spec.md) — saveSpec has no `db` parameter at all, so wrapping it there would violate that
  //     Requirement, not satisfy it. composeSpec has ZERO production callers today (confirmed:
  //     `grep -rn "composeSpec" src --include='*.ts'` outside tests returns only this file's own
  //     definition) — a dormant pairing, not a live bypass. Tracked for migration once something starts
  //     calling composeSpec in production (most likely issue #211's agent rewrite): issue #238. ----------
  { path: "src/production-spec/compose.ts", store: "src/production-spec/store.ts", functions: ["saveSpec"] },
] as const;
