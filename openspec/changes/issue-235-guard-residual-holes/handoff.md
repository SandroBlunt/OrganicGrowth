# Slice Handoff — issue #235: close the two residual holes in the store-write guard

## Build Report

### What changed

Extended #233's `src/store-write-boundary/` guard to close both residual holes its own Round-1 QA Verdict
found and disclosed forward, without redesigning either guard's existing contract:

1. **File-backed store writes** — `STORE_WRITE_FUNCTIONS["src/production-spec/store.ts"]` now names both
   `saveProductionSpec` (SQL-backed) and `saveSpec` (file-backed). `saveSpec` was invisible to both
   `store-write-boundary` (SQL-only by design) and `fs-boundary` (whose own allow-list already covers
   `production-spec/store.ts` itself, so a *caller* of `saveSpec` never imports `node:fs`) at once —
   confirmed live: `src/production-spec/compose.ts` calls `saveSpec` directly, outside
   `src/command-surface/`, today. `compose.ts`'s import is now an explicit, individually-reasoned
   allow-list entry (not silently exempted): it is the orchestration shell that owns the write-gate
   (generate → validate → brand-safety scan → save) for the file-backed Spec — the boundary itself, the
   same relationship `src/command-surface/` has to the SQL-backed stores it wraps — and `command-surface/`
   itself cannot wrap it without violating its own spec Requirement that every function take an
   already-open `DatabaseSync` as its first argument (`saveSpec` has none). Migration tracked as a new
   GitHub issue, **#238**, filed during this build and referenced from the allow-list entry.
