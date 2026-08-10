# Slice Handoff — issue-162-confirmed-live-autolog

## Build Report (developer, round 1)

### What changed

ADR-0020 (accepted, not yet merged to `main`; read read-only at
`/Users/CaxtonTaylor/Developer/OrganicGrowth/docs/adr/0020-zoho-mcp-schedules-posts-csv-becomes-fallback.md`,
never copied into this worktree/branch) decides that for the Zoho MCP scheduling path, attribution logs
automatically — but only once a post is confirmed live, checked by the exact reference Zoho returned at
schedule-time, never guessed from timing. Issue #161 (merged, on this branch) gave that reference a
durable home on the ledger (`LedgerAssetRecord.zoho_schedule_reference`). This slice is the decision +
write layer: given an Asset's stored reference and Zoho's own current report for it (injected as plain
data — the actual fetch is issue #163's job), decide whether the post is confirmed live and, when it is,
write the Brand's primary Channel's live Post URL and time onto exactly that `(Idea, Recipe)` Asset,
through the same attribution write `/log-post` performs.

Two new pieces:

1. **`src/asset/attribution.ts`** — extracts the ONE write `/log-post` has always performed
   (`nextAttributedStatus` + `writeAttributedPost`: write `post_url`/`posted_at`/the advanced status via
   `AssetStore.writeAsset`, then refresh the output-bundle `post.json` via `refreshPostJson`) out of
   `src/commands/log-post.ts` into a shared module. `log-post.ts` is refactored to call it — its own
   behavior is unchanged (proven by its own pre-existing, unmodified test suite staying green,
   byte-for-byte).
2. **`src/schedule-batch/confirmed-live.ts`** — the new decision (`planConfirmedLiveLog`, pure) and
   shell (`confirmZohoPostLive`). The decision keys ONLY on an exact match between the injected
   `ZohoScheduleReport.reference` and the Asset's own stored `zoho_schedule_reference` (same shape, same
   value(s), same order — never resembled, never reordered); an Asset with no stored reference is never
   auto-logged, regardless of what report is supplied; a still-pending, failed, or missing report for the
   Brand's primary Channel writes nothing and returns a clear message; a confirmed-live report writes the
   primary Channel's URL/time through the shared `writeAttributedPost`, advancing `produced -> posted`
   (never regressing an Asset already further along).

### Files touched

- `src/asset/attribution.ts` (NEW) — `nextAttributedStatus`, `AttributedPostWrite`,
  `AttributionWriteOptions`, `writeAttributedPost`.
- `src/asset/attribution.test.ts` (NEW) — 5 tests.
- `src/asset/asset.ts` (EDIT) — adds `describeAssetList` (extracted from `/log-post`'s previously-private
  `describeAssets`, unchanged wording), shared by both callers.
- `src/commands/log-post.ts` (EDIT) — refactored to call `nextAttributedStatus`/`writeAttributedPost`/
  `describeAssetList` instead of inlining the write; doc comments updated to point at the shared module.
  No change to its exported behavior, message text, or refusal semantics.
- `src/schedule-batch/confirmed-live.ts` (NEW) — `ZohoPostLiveStatus`, `ZohoPlatformStatus`,
  `ZohoScheduleReport`, `referencesMatch`, `ConfirmedLiveRefusalReason`, `ConfirmedLiveLogPlan`,
  `planConfirmedLiveLog`, `ConfirmZohoPostLiveOptions`, `confirmZohoPostLive`.
- `src/schedule-batch/confirmed-live.test.ts` (NEW) — 23 tests.
- `openspec/changes/issue-162-confirmed-live-autolog/` — `proposal.md`, `tasks.md`,
  `specs/schedule-batch-confirmed-live/spec.md` (5 ADDED Requirements, 18 Scenarios), this `handoff.md`.

No other file is touched. No live Brand `ledger.json` is touched. ADR-0020 itself is **not** copied into
this worktree/branch — referenced by number/title only, as instructed.

### How to run

