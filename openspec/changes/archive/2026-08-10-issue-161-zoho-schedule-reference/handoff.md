# Slice Handoff — issue-161-zoho-schedule-reference

## Build Report (developer, round 1)

### What changed

ADR-0020 (accepted, not yet merged to `main`; read read-only at
`/Users/CaxtonTaylor/Developer/OrganicGrowth/docs/adr/0020-zoho-mcp-schedules-posts-csv-becomes-fallback.md`)
decides that once the Producer schedules a Post through Zoho's own MCP tools, later confirmation ("is it
live yet?") must key on the exact reference Zoho returned at schedule-time — never guessed from timing.
This slice gives that reference a durable home in the ledger.

`src/asset/asset.ts`'s `LedgerAssetRecord` gains a new optional field, `zoho_schedule_reference`, typed
`ZohoScheduleReference = string | readonly string[]` — a single reference, or an array of them (one per
targeted Channel platform), stored and read back **completely verbatim**: never collapsed to always-array,
never re-derived, never partially reconstructed. A new pure parser, `parseZohoScheduleReference`, accepts
only a non-empty string or a non-empty array whose every entry is a non-empty string; any other shape
rejects the **whole** value (never half-kept), mirroring the existing `parseAssetMetrics`
never-half-fabricate pattern rather than the per-entry-dropping pattern `parseCastArray` uses. This is
purely additive — no new module, no `AssetStatus`, no lifecycle change. `status` stays `produced` for an
Asset scheduled via the MCP path; ADR-0011's six-stage vocabulary is unchanged.

`src/asset/store.ts` required **no code change**: its `writeAsset`/`loadIdeaAssets` shell already passes
any `LedgerAssetRecord` patch field straight through `upsertAsset` and re-parses the whole Idea's
`assets[]` array through `parseAssetRecord` on every write (the same mechanism issue #141 fixed for
`scheduled_at`/`unresolvedMentions`) — so the new field automatically survives a write to a sibling Asset,
and automatically round-trips through the existing typed store boundary. Verified with dedicated tests
(below), not just inferred.

### Files touched

- `src/asset/asset.ts` — `ZohoScheduleReference` type, `LedgerAssetRecord.zoho_schedule_reference` field,
  `parseZohoScheduleReference` function, wired into `parseAssetRecord`. Doc comments updated (module
  header + inline field doc).
- `src/asset/asset.test.ts` — 8 new tests (`zoho_schedule_reference (issue #161, ADR-0020)` describe
  block).
- `src/asset/store.test.ts` — 3 new tests (round-trip both shapes, sibling-write survival, legacy-record
  backward compatibility).
- `openspec/changes/issue-161-zoho-schedule-reference/` — `proposal.md`, `tasks.md`,
  `specs/asset-store/spec.md` (one ADDED Requirement, 8 Scenarios), this `handoff.md`.

No other file is touched. No live Brand `ledger.json` is touched. ADR-0020 itself is **not** copied into
this worktree/branch, per instructions — referenced by number/title only.

### How to run