2. **Namespace imports** — `scan.ts` gained `NAMESPACE_IMPORT_PATTERN` /
   `findNamespaceImportSites`, merged into `findStoreWriteImports` alongside the existing named-import
   matching. A namespace import (`import * as alias from "..."`) of a tracked store module is now treated
   as importing EVERY ONE of that store's write functions — a namespace import genuinely binds every
   export, so this is a literal reading of what got imported, not an approximation, and it deliberately
   avoids a call-site grep (which an aliased reference, e.g. `const fn = alias.createIdea`, would evade the
   same way the namespace import itself evaded the named-import matcher in the first place — reasoning
   recorded in `proposal.md`'s "Namespace imports: why 'all functions,' not a call-site grep"). Zero files
   in the repo used this syntax against any tracked store before this change, so it lands as a ratchet with
   no new allow-list entries needed for it.
3. **Both new detections are proven to fail on a violating module** — not just observed passing (the
   issue's own explicit requirement, echoing #197's first-round rejection): permanent in-memory
   `scan.test.ts` fixtures for each, PLUS independently reproduced live during this build with real,
   throwaway probe files added to `src/`, run against the real disk-walking
   `store-write-guard.test.ts`, confirmed to fail naming the exact violation, then deleted (never
   committed — see "Self-review notes" for the exact commands run and their output).
4. **The allow-list stays honest** — gains exactly one new entry (`compose.ts` → `saveSpec`), with its
   top-of-file comment corrected from a stale "two" to the accurate "three" pre-existing test/crash
   fixtures (issue #209's `crash-schedule-worker.ts` was already present but uncounted — a pre-existing
   staleness, not introduced by this change, tidied while already touching this file's header).
5. **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`) gains one sentence naming both extensions,
   pinned by a new `describe` block in `src/db/adr.docs-test.ts`, mirroring #233's own docs-accuracy
   precedent.
6. **A real gotcha found and fixed while writing this very change's own doc comments**: `scan.ts`'s
   top-of-file comment originally spelled out the issue's own namespace-import example as a literal,
   syntactically-real `import * as store from "../idea/store.ts"` statement — which the new
   `NAMESPACE_IMPORT_PATTERN` then matched, self-flagging `scan.ts` itself as a violation (neither pattern
   is comment-aware, matching raw text regardless of context — the same "no parsing, no AST" trade-off
   `fs-boundary/scan.ts` already accepted, re-discovered here for a new pattern). Fixed by describing the
   shape in prose instead of reproducing it verbatim, and stated as a disclosed limitation in `scan.ts`'s
   own comment and `proposal.md`'s "Known gaps," not hidden.

### Files touched

**Modified:**
- `src/store-write-boundary/scan.ts` — `STORE_WRITE_FUNCTIONS["src/production-spec/store.ts"]` gains
  `"saveSpec"`; new `NAMESPACE_IMPORT_PATTERN` + `findNamespaceImportSites`; `findStoreWriteImports` merges
  named- and namespace-import sites; doc comments updated throughout.
- `src/store-write-boundary/allow-list.ts` — one new entry (`compose.ts` → `saveSpec`); top-of-file
  comment corrected and extended.
- `src/store-write-boundary/scan.test.ts` — 8 new tests (see "Acceptance-criteria self-assessment" below).
- `.claude/rules/always/organicgrowth-rules.md` — one added sentence to rule 7.
- `src/db/adr.docs-test.ts` — one new `describe` block (2 tests) pinning that sentence.

**New:**
- `openspec/changes/issue-235-guard-residual-holes/` (this change: `proposal.md`, `tasks.md`,
  `specs/store-write-boundary-guard/spec.md`, `handoff.md`).
- GitHub issue **#238** (`Migrate compose.ts's Production Spec write off the store-write-boundary
  allow-list`), tracking the real migration, filed from this build.

**Untouched (deliberately):** `src/store-write-boundary/store-write-guard.test.ts` (the disk-walking test
needed no changes — it already asserts against whatever `findStoreWriteImports` + the allow-list produce,
by construction), `src/command-surface/**`, `src/fs-boundary/**`, every store's own operations,
`src/ledger/ledger.ts`, `src/production-queue/store.ts` (`data/queue.json`), and every real production
module that reads/writes `ledger.json` or `data/queue.json` — both are pre-SQL, always-rule-7-mandated
files the pipeline is expected to write directly, a materially different category from a SQL-migration-era
store's own file-backed write sibling (see `proposal.md`'s "Known gaps").

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-235-guard-residual-holes

# Full suite (typecheck + tests + docs-tests)
npm test

# Docs-conformance suite alone
npm run test:docs

# Just this slice's new/touched suites
node --import tsx --test src/store-write-boundary/*.test.ts src/db/adr.docs-test.ts

# OpenSpec
npx openspec validate issue-235-guard-residual-holes --strict
npx openspec validate --all --strict
```

Result at handoff:
- `npm test` → **3313 tests / 863 suites / 0 fail**. Baseline on this branch at `60ecfc7`, measured
  directly before any code changed: **3303/862/0 fail** (matches the task brief's stated baseline exactly)
  — **+10 tests, +1 suite, no regressions** (8 new tests in `scan.test.ts`, no new suite there since they
  land inside existing `describe` blocks; 2 new tests + 1 new suite in `adr.docs-test.ts`).
- `npm run test:docs` → **297 tests / 81 suites / 0 fail** (up from 295/80 at #233's own handoff — +2/+1,
  matching the new `adr.docs-test.ts` block exactly).
- `npx openspec validate issue-235-guard-residual-holes --strict` → "Change 'issue-235-guard-residual-
  holes' is valid".
- `npx openspec validate --all --strict` → **62/62**. I independently measured this branch's baseline
  (`60ecfc7`, before any code changed) at **61/61** (`ls openspec/specs | wc -l` = 61, zero pending
  changes) — **not** the task brief's stated "60." This is the same class of stale-brief-number the #233
  developer and QA both independently caught and corrected last round; noted here rather than silently
  matched to the brief. 62 = 61 + this change's own pending item.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #235) | Proven by |
|---|---|---|
| 1 | A caller outside `src/command-surface/` writing through a store's file-backed function is caught. | `scan.test.ts` "matches a real import site of a store's FILE-BACKED write function, resolved to its store module (issue #235)" (a hypothetical NEW caller of `saveSpec`, not `compose.ts`, is detected) — proven at the pure-detector level AND independently reproduced live: a real throwaway probe file importing `saveSpec` outside `command-surface/`, run against `store-write-guard.test.ts`, failed naming exactly `src/qa-verify-235-filebacked/bypass.ts::src/production-spec/store.ts::saveSpec` (see "Self-review notes" for the transcript), then deleted. |
| 2 | `compose.ts`'s existing direct `saveSpec` call is resolved: routed through the command surface, or added to the allow-list with a stated reason and a ticket that will migrate it. | `src/store-write-boundary/allow-list.ts`'s new entry, with the full reasoning inline (why it is the write-gate, not a bypass; why `command-surface/` cannot wrap it without violating its own `DatabaseSync`-first-argument spec Requirement) and a pointer to **issue #238** (filed, real, not a promised placeholder). `proposal.md`'s "compose.ts: allow-list now, not a command-surface wrapper" records why routing was rejected. The real disk-walking `store-write-guard.test.ts` run (see "How to run") confirms `compose.ts`'s own real import is exactly the one new allow-listed triple, not silently exempted by any path rule. |
| 3 | Namespace imports (`import * as store`) are either caught, or documented as a deliberately accepted limitation with reasoning. | **Caught**, not just documented. `scan.test.ts` "matches a namespace import site, reporting EVERY one of that store's write functions — proving the guard has something real to fail on for a namespace-import bypass (issue #235)" uses the issue's own quoted shape verbatim (`import * as store from "../idea/store.ts"` then `store.createIdea(...)`) and asserts all four of `idea/store.ts`'s write functions are reported. Independently reproduced live: a real throwaway probe file of this exact shape, run against `store-write-guard.test.ts`, failed naming all four functions (see "Self-review notes"), then deleted. |
| 4 | A test proves each new detection FAILS on a violating module. | Both new detections: permanent in-memory `scan.test.ts` fixtures (rows 1 and 3 above) PLUS an independently-run, real, disk-level reproduction using genuine throwaway files added to `src/` and deleted before commit (transcript in "Self-review notes") — mirroring #233's own Round-1 QA verification method exactly, not merely asserted. |
| 5 | The allow-list stays as short as the truth allows, each entry with a stated reason, in the audit style #205 established. | `allow-list.ts` gains exactly one entry (not a blanket exemption), with a full grouped-comment reason matching the file's existing style; a pre-existing stale comment ("two" fixtures, should be "three") was corrected while already touching this file's header (task 5.1); the real disk-walking guard confirms no other file anywhere in `src/` is newly implicated by either extension (`npm test`'s green run over the real repo tree is the proof). |

### Fakes / fixtures used

- **No Magnific fake, no Apify fake, no Media Host fake, no Zoho fake were needed.** This slice never
  touches `SpaceMcpPort`/`PerformanceScrapePort`/`MediaHostPort`/the Zoho MCP schedule port, and imports
  none of `src/space-driver/`, `src/apify/`, `src/media-host/live/adapter.ts`, or any Zoho MCP tool —
  confirmed by reading every touched file's imports (`node:path` only, plus this module's own sibling
  files and `node:test`/`node:assert/strict` in the test files). **Explicitly confirming for qa: no live
  Space, Apify, Media Host, or Zoho MCP call was made anywhere in this slice — hermetic throughout.**
- **In-memory `SourceFile` fixtures** (`scan.test.ts`) — pure, hand-constructed `{ path, content }` pairs,
  no disk I/O, mirroring `fs-boundary/scan.test.ts`'s and #233's own `scan.test.ts`'s conventions.
- **The real repository's own `src/` tree** (`store-write-guard.test.ts`, unmodified but exercised by
  `npm test`) — the one place this check touches disk, reading real `.ts` files off local disk.
- **Two throwaway demonstration modules**
  (`src/qa-verify-235-filebacked/bypass.ts`, `src/qa-verify-235-namespace/bypass.ts`) — added, run against
  the real guard, confirmed to fail with the exact expected violation names, and deleted within this
  session, never committed (see "Self-review notes" for the full transcript and the `git status --short`
  confirmation that the tree was clean afterward).

### Self-review notes

- **Mutation-checked every new assertion, not just run it once green.** For the file-backed detection:
  temporarily removed `"saveSpec"` from `STORE_WRITE_FUNCTIONS`, reran `scan.test.ts` — 2 tests failed as
  expected (the new `STORE_WRITE_FUNCTIONS` naming test and the new file-backed-import test); restored,
  confirmed byte-identical to before (`diff` against a backup) and green again. For the namespace
  detection: temporarily stripped the `findNamespaceImportSites` merge out of `findStoreWriteImports`,
  reran — 2 tests failed as expected; restored, confirmed byte-identical and green again. For the rule-7
  docs pin: temporarily corrupted the new sentence's issue-number anchor, reran `adr.docs-test.ts` — the
  new `describe` block's test failed as expected; restored, confirmed byte-identical and green again.
- **Independently reproduced both must-fail proofs against the real, live repo tree** (not only the pure
  in-memory fixtures): added `src/qa-verify-235-filebacked/bypass.ts` (`import { saveSpec } from
  "../production-spec/store.ts";`) and `src/qa-verify-235-namespace/bypass.ts` (`import * as store from
  "../idea/store.ts"; store.createIdea;`), ran `node --import tsx --test
  src/store-write-boundary/store-write-guard.test.ts` — failed, naming both:
  `src/qa-verify-235-filebacked/bypass.ts::src/production-spec/store.ts::saveSpec` and all four
  `src/qa-verify-235-namespace/bypass.ts::src/idea/store.ts::{acceptIdea,createIdea,rejectIdea,
  selectIdeaRecipes}` triples. Deleted both (`rm -rf`), confirmed `git status --short` showed only the
  five intentionally-modified files, reran the guard — green.
- **Found and fixed a real self-inflicted false positive while drafting `scan.ts`'s own doc comment**: an
  early draft spelled out the issue's namespace-import example as a literal, matchable import statement,
  which the new pattern then flagged `scan.ts` itself for. Rewrote to prose-only description; the fix is
  itself now documented as a disclosed, general limitation (comment-vs-code blindness), not silently
  patched over. See "What changed," item 6.
- **Considered, and rejected, a call-site grep (`alias.functionName(`) as a narrower alternative to
  "report every write function on any namespace import."** Recorded the rejection reasoning in
  `proposal.md` rather than silently picking the coarser option — an aliased function reference would
  evade a call-site grep the same way the namespace import itself evaded the original named-import
  matcher, so the coarser, sound choice was kept deliberately, not by default.
- **Corrected a small pre-existing staleness while already touching `allow-list.ts`'s header comment**:
  "two" pre-existing test fixtures should have read "three" since issue #209 added
  `crash-schedule-worker.ts` without updating that count. Not introduced by this change; fixed because I
  was already there and it would otherwise keep drifting.
- **Verified `production-spec/store.ts` is the ONLY one of the 15 tracked store modules with a second,
  distinctly-named file-backed write function**, before writing any code — grepped all 15 for
  `writeFileAtomic`/`from "node:fs` and read each hit; none of the other 14 do any file I/O at all. This
  keeps the fix scoped to the confirmed hole, not a blanket "every file write is now guarded" expansion
  that would have pulled in `ledger.json`/`data/queue.json` (both pre-SQL, always-rule-7-mandated,
  deliberately out of scope — see `proposal.md`'s "Known gaps").

### Known limits

- **The regex-based detector still cannot distinguish comment context from code context** — a literal,
  syntactically-real import statement written out inside a doc comment would itself be matched as a
  violation (found live while drafting this very change's own comments; see "Self-review notes"). Same
  "no parsing, no AST" trade-off `fs-boundary/scan.ts` and #233's own `scan.ts` already accepted; not
  introduced by this change, re-discovered for a new pattern and now stated explicitly in `scan.ts`'s own
  comment.
- **A namespace import of a tracked store used only for reads is still flagged as if it imported every
  write function too** — the accepted, stated cost of choosing "all functions" over a call-site grep (see
  `proposal.md`'s "Namespace imports: why 'all functions,' not a call-site grep"). No live occurrence
  exists today; if one appears, the allow-list mechanism handles it with a stated reason like any other
  exception.
- **`compose.ts`'s `saveSpec` write is allow-listed, not eliminated.** It remains a real, if dormant,
  direct store-write call outside `src/command-surface/` — now visible and explained rather than invisible,
  which was this issue's own ask, but the underlying architectural question (how does a file-backed write
  get its own command-surface-shaped boundary, if at all) is left to issue #238 and, most likely, #211.
- **Raw SQL and other still-unnamed write paths remain out of scope**, unchanged from #233's own disclosed
  limits (a fixture issuing `db.prepare(...).run(...)` directly is a different, narrower risk this guard
  was never asked to cover).

---

## QA Verdict — Round 1: PASS

Verified in worktree `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-235-guard-residual-holes`, branch
`issue-235-guard-residual-holes`, HEAD `0b34873` on `main` at `60ecfc7`. Read, ran, and reproduced only —
no product code, test, spec, or ledger file was edited. Working tree confirmed clean (`git status --short`)
before and after every reproduction step, and again at the end of this review.

### Suite result — all numbers independently reproduced, exact match to the Build Report

| Check | Command | Reported | My independent result |
|---|---|---|---|
| Full suite | `npm test` | 3313 tests / 863 suites / 0 fail | **3313 / 863 / 0 fail — MATCH** |
| Docs suite | `npm run test:docs` | 297 tests / 81 suites / 0 fail | **297 / 81 / 0 fail — MATCH** |
| OpenSpec (this change) | `npx openspec validate issue-235-guard-residual-holes --strict` | valid | **"Change 'issue-235-guard-residual-holes' is valid" — MATCH** |
| OpenSpec (all) | `npx openspec validate --all --strict` | 62/62 | **62 passed, 0 failed (62 items) — MATCH** |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | (not separately reported) | **exit 0, no errors** |

`main` baseline stated in the task brief (3303/862/0 fail) is what the Build Report also independently
re-measured before any code changed and reports as matching exactly. I did not re-checkout `main` to
re-verify that baseline number myself (would require touching a shared branch outside this worktree's
scope), but the branch's own delta (+10 tests, +1 suite) is internally consistent with the diff (8 new
`scan.test.ts` tests inside existing `describe` blocks + 2 new `adr.docs-test.ts` tests in 1 new
`describe` block).

### Hole 1 — file-backed writes: completeness claim independently verified

I swept all 15 `STORE_WRITE_FUNCTIONS` store modules myself (`trend`, `idea`, `production-queue/job-store`,
`production-queue/gate-request-store`, `asset`, `post`, `performance`, `brand-asset`, `format`,
`production-spec`, `channel`, `brand`, `copy`, `schedule-outbox`, `run`), grepping each for `node:fs` /
`write` and reading every hit:

- **`src/production-spec/store.ts`** — the only one with a second, distinctly-named file-backed write:
  `saveSpec` (line 73, `writeFileAtomic`) beside SQL-backed `saveProductionSpec` (line 99). Confirmed —
  line numbers match the issue's own reference exactly.
- **`src/asset/store.ts`** — imports `writeFileAtomic`, but only through `writeAsset`'s existing, already-
  tracked, already-allow-list-audited ambiguous-overload shape (file-backed `{ ledgerPath }` vs SQL-backed
  `{ db }`) — not a second, distinctly-named function. Already correctly out of scope, unaffected by this
  change.
- **`src/brand-asset/store.ts`** and **`src/format/store.ts`** — both import `node:fs/promises`
  (`readdir`/`stat`/`readFile`), but only for reads; both carry an explicit doc comment stating their write
  path is "intentionally NOT built in this slice." No write function of any kind, file-backed or
  otherwise, exists in either today.
- The remaining 11 stores have zero `node:fs`/file-write surface at all.

**My independent sweep confirms the developer's completeness claim exactly: `production-spec/store.ts` is
the only one of the 15 with an untracked second file-backed write.** No second hole reopens elsewhere.

I also independently confirmed the `command-surface`-routing rejection is real, not convenient: read
`openspec/specs/command-surface/spec.md`'s own Requirement text — "each taking an already-open,
already-migrated `node:sqlite` `DatabaseSync` as its first argument" — and `saveSpec`'s actual signature
(`async function saveSpec(spec, path): Promise<void>` — no `db` parameter at all). Wrapping it there would
genuinely violate that Requirement's own wording, not just be inconvenient. GitHub issue **#238** exists,
is open, and describes the real migration options (a parallel file-backed orchestration surface, or
retiring `saveSpec` in favor of the SQL-backed path) — not a placeholder.

### Hole 2 — namespace imports: both directions checked

- **Under-catch check (does it genuinely catch the evasion?):** independently reproduced (see "Independent
  reproduction" below) — a real probe file with `import * as store from "../idea/store.ts";
  store.createIdea;` fails the real disk-walking guard, naming all four of `idea/store.ts`'s write
  functions. Caught.
- **Over-catch check (does a read-only namespace import get flagged as a write violation)?** Yes, by
  design — any namespace import of a tracked store reports every one of that store's write functions,
  regardless of which properties are actually called. This is **deliberate conservatism, not a defect**:
  the alternative (a call-site grep for `alias.functionName(`) would itself be evadable by aliasing a
  function reference first (`const fn = alias.createIdea; fn(...)`), which is exactly the class of evasion
  this ticket exists to close. I independently confirmed this is currently costing **zero** allow-list
  noise: `grep -rn "import \* as" src --include='*.ts'` finds exactly one hit repo-wide
  (`src/commands/run-pipeline.ts`, importing `node:readline`, correctly unflagged since it doesn't resolve
  to a tracked store) — no legitimate existing code is affected today. If a genuine read-only namespace
  import of a tracked store appears later, it becomes a one-line, individually-reasoned allow-list entry
  like any other exception — an acceptable, disclosed future cost, not a present one.

### The proof requirement — reproduced independently

I added my own throwaway probe files (not the developer's, to avoid trusting their claimed transcript) and
ran the real disk-walking `store-write-guard.test.ts` against the live repo tree:

```
src/qa-repro-filebacked/bypass.ts:
  import { saveSpec } from "../production-spec/store.ts";
  export async function callIt(): Promise<void> { await saveSpec({}, "x.json"); }

src/qa-repro-namespace/bypass.ts:
  import * as store from "../idea/store.ts";
  export function callIt(): void { store.createIdea; }
```

`node --import tsx --test src/store-write-boundary/store-write-guard.test.ts` → **failed**, naming exactly:
```
src/qa-repro-filebacked/bypass.ts::src/production-spec/store.ts::saveSpec
src/qa-repro-namespace/bypass.ts::src/idea/store.ts::acceptIdea
src/qa-repro-namespace/bypass.ts::src/idea/store.ts::createIdea
src/qa-repro-namespace/bypass.ts::src/idea/store.ts::rejectIdea
src/qa-repro-namespace/bypass.ts::src/idea/store.ts::selectIdeaRecipes
```

Both violations reproduced independently, both named usefully (exact file/store/function triples, not a
vague failure). Deleted both probe files (`rm -rf`), reran the guard — green
(`# tests 1 / # pass 1 / # fail 0`). `git status --short` showed nothing before or after. `git log --all
--diff-filter=A --name-only -- '*bypass.ts' '*qa-repro*' '*qa-verify*'` finds nothing anywhere in branch
history — the branch has exactly one commit (`0b34873`), and its own diff contains no probe files. No
probe file survives anywhere in the branch history, confirmed independently, not just in the working tree.

I also independently reproduced one of the developer's own mutation checks: reverted the new Rule 7
sentence (`Since issue #235, that same` → `REVERTED-TEST that same`), reran `adr.docs-test.ts` — the new
`describe` block's test failed as expected; restored via `git checkout --`, reran — green again. The
always-rules pin genuinely catches a reversal, not just free prose.

### Per-criterion results (issue #235 acceptance criteria)

| # | Criterion | Result | Proof |
|---|---|---|---|
| 1 | A caller outside `src/command-surface/` writing through a store's file-backed function is caught | **PASS** | `scan.test.ts:98-116` (in-memory) + my independent live reproduction above, naming `saveSpec` exactly |
| 2 | `compose.ts`'s `saveSpec` call resolved: routed or allow-listed with reason + migration ticket | **PASS** | `allow-list.ts:77-88` entry with full reasoning; issue #238 filed and substantive, confirmed via `gh issue view 238` |
| 3 | Namespace imports caught or documented as accepted limitation | **PASS (caught)** | `scan.ts` `NAMESPACE_IMPORT_PATTERN`/`findNamespaceImportSites`; `scan.test.ts:118-135` (in-memory) + my independent live reproduction above, naming all four `idea/store.ts` write functions |
| 4 | A test proves each new detection FAILS on a violating module | **PASS** | `scan.test.ts` in-memory fixtures + independently reproduced disk-level failures (this Verdict, above) |
| 5 | Allow-list stays as short as the truth allows, each entry reasoned | **PASS** | Exactly one new entry (`compose.ts` → `saveSpec`), fully reasoned; stale "two"→"three" comment fixed; my independent 15-store sweep confirms no other file newly implicated |

### Per-scenario results (spec deltas, `specs/store-write-boundary-guard/spec.md`)

| Requirement / Scenario | Result | Covering test |
|---|---|---|
| A store's file-backed write function is tracked alongside its SQL-backed one | PASS | `scan.test.ts:63-66` |
| A real import site of a store's file-backed write function is detected the same way a SQL-backed one is | PASS | `scan.test.ts:98-116` + my live reproduction |
| An audited, allow-listed file-backed-write orchestration shell is not flagged | PASS | `store-write-guard.test.ts` real run — `compose.ts`'s entry matches exactly, guard green |
| A namespace import of a tracked store module, followed by a call through the alias, is caught | PASS | `scan.test.ts:118-135` + my live reproduction |
| A namespace import of a module that does not resolve to a tracked store is not flagged | PASS | `scan.test.ts:149-157`; independently confirmed only real repo hit (`node:readline`) is unflagged |
| A bare doc-comment mention describing a namespace-import shape, with no real import statement, is not a match | PASS | `scan.test.ts:181-191`; also self-verified live — `scan.ts`'s own doc comment (which discusses this shape in prose) does not self-flag, since the full suite is green |
| The command surface and test-path exemptions apply to a namespace-import site the same way they apply to a named-import site | PASS | `scan.test.ts:220-238` |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (unaffected) | Diff touches only `src/store-write-boundary/**`, `src/db/adr.docs-test.ts`, `.claude/rules/always/organicgrowth-rules.md`, and the openspec change dir — no generation or publish code touched |
| Public-metrics-only | PASS (unaffected) | No `src/performance/**` or Apify code touched |
| Relative-not-absolute | PASS (unaffected) | No scoring/comparison code touched |
| Explicit-attribution | PASS (unaffected) | No `src/post/**`/attribution code touched |
| Ledger-as-source-of-truth | PASS (unaffected) | `src/ledger/ledger.ts` and `src/production-queue/store.ts` untouched, confirmed by `git diff 60ecfc7 HEAD --name-only`; the proposal correctly keeps `ledger.json`/`data/queue.json` out of this guard's scope as a different, already-covered category |
| No product behaviour changed | PASS | `git diff 60ecfc7 HEAD --name-only` = `.claude/rules/always/organicgrowth-rules.md`, 4 openspec-change files, `src/db/adr.docs-test.ts`, `src/store-write-boundary/{allow-list,scan,scan.test}.ts` only — guard/test/docs, no store, command-surface, or pipeline code |
| `MIGRATION_1`/`MIGRATION_2` byte-for-byte frozen | PASS | `src/db/schema.ts` does not appear in `git diff 60ecfc7 HEAD --name-only` at all — untouched |
| Magnific fake / hermetic | PASS | No MCP, `space-driver`, `apify`, `media-host/live`, or Zoho import anywhere in the touched files (confirmed by reading every changed file's imports: `node:path`, `node:fs/promises` (test-only, real disk walk), `node:test`, `node:assert/strict`); my own two probe-file reproductions used only `node:path`-free store imports, no live call of any kind, files deleted before this Verdict |

### OpenSpec archive-trap check (not archived, per instructions)

`specs/store-write-boundary-guard/spec.md` contains only `## ADDED Requirements` — no `## MODIFIED
Requirements` header anywhere in the file. This deliberately avoids the known MODIFIED-header archive
trap this repo has hit repeatedly. I did not run `openspec archive` (per standing instructions); based on
the header shape alone, archiving this change should not hit that trap.

### Defect list

None. No defects found at any severity.

### Answering the parent task's direct question

**Yes — after this change, #208's worker, #210's viewer, and #211's agent rewrite cannot take either of
the two specifically-named shortcuts past the command surface without the suite going red.** Both holes
confirmed live by #233's Round-1 QA are now closed and independently re-verified by me: a new caller
importing `saveSpec` directly (named or namespace import) fails the build with a named violation, and a
namespace import of any of the 15 tracked stores' write functions fails the build naming every one of that
store's write functions. The one remaining, disclosed gap is `compose.ts`'s own dormant `saveSpec` call,
which is intentionally allow-listed (it is the write-gate itself, not a bypass) and tracked for real
migration under issue #238 — if #211 starts calling `composeSpec` in production, that is exactly the
intended, audited entry point, not a new hole. Two categories remain genuinely out of scope, disclosed
and not part of this issue: raw SQL (`db.prepare(...).run(...)`) issued directly, and file-backed writes
on stores other than `production-spec/store.ts` (none exist today, confirmed by my independent 15-store
sweep).

**Verdict: PASS.**
