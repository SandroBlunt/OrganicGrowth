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

---

## QA Verdict — Round 1: PASS

Verified inside `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-233-command-surface-write-guard`,
branch `issue-233-command-surface-write-guard`, HEAD `f61d42d`. Read-run-report only; no product code,
test, spec, or ledger file was edited. All probe files I added during verification were deleted before
finishing (`git status` clean throughout, confirmed below).

### Suite result

- `npm test` → **3122 tests / 806 suites / 0 fail**, run to completion, exact command
  `cd .../issue-233-command-surface-write-guard && npm test` (runs `tsc -p tsconfig.json --noEmit` then
  `node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"`). Matches the Build Report's
  reported number exactly — **PASS**, real green, not assumed.
- `npm run test:docs` → **295 tests / 80 suites / 0 fail**, run separately as instructed — **PASS**.
- `npx openspec validate issue-233-command-surface-write-guard --strict` → "Change
  'issue-233-command-surface-write-guard' is valid" — **PASS**.
- `npx openspec validate --all --strict` → **59/59** (`openspec/specs/` = 58 items + 1 pending change).
  I independently confirmed `ls openspec/specs | wc -l` = 58 and `ls openspec/changes` = 2 entries
  (`archive/`, `issue-233-command-surface-write-guard/`, the latter being the one pending item). **The
  developer's re-measured 58 is correct; the task brief's "57" is stale/wrong** — confirmed independently,
  not just re-trusted.
- Isolated new-suite run, `node --import tsx --test src/store-write-boundary/*.test.ts` →
  **21 tests / 5 suites / 0 fail**; combined with the 1 new `describe` block in `src/db/adr.docs-test.ts`
  = 22 tests / 6 suites — matches the reported "+22 tests, +6 suites" delta over the 3100/800 branch
  baseline exactly.
- `git diff --stat 8507bf1 f61d42d` confirms `src/db/schema.ts` (where `MIGRATION_1`/`MIGRATION_2` live)
  does not appear in the changed-file list at all — **`MIGRATION_1`/`MIGRATION_2` are byte-for-byte
  frozen**, confirmed structurally (no diff), not just by inspection.

### Per-criterion results (issue #233 acceptance criteria)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Automated check, mirroring `fs-boundary`'s ratchet shape, fails when a module outside `command-surface/` imports a store's write function directly | PASS | `src/store-write-boundary/{scan,allow-list,store-write-guard}.ts` — same file split as `fs-boundary` (confirmed: both dirs hold `scan.ts` + `allow-list.ts` + a disk-walking `*guard*.test.ts`, plus a `scan.test.ts`). Independently reproduced the fail (see "Must-fail reproduction," below). |
| 2 | Runs as part of `npm test`, like the `node:fs` guard and the credential scanner | PASS | `store-write-guard.test.ts` matched by `npm test`'s `"src/**/*.test.ts"` glob — confirmed by my own full-suite run showing the guard's suite present in output (`ok - store-write boundary guard (issue #233)`) with no separate CI wiring. |
| 3 | Ships with an explicit, individually-reasoned allow-list | PASS | `allow-list.ts`'s 10 entries, each with a store/function/reason. I independently re-derived the "found" set with my own grep sweep across all 27 write-function names (see "Allow-list audit," below) and it matches the 10 entries exactly, no more, no fewer. |
| 4 | A test proves the guard FAILS on a violating module | PASS | Reproduced independently, see below — the guard failed and named the violation precisely. |
| 5 | Reads considered separately, decision recorded | PASS | `proposal.md`'s "Reads vs writes," spec's dedicated Requirement, `scan.test.ts`'s read-ignored test, and `store-write-guard.test.ts`'s own green run against the real `src/idea/store.ts` → `getTrend` cross-store read (verified: `grep -n getTrend src/idea/store.ts` shows a real import + call at lines 51/125). See "Scope decision 1," below, for my ruling on whether I *agree*. |

### Per-scenario results (spec deltas, `specs/store-write-boundary-guard/spec.md`)