```
npm test                                          # type-check + full suite (Node's built-in test runner)
npm run test:docs                                 # docs-conformance suite (unaffected by this slice)
node --import tsx --test src/asset/asset.test.ts  # this slice's unit tests only
node --import tsx --test src/asset/store.test.ts  # this slice's store round-trip tests only
npx openspec validate issue-161-zoho-schedule-reference --strict
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | An Asset scheduled via the MCP path carries, verbatim, the reference Zoho returned at schedule-time, plus `scheduled_at`. | `src/asset/asset.test.ts` → `zoho_schedule_reference (issue #161, ADR-0020)` → "parses a well-formed single-string reference onto the Asset, verbatim" and "parses a well-formed array of references onto the Asset, verbatim and in order" (both assert the field sits alongside a `scheduled_at` value). `src/asset/store.test.ts` → "writes and reads back a single-string zoho_schedule_reference verbatim" (asserts it alongside a `scheduled_at` patch through the real store path). |
| 2 | `status` remains `produced`; no new lifecycle stage is introduced. | `src/asset/asset.test.ts` → "does not add a new AssetStatus — status stays produced" (asserts `status === "produced"` post-parse AND `isAssetStatus("scheduled") === false`). |
| 3 | Reads/writes go through the typed store; ledger files written before this change still load cleanly (defensive parsing). | `src/asset/store.test.ts` → "loads a ledger record written before this field existed cleanly — no zoho_schedule_reference" (seeds a record with no `zoho_schedule_reference` key at all, asserts it loads via `loadIdeaAssets` with the key simply absent and `scheduled_at` preserved). All round-trip tests go through `writeAsset`/`loadIdeaAssets` — the typed `AssetStore` boundary — not raw file I/O. |
| 4 | The stored reference round-trips exactly; nothing re-derives or normalizes it. | `src/asset/asset.test.ts` → `parseZohoScheduleReference` unit tests (single string kept as string, array kept as array in order, malformed rejected as a whole — never partially cleaned). `src/asset/store.test.ts` → "a write to a sibling Asset does NOT erase zoho_schedule_reference" (array shape, deep-equal after a sibling write, both from the raw JSON on disk and via `loadIdeaAssets`) and "writes and reads back a single-string zoho_schedule_reference verbatim" (string shape). |

### Fakes / fixtures used

- **No Magnific fake.** This slice has zero Space/MCP interaction — it is pure ledger-parsing code plus a
  temp-directory-backed `ledger.json` fixture for the store tests (`mkdtemp`/`withLedger`, mirroring the
  existing pattern in `src/asset/store.test.ts`). Confirmed no live-Space calls: `grep -n "spaces_\|
  creations_" src/asset/asset.ts src/asset/asset.test.ts src/asset/store.test.ts` returns nothing.
- **No live Zoho MCP call either** — there is no Zoho-calling code in this repo yet (that is a later slice
  per ADR-0020's own "Consequences" section); this slice only adds the ledger field a future such call
  would write into.
- In-memory literal objects for `asset.test.ts`; a temp-directory `ledger.json` (deleted in a `finally`
  block) for `store.test.ts` — no fixture files committed to the repo.

### Self-review notes

- Chose the never-half-fabricate parsing rule (mirroring `parseAssetMetrics`) over the
  drop-malformed-entries rule (`parseCastArray`/`parseCopyVariants`) deliberately: the acceptance
  criterion "nothing re-derives or normalizes it" means a reference array with one bad entry must not be
  silently rewritten into a smaller "cleaned" array — that would itself be a normalization. The whole value
  is kept or the whole value is omitted; there is no middle state.
- No `src/asset/store.ts` code change was needed — verified this by reasoning through the existing
  `writeAsset`/`upsertAsset`/`parseAssetRecord` call chain, then proving it with the round-trip and
  sibling-write tests rather than taking it on faith.
- Considered whether to touch CONTEXT.md/CLAUDE.md's Asset-field prose list. Decided not to:
  `zoho_schedule_reference` is an internal ledger field (like `scheduled_at` was when issue #141 added it,
  which also did not touch CONTEXT.md/CLAUDE.md), not new Operator-facing vocabulary, and ADR-0020's own
  "Consequences" section explicitly assigns the CONTEXT.md/producer.md/OpenSpec-capability prose rewrite to
  the later MCP-calling build slice, not this one. Confirmed no docs-test pins the Asset-field list against
  this field (checked `approval-gate.docs-test.ts`, the only docs-test that pins `scheduled_at` prose, and
  it does not enumerate the full field list). `npm run test:docs` baseline (179 passing) is unchanged.
- Removed nothing — this is a small, additive diff with no dead code to clean up.

### Known limits

- The actual Zoho MCP-calling code (portal/brand/channel lookups, validate-then-schedule, the
  conversational-approval gate, the confirmed-live check that reads this field back before auto-logging a
  Post) is **not built by this slice** — ADR-0020 itself names it as a future build slice, and this issue's
  scope is the ledger field alone.
- The one-time Straw Motion 2026-W32 heuristic-matching closeout (ADR-0020's explicitly one-time exception
  for posts that went out via the old CSV path, with no such reference) is not part of this slice.
- No reader outside the ledger/Asset store (`/report`, `post.json`/`generatePostJson`) surfaces this field
  yet — deliberately out of scope (see proposal's Non-Goals).

### Test-suite result

- `npm test`: **1897 passing, 0 failing** (baseline before this slice: 1886 passing — 11 new tests, zero
  regressions).
- `npm run test:docs`: **179 passing, 0 failing** (unchanged from baseline — no doc file touched).
- `npx openspec validate issue-161-zoho-schedule-reference --strict`: **valid**.

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (Node's built-in test runner, type-check via `tsc --noEmit` then full suite): **1897
  passing, 486 suites, 0 failing, 0 cancelled, 0 skipped** — actually run, real green (matches the
  Build Report's claimed count; baseline on `origin/main` before this slice was 1886, so this slice adds
  11 tests: 8 in `asset.test.ts` + 3 in `store.test.ts`, zero regressions).
- `npm run test:docs`: **179 passing, 45 suites, 0 failing** — actually run, real green, unchanged from
  baseline (no doc file touched by this slice).
- `npx openspec validate issue-161-zoho-schedule-reference --strict`: **"Change 'issue-161-zoho-schedule-reference' is valid"**, exit 0.
- `npx openspec validate --all --strict`: **36 passed, 0 failed** (every spec + change in the repo,
  including this one), exit 0.

### Per-criterion results

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | Asset scheduled via MCP path carries the Zoho reference verbatim, plus `scheduled_at`. | PASS | `src/asset/asset.ts:187` adds `readonly zoho_schedule_reference?: ZohoScheduleReference` alongside `scheduled_at`; `parseAssetRecord` (line 408) includes it only when well-formed. Proven by `asset.test.ts` "parses a well-formed single-string reference onto the Asset, verbatim" and "…array of references…verbatim and in order" (both assert `scheduled_at`/co-presence), and `store.test.ts` "writes and reads back a single-string zoho_schedule_reference verbatim" (through the real `writeAsset`/`loadIdeaAssets` store path). All pass. |
| 2 | `status` stays `produced`; no new lifecycle stage. | PASS | `AssetStatus` (asset.ts:69-75) is still exactly the six original values — no `"scheduled"` or other new member added. `asset.test.ts` "does not add a new AssetStatus — status stays produced" asserts `status === "produced"` post-parse AND `isAssetStatus("scheduled") === false`. Confirmed by direct read of the type definition, not just the test. |
| 3 | Reads/writes go through the typed store; pre-existing ledger records without the field still load cleanly. | PASS | No parallel store: `writeAsset`/`loadIdeaAssets` (`src/asset/store.ts`, unmodified) is the sole write/read path used by every new test. `store.test.ts` "loads a ledger record written before this field existed cleanly — no zoho_schedule_reference" seeds a record with no key at all, loads via `loadIdeaAssets`, asserts the key is simply absent (`Object.hasOwn(...) === false`) and `scheduled_at` is preserved. Passes. |
| 4 | Stored reference round-trips exactly; nothing re-derives or normalizes it. | PASS | `parseZohoScheduleReference` (asset.ts:372) does no trimming/coercion — `nonEmptyString` (line 237-238) is a strict `typeof === "string" && length > 0` check with no `.trim()`; a malformed value (blank string, empty array, mixed-type array, number, object) is rejected as a WHOLE (returns `null`) rather than partially cleaned — verified by reading the parser body directly. `store.test.ts` "a write to a sibling Asset does NOT erase zoho_schedule_reference" proves survival through the re-normalize-whole-array write path (issue #141's mechanism) via `deepEqual` against the raw JSON on disk AND via `loadIdeaAssets`. All pass. |

### Per-scenario results (spec delta: `openspec/changes/issue-161-zoho-schedule-reference/specs/asset-store/spec.md`, one ADDED Requirement, 8 Scenarios)

| Scenario | Result | Covering test |
|---|---|---|
| A well-formed single-string reference parses onto the Asset, verbatim | PASS | `asset.test.ts` "parses a well-formed single-string reference onto the Asset, verbatim" |
| A well-formed array of references parses onto the Asset, verbatim and in order | PASS | `asset.test.ts` "parses a well-formed array of references onto the Asset, verbatim and in order" |
| A malformed reference is rejected as a whole, never partially kept | PASS | `asset.test.ts` "parseZohoScheduleReference rejects a blank string, empty array, or non-string entries" + "drops a malformed zoho_schedule_reference (blank/empty/mixed-type) rather than crashing" (loops over 6 malformed shapes, asserts key absent each time) |
| zoho_schedule_reference is omitted when absent | PASS | `asset.test.ts` "omits zoho_schedule_reference when absent" |
| zoho_schedule_reference introduces no new AssetStatus; status stays produced | PASS | `asset.test.ts` "does not add a new AssetStatus — status stays produced" |
| A well-formed reference round-trips through load → write → load, in either shape | PASS | `store.test.ts` "writes and reads back a single-string zoho_schedule_reference verbatim" (string shape) + the array shape covered inside "a write to a sibling Asset does NOT erase zoho_schedule_reference" (seeds an array, re-reads via `loadIdeaAssets`) |
| A write to a sibling Asset does not erase an already-recorded zoho_schedule_reference | PASS | `store.test.ts` "a write to a sibling Asset does NOT erase zoho_schedule_reference" (two-Asset Idea, patch targets only the second, first Asset's field verified unchanged both on raw disk JSON and via `loadIdeaAssets`) |
| A ledger record written before this field existed still loads cleanly | PASS | `store.test.ts` "loads a ledger record written before this field existed cleanly — no zoho_schedule_reference" |

All 8 Scenarios trace to real, passing tests that actually exercise the behavior described (not just asserting a trivial truth).

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish call exists anywhere in the diff; `status` stays `produced` for a scheduled-via-MCP Asset (verified above) — recording a reference is not publishing. |
| Public-metrics-only | PASS (N/A) | This slice touches no metrics code (`metrics`/`performance_score`/`tracked_at` fields untouched). |
| Relative-not-absolute | PASS (N/A) | No scoring/comparison code touched. |
| Explicit-attribution | PASS | Nothing in this diff infers a Post/attribution from timing or from `zoho_schedule_reference` — the field is stored inertly; `/log-post`'s explicit-URL attribution path (`post_url`) is untouched. |
| Ledger-as-source-of-truth | PASS | The new field is written/read exclusively through the existing typed `AssetStore` boundary (`writeAsset`/`loadIdeaAssets`, `src/asset/store.ts`, unmodified) — no parallel store, no direct file write in product code (only test fixtures use `mkdtemp`/`readFile` to inspect a temp ledger). |
| No live Magnific-Space calls | PASS | `grep -n "spaces_\|creations_" src/asset/asset.ts src/asset/asset.test.ts src/asset/store.test.ts` → no matches (re-ran independently, confirmed empty). |
| No live Zoho MCP calls | PASS | `grep -in "zoho" src/asset/asset.ts src/asset/asset.test.ts src/asset/store.test.ts` → every hit is a doc-comment string or a test-data string literal (e.g. `"post_abc123"`, `"fb_post_1"`) or a `describe`/`it` title mentioning ADR-0020/issue #161 — no MCP tool invocation, no network call, no Zoho SDK/client import anywhere in the repo (`grep -rn "zoho" src --include="*.ts" -il` outside this diff returns nothing else). |

### Diff-scope check

`git diff origin/main --stat` (against `origin/main` at `0af68af`): exactly `src/asset/asset.ts` (+45),
`src/asset/asset.test.ts` (+71), `src/asset/store.test.ts` (+78) — 194 insertions, 0 deletions, 3 files.
`git status --porcelain` shows only those 3 modified files plus the untracked
`openspec/changes/issue-161-zoho-schedule-reference/` folder (4 new files: `proposal.md`, `tasks.md`,
`specs/asset-store/spec.md`, `handoff.md`). No `data/` file, no prose doc, no `src/asset/store.ts` change,
no issue-#160-sibling code touched. Scope matches the Build Report exactly.

### OpenSpec-vs-issue faithfulness check

Read the issue body against `proposal.md` and the spec delta line by line:

- Issue AC1 (verbatim reference + `scheduled_at`) → proposal "What Changes" bullet 1 + Requirement
  paragraph 1 + Scenarios 1/2 — faithful, no scope creep (field is optional, additive, placed alongside
  `scheduled_at` exactly as the issue says).
- Issue AC2 (`status` stays `produced`, no new lifecycle stage) → proposal bullet 2 + Requirement
  paragraph 2 + Scenario 5 — faithful; independently confirmed `AssetStatus` untouched in the actual type
  definition (not just the spec's say-so).
- Issue AC3 (typed store, defensive parse of pre-existing records) → proposal bullet 3 + Requirement
  paragraph 3 + Scenario 8 — faithful; the proposal correctly identifies and explains the sibling-write
  re-normalization hazard (issue #141's mechanism) rather than hand-waving it.
- Issue AC4 (exact round-trip, no re-derivation/normalization) → proposal bullet 1 (VERBATIM emphasis) +
  Requirement paragraph 1 + Scenario 3 — faithful. The developer's "reject-the-whole-value" design choice
  (flagged for judgment) is the CORRECT reading of "nothing re-derives or normalizes it": silently
  dropping one bad array entry would itself be a normalization/reconstruction of Zoho's actual returned
  shape. This is a defensible, arguably the only textually-faithful, interpretation — not a
  self-consistent-but-wrong spec. No objection.
- Non-Goals section correctly scopes out the MCP-calling code itself, the W32 closeout, and
  CONTEXT.md/producer.md prose updates — all of which the issue's own scope (only the ledger field) and
  ADR-0020's "Consequences" section (per the developer's citation) assign to a later slice. Nothing in the
  issue asks for those in this slice.
- No contradiction found against CONTEXT.md, ADR-0002/0003/0004, or PRD #1 — this is a narrow,
  additive, ledger-only change with no publish/production-runtime implications.

### Defect list

None.
