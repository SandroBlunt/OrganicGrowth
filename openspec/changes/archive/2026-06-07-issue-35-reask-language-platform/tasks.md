## 1. Spec delta (before any code)

- [x] 1.1 Write the spec delta for `run-pipeline-conductor` under
  `openspec/changes/issue-35-reask-language-platform/specs/run-pipeline-conductor/spec.md`
  — MODIFIED Requirement "The new-Brand interview SHALL be staged with pre-scout fields only before
  scouting": add/replace Language and Platform collection sub-requirements to mandate re-ask loops
  with bounded caps instead of silent defaults.
- [x] 1.2 Run `openspec validate issue-35-reask-language-platform --strict` and confirm green.

## 2. Failing tests (test-first)

- [x] 2.1 Add failing tests to `src/commands/run-pipeline-onboarding.test.ts` covering:
  - Empty language triggers re-ask (not silent default `"en"`).
  - Non-empty language accepted on first valid entry.
  - Empty platform triggers re-ask (not silent default `"facebook"`).
  - Unrecognised platform (e.g. `"fb"`, `"tiktok"`) triggers re-ask with a message naming the
    accepted values.
  - Valid platform case-insensitive (`"Facebook"`) is accepted.
  - Cap-exceeded on language stops cleanly with `done: true` and no Brand directory created.
  - Cap-exceeded on platform stops cleanly with `done: true` and no Brand directory created.
- [x] 2.2 Run `node --import tsx --test src/commands/run-pipeline-onboarding.test.ts` — confirm
  failures (pre-implementation).

## 3. Implementation

- [x] 3.1 Replace Language single-yield+default with a bounded re-ask loop (cap 3) in
  `src/commands/run-pipeline.ts` `runNewBrandInterview`.
- [x] 3.2 Replace Platform single-yield+fallthrough with a bounded re-ask loop (cap 3) in
  `src/commands/run-pipeline.ts` `runNewBrandInterview`.
- [x] 3.3 Confirm `language` and `platform` are assigned only from validated Operator input.
- [x] 3.4 Run `node --import tsx --test src/commands/run-pipeline-onboarding.test.ts` — confirm all
  passing.

## 4. Full suite

- [x] 4.1 Run `npm test` (type-checks + full suite) — confirm all green.

## 5. Self-review

- [x] 5.1 `openspec validate issue-35-reask-language-platform --strict` green.
- [x] 5.2 `npm test` green.
- [x] 5.3 Simplify / dead-code pass: each AC maps to named test(s); no dead branches; cap constants
  are named and consistent with existing loops.
- [x] 5.4 Write the Build Report into `handoff.md`.
