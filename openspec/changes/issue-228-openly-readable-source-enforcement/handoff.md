# Slice Handoff — issue #228: openly-readable-source enforcement

## Build Report

### What changed

`IdeaStore.createIdea` (`src/idea/store.ts`) now enforces, at the store boundary, the openly-readable-
source rule that has lived only as prose in `.claude/agents/idea-strategist.md` since 2026-08-11: an
Idea whose `trendId` points at a Trend committed with `isPaywalled: true`, AND whose own `sourceUrls` is
empty (omitted or `[]`), is rejected with the store's EXISTING `IdeaValidationError` — never a new error
type — before any write (`INSERT`) runs. Getting the constraint the RIGHT way round was the whole point
of the ticket: this does **not** block an Idea merely because its linked Trend is paywalled — an Idea
citing a paywalled Trend as a momentum signal while carrying at least one openly readable `sourceUrls`
entry of its own is accepted, exactly the real, precedented workflow (idea-03 of the first daily Run was
rejected once for the genuine all-paywalled case, which is why the rule exists at all).

This refines, rather than reverses, the deliberate non-decision issue #223 recorded in its own "Known
gaps, decided, not dropped" section (`createIdea` does not block on a paywalled `trendId` alone — that
non-decision still holds). What #223 left open was its own AC4's ask — "enforced by data rather than by
prose" — which `TrendStore.listBriefableTrends` (a queryable view nothing was obliged to call) never
actually delivered. This slice is that gate.

Two QA-logged, already-functionally-correct test-coverage gaps from #223 are also closed in this slice:
the missing `platform`-CHECK rejection test in `src/trend/store.test.ts` (#223's own `tasks.md` claimed
it was written, it was not), and the missing cross-case accept/reject "already decided" guard tests in
`src/idea/store.test.ts` (accepting an already-**rejected** Idea; rejecting an already-**accepted** one
— the existing tests only proved the same-state repeat).

`.claude/agents/idea-strategist.md`'s existing rule text (step 6, lines ~69-74, cited verbatim and left
unedited) gains one new sentence citing the concrete enforcement this issue adds, and a new docs-test
(`src/idea/openly-readable-source-rule.docs-test.ts`) pins the doc's wording to the store's real
behavior — anchored on stable, code-level identifiers (`createIdea`/`IdeaValidationError`/
`src/idea/store.ts`, the "idea-03"/"2026-08-11" historical citation) rather than a whole free-prose
sentence, and separately proves the real store behaves as the doc claims by calling `createIdea` against
a real, throwaway SQLite database.

### Files touched

- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/src/idea/store.ts`
  — new `assertOpenlyReadableSource` helper, wired into `createIdea`; doc comments updated.
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/src/idea/store.test.ts`
  — new describe block (5 tests) for the openly-readable-source rule; 2 new cross-case tests for
  `acceptIdea`/`rejectIdea`'s already-decided guard.
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/src/idea/openly-readable-source-rule.docs-test.ts`
  — new file: pins `.claude/agents/idea-strategist.md`'s rule text to `IdeaStore`'s real behavior.
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/src/trend/store.test.ts`
  — new platform-CHECK rejection test (the #223 `tasks.md` coverage gap).
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/.claude/agents/idea-strategist.md`
  — one new sentence appended to the existing rule (lines 69-74 left verbatim).
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/openspec/changes/issue-228-openly-readable-source-enforcement/`
  — this OpenSpec change: `proposal.md`, `tasks.md`, `specs/idea-store/spec.md` (ADDED Requirement),
  `specs/trend-store/spec.md` (ADDED Requirement), `specs/idea-strategist-briefs/spec.md` (ADDED
  Requirement).

No file outside `src/idea/`, `src/trend/`, `.claude/agents/idea-strategist.md`, and this change's own
`openspec/` directory was touched — `src/production-queue/**` (#203) and `docs/adr/0029` (#226) are
untouched, verified with `git status`/`git diff --stat` against both paths (empty output). No schema
change: `src/db/schema.ts`'s `MIGRATION_1`/`MIGRATION_2` are untouched, verified by `git diff --stat --
src/db`.

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement
npm test                                          # 3000 / 764 suites / 0 fail (baseline was 2987/762/0)
npx tsc -p tsconfig.json --noEmit                 # clean (also run inside npm test)
openspec validate issue-228-openly-readable-source-enforcement --strict   # valid
openspec validate --all --strict                  # 54 passed, 0 failed (baseline was 52/53)

# Just this slice's new/changed tests:
node --import tsx --test src/idea/store.test.ts src/trend/store.test.ts \
  src/idea/openly-readable-source-rule.docs-test.ts
```

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #228) | Proven by |
|---|---|---|
| 1 | `createIdea` rejects an Idea whose `trendId` points at a paywalled Trend when its own `sourceUrls` is empty, raising the EXISTING validation error type | `src/idea/store.test.ts` → `"rejects a paywalled trendId when the Idea's own sourceUrls is empty (omitted), BEFORE any write"` and `"rejects a paywalled trendId when the Idea's own sourceUrls is explicitly []"` (both assert `IdeaValidationError`, the pre-existing class — no new error type declared anywhere in the diff); re-proven in `src/idea/openly-readable-source-rule.docs-test.ts` → `"PROVES the real store enforces exactly what the doc claims..."` |
| 2 | An Idea with a paywalled `trendId` **and** its own `sourceUrls` is accepted — the case a naive implementation breaks | `src/idea/store.test.ts` → `"accepts a paywalled trendId when the Idea carries its own sourceUrls — the case a naive implementation breaks"` (written FIRST, per instructions); re-proven in the docs-test's `"PROVES the doc's stated exception holds too..."` |
| 3 | Validation runs before any SQL, matching `hook_type`/`theme` | `assertOpenlyReadableSource(db, input.trendId, input.sourceUrls)` is called in `createIdea` immediately after `assertValidHookType`/`assertValidTheme`, before `randomUUID()`/the `INSERT` (`src/idea/store.ts`); both rejection tests additionally assert `listIdeasForRun(db, fixture.runId)` stays `[]` after the throw, the same "no write happened" proof the existing `hookType`/`theme` tests use |
| 4 | The rule's wording in `idea-strategist.md` and the store's behaviour agree, pinned by a docs-test | `src/idea/openly-readable-source-rule.docs-test.ts` — 5 tests: 2 pin the doc's prose (rule statement + enforcement citation + right-way-round wording), 2 exercise the real store, all in one file |
| 5 | `trend/store.test.ts` gets the missing platform-CHECK test | `src/trend/store.test.ts` → `"rejects a platform outside KNOWN_PLATFORMS (issue #228 — the coverage gap #223's tasks.md claimed was closed)"` |
| 6 | `idea/store.test.ts` gets the cross-case already-decided guard tests | `src/idea/store.test.ts` → `"acceptIdea throws, changing nothing, for an already-REJECTED Idea"` and `"rejectIdea throws, changing nothing, for an already-ACCEPTED Idea"` |

Two extra regression guards beyond the literal AC list (not required, but close the obvious "did I get
the polarity backwards" failure mode this ticket warns about): `"never blocks on a non-paywalled
trendId, even with no sourceUrls"` and `"never blocks when trendId is omitted entirely"`.

### Fakes / fixtures used

- **No Magnific fake needed and none used.** This slice is pure store/SQL logic (`src/idea/`,
  `src/trend/`) — it never imports, calls, or stubs anything under `src/space-driver/`/`src/producer/`,
  and the `magnific`/`zoho-social` MCP tools are never referenced. Confirmed by `git diff --stat`
  showing only `src/idea/`, `src/trend/`, the one agent doc, and this `openspec/` change touched.
- **Real, throwaway SQLite files** via `src/db/test-support.ts`'s `withTempDb` — every new/changed test
  (including the docs-test) opens a fresh `mkdtemp` file, never `:memory:`, matching #223/#222's own
  Testing Decisions.
- **The `seedRun`/`seedIdea` raw-SQL fixture-seeding convention** already established by
  `src/idea/store.test.ts`/`src/trend/store.test.ts` (no `RunStore` exists) — reused unchanged; the
  docs-test's own `seedRun` is a direct copy of the same helper (no shared test-only export exists to
  import instead, matching the existing per-file duplication convention in this store's own test suite).

### Self-review notes

- Considered adding the paywalled-source check as a second, separate exported validator callers could
  invoke independently (mirroring `assertValidHookType`/`assertValidTheme`'s external testability) —
  decided against: nothing outside `createIdea` needs it standalone today, and the existing `hookType`/
  `theme` asserts are also private, unexported functions; matching that convention keeps the module's
  public surface unchanged (no new export beyond `IdeaValidationError`, already exported).
- Considered pinning the docs-test against the doc's exact sentence text — rejected per the issue's own
  named trap ("pin against the registry or a stable anchor, not free prose, or the guard rots the first
  time someone rewords it"); instead the docs-test anchors on code-level identifiers (function/error/
  module names) and the rule's own historical citation, and separately proves behavior by calling the
  real store — no test asserts a paraphrase-prone sentence verbatim.
- Re-read `assertOpenlyReadableSource`'s doc comment twice to make sure it does not overclaim "before any
  SQL" — the function DOES issue one `SELECT` (via `getTrend`) before the validation completes; the
  precise, honest invariant (matching the existing `hookType`/`theme` tests' own proof shape) is "no
  WRITE runs before validation passes," stated explicitly in both the module-level and function-level
  doc comments so a future reader isn't misled by the pre-existing "before any SQL runs" phrasing this
  slice also softened to "before the row is written" in the one place it appeared.
- No dead code introduced; no existing test, type, or export removed or renamed.

### Known limits

- **No production caller wired.** `src/ledger/ledger.ts` stays canonical; `IdeaStore` is additive and
  unused by any real command until issue #204's one-shot importer — unchanged by this slice, matching
  #223's own stated scope.
- **`assertOpenlyReadableSource` costs one extra `SELECT` per `createIdea` call when `trendId` is set** —
  negligible for this store's scale (no production caller yet), not benchmarked, not asked for by the
  AC.
- **The rule still lives partly as prose** in `.claude/agents/idea-strategist.md`'s drafting instructions
  (idea-strategist itself does not call `createIdea` yet — no wired caller exists). This slice makes the
  rule enforceable and pins the doc to the code that WILL enforce it once #204 wires a caller; it does
  not itself change idea-strategist's drafting behavior.
