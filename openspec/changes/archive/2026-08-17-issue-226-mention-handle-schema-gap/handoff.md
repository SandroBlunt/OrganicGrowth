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
  afterward, never `:memory:`, the same convention every other test in this capability already uses.

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

## QA Verdict — Round 1: PASS

### Suite result

All commands re-run fresh, from a clean worktree (`git status` clean before and after), inside
`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-226-mention-handle-schema-gap` on
`issue-226-mention-handle-schema-gap` (HEAD `00d75a5`, parent `db11f7d` = `main`). No product code was
edited by qa (one attempted transient mutation-test edit to `src/db/schema.ts`, described below, was
blocked before it landed — `git status` confirms the tree stayed clean throughout).

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean, no output, exit 0 |
| `npm test` | **2990 / 763 suites / 0 fail** (matches Build Report exactly; baseline `main`@`db11f7d` = 2987/762/0 — delta of +3 tests / +1 suite is exactly the 3 new assertions this slice adds: 1 in `migrate.test.ts`, 2 in a new `describe` block in `adr.docs-test.ts`) |
| `npm run test:docs` | **286 / 77 suites / 0 fail** (matches Build Report) |
| `npx openspec validate issue-226-mention-handle-schema-gap --strict` | `Change 'issue-226-mention-handle-schema-gap' is valid`, exit 0 |
| `npx openspec validate --all --strict` | **54 passed, 0 failed** (matches Build Report; the +1 over the stated baseline of 53 is exactly this change's own `change/issue-226-mention-handle-schema-gap` entry — only one `change/*` item appears in the output, so no sibling in-flight slice is currently polluting this worktree's count) |

All real green, actually run, not assumed.

### Per-criterion results (issue #226, option-b criteria only — option-a is N/A by the Operator's own
directed choice, and is correctly marked N/A rather than skipped)

