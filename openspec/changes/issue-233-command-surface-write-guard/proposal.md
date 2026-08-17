## Why

Issue #205's own AC2 says "the command surface is the only thing that writes" — true the day it landed
(verified by grep at both ends of that ticket), but never enforced. QA's Round-1 review of #205 proved
the gap live: it added a throwaway module importing `createTrend` from `src/trend/store.ts` directly,
bypassing `src/command-surface/` entirely, and the **full 3100-test suite passed with zero failures**.
The `node:fs` ratchet (`src/fs-boundary/`) cannot see this class of bypass — it never touches `node:fs`
at all.

That gap was harmless while nothing called the SQL stores' write functions except two documented test
fixtures. It stops being harmless the moment #208's worker, #210's viewer, and #211's agent rewrite each
add a new caller — three separate runs, each with the same available shortcut: import the store
directly and skip the surface. #205's own handoff (Round-1 Verdict, defect #2) names exactly this as
the thing to close "before or alongside #208," reusing `src/fs-boundary/scan.ts`'s own detection
pattern (an import/require SITE match, never a bare substring search) against a different target.

## What Changes

- **A new `src/store-write-boundary/` module**, mirroring `src/fs-boundary/`'s three-file ratchet shape
  exactly — same split, new target:
  - `scan.ts` — a PURE deep module. `STORE_WRITE_FUNCTIONS` names every SQL-backed (`db: DatabaseSync`
    first argument) domain store shipped by #201/#222/#223/#203, and, for each, its write-function
    export names only (never its reads — see "Reads vs writes," below). `findStoreWriteImports` walks
    already-read `(path, content)` pairs, matches a real named-import SITE (`import { name } from
    "specifier"`, resolving the specifier against the importing file's own path — never a bare substring
    search, and never a bare function-name grep either, since two unrelated modules in this repo already
    share a name across different files: `brand/resolver.ts`'s file-scanning `listBrands` is not
    `brand/store.ts`'s SQL-backed `listBrands(db)`), and reports which allow-listed store's write
    function(s) each non-test, non-`command-surface` file imports. `isTestPath`/`isCommandSurfacePath`
    exempt the store's own tests (any path containing `"test"`, matching the fs-boundary guard's own
    convention exactly) and the command surface itself.
  - `allow-list.ts` — `STORE_WRITE_BOUNDARY_ALLOW_LIST`, today's legitimate exceptions, each entry naming
    the importing file, the store module, the specific write function name(s), and a stated reason.
  - `store-write-guard.test.ts` — the one place this check touches disk (mirrors
    `node-fs-guard.test.ts` exactly): walks every `.ts` file under `src/`, asserts the found set of
    (file, store, function) triples is EXACTLY the allow-list's — both directions, so a new, un-audited
    bypass fails the build and a stale, over-claiming entry fails it too.
