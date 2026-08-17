## Why

Issue #202 named **Mention Handle** among the seven stores moving from `{ ledgerPath }` files to
`{ db }` SQL. But #201 — the ticket that actually built the 18-entity schema — never named it: verified
by reading #201's own acceptance criteria verbatim, `mention_handle` is absent from `ENTITY_TABLES`
(`src/db/schema.ts`, frozen), from `CONTEXT.md`'s glossary, and from the epic (#195)'s own schema
section. So the store fell between two tickets: the schema ticket built no table for it, and #222 (the
ticket that actually did the mechanical `{ ledgerPath }` → `{ db }` swap for the other six stores)
correctly declined to invent a `mention_handle` table outside its own spec, flagging the gap explicitly
in its `proposal.md` and `handoff.md` instead of silently dropping the store or papering over the
inconsistency. #222's QA independently re-verified the same gap and recommended the Operator settle it
with a short follow-up. This ticket **is** that follow-up.

**Operator decision, taken 2026-08-17 (issue #226): option (b) — Mention Handle stays a file,
deliberately.** ADR-0029 already carves out human-authored documents (Brand Profile YAML, Format YAML,
the markdown Briefs, the Baseline Prompt documents) as staying files rather than moving into the SQL
schema. A hand-maintained, global mapping of company/product names to platform handles
(`data/mention-handles.yaml`, `src/mention-handle/store.ts`, issue #149) is the same kind of artefact:
small, edited by a person, changed rarely, and — unlike Format, which `run`/`idea`/`baseline_prompt` all
foreign-key into — nothing else in the schema references it. None of epic #195's three original
questions ("top Assets by Performance Score", "every Idea by hook type", "how well Fit Score predicted
Performance") is about mention handles. Moving it to SQL would buy queryability nobody has asked for and
add a migration to maintain forever, for no structural gain. The one thing that WOULD change this
answer is issue #210's read-only Library — if handles must appear there, they need a table — so that
trigger is recorded explicitly in ADR-0029 rather than left for a future reader to re-derive.

This is a **decision-and-documentation slice**: it records the option-(b) decision where it belongs
(ADR-0029's carve-out list), confirms no doc actually claims Mention Handle is SQL-backed today (rule 7
and `openspec/project.md` were already accurate — checked directly, not assumed), and adds a permanent,
tested guard so a later ticket cannot silently invent a `mention_handle` table without also reopening
this ADR. It changes **no product behaviour** — no new migration, no `mention_handle` table, no
`{ db }` option added to `src/mention-handle/store.ts`.

## What Changes

- **ADR-0029's human-authored-documents carve-out list gains the Mention Handle Registry, by name**,
  with the reasoning (small, hand-edited, nothing foreign-keys into it) and the explicit reopening
  trigger (issue #210's Library) — so the carve-out is complete rather than implicit, per this ticket's
  own acceptance criterion.
- **A permanent, code-level regression guard**: `src/db/migrate.test.ts` gains a test proving
  `mention_handle` does NOT exist as a table after migration, mirroring the existing `account`/`user`/
  `connection` negative-space test already in the same file. If a future ticket adds the table without
  also revisiting this ADR, this test — not just prose — catches the drift.
- **`openspec/specs/sqlite-foundation/spec.md`'s "schema covers every entity" Requirement is corrected
  to state the exclusion explicitly**, with a new Scenario proving it, rather than leaving Mention
  Handle's absence to be inferred from what the 18-table list does not mention.
- **A docs-conformance test** (`src/db/adr.docs-test.ts`) pins the new ADR-0029 language, so a future
  prose edit that quietly drops the carve-out fails `npm test` — the same mechanism issue #201/#219/#223
  already use for this ADR's other claims.
- **Audited, found already correct, left untouched**: `CONTEXT.md` (no "Mention Handle" glossary entry
  and no claim it is SQL-backed — confirmed by direct read, matching #222's QA's own independent
  finding), `.claude/rules/always/organicgrowth-rules.md` rule 7 (its SQL-backed store list already
  reads "Asset, Production Spec, Brand, Channel, Format, Brand Asset, Idea, and Trend" — Mention Handle
  was never added), and `openspec/project.md` (its own SQL-backed store list matches rule 7 exactly).
  None of these needed a correction; each is confirmed, not assumed, and the confirmation is recorded in
  this change's `handoff.md`.

## Non-Goals (explicitly out of scope for this slice)

- **No new migration.** `MIGRATION_1` and `MIGRATION_2` (`src/db/schema.ts`) stay byte-for-byte frozen.
  No `MIGRATION_3`, no `mention_handle` table.
- **No `{ db }` option on `src/mention-handle/store.ts`.** It keeps its existing, file-only
  `loadMentionHandleTable`/`resolveMentionHandle`/`resolveLinkedInHandle` shape, untouched.
- **No caller above the store boundary changes shape** — `src/copy/linkedin-mentions.ts` and every
  other reader of the Mention Handle Registry is untouched.
- **Editing issue #202's own (closed) GitHub issue body.** #202 is closed and merged; its historical
  acceptance-criteria text is not corrected in place. The living documents that could mislead a future
  reader — ADR-0029, rule 7, `openspec/project.md`, `CONTEXT.md` — are the ones this ticket verifies and,
  where needed, corrects instead.

## Capabilities

### Modified Capabilities

- `sqlite-foundation`: the "schema covers every entity CONTEXT.md names" Requirement gains an explicit
  statement that Mention Handle is deliberately NOT one of the 18 entity tables, plus a Scenario proving
  `mention_handle` does not exist after migration.

## Impact

- **New code:** `openspec/changes/issue-226-mention-handle-schema-gap/` (this change).
- **Modified code:** `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`, `src/db/adr.docs-test.ts`,
  `src/db/migrate.test.ts`.
- **Untouched (deliberately, and verified by `git diff`):** `src/db/schema.ts`, `src/db/migrate.ts`
  (`MIGRATION_1`/`MIGRATION_2` byte-for-byte frozen), `src/mention-handle/store.ts`,
  `src/mention-handle/lookup.ts`, every real caller of the Mention Handle Registry, `CONTEXT.md`,
  `.claude/rules/always/organicgrowth-rules.md`, `openspec/project.md` — audited and confirmed already
  accurate, so left as-is.
- **Hermetic, no live Space or Zoho MCP calls.** The one new test (`migrate.test.ts`) opens a REAL,
  empty, throwaway SQLite file via `src/db/test-support.ts`'s `withTempDb` (never `:memory:`), mirroring
  every other test in this capability. No `magnific`/Zoho MCP tool is imported or called by any file
  this slice touches — this slice never reaches the Magnific fake either, since it touches no
  Space-facing code at all.
- **Always-rules upheld:** this slice touches no content-generation, publication, or metrics code —
  generate-never-publish / public-metrics-only / relative-not-absolute / explicit-attribution are
  untouched by construction. Ledger-as-source-of-truth is untouched: no store's backing option changes,
  and `ledger.json` stays canonical exactly as rule 7 already states.