| Scenario | Verdict | Covering test |
|---|---|---|
| A real import site is detected regardless of how the store module is reached | PASS | `scan.test.ts` "matches a real named-import site of a store write function, resolved to its store module" (seed-chain → `createBrand`) |
| A bare name collision across two unrelated modules is not mistaken for a store import | PASS | `scan.test.ts` "does NOT match a bare-name collision" (`listBrands` from `brand/resolver.ts`) |
| A doc-comment mention of a write function's name is not a match | PASS | `scan.test.ts` "does NOT match a bare doc-comment mention" |
| A direct import of a store's read function is not flagged | PASS | `scan.test.ts` "ignores a read-function import from a store that also has write functions"; confirmed live against the real `getTrend` cross-store read (see above) |
| A brand-new, un-audited direct store-write import fails the guard | PASS | `store-write-guard.test.ts`, reproduced independently (below) |
| An allow-list entry that no longer imports that write function fails the guard | PASS | Traced through the code: `store-write-guard.test.ts`'s `staleEntries` branch (`allowed.filter((key) => !found.includes(key))`) is symmetric with `newViolations` and asserted identically; not separately hand-reproduced (would require temporarily editing the checked-in allow-list, which is out of my read-run-report remit), but the assertion logic is unambiguous and directly inspected. |
| The command surface itself is never flagged | PASS | `scan.test.ts` "excludes a file under src/command-surface/..." |
| A documented, allow-listed fixture is never flagged | PASS | `store-write-guard.test.ts`'s real green run includes `claim-worker.ts`/`claimJob` passing without complaint |
| The guard is green at the real starting state before any future sweep | PASS | `store-write-guard.test.ts` passed on first real run, no sweep commit needed (confirmed: this branch has exactly one commit touching `src/store-write-boundary/`, `102a434`, no follow-up shrink commit) |

### Always-rules + Magnific-fake checks

- **Generate-never-publish**: PASS. This slice touches no rendering or publication code path at all.
- **Public-metrics-only**: PASS. No Apify/Insights code touched; `recordChannelBaseline`/etc. are only
  named as strings in `scan.ts`, never called.
- **Relative-not-absolute**: PASS (not applicable — no scoring logic in this slice).
- **Explicit-attribution**: PASS (not applicable — `src/asset/attribution.ts` is only named as an
  allow-list *path string*, its logic is untouched).
