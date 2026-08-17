# Slice Handoff — issue #233: guard the command surface itself

## Build Report

### What changed

A second ratchet guard, mirroring `src/fs-boundary/`'s exact shape (`scan.ts` + `allow-list.ts` + a
disk-walking guard test), closing the gap #205's own Round-1 QA verdict demonstrated live: a throwaway
module importing a SQL-backed store's write function directly, bypassing `src/command-surface/`
entirely, passed the full 3100-test suite with zero failures.

1. **`src/store-write-boundary/scan.ts`** — a PURE deep module. `STORE_WRITE_FUNCTIONS` names every
   SQL-backed (`db: DatabaseSync` first-argument) domain store shipped by #201/#222/#223/#203 (13 store
   modules), each mapped to its write-function export names ONLY — never a read. `findStoreWriteImports`
   walks already-read `(path, content)` pairs and matches a real named-import SITE, resolving the import
   specifier against the importing file's own path to the actual store module it points at — never a bare
   substring search (which would false-positive on a doc comment mentioning a write function's name) and
   never a bare function-name search either (this repo genuinely has a name collision:
   `brand/resolver.ts`'s file-scanning `listBrands` vs `brand/store.ts`'s SQL-backed `listBrands(db)`).
   `isTestPath`/`isCommandSurfacePath` exempt the stores' own tests and `src/command-surface/` itself.
2. **`src/store-write-boundary/allow-list.ts`** — `STORE_WRITE_BOUNDARY_ALLOW_LIST`, 10 entries covering
   today's legitimate exceptions: two pre-existing, documented cross-store test fixtures
   (`src/db/fixtures/seed-chain.ts`, `src/production-queue/fixtures/claim-worker.ts` — both already named
   in #205's own handoff as "pre-existing documented exceptions"), and five pre-#205 live production
   callers of `AssetStore.writeAsset`'s file-backed `{ ledgerPath }` overload (`writeAsset` is one export
   name serving two overloads; a real-import-SITE detector cannot tell which overload a call site invokes
   without type-checking, so every import of it is a candidate, and each of these five was individually
   confirmed by reading its actual call site). Every entry states its store, function(s), and — via a
   grouped comment block — its reason, matching #205's own audit style.
3. **`src/store-write-boundary/store-write-guard.test.ts`** — the one place this check touches disk:
   walks every `.ts` file under `src/`, asserts the found (file, store, function) triples are EXACTLY the
   allow-list's, both directions (flattened to per-function keys, so a partial mismatch — an entry
   claiming a function that isn't actually imported, or vice versa — is caught too, not just "this file
   is on the list somewhere"). Picked up automatically by `npm test`'s existing
   `"src/**/*.test.ts"` glob, same as `node-fs-guard.test.ts` and `src/secrets-scan/`'s own scanner tests.
4. **`src/store-write-boundary/scan.test.ts`** — pure, in-memory unit tests for the detector: a real
   import site matched and resolved; a doc-comment mention NOT matched; a bare-name collision (the
   `listBrands` case) NOT matched; a read-function import NOT matched; multi-function single-store
   imports combined correctly; `src/command-surface/` and test paths excluded; and a permanent, in-memory
   encoding of the exact shape the live-demonstrated violation took (see "Acceptance-criteria
   self-assessment," AC4).
5. **Audit finding: zero genuine bypasses today.** Unlike #205's `node:fs` sweep, there is nothing to
   move behind `src/command-surface/` — every real import found is one of the 10 allow-listed exceptions
   above. Full per-module reasoning is in `proposal.md`'s "The audit."
6. **A recorded decision: this guard covers writes only, never reads.** Reasoning in `proposal.md`'s
   "Reads vs writes" and encoded as its own spec Requirement (`specs/store-write-boundary-guard/spec.md`).
7. **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`) gains one sentence naming the new guard,
   alongside its existing `node:fs` guard sentence; pinned by a new `describe` block in
   `src/db/adr.docs-test.ts`, mirroring #205's own docs-accuracy precedent exactly.

### Files touched

**New:**
- `src/store-write-boundary/{scan,allow-list,store-write-guard}.ts` + `src/store-write-boundary/scan.test.ts`
- `openspec/changes/issue-233-command-surface-write-guard/` (this change: `proposal.md`, `tasks.md`,
  `specs/store-write-boundary-guard/spec.md`, `handoff.md`)

**Modified:**
- `.claude/rules/always/organicgrowth-rules.md` — one added sentence naming the new guard.
- `src/db/adr.docs-test.ts` — one new `describe` block pinning that sentence; no existing assertion
  touched.

**Untouched (deliberately):** `src/command-surface/**`, `src/fs-boundary/**`, every store's own
operations/return shapes, the four integration ports and their fakes, `src/ledger/ledger.ts` and every
real production module that reads/writes `ledger.json`.

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-233-command-surface-write-guard

# Full suite (typecheck + tests + docs-tests)
npm test

# Just this slice's new suites
node --import tsx --test src/store-write-boundary/*.test.ts src/db/adr.docs-test.ts

# OpenSpec
npx openspec validate issue-233-command-surface-write-guard --strict
npx openspec validate --all --strict
```

Result at handoff: `npm test` → **3122 tests / 806 suites / 0 fail** (baseline on this branch at
`8507bf1`, measured directly before any code changed: **3100/800/0 fail** — +22 tests, +6 suites, no
regressions). `openspec validate issue-233-command-surface-write-guard --strict` → valid.
`openspec validate --all --strict` → **59/59** (58 existing specs, unchanged, + this change's own
pending item). Note: the task brief's stated baseline of "57" does not match what this branch actually
measures — I independently re-ran `npx openspec validate --all --strict` on a clean checkout of
`8507bf1` before writing any code and got **58/58** (56 pre-#205 specs + 2 new ones #205 itself added:
`command-surface`, `node-fs-boundary-guard` — `openspec/specs/` on this branch is otherwise unchanged
from `main`). This is a documentation-accuracy nit in the task brief, not a functional gap; 59 = 58 + 1
pending change either way.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #233) | Proven by |
|---|---|---|
| 1 | An automated check, mirroring `src/fs-boundary/`'s ratchet shape, fails when a module outside `src/command-surface/` imports a store's write function directly. | `src/store-write-boundary/{scan,allow-list,store-write-guard}.ts` — same three-file split as `fs-boundary`; `store-write-guard.test.ts`'s disk-walking assertion is green against the real repo; `scan.test.ts`'s "excludes a file under src/command-surface/..." test proves the exemption is real, not accidental. |
| 2 | It runs as part of `npm test`, like the `node:fs` guard and the credential scanner. | `store-write-guard.test.ts` is a `*.test.ts` file under `src/`, picked up by `npm test`'s existing `"src/**/*.test.ts"` glob — confirmed by the full-suite run showing +6 suites/+22 tests including this one, no separate wiring needed (same mechanism as `node-fs-guard.test.ts` and `src/secrets-scan/scanner.test.ts`). |
| 3 | It ships with an explicit allow-list of today's legitimate exceptions — the command surface itself, the stores' own tests, and any fixture that genuinely needs direct access — each with a stated reason, following the audit style #205 established. | `src/store-write-boundary/allow-list.ts`'s 10 entries, grouped by category with stated reasons, mirroring `fs-boundary/allow-list.ts`'s own comment style; `proposal.md`'s "The audit" gives the full per-module reasoning. The command surface itself is excluded by PATH (`isCommandSurfacePath`), not individually allow-listed — proven by `scan.test.ts`. The stores' own tests are excluded by `isTestPath` (any path containing `"test"`) — proven by `scan.test.ts`'s "excludes a *.test.ts file..." case. |
| 4 | A test proves the guard FAILS when a violating module is added. | Live-demonstrated during this build (this session): added `src/qa-demo/bypass-write.ts` (import `createTrend` from `src/trend/store.ts`, outside `command-surface`, not allow-listed), ran `node --import tsx --test src/store-write-boundary/store-write-guard.test.ts` — it failed, naming exactly `src/qa-demo/bypass-write.ts::src/trend/store.ts::createTrend` as a new, un-audited violation; the file was then deleted (`git status` confirmed clean, never committed). The same shape is encoded permanently, without leaving a landmine file in `src/`, as `scan.test.ts`'s "matches the exact shape a violating module takes — proving the guard has something real to fail on" in-memory fixture test. |
| 5 | Reads are considered separately from writes, and the decision is recorded. | `proposal.md`'s "Reads vs writes" section states and reasons the decision (writes only); `specs/store-write-boundary-guard/spec.md`'s "reads are explicitly out of this guard's scope" Requirement encodes it as a spec-level commitment, not just prose; `scan.test.ts`'s "ignores a read-function import from a store that also has write functions" test and `store-write-guard.test.ts`'s own green run against `src/idea/store.ts`'s real `getTrend` import (a genuine cross-store read, untouched by this guard) prove it in practice. |

### Fakes / fixtures used

- **No Magnific fake, no Apify fake, no Media Host fake, no Zoho fake were needed.** This slice never
  touches `SpaceMcpPort`/`PerformanceScrapePort`/`MediaHostPort`/the Zoho MCP schedule port, and imports
  none of `src/space-driver/`, `src/apify/`, `src/media-host/live/adapter.ts`, or any Zoho MCP tool —
  confirmed by reading every new file's imports (`node:path`, `node:fs/promises`, `node:test`,
  `node:assert/strict`, `node:url`, and its own sibling module only). **Explicitly confirming for qa: no
  live Space, Apify, Media Host, or Zoho MCP call was made anywhere in this slice — hermetic throughout.**
- **In-memory `SourceFile` fixtures** (`scan.test.ts`) — pure, hand-constructed `{ path, content }` pairs,
  no disk I/O, mirroring `fs-boundary/scan.test.ts`'s own convention.
- **The real repository's own `src/` tree** (`store-write-guard.test.ts`) — the one place this check
  touches disk, reading real `.ts` files off local disk (never a mock/fake filesystem), mirroring
  `node-fs-guard.test.ts`'s own convention exactly.
- **A throwaway demonstration module** (`src/qa-demo/bypass-write.ts`) — added, run against the guard,
  and deleted within this session, never committed (see AC4 row above). No fixture file of this shape
  exists anywhere in the tree at handoff.

### Self-review notes

- Cross-checked every one of the 20 write-function names in `STORE_WRITE_FUNCTIONS` against the real
  `export function`/`export async function` signature in its store file (a small script, not eyeballing)
  — all 20 confirmed present, no typos.
- Re-read every exported function from all 13 target store files (re-derived from the original
  `export function` grep, not from memory) and re-classified each as read or write, to confirm no write
  was missed (e.g. `claimJob`/`releaseJob` are writes despite returning the mutated row; `loadIdeaAssets`
  is a read despite the word "load") and no read was mis-included (e.g. `listBriefableTrends`).
- Added an explicit "file-backed store writes are out of scope" paragraph to `proposal.md`'s "Known
  gaps" after re-confirming this guard's scope matches `src/command-surface/`'s own scope exactly (the
  SQL-backed `{ db }` half only) — `production-spec/store.ts`'s `saveSpec` (the file-backed Production
  Spec write) is a different, unambiguous export name deliberately NOT in `STORE_WRITE_FUNCTIONS`, unlike
  `writeAsset`'s ambiguous overload.