1. **"The decision is recorded in ADR-0029, whichever way it goes, so the carve-out list is complete
   rather than implicit."** — **PASS**. Read `docs/adr/0029-local-sqlite-behind-the-store-boundary.md`
   directly (`git diff main` on it is a single, surgical bullet extension, nothing else in the ADR
   touched): the human-authored-documents carve-out bullet now reads "...and the Mention Handle
   Registry (`data/mention-handles.yaml`, `src/mention-handle/store.ts`)", with the small/hand-edited/
   nothing-foreign-keys-into-it reasoning and an explicit "This carve-out is not permanent... issue
   #210's read-only Library" reopening trigger. Proven green by
   `src/db/adr.docs-test.ts`'s new `describe("ADR-0029's human-authored-documents carve-out names
   Mention Handle explicitly (issue #226)")` (2 tests, both pass under `npm test`).
2. **"If SQL: ..."** — **N/A**, correctly. `git diff main -- src/db/schema.ts src/db/migrate.ts`
   confirmed empty by qa directly (not just cited). `ENTITY_TABLES` in `src/db/schema.ts` (pre-existing,
   untouched) lists exactly the same 18 tables as before, no `mention_handle`.
3. **"If file: `CONTEXT.md` and #202's store list are corrected so no later ticket re-opens this."** —
   **PASS on the substance, with one literal deviation qa ruled on separately below.** qa independently
   re-ran the audit rather than trusting the Build Report's grep results:
   - `grep -in mention CONTEXT.md` (qa's own run): only unrelated Copy-element "mentions" hits (caption
     text) — no "Mention Handle" glossary entry exists, confirming there was nothing to correct.
   - Rule 7 (`.claude/rules/always/organicgrowth-rules.md`, line 33-34, read in full by qa): "...is now
     the backing of the Asset, Production Spec, Brand, Channel, Format, Brand Asset, Idea, and Trend
     stores..." — Mention Handle is not in this list. Confirmed accurate, untouched.
   - `openspec/project.md` (lines 26-33, read in full by qa — checked with extra care per the
     instruction that this file is known to drift, since #223 had to fix a stale paragraph in it):
     "...now backs typed `{ db }` stores for Asset, Production Spec, Brand, Channel, Format, Brand Asset
     (issue #222), and Idea/Trend (issue #223)..." — Mention Handle is absent from this list too.
     **No stale claim found here either** — the developer's claim holds up under qa's own independent
     read, not just a trusted grep.
   - Broader sweep qa also ran (beyond the Build Report's own list): `.claude/agents/producer.md`,
     `.claude/skills/write-social-copy/SKILL.md`, `openspec/specs/mention-handle-lookup/spec.md`,
     `openspec/specs/copy-composition/spec.md` — all "mention" hits are about the `@mention`
     weave/validate feature (issue #130), never a claim that the Mention Handle Registry itself is
     SQL-backed. `openspec/specs/mention-handle-lookup/spec.md` explicitly still says "hand-edited file,
     `data/mention-handles.yaml`". No tracked living document was found implying SQL-backing anywhere.
   - Issue #202's own (closed) GitHub body was **not** edited — see qa's ruling below.
4. **"Either way, no caller above the store boundary changes shape."** — **PASS**. `git diff main
   --name-status` (qa's own run): only `docs/adr/0029-...md` (M), `src/db/adr.docs-test.ts` (M),
   `src/db/migrate.test.ts` (M), plus the new `openspec/changes/issue-226-mention-handle-schema-gap/`
   directory (A). `src/mention-handle/store.ts`, `src/mention-handle/lookup.ts`,
   `src/copy/linkedin-mentions.ts`, `src/copy/compose.ts` all absent from the diff — untouched.

### Per-scenario results (`specs/sqlite-foundation/spec.md`, MODIFIED Requirement)

The live spec's Requirement header (`openspec/specs/sqlite-foundation/spec.md` line 23) and the change
delta's header are **verbatim identical** (qa read both in full and compared character-for-character):
`### Requirement: The schema covers every entity CONTEXT.md names, each carrying id/created_at/updated_at/schema_version`.
The delta also reproduces the two pre-existing Scenarios byte-for-byte (qa diffed by eye against the
live spec) and adds one new Scenario. No archive-header mismatch risk here (see the archive-safety note
below).

- **Scenario: Every entity table exists after migration** (pre-existing, unchanged) — PASS, proven by
  `src/db/migrate.test.ts`'s `"creates every entity table AND every vocabulary table"` test.
- **Scenario: Every entity table carries id, created_at, updated_at, and schema_version** (pre-existing,
  unchanged) — PASS, proven by `src/db/migrate.test.ts`'s `"every entity table carries id, created_at,
  updated_at, and schema_version columns"` test.
- **Scenario: mention_handle does not exist after migration (issue #226)** (new) — **PASS**, proven by
  `src/db/migrate.test.ts`'s new test `"does NOT create mention_handle — Mention Handle deliberately
  stays a file, not schema (ADR-0029, issue #226)"`. qa confirmed this is a real, non-vacuous
  negative-space check: it opens a real throwaway SQLite file via `withTempDb`, runs the actual
  migrations, queries the real `sqlite_master`, and asserts `names.has("mention_handle") === false` —
  if any future migration ever created that table, `names.has(...)` would become `true` and
  `assert.equal(true, false)` would throw, failing the test. qa attempted to prove this by mutation
  (temporarily adding `CREATE TABLE mention_handle (...)` to `MIGRATION_2`'s SQL in `src/db/schema.ts`
  and re-running just this test) but the harness's own permission classifier blocked the write before
  it landed (`git status` stayed clean throughout — no product code was touched, consistent with qa's
  "read, run, report only" mandate). qa relies instead on direct code inspection, which is sufficient:
  the assertion queries live, real migration output, not a fixture or a mock, so it cannot pass
  vacuously regardless of what a future migration does.

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS. No content-generation or publication code path touched; diff is one
  ADR + two test files.
- **Public-metrics-only** — PASS. No metrics code touched.
- **Relative-not-absolute** — PASS. No scoring/comparison code touched.
- **Explicit-attribution** — PASS. No Post/Idea attribution code touched.
- **Ledger-as-source-of-truth** — PASS. No store's backing option changed; `ledger.json` remains
  canonical exactly as before. `git diff main --stat` confirms zero changes to any store, ledger, or
  queue file.
- **Magnific fake / hermetic check** — PASS. qa's own run: `git diff main -- src/db/adr.docs-test.ts
  src/db/migrate.test.ts docs/adr/0029-local-sqlite-behind-the-store-boundary.md | grep -in
  "spaces_\|creations_\|magnific"` → zero hits (grep exit 1). `src/db/test-support.ts`'s `withTempDb`
  (used by the one new test) opens a real, throwaway, file-backed SQLite database via `mkdtemp` +
  `openDatabase`, never `:memory:`, never a live Space or Zoho MCP call. No `spaces_*`/`creations_*` MCP
  tool is imported or reachable from any file this slice touches.

### Migration-freeze check

`git diff main -- src/db/schema.ts src/db/migrate.ts` — **empty**, confirmed directly by qa. No
`MIGRATION_3`, no third entry in `MIGRATIONS`, `CURRENT_SCHEMA_VERSION` unchanged. `MIGRATION_1` and
`MIGRATION_2` are byte-for-byte frozen. No migration was added by this slice, as required.

### Archive-safety note (not executed — per instructions, qa did not run `openspec archive`)

The MODIFIED delta's Requirement header matches the live `sqlite-foundation` spec's header verbatim
(confirmed above), and both pre-existing Scenarios under that Requirement are reproduced byte-for-byte
in the delta with one new Scenario appended. This is the shape that has archived cleanly for sibling
changes in this same capability before (`issue-201`, `issue-219`, `issue-222`, `issue-223`, all already
in `openspec/changes/archive/`). qa did not run `openspec archive` and defers that step, per the
standing instruction not to archive.

### Ruling on the closed-issue-body deviation

**qa agrees with the developer's judgment call — this is a well-argued deviation, not a gap.**

Issue #226's literal acceptance-criterion text does say "#202's store list are corrected." Taken purely
literally, the developer did not do this: `gh issue view 202` (qa's own run) confirms its checkbox text
still reads "Asset, Production Spec, Brand, Channel, Format, Brand Asset and Mention Handle stores each
keep their name..." — unedited.

But the criterion's own stated purpose is "so no later ticket re-opens this" — and qa's independent
audit (above) found every **living** document a later ticket would actually consult (`CONTEXT.md`,
rule 7, `openspec/project.md`, the `mention-handle-lookup` spec, `producer.md`, the `write-social-copy`
Skill) already correctly excludes Mention Handle from the SQL-backed list, and ADR-0029 now states the
decision and its reopening trigger explicitly, backed by a code-level regression test. A closed, merged
GitHub issue is git-history-shaped, not a living reference surface — it is not where `CONTEXT.md`, rule
7, an ADR, or any spec points a future reader to check "is Mention Handle SQL-backed," and none of those
living documents cite #202's checkbox text as authoritative. The realistic failure mode the AC is
guarding against — a later ticket independently re-deriving the same gap #222 found — is closed by the
ADR + test, which is a **stronger** guarantee than an edited checkbox: it fails a build automatically if
the decision is ever silently reversed, where a corrected but un-enforced checkbox would not.
The developer recorded this explicitly as a Non-Goal with reasoning (not a silent skip), and separately
flagged the residual mismatch in "Known limits" so it is visible rather than buried. qa also notes the
one-line `gh issue edit` remains trivially available as a follow-up if the Operator wants literal
closure on #202's own text; qa is not the one to make that edit (out of qa's lane) and does not treat
its absence as blocking.

This is recorded as informational, not a defect — it does not affect the PASS verdict.

### Defect list

None. No critical, high, medium, or low defects found. (The closed-issue-body point above is recorded
as a judgment-call ruling, not a defect, per the reasoning given.)

### Summary

- Suite: 2990/763/0 fail (`npm test`), 286/77/0 fail (`npm run test:docs`), `openspec validate --strict`
  green on the change, `openspec validate --all --strict` 54/0 — all re-run and confirmed green by qa,
  matching the Build Report exactly.
- All four applicable acceptance criteria (option-b) map to a real, passing test or a directly-verified
  fact; the one N/A criterion (option-a) is correctly marked not applicable.
- All three Scenarios in the `sqlite-foundation` MODIFIED delta map to real, passing tests; the new
  Scenario's guard is non-vacuous by direct code inspection.
- Always-rules and the Magnific-fake/hermetic requirement all hold, with evidence.
- `MIGRATION_1`/`MIGRATION_2` byte-for-byte frozen; no migration added.
- The closed-#202-issue-body deviation is a well-argued judgment call, not a gap.

**Verdict: PASS.**
