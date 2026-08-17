## 1. Verify the gap and audit every doc that could claim Mention Handle is SQL-backed

- [x] 1.1 Re-read #201's own acceptance criteria verbatim (`gh issue view 201`) and confirm
  `mention_handle` is absent from its schema AC and from `ENTITY_TABLES` (`src/db/schema.ts`).
- [x] 1.2 Grep the whole repo (not just `CONTEXT.md`) for any prose claiming Mention Handle is, or will
  be, SQL-backed: `CONTEXT.md`, `openspec/project.md`, `.claude/rules/always/organicgrowth-rules.md`,
  `.claude/agents/producer.md`, `.claude/skills/write-social-copy/SKILL.md`,
  `openspec/specs/mention-handle-lookup/spec.md`, `openspec/specs/copy-composition/spec.md`. Result:
  none found — rule 7 and `openspec/project.md` already list only the eight real SQL-backed stores
  (Asset, Production Spec, Brand, Channel, Format, Brand Asset, Idea, Trend); `CONTEXT.md` has no
  "Mention Handle" glossary entry to begin with.

## 2. Record the decision in ADR-0029 (test-first)

- [x] 2.1 Write the failing docs-test in `src/db/adr.docs-test.ts`: ADR-0029's carve-out list names the
  Mention Handle Registry by name and path, and names issue #210's Library as the concrete trigger that
  would reopen the decision.
- [x] 2.2 Extend ADR-0029's "Documents a human authors or reads directly stay files" bullet: add the
  Mention Handle Registry, the reasoning (small, hand-edited, nothing foreign-keys into it), the dates/
  issues (#201, #222, #226), and the explicit #210 reopening trigger. No other section of the ADR is
  restructured.

## 3. A permanent, code-level regression guard (test-first)

- [x] 3.1 Add a test to `src/db/migrate.test.ts`: after `runMigrations`, `mention_handle` does not exist
  in `sqlite_master` — mirrors the existing `account`/`user`/`connection` negative-space test in the same
  file, citing ADR-0029 and issue #226.
- [x] 3.2 Confirm it passes against the frozen `MIGRATION_1`/`MIGRATION_2` with zero schema changes (it
  does, by construction — no migration is added).

## 4. OpenSpec spec delta

- [x] 4.1 `specs/sqlite-foundation/spec.md`: MODIFIED Requirement — "The schema covers every entity
  CONTEXT.md names..." gains an explicit paragraph stating Mention Handle is deliberately excluded, plus
  a new Scenario proving `mention_handle` does not exist after migration.
- [x] 4.2 `openspec validate --strict` on this change, then `openspec validate --all --strict`.

## 5. Full suite green, self-review, Build Report

- [x] 5.1 `npx tsc -p tsconfig.json --noEmit`, `npm test` — both green, count at or above baseline
  (2987/762/0 fail), no new migration, `MIGRATION_1`/`MIGRATION_2` byte-for-byte unchanged.
- [x] 5.2 Self-review: confirm no store logic, no product-behaviour file, and no caller above the store
  boundary was touched — this slice is documentation + one ADR + two tests only.
- [x] 5.3 Write the Build Report into `handoff.md`, mapping every applicable (option-b) acceptance
  criterion from issue #226 to the specific test or file that proves it.
