## 1. Read the terrain before writing any code

- [x] 1.1 Read #233's `handoff.md` Round-1 QA Verdict in full (Scope decision 2, the Must-fail proof, the
  "What would close it" pointer) — start from what QA already specified rather than re-deriving it.
- [x] 1.2 Confirm Hole 1 is live-but-dormant: `grep -rn "composeSpec" src --include='*.ts'` outside tests
  returns only `compose.ts`'s own definition; `grep -rn "saveSpec" src --include='*.ts'` confirms every
  other caller is a `*.test.ts` file or a fixture doc-comment mention, never a real import.
- [x] 1.3 Confirm Hole 1's scope: read all 15 `STORE_WRITE_FUNCTIONS` store modules for a second,
  distinctly-named file-backed write export (`grep`/read each for `writeFileAtomic`/`node:fs`) — only
  `src/production-spec/store.ts` has one.
- [x] 1.4 Confirm Hole 2 is real and currently unexploited: `grep -rn "import \* as" src --include='*.ts'`
  finds exactly one hit repo-wide (`node:readline` in `run-pipeline.ts`), none against a tracked store.
- [x] 1.5 Read `openspec/specs/command-surface/spec.md` to confirm its own Requirement fixes every
  function's shape to a `DatabaseSync`-first-argument — the reason `compose.ts` is allow-listed rather than
  routed there (recorded in `proposal.md` before implementing anything).

## 2. Close Hole 1 — file-backed store writes (test-first)

- [x] 2.1 Add `"saveSpec"` to `STORE_WRITE_FUNCTIONS["src/production-spec/store.ts"]`
  (`src/store-write-boundary/scan.ts`), with a doc comment explaining the distinct-name vs. `writeAsset`
  overload-ambiguity contrast.
- [x] 2.2 Add `src/production-spec/compose.ts` → `src/production-spec/store.ts` → `saveSpec` to
  `STORE_WRITE_BOUNDARY_ALLOW_LIST`, with the full reasoning (orchestration-shell relationship,
  command-surface's own `DatabaseSync`-shape Requirement, zero production callers today, pointer to the
  migration ticket).
- [x] 2.3 File the migration-tracking GitHub issue (#238) before writing the allow-list entry's pointer to
  it, so the reference is real, not a promise.
- [x] 2.4 Run `store-write-guard.test.ts` — green against the real repo with the new entry, no other
  file-backed write surfaced.

## 3. Close Hole 2 — namespace imports (test-first)

- [x] 3.1 Write `scan.test.ts` cases first: a namespace import of a tracked store module reports every one
  of that store's write functions; a namespace import of an unrelated/non-store module is not matched; a
  bare doc-comment mention of a namespace-import shape (no real import statement) is not matched; the
  command-surface and test-path exemptions apply to namespace sites too.
- [x] 3.2 Implement `NAMESPACE_IMPORT_PATTERN` + `findNamespaceImportSites` in `scan.ts`, merged into
  `findStoreWriteImports` alongside the existing named-import sites. Record the "all functions, not a
  call-site grep" design decision in `proposal.md` before/alongside implementing it.
- [x] 3.3 Run `scan.test.ts` — green.

## 4. Prove each new detection actually fails on a violating module (not just observed passing)

- [x] 4.1 Add a throwaway module directly importing `saveSpec` from `src/production-spec/store.ts`
  (NOT `compose.ts` — a different, hypothetical caller), outside `src/command-surface/`, not allow-listed —
  run `store-write-guard.test.ts` against it, confirm a real, named failure.
- [x] 4.2 Add a second throwaway module using the issue's own quoted shape
  (`import * as store from "../idea/store.ts"` then `store.createIdea(...)`) — run the same guard, confirm
  a real, named failure listing all four of `idea/store.ts`'s write functions.
- [x] 4.3 Delete both throwaway modules; confirm `git status --short` is clean and the guard is green
  again.
- [x] 4.4 Encode both proofs permanently as in-memory `scan.test.ts` cases, so the failing-guard proof
  survives without leaving landmine files in `src/`.
- [x] 4.5 Mutation-check the new tests themselves: temporarily remove `saveSpec` from
  `STORE_WRITE_FUNCTIONS` and confirm the new file-backed tests fail; temporarily strip the namespace-site
  merge from `findStoreWriteImports` and confirm the new namespace tests fail. Restore both; confirm green
  and `git diff` shows no residual change.

## 5. Keep the allow-list honest

- [x] 5.1 Correct `allow-list.ts`'s top-of-file comment's stale "two" pre-existing test/crash fixtures to
  "three" (issue #209's `crash-schedule-worker.ts` entry was already present but uncounted — a pre-existing
  staleness, tidied while already touching this file's header, not introduced by this change).
- [x] 5.2 Confirm no other new violation surfaced repo-wide from either extension (the real-repo
  `store-write-guard.test.ts` run in task 2.4 / 3.3 is the proof — green with only the one new entry
  added).

## 6. Docs accuracy

- [x] 6.1 Add one sentence to rule 7 (`.claude/rules/always/organicgrowth-rules.md`) naming both
  extensions, alongside its existing #233 sentence. Do not touch any other already-pinned sentence.
- [x] 6.2 Pin it with a new `describe` block in `src/db/adr.docs-test.ts`, mirroring #233's own precedent.
  Mutation-check: temporarily corrupt the new sentence, confirm the new docs-test fails; restore, confirm
  green.

## 7. OpenSpec + full-suite green + self-review + Build Report

- [x] 7.1 Author the spec delta: `specs/store-write-boundary-guard/spec.md` (ADDED Requirements only —
  extends the existing capability without altering any existing Requirement's wording, avoiding the
  MODIFIED-header archive trap this repo has hit before). Run `openspec validate --strict` until green.
- [x] 7.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test` — all green, at/above the 3303/862/0-fail
  baseline measured on this branch before any code changed.
- [x] 7.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #235
  acceptance criterion maps to a specific test.
- [x] 7.4 Write the Build Report into `handoff.md`.
