## 1. Ground the precedent + confirm the triage correction

- [x] 1.1 Read issue #149 in full, plus its triage comment (2026-08-05) — confirm the triage comment,
  not the stale issue-body "Solution" section, is authoritative: `data/mention-handles.yaml` does not
  exist yet, and `data/linkedin-handles.yaml` has zero real entries. This is a from-empty migration, not
  a data migration.
- [x] 1.2 Read `src/linkedin-handle/lookup.ts` + `store.ts` (+ both test files) in full — the exact
  precedent this slice generalizes: pure deep module vs thin I/O shell split, `DEFAULT_*_PATH` constant,
  ENOENT-on-load degrades to empty, a genuine YAML parse failure throws a path-naming error, defensive
  per-entry parsing (never crash the whole table).
- [x] 1.3 Read `src/copy/linkedin-mentions.ts` + `linkedin-mentions.test.ts` in full — confirm the
  CONTRACT this slice must not change: resolve -> `@Name` text; unresolved -> plain name +
  `unresolvedMentions` review flag; zero companies short-circuits before any I/O.
- [x] 1.4 Repo-wide grep for `linkedin-handle`/`linkedin-handles.yaml` to enumerate every reference this
  slice must update or leave alone (confirms the issue's own hint list: `src/copy/compose.ts`,
  `compose.test.ts`, `linkedin-mentions.test.ts`, `platform-shape.ts`, `validate.ts`,
  `write-social-copy-skill.docs-test.ts`, `.claude/skills/write-social-copy/SKILL.md`,
  `.claude/agents/producer.md`, plus `openspec/specs/copy-composition/spec.md` and
  `openspec/specs/linkedin-handle-lookup/spec.md` — the latter two left for the archive step to fold this
  change's own spec deltas into, per this repo's established pipeline, never hand-edited mid-slice).
- [x] 1.5 Run `npm test` and `npm run test:docs` standalone to capture the exact baseline: 1863 pass / 0
  fail (unit), 179 pass / 0 fail (docs) — zero pre-existing failures to work around.

## 2. `src/mention-handle/lookup.ts` — the pure deep module, platform-keyed (test-first)

- [x] 2.1 `git mv src/linkedin-handle src/mention-handle` — rename the directory (see proposal.md's
  "Module rename" section for the rationale).
- [x] 2.2 Rewrite `src/mention-handle/lookup.test.ts` FIRST (failing against the not-yet-rewritten
  module): `MENTION_PLATFORMS`; `parseMentionHandleTable` parses a well-formed nested
  `company -> { platform: handle }` object, each entry carrying a `ReadonlyMap<MentionPlatform, string>`;
  trims handle whitespace; matches a platform key case-insensitively; recognizes all five documented
  platforms; drops a blank company name (keeps the well-formed entry); drops a company value that isn't
  itself a platform map; drops an UNRECOGNIZED platform key while KEEPING that company's other, valid
  platform handles; drops a blank/non-string handle for one platform while keeping the company's other
  platforms; drops a company down to nothing when it ends up with ZERO valid platform handles; keeps the
  first of two normalizing-to-the-same-key company names, warning about the second;
  `parseMentionHandleTable` never throws for `null`/`undefined`/non-object/array input.
  `resolveHandle(table, name, platform)`: resolves an exact `(company, platform)` pair; case-insensitive/
  trimmed company matching; **AC2's core scenario — a company WITH a committed entry but no handle for
  the QUERIED platform resolves to `null`, never a guess**; an unknown company resolves to `null`; the
  empty table resolves every pair to `null`.
- [x] 2.3 Implement `src/mention-handle/lookup.ts`: `MENTION_PLATFORMS`, `MentionPlatform`,
  `MentionHandleEntry`, `MentionHandleTable`, `emptyMentionHandleTable()`,
  `parseMentionHandleTable(raw)`, `resolveHandle(table, name, platform)`. Pure, no I/O. Run 2.2: green.

## 3. `src/mention-handle/store.ts` — the I/O shell (test-first)

