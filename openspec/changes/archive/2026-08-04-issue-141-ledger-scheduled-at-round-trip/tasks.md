## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #141 in full, plus its parent issue #140 (Schedule Batch spec) for the exact shape
  `scheduled_at` and the unresolved-mentions note list need to have. Confirm no blockers ("Blocked by:
  None — can start immediately").
- [x] 1.2 Read `src/asset/asset.ts`'s `LedgerAssetRecord`/`parseAssetRecord`/`parseCopyVariant` — confirm
  `scheduled_at` does not exist on the type at all, and `parseCopyVariant` never reads back
  `CopyVariant.unresolvedMentions` even though `src/copy/contract.ts` already declares it (issue #130).
- [x] 1.3 Read `src/asset/store.ts`'s `writeAsset` and `src/asset/migrate.ts`'s `normalizeIdeaStatus` —
  confirm every write re-normalizes the WHOLE Idea's `assets[]` through `parseAssetsArray`/
  `parseAssetRecord`, which is exactly why a write to one Asset can silently drop an unrelated field on a
  SIBLING Asset on the same Idea.
- [x] 1.4 Confirm the live gotcha: grep the repo for `scheduled_at` (zero hits before this slice) and
  confirm straw-motion's `data/brands/straw-motion/ledger.json` in this worktree has no such field yet
  (the hand-written smoke-test edit lives on a different branch/session) — the regression test below
  builds an equivalent fixture in-memory rather than depending on that live file.
- [x] 1.5 Run `npm test` to capture the exact baseline pass count (1639 passing, 0 failing) and
  `npm run test:docs` (134 passing, 0 failing) before any change.

## 2. `src/asset/asset.ts` — scheduled_at + unresolvedMentions parse defensively (test-first)

- [x] 2.1 Add tests to `src/asset/asset.test.ts` FIRST (failing): `parseCopyVariant` parses a non-empty
  `unresolvedMentions` list verbatim; omits the key entirely when absent, empty, or non-array (never a
  stray `[]`); drops non-string entries. `parseAssetRecord` parses a well-formed `scheduled_at`; omits it
  when absent; drops a malformed (non-string/blank) one; parsing `scheduled_at` does not change `status`
  or add a new `AssetStatus`.
- [x] 2.2 Implement: add `scheduled_at?: string` to `LedgerAssetRecord`, parsed in `parseAssetRecord`
  exactly like the existing `produced_at`/`post_url` string fields; extend `parseCopyVariant` to parse
  `unresolvedMentions`, included only when at least one entry survives. Run 2.1: green.
- [x] 2.3 Add a regression test to `src/asset/store.test.ts` FIRST (failing against the pre-fix code,
  confirmed by temporarily stashing the `asset.ts` change and re-running): seed a ledger Idea with TWO
  Assets, one carrying `scheduled_at` + a LinkedIn Copy variant's `unresolvedMentions`, the other plain;
  call `writeAsset` targeting ONLY the second (sibling) Asset; assert the first Asset's `scheduled_at`
  and `unresolvedMentions` are untouched, both in the raw JSON on disk and via a subsequent
  `loadIdeaAssets` read. Confirmed genuinely failing pre-fix, green post-fix.

## 3. OpenSpec

- [x] 3.1 `grep -n "^### Requirement" openspec/specs/asset-store/spec.md` to confirm the new requirement
  title does not already exist verbatim (ADDED, not MODIFIED).
- [x] 3.2 Author `proposal.md` (Why / What Changes / Non-Goals / Capabilities / Impact), this `tasks.md`,
  and an ADDED-Requirement spec delta for `asset-store`.
- [x] 3.3 `npx openspec validate issue-141-ledger-scheduled-at-round-trip --strict` green.

## 4. Self-review

- [x] 4.1 `npm test` green (type-check + full suite; confirm the count grows from the 1639 baseline with
  zero regressions).
- [x] 4.2 `npm run test:docs` green (confirm the 134 baseline is unchanged — no doc file touched by this
  slice).
- [x] 4.3 Simplify pass: confirm every issue #141 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; remove any dead code/unused import.
- [x] 4.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific fake
  needed — this slice has no Space/MCP code), self-review notes, known limits (the export itself, issue
  #140, deliberately not started).
