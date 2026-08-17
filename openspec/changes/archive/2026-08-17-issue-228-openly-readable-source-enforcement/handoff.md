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

---

## QA Verdict — Round 1: PASS

### Suite result

Ran from `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement` at
commit `9166491` (branch `issue-228-openly-readable-source-enforcement`, one commit on top of `main` at
`db11f7d`):

| Command | Result |
|---|---|
| `npm test` (`tsc --noEmit` + `node --import tsx --test "src/**/*.test.ts" "src/**/*.docs-test.ts"`) | **3000 / 764 suites / 0 fail** — matches the Build Report's claim exactly. Baseline (`main` @ `db11f7d`) is 2987/762/0 fail — this branch nets +13 tests / +2 suites, consistent with 1 new file (`openly-readable-source-rule.docs-test.ts`, 5 tests) + 1 new describe block (`store.test.ts`, 7 new tests: 5 rule tests + 2 cross-case tests) + 1 new test (`trend/store.test.ts`, 1 test) = 13 new tests, 2 new suites (the two new `describe` blocks). |
| `npm run test:docs` | **289 / 77 suites / 0 fail** (subset of the above, standalone) |
| `openspec validate issue-228-openly-readable-source-enforcement --strict` | `Change 'issue-228-openly-readable-source-enforcement' is valid` |
| `openspec validate --all --strict` | **Totals: 54 passed, 0 failed (54 items)** — matches the Build Report's claim exactly (baseline 52/53 per the task brief; this branch adds 1 new change entry, `change/issue-228-openly-readable-source-enforcement`, to the total) |
| Targeted run: `node --import tsx --test src/idea/store.test.ts src/trend/store.test.ts src/idea/openly-readable-source-rule.docs-test.ts` | **43 tests / 11 suites / 0 fail** |

All green, actually run, not assumed.

### Per-criterion results (issue #228 acceptance criteria, verbatim)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | `createIdea` rejects an Idea whose `trendId` points at a paywalled Trend when its own `sourceUrls` is empty, raising the store's existing validation error type rather than a new one | **PASS** | `src/idea/store.test.ts` → `"rejects a paywalled trendId when the Idea's own sourceUrls is empty (omitted), BEFORE any write"` and `"...explicitly []"` — both assert `err instanceof IdeaValidationError` via `assert.throws(..., IdeaValidationError)`. Confirmed no new error class anywhere in `git diff db11f7d..HEAD -- src/idea/store.ts` — only the pre-existing `IdeaValidationError` is thrown. |
| 2 | An Idea with a paywalled `trendId` **and** at least one of its own `sourceUrls` is accepted — proven by a test | **PASS** — genuinely proven, not merely "didn't throw" | `src/idea/store.test.ts` → `"accepts a paywalled trendId when the Idea carries its own sourceUrls — the case a naive implementation breaks"`. This test calls `createIdea` with a real `id = createIdea(...)`, then re-fetches via `getIdea` and asserts `idea.trendId === trendId` and `idea.sourceUrls` deep-equals the input array — i.e. it proves the write actually happened and the values round-tripped, not just that no exception was thrown. Re-proven in `openly-readable-source-rule.docs-test.ts`'s `"PROVES the doc's stated exception holds too..."` (asserts `id` is truthy after a successful `createIdea` call with a paywalled `trendId` + populated `sourceUrls`). |
| 3 | Validation runs before any SQL, matching how `hook_type`/`theme` validation already behaves in `IdeaStore` | **PASS, with an honest caveat the developer already flagged** | `createIdea` calls `assertValidHookType` → `assertValidTheme` → `assertOpenlyReadableSource` → `randomUUID()`/`INSERT`, in that order (`src/idea/store.ts:214-216`). The new check necessarily issues one `SELECT` (via `getTrend`) to read the Trend's `is_paywalled` flag — this is unavoidable since paywall status is committed data, not a static in-memory vocabulary like `hookType`/`theme`. The invariant that DOES hold, matching `hookType`/`theme` exactly, is "no WRITE (`INSERT`) ever runs before every validation has passed" — proven by both rejection tests asserting `listIdeasForRun(db, fixture.runId)` stays `[]` after the throw. The developer's own self-review notes call this out explicitly and softened the one place the doc comment overclaimed "before any SQL runs" to "before the row is written" — this is a transparent, correct reconciliation, not a hidden gap. |
| 4 | The rule's wording in `.claude/agents/idea-strategist.md` and the store's behaviour agree, with a docs-test pinning them together so they cannot drift apart | **PASS** | `src/idea/openly-readable-source-rule.docs-test.ts`, 5 tests (see docs-test judgement below for anchoring quality). |
| 5 | `src/trend/store.test.ts` gets the missing platform-CHECK test #223's `tasks.md` claimed was written | **PASS** | `src/trend/store.test.ts` → new test `"rejects a platform outside KNOWN_PLATFORMS (issue #228 — the coverage gap #223's tasks.md claimed was closed)"`, asserts `createTrend(db, { ..., platform: "myspace" })` throws `/CHECK/`. Confirmed the schema really does carry this CHECK constraint (`src/db/schema.ts:232`, `platform TEXT CHECK (platform IS NULL OR platform IN ${PLATFORM_CHECK})`) — the test exercises a real constraint, not a vacuous assertion. |
| 6 | `src/idea/store.test.ts` gets the cross-case of the accept/reject "already decided" guard — accepting an already-rejected Idea, rejecting an already-accepted one | **PASS** | `"acceptIdea throws, changing nothing, for an already-REJECTED Idea"` and `"rejectIdea throws, changing nothing, for an already-ACCEPTED Idea"` — both seed the opposite terminal state first, assert the throw, and re-assert the Idea's status/fields are unchanged afterward (genuine "changing nothing" proof, not just an exception check). |

