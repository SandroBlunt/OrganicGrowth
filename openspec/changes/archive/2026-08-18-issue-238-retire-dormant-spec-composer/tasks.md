# Tasks — issue #238: retire the dormant file-backed Production Spec composer

Dead-code removal + doc reconciliation, not a behavior change. Test-first where a NEW assertion is
introduced (the allow-list's own exactness test proving the pairing was removed correctly); every other
step is a deletion or a doc-comment fix, verified by the pre-existing suite staying green.

## 1. Re-confirm the dormant pairing is genuinely dead, fresh

- [x] `grep -rn "composeSpec" src --include='*.ts'` — confirm every hit is inside
      `src/production-spec/compose.ts` or `src/production-spec/compose.test.ts` themselves, nothing else.
- [x] `grep -rln "ComposeResult\|ComposeOptions\|ComposeFailureReason" src --include='*.ts'` — confirm the
      only file is `compose.ts` itself (its exported types are not imported anywhere).

## 2. Delete the dormant module and its test

- [x] Delete `src/production-spec/compose.ts`.
- [x] Delete `src/production-spec/compose.test.ts`.
- [x] `npm test` — confirm the suite is still green with these two files gone (their own coverage was
      entirely self-contained: `generate()`/`validate()`/`scanForBannedWords()`/`saveSpec()` each still
      have their own independent test files, untouched).

## 3. Remove the allow-list entry and its stale doc-comment claims

- [x] Remove `src/store-write-boundary/allow-list.ts`'s `{ path: "src/production-spec/compose.ts", ... }`
      entry and its dedicated "The file-backed Production Spec write's own orchestration shell" comment
      block.
- [x] Trim the file's own top doc-comment's "a file-backed write's own orchestration shell (issue #235;
      today, `src/production-spec/compose.ts`...)" sentence so it no longer cites a deleted file — note
      the category exists (issue #235) but currently has no live example.
- [x] `npm test` — confirm `src/store-write-boundary/store-write-guard.test.ts`'s own exactness test still
      passes with NO replacement entry: `saveSpec` is reached only through
      `src/command-surface/production-spec.ts` (exempt by path), so removing the entry without a
      replacement is correct, not a hole. (Verified by reasoning through the test's own two-directional
      `newViolations`/`staleEntries` check: deleting the entry removes it from `allowed`; deleting
      `compose.ts` from disk removes the corresponding triple from `found`; both sides drop the SAME key,
      so the sets stay equal either way — proving the guard's own test is what catches an unpaired half
      of this change, exactly as the Agent Brief's "Key interfaces" section describes.)

## 4. Fix the one stale doc-comment in store.ts

- [x] `src/production-spec/store.ts`'s top doc-comment still names `compose.ts` as where "the gate that
      only valid, brand-safe Specs reach disk lives" — update it to name the real, current gate
      (`authorSpecForRecipe` + `auditAuthorPhase`, at accept time, ADR-0031) instead of a file that no
      longer exists.

## 5. Reconcile the `production-spec` OpenSpec capability

- [x] REMOVE the "Compose and persist a Production Spec beside the Brief, segmented by Recipe"
      Requirement (with Reason + Migration, pointing at the Requirements that already cover the same
      ground under the current design).
- [x] ADD "The file-backed Production Spec is located and persisted beside its Brief, segmented by
      Recipe" — the still-true, still-tested `specPathFor`/`saveSpec`/`generate()` companies-passthrough
      contract, framed around the primitives themselves rather than "the Producer composes", with
      scenarios that map onto `store.test.ts`/`generate.test.ts`'s existing, unmodified tests.
- [x] MODIFY "Producer agent definition" (title byte-identical, to avoid the known MODIFIED-header
      archive-fold trap) — its body/scenario no longer claim the Producer generates the Spec; the
      existing docs-test (`producer-agent.docs-test.ts`) continues to pass unmodified either way (its own
      assertions are coarse substring checks, not a literal "generates" claim).

## 6. Reconcile the `store-write-boundary-guard` OpenSpec capability

- [x] MODIFY "a tracked store's file-backed write function, when it exists under its own distinct export
      name, is named and audited too" (title byte-identical) — rewrite its "an audited, allow-listed
      file-backed-write orchestration shell is not flagged" scenario to use a hypothetical module instead
      of the now-deleted `compose.ts`, mirroring the capability's own existing hypothetical-fixture style
      elsewhere in the same spec file.

## 7. Validate and self-review

- [x] `openspec validate --strict` — green for this change.
- [x] `npm test` — full suite green, same 4072-test count minus `compose.test.ts`'s own removed cases.
- [x] `npm run build` — confirm the deletion doesn't break the TypeScript build.
- [x] One self-review/simplify pass: confirm no other file (docs, comments, other specs) still references
      `compose.ts`/`composeSpec` outside `src/copy/` (explicitly out of scope) and the two OpenSpec
      Requirements deliberately left untouched for being out of scope (the historical, non-authorship
      `recipe-registry` module-name list; `copy-composition`'s unrelated `src/copy/compose.ts` analogy).