- Considered importing `isTestPath` from `src/fs-boundary/scan.ts` instead of re-stating the one-line
  function; kept the small duplication deliberately, so this guard stays fully independent/removable on
  its own (documented in `scan.ts`'s own doc comment, not silent).
- Chose per-`(path, store, function)` triple granularity for the allow-list (not per-file), so a file
  that is legitimately allow-listed for ONE write function can never silently also cover a different,
  un-audited write function from the same store — the comparison in `store-write-guard.test.ts` flattens
  to this resolution deliberately.

### Known limits

- **`src/store-write-boundary/scan.ts`'s import matching is regex-based, not an AST parse** — same
  deliberate choice `fs-boundary/scan.ts` already made. It matches only named
  `import { a, b as c } from "..."` sites; a hypothetical `import * as store from "../trend/store.ts"`
  followed by `store.createTrend(...)` would not be caught. Verified by grep that no file in this repo
  uses namespace-import syntax for any of the 13 target store modules today (`proposal.md`'s "Known
  gaps").
- **Raw SQL bypasses a store's own write function entirely and is out of scope by construction.**
  `src/db/fixtures/seed-chain.ts` itself issues `db.prepare(...).run(...)` directly against the `run` and
  `idea` tables (bootstrapping rows no store write function yet covers) — this is a materially different,
  narrower risk (a fixture seeding its own throwaway database) than a production caller reaching around
  the command surface, and this guard, like `fs-boundary`'s, cannot and does not attempt to catch it
  (named explicitly in `proposal.md` so it is not mistaken for an oversight).
- **File-backed store writes are out of scope**, matching `src/command-surface/`'s own scope exactly (see
  "Self-review notes," above) — not a gap introduced by this ticket.
- **`recordChannelBaseline`** (`src/performance/store.ts`) has no `src/command-surface/` wrapper today
  even though its sibling writes do — a pre-existing #205 gap, not introduced or hidden by this guard; a
  future caller of it would need either a new command-surface wrapper or an allow-list entry, and the
  guard will force that choice to be visible.