All 6 acceptance criteria: **PASS**.

### Per-scenario results (spec deltas → issue #228)

**`specs/idea-store/spec.md`** (Requirement: "createIdea enforces the openly-readable-source rule at the store boundary, not merely by agent memory"):

| Scenario | Result | Covering test |
|---|---|---|
| accepts a paywalled `trendId` when the Idea carries its own `sourceUrls` | PASS | `store.test.ts` → `"accepts a paywalled trendId when the Idea carries its own sourceUrls..."` |
| rejects a paywalled `trendId` when the Idea's own `sourceUrls` is empty | PASS | `store.test.ts` → `"rejects...omitted"` + `"rejects...explicitly []"` |
| never blocks on a non-paywalled `trendId`, even with no `sourceUrls` | PASS | `store.test.ts` → `"never blocks on a non-paywalled trendId, even with no sourceUrls..."` |
| never blocks when `trendId` is omitted entirely | PASS | `store.test.ts` → `"never blocks when trendId is omitted entirely..."` |

**`specs/trend-store/spec.md`** (Requirement: "createTrend enforces the schema's own platform CHECK constraint..."):

| Scenario | Result | Covering test |
|---|---|---|
| `createTrend` rejects a platform outside `KNOWN_PLATFORMS` | PASS | `trend/store.test.ts` → new platform-CHECK test |

**`specs/idea-strategist-briefs/spec.md`** (Requirement: "The openly-readable-source rule's prose and IdeaStore's real enforcement are pinned together by a docs-test"):

| Scenario | Result | Covering test |
|---|---|---|
| the doc still states the rule, anchored on its historical precedent, not free prose alone | PASS | docs-test → `"the doc still states the rule, anchored on its real historical precedent..."` |
| the doc cites the store-boundary enforcement issue #228 adds | PASS | docs-test → `"the doc cites the store-boundary enforcement..."` |
| the docs-test proves the doc and the store agree, using the real store against a real database | PASS | docs-test → the two `"PROVES..."` tests, both calling real `createIdea` against `withTempDb` |

All spec-delta scenarios: **PASS**, and each genuinely traces back to the issue text (verified against `gh issue view 228` verbatim and `.claude/agents/idea-strategist.md:69-79`) — no scope drift, no dropped criterion, no invented requirement beyond what #228 and the two logged coverage gaps ask for.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (untouched by construction) | `git diff --stat db11f7d..HEAD` touches only `src/idea/`, `src/trend/`, `.claude/agents/idea-strategist.md`, and this change's `openspec/` dir — no producer/publish/space-driver code in the diff. |
| Public-metrics-only | PASS (untouched by construction) | No metrics/Apify code in the diff; `is_paywalled`/`sourceUrls` are Trend/Idea attributes already shipped by #223, not new metrics plumbing. |
| Relative-not-absolute | PASS (untouched by construction) | No scoring/comparison code in the diff; `fitScore`/`relevance`/`momentum`/`brandFit` are passed through unchanged, never computed here. |
| Explicit-attribution | PASS (untouched by construction) | No Post/attribution code in the diff; `grep -rn "post_url\|logPost"` against the touched files returns nothing. |
| Ledger-as-source-of-truth | PASS | `grep -rn "ledger\." src/idea/store.ts src/idea/store.test.ts src/trend/store.ts src/trend/store.test.ts src/idea/openly-readable-source-rule.docs-test.ts` returns only one doc-comment mention (`src/ledger/ledger.ts`'s existing reads/writes are untouched) — no code path in this slice writes to or reads from `ledger.json`/`queue.json`; `IdeaStore` stays additive/unused by any real command, matching rule 7 in `.claude/rules/always/organicgrowth-rules.md` verbatim ("no existing production caller has been switched over to it yet — that follows once the one-shot importer runs, issue #204"). |
| Magnific fake (hard requirement) | PASS | `grep -rn "spaces_\|creations_\|magnific\|zoho-social\|mcp__" src/idea/ src/trend/` → **no matches**. Every test (46 call sites across the 3 touched/new test files) uses `withTempDb` (`src/db/test-support.ts`, a real `mkdtemp`-backed throwaway SQLite file — confirmed by reading its implementation), **zero** `:memory:` usages (`grep ":memory:"` in the 3 test files only matches doc-comment mentions of what is NOT used). No live Space or Zoho MCP call anywhere in this slice. |

### Edge-case findings (beyond the literal AC list, per instructions)

I exercised the following cases directly against the real store (throwaway SQLite, via a standalone script calling the real `createIdea`/`getTrend` — not committed, scratch-only) to check behavior neither the ticket nor the Operator specified:

1. **No `trendId` at all.** Tested in-suite (`"never blocks when trendId is omitted entirely"`). Behavior: never blocked, regardless of `sourceUrls`. **Sensible and intentional** — the rule is specifically about a paywalled Trend link; an Idea with no Trend link has nothing to gate on.
2. **An unpaywalled Trend with empty `sourceUrls`.** Tested in-suite (`"never blocks on a non-paywalled trendId, even with no sourceUrls"`). Behavior: never blocked. **Sensible and intentional** — matches the issue's explicit "Do NOT block... merely because trendId is paywalled" framing, inverted correctly (a non-paywalled Trend was never the trigger to begin with).
3. **A `trendId` that names no committed Trend row** (dangling/unknown id). Not covered by a named test in this slice (the general "unknown runId/brandId/formatId" FK test only exercises `runId`). Verified manually: `getTrend` returns `null`, `assertOpenlyReadableSource` returns early (no throw), and the `INSERT` then fails with a raw `FOREIGN KEY constraint failed` error — exactly as the function's own doc comment states ("an unknown `trendId` is left for the schema's own FOREIGN KEY to reject on INSERT, mirroring `createIdea`'s existing not-pre-validated convention"). **Sensible and intentional**, consistent with #223's pre-existing convention — a minor, low-severity test-coverage gap (untested for `trendId` specifically) but not a behavioral defect, and not something #228 asked for.
4. **`sourceUrls` present but containing only an empty string (`[""]`) or a whitespace-only entry (`["   "]`).** **Not tested anywhere in this slice.** Verified manually against the real store: both are **ACCEPTED** and stored verbatim — `assertOpenlyReadableSource` only checks `sourceUrls.length === 0`, never inspects entry content. This means an Idea with a paywalled `trendId` and `sourceUrls: [""]` sails through the gate exactly as if it carried a real, openly readable URL. **This is accidental, not intentional**, relative to the rule's own stated purpose (both the issue text — "at least one openly readable source" — and the function's own doc comment — "at least one openly readable `sourceUrls` entry" — imply the entry must actually be a usable URL, not merely present). That said: (a) no other store in this codebase validates URL format/content either — this is a codebase-wide convention, not a regression specific to this slice; (b) the literal AC text only says "sourceUrls is empty (omitted or `[]`)", which this correctly implements at the array level. **Not a defect against #228's stated scope**, but a real, non-trivial gap **#204's importer should know about before writing 61 real Ideas through this validator**: if any upstream record has a blank/placeholder `sourceUrls` entry (e.g. a partially-scraped field), it will silently satisfy the gate.

