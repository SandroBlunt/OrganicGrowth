## 1. Read the terrain before writing any code

- [x] 1.1 Read #205's `handoff.md` Round-1 QA Verdict in full (the defect it names, the live-demonstrated
  bypass, the "what would close it" pointer) — start from what QA already specified rather than
  re-deriving it.
- [x] 1.2 Read every SQL-backed (`db: DatabaseSync` first-argument) domain store shipped by
  #201/#222/#223/#203 (`trend`, `idea`, `production-queue/job-store`,
  `production-queue/gate-request-store`, `asset`, `post`, `performance`, `brand-asset`, `format`,
  `production-spec`, `channel`, `brand`, `copy`) and name every write-function export.
- [x] 1.3 Grep every write-function name across `src/`, excluding `*.test.ts`, and read each hit's actual
  line — not just the filename — to separate a real import site from a doc-comment mention (the same
  false-positive class #205's `scan.ts` doc comment tripped on itself) and from an unrelated name
  collision (`listBrands` — two different functions in two different files).
- [x] 1.4 Confirm no file in `src/` imports any target store module via `import * as X from "..."`
  namespace syntax (the one detection gap this guard's simple, AST-free matching accepts).
- [x] 1.5 Decide reads-vs-writes scope and write the reasoning into `proposal.md` before implementing
  anything (the issue's own explicit ask: record the decision, not just make it).

## 2. The store-write boundary guard, landed as a ratchet (test-first)

- [x] 2.1 Write `src/store-write-boundary/scan.test.ts` first (pure, in-memory fixtures):
  `isTestPath`/`isCommandSurfacePath`, a real named-import site matched, a bare doc-comment mention of a
  write-function name NOT matched, a name collision (`listBrands`-shaped: same bare name, wrong module
  specifier) NOT matched, and `findStoreWriteImports` returning the exact (file, store, function) triples
  for a small in-memory fixture set.
- [x] 2.2 Implement `src/store-write-boundary/scan.ts` — `STORE_WRITE_FUNCTIONS`, `isTestPath`,
  `isCommandSurfacePath`, `findStoreWriteImports`. Real import/require-SITE + specifier-resolution match,
  never a bare name search.
- [x] 2.3 Write `src/store-write-boundary/allow-list.ts` with today's real, audited exceptions (the two
  fixtures + the five `writeAsset` file-overload callers) — the ratchet's starting checkpoint, proven
  against the real state, not a pre-solved one (there is no sweep this time — the audit found zero genuine
  bypasses).
- [x] 2.4 Write `src/store-write-boundary/store-write-guard.test.ts` (the one place this check touches
  disk): walk `src/`, assert `findStoreWriteImports` returns exactly the allow-list's triples, both
  directions. Run it — green against the real, audited state.

## 3. Prove the guard actually fails (not just observed passing)

- [x] 3.1 Add a throwaway module directly importing a store's write function (e.g. `createTrend` from
  `src/trend/store.ts`, outside `src/command-surface/` and not allow-listed) and run
  `store-write-guard.test.ts` against it — confirm a real, named failure.
- [x] 3.2 Delete the throwaway module; confirm `git status` is clean and the guard is green again.
- [x] 3.3 Encode the same proof permanently as an in-memory `scan.test.ts` case (a fixture `SourceFile`
  representing an un-allow-listed import), so the failing-guard proof survives without leaving a landmine
  file in `src/`.

## 4. Docs accuracy

- [x] 4.1 Add one sentence to rule 7 (`.claude/rules/always/organicgrowth-rules.md`) naming the new
  guard, alongside its existing `node:fs` guard sentence. Do not touch any other already-pinned sentence.

## 5. OpenSpec + full-suite green + self-review + Build Report

- [x] 5.1 Author the spec delta: `specs/store-write-boundary-guard/spec.md` (ADDED). Run
  `openspec validate --strict` until green.
- [x] 5.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 3100/800/0-fail
  baseline measured on this branch before any code changed.
- [x] 5.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #233
  acceptance criterion maps to a specific test.
- [x] 5.4 Write the Build Report into `handoff.md`.
