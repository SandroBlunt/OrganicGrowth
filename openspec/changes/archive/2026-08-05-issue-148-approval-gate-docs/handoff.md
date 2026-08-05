# Slice Handoff — issue #148: Schedule Batch: producer approval gate + docs and glossary

## Build Report (developer, Round 1)

### What changed and why

Parent #140 (the Schedule Batch spec) plus the Operator's own directive decided the export runs as a
**producer task**, only after the Operator approves all the generated outputs and captions — never a
standalone, unprompted step. Issues #141–#147 built the export itself (ledger round-trip, the X 280-char
cap, per-Brand Zoho config, the Media Host port, the tracer bullet, fail-loudly preflight, manifest-driven
cleanup), but none of them documented this in-conversation approval as part of the producer's own job, or
taught the domain glossary the two new terms, or documented the one-time S3 infrastructure setup. Issue
#148 closes that gap.

This is a **docs-and-glossary-only slice** — no production code changes. The ledger grain is already
correct (`scheduled_at` is the only new field, no new status; ADR-0011 unchanged), so the work is entirely
about making the producer's documented behavior, the weekly-loop docs, and CONTEXT.md say what was already
decided:

- **`.claude/agents/producer.md`** — new "Schedule Batch offer — after a Run's outputs are approved,
  before Publish" section: offer the export only once a Run's eligible Assets are `produced`; wait for the
  Operator's explicit approval of every produced Asset and every composed Copy variant in the SAME
  conversation (never unprompted); the approval is conversational only — nothing written to `ledger.json`,
  no new status, no new field; only once approved, run `exportScheduleCommand`
  (`src/commands/export-schedule.ts`, which also runs `runScheduleCleanup` first, automatically); the
  Publish gate still follows, still human (ADR-0002) — two distinct human steps. A matching Guardrails
  bullet was added so the rule survives a skim of that section alone.
