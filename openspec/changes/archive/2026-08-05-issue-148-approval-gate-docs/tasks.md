## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #148 in full, plus parent #140 (Schedule Batch spec), CONTEXT.md, ADR-0002,
  ADR-0008, ADR-0011, `CLAUDE.md`'s weekly-loop section, `.claude/agents/producer.md`,
  `.claude/commands/run-pipeline.md`, `.claude/commands/export-schedule.md`, and the two blockers'
  archived changes (#146, #147 — both `CLOSED`/merged, confirmed via `gh issue view`).
- [x] 1.2 Confirmed this is a docs-and-glossary-only slice: `scheduled_at` already round-trips through
  the ledger (issue #141), the X 280-char cap already exists (issue #142), no new ledger field or
  status is asked for by the issue's own acceptance criteria. Grepped `src/schedule-batch/*`,
  `src/commands/export-schedule.ts`, and `src/media-host/*` per the task's own instruction and confirmed
  no code change is needed to satisfy any acceptance criterion.
- [x] 1.3 Captured the `npm test` (1863 passing / 480 suites) and `npm run test:docs` (155 passing / 38
  suites) baselines before making any change.

## 2. Docs — the producer's own behavior (test-first: write the doc-check, then the prose)

- [x] 2.1 Added the CONTEXT.md-glossary and producer.md-prose assertions to a new
  `src/schedule-batch/approval-gate.docs-test.ts` FIRST (failing, since the doc text doesn't exist yet).
- [x] 2.2 Added ".claude/agents/producer.md"'s new "Schedule Batch offer" section (offer only once
  eligible Assets are produced; wait for full approval of every output/caption; approval is
  conversational-only, no ledger write; run the export only once approved; the Publish gate still
  follows, still human, ADR-0002) plus a matching Guardrails-section bullet. Ran 2.1's producer.md
  subtests: green.

## 3. Docs — the weekly-loop surface (test-first)

- [x] 3.1 Added the CLAUDE.md prose assertions to the docs-test file FIRST (failing).
- [x] 3.2 Extended `CLAUDE.md`'s numbered pipeline: a new step for the Schedule Batch approval between
  Gate 2 and Gate 3, Gate 3's own text extended to distinguish the Zoho-upload path from direct publish
  (citing ADR-0002, "a second, distinct human step"), the `producer` Agents-table row and the `## State`
  section's Asset field list extended to name the new step / the already-shipped `scheduled_at` field,
  and a new `## Data sources` bullet pointing at the new S3 setup doc. Ran 3.1: green.
- [x] 3.3 Added the run-pipeline.md prose assertions to the docs-test file FIRST (failing).
- [x] 3.4 Extended `.claude/commands/run-pipeline.md`'s gate-by-gate walkthrough with the same ordering
  (a new Schedule Batch approval bullet before Gate 3; Gate 3 extended the same way as CLAUDE.md's). Ran
  3.3: green.
- [x] 3.5 Added the export-schedule.md prose assertions to the docs-test file FIRST (failing).
- [x] 3.6 Extended `.claude/commands/export-schedule.md` with the "normally offered by the producer,
  behind this same approval" paragraph, keeping the command directly runnable on its own. Ran 3.5:
  green.

## 4. Glossary — CONTEXT.md

- [x] 4.1 (Assertions already added in 2.1.) Added the **Schedule Batch** and **Zoho Social Brand**
  glossary entries to `CONTEXT.md`, placed after **Production Queue** and before **Post** — each with an
  `_Avoid_` line, cross-referencing the conversational-approval / no-ledger-trace rule and ADR-0002. Ran
  the CONTEXT.md subtests: green.

## 5. The one-time S3 setup — documented, not code

- [x] 5.1 Added the S3-setup-doc assertions to the docs-test file FIRST (failing, file doesn't exist
  yet).
- [x] 5.2 Wrote `docs/schedule-batch-s3-setup.md`: states it is infrastructure setup, not code; documents
  straw-motion's already-live bucket (`strawmotion-schedule-media`, `us-east-1`, Block Public Access
  left ON, a public-`GetObject`-only bucket policy, a 30-day expiry lifecycle rule); gives the concrete
  steps (+ an example bucket-policy JSON, scoped to `GetObject` only — never write/delete/list for the
  public principal) for provisioning a new Brand's bucket the same way, including running the existing
  `src/media-host/live/smoke.ts` once to verify it; a closing note on how AWS credentials are resolved
  (never hardcoded/printed). Ran 5.1: green.

## 6. Regression guard — no new AssetStatus, ADR-0011 unchanged

- [x] 6.1 Added a real-code cross-check to the docs-test file: `isAssetStatus("approved")` and
  `isAssetStatus("scheduled")` are both `false`; the six documented stages
  (`queued`/`in_production`/`produced`/`posted`/`tracking`/`scored`) are all still `true`. This is the
  one place this slice imports from `src/asset/asset.ts` — read-only, no change to that file.
- [x] 6.2 Confirmed (by inspection + the CLAUDE.md doc-test) that `CLAUDE.md`'s
  `queued → in_production → produced → posted → tracking → scored` sentence is untouched, and that no
  doc anywhere in this slice claims a new status word.

## 7. OpenSpec

- [x] 7.1 Authored `proposal.md`, this `tasks.md`, and two spec deltas: ADDED
  `schedule-batch-approval-gate` (the producer's documented approval-gate behavior, proven by doc
  tests) and MODIFIED `docs-conformance` (CONTEXT.md glossary + the S3 setup doc requirement).
- [x] 7.2 `npx openspec validate issue-148-approval-gate-docs --strict` green.

## 8. Self-review

- [x] 8.1 `npm test` green (type-check + full suite; unchanged from baseline — 1863 passing / 480
  suites, since this slice touches no `.test.ts` file and no production code).
- [x] 8.2 `npm run test:docs` green (grew from the 155/38 baseline to 179 passing / 45 suites — 24 new
  tests across 7 new suites, all in the one new `approval-gate.docs-test.ts` file).
- [x] 8.3 `npm run build` clean.
- [x] 8.4 Simplify / dead-code pass: none needed (no production code was added); tightened a handful of
  doc-test regexes to tolerate the real files' own line-wrapping (`\s+` in place of a literal space)
  rather than reflowing the prose to fit the test, since the prose reads more naturally wrapped.
  Confirmed every issue #148 acceptance criterion maps to a named test (see the Build Report);
  confirmed no `spaces_*`/`creations_*`/live-S3/AWS-CLI call anywhere in the new test file (it only
  reads markdown files and calls the pure `isAssetStatus` function).
- [x] 8.5 Wrote the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (the Magnific fake is
  explicitly flagged as NOT APPLICABLE — no Space/MCP interaction anywhere in this slice), self-review
  notes, known limits.
