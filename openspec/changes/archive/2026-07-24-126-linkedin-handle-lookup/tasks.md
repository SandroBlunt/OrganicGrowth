## 1. Ground the precedent + confirm the scope decision

- [x] 1.1 Read issue #126 in full, plus its parent epic #120, ADR-0019
  (`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`), and issue #130's body — confirm
  ADR-0019 and #130 both already treat this as ONE global lookup ("#126's separate lookup", "#126's
  handle lookup"), settling the issue's own open scope question: global, not per-Brand.
- [x] 1.2 Read `src/brand-asset/store.ts` + `src/brand-asset/store.test.ts` in full — the precedent to
  mirror (typed store boundary over a plain committed file/directory; defensive parsing;
  never-throw-on-missing "no assets yet" convention; `found`/`null` typed results, never fabricated).
- [x] 1.3 Read `src/production-queue/queue.ts` + `store.ts` — the precedent for a GLOBAL (not per-Brand)
  plain-file store: pure deep module (`queue.ts`) vs thin I/O shell (`store.ts`), `DEFAULT_*_PATH`
  constant, ENOENT-on-load degrades to an empty state rather than throwing.
- [x] 1.4 Read `src/format/store.ts`'s `loadFormat` — the precedent for throwing a clear, path-naming
  error on a genuine YAML *parse* failure (vs a missing file, which degrades instead).
- [x] 1.5 Run `npm test`, `npm run test:docs` standalone to capture the exact baseline: 1517 pass / 0
  fail (unit), 122 pass / 0 fail (docs) — zero pre-existing failures to work around.

## 2. lookup.ts — the pure deep module (test-first)

- [x] 2.1 Write `src/linkedin-handle/lookup.test.ts` FIRST (failing): `parseLinkedInHandleTable`
  parses a well-formed name->handle object; `resolveHandle` finds an entry by its exact authored name;
  `resolveHandle` returns `null` for a name absent from a non-empty table; `resolveHandle` returns `null`
  against `emptyLinkedInHandleTable()`/a table parsed from `null`/`undefined`/`{}` (the "empty lookup
  file" case, AC3); `resolveHandle` matches case-insensitively and trims whitespace; a malformed entry
  (non-string value, blank name/handle) is dropped with a `console.warn`, other entries still parse; two
  names that normalize to the same key keep the first, warning about the second (mirrors
  `listBrandAssets`'s duplicate-key convention); `parseLinkedInHandleTable` never throws for
  non-object/garbled `raw` input.
- [x] 2.2 Implement `src/linkedin-handle/lookup.ts`: `LinkedInHandleTable`, `LinkedInHandleEntry`,
  `emptyLinkedInHandleTable()`, `parseLinkedInHandleTable(raw)`, `resolveHandle(table, name)`. Pure, no
  I/O. Run 2.1: green.

## 3. store.ts — the I/O shell (test-first)

- [x] 3.1 Write `src/linkedin-handle/store.test.ts` FIRST (failing): `loadLinkedInHandleTable` round-trips
  a hand-written YAML file with real entries; loads a MISSING file as the empty table without throwing
  (AC2/AC3's "empty lookup file" case, file-not-yet-created variant); loads an EXISTING but genuinely
  empty YAML file (0 bytes, and separately just comments) as the empty table without throwing (AC3's
  other "empty lookup file" case); throws a clear, path-naming error for a file that exists but fails to
  parse as YAML (syntax error), never a bare parser exception; `resolveLinkedInHandle(name, path)` finds
  a committed entry (AC2 "found name"), returns `null` for an unresolved name (AC2 "unresolved name"),
  and returns `null` against a missing/empty file (AC2+AC3 combined) — never throws for any of these,
  never fabricates a handle.
- [x] 3.2 Implement `src/linkedin-handle/store.ts`: `DEFAULT_LINKEDIN_HANDLES_PATH`,
  `loadLinkedInHandleTable(path?)`, `resolveLinkedInHandle(name, path?)`. Run 3.1: green.

## 4. The real, committed lookup file + doc note (AC1, AC4)

- [x] 4.1 Add `data/linkedin-handles.yaml`: header comment documenting the shape, that it is
  Operator-maintained (hand-edited), and that it is NOT a live API lookup — no entries yet (this
  engineering slice does not curate real third-party handle data; the Operator adds entries by hand).
  Confirm `loadLinkedInHandleTable()` against the REAL committed path resolves it as the empty table
  without throwing (a test in `store.test.ts` using the actual repo file, not just a temp fixture).
- [x] 4.2 Confirm the store-level module doc comments on `lookup.ts` and `store.ts` state plainly:
  Operator-maintained, not a live API/network lookup (AC4).

## 5. OpenSpec

- [x] 5.1 Author `proposal.md` (Why / scope decision / What Changes / Non-Goals / Capabilities / Impact),
  this `tasks.md`, and one ADDED spec delta: `linkedin-handle-lookup`.
- [x] 5.2 `npx openspec validate 126-linkedin-handle-lookup --strict` green.

## 6. Self-review

- [x] 6.1 `npm test` green (type-check + full suite; confirm count grows from the 1517-pass baseline,
  zero regressions).
- [x] 6.2 `npm run test:docs` green (unchanged from the 122-pass baseline — this slice adds no
  `.docs-test.ts`/Skill doc file).
- [x] 6.3 Simplify pass: confirm every issue #126 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff (there is no Space/MCP code in this
  slice at all); confirm `src/copy/*` was never touched (resolution only, per the issue); remove any
  dead code/unused import.
- [x] 6.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific fake
  needed — this slice's code has no Space/MCP call of its own), self-review notes, known limits (the
  Non-Goals above, restated for qa).
