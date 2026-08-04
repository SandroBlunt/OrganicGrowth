# Slice Handoff — issue #141: Schedule Batch: ledger round-trips scheduled_at and unresolved-mention notes

## Build Report — Round 2

**Round-1 note:** QA correctly found that round 1 produced nothing to review — no OpenSpec change, no
code diff, no `handoff.md` (a harness/invocation defect upstream of this slice, per QA's verdict). This
round is the first real build for issue #141; there is no prior Build Report content to preserve.

### What changed

Issue #141 is the ledger-fidelity prerequisite for issue #140 (Schedule Batch export). Before this
slice, `src/asset/asset.ts`'s ledger parser (`parseAssetRecord`) had no `scheduled_at` field at all, and
`parseCopyVariant` never read back `CopyVariant.unresolvedMentions` even though that field already
existed on the type (issue #130) and was already being written by `src/copy/compose.ts`. Because
`writeAsset` (`src/asset/store.ts`) re-normalizes an Idea's WHOLE `assets[]` array through this same
parser on every write — including a write that targets a different, sibling Asset on the same Idea —
both fields were silently dropped on the very next write to any Asset on an Idea that had them. This is
the exact live gotcha the issue names: Straw Motion's ledger already held a hand-written `scheduled_at`
from the 2026-08-04 Schedule Batch smoke test.

Fix: `LedgerAssetRecord` gains an optional `scheduled_at?: string` field (ISO-8601), parsed defensively
in `parseAssetRecord` exactly like the existing `produced_at`/`post_url` string fields — kept only when
a non-empty string, otherwise omitted (never fabricated). `parseCopyVariant` now also parses
`unresolvedMentions`, included on the result only when at least one well-formed entry survives. Neither
change touches `AssetStatus` or the Asset lifecycle (ADR-0011 unchanged) — `scheduled_at` is a plain
note, not a stage.

### Files touched

- `src/asset/asset.ts` — `LedgerAssetRecord.scheduled_at` (new field) + `parseAssetRecord` parses it;
  `parseCopyVariant` parses `unresolvedMentions`; doc comments updated.
- `src/asset/asset.test.ts` — new unit coverage for both fields (well-formed parse, absent, malformed,
  non-new-status).
- `src/asset/store.test.ts` — new regression test mirroring the real Straw Motion ledger shape: a write
  to a sibling Asset must not erase either field, on disk and on a subsequent `loadIdeaAssets` read.
- `openspec/changes/issue-141-ledger-scheduled-at-round-trip/` — `proposal.md`, `tasks.md`,
  `specs/asset-store/spec.md` (this OpenSpec change), plus this `handoff.md`.

No other file is modified. No new npm dependency. No `data/brands/**` file is touched.

### How to run

```bash
npm test                                             # type-check + full suite (1647 passing, 0 failing)
npm run test:docs                                    # 134 passing, 0 failing (unchanged — no doc touched)
node --import tsx --test src/asset/asset.test.ts      # 72 passing (this slice's unit tests)
node --import tsx --test src/asset/store.test.ts      # 9 passing (this slice's regression test)
npx openspec validate issue-141-ledger-scheduled-at-round-trip --strict   # "... is valid"
```

Baseline before this slice: `npm test` 1639 passing / 0 failing; `npm run test:docs` 134 passing / 0
failing. After this slice: `npm test` 1647 passing / 0 failing (+8, zero regressions); `npm run
test:docs` unchanged at 134/0 (no doc file touched by this slice).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #141) | Proving test |
|---|---|---|
| 1 | `scheduled_at` is an optional Asset field, ISO-8601, preserved through load -> write -> load; no new Asset status is added | `src/asset/asset.test.ts` — `describe("scheduled_at (issue #141)")`: "parses a well-formed ISO-8601 scheduled_at", "omits scheduled_at when absent", "drops a malformed scheduled_at (non-string/blank) rather than crashing", "adding scheduled_at does not add a new AssetStatus — the six-stage vocabulary is unchanged". Full load-write-load: `src/asset/store.test.ts` — "a write to a sibling Asset does NOT erase scheduled_at or a Copy variant's unresolvedMentions" (asserts `scheduled_at` on both the raw JSON on disk and a subsequent `loadIdeaAssets` read) |
| 2 | A Copy variant's unresolved-mentions list is preserved through the same round-trip | `src/asset/asset.test.ts` — "parses a non-empty unresolvedMentions list (issue #141)", "omits unresolvedMentions entirely when absent, empty, or malformed", "drops non-string entries from unresolvedMentions rather than throwing". Round-trip: `src/asset/store.test.ts`'s same regression test asserts the LinkedIn variant's `unresolvedMentions` on disk and on re-read |
| 3 | A write to a sibling Asset on the same Idea no longer erases either field (regression test mirroring the smoke-test ledger's real shape) | `src/asset/store.test.ts` — "a write to a sibling Asset does NOT erase scheduled_at or a Copy variant's unresolvedMentions": seeds a two-Asset Idea (a `carousel` Asset carrying `scheduled_at` + a LinkedIn Copy variant's `unresolvedMentions`, a plain `character-explainer-with-cast` Asset), calls `writeAsset` targeting ONLY the second Asset, asserts the first Asset's fields are completely intact. Confirmed genuinely failing pre-fix by temporarily stashing the `asset.ts` change (`git stash push -- src/asset/asset.ts`) and re-running — it fails with `scheduled_at` reading back `undefined`; green again once the stash is restored |

### Fakes / fixtures used

- **Magnific fake: NOT NEEDED.** This slice touches ledger-parsing code only (`src/asset/asset.ts` and
  its tests) — no Space/MCP interaction of any kind. Confirmed: `git diff -- src/asset/asset.ts
  src/asset/asset.test.ts src/asset/store.test.ts | grep -n "spaces_\|creations_"` returns no matches.
  No `spaces_*`/`creations_*` call anywhere in the diff; no live Space touched.
- **Fixtures:** in-memory literal objects only in `asset.test.ts` (pure module, no disk). `store.test.ts`
  uses its existing `withLedger` helper — a temp-dir ledger JSON file, written and cleaned up per test
  (`mkdtemp`/`rm` under the OS temp dir), no real Brand data read or written. The regression fixture's
  shape (a `carousel` Asset, a LinkedIn Copy variant with `unresolvedMentions`) is modeled on issue
  #140's own description of the real straw-motion smoke-test ledger, not copied from the live file (that
  hand-edit lives on a different branch/session and is not present in this worktree's
  `data/brands/straw-motion/ledger.json`, confirmed by `grep -c scheduled_at` returning 0 before this
  slice).

### Self-review notes

- Kept the fix to exactly the two missing parse paths (`scheduled_at` in `parseAssetRecord`,
  `unresolvedMentions` in `parseCopyVariant`) — no restructuring of the surrounding module, no new
  helper functions beyond what the existing `nonEmptyString`/array-filter idioms already provide.
  `scheduled_at` is parsed with the exact same one-line pattern as every neighboring string field
  (`produced_at`, `post_url`, `posted_at`); `unresolvedMentions` mirrors the existing `hashtags`
  parse-then-conditionally-include idiom already used for `cast`/`variants` elsewhere in the same file.
- Confirmed (via `git stash`) that the new regression test in `store.test.ts` genuinely fails without
  the `asset.ts` fix, so it is a real regression guard and not a test that would pass either way.
- Confirmed no scope creep: `src/asset/output-bundle.ts` (`cloneCopy`/`generatePostJson`) already reads
  `unresolvedMentions` off an in-memory `Copy` object and needed no change — it only ever saw the field
  disappear because the ledger read path (this fix) dropped it first. Left `/report`,
  `src/asset/migrate.ts`'s legacy-scalar fold, and CONTEXT.md untouched, per the issue's narrow scope
  (see Non-Goals in `proposal.md`).
- No dead code introduced; no unused imports/locals (`tsc --noEmit`, run as part of `npm test`, is
  clean).

### Known limits

- The Schedule Batch export itself (`/export-schedule`, the Media Host port, S3 hosting, the Zoho CSVs,
  the cleanup step — the rest of issue #140) is entirely out of scope for this slice, as stated in the
  issue and in `proposal.md`'s Non-Goals. This slice only makes the ledger a safe place to write
  `scheduled_at` into and read `unresolvedMentions` back out of.
- `/report`'s `ReportAssetRow` and `src/asset/output-bundle.ts`'s `generatePostJson` do not surface
  `scheduled_at` — no reader outside the Asset store was touched. Whether/how to surface the stamp is
  left to whichever future slice builds the export itself.
- The live `data/brands/straw-motion/ledger.json` in THIS worktree still has no `scheduled_at` on any
  Asset (the smoke-test hand-edit lives elsewhere) — nothing in this repo state currently exercises the
  fix against real data; the regression test's fixture is a faithful, deliberately-constructed stand-in.

## QA Verdict — Round 2: PASS

### Suite result

- `npm test` — actually run: **1647 passing, 0 failing, 0 cancelled, 0 skipped** (432 suites). Baseline
  before this slice (per Build Report) was 1639 passing / 0 failing; this slice adds exactly +8 net new
  passing tests, matching the 7 new `it`s in `src/asset/asset.test.ts` + 1 new `it` in
  `src/asset/store.test.ts`. Fully green.
- `npm run test:docs` — actually run: **134 passing, 0 failing** (35 suites) — unchanged from baseline,
  consistent with "no doc file touched by this slice."
- `npx openspec validate issue-141-ledger-scheduled-at-round-trip --strict` — actually run: **"Change
  'issue-141-ledger-scheduled-at-round-trip' is valid."**
- Isolated slice runs, both actually run and confirmed:
  `node --import tsx --test src/asset/asset.test.ts` → 72 passing, 0 failing.
  `node --import tsx --test src/asset/store.test.ts` → 9 passing, 0 failing.

### Per-criterion results (issue #141 acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `scheduled_at` optional, ISO-8601, preserved load->write->load; no new Asset status | **PASS** | Read `src/asset/asset.ts`: `LedgerAssetRecord.scheduled_at?: string` added (line ~162); `parseAssetRecord` parses it with `nonEmptyString(raw.scheduled_at)` (same idiom as `produced_at`/`post_url`), degrading absent/blank/non-string input to omitted. `AssetStatus` union (line ~61-68) is unchanged — still exactly the six stages `queued/in_production/produced/posted/tracking/scored`, no `"scheduled"` added anywhere in the diff (confirmed by reading the type and by `git diff --stat` showing only additive lines in 3 files). Proven by `src/asset/asset.test.ts`'s `describe("scheduled_at (issue #141)")` (4 tests, all passing) plus the full load->write->load round trip in `src/asset/store.test.ts`'s new regression test, which asserts `scheduled_at` on both the raw on-disk JSON and a subsequent `loadIdeaAssets()` read. |
| 2 | A Copy variant's unresolved-mentions list survives the same round-trip | **PASS** | Read `src/asset/asset.ts`: `parseCopyVariant` now filters `raw.unresolvedMentions` through `nonEmptyString`, included on the result only when `unresolvedMentions.length > 0` (never a stray `[]` key) — mirrors the existing `hashtags` idiom. Confirmed `CopyVariant.unresolvedMentions?: readonly string[]` already existed on the type (`src/copy/contract.ts:42`, issue #130) and was already written by `src/copy/compose.ts` and read by `src/asset/output-bundle.ts` — this fix closes only the ledger-parse gap, exactly as claimed. Proven by 3 new tests in `src/asset/asset.test.ts` (non-empty parses verbatim, omitted when absent/empty/malformed, non-string entries dropped) plus the same `store.test.ts` regression test's LinkedIn-variant assertions (on disk and via `loadIdeaAssets`). |
| 3 | A write to a sibling Asset no longer erases either field (regression test, real ledger shape) | **PASS** | Read `src/asset/store.test.ts`'s new test "a write to a sibling Asset does NOT erase scheduled_at or a Copy variant's unresolvedMentions": seeds a two-Asset Idea (`carousel` Asset with `scheduled_at` + a LinkedIn variant's `unresolvedMentions`; a plain `character-explainer-with-cast` Asset), calls `writeAsset` targeting only the second Asset, asserts the first Asset's `scheduled_at` and `unresolvedMentions` are fully intact both in the raw on-disk JSON and via a subsequent `loadIdeaAssets` read. This fixture shape (carousel Asset + LinkedIn variant + sibling Asset) matches the issue's stated live gotcha. Test file confirmed actually run green above (9/9 passing in `store.test.ts`). |

### Per-scenario results (spec deltas, `openspec/changes/issue-141-ledger-scheduled-at-round-trip/specs/asset-store/spec.md`)

| Scenario | Result | Covering test |
|---|---|---|
| A well-formed scheduled_at round-trips through load -> write -> load | PASS | `src/asset/store.test.ts` — "a write to a sibling Asset does NOT erase scheduled_at..." (asserts byte-identical `scheduled_at` on disk + re-read) |
| A missing or malformed scheduled_at is omitted, never fabricated | PASS | `src/asset/asset.test.ts` — "omits scheduled_at when absent", "drops a malformed scheduled_at (non-string/blank) rather than crashing" |
| scheduled_at introduces no new AssetStatus | PASS | `src/asset/asset.test.ts` — "adding scheduled_at does not add a new AssetStatus — the six-stage vocabulary is unchanged"; independently confirmed by reading the `AssetStatus` union unchanged in `src/asset/asset.ts` |
| A Copy variant's non-empty unresolvedMentions parses verbatim | PASS | `src/asset/asset.test.ts` — "parses a non-empty unresolvedMentions list (issue #141)" |
| An absent, empty, or malformed unresolvedMentions omits the key entirely | PASS | `src/asset/asset.test.ts` — "omits unresolvedMentions entirely when absent, empty, or malformed (never a stray [] key)" |
| A write to one Asset does not erase a sibling Asset's scheduled_at or unresolvedMentions | PASS | `src/asset/store.test.ts` — "a write to a sibling Asset does NOT erase scheduled_at or a Copy variant's unresolvedMentions" |

### OpenSpec faithfulness to the issue (job c)

- `proposal.md`'s Why/What-Changes accurately restates the issue's live gotcha (Straw Motion's ledger,
  the sibling-write drop bug) and scopes to exactly the two parse paths — no scope creep into the
  Schedule Batch export itself (issue #140), which is correctly listed under Non-Goals.
- The new Requirement in `specs/asset-store/spec.md` is additive (`## ADDED Requirements`) — confirmed
  no title collision against the existing `openspec/specs/asset-store/spec.md` (grep for
  `^### Requirement` shows 8 pre-existing requirement titles, none matching the new one).
  Correctly filed under the `asset-store` capability, matching where `parseAssetRecord`/
  `parseCopyVariant` actually live.
- Explicitly and correctly asserts ADR-0011 is unchanged (no new `AssetStatus`), matching both the
  issue's own acceptance criterion #1 and the actual code.
- No misread found: the spec does not claim more than the issue asks (no `/report` surfacing, no
  export logic, no new CONTEXT.md term) and does not drop any acceptance criterion — all three issue
  criteria map 1:1 onto the spec's 6 scenarios (criterion 1 -> scenarios 1-3, criterion 2 -> scenarios
  4-5, criterion 3 -> scenario 6).

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (not applicable/untouched) | No publish-path code touched; diff is confined to `src/asset/asset.ts` (parsing) and its two test files. |
| Public-metrics-only | PASS (not applicable/untouched) | No metrics-fetch code touched. |
| Relative-not-absolute | PASS (not applicable/untouched) | No scoring/baseline code touched. |
| Explicit-attribution | PASS (not applicable/untouched) | No `post_url`/attribution code touched. |
| Ledger-as-source-of-truth | PASS | This slice's entire purpose is upholding this rule — it fixes the ledger silently losing already-recorded data (`scheduled_at`, `unresolvedMentions`) on a sibling-Asset write. Verified directly: read `parseAssetRecord`/`parseCopyVariant` in `src/asset/asset.ts` and confirmed both fields are now defensively parsed and round-trip through `writeAsset` per the regression test. |
| ISO-8601 timestamps | PASS | `scheduled_at` is documented and typed as an ISO-8601 string, parsed with the same `nonEmptyString` idiom as the codebase's other timestamp fields (`produced_at`, `posted_at`) — consistent with existing convention (none of those fields do stricter format validation either, so this is not a new gap introduced by this slice). |
| Magnific fake / no live-Space calls | PASS | Ran `git diff -- src/asset/asset.ts src/asset/asset.test.ts src/asset/store.test.ts \| grep -n "spaces_\|creations_"` myself — zero matches (exit code 1, no output). Read all three changed files in full: no MCP tool call, no Space/board reference anywhere. This slice is pure ledger-parsing code; correctly, no Magnific fake was needed or used. |

### Defect list

None. No defects found in this round.

### Verdict

**PASS.** The full suite (1647/1647) and docs suite (134/134) are actually green, `openspec validate
--strict` is actually green, all 3 acceptance criteria are satisfied by code I read directly (not just
by the Build Report's claims) and by tests I ran directly, all 6 spec-delta scenarios have a matching
passing test, the OpenSpec change faithfully matches the issue with no scope creep and no dropped
criterion, no live-Space call exists anywhere in the diff, and the ledger-as-source-of-truth rule is
directly upheld (this slice's whole purpose). This slice is ready to proceed to a PR.
