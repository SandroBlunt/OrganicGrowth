# Retire the dormant file-backed Production Spec composer and its allow-list entry

## Why

Issue #238 (re-triaged 2026-08-18) tracked a dormant pairing: `src/production-spec/compose.ts`'s
`composeSpec` calls `saveSpec` (`src/production-spec/store.ts`) directly — the file-backed Production
Spec write — so it sits on `src/store-write-boundary/allow-list.ts` as a deliberate, tracked exception.
The ticket's original framing left open whether `composeSpec` should eventually get its own thin
orchestration surface (parallel to `src/command-surface/`, for file-backed writers) or be folded into the
SQL-backed path. It named its own wake-up trigger: something starting to author a Production Spec in
production.

That trigger landed, but not through `composeSpec`. ADR-0031 (issue #264, merged) moved Spec authorship
to Review (accept time) via a completely different, Recipe-generic path —
`src/production-spec/author-at-review.ts`'s `authorSpecForRecipe`, self-checked against the existing
`auditAuthorPhase`, then persisted through `src/command-surface/production-spec.ts`'s `saveAssetSpec`
(SQL) and `refreshSpecFile` (the regenerated on-disk view). Both of those already live inside
`src/command-surface/`, which the store-write-boundary guard exempts by design — neither needed an
allow-list entry.

`composeSpec` still has zero production callers (re-confirmed fresh: `grep -rn "composeSpec" src
--include='*.ts'` finds only its own module and its own test). It predates the Recipe/multi-format model
entirely — it is not Recipe-aware, hardcoding the single original `generate.ts` generator — and now that
Review is the sole authorship point, no path in the current design will ever call it. It is not dormant
anymore; it is superseded. Its `generate()`/`validate()`/`scanForBannedWords()`/`saveSpec()` dependencies
are each independently still live and still tested (`generate.test.ts`, `validate.test.ts`,
`brand-safety.test.ts`, `store.test.ts`) — only the standalone gate function wrapping them into one write
is dead.

Separately, the live (non-archived) `production-spec` OpenSpec specification still carries a Requirement
("Compose and persist a Production Spec beside the Brief, segmented by Recipe") asserting the Producer
composes and persists the Spec via this module, and a "Producer agent definition" Requirement whose prose
still describes the Producer as generating the Spec. Both contradict ADR-0031's accept-time authoring
model, already documented elsewhere in the same spec set (this same file's own "A deterministic Spec
author exists for every wired Recipe" / "authorSpecForRecipe authors a candidate Spec..." Requirements,
plus `accept-idea-command`'s "acceptIdeaCommand authors and self-checks..." / "A Recipe's authored Spec is
persisted through the SQL-backed writer..." Requirements, plus `spec-authored-at-review`'s "Review is the
single authorship point..." Requirement). The `store-write-boundary-guard` specification also cites
`compose.ts`'s allow-listed entry as a live example of an "audited, allow-listed file-backed-write
orchestration shell" — once the entry is gone, that citation is no longer accurate.

## What changes

- **Delete** `src/production-spec/compose.ts` and `src/production-spec/compose.test.ts` — dead code, zero
  production callers, confirmed fresh.
- **Remove** `src/store-write-boundary/allow-list.ts`'s `compose.ts` entry and its dedicated doc-comment
  block; trim the file's own top comment's "file-backed write's own orchestration shell" category
  reference so it no longer points at a deleted file. The guard's own exactness test
  (`store-write-guard.test.ts`) continues to pass with no replacement entry — `saveSpec` is already
  reached only through `src/command-surface/production-spec.ts`, which the guard exempts by path.
- **Fix** a stale doc-comment line in `src/production-spec/store.ts` that still names `compose.ts` as
  where the persistence gate lives (it no longer exists there — the gate is now
  `authorSpecForRecipe` + `auditAuthorPhase`, at accept time).
- **Reconcile the `production-spec` OpenSpec capability**: remove the stale "Compose and persist a
  Production Spec beside the Brief, segmented by Recipe" Requirement (its `composeSpec`-specific claims
  and scenarios no longer describe any real code path) and add a new, actor-neutral Requirement,
  "The file-backed Production Spec is located and persisted beside its Brief, segmented by Recipe",
  documenting `specPathFor`/`saveSpec`'s own still-true, still-tested contract (Recipe segmentation,
  cadence-aware nesting) and `generate()`'s still-true `Brief.companies` passthrough — without attributing
  either to "the Producer" or to `composeSpec`. Also lightly modify the "Producer agent definition"
  Requirement's prose so it no longer claims the Producer generates the Spec.
- **Reconcile the `store-write-boundary-guard` OpenSpec capability**: rewrite the one scenario that cited
  `compose.ts` as a live, allow-listed example to use a hypothetical module instead (mirroring how the
  capability's own other "not flagged"/"is flagged" scenarios already use hypothetical fixtures), since
  after this change no allow-list entry uses that category.

Nothing about how a Spec is actually authored, validated, or persisted in production changes. This is
dead-code removal and stale-documentation reconciliation only.

## Impact

- Affected capabilities: `production-spec` (REMOVED + ADDED + MODIFIED Requirements),
  `store-write-boundary-guard` (MODIFIED Requirement).
- Affected code: `src/production-spec/compose.ts` (deleted), `src/production-spec/compose.test.ts`
  (deleted), `src/store-write-boundary/allow-list.ts` (entry + doc-comment removed),
  `src/production-spec/store.ts` (one stale doc-comment line fixed).
- No change to `src/production-spec/generate.ts`, `validate.ts`, `brand-safety.ts`, `store.ts`'s
  `specPathFor`/`saveSpec` functions, `author-at-review.ts`, `accept-idea.ts`, or
  `command-surface/production-spec.ts` — every one of these keeps its exact current behavior and its
  existing, unmodified tests.
- Out of scope (per the Agent Brief): any change to how a Spec is authored/validated/persisted in
  production; `src/copy/compose.ts` (the unrelated Copy composer, a different domain sharing the same
  generic module name — untouched); re-litigating ADR-0031's own decision.