- **Ledger-as-source-of-truth**: PASS, and reinforced. The guard's own allow-list correctly recognizes
  that the 5 `writeAsset({ ledgerPath })` callers ARE the mechanism that upholds this rule (ledger.json
  is still the canonical file per `CONTEXT.md` and always-rule 7; the SQL stores are additive, per
  ADR-0029's own words: "does NOT swap" the file-based ledger out). Allow-listing them is not tolerating
  a bypass of the rule — it is correctly recognizing they implement it.
- **Magnific fake / hermetic check**: PASS. Grepped every new file's imports —
  `grep -n "^import" src/store-write-boundary/*.ts` shows only `node:path`, `node:fs/promises`,
  `node:test`, `node:assert/strict`, `node:url`, and this module's own sibling files. No
  `spaces_*`/`creations_*` MCP call, no `space-driver`/`apify`/`media-host live adapter`/Zoho import
  anywhere in this slice's new code. Hermetic, confirmed by direct inspection, not by trusting the
  handoff's claim.

### Scope decision 1 — writes only, not reads: I AGREE

The reasoning holds up on independent scrutiny: a write bypass creates a real risk (two paths racing to
mutate the same row, ledger-as-source-of-truth losing its one writer); a read bypass returns
stale-relative-to-a-transaction data at worst. Issue #233's own title ("nothing above it may write
through a store directly") and #205's AC2 ("the command surface is the only thing that writes") are both
about writes specifically. I independently confirmed the one real cross-store read this decision waves
through (`src/idea/store.ts` importing `getTrend` from `src/trend/store.ts`) is genuine, and that folding
it in would force exactly one allow-list entry for zero safety gain while diluting the guard's signal for
every future read composition #208/#210/#211 will legitimately write. Agree with the decision and the
way it was recorded (a named spec Requirement, not just a proposal paragraph).

### Scope decision 2 — file-backed store writes excluded: A REAL GAP, worth stating plainly, not a blocker

This is the one I scrutinized hardest, per the brief. My independent finding: **yes, a real hole exists,
and it survives the combination of both guards** — this is not resolved by "`fs-boundary` catches
`node:fs` use."

Concretely: `src/production-spec/store.ts` exports **two** differently-named functions —
`saveSpec` (async, file-backed, writes the Production Spec JSON beside its Brief via
`writeFileAtomic`/`mkdir`) and `saveProductionSpec` (sync, SQL-backed, `UPDATE asset SET spec_json = ...`).
Only `saveProductionSpec` is in `STORE_WRITE_FUNCTIONS` (correctly, by this guard's stated SQL-only
scope). `saveSpec` is not, and cannot be, by design. Now trace what happens if a future module (e.g.
part of #211's agent rewrite) imports `saveSpec` directly, outside `src/command-surface/`:

- **`store-write-boundary` guard**: silent. `saveSpec` is not a name in `STORE_WRITE_FUNCTIONS` at all.
- **`fs-boundary` guard**: also silent. The *caller* of `saveSpec` never itself imports `node:fs` — only
  `production-spec/store.ts` does that, and `production-spec/store.ts` is itself already sitting in
  `fs-boundary/allow-list.ts` under the "already-the-store: the file-backed half of a store that ALSO
  exists" category (I read this entry directly, `src/fs-boundary/allow-list.ts:29`). A caller reaching
  through an already-allow-listed store file's own file-backed write function is invisible to the
  `node:fs` ratchet by construction — it never touches `node:fs` itself.

So a bypass of exactly the shape the two guards are supposed to jointly close — "nothing above the store
layer writes outside `command-surface/`" — remains fully available via this route, undetected by either
check. I confirmed this is not merely hypothetical: `src/production-spec/compose.ts` already calls
`saveSpec` directly today, outside `command-surface/` (it has no importer among production modules right
now — `grep -rn "from.*production-spec/compose" src --include='*.ts'` outside tests returns nothing — so
it is currently a dormant, not an active, bypass, but the *pattern* is already live code, not a
hypothetical).

**Verdict on the developer's framing**: their claim that "this guard's scope matches
`src/command-surface/`'s own scope exactly" is accurate and consistent — `command-surface/` genuinely
never claimed the file-backed world, so this is not a misread of #205 or a spec that quietly narrows the
issue below what #205 promised. But it IS narrower than issue #233's own literal words ("a store's write
function," not "a SQL-backed store's write function"), and it does leave the combination of the two
existing guards incomplete for the class of risk #233 exists to close. This is exactly the kind of gap
the developer's own "Known gaps"/"Known limits" sections in `proposal.md`/`handoff.md` already name
honestly — it is disclosed, not hidden, which is why I am not failing the slice over it. But per
instruction, stating it plainly: **the gap is real.**

**What would close it**: extend `store-write-boundary`'s `STORE_WRITE_FUNCTIONS` to also name file-backed
write-function exports (distinct names, like `saveSpec`, pose none of `writeAsset`'s overload-ambiguity
problem) on stores that have one, OR give `production-spec` (and any future file-backed writer) its own
`src/command-surface/` wrapper so `isCommandSurfacePath` legitimately covers it. Either is a small,
well-scoped follow-up, not a redesign. I recommend filing it as a fast-follow ticket rather than silently
carrying it forward.

### Allow-list audit — 10 entries, 5 individually scrutinized

I independently re-derived the "found" set with my own regex grep across every one of the 27
write-function names in `STORE_WRITE_FUNCTIONS`, excluding `command-surface/` and test paths. Result:
exactly the same 10 entries the allow-list carries (4 from `seed-chain.ts`, 1 from `claim-worker.ts`, 5
`writeAsset` callers) — zero extra, zero missing. The two pre-existing test fixtures check out (both
genuinely not `*.test.ts`-named, both genuinely needed by multiple stores' own suites, both traced by
name to #205's own handoff).

The 5 `writeAsset` grandfathered entries, checked one at a time by reading the actual call site (not the
allow-list's claim about it):

| File | Call site confirms | Predates #205? | Verdict |
|---|---|---|---|
| `src/asset/attribution.ts` | `{ ledgerPath: options.ledgerPath }` (line 59) | Yes — created 2026-08-10, #205 landed 2026-08-17 | Genuine, not a live bypass |
| `src/commands/export-schedule.ts` | `{ ledgerPath }` (line 332) | Yes — created 2026-08-04 | Genuine |
| `src/commands/schedule-via-zoho-mcp.ts` | `{ ledgerPath }` (line 255) | Yes — created 2026-08-10 | Genuine |
| `src/commands/track-performance.ts` | `{ ledgerPath }` (confirmed at call site) | Yes — created 2026-07-17 | Genuine |
| `src/commands/upload-camera-hub-scripts.ts` | `{ ledgerPath }` (line 158) | Yes — created 2026-08-13 | Genuine |

None of the five is "a live bypass blessed permanently" dressed up as legacy: they are the current,
still-canonical `ledger.json` write path (always-rule 7), not a superseded mechanism awaiting a known
migration ticket — `docs/adr/0029-local-sqlite-behind-the-store-boundary.md` states explicitly the SQL
stores are additive and this ticket "does NOT swap" the file ledger out, and `CONTEXT.md` still names
`ledger.json` as canonical. The allow-list is as short as the truth allows: my independent sweep found
no 11th entry it should have carried and no entry that should have been dropped.

### Must-fail proof — reproduced independently

Added my own throwaway module (different name/store than the developer's, to make this a genuinely
independent check, not a re-run of theirs):

```ts
// src/qa-verify-demo/bypass.ts
import { createIdea } from "../idea/store.ts";
export function doBypass() { return createIdea; }
```

Ran `node --import tsx --test src/store-write-boundary/store-write-guard.test.ts` — **failed**, with:

```
New, un-audited direct store-write import(s):
["src/qa-verify-demo/bypass.ts::src/idea/store.ts::createIdea"]. Every module outside
src/command-surface/ that imports a SQL-backed store's write function directly must either move onto
src/command-surface/, or be added to src/store-write-boundary/allow-list.ts with a stated reason
(issue #233).
```

The message names the exact violating file, the store, and the function — genuinely useful for a
developer to act on, not a generic "something's wrong." Deleted the probe file; `git status --short`
returned nothing, tree confirmed clean.

I additionally probed the disclosed namespace-import limitation directly (not just trusted the doc
comment): replaced the probe with
`import * as ideaStore from "../idea/store.ts"; ideaStore.createIdea;` and reran the same guard — it
passed (no violation reported), confirming the "Known limits" claim precisely: a namespace-import bypass
is genuinely invisible to this detector today. This is disclosed honestly in both `proposal.md`'s "Known
gaps" and `handoff.md`'s "Known limits," and I independently confirmed no file in the repo uses that
syntax against any of the 13 target stores today (`grep -rn "import \* as" src --include='*.ts' | grep -v
test` → only one unrelated hit, `node:readline` in `run-pipeline.ts`). Not a hidden defect, but a real,
narrow residual gap worth naming alongside the file-backed one above — both are honestly disclosed, both
remain real.

I also confirmed the detector resolves real import sites, not bare-name/substring matches, directly from
`scan.test.ts`'s "does NOT match a bare-name collision" and "does NOT match a bare doc-comment mention"
cases, both of which I read in full and consider a correct, non-trivial test of exactly the failure mode
the brief warned about.

### Also verified

- **Runs inside `npm test` automatically**: confirmed by the full-suite run itself (no separate
  invocation needed).
- **Mirrors `fs-boundary`'s three/four-file shape**: confirmed — both directories hold `scan.ts`,
  `allow-list.ts`, `scan.test.ts`, and a disk-walking guard test (`node-fs-guard.test.ts` /
  `store-write-guard.test.ts`).
- **`src/qa-demo/bypass-write.ts` never committed**: confirmed by
  `git log --all --diff-filter=A --name-only | grep -i "bypass-write\|qa-demo"` (no output, across all
  refs) and `find . -iname '*qa-demo*'`/`*bypass-write*'` on the working tree (no output). Genuinely gone,
  never landed.
- **No sibling-slice files pre-emptively allow-listed**: confirmed — grepped `allow-list.ts`/`scan.ts`/
  `proposal.md` for any reference to `issue-204`/`issue-209`/`importer`/`viewer` beyond the issue's own
  prose about #208/#210/#211's future role; none found. Checked (read-only, `git status --short`) both
  sibling worktrees (`issue-204-importer-and-rehearsals`, `issue-209-scheduling-outbox-sips-port`) —
  neither was touched by this branch, and neither's in-flight files (e.g. `src/importer/load-brief.ts`)
  appear anywhere in this slice's allow-list.
- **`MIGRATION_1`/`MIGRATION_2` byte-for-byte frozen**: confirmed structurally, see "Suite result," above.
- **openspec archive risk**: this change's spec delta (`specs/store-write-boundary-guard/spec.md`) is
  **entirely `## ADDED Requirements`** — no `## MODIFIED Requirements` section anywhere in it (confirmed:
  `grep -c "^## ADDED\|^## MODIFIED\|^## REMOVED\|^## RENAMED"` → 1 hit, the ADDED header). The
  previously-hit MODIFIED-header archive trap does not apply here structurally; I did not run
  `openspec archive` myself (out of scope per standing rules), but there is nothing in this change's
  header shape that matches the known failure pattern.

### Defect list

None blocking. One disclosed-but-worth-escalating finding, not scored as a defect against this slice
(it does what it says, honestly, and matches `command-surface/`'s own existing scope) but flagged forward:

- **Severity: low-medium, informational for #208/#210/#211, not a defect in #233's own delivered scope.**
  File-backed store writes (e.g. `production-spec/store.ts`'s `saveSpec`) are invisible to both the new
  `store-write-boundary` guard and the existing `fs-boundary` guard, for the reasons detailed under
  "Scope decision 2," above. Repro: add a module outside `src/command-surface/` importing `saveSpec` from
  `src/production-spec/store.ts` and calling it — `npm test` stays green. Recommend a fast-follow ticket
  extending `STORE_WRITE_FUNCTIONS` (or adding a `command-surface/` wrapper) to close it before #211
  specifically, since #211 is the ticket most likely to touch Production Spec writes.
- **Severity: low, informational, already disclosed.** The namespace-import (`import * as store from
  "..."`) evasion applies to both guards equally and remains open; independently confirmed exploitable
  and confirmed absent from the repo today. No action required now; worth a one-line mention if either
  guard's own doc comment is ever revisited.

### Can #208, #210, #211 now safely assume the seam is guarded?

**Yes, for the exact shape of bypass #205's QA round demonstrated** (a direct named import of a
SQL-backed store's write function, bypassing `command-surface/`) — independently reproduced, fails
loudly, names the violation, wired into `npm test` with no extra setup required from any of the three.
#210 is read-only per its own issue text, so this guard's write-only scope does not affect it. #208 (the
worker, draining the queue — `job-store.ts`'s `createJob`/`claimJob`/`releaseJob`/`requeueJob`, all
tracked) and #211 (the agent rewrite, touching most of the 13 tracked stores) are both fully covered for
SQL-backed writes.

**Not fully, for a file-backed store write** (see "Scope decision 2") — if #211 in particular ends up
writing a Production Spec (or any other file-backed store artifact) directly rather than through
whatever surface eventually wraps it, neither this guard nor `fs-boundary` will catch it. This should be
communicated to whoever picks up #211, not assumed away.

**PASS** stands: the slice delivers exactly what issue #233 asked for, proven by a real, independently-
reproduced failing test, a verified-accurate allow-list, and honest, spec-recorded scope decisions — one
of which (reads) I agree with outright, and one of which (file-backed writes) I've confirmed is a real,
disclosed, non-blocking residual gap rather than a silent one.
