## 1. Ground the decision + map today's shape

- [x] 1.1 Verify pre-flight: issue #161 is labeled `ready-for-agent`, "Blocked by: None — can start
  immediately" (confirmed via `gh issue view 161`).
- [x] 1.2 Read ADR-0020 (read-only, external path — not on this branch; referenced by number/title only,
  never copied in) for the exact decision: the reference is checked LATER, keyed on what Zoho returned at
  schedule-time, never guessed from timing; the field can be a single reference or several (multi-Channel).
- [x] 1.3 Read `src/asset/asset.ts`'s `LedgerAssetRecord`/`parseAssetRecord`, focusing on how
  `scheduled_at` (issue #140/#141) is typed, parsed defensively, and included-only-when-well-formed — this
  is the pattern to mirror exactly.
- [x] 1.4 Read `src/asset/store.ts`'s `writeAsset`/`loadIdeaAssets` — confirm the generic `patch` shape
  already passes any `LedgerAssetRecord` field straight through `upsertAsset` and the SAME parser on every
  write (including a write targeting an unrelated sibling Asset) — no store-level code change needed, only
  `asset.ts`'s type + parser.
- [x] 1.5 Read `openspec/specs/asset-store/spec.md` and the archived issue-141 change
  (`openspec/changes/archive/2026-08-04-issue-141-ledger-scheduled-at-round-trip/`) as the template for
  this delta's shape (an ADDED Requirement, same style of Scenarios).
- [x] 1.6 Run `npm test` (1886 passing, 0 failing) and `npm run test:docs` (179 passing, 0 failing) to
  capture the exact baseline before any change.

## 2. `src/asset/asset.ts` — zoho_schedule_reference, verbatim (test-first)

- [x] 2.1 Add tests to `src/asset/asset.test.ts` FIRST (failing — `parseZohoScheduleReference` does not
  exist yet): a well-formed single string is kept verbatim; a well-formed array of strings is kept
  verbatim, in order; a blank string, empty array, array with any non-string/blank entry, or a
  non-string/non-array value returns `null` (the WHOLE value rejected, not partially kept);
  `parseAssetRecord` includes the field only when well-formed, omits it when absent, drops it (never
  crashes) when malformed; parsing it never changes `status` or introduces a new `AssetStatus`.
- [x] 2.2 Implement: add `export type ZohoScheduleReference = string | readonly string[]`; add
  `zoho_schedule_reference?: ZohoScheduleReference` to `LedgerAssetRecord` alongside `scheduled_at`; add
  `parseZohoScheduleReference` and wire it into `parseAssetRecord` exactly like the other
  included-only-when-non-null optional fields. Run 2.1: green.
- [x] 2.3 Add tests to `src/asset/store.test.ts` FIRST (failing pre-implementation, confirmed green
  post-2.2 since the store has no code change of its own): a write -> read round-trip for BOTH the
  single-string and array shapes via `writeAsset`/`loadIdeaAssets`; a write targeting a SIBLING Asset does
  not erase an already-recorded `zoho_schedule_reference` (mirrors issue #141's regression test shape); a
  ledger record predating this field (no `zoho_schedule_reference` key at all) loads cleanly with the field
  simply absent (defensive parsing / backward compatibility, AC3).

## 3. OpenSpec

- [x] 3.1 `grep -n "^### Requirement" openspec/specs/asset-store/spec.md` to confirm the new requirement
  title does not already exist verbatim (ADDED, not MODIFIED).
- [x] 3.2 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this `tasks.md`,
  and an ADDED-Requirement spec delta for `asset-store` under
  `openspec/changes/issue-161-zoho-schedule-reference/specs/asset-store/spec.md`.
- [x] 3.3 `npx openspec validate issue-161-zoho-schedule-reference --strict` green.

## 4. Self-review

- [x] 4.1 `npm test` green (type-check + full suite; confirm the count grows from the 1886 baseline with
  zero regressions).
- [x] 4.2 `npm run test:docs` green (confirm the 179 baseline is unchanged — no doc file touched by this
  slice).
- [x] 4.3 Simplify pass: confirm every issue #161 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*`/Zoho MCP call anywhere in the diff; remove any dead code/unused
  import.
- [x] 4.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific fake
  needed — this slice has no Space/MCP code at all), self-review notes, known limits (the MCP-calling code
  itself, deliberately not started — belongs to a later slice per ADR-0020).