- **`CLAUDE.md`** — a new numbered pipeline step ("Schedule Batch approval") between Gate 2 and Gate 3,
  explicitly stating it is conversational-only, writes nothing to the ledger, and is **not** one of the
  three formal gates (Review / pick-gate(s) / Publish stay exactly those three). Gate 3's own text now
  distinguishes the Zoho-upload path (a Schedule Batch Asset) from direct publish (any other Asset),
  citing ADR-0002 and naming this as a second, distinct human step from the approval above. The `producer`
  Agents-table row and the `## State` section's Asset field list now name the new step and the
  already-shipped `scheduled_at` field (issue #141) — CLAUDE.md never mentioned either before this slice.
  A new `## Data sources` bullet points at the new S3 setup doc.
- **`.claude/commands/run-pipeline.md`** — the same ordering in its own gate-by-gate walkthrough: a new
  bullet for the Schedule Batch approval before Gate 3, and Gate 3's text extended the same way.
- **`.claude/commands/export-schedule.md`** — a new paragraph stating the command is normally offered by
  the producer behind this same approval, while remaining directly runnable on its own (a granular
  power-tool, matching `/cleanup-schedule-media`'s documented pattern).
- **`CONTEXT.md`** — two new glossary terms, **Schedule Batch** and **Zoho Social Brand**, placed after
  **Production Queue** and before **Post**, each with an `_Avoid_` line, cross-referencing the
  conversational-approval / no-ledger-trace rule and ADR-0002's still-human Publish gate.
- **New: `docs/schedule-batch-s3-setup.md`** — documents the one-time S3 infrastructure setup (bucket, a
  public-`GetObject`-only bucket policy with Block Public Access left ON, a 30-day expiry lifecycle rule)
  as setup, not code: states it is already live for straw-motion (`strawmotion-schedule-media`,
  `us-east-1`) and gives concrete steps + an example bucket-policy JSON for provisioning a new Brand's
  bucket the same way, including running the existing `src/media-host/live/smoke.ts` once to verify it.
- **New: `src/schedule-batch/approval-gate.docs-test.ts`** — the doc-conformance suite proving every one
  of the above prose changes exists and says what this Build Report claims, plus one real code
  cross-check (`isAssetStatus`) proving no new `AssetStatus` was silently introduced anywhere in this
  slice.

### Files touched

New:
- `docs/schedule-batch-s3-setup.md`
- `src/schedule-batch/approval-gate.docs-test.ts`
- `openspec/changes/issue-148-approval-gate-docs/{proposal.md,tasks.md,handoff.md,specs/schedule-batch-approval-gate/spec.md,specs/docs-conformance/spec.md}`

Modified (docs only):
- `CLAUDE.md`
- `CONTEXT.md`
- `.claude/agents/producer.md`
- `.claude/commands/run-pipeline.md`
- `.claude/commands/export-schedule.md`

`git status --short` confirms exactly this list. No file under `src/schedule-batch/**` (other than the
new `.docs-test.ts`), `src/commands/export-schedule.ts`, `src/commands/cleanup-schedule-media.ts`,
`src/media-host/**`, `src/asset/**`, `src/ledger/**`, `data/**`, or `package.json` was touched.

### How to run

- Full suite (type-check + tests): `npm test` — **1863 passing / 0 failing / 480 suites** (baseline
  before this slice: 1863/480 — this slice adds **zero** unit tests, since all its assertions live in a
  `*.docs-test.ts` file, which the `npm test` glob deliberately excludes).
- Docs tests: `npm run test:docs` — **179 passing / 0 failing / 45 suites** (baseline: 155/38 — this
  slice's `approval-gate.docs-test.ts` adds **24 tests across 7 new suites**).
- Build: `npm run build` — clean.
- OpenSpec: `npx openspec validate issue-148-approval-gate-docs --strict` → `Change
  'issue-148-approval-gate-docs' is valid`.
- Single-file run (test-first granularity):
  `node --import tsx --test src/schedule-batch/approval-gate.docs-test.ts` — 24 passing / 7 suites.

### Acceptance-criteria self-assessment

1. **"Producer / pipeline docs state the export runs only after the Operator's in-session approval of
   the run's outputs and captions, with doc-checks where the repo pins prose to code."**
   - `approval-gate.docs-test.ts`'s `describe("producer.md documents the Schedule Batch offer as a
     conversational, no-ledger-trace approval gate ...")` — all 4 subtests, especially "names the offer
     step and that it never runs unprompted" and "names exportScheduleCommand and runScheduleCleanup as
     the real code it runs, only after approval" (pins the doc's prose to
     `src/commands/export-schedule.ts` and `runScheduleCleanup` by name).
   - `describe("CLAUDE.md documents the Schedule Batch approval step ...")` — "documents the producer
     offering the export only after in-session approval of ALL outputs and captions".
   - `describe("run-pipeline.md documents the same approval-before-export-before-Publish ordering ...")`.
   - `describe("export-schedule.md documents being producer-offered behind the same approval ...")`.

2. **"The docs make clear the approval gate is before the export and the human Publish gate ... still
   follows it — two distinct human steps."**
   - `approval-gate.docs-test.ts`'s "documents Gate 3 as a SECOND, distinct human step from the Schedule
     Batch approval, citing ADR-0002" (CLAUDE.md) and its `run-pipeline.md` counterpart "documents Gate 3
     distinguishing the Zoho upload path from direct publish, citing ADR-0002".
   - producer.md's "states the Publish gate still follows, still human, citing ADR-0002 — two distinct
     human steps" — asserts the literal phrase "two distinct human steps" and `ADR-0002`.
   - CONTEXT.md's "states hosting/writing files is not publishing, and the Publish gate is a second
     distinct human step" — the same ordering pinned in the glossary entry itself.

3. **"CONTEXT.md defines Schedule Batch and Zoho Social Brand."**
   - `approval-gate.docs-test.ts`'s `describe("CONTEXT.md defines Schedule Batch and Zoho Social Brand
     ...")` — all 4 subtests: the two headings exist, the Schedule Batch entry states the
     conversational/no-ledger-trace rule and the `scheduled_at`/`produced` status claim, the "not
     publishing"/"second distinct human step"/ADR-0002 claim, and the Zoho Social Brand entry states it is
     distinct from an OrganicGrowth Brand and names `LinkedInProfile`.

4. **"The one-time S3 setup is documented."**
   - `approval-gate.docs-test.ts`'s `describe("the one-time S3 setup is documented, not code ...")` — all
     5 subtests: the doc exists and says "not code"/"one-time", documents the bucket/GetObject
     policy/30-day rule, the example policy is scoped to `GetObject` only (asserts the ABSENCE of
     `s3:*`/`PutObject`/`DeleteObject`/`ListBucket`), and states it is already live for straw-motion.

5. **"The approval leaves no ledger trace; ADR-0011's lifecycle is unchanged."**
   - `approval-gate.docs-test.ts`'s "no new AssetStatus was introduced by this docs-only slice" — a real
     code cross-check: `isAssetStatus("approved")` and `isAssetStatus("scheduled")` both return `false`;
     all six documented stages still return `true`. This is the one place this slice imports from
     `src/asset/asset.ts` (read-only, no change to that file).
   - producer.md's and CLAUDE.md's "states the approval writes nothing to the ledger" subtests pin the
     documented claim itself.
   - CLAUDE.md's "still documents the unchanged per-Asset lifecycle" subtest re-asserts the exact
     `queued → in_production → produced → posted → tracking → scored` sentence is present and unedited.

### Fakes / fixtures used

- **Magnific fake — NOT APPLICABLE.** This slice has no Magnific interaction of any kind: `grep -rn
  "spaces_\|creations_\|FakeSpace\|SpaceMcpPort" src/schedule-batch/approval-gate.docs-test.ts` → no
  matches. The new test file only reads markdown files (`node:fs/promises`' `readFile`) and calls the
  pure, already-shipped `isAssetStatus` function.
- **No Media Host fake needed either** — `grep -rn "FakeMediaHost\|LiveMediaHost\|execFileRunner"
  src/schedule-batch/approval-gate.docs-test.ts` → no matches. This slice never exercises
  `exportScheduleCommand` or any Media Host code path; it only asserts the DOC TEXT names those real
  modules/functions.
- **No live S3/AWS-CLI call** — confirmed by the same grep above; nothing in this slice's test file
  shells out to anything.

### Self-review notes

- No production code was added, so there was no dead-code/simplify pass on that front. The simplify pass
  here was on the doc-test regexes: several initially failed against the real, hand-wrapped markdown
  prose (e.g. `"uploads the exported CSVs to Zoho Social"` broke across a line as `"...Zoho\n   Social"`)
  — rather than reflowing the prose to fit a rigid single-line regex, loosened the affected regexes to
  tolerate whitespace (`\s+` in place of a literal space), since the prose reads more naturally wrapped at
  ~100 columns like every other doc in this repo.
- Considered folding the new `approval-gate.docs-test.ts` assertions into the existing
  `production-spec/producer-agent.docs-test.ts` (which already covers `producer.md`) instead of a new
  file. Kept it as its own file because this slice's assertions span FIVE different doc files
  (`producer.md`, `CLAUDE.md`, `run-pipeline.md`, `export-schedule.md`, `CONTEXT.md`) plus the new S3
  setup doc and the `isAssetStatus` cross-check — a single dedicated file, co-located under
  `src/schedule-batch/` (per the task's own pointer to that directory), keeps issue #148's whole doc
  surface discoverable in one place rather than scattered across several pre-existing docs-test files
  that each own a narrower doc.
- Deliberately did NOT touch `.claude/rules/always/organicgrowth-rules.md`'s guardrail 11 ("Human gates:
  Review, each Recipe's picks, Publish...") — the Schedule Batch approval is documented as an additional,
  narrower, conversational checkpoint that carries no ledger significance, consistent with staying outside
  that rule's "three formal gates" framing (confirmed no acceptance criterion asks for a fourth gate).
- Deliberately did NOT touch `run-pipeline.ts` (the actual conductor generator code) or its own
  `run-pipeline-conductor` OpenSpec capability — that capability's Requirements are proven by REAL
  generator-turn tests (`run-pipeline.test.ts`), and this issue's acceptance criteria ask only for
  documentation, not for `run-pipeline.ts`'s own code to auto-invoke `/export-schedule`. Coding that
  auto-invocation would be real production-code scope creep beyond what issue #148 asked for.

### Known limits

- **No code enforces the approval gate.** It is, by design, a conversational, agent-level behavior (the
  producer's own judgment, per its instructions) — exactly like the existing Gate 3 Copy-review step
  already works today. A future slice could add a machine-checkable guard if the Operator ever decides
  the conversational approach isn't strict enough; not asked for here.
- **The S3 setup doc's "provisioning a new Brand's bucket" steps are untested by definition** — they are
  infra instructions for a human to run by hand (per the issue's own decision that this stays
  "documented... not code"), so there is no automated proof they work beyond mirroring straw-motion's
  already-live, already-smoke-tested bucket exactly.
- **CLAUDE.md's pipeline is now 8 numbered steps instead of 7** (the Schedule Batch approval step is new,
  Gate 3/track-performance/report all shifted down by one). Grepped every `*.docs-test.ts` and `*.md` in
  the repo for a literal reference to CLAUDE.md's OLD step numbers before renumbering; found none (the
  numbered-step references that DO exist, e.g. `trend-scout.md`'s "step 5", `review-ideas.md`'s "step 5",
  `build-issue.md`'s "Step 7", each refer to a step within THEIR OWN doc, not CLAUDE.md's numbered list) —
  confirmed safe to renumber.

---

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (type-check via `tsc -p tsconfig.json --noEmit`, then `node --import tsx --test
  "src/**/*.test.ts"`) — **1863 passing / 0 failing / 480 suites**. Actually run, real green (matches
  the Build Report's claimed baseline exactly; this slice adds zero files to this glob).
- `npm run test:docs` (`node --import tsx --test "src/**/*.docs-test.ts"`) — **179 passing / 0 failing /
  45 suites**. Actually run, real green. The new `src/schedule-batch/approval-gate.docs-test.ts` alone
  (`node --import tsx --test src/schedule-batch/approval-gate.docs-test.ts`) — **24 passing / 0 failing /
  7 suites**, matching the Build Report's claim exactly.
- `npm run build` (`tsc -p tsconfig.build.json`) — clean, no output, exit 0.
- `npx openspec validate issue-148-approval-gate-docs --strict` — `Change 'issue-148-approval-gate-docs'
  is valid`.

### Per-criterion results

1. **"Producer / pipeline docs state the export runs only after the Operator's in-session approval of
   the run's outputs and captions, with doc-checks where the repo pins prose to code."** — **PASS.**
   Verified by reading the actual diffs of `.claude/agents/producer.md`, `CLAUDE.md`,
   `.claude/commands/run-pipeline.md`, and `.claude/commands/export-schedule.md`: each states the export
   is offered only once eligible Assets are produced and runs only after the Operator approves every
   output/caption in the same conversation, never unprompted. Proven by
   `approval-gate.docs-test.ts`'s `describe` blocks for each of the four files (all pass).
2. **"The docs make clear the approval gate is before the export and the human Publish gate ... still
   follows it — two distinct human steps."** — **PASS.** Confirmed in the actual prose (CLAUDE.md's Gate
   3, run-pipeline.md's Gate 3, producer.md's "Publish gate still follows, still human" line, CONTEXT.md's
   Schedule Batch entry) that the ordering is approval → export → Publish, each citing ADR-0002 and
   calling Publish "a second, distinct human step". Proven by the corresponding docs-test subtests.
3. **"CONTEXT.md defines Schedule Batch and Zoho Social Brand."** — **PASS.** Read CONTEXT.md directly:
   both headings exist (`**Schedule Batch**` at line 228, `**Zoho Social Brand**` at line 241), each with
   an `_Avoid_` line, placed between **Production Queue** (line 219) and **Post** (line 250) as claimed.
   Proven by `describe("CONTEXT.md defines Schedule Batch and Zoho Social Brand ...")`.
4. **"The one-time S3 setup is documented."** — **PASS.** Read `docs/schedule-batch-s3-setup.md`
   directly: states "infrastructure setup, not code", documents the live straw-motion bucket
   (`strawmotion-schedule-media`, `us-east-1`), a public-`GetObject`-only bucket policy (example JSON
   grants only `s3:GetObject`, no wildcard/write/delete/list for the public principal), and a 30-day
   expiry lifecycle rule. Proven by `describe("the one-time S3 setup is documented, not code ...")`.
5. **"The approval leaves no ledger trace; ADR-0011's lifecycle is unchanged."** — **PASS.** Confirmed
   `src/asset/asset.ts`'s `AssetStatus` union is still exactly the six values
   (`queued`/`in_production`/`produced`/`posted`/`tracking`/`scored` — no `approved`/`scheduled` added),
   unmodified by this slice (not in `git status --short`). The docs state the approval writes nothing to
   `ledger.json`. Proven by the real code cross-check in
   `describe("no new AssetStatus was introduced by this docs-only slice ...")` plus the prose-pinning
   subtests in the CLAUDE.md/producer.md `describe` blocks.

All 5 acceptance criteria: **PASS**, each backed by a real, currently-green test that exercises the
actual claim (not merely the developer's self-assessment) — confirmed by independently reading every
modified/new doc file's diff and content against the test assertions.

### Per-scenario results (spec deltas)

`specs/schedule-batch-approval-gate/spec.md`:
- "producer.md documents offering the export only once eligible Assets are produced" — PASS (test:
  `describe("producer.md ...")` → "names the offer step and that it never runs unprompted").
- "producer.md documents waiting for approval of ALL outputs and captions before proceeding" — PASS
  (test: "states approval is conversational only — nothing written to the ledger for it").
- "producer.md names the real export and cleanup code it runs, only once approved" — PASS (test: "names
  exportScheduleCommand and runScheduleCleanup as the real code it runs, only after approval").
- "producer.md states the approval writes nothing to the ledger" — PASS (same subtest as above; verified
  in producer.md's diff, step 3 of the new section).
- "CLAUDE.md states the Schedule Batch approval is not one of the three formal gates and writes nothing
  to the ledger" — PASS (test: "states the approval writes nothing to the ledger and is NOT one of the
  three formal gates"; verified directly in CLAUDE.md's diff: "not** one of the three formal gates
  below").
- "No new AssetStatus is introduced anywhere in this slice — a real code cross-check" — PASS (test:
  `isAssetStatus("approved")`/`isAssetStatus("scheduled")` both `false`; all six stages `true`).
- "CLAUDE.md's Gate 3 distinguishes the Zoho-upload path from direct publish, citing ADR-0002" — PASS
  (test: "documents Gate 3 as a SECOND, distinct human step ..."; verified in CLAUDE.md's diff).
- "run-pipeline.md documents the identical ordering in its own gate-by-gate walkthrough" — PASS (test:
  `describe("run-pipeline.md documents the same approval-before-export-before-Publish ordering ...")`,
  both subtests).
- "producer.md states the Publish gate still follows, still human" — PASS (test: "states the Publish
  gate still follows, still human, citing ADR-0002 — two distinct human steps").
- "export-schedule.md documents itself as normally producer-offered, behind the same approval" — PASS
  (test: `describe("export-schedule.md documents being producer-offered behind the same approval ...")`,
  both subtests).

`specs/docs-conformance/spec.md`:
- "CONTEXT.md defines Schedule Batch, cross-referencing the conversational approval and ADR-0002" — PASS
  (test: `describe("CONTEXT.md defines Schedule Batch and Zoho Social Brand ...")`, subtests 1–3).
- "CONTEXT.md defines Zoho Social Brand as distinct from an OrganicGrowth Brand" — PASS (test: subtest 4
  of the same describe block; verified `LinkedInProfile` is named and "not an OrganicGrowth Brand" is
  stated).
- "The one-time S3 setup is documented as infrastructure, never as code" — PASS (test:
  `describe("the one-time S3 setup is documented, not code ...")`, all 5 subtests).

All spec-delta Scenarios: **PASS** — each traces to a real, currently-green test, and each Requirement's
prose was independently cross-checked against the issue's acceptance criteria and against CONTEXT.md/the
ADRs (no misread found; no scope creep — e.g. the "not one of the three formal gates" framing was
verified NOT to touch or renumber `.claude/rules/always/organicgrowth-rules.md`'s guardrail 11, which was
confirmed untouched by `git status --short`).

### Always-rules + Magnific-fake checks

- **Generate-never-publish (ADR-0002) — PASS.** producer.md's new section states "you never call Zoho,
  Facebook, or any platform API" and "hosting media and writing CSVs is not publishing"; CLAUDE.md/
  run-pipeline.md's Gate 3 sections state the same; CONTEXT.md's Schedule Batch entry repeats it. No new
  code path was added that could call a publish API (this slice touches no `src/**` production file).
- **Public-metrics-only — N/A to this slice** (no metrics code touched; no claim contradicts it).
- **Relative-not-absolute — N/A to this slice** (no scoring code touched).
- **Explicit-attribution — PASS (unaffected).** `/log-post <brand> <idea-id> <recipe> <post-url>` still
  keys attribution on `(Idea, Recipe)`, unchanged by this slice's diffs (verified in the CLAUDE.md/
  run-pipeline.md diffs — the `/log-post` line is untouched apart from being renumbered as part of the
  same Gate-3 step).
- **Ledger-as-source-of-truth — PASS.** Verified `src/asset/asset.ts`'s `AssetStatus` type (lines 62–68)
  is exactly the same six values as before this slice, and the file does not appear in `git status
  --short` (read-only import). The docs uniformly state the approval writes nothing to `ledger.json` and
  that `scheduled_at` (already shipped, issue #141) remains the only new field, with `status` staying
  `produced` until `/log-post`.
- **Magnific fake check — PASS, N/A-but-verified.** `grep -rn "spaces_\|creations_\|FakeSpace\|
  SpaceMcpPort" src/schedule-batch/approval-gate.docs-test.ts` → no matches (independently re-run by QA,
  confirmed empty). This slice has zero Magnific interaction of any kind — it is a pure docs/glossary
  slice whose one test file only reads markdown via `node:fs/promises`'s `readFile` and calls the pure
  `isAssetStatus` function. No live `spaces_*`/`creations_*` call, no credits spent, no board mutation
  anywhere in the new/changed files.
- **No live AWS/S3 call — PASS (bonus check, relevant to this slice's S3-setup-doc claim).** Grepped the
  new test file for `aws `/`execFile`/`exec(` — no matches; `docs/schedule-batch-s3-setup.md` is prose +
  an example JSON policy, explicitly documented as run-by-hand, never invoked by `npm test`.

### Defect list

None. No defects found in this round.