```
npm test                                                     # type-check + full suite (1944 passing)
npm run test:docs                                             # docs-conformance suite (179 passing, unaffected)
npm run build                                                  # tsc -p tsconfig.build.json (clean)
node --import tsx --test src/asset/attribution.test.ts         # this slice's shared-write unit tests
node --import tsx --test src/schedule-batch/confirmed-live.test.ts  # this slice's decision + shell tests
node --import tsx --test src/commands/log-post.test.ts         # PRE-EXISTING suite, unmodified, still green
npx openspec validate issue-162-confirmed-live-autolog --strict
```

Full-suite baseline before this slice: 1916 passing (493 suites minus this slice's 2 new files),
179 docs-conformance passing. After this slice: 1944 passing (+28: 5 in `attribution.test.ts`, 23 in
`confirmed-live.test.ts`), 179 docs-conformance passing (unchanged — no doc file touched), 0 failing.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | A confirmed-live report for a stored reference logs the Post URL onto exactly that (Idea, Recipe) Asset and moves it `produced -> posted` — the same effect as `/log-post`. | `src/schedule-batch/confirmed-live.test.ts` → `planConfirmedLiveLog` → "AC1: a confirmed-live report for the stored reference logs the primary Channel's URL, advancing produced -> posted" and "only the PRIMARY Channel's status is used…"; `confirmZohoPostLive` → "AC1: has the SAME ledger effect as an equivalent /log-post call (byte-identical Asset write)" (constructs both paths against separate ledgers with equivalent inputs and asserts the written Asset records are field-for-field identical) and "with TWO Assets, writes onto ONLY the named Recipe's Asset". |
| 2 | Confirmation keys only on the stored schedule-time reference — never on timing or inference. | `src/schedule-batch/confirmed-live.test.ts` → `planConfirmedLiveLog` → "AC2: a report for a DIFFERENT reference than the stored one refuses, even though it says live", "AC2: a string reference never matches an array carrying the same single value (shape-sensitive)", "AC2: an array reference in a DIFFERENT order never matches"; `confirmZohoPostLive` → "AC2: a reference-mismatched report writes nothing and says so clearly" (asserts ledger bytes unchanged). |
| 3 | A still-pending or missing report writes nothing and says so clearly. | `src/schedule-batch/confirmed-live.test.ts` → `planConfirmedLiveLog` → "AC3: no entry for the primary Channel's platform in the report -> 'no-report' (missing)", "AC3: a still-pending Zoho status refuses, naming the status", "AC3: a failed Zoho status refuses, naming the status", "AC3: status 'live' but missing liveUrl/liveAt never half-fabricates a Post — refuses as pending"; `confirmZohoPostLive` → "AC3: a still-pending report writes nothing to the ledger and says so clearly" (asserts ledger bytes unchanged AND the returned message matches `/not yet live/i` + `/pending/i`). |
| 4 | An Asset without a stored reference is never auto-logged. | `src/schedule-batch/confirmed-live.test.ts` → `planConfirmedLiveLog` → "AC4: an Asset with NO stored zoho_schedule_reference is never auto-logged, even with a live report in hand"; `confirmZohoPostLive` → "AC4: an Asset with no stored reference is refused and writes nothing to the ledger" (asserts ledger bytes unchanged and the message names "never auto-logged"). |

Every scenario in `openspec/changes/issue-162-confirmed-live-autolog/specs/schedule-batch-confirmed-live/spec.md`
maps 1:1 onto a test in one of the two new test files.

### Fakes / fixtures used

- **No Magnific fake needed or used.** This slice has no live-system boundary at all: `ZohoScheduleReport`
  is always caller-injected plain data (a hand-built TypeScript object in every test), never fetched —
  the actual Zoho MCP fetch is issue #163's job. `grep -rn "spaces_\|creations_\|zoho\."
  src/asset/attribution.ts src/schedule-batch/confirmed-live.ts` returns nothing. This mirrors issue
  #161's own "no live-system boundary in this slice" note.
- Test fixtures: hand-built `LedgerIdea`/`LedgerAssetRecord`/`Channel`/`ZohoScheduleReport` objects
  in-file; temp-directory ledgers and Brand Profile YAML files (via `mkdtemp`), cleaned up in `finally`
  blocks — the same pattern `log-post.test.ts` already uses.

### Self-review notes

- Extracted the shared write (`nextAttributedStatus`/`writeAttributedPost`) into `src/asset/attribution.ts`
  rather than importing across `src/commands/` → `src/schedule-batch/` (would have inverted the existing
  shell-vs-deep-module layering, since `src/commands/*.ts` maps 1:1 onto `.claude/commands/*.md` slash
  commands, and this new module is not one). Confirmed by re-reading `src/commands/log-post.test.ts`
  unmodified and green after the refactor — the extraction changed zero observable behavior.
  `describeAssetList` was moved the same way, for the same reason (both callers need identical
  "list the Idea's actual Assets" wording, never duplicated).
  - `referencesMatch` is intentionally strict (shape- and order-sensitive) rather than "smart" —
  mirrors `parseZohoScheduleReference`'s (issue #161) own "verbatim, never normalized" posture, and is
  the concrete mechanism behind AC2.
- Considered folding "reference-mismatch" into the more generic `"no-report"`/`"missing"` bucket the
  issue's prose uses, but kept it as its own `ConfirmedLiveRefusalReason` — it is the single clearest,
  directly-testable proof of AC2 ("never inference"), and every other outward-facing behavior (no write,
  clear message) still satisfies the issue's two-bucket "still-pending or missing" framing.
- Added a defensive `not-yet-produced` guard (an Asset still `queued`/`in_production`) mirroring
  `/log-post`'s own guard, even though in practice an Asset only ever gets a `zoho_schedule_reference`
  once it is `produced` — kept for parity with "the same attribution write /log-post performs", not just
  its final two lines.
- Ran `git status --porcelain` before and after to confirm only the 6 intended files (2 new modules + 2
  new test files + 1 edited command + 1 edited deep module) plus the OpenSpec change folder changed —
  nothing else in the working tree was touched.
- No dead code left behind: the old private `nextAssetStatus`/`describeAssets` in `log-post.ts` were
  fully removed, not left alongside their replacements.

### Known limits

- **The actual Zoho report fetch is not built here.** `ZohoScheduleReport` is a designed input type; the
  live MCP call that produces one, and the Producer's call site that invokes `confirmZohoPostLive` with
  it, are issue #163's job (explicitly named "a future build slice" in ADR-0020's Consequences).
- **Tracking for non-primary Channels stays deferred**, per ADR-0019's own scope note — this slice writes
  only the Brand's primary Channel's live Post URL even when Zoho's report covers several platforms.
- **The one-time Straw Motion 2026-W32 heuristic-matching closeout** (posts that predate ADR-0020, with
  no stored reference at all) is explicitly out of scope — those Assets correctly fall into this slice's
  "no-stored-reference" bucket and stay on manual `/log-post`, per the ADR's own carve-out.

---

## QA Verdict — Round 1: PASS

### Suite result

| Command | Result |
|---|---|
| `npm test` | **1944 passing / 493 suites / 0 failing** — actually run, exact match to Build Report's claim. Includes type-check (`tsc --noEmit`) then the full `node:test` run. |
| `npm run test:docs` | **179 passing / 45 suites / 0 failing** — unaffected, as claimed. |
| `npm run build` | `tsc -p tsconfig.build.json` — clean, no errors. |
| `npx openspec validate issue-162-confirmed-live-autolog --strict` | `Change 'issue-162-confirmed-live-autolog' is valid` (exit 0). |
| `npx openspec validate --all --strict` | `Totals: 37 passed, 0 failed (37 items)` (exit 0), including `change/issue-162-confirmed-live-autolog` and `spec/post-attribution` unchanged. |
| `node --import tsx --test src/commands/log-post.test.ts` (pre-existing, untouched file — confirmed zero diff vs `origin/main`) | **29 passing / 6 suites / 0 failing.** |

All commands were run for real, from a clean invocation, in this worktree. No result is assumed.

### Per-criterion results

| AC | Result | Evidence |
|---|---|---|
| 1. A confirmed-live report for a stored reference logs the Post URL onto exactly that (Idea, Recipe) Asset and moves it `produced -> posted` — same effect as `/log-post`. | **PASS** | `confirmed-live.test.ts` → "AC1: has the SAME ledger effect as an equivalent /log-post call (byte-identical Asset write)" runs both `confirmZohoPostLive` and `logPostCommand` against separate seeded ledgers with equivalent inputs and asserts `status`/`post_url`/`posted_at` are identical. Verified by code inspection: `confirmZohoPostLive` calls the exact same `writeAttributedPost` (`src/asset/attribution.ts`) that the refactored `logPostCommand` now calls — both funnel into the real, pre-existing `writeAsset` (`src/asset/store.ts`) and `refreshPostJson` (`src/asset/output-bundle.ts`), not near-copies. `git diff origin/main -- src/commands/log-post.ts` confirms the refactor swaps the inline `writeAsset`+`refreshPostJson` calls for the shared `writeAttributedPost` 1:1, with the pre-existing `log-post.test.ts` (0 lines changed) staying fully green (29/29). |
| 2. Confirmation keys only on the stored schedule-time reference — never on timing or inference. | **PASS** | `referencesMatch` in `confirmed-live.ts` is the only gate on confirmation and reads nothing but `report.reference` vs `asset.zoho_schedule_reference` — no `Date`/`new Date()`/clock read, no array index/ordering heuristic, no "only report supplied" shortcut anywhere in `planConfirmedLiveLog`. Confirmed by 3 tests: different-reference, string-vs-same-value-array (shape-sensitive), and reordered-array (order-sensitive) all refuse with `reference-mismatch` even though the report claims `"live"`. |
| 3. A still-pending or missing report writes nothing and says so clearly. | **PASS** | `pending`/`no-report`/`no-primary-channel` refusal branches all return before any write; shell-level test asserts ledger bytes unchanged plus a message matching `/not yet live/i` and `/pending/i`. A `"live"` status missing `liveUrl`/`liveAt` is explicitly folded into `pending` rather than half-writing a Post (tested). |
| 4. An Asset without a stored reference is never auto-logged. | **PASS** | `planConfirmedLiveLog` checks `asset.zoho_schedule_reference === undefined` and refuses with `no-stored-reference` **before** ever calling `referencesMatch` or reading `report` at all — an Asset can never reach the write without a stored reference, regardless of report contents. Shell test asserts ledger bytes byte-identical before/after and message contains "never auto-logged". |

### Per-scenario results (16 Scenarios found in the spec delta — see note below on the "18" discrepancy)

| Requirement | Scenario | Result | Covering test |
|---|---|---|---|
| Keys only on stored reference | A report for a different reference refuses, even though it reports live | PASS | `planConfirmedLiveLog` → "AC2: a report for a DIFFERENT reference…" |
| Keys only on stored reference | A string reference never matches an array carrying the same single value | PASS | `planConfirmedLiveLog` → "AC2: a string reference never matches an array…" |
| Keys only on stored reference | An array reference in a different order never matches | PASS | `planConfirmedLiveLog` → "AC2: an array reference in a DIFFERENT order…" |
| Keys only on stored reference | A matching array reference, in the same order, is accepted | PASS | `planConfirmedLiveLog` → "a matching array reference (same order) confirms live" |
| No stored reference never auto-logged | An Asset with no stored reference refuses, even given a fully live report | PASS | `planConfirmedLiveLog` → "AC4…"; `confirmZohoPostLive` → "AC4: an Asset with no stored reference is refused and writes nothing to the ledger" |
| Same write as /log-post | A confirmed-live report logs the primary Channel's URL/time, advancing produced -> posted | PASS | `planConfirmedLiveLog` → "AC1…"; `confirmZohoPostLive` → "AC1: has the SAME ledger effect…" |
| Same write as /log-post | A live status on a non-primary Channel is ignored | PASS | `planConfirmedLiveLog` → "only the PRIMARY Channel's status is used…" |
| Same write as /log-post | An already-posted/tracking/scored Asset's status never regresses on re-confirmation | PASS | `planConfirmedLiveLog` → "an already-posted/tracking/scored Asset keeps its own status…" |
| Same write as /log-post | With two Assets on one Idea, only the named Recipe's Asset is written | PASS | `confirmZohoPostLive` → "with TWO Assets, writes onto ONLY the named Recipe's Asset…" |
| Same write as /log-post | A successful confirmed-live log refreshes the named Asset's output-bundle post.json | PASS | `confirmZohoPostLive` → "refreshes the named Asset's output-bundle post.json on success…" |
| Pending/missing report writes nothing | No configured primary Channel refuses clearly | PASS | `planConfirmedLiveLog` → "refuses when the Brand has no configured primary Channel" |
| Pending/missing report writes nothing | A matching report with no entry for the primary Channel's platform refuses as missing | PASS | `planConfirmedLiveLog` → "AC3: no entry for the primary Channel's platform…" |
| Pending/missing report writes nothing | A still-pending or failed Zoho status refuses, naming the status | PASS | `planConfirmedLiveLog` → "AC3: a still-pending Zoho status…" + "AC3: a failed Zoho status…" |
| Pending/missing report writes nothing | A live status missing its URL or time refuses rather than half-fabricating a Post | PASS | `planConfirmedLiveLog` → "AC3: status 'live' but missing liveUrl/liveAt…" |
| Pending/missing report writes nothing | Every refusal leaves the ledger file byte-for-byte unchanged | **PASS, with a coverage note** — explicitly byte-tested for 3 of the ~8 refusal reasons (`no-stored-reference`, `pending`, `reference-mismatch`); the other reasons (`unknown-idea`, `unknown-recipe`, `not-yet-produced`, `no-primary-channel`, `no-report`) are only tested at the pure `planConfirmedLiveLog` level, not re-verified for ledger-byte-identity at the `confirmZohoPostLive` shell level. Not a functional bug — `confirmZohoPostLive`'s `switch` returns a message for every non-`ok` reason **before** its single `writeAttributedPost` call site is reached, so the guarantee holds structurally for all reasons — but the scenario's literal "GIVEN any of the refusal cases above" is not exhaustively exercised. Filed as a low-severity gap below. | `confirmZohoPostLive` → "AC4…", "AC3: a still-pending report…", "AC2: a reference-mismatched report…" (byte-compare); remaining reasons via `planConfirmedLiveLog` only |
| Brand-explicit, never touches other Idea/Asset/Brand | A confirmed-live check for one Brand never touches another Brand's ledger | PASS | `confirmZohoPostLive` → "does not touch another Brand's ledger" |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | `grep -rn "spaces_\|creations_\|zoho\." src/asset/attribution.ts src/schedule-batch/confirmed-live.ts` → no matches. Neither file calls any Zoho/Magnific write-tool; `confirmZohoPostLive` only decides what to do with a `ZohoScheduleReport` the caller (future Producer code, #163) already fetched. |
| Public-metrics-only | **PASS / not applicable** | No metrics code touched; diff is scoped to `src/asset/asset.ts`, `src/commands/log-post.ts`, `src/asset/attribution.ts`, `src/schedule-batch/confirmed-live.ts` (`git diff origin/main --stat` confirms). |
| Relative-not-absolute | **PASS / not applicable** | No scoring/baseline code touched. |
| Explicit-attribution (rule 5) | **PASS** | This slice is the one ADR-0020 explicitly permits to auto-log, on the condition that the match is the exact stored reference, never timing/ordering/"only one that fits". `referencesMatch` is a strict identity check (shape + value + order); `no-stored-reference` refuses unconditionally before any report is even consulted. This is a faithful implementation of the ADR's carve-out, not a violation of always-rule 5 — the reference *is* the explicit attribution link, recorded at schedule-time by issue #161, not inferred at confirm-time. |
| Ledger-as-source-of-truth | **PASS** | Both `/log-post` and the new auto-log path write through the identical `writeAsset` (`src/asset/store.ts`) + `refreshPostJson` (`src/asset/output-bundle.ts`) via the shared `writeAttributedPost` — confirmed by reading both call sites and by the byte-identical-write test. No second ledger-writing code path was introduced. |
| Magnific fake / no live-Space, no live-Zoho calls | **PASS** | `grep -rn "spaces_\|creations_\|zoho\." src/asset/attribution.ts src/schedule-batch/confirmed-live.ts src/asset/attribution.test.ts src/schedule-batch/confirmed-live.test.ts` → no matches (exit 1 / empty). `ZohoScheduleReport` is always a hand-built TypeScript object in every test — no network, no MCP tool, no credits spent, no board mutation anywhere in this diff. Correctly, and as the Build Report states, no Magnific fake was needed for this slice at all (no live-system boundary is crossed by this code). |

### OpenSpec-vs-issue faithfulness check

- `proposal.md` accurately restates the issue's scope and non-goals (fetch/scheduling flow deferred to
  #163; non-primary-Channel tracking deferred per ADR-0019; the one-time W32 heuristic closeout is
  explicitly out of scope) — matches ADR-0020's own "Consequences" section and the issue body verbatim.
  `git diff origin/main -- openspec/specs/post-attribution/` is empty — the claim of "zero Modified
  Capabilities" is correct.
- `git diff origin/main --stat` shows exactly the two edited files (`src/asset/asset.ts`,
  `src/commands/log-post.ts`) plus the new files listed in the Build Report — nothing outside the slice
  was touched (no doc, no CONTEXT.md, no other command, no live Brand ledger).
- **Minor documentation discrepancy (not a functional defect):** `handoff.md`, `proposal.md`, and
  `tasks.md` all state "5 ADDED Requirements, 18 Scenarios." The actual spec delta
  (`specs/schedule-batch-confirmed-live/spec.md`) contains 5 Requirements but **16** `#### Scenario`
  headers (`grep -c "^#### Scenario"` → 16), not 18. `openspec validate --strict` does not check scenario
  counts, so this did not surface there. See defect list.

### Defect list

| # | Severity | What is wrong | Repro steps |
|---|---|---|---|
| 1 | low | The Build Report (`handoff.md`), `proposal.md`, and `tasks.md` all claim the new `schedule-batch-confirmed-live` capability has "18 Scenarios." The actual spec delta file has 16. Purely a self-reported count error — every scenario that does exist is faithful to the issue and has a passing covering test; no scenario is missing in substance. | `grep -c "^#### Scenario" openspec/changes/issue-162-confirmed-live-autolog/specs/schedule-batch-confirmed-live/spec.md` → `16`, vs. the "18" claimed in `handoff.md:50`, `proposal.md` ("18 Scenarios" is not literally present there but is implied via the same authorship pass — see `tasks.md:66`'s "an ADDED-Requirement spec delta" claim mirrored in `handoff.md`). |
| 2 | low | The "Every refusal leaves the ledger file byte-for-byte unchanged" scenario is explicitly tested for only 3 of the ~8 `ConfirmedLiveRefusalReason` values at the `confirmZohoPostLive` (shell/ledger-byte) level — `unknown-idea`, `unknown-recipe`, `not-yet-produced`, `no-primary-channel`, and `no-report` are only exercised at the pure `planConfirmedLiveLog` level, not re-verified for ledger-byte-identity through the shell. The control flow (`confirmZohoPostLive`'s switch returns for every non-`ok` reason before its one `writeAttributedPost` call) makes this safe by construction, so it is not a functional bug — flagged only as an incomplete-test-breadth observation for the developer's awareness, not blocking this round. | Read `src/schedule-batch/confirmed-live.test.ts` — search for ledger-byte `assert.equal(after, before, ...)` assertions; only 3 appear (`AC4`, `AC3 pending`, `AC2 mismatch`), none for `unknown-idea`/`unknown-recipe`/`not-yet-produced`/`no-primary-channel`/`no-report`. |

Neither defect blocks this round: both are low-severity, non-functional (documentation-accuracy and
test-breadth observations respectively), and every acceptance criterion, every always-rule, and the
Magnific-fake/hermeticity requirement are all genuinely met by real, passing, non-fabricated evidence.

**Overall: PASS.**