- [x] 3.1 Rewrite `src/mention-handle/store.test.ts` FIRST (failing): `loadMentionHandleTable`
  round-trips a hand-written nested YAML file; loads a MISSING file as the empty table; loads an
  EXISTING but zero-byte/comments-only file as the empty table; throws a clear, path-naming error
  ("Cannot parse Mention Handle Registry YAML") for genuinely invalid YAML; loads the REAL committed
  `data/mention-handles.yaml` without throwing. `resolveMentionHandle(name, platform, path)`: resolves a
  committed `(company, platform)` pair; **returns `null` for a company that HAS an entry but not for the
  queried platform (AC2's platform-keyed contract, at the I/O layer)**; returns `null` for an unknown
  company; returns `null` against a missing file; defaults to `DEFAULT_MENTION_HANDLES_PATH`.
  `resolveLinkedInHandle(name, path)` — the friendly alias: resolves a company's `linkedin` handle
  specifically even when OTHER platforms are also committed for it; returns `null` when a company is
  committed but has NO `linkedin` handle (even though it has other platforms — proves the alias never
  falls back to a different platform's handle); returns `null` for an unknown company / missing file;
  defaults to `DEFAULT_MENTION_HANDLES_PATH`.
- [x] 3.2 Implement `src/mention-handle/store.ts`: `DEFAULT_MENTION_HANDLES_PATH`,
  `loadMentionHandleTable(path?)`, `resolveMentionHandle(name, platform, path?)`,
  `resolveLinkedInHandle(name, path?)` (thin alias: `resolveMentionHandle(name, "linkedin", path)`). Run
  3.1: green.

## 4. The real, committed registry file (AC1, empty per the triage correction)

- [x] 4.1 Add `data/mention-handles.yaml`: header comment documenting the platform-keyed shape,
  Operator-maintained, NOT a live API lookup, recognized platform keys, and that a missing company OR a
  missing platform key under a known company both resolve to no handle, never fabricated — no entries
  yet (mirrors issue #126's own "ships empty" precedent; the triage correction confirms there is no real
  handle data to seed). Confirm `loadMentionHandleTable()` against the REAL committed path resolves to
  the empty table without throwing (task 3.1's real-file test).
- [x] 4.2 `git rm data/linkedin-handles.yaml` — delete the old file (AC3). Confirmed by task 1.4's grep
  sweep that nothing in `src/**` still reads it before deleting.

## 5. Migrate the ONE consumer: `src/copy/linkedin-mentions.ts` (AC1 — contract unchanged)

- [x] 5.1 Update `src/copy/linkedin-mentions.ts`'s import to `../mention-handle/store.ts`
  (`resolveLinkedInHandle`, `DEFAULT_MENTION_HANDLES_PATH`); rename `weaveLinkedInMentions`'s third
  parameter `linkedInHandlesPath` -> `mentionHandlesPath` (positional-only in every existing call site —
  no named-property breakage); update module + function doc comments to name the new data source.
  `weaveLinkedInMentions`, `companiesFromCopyInput`, `buildLinkedInMentionResolutions`,
  `injectLinkedInMentions`, `unresolvedMentionNames` — every exported name and every byte of resolve ->
  `@Name` / unresolved -> plain-name-plus-flag behavior stays IDENTICAL.
- [x] 5.2 Update `src/copy/linkedin-mentions.test.ts`'s 4 temp-file fixtures from the OLD flat
  `Name: handle` YAML shape to the NEW nested `Name:\n  linkedin: handle` shape (the registry's own
  platform-keyed shape) — every assertion about the resulting caption/`unresolvedMentions` content stays
  byte-for-byte the same (AC1: this suite proves the contract survived the data-source migration). Run:
  green, unmodified pass/fail semantics.
- [x] 5.3 Update `src/copy/compose.ts`'s `ComposeCopyOptions.linkedInHandlesPath` field ->
  `mentionHandlesPath` (doc comment + the one call site passing it to `weaveLinkedInMentions`); update
  `src/copy/compose.test.ts`'s fixture file (`fixtures/linkedin-handles.copy-tests.yaml` ->
  `fixtures/mention-handles.copy-tests.yaml`, reshaped to the nested platform-keyed format) and its 5
  `linkedInHandlesPath: LINKEDIN_HANDLES` call sites -> `mentionHandlesPath: MENTION_HANDLES`. Run:
  green, every existing `composeCopyForChannels` LinkedIn-mention assertion unchanged.

## 6. Update remaining doc-comment/prose references (AC4)

- [x] 6.1 `src/copy/platform-shape.ts` (2 spots), `src/copy/validate.ts` (2 spots): update
  `src/linkedin-handle/` cross-references -> `src/mention-handle/`. No behavior change — these are pure
  doc comments.
- [x] 6.2 `src/copy/write-social-copy-skill.docs-test.ts`: update the `/linkedin-handle/` regex assertion
  -> `/mention-handle/`, matching the SKILL.md prose update below.
- [x] 6.3 `.claude/skills/write-social-copy/SKILL.md`: update the `src/linkedin-handle/`/
  `linkedInHandlesPath` references (2 spots) -> `src/mention-handle/`/`mentionHandlesPath`.
- [x] 6.4 `.claude/agents/producer.md`: update the `src/linkedin-handle/store.ts` reference -> `src/
  mention-handle/store.ts`.
- [x] 6.5 Confirm (grep) that ZERO live (non-`openspec/changes/archive/`) file still references
  `linkedin-handle` as a directory/module path, `linkedin-handles.yaml`, `DEFAULT_LINKEDIN_HANDLES_PATH`,
  or `linkedInHandlesPath` — except the two `openspec/specs/*` files intentionally left for the archive
  step (task 1.4) and the deliberate "supersedes the old ... data/linkedin-handles.yaml" historical
  mentions in `data/mention-handles.yaml`'s header and `src/mention-handle/store.ts`'s own doc comments.

## 7. OpenSpec

- [x] 7.1 Author `proposal.md` (Why / triage correction / What Changes / module-rename rationale /
  Non-Goals / Capabilities / Impact), this `tasks.md`, and three spec deltas: `mention-handle-lookup`
  (ADDED, the full generalized capability), `linkedin-handle-lookup` (REMOVED, every requirement, each
  with Reason + Migration pointing at `mention-handle-lookup`), `copy-composition` (MODIFIED, the three
  requirements that named the old path/field names, restated to name the new ones — no behavior change).
- [x] 7.2 `openspec validate 149-mention-handles-registry --strict` green.

## 8. Self-review

- [x] 8.1 `npm test` green (type-check + full suite; confirm count grows from the 1863-pass baseline,
  zero regressions).
- [x] 8.2 `npm run test:docs` green (unchanged from the 179-pass baseline — this slice edits existing
  Skill/agent prose but adds no new `.docs-test.ts` file).
- [x] 8.3 Simplify pass: confirm every issue #149 acceptance criterion maps to a named, passing test;
  confirm no `spaces_*`/`creations_*` call anywhere in the diff; confirm `resolveLinkedInHandle`'s
  friendly-alias indirection is genuinely load-bearing (the one real consumer) and not needless
  wrapping; remove any dead code/unused import.
- [x] 8.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific fake
  needed — this slice's code has no Space/MCP call of its own), the module-rename decision restated for
  qa, self-review notes, known limits (the Non-Goals above, restated for qa).
