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