- **Landed as a ratchet**: the guard's first commit lands green against today's real, audited state (the
  short list below); there is no sweep needed this time — unlike #205's `node:fs` audit, every module
  found importing a store write function today is already a legitimate, individually-reasoned exception
  (the command surface itself, two pre-existing cross-store test fixtures, and five pre-#205 live callers
  of `AssetStore.writeAsset`'s file-backed overload) — see "The audit," below.
- **A live-added, live-removed demonstration module** proving the guard actually fails (issue's own
  explicit requirement, and the exact defect #197's first round was rejected for): a throwaway file
  importing a store's write function directly, outside `src/command-surface/`, run against
  `store-write-guard.test.ts` to confirm a real failure naming it, then deleted — never left in the
  tree, mirrored as a permanent unit-level assertion in `scan.test.ts` instead (an in-memory fixture, not
  a real file on disk, so the proof survives without leaving a landmine in `src/`).
- **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`) gains one sentence naming the new guard,
  alongside its existing sentence about the `node:fs` guard.

## Reads vs writes — a decision, not an omission

**This guard covers writes only.** Reasoning:

- #205's own AC2 — the thing this ticket exists to enforce — is scoped to writes by its own words: "the
  command surface is the only thing that writes." No acceptance criterion, ADR, or rule anywhere claims
  reads must be exclusive to the command surface; `command-surface/trends.ts`'s own doc comment says a
  read "carries no atomicity concerns of its own" and lives there "so a future caller... reaches every
  pipeline operation, read or write, through ONE surface" — a tidiness preference, not a safety
  invariant.
- The actual risk a write bypass creates — two code paths racing to mutate the same row, an
  un-reviewed caller silently reintroducing inconsistent state, ledger-as-source-of-truth (always-rule 7)
  quietly losing its one writer — has no read-side equivalent. A read bypass can return stale-relative-to-
  a-transaction data at worst; it cannot corrupt anything.
- Concretely, today's codebase already has exactly one real, legitimate cross-store READ composition
  outside `command-surface`/tests: `src/idea/store.ts` imports `getTrend` from `src/trend/store.ts`
  (verified by reading both files' imports). Folding reads into this same guard would force that one
  case onto an allow-list for no safety gain, and — more importantly — would put every future READ
  `#208`/`#210`/`#211` write while composing their own domain logic under the same ratchet a WRITE bypass
  earns, diluting the guard's signal exactly the way the issue's own "a generous allow-list is how a
  ratchet becomes decoration" warns against.
- If a future slice demonstrates a real read-bypass risk (e.g. a viewer racing a write mid-transaction),
  `scan.ts`'s `STORE_WRITE_FUNCTIONS` map is a one-line-per-store change away from becoming
  `STORE_READ_FUNCTIONS` too — the detector itself is generic over which function names it is given.

## The audit

Every SQL-backed domain store shipped by #201/#222/#223/#203 was read in full
(`trend`, `idea`, `production-queue/job-store`, `production-queue/gate-request-store`, `asset`, `post`,
`performance`, `brand-asset`, `format`, `production-spec`, `channel`, `brand`, `copy`), its write-function
exports named (verbs: `create`/`accept`/`reject`/`select`/`claim`/`release`/`requeue`/`record`/`write`/
`add`/`save`/`update`/`upsert`/`set`), and every real (non-comment, non-doc-string) import of each was
found by grep, then read to confirm it is a genuine import site and not a name collision (`listBrands`
alone has two: `brand/resolver.ts`'s file-scanning version and `brand/store.ts`'s SQL-backed one — a bare
name search would have false-positived on this the same way a bare `node:fs` substring search would have
tripped on `scan.ts`'s own doc comment in #205). The result:

- **The command surface itself** (`src/command-surface/{ideas,jobs,assets,posts,performance}.ts`) —
  exactly what it exists to do; excluded from the guard by path (`src/command-surface/**`), not
  individually allow-listed.
- **Two pre-existing, documented test fixtures**, neither named `*.test.ts` so neither is exempted by
  `isTestPath` alone, both already named as AC2's own "pre-existing documented exceptions" in #205's
  handoff:
  - `src/db/fixtures/seed-chain.ts` — the shared brand → format → run → idea → asset (→ channel) seed
    chain five different stores' own test suites import; calls `createBrand`, `createFormat`,
    `createChannel`, and `writeAsset` (its `{ db }` overload) directly because it IS the fixture that
    seeds those tables, not a real pipeline caller.
  - `src/production-queue/fixtures/claim-worker.ts` — a concurrency-test fixture spawned as its OWN OS
    process by `claim-concurrency.test.ts`, calling the real `claimJob` (never a re-implemented copy)
    from a second process so two claims can genuinely race; not `*.test.ts`-named because `node --test`
    would otherwise try to run it directly as a suite, which it is not.
- **Five pre-#205 live production callers of `AssetStore.writeAsset`'s file-backed `{ ledgerPath }`
  overload** (`src/asset/attribution.ts`, `src/commands/{export-schedule,schedule-via-zoho-mcp,
  track-performance,upload-camera-hub-scripts}.ts`) — the SAME five #205's own QA verdict traced and
  confirmed all use the file-backed overload, never the SQL-backed one. `writeAsset` is one export name
  serving two overloads (positional `(ideaId, recipe, patch, { ledgerPath })` vs `(ideaId, recipe, patch,
  { db })`); a real-import-SITE detector cannot see which overload a given call site invokes without
  type-checking (out of scope, the same "no parsing, no AST" choice `fs-boundary/scan.ts` already made)
  — so every import of `writeAsset` outside `command-surface`/tests is treated as a candidate, and every
  one found is allow-listed with its overload stated explicitly. This is the live `ledger.json` write path
  (always-rule 7, ledger-as-source-of-truth) — pre-dating and untouched by #205's SQL-side migration.
- **Zero other violations.** Every other SQL-backed store's write functions (`acceptIdea`/`rejectIdea`/
  `selectIdeaRecipes`, `createJob`/`releaseJob`/`requeueJob`, `createGateRequest`/`recordGateDecision`,
  `addAssetMedia`/`addAssetMediaBatch`, `recordPost`/`updatePostTrackingState`, `recordMetricSnapshot`/
  `recordChannelBaseline`/`recordPerformanceScore`, `createBrandAsset`, `createFormat`/`updateFormat`,
  `saveProductionSpec`, `createChannel`/`setPrimaryChannel`, `updateBrand`, `upsertCopyVariant`/
  `upsertCopyVariants`) have no importer today outside their own store file, `command-surface/`, and
  test files — confirmed by reading every grep hit, not by trusting the count.

A `db.prepare(...).run(...)` raw-SQL insert against the `run`/`idea` tables also exists inside
`seed-chain.ts` itself (bootstrapping rows no store write function yet covers). This guard, like
`fs-boundary`'s, matches an **import site of a named function** — it cannot and does not attempt to catch
raw SQL issued from inside a test fixture; that is a materially different, much narrower risk (a fixture
seeding its own throwaway database, not a production caller reaching around the command surface) and is
named here so it is not mistaken for a blind spot in what this ticket was asked to close.

## Known gaps, decided, not dropped

- **No command wraps `Brand`/`Channel`/`Format`/`BrandAsset`/`CopyVariant`/`GateRequest`.** #205's own
  "Known limits" already named this; this guard does not change it. It DOES mean a first real caller of
  e.g. `createBrandAsset` has no command-surface function to call yet — that caller must either get a new
  command-surface wrapper added alongside it, or an allow-list entry with a stated reason; the guard will
  force that choice to be visible rather than silent either way.
- **`recordChannelBaseline`** (`src/performance/store.ts`) has no command-surface wrapper today even
  though its sibling writes (`recordMetricSnapshot`, `recordPerformanceScore`) do — an existing gap in
  #205's own coverage, not introduced here; noted so a future `/track-performance` SQL migration does not
  assume it is already covered.
- **The guard cannot see a bypass via `import * as store from "..."` namespace-import syntax**
  (`store.createBrand(...)`), only a named `import { createBrand } from "..."`. Verified by grep that no
  file in this repo imports any of the 13 target store modules that way today; the same limitation
  `fs-boundary/scan.ts` already accepts for `require`-vs-`import` spelling, stated rather than hidden.

## Capabilities

### Added Capabilities

- `store-write-boundary-guard`: `src/store-write-boundary/`'s automated, ratcheted check that only
  `src/command-surface/`, the stores' own tests, and an explicit, individually-reasoned allow-list of
  fixtures/pre-#205 callers may import a SQL-backed domain store's write function directly.

## Impact

- **New code:** `src/store-write-boundary/{scan,allow-list,store-write-guard}.ts` +
  `src/store-write-boundary/scan.test.ts`,
  `openspec/changes/issue-233-command-surface-write-guard/` (this change).
- **Modified code:** `.claude/rules/always/organicgrowth-rules.md` (one added sentence).
- **Untouched:** every store's own operations/return shapes, `src/command-surface/**` itself,
  `src/fs-boundary/**` itself, the four integration ports and their fakes, `src/ledger/ledger.ts` and
  every real production module that reads/writes `ledger.json`.
- **Hermetic, no live Space/Apify/Zoho MCP calls.** `scan.test.ts` is pure, in-memory only (mirrors
  `fs-boundary/scan.test.ts`); `store-write-guard.test.ts` only reads `.ts` files under `src/` off local
  disk, exactly like `node-fs-guard.test.ts`.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics-scraping
  code. Ledger-as-source-of-truth is the rule this guard directly defends going forward (a store-write
  bypass is exactly the shape of risk that rule exists to prevent once #204's importer runs); the guard
  itself changes no runtime behavior of any real command today.