### Docs-test anchoring judgement

`src/idea/openly-readable-source-rule.docs-test.ts` uses two kinds of anchors:

- **Prose-anchor tests (1–3)**: pin specific, short, factual phrases — `"Never suggest an Idea whose every source is paywalled"`, the `"2026-08-11"` and `"idea-03 of the first daily Run was rejected exactly for this"` precedent citation, and (separately) the code-level identifiers `createIdea`/`IdeaValidationError`/`src/idea/store.ts`/`issue #228`, plus the right-way-round phrases `"never merely because the linked Trend is paywalled"` and `"carrying its own openly readable sourceUrls is accepted"`.
- **Behavior-proof tests (4–5)**: call the real `createIdea` against a real throwaway SQLite database to independently prove the rejection case and the acceptance case.

Judgement: this is a genuinely better design than pinning a whole descriptive sentence verbatim, and it does catch a reversal, via two independent paths:

- **A code-only regression** (e.g. `assertOpenlyReadableSource` weakened to a no-op, or reversed to reject unconditionally on a paywalled `trendId`) is caught by tests 4/5, which call the real function — these do not depend on doc wording at all.
- **A doc-only regression** (e.g. someone deletes the "never merely because..." sentence, or reverses it to something like "an Idea with sourceUrls is still rejected", or drops the `createIdea`/`IdeaValidationError` citation) is caught by tests 2/3, because the exact opposite/absent phrasing would not match the regexes.
- A **cosmetic-only reword** that preserves meaning (e.g. rephrasing "Never suggest an Idea whose every source is paywalled" to a synonym) would cause a **false failure** (test 1 breaks even though nothing is actually wrong) — this is a maintenance cost, not a defense hole, and is the acknowledged, accepted tradeoff of anchoring on short factual phrases instead of a registry (there is no registry for a paywall rule, as the file's own comment states).

I verified this is not merely self-consistent: I confirmed independently (via `git diff`) that the actual doc text contains the phrases the tests pin against, and that the actual code contains the functions/error class the tests pin against — the anchors are not circular or invented to match each other after the fact; they describe real, load-bearing names and a real historical fact (idea-03/2026-08-11) that would need deliberate, hard-to-miss effort to falsify while "just" rewording the rule. **Verdict: the docs-test anchoring holds** — it would catch a rule reversal or weakening on either side (code or doc), not merely agree with itself.

### `.claude/agents/idea-strategist.md` diff check

`git diff db11f7d..HEAD -- .claude/agents/idea-strategist.md` confirms: the pre-existing rule text (lines
69-74 per the issue's own citation) is preserved **verbatim, unedited** — the new sentence is inserted
mid-paragraph between the existing "...trend takes its slot." and "Peer-scrape mode's evidence..."
sentences, with no deletion or rewording of any existing word. Confirmed by direct diff inspection, not
assumed.

### Scope check

`git diff db11f7d..HEAD --stat`: 11 files changed — `.claude/agents/idea-strategist.md`,
`openspec/changes/issue-228-openly-readable-source-enforcement/{handoff,proposal,tasks}.md` +
3 spec deltas, `src/idea/openly-readable-source-rule.docs-test.ts` (new), `src/idea/store.test.ts`,
`src/idea/store.ts`, `src/trend/store.test.ts`. Confirmed empty diff against `src/production-queue`,
`docs/adr/0029`, and `src/db` (`git diff --stat db11f7d..HEAD -- src/production-queue docs/adr/0029
src/db` → no output). No collision with sibling slices #203/#226.

### OpenSpec archive-safety check (not executed, per instructions)

All three spec deltas (`specs/idea-store`, `specs/trend-store`, `specs/idea-strategist-briefs`) use only
`## ADDED Requirements` headers — **no `## MODIFIED Requirements` section appears anywhere in this
change**. Cross-checked each new Requirement's title against the live specs at
`openspec/specs/{idea-store,trend-store,idea-strategist-briefs}/spec.md`: none of the three new titles
("createIdea enforces the openly-readable-source rule...", "createTrend enforces the schema's own
platform CHECK constraint...", "The openly-readable-source rule's prose and IdeaStore's real enforcement
are pinned together by a docs-test") collide with any existing Requirement title in those files. Since
this change is a pure addition (no edits to existing Requirement text), the previously-documented
MODIFIED-header archiving trap does not apply here — archiving should apply cleanly. I did **not** run
`openspec archive` myself, per standing instructions.

### Defect list

No blocking defects. One non-blocking, low-severity finding, informational for #204:

- **Severity: low (non-blocking, informational for #204's importer).** `assertOpenlyReadableSource`
  (`src/idea/store.ts`) only checks `sourceUrls.length === 0`/`undefined`, never entry content — an Idea
  with a paywalled `trendId` and `sourceUrls: [""]` or `sourceUrls: ["   "]` is accepted, exactly as if it
  carried a real URL. Untested in this slice (no test exercises a blank/whitespace-only entry).
  **Repro:** against a real DB (`withTempDb` + `runMigrations`), seed a Trend with `isPaywalled: true`,
  then call `createIdea(db, { ..., trendId, sourceUrls: [""] })` — it returns an id successfully instead
  of throwing `IdeaValidationError`. Not a violation of #228's literal acceptance criteria (which define
  "empty" at the array level: "omitted or `[]`"), and consistent with the rest of the codebase's
  convention of not validating URL format/content anywhere. Flagged per the review brief's explicit ask,
  not as a reason to fail this round.

### Overall verdict: PASS

All 6 acceptance criteria proven by real, passing tests. All spec-delta scenarios trace back to the
issue and to CONTEXT.md's own "Trend" entry (`is_paywalled`, lines 58-62) without drift. Full suite green
(3000/764/0 fail), `openspec validate --strict` green at both the change and all-specs level (54/0
failed), all always-rules upheld (most by construction — this slice touches no generation/publish/
metrics/scoring/attribution code), and the Magnific-fake/hermetic requirement holds with no live-Space or
live-Zoho calls anywhere in the diff. The docs-test anchoring is judged genuinely resistant to a rule
reversal on either the code or the doc side. This slice may proceed to a PR.

---

## Round-2 Build

QA's Round 1 verdict was PASS, but the coordinator asked for one fix before merge: QA's own logged
finding (its Round-1 "Defect list," low severity, non-blocking) that `assertOpenlyReadableSource` only
checked `sourceUrls.length`, never entry content, so `sourceUrls: [""]`/`["   "]` was accepted as if it
carried a real source. This round closes that hole ahead of issue #204's importer, which is about to
push all 61 real Briefs through this validator.

### What changed

`src/idea/store.ts` gains a new helper, `hasAtLeastOneReadableSource(sourceUrls)`, which returns `true`
only when at least one entry, after `.trim()`, has non-zero length. `assertOpenlyReadableSource` now
calls this helper instead of checking `sourceUrls.length === 0` directly — so a blank (`""`) or
whitespace-only (`"   "`) entry is treated exactly as ABSENT, and an Idea whose `sourceUrls` holds
nothing but blanks is rejected exactly like one with `sourceUrls: []`. An array that mixes one blank
entry with one real, non-blank entry is still ACCEPTED — only one usable entry is required, and blank
siblings elsewhere in the array do not cancel it out. No other behavior changed: the error class is
still the existing `IdeaValidationError` (never a new type), the check still runs before the `INSERT`,
and the "never block merely because `trendId` is paywalled" polarity is untouched.

**Judgement call: trimming/rejecting blanks — done. Requiring the entry be URL-shaped — deliberately
NOT done, and here is why**, per the explicit instruction to look at the real data rather than guess:

- There is no real precedent for what `sourceUrls` will actually contain yet: neither Brand's
  `ledger.json` carries a `source_urls`/`sourceUrls` field on any Idea record today (checked directly —
  `python3 -c "import json; d=json.load(open('data/brands/straw-motion/ledger.json')); print(list(d['ideas'][0].keys()))"`
  lists `id`/`run`/`title`/`trend_id`/`trend_label`/`format`/`fit_score`/`fit_basis`/`status`/
  `brief_path`/`created_at`/`assets`/`recipes`/`declined_recipes` — no source field at all). The only
  real evidence available is the raw Brief markdown itself, which #204's importer has not parsed yet.
- I surveyed every Brief's `## Source(s)` section under `data/brands/*/ideas/**` (51 Briefs carry one;
  268 raw lines). The large majority are clean `- Description: https://...` bullets. But a real,
  non-trivial minority are NOT URLs at all — legitimate editorial/verification notes recorded as their
  own bullets, e.g.:
  - `- (No distinct official X corporate blog post was found for this specific feature.)`
  - `- (Thin sourcing: no distinct tweet or benchmark paper was found embedded in the source article for this specific comparison — worth a manual check before publishing.)`
  - `- Verification note (2026-08-11): sanders.senate.gov returns 403 to automated fetchers, so neither senate.gov URL could be machine-loaded; the letter PDF link was extracted from the Guardian article's own HTML...`
  These are commentary ABOUT sourcing (or an honest "we could not verify this" note), not themselves a
  citation — legitimate content in a human-authored Brief, but not something `sourceUrls` should ever
  hold verbatim as if it were a link.
- This is exactly the signal the coordinator's brief predicted: a strict URL-shape check (`new URL(...)`
  parsing, an `https?://` prefix requirement, etc.) built now, before #204's importer exists and before
  its parsing/extraction logic is designed, risks rejecting legitimate data in a way nobody has designed
  for yet. The importer — not this store — is the thing that will decide how to turn that prose into
  clean `sourceUrls` entries (most plausibly by extracting only the substring after each bullet's own
  `): ` marker, discarding non-URL notes entirely, though that logic does not exist yet either).
- Consistent with the rest of the codebase: no other `{ db }` store validates URL format/content either
  (independently confirmed by QA's own Round-1 review) — inventing that dimension here would be new
  scope, not a defect fix, and #228 never asked for it.
- **Decision: implement blank/whitespace-only rejection only. Defer URL-shape validation to #204**,
  which will see the real, importer-produced `sourceUrls` values first-hand and is far better placed to
  decide whether format validation is warranted once that shape actually exists.

### On the dangling-trendId FK-error finding

QA also flagged, informationally, that an unknown/dangling `trendId` (one naming no committed Trend row)
falls through `assertOpenlyReadableSource`'s early-return and hits the schema's own raw `FOREIGN KEY`
error on `INSERT`, never `IdeaValidationError`. **Confirmed deliberate, not accidental**: this exactly
mirrors `createIdea`'s pre-existing, already-documented convention for `runId`/`brandId`/`formatId` (see
`src/idea/store.ts`'s own module doc comment and the pre-existing test `"rejects an unknown
runId/brandId/formatId via the schema's own foreign keys"`, both predating this issue). Extending
`assertOpenlyReadableSource` to pre-check `trendId` existence and raise `IdeaValidationError` instead
would be a NEW, asymmetric convention for exactly one of four foreign-key columns `createIdea` accepts —
not a fix, a fresh inconsistency the ticket never asked for. This round adds a small regression test
(`"never pre-validates trendId itself — an unknown/dangling trendId falls through to the schema's own
FOREIGN KEY, never IdeaValidationError (deliberate, mirrors runId/brandId/formatId)"`,
`src/idea/store.test.ts`) that pins this as intentional, so a future reader has a real, passing test to
point at rather than re-deriving it from a doc comment. **Implication for #204, recorded here as asked**:
its importer will see TWO different error shapes out of `createIdea` — `IdeaValidationError` for the
openly-readable-source/`hookType`/`theme` rules, and a raw SQLite `FOREIGN KEY constraint failed` error
for a dangling `trendId` (or `runId`/`brandId`/`formatId`) — and should be written to catch/handle both,
or to pre-check `trendId` existence itself (e.g. via `TrendStore.getTrend`) before calling `createIdea`
if it wants to report a single, uniform "Brief references a Trend that failed to import" error to the
Operator. Not a defect in this store; a caller-side design note for #204 to carry forward.

### Files touched (Round 2, in addition to Round 1's list)

- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/src/idea/store.ts`
  — new `hasAtLeastOneReadableSource` helper; `assertOpenlyReadableSource` now calls it instead of
  checking `sourceUrls.length` directly; doc comments updated (module-level, both function-level).
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/src/idea/store.test.ts`
  — 5 new tests: dangling-`trendId`-falls-through-to-FK (regression pin for the confirmed-deliberate
  behavior above), blank-string-only, whitespace-only, all-blank-mixed, and one-blank-one-real (accepted).
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/openspec/changes/issue-228-openly-readable-source-enforcement/specs/idea-store/spec.md`
  — Requirement text and Scenario list updated to state the blank/whitespace-only handling and the
  deliberate no-URL-shape-check decision, plus two new Scenarios (all-blank rejected; one-blank-one-real
  accepted) and one Scenario for the dangling-`trendId` FK pass-through.
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement/openspec/changes/issue-228-openly-readable-source-enforcement/handoff.md`
  — this Round-2 Build block, appended (Round 1 and the QA Verdict left untouched above).

No other file touched this round. `src/idea/openly-readable-source-rule.docs-test.ts`,
`.claude/agents/idea-strategist.md`, and `src/trend/store.test.ts` are unchanged from Round 1 — the
doc's existing prose ("carrying its own openly readable `sourceUrls` is accepted") remains accurate
under the trimmed definition, so no doc reword was needed.

### Acceptance-criteria self-assessment (Round 2 addendum)

| Ask | Proven by |
|---|---|
| Blank string (`[""]`) rejected | `src/idea/store.test.ts` → `"rejects a paywalled trendId when sourceUrls holds only a single blank string"` |
| Whitespace-only (`["   "]`) rejected | `src/idea/store.test.ts` → `"rejects a paywalled trendId when sourceUrls holds only a whitespace-only entry"` |
| Mix of one blank + one real entry ACCEPTED | `src/idea/store.test.ts` → `"accepts a paywalled trendId when sourceUrls mixes one blank entry with one real entry"` |
| All-blank (`["", "   ", ""]`) REJECTED | `src/idea/store.test.ts` → `"rejects a paywalled trendId when EVERY sourceUrls entry is blank or whitespace-only (mixed blanks)"` |
| Dangling-`trendId` FK behavior confirmed deliberate | `src/idea/store.test.ts` → `"never pre-validates trendId itself — an unknown/dangling trendId falls through to the schema's own FOREIGN KEY, never IdeaValidationError (deliberate, mirrors runId/brandId/formatId)"`, plus the reasoning above |

### How to run (Round 2)

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-228-openly-readable-source-enforcement
npm test                                          # 3005 / 764 suites / 0 fail (was 3000/764/0)
npm run test:docs                                 # 289 / 77 suites / 0 fail (unchanged — no docs-test file touched this round)
openspec validate issue-228-openly-readable-source-enforcement --strict   # valid
openspec validate --all --strict                  # 54 passed, 0 failed (unchanged)

# Just the new Round-2 tests:
node --import tsx --test src/idea/store.test.ts
```

### Self-review notes (Round 2)

- Considered exporting `hasAtLeastOneReadableSource` for standalone testing — decided against, for the
  same reason Round 1 kept `assertOpenlyReadableSource` private: nothing outside this module needs it,
  and the existing `hookType`/`theme` helpers are private too. It is proven indirectly, through
  `createIdea`'s own public behavior, exactly like every other validator in this file.
- Caught and fixed a self-inflicted syntax trap mid-round: an early draft of the new doc comment wrote
  out a file-glob path containing a literal `*/`-forming sequence inside a `/** ... */` block comment,
  which silently closed the comment early and corrupted the rest of the file into invalid syntax — found
  immediately by re-running the targeted test and reading the resulting `ReferenceError` (not by manual
  inspection). Reworded the comment to avoid the sequence, then re-verified with a full-file `grep -n
  '\*/' src/idea/store.ts` pass — every remaining match is a real, intended comment closer.
- Re-ran the full suite AND `npm run test:docs` AND `openspec validate --all --strict` after the fix,
  not just the targeted file, to confirm nothing else regressed from touching a shared module.

### Known limits (Round 2 addendum)

- **URL-shape/format validation is explicitly deferred to issue #204**, per the finding above — not
  built, not scheduled by this issue, and correctly out of scope until the importer's real parsing
  behavior exists to test against.
- **The two-error-shape caller experience** (`IdeaValidationError` vs. a raw FK error) is now a
  documented, tested, deliberate fact of `createIdea`'s contract — but #204 itself still has to design
  around it; this slice only confirms and pins the fact, it does not change or paper over it.

---

## QA Verdict — Round 2: PASS

Re-verified from scratch, in the same worktree, at commit `0612147` (one commit on top of Round 1's
`9166491`, itself on top of `main` at `db11f7d`). Round 1's Verdict and the original Build Report above
are untouched.

### Suite result

| Command | Result |
|---|---|
| `npm test` | **3005 / 764 suites / 0 fail** — matches the Round-2 Build claim exactly. Delta from Round 1 (3000/764/0) is **exactly +5 tests, +0 suites**, and the +5 is exactly the 5 new `it(...)` blocks added to `src/idea/store.test.ts`'s existing "the openly-readable-source rule is enforced at the store boundary" `describe` block this round (dangling-`trendId`-FK regression, blank-string, whitespace-only, all-blank-mixed, one-blank-one-real) — confirmed by `git diff 9166491..HEAD -- src/idea/store.test.ts`, which adds exactly 5 `it(` blocks and 0 new `describe(` blocks. |
| `npm run test:docs` | **289 / 77 suites / 0 fail** — unchanged from Round 1, as claimed. `git diff 9166491..HEAD -- src/idea/openly-readable-source-rule.docs-test.ts .claude/agents/idea-strategist.md src/trend/store.test.ts` is empty — confirmed no docs-test file was touched this round. |
| `openspec validate issue-228-openly-readable-source-enforcement --strict` | `Change 'issue-228-openly-readable-source-enforcement' is valid` |
| `openspec validate --all --strict` | **Totals: 54 passed, 0 failed (54 items)** — unchanged, as claimed (this round only edits an existing spec delta's Requirement/Scenario text, it does not add or remove a capability). |
| Targeted: `node --import tsx --test src/idea/store.test.ts` | **32 tests / 6 suites / 0 fail** |

All green, actually run this round, not carried over from Round 1's numbers.

### Round-1 finding: FIXED

The Round-1 low-severity finding — `assertOpenlyReadableSource` accepting `sourceUrls: [""]`/`["   "]`
as if it carried a real source — is genuinely closed, not just claimed closed:

- Read `src/idea/store.ts`'s diff directly: `hasAtLeastOneReadableSource` now gates on
  `sourceUrls.some((url) => url.trim().length > 0)`, replacing the old `sourceUrls.length === 0` check.
  This is the correct fix — it treats "blank after trimming" as absent, not merely "array is empty."
- Re-ran my own Round-1 scratch repro (a standalone script calling the real `createIdea` against a
  `withTempDb`-backed database, not committed) against this round's code: `sourceUrls: [""]` and
  `sourceUrls: ["   "]` against a paywalled `trendId` now both throw `IdeaValidationError`, where Round 1
  let them through. Confirmed by direct execution, not by reading the diff alone.
- **Both directions genuinely hold**, proven by real tests, not merely absence of a throw:
  - **Reject direction**: `"rejects...only a single blank string"`, `"rejects...only a whitespace-only
    entry"`, `"rejects...EVERY sourceUrls entry is blank or whitespace-only (mixed blanks)"` — all three
    assert `IdeaValidationError` via `assert.throws`, and all three additionally assert
    `listIdeasForRun(db, fixture.runId)` stays `[]` after the throw (the same "no write happened" proof
    used throughout this store's test suite).
  - **Accept direction (the mirror-trap case)**: `"accepts a paywalled trendId when sourceUrls mixes one
    blank entry with one real entry"` uses `sourceUrls: ["   ", "https://an-open-outlet.example/..."]` —
    exactly the case a naive "reject if ANY entry is blank" implementation would break. I re-read
    `hasAtLeastOneReadableSource`'s implementation line by line: `.some(...)` means ANY non-blank entry
    passes the whole check, so a blank sibling can never veto a real one — the logic is structurally
    incapable of the naive-reject bug. The test itself proves this is not merely "didn't throw": it
    re-fetches the Idea via `getIdea` and asserts `idea.sourceUrls` deep-equals the full original array
    **including the blank entry** — proving the blank entry was stored as-is, not silently stripped, and
    the Idea was genuinely created.
- I also independently re-ran the two Round-1 edge-case scripts (unpaywalled Trend + empty `sourceUrls`;
  no `trendId` at all) against this round's code to confirm neither regressed — both still never block,
  exactly as before.

**Verdict on this finding: FIXED, correctly, in both directions, with real proof — not just an assertion
that nothing threw.**

### Per-criterion results (Round-2-specific acceptance criteria, from the coordinator's brief)

| # | Criterion | Result | Proving test |
|---|---|---|---|
| 1 | Blank (`""`) and whitespace-only (`"   "`) entries are treated as absent | PASS | `store.test.ts` → `"rejects...only a single blank string"`, `"rejects...only a whitespace-only entry"`, `"rejects...EVERY...entry is blank or whitespace-only (mixed blanks)"` |
| 2 | Mixed case (`["   ", "https://real.example"]`) is still accepted — the naive-implementation trap | PASS, genuinely proven (round-trip check, not "didn't throw") | `store.test.ts` → `"accepts a paywalled trendId when sourceUrls mixes one blank entry with one real entry"` |
| 3 | Still the existing `IdeaValidationError`, no new error type | PASS | `git diff 9166491..HEAD -- src/idea/store.ts` shows zero new `class`/`Error` declarations — `hasAtLeastOneReadableSource` returns a `boolean`, `assertOpenlyReadableSource` still throws only `IdeaValidationError` |
| 4 | Dangling-`trendId` FK behavior confirmed deliberate, with a regression test | PASS | `store.test.ts` → `"never pre-validates trendId itself..."` asserts `/FOREIGN KEY/`, matching the pre-existing `runId`/`brandId`/`formatId` convention; independently re-verified by my own Round-1 manual repro re-run against this round's code (still throws a raw FK error, never `IdeaValidationError`) |
| 5 | `specs/idea-store/spec.md` updated to match, with Scenarios corresponding to the new tests | PASS | See spec-delta check below — 1:1 correspondence confirmed |
| 6 | Scope stayed clean — only `src/idea/` and this change's own `openspec/` dir | PASS | `git diff 9166491..HEAD --stat` → only `src/idea/store.ts`, `src/idea/store.test.ts`, and the 2 files inside this change's `openspec/` dir (`specs/idea-store/spec.md`, `handoff.md`) |

### Spec-delta check (`specs/idea-store/spec.md`)

Read the Round-2 diff directly (`git diff 9166491..HEAD -- openspec/changes/.../specs/idea-store/spec.md`).
The Requirement text was edited (not merely appended-to) to state the trimmed-blank definition and the
deliberate no-URL-shape-check decision — this is a genuine `MODIFIED`-shape edit to an
already-in-flight, unarchived change's own delta file (not a live spec), which is a normal, safe
operation (the change has not been archived; there is nothing to reconcile against a live spec yet).
Three new/changed Scenarios, each with a 1:1 test:

| Scenario | Covering test |
|---|---|
| "createIdea rejects a paywalled trendId when every sourceUrls entry is blank or whitespace-only" | the 3 reject-direction tests above (single blank / whitespace-only / mixed-all-blank all satisfy this one Scenario's `GIVEN`/`WHEN` variants) |
| "createIdea accepts a paywalled trendId when sourceUrls mixes one blank entry with one real entry" | `"accepts...mixes one blank entry with one real entry"` |
| "createIdea never pre-validates a dangling trendId — it falls through to the schema's own FOREIGN KEY" | `"never pre-validates trendId itself..."` |

All three PASS. The two pre-existing Scenarios this Requirement already carried ("accepts...carries its
own sourceUrls", "rejects...sourceUrls is empty") still read correctly under the new trimmed definition
— re-checked their prose against the new Requirement text and confirmed no contradiction (an entry that
is a real, non-blank URL still "carries its own sourceUrls"; omitted/`[]` is still "empty"). No scenario
was silently dropped or weakened; the change is a strict tightening, not a rewrite of intent.

### Always-rules + Magnific-fake checks (re-confirmed this round)

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish / Public-metrics-only / Relative-not-absolute / Explicit-attribution | PASS (untouched by construction) | Round 2 touches only `src/idea/store.ts`, `src/idea/store.test.ts`, and this change's own `openspec/` dir — no generation/publish/metrics/scoring/attribution code anywhere in the Round-2 diff. |
| Ledger-as-source-of-truth | PASS | `grep -n "ledger\." src/idea/store.ts src/idea/store.test.ts` (re-run this round) → only the same pre-existing doc-comment mention from Round 1; no new ledger read/write introduced. |
| Magnific fake (hard requirement) | PASS | `grep -n "spaces_\|creations_\|magnific\|zoho-social\|mcp__" src/idea/store.ts src/idea/store.test.ts` → no matches. All 5 new tests use `withTempDb` (confirmed by reading each new test block directly in the diff) — zero `:memory:` usage introduced. |

### Judgement call: no URL-shape validation — RULE

**The spot-check confirms the survey is accurate, not merely asserted.** I independently walked the real
data myself rather than trusting the summary:

- Confirmed **51 Briefs** carry a `## Source(s)` section (`grep -rl "## Source(s)" data/brands/*/ideas/`
  → 51 files), and the section content across all of them totals **268 raw lines**
  (`awk`-extracted section text, `wc -l` → 268) — the exact counts the Round-2 report claims.
  Independently, of those 268 lines, **229** contain an `http(s)://` substring — the remaining ~39 are a
  mix of note-only bullets and wrapped continuation lines of multi-line bullets.
- Confirmed both quoted example strings are real, verbatim text in real Brief files —
  `"No distinct official X corporate blog post was found for this specific feature."` appears in
  `data/brands/straw-motion/ideas/2026-W29/idea-06.md`, and `"sanders.senate.gov returns 403 to
  automated fetchers"` appears in `data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-06.md`
  — I read both files in full, not just the grep hit. **These are genuine, legitimate content**: real,
  human-authored verification/editorial notes that sit alongside real `https://` citation bullets in the
  same `## Source(s)` section, exactly as characterized.
- I went further than the survey and checked the one thing it doesn't state outright: **whether any real
  Brief's `## Source(s)` section has ZERO `http(s)://` links at all** — i.e., whether the all-notes,
  no-real-link worst case already exists in real data. I checked all 51 files programmatically: **none
  of them has zero URLs** — every real Brief today carries at least one genuine `https://` link alongside
  any notes. So today, for the 51 real Briefs that exist, a strict "the array needs at least one
  URL-shaped entry" check would not have rejected any of them. The survey's conclusion — "a strict
  URL-shape check would risk rejecting real data" — is technically about the future (what #204's importer
  might do with the note bullets, e.g. dumping the raw note text verbatim into `sourceUrls` as its own
  entry alongside the real URLs), not about today's Briefs failing outright. Either way, the underlying
  judgement — don't invent a validation shape ahead of the thing that will actually produce the data — is
  sound, and I confirm the evidence behind it is real, not fabricated or cherry-picked.

**Given that, I agree with the decision not to build URL-shape validation now.** This is good
engineering: the importer's parsing/extraction logic does not exist yet, there is no real precedent for
what shape `sourceUrls` will actually take, and a premature format check is exactly the kind of
speculative scope #228 never asked for.

**But the coordinator's deeper question stands, and I want it on the record plainly, not softened:**
**the rule is no longer fully self-enforcing against its own intent.** `hasAtLeastOneReadableSource`
checks "is there a non-blank string here", not "is there a source a human could actually open." Today
that gap is invisible because every real Brief happens to carry a genuine URL alongside its notes. But
the check itself does not know that, and does not depend on it. Concretely: if `sourceUrls` ever ends up
holding **only** a non-URL string — e.g. a future Brief whose only "source" really is a verification note
like `"(No source could be found for this claim.)"`, or a bug in #204's importer that extracts a note
bullet's prose instead of skipping it — `hasAtLeastOneReadableSource` returns `true`, the paywalled gate
opens, and the Idea is treated as briefable. **Trimming blanks closes the "empty-disguised-as-content"
hole from Round 1. It does not close the "non-empty-but-not-actually-a-source" hole** — and structurally
cannot, because "is this string an openly readable source" is a strictly harder question than "is this
string non-blank," and this store was never asked, in this ticket, to answer the harder question.

**Is that acceptable for now? Yes, with the limitation named, not papered over** — which is exactly what
the coordinator asked me to do instead of letting it pass silently:

- It is acceptable **because** no real data today exercises the gap (confirmed above, not assumed), the
  importer that will actually decide what goes into `sourceUrls` has not been built, and building a
  format check ahead of that importer risks guessing wrong about a shape nobody has designed yet — a real
  , not hypothetical, risk given the note bullets' variety (parenthetical asides, "Verification note:"
  prefixes, "Thin sourcing:" prefixes — no single regex would cleanly separate "note" from "URL" across
  all 51 files without also needing to handle the multi-line-wrapped bullets I found in the raw line
  count).
- It is **not** acceptable to leave unstated. The Round-2 Build Report's "Known limits" section says
  "URL-shape/format validation is explicitly deferred to issue #204" — true, but stated as a scope
  decision, not as the specific mechanism-level risk the coordinator is asking about (that the check is
  now satisfiable by *any* non-empty string, including a string that is itself an admission no source
  exists). I am recording that framing explicitly here so it is not lost.
- **What #204 (or a follow-up ticket) needs to do about it**: #204's importer must not treat "extract
  every bullet's trailing text into `sourceUrls`" as safe by default — it needs its own decision about
  which bullets are citations versus commentary (the Round-2 report's own guess — extracting the
  substring after each bullet's `): ` marker and discarding non-URL notes — is a reasonable starting
  point, but is *not yet built*, and until it is, nothing stops a naive importer from writing a note's
  prose straight into `sourceUrls`). Once the importer's real, produced shape exists, either (a) the
  importer itself should filter to only URL-shaped strings before ever calling `createIdea`, or (b) a
  follow-up ticket should extend `hasAtLeastOneReadableSource` to require URL-shape (e.g. an `https?://`
  prefix check) once that real shape is known well enough to design against safely. I recommend this be
  captured as an explicit follow-up (a ticket or an item on #204's own task list), not left as an
  implicit assumption a future reader has to rediscover.

### Overall verdict: PASS

Both directions of the blank/whitespace fix genuinely hold, proven by real tests including a full
round-trip check on the mixed-acceptance case, not merely absence of a throw. The dangling-`trendId`
FK-error behavior is confirmed deliberate and now has a regression test. The spec delta was updated with
Scenarios that correspond 1:1 to the new tests, and does not weaken or drop any prior Scenario. Scope
stayed clean (`src/idea/` + this change's own `openspec/` dir only). Numbers confirmed exactly:
**3005/764/0 fail** (a real, accounted-for +5 over Round 1), `test:docs` unchanged at 289/77/0,
`openspec validate --all --strict` unchanged at 54/0 failed. The URL-shape judgement call is sound
engineering, backed by evidence I verified myself rather than accepted on trust — but the residual gap
(the check is satisfiable by any non-blank string, not only a genuine source) is real and should not be
allowed to fade from view; it is named here explicitly and should travel forward as a #204 (or follow-up)
task, not be treated as closed.

**Nothing here should block merge.** This round has no new defect, critical or otherwise — the one item
worth carrying forward (URL-shape validation, deferred) is a scope decision already made deliberately and
correctly by this round, not a bug in it.
