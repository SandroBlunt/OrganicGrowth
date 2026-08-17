# Slice Handoff — issue #226: Mention Handle has no schema table — a gap between #201 and #202

Bidirectional document. developer's Build Report is below; qa appends its Verdict beneath, in a new
section — nothing here is overwritten.

## Build Report (Round 1)

### What changed

Issue #226 asked for a decision between two options and gave the recommendation up front:
**option (b) — Mention Handle stays a file, deliberately.** This slice records that decision and closes
the gap #222 correctly flagged rather than papered over (#222's own `proposal.md`/`handoff.md` already
concluded Mention Handle should not move to SQL; this ticket is where that conclusion becomes a durable,
tested decision instead of a finding buried in one archived change's handoff).

This is a **pure documentation-and-decision slice** — no product behaviour changes, no new migration, no
`mention_handle` table, no `{ db }` option added to `src/mention-handle/store.ts`. The only executable
change is two new tests that assert a negative (the table still doesn't exist, the ADR still says why).

Concretely:

1. **ADR-0029's human-authored-documents carve-out now names the Mention Handle Registry explicitly**,
   with the reasoning (small, hand-edited by the Operator, changes rarely, nothing else in the schema
   foreign-keys into it) and the one thing that would reopen it — issue #210's read-only Library, if
   handles ever need to appear there. Before this change the carve-out list was Brand Profile YAML,
   Format YAML, the Briefs, and the Baseline Prompt documents only; Mention Handle fit the same shape but
   was never named, which is exactly the "implicit, not complete" gap the issue asked to close.
2. **A permanent, code-level regression guard** in `src/db/migrate.test.ts`, mirroring the existing
   `account`/`user`/`connection` negative-space test in the same file: after a fresh migration,
   `mention_handle` is asserted absent from `sqlite_master`. If a future ticket adds the table without
   also revisiting ADR-0029, this test — not just prose — fails.
3. **`openspec/specs/sqlite-foundation/spec.md`'s "schema covers every entity" Requirement** is
   corrected via a MODIFIED delta to state the exclusion explicitly and carries the same Scenario as (2).
4. **A docs-test** (`src/db/adr.docs-test.ts`) pins the new ADR-0029 language, so a future prose edit
   that quietly drops the carve-out fails `npm test` the same way #201/#219/#223's existing ADR-0029
   assertions already do.
5. **Audited and found already correct, left untouched**: `CONTEXT.md`, rule 7
   (`.claude/rules/always/organicgrowth-rules.md`), and `openspec/project.md`. See "Acceptance-criteria
   self-assessment" below for the evidence — I did not assume these were fine, I grepped and read each
   one directly, the same way #222's own QA independently re-verified the gap rather than taking the
   Build Report's word for it.

### Files touched

Modified:
- `docs/adr/0029-local-sqlite-behind-the-store-boundary.md` — the carve-out bullet gains the Mention
  Handle Registry, its reasoning, and the #210 reopening trigger.
- `src/db/adr.docs-test.ts` — new `describe` block pinning the new ADR-0029 language.
- `src/db/migrate.test.ts` — new test asserting `mention_handle` does not exist after migration.

New:
- `openspec/changes/issue-226-mention-handle-schema-gap/` (this change: `proposal.md`, `tasks.md`,
  `specs/sqlite-foundation/spec.md`, `handoff.md`).

Untouched (deliberately, and verified — see below): `src/db/schema.ts`, `src/db/migrate.ts`,
`src/mention-handle/store.ts`, `src/mention-handle/lookup.ts`, every real caller of the Mention Handle
Registry (`src/copy/linkedin-mentions.ts`, `src/copy/compose.ts`), `CONTEXT.md`,
`.claude/rules/always/organicgrowth-rules.md`, `openspec/project.md`.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-226-mention-handle-schema-gap
npx tsc -p tsconfig.json --noEmit
npm test                                             # 2990 / 763 suites / 0 fail (baseline: 2987/762/0)
npm run test:docs                                    # 286 / 77 suites / 0 fail
npx openspec validate issue-226-mention-handle-schema-gap --strict
npx openspec validate --all --strict                 # 54 passed, 0 failed (baseline: 53)
```

To run just this ticket's new/changed assertions:
```
node --import tsx --test src/db/migrate.test.ts src/db/adr.docs-test.ts
```

`git diff main -- src/db/schema.ts src/db/migrate.ts` is empty — `MIGRATION_1`/`MIGRATION_2` are
byte-for-byte unchanged, as required.

### Acceptance-criteria self-assessment

Issue #226's acceptance criteria are written to cover both options. Only the option-(b) ones apply,
since the Operator's decision (recorded in the issue body and confirmed in this build's directive) is
(b). Mapped below; the option-(a) criterion is explicitly marked not applicable, not silently skipped.

- **"The decision is recorded in ADR-0029, whichever way it goes, so the carve-out list is complete
  rather than implicit."** — MET. `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`'s carve-out
  bullet now names the Mention Handle Registry, its path, its reasoning, and the #210 reopening trigger.
  Proven by `src/db/adr.docs-test.ts`'s new `describe("ADR-0029's human-authored-documents carve-out
  names Mention Handle explicitly (issue #226)")` block (2 tests, both green) — pinned against the
  registry name/path and the "#210" citation, not against a full free-prose sentence, per this repo's
  docs-test convention.
- **"If SQL: a `mention_handle` table lands as a new additive migration..."** — NOT APPLICABLE. Option
  (a) was not taken. Confirmed by construction: `git diff main -- src/db/schema.ts src/db/migrate.ts` is
  empty, and `src/db/migrate.test.ts`'s new test asserts `mention_handle` is absent from a freshly
  migrated database.
- **"If file: `CONTEXT.md` and #202's store list are corrected so no later ticket re-opens this."** —
  MET, but the finding is that there was nothing to correct in the living documents, which I verified
  directly rather than assumed:
  - `CONTEXT.md`: `grep -in mention CONTEXT.md` returns only the unrelated Copy-element sense of
    "mentions" (caption text, e.g. "caption, hashtags, mentions, CTA") — there is no "Mention Handle"
    glossary entry at all, so none exists to be wrong.
  - Rule 7 (`.claude/rules/always/organicgrowth-rules.md`): its SQL-backed store list already reads
    "the Asset, Production Spec, Brand, Channel, Format, Brand Asset, Idea, and Trend stores" — Mention
    Handle was never added to it (this list was written correctly by #222/#223, which both concluded
    Mention Handle stays file-based).
  - `openspec/project.md`: its own SQL-backed store list ("Asset, Production Spec, Brand, Channel,
    Format, Brand Asset (issue #222), and Idea/Trend (issue #223)") matches rule 7 exactly and also
    excludes Mention Handle. I checked this file specifically because #223's handoff notes it drifted
    once before (a stale paragraph unedited since #201) — this time it did not need a fix.
  - Issue #202 itself (closed, merged, historical) is NOT edited in place — see "Known limits" below for
    the reasoning. The durable correction lives in ADR-0029 plus the new regression test, which is
    stronger than editing one closed issue's checkbox text: it fails the build if the gap ever reopens
    silently, rather than relying on a reader finding the right closed issue.
  - So this ticket's actual, load-bearing correction is ADR-0029 (item 1 above) — `CONTEXT.md`/rule 7/
    `project.md` needed auditing, not editing.
- **"Either way, no caller above the store boundary changes shape."** — MET. `git status`/`git diff`
  confirm the only files touched are one ADR, two test files, and this OpenSpec change directory.
  `src/mention-handle/store.ts`, `src/mention-handle/lookup.ts`, and every real caller
  (`src/copy/linkedin-mentions.ts`, `src/copy/compose.ts`) are byte-for-byte unchanged.

### Fakes / fixtures used

- **Magnific fake: NOT USED, and not needed.** This slice touches no Space-facing code — no file under
  `src/space-driver/`, `src/producer/`, or any `spaces_*`/`creations_*`-calling module was read or
  edited. Grepped the full diff for `spaces_`/`creations_`/`magnific`: zero hits. No live Space or Zoho
  MCP tool is imported or called anywhere in this change.
- **SQLite fixture**: the one new test (`src/db/migrate.test.ts`) uses `src/db/test-support.ts`'s
  `withTempDb` — a real, throwaway, file-backed SQLite database created fresh per test and removed
  afterward, never `:memory:` — the same convention every other test in this capability already uses.

### Self-review notes

- Kept the ADR edit to a single bullet's extension, matching the instruction to "follow the ADR's
  existing prose style; do not restructure it" — no other section of ADR-0029 was touched.
- Considered adding a new `CONTEXT.md` glossary entry for "Mention Handle Registry" (the term exists
  informally in `src/mention-handle/lookup.ts`'s module doc and in the `mention-handle-lookup` OpenSpec
  capability, but never as a formal CONTEXT.md glossary term). Decided against it: the issue's own AC
  asks for CONTEXT.md to be *corrected*, not extended with new vocabulary, and CONTEXT.md carried no
  incorrect claim to correct. Adding a new glossary term would be scope creep beyond this issue's actual
  gap (the ADR-0029 carve-out completeness) and risks coining vocabulary the Operator didn't ask for.
  Flagging this judgment call here rather than making it silently.
- Considered adding an ADR-0029 citation to `src/mention-handle/store.ts`'s / `lookup.ts`'s own module
  doc comments for discoverability. Decided against touching those files at all — the brief was explicit
  that finding myself editing store logic is a stop-and-argue signal, and even a comment-only edit to
  the store the whole ticket is about felt like the wrong place to test that boundary when the ADR and
  the regression test already carry the decision durably.
- Chose NOT to edit issue #202's own GitHub issue body (it is closed and merged). Recorded this as an
  explicit Non-Goal in `proposal.md` with the reasoning: a closed issue's historical AC text is not a
  living document, and the durable fix — a superseding ADR bullet plus a permanent test — is a stronger
  guarantee against a "later ticket re-opening this" than editing one closed issue's checkbox would be.
  If the Operator wants #202's GitHub text corrected too, that is a one-line `gh issue edit`, easy to do
  as a follow-up, but I did not do it unasked since it is outside what a build agent normally touches.

### Known limits

- This slice does not touch `src/mention-handle/store.ts` or `lookup.ts` at all — by design (see
  Non-Goals in `proposal.md`). If a future ticket (triggered by issue #210's Library) decides Mention
  Handle DOES need SQL after all, that ticket will need to: add a new additive migration
  (`MIGRATION_3`, following `MIGRATION_2`'s own pattern), give the store a `{ db }` option matching the
  six #222 shipped, and revert/amend the ADR-0029 bullet and the `migrate.test.ts` negative-space test
  this slice adds — all called out explicitly in the new ADR language so that ticket knows exactly what
  to undo.
- Issue #202's own GitHub issue body still literally lists "Mention Handle stores" among the seven to
  swap — left uncorrected in place, per the judgment call above.
