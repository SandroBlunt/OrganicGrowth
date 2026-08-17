## Why

Issue #233's own Round-1 QA Verdict found two residual holes in `src/store-write-boundary/` while
otherwise passing the slice: both were disclosed, non-blocking findings at the time, escalated forward as
this issue.

**Hole 1 — file-backed store writes fall between two individually-correct guards.**
`src/production-spec/store.ts` exports two write functions: SQL-backed `saveProductionSpec` (tracked by
#233's guard) and file-backed `saveSpec` (not tracked). `saveSpec` is invisible to *both* guards at once:
`store-write-boundary` (#233) excludes file-backed writes by design, matching `src/command-surface/`'s own
SQL-only scope; `fs-boundary` (#205) cannot see it either, because `production-spec/store.ts` is already on
that guard's own `node:fs` allow-list (`src/fs-boundary/allow-list.ts:29`, "already-the-store" category) —
so a *caller* of `saveSpec` never imports `node:fs` itself and never trips that ratchet. Neither guard is
wrong on its own terms; the hole is in the seam between them. It is not hypothetical:
`src/production-spec/compose.ts` calls `saveSpec` directly today, outside `src/command-surface/` —
dormant only because no production module calls `composeSpec` yet (confirmed:
`grep -rn "composeSpec" src --include='*.ts'` outside tests returns only its own definition).

**Hole 2 — namespace imports evade the detector.** `import * as store from "../idea/store.ts"` then
`store.createIdea(...)` is not caught; `scan.ts`'s regex only resolves named `import { a, b } from "..."`
sites. QA confirmed this is real and exploitable (independently reproduced during #233's own review), and
named it a residual, disclosed limitation rather than a defect in that slice's own delivered scope.

Both matter now specifically because #208, #210, and #211 are three new callers written by three separate
runs, and #211 in particular rewrites every agent onto typed commands — the widest surface, and per this
issue's own framing, the most likely place for a file-backed write to slip through.

## What Changes

- **`src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS`** gains `"saveSpec"` alongside
  `"saveProductionSpec"` for `src/production-spec/store.ts` — the only one of the 15 tracked store modules
  with a second, DISTINCTLY-named file-backed write function (verified: none of the other 14 import
  `writeFileAtomic`/`node:fs` at all). Unlike `AssetStore.writeAsset`'s ambiguous single-name-two-overloads
  shape, `saveSpec` poses no such ambiguity, so it can be named exactly like a SQL-backed write.
- **`scan.ts` gains namespace-import detection** (`findNamespaceImportSites`, merged into
  `findStoreWriteImports`): a `import * as alias from "..."` site resolving to a tracked store module is
  treated as importing EVERY ONE of that store's write functions — a namespace import genuinely binds every
  export, so this is a literal reading of what got imported, not an approximation, and it avoids reopening
  a "which properties of the namespace object are actually called" scope-analysis problem a regex-based,
  no-AST detector cannot safely answer (see "Namespace imports: why 'all functions,' not a call-site grep,"
  below).
- **`src/production-spec/compose.ts`'s existing direct `saveSpec` call is allow-listed**, not routed onto
  `src/command-surface/` — that surface's own spec Requirement fixes its shape to "an already-open,
  already-migrated `DatabaseSync` as its first argument" (`openspec/specs/command-surface/spec.md`), and
  `saveSpec` has no `db` parameter at all; wrapping it there would violate that Requirement, not satisfy
  it. `compose.ts` **is** the orchestration shell that owns the write-gate (generate → validate →
  brand-safety scan → save) for the file-backed Spec — it is the boundary itself, the same relationship
  `src/command-surface/` has to the SQL-backed stores it wraps — not a caller reaching around one.
  Migration tracked as issue #238 (filed by this change), pointed at from the allow-list entry itself.
- **Two new tests proving each new detection actually fails on a violating module** (issue's own explicit
  requirement, echoing #197's first-round rejection for a scanner only ever observed passing against
  fixtures): `scan.test.ts` gains an in-memory fixture matching a hypothetical NEW module (not `compose.ts`)
  importing `saveSpec` directly, and one matching the issue's own quoted namespace-import shape
  (`import * as store from "../idea/store.ts"` then `store.createIdea(...)`) — both asserted as detected.
  Both were ALSO independently reproduced against real, live, throwaway probe files during this build
  (added, run against `store-write-guard.test.ts`, confirmed to fail naming the exact violation, then
  deleted — never committed; the in-memory fixtures are the permanent proof, mirroring #233's own
  `scan.test.ts`/live-probe split exactly).
- **The allow-list gains one entry** (`src/production-spec/compose.ts` → `src/production-spec/store.ts` →
  `saveSpec`), individually reasoned, following #233's own audit style; its top-of-file comment is
  corrected from "two" to "three" pre-existing test/crash fixtures (a pre-existing staleness from #209's
  `crash-schedule-worker.ts` entry, not introduced by this change, tidied while already touching this
  file's header).
- **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`) gains one sentence naming both extensions,
  pinned by a new `describe` block in `src/db/adr.docs-test.ts`, mirroring #233's own docs-accuracy
  precedent exactly.
- **A new GitHub issue, #238**, tracks migrating `compose.ts`'s `saveSpec` call off the allow-list once a
  production caller of `composeSpec` exists (most likely #211).

## Namespace imports: why "all functions," not a call-site grep

The alternative design — grep for `alias.functionName(` call sites once a namespace import is found, so
only the ACTUALLY-called write functions are reported — was considered and rejected. A namespace import's
whole exposure is the alias binding every export; a caller could equally write
`const fn = store.createIdea; fn(...)`, aliasing the specific function reference before calling it, which a
call-site grep would miss entirely — the exact same class of evasion issue #235 exists to close, one layer
deeper. Reporting every one of the store's write functions for any namespace import of it is therefore not
an over-approximation to be apologized for: it is the only sound reading available to a detector that
deliberately does not parse an AST or track aliasing (the same "no parsing, no AST" choice
`fs-boundary/scan.ts` already made, restated here for a new pattern). Verified before implementing: zero
files in `src/` use `import * as X` against any of the 15 tracked store modules today (the sole
namespace-import site in the whole repo, `src/commands/run-pipeline.ts`, targets `node:readline`) — so this
extension needs no new allow-list entries and lands as a ratchet, exactly like #233's own guard did.

## compose.ts: allow-list now, not a command-surface wrapper

Two options were on the table (this issue's own AC1): route `compose.ts` onto `src/command-surface/`, or
allow-list it with a stated reason and a migration ticket. Routing was rejected because it does not fit —
`src/command-surface/`'s own spec Requirement ("A typed command surface exposes the pipeline's write
operations as plain functions over the stores") fixes every function's shape to take "an already-open,
already-migrated `DatabaseSync` as its first argument," and `saveSpec` is async, file-backed, and has no
`db` parameter. A command-surface wrapper around it would either violate that Requirement or require
redesigning the surface's own contract — genuine scope creep for this ticket, and a decision #211 (which
actually needs to call `composeSpec` from production) is better placed to make once it knows its own
shape. Allow-listing `compose.ts` today, with issue #238 tracking the real migration, keeps this ticket
scoped to "make the bypass visible and explained," per the issue's own instruction — not "redesign the
command surface's contract."

## Known gaps, decided, not dropped

- **The regex-based detector still cannot distinguish comment context from code context** — a literal,
  syntactically-real `import * as alias from "..."` (or a named-import equivalent) written out inside a
  doc comment would itself be matched as a violation. Found live while drafting this change's own doc
  comments (`scan.ts`'s top-of-file comment originally spelled out the issue's own example verbatim, which
  self-flagged `src/store-write-boundary/scan.ts` as a namespace-import violation of `src/idea/store.ts`
  when the disk-walking guard ran) — fixed by describing shapes in prose rather than reproducing them, and
  stated here as a disclosed limitation rather than a silent one. This is the same "no parsing, no AST"
  trade-off `fs-boundary/scan.ts` and #233's own `scan.ts` already accepted; #235 does not introduce it,
  it re-discovers it for a new pattern.
- **A namespace import of a store used ONLY for reads is still flagged as if it imported every write
  function too** — the accepted cost of "all functions, not a call-site grep" above. No live occurrence
  exists today (zero namespace imports of any tracked store), so this is a forward-looking trade-off, not
  a current false positive; if it becomes one, the allow-list mechanism handles it with a stated reason,
  same as any other exception.
- **`saveSpec` is the only file-backed write function this change adds** — not a blanket "every file write
  is now guarded." `ledger.json` (`src/ledger/ledger.ts`) and `data/queue.json`
  (`src/production-queue/store.ts`) are pre-SQL, always-rule-7-mandated files the pipeline is EXPECTED to
  write directly (rule 7: "update the Brand's `ledger.json` on every status change") — a materially
  different, already-covered-elsewhere category (the live `ledger.json` write path already runs through
  `AssetStore.writeAsset`'s file-backed overload, itself already tracked and allow-listed) from a SQL-
  migration-era store's own second, distinctly-named file-backed write function. Verified: no other of the
  15 `STORE_WRITE_FUNCTIONS` entries has a second file-backed write sibling today.

## Capabilities

### Modified Capabilities

- `store-write-boundary-guard`: now also names a tracked store's file-backed write function (when one
  exists under a distinct export name) and resolves a namespace import as importing every one of a tracked
  store's write functions.

## Impact

- **Modified code:** `src/store-write-boundary/{scan,allow-list}.ts`,
  `src/store-write-boundary/scan.test.ts`, `.claude/rules/always/organicgrowth-rules.md`,
  `src/db/adr.docs-test.ts`.
- **New:** `openspec/changes/issue-235-guard-residual-holes/` (this change).
- **Untouched:** `src/store-write-boundary/store-write-guard.test.ts` (the disk-walking test itself needed
  no changes — it already asserts against whatever `findStoreWriteImports` + the allow-list produce),
  `src/command-surface/**`, `src/fs-boundary/**`, every store's own operations, `src/ledger/ledger.ts`,
  `src/production-queue/store.ts`, and every real production module that reads/writes `ledger.json` or
  `data/queue.json`.
- **A new GitHub issue filed:** #238 (`Migrate compose.ts's Production Spec write off the store-write-
  boundary allow-list`), referenced from `allow-list.ts`'s new entry.
- **Hermetic, no live Space/Apify/Zoho MCP calls.** `scan.test.ts` stays pure, in-memory only; the two
  live-added-and-removed probe files used to independently verify the disk-walking guard fails (see "What
  Changes," above) imported only `node:path`-free, non-MCP store modules and were deleted before this
  change was committed.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics-scraping code.
  Ledger-as-source-of-truth is unaffected — `saveSpec`'s new tracking closes a gap in a DIFFERENT rule (the
  store-write boundary #233 exists to defend), not the ledger-as-source-of-truth rule itself, which this
  guard has never covered and still does not.
