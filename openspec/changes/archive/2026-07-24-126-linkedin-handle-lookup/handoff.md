# Slice Handoff — issue #126 (LinkedIn handle lookup store)

One bidirectional doc: `developer` writes the Build Report below; `qa` appends a QA Verdict beneath it.
Nothing here is ever overwritten; a retry appends a new `Round-N Build` block.

---

## Build Report (Round 1)

### What changed

Added a small, typed, **global** lookup mapping a third-party company/product's plain name (e.g.
`"Anthropic"`, `"1Password"`) to its LinkedIn Page handle — the resolution primitive epic #120's
LinkedIn `@mention` tagging work needs. This slice is **resolution only**: it never touches Copy
composition (`src/copy/*`) — that wiring is issue #130's job, downstream of #129.

The store mirrors `BrandAssetStore`'s *shape* (typed store boundary over a plain, Operator-edited file;
defensive parsing; a missing/empty source degrades to "nothing found," never an error) but is scoped
**globally**, not per-Brand. That scope decision was the one open question the issue itself flagged, and
it is now settled and documented in `proposal.md`'s "Scope decision" section: ADR-0019
(`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`) and issue #130's own body both already
refer to "issue #126's lookup" in the singular, i.e. one shared table, not one per Brand — the
companies/products a Post's Copy names are third-party entities that can recur across any Brand's
content, not Brand-owned identity data.

Design split (mirrors `production-queue/queue.ts` pure-logic vs `store.ts` I/O):

- `src/linkedin-handle/lookup.ts` — pure deep module: `LinkedInHandleTable`/`LinkedInHandleEntry`
  types, `normalizeCompanyName` (trim + case-fold), `emptyLinkedInHandleTable()`,
  `parseLinkedInHandleTable(raw)` (defensive — drops one malformed entry with a warning rather than
  crashing the whole table; a genuinely non-object `raw` degrades to empty with a warning; `null`/
  `undefined` degrades to empty silently, the normal "no entries yet" case), `resolveHandle(table, name)`
  (case-insensitive, trimmed; returns `string | null`, never fabricates).
- `src/linkedin-handle/store.ts` — thin I/O shell: `DEFAULT_LINKEDIN_HANDLES_PATH =
  "data/linkedin-handles.yaml"`, `loadLinkedInHandleTable(path?)` (missing file -> empty table, never
  throws; a file that exists but fails to parse as YAML throws a clear, path-naming `Error`, mirroring
  `FormatStore`'s `loadFormat`), `resolveLinkedInHandle(name, path?)` — the one typed store function
  issue #130 will call.
- `data/linkedin-handles.yaml` — the real, committed, Operator-maintained file. Ships with **zero
  entries** and a header comment documenting the shape + two commented-out examples: this engineering
  slice does not curate real third-party LinkedIn handle data (I have no way to verify a company's real,
  current LinkedIn Page slug from inside this build); the Operator adds entries by hand once confirmed
  on LinkedIn itself.

### Files touched

- Added: `src/linkedin-handle/lookup.ts`
- Added: `src/linkedin-handle/lookup.test.ts`
- Added: `src/linkedin-handle/store.ts`
- Added: `src/linkedin-handle/store.test.ts`
- Added: `data/linkedin-handles.yaml`
- Added: `openspec/changes/126-linkedin-handle-lookup/proposal.md`
- Added: `openspec/changes/126-linkedin-handle-lookup/tasks.md`
- Added: `openspec/changes/126-linkedin-handle-lookup/specs/linkedin-handle-lookup/spec.md`
- Added: `openspec/changes/126-linkedin-handle-lookup/handoff.md` (this file)
- Modified: none — purely additive, no existing file changed.

### How to run

```bash
# Full suite (type-checks via tsc --noEmit first, then runs every *.test.ts)
npm test

# Just this slice's tests
node --import tsx --test "src/linkedin-handle/*.test.ts"

# Docs-conformance suite (unaffected by this slice — no .docs-test.ts added)
npm run test:docs

# OpenSpec validation
npx openspec validate 126-linkedin-handle-lookup --strict
npx openspec validate --all --strict
```

Results at handoff time:
- `npm test`: **1549 pass / 0 fail** (baseline was 1517 pass / 0 fail before this slice — +32 new tests,
  zero regressions).
- `npm run test:docs`: **122 pass / 0 fail** (unchanged from baseline — this slice adds no doc-tested
  Skill/agent file).
- `npx openspec validate 126-linkedin-handle-lookup --strict`: **valid**.
- `npx openspec validate --all --strict`: **31/31 items pass** (30 pre-existing + this change).

### Acceptance-criteria self-assessment

1. **"A new lookup file (global or per-Brand, per above) holds company/product name -> LinkedIn handle
   entries, Operator-maintained."**
   → `data/linkedin-handles.yaml` (committed, global, header-documented as hand-edited). Proven by
   `src/linkedin-handle/store.test.ts`'s `"loads the REAL committed data/linkedin-handles.yaml without
   throwing"` test, which loads the actual shipped file (not a fixture) and confirms it parses cleanly.
   The scope decision (global vs per-Brand) is documented in `proposal.md`'s "Scope decision" section
   and in `lookup.ts`'s module doc comment, cross-checked against ADR-0019 and issue #130's own body.

2. **"A typed store function resolves a given name to its handle, or returns `null`/`undefined` when no
   entry exists (never fabricates a handle)."**
   → `resolveLinkedInHandle(name, path?)` (`src/linkedin-handle/store.ts`) and its pure counterpart
   `resolveHandle(table, name)` (`src/linkedin-handle/lookup.ts`) both return `string | null`. Proven
   found-case by `store.test.ts`'s `"resolves a committed entry to its handle (AC2 — found name)"` and
   `lookup.test.ts`'s `"resolveHandle — a found name resolves to its handle (AC2)"` describe block;
   unresolved-case by `store.test.ts`'s `"returns null for a name with no committed entry (AC2 —
   unresolved name)"` and `lookup.test.ts`'s `"resolveHandle — an unresolved name returns null, never
   fabricated (AC2)"` describe block.

3. **"Tests cover: a found name, an unresolved name, and an empty lookup file."**
   → Found name: `store.test.ts` `"resolves a committed entry to its handle (AC2 — found name)"`;
   `lookup.test.ts` `"resolveHandle — a found name resolves to its handle (AC2)"` (3 tests: exact name,
   case/whitespace variants, a second distinct entry).
   Unresolved name: `store.test.ts` `"returns null for a name with no committed entry (AC2 — unresolved
   name)"`; `lookup.test.ts` `"resolveHandle — an unresolved name returns null, never fabricated (AC2)"`
   (3 tests: no entry, blank query, never throws).
   Empty lookup file: `store.test.ts` covers THREE distinct "empty" shapes — a missing file (`"loads a
   MISSING file as the empty table, never throws (AC3 — file not yet created)"`), an existing zero-byte
   file (`"loads an EXISTING but zero-byte file as the empty table (AC3 — empty lookup file)"`), and an
   existing comments-only file (`"loads an EXISTING comments-only file as the empty table (AC3)"`) — plus
   the `resolveLinkedInHandle` equivalents for missing/empty. `lookup.test.ts`'s
   `"parseLinkedInHandleTable — empty/absent input degrades to the empty table (AC3)"` describe block
   covers the same at the pure-parsing layer (`null`, `undefined`, `{}`, non-object, array).

4. **"Docs (CONTEXT.md or a store-level comment) note this is Operator-maintained, not a live API
   lookup."**
   → Chose the store-level-comment path (CONTEXT.md deliberately left untouched — see "Known limits"
   below). Both `lookup.ts`'s and `store.ts`'s top-of-file module doc comments state plainly:
   "Operator-maintained... NOT a live lookup" / "never makes a network request, calls a LinkedIn API, or
   scrapes anything." `data/linkedin-handles.yaml`'s own header comment repeats this for anyone editing
   the file directly. Not independently test-asserted (no `.docs-test.ts` was added for this slice, since
   there is no Skill/agent-instruction file here to pin against — this is a plain code comment, verifiable
   by reading the file, which qa will do).

### Fakes / fixtures used

- **No Magnific fake needed.** This slice's code is pure filesystem + string logic — no Space, no MCP
  tool, no `spaces_*`/`creations_*` call anywhere in the diff. There is nothing here for the Magnific
  fake to stand in for; confirmed by grep (`grep -rn "spaces_\|creations_" src/linkedin-handle/` — no
  matches) and by the module doc comments' own "no Space/MCP code at all" note.
  <br>**No live LinkedIn API call either** (the AC4 requirement) — confirmed by inspection (no
  `fetch`/`http`/network import anywhere in `src/linkedin-handle/`).
- **Fixtures:** all tests use `node:fs/promises`' `mkdtemp`-created temp directories (mirrors
  `production-queue/store.test.ts`'s and `brand-asset/store.test.ts`'s own convention) — hand-written
  YAML strings for the "found"/"unresolved"/"malformed"/"parse-failure" cases, plus one test in
  `store.test.ts` that loads the REAL committed `data/linkedin-handles.yaml` to prove the shipped file
  itself is valid.

### Self-review notes

- Considered adding a repo-wide "only this store reads `DEFAULT_LINKEDIN_HANDLES_PATH`" architecture-scan
  test (the pattern `brand-asset/store.test.ts` and `format/baseline-prompt.test.ts` use) — skipped: this
  is a brand-new store with no other caller yet in this slice (resolution only; #130 wires a caller
  later), so the scan would trivially pass with zero offenders today and add no real signal now. Left a
  note in the proposal instead; a scan test can be added when #130 lands its first real caller.
  <br>Also considered whether a per-name enumeration function (`listLinkedInHandleEntries`) belonged in
  this slice — decided against it: the issue's own AC only asks for single-name resolution, and adding an
  enumeration API `#130` may or may not need would be scope creep ahead of that slice's actual design.
- Kept `resolveHandle` (pure) and `resolveLinkedInHandle` (I/O) as two distinctly-named functions rather
  than one overloaded name, to keep the pure-logic/I/O-shell boundary (and which one is safe to unit-test
  without touching disk) unambiguous at the call site — mirrors `production-queue`'s own naming split
  where the pure and I/O layers never share an identical exported name for different signatures.
- Verified `npm test`'s `tsc --noEmit` pass under this repo's strict compiler flags
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`) — no
  suppressions or `any` used anywhere in the new code.
- No dead code found to remove; both new source files are fully exercised by their test files (every
  exported function has at least one direct test).

### Known limits

- **`data/linkedin-handles.yaml` ships with zero real entries.** Curating verified, real LinkedIn Page
  handles for real companies is explicitly the Operator's job (per the issue body: "Operator-maintained
  ... no live lookup or scraping") — I have no way to confirm a company's current, correct LinkedIn slug
  from inside this build, and shipping a guessed one would risk tagging the wrong account, which is worse
  than tagging none. The Operator adds entries by hand as real ones come up in produced content.
- **Not wired into Copy composition.** By design (the issue's own scope note) — `src/copy/*` is
  untouched. Issue #130 (blocked on #129) is where a resolved handle becomes an `@Name` mention in a
  LinkedIn Copy variant.
- **No repo-wide "only this store reads the path" architecture-scan test.** See Self-review notes above
  — deferred until #130 adds the first real caller outside this store's own tests.
- **CLAUDE.md's "State" section says the Production Queue is "the one exception" to per-Brand file
  scoping.** That sentence is now one exception behind reality (`data/linkedin-handles.yaml` is a second,
  smaller brand-agnostic file). I deliberately left `CLAUDE.md` untouched in this slice — editing
  root project instructions is out of scope for a resolution-only build slice, and the issue's AC does
  not ask for it (AC4 explicitly accepts a store-level comment as the doc note). Flagging here for
  visibility; a future doc-sweep slice can fold this file into that sentence's exception list alongside
  `data/queue.json`.
- **CONTEXT.md left untouched**, matching #122's/#125's own precedent of leaving the domain glossary
  alone for a mechanism-only slice that doesn't change vocabulary an Operator thinks in; AC4 explicitly
  allows a store-level comment instead.

---

## QA Verdict — Round 1: PASS

### Suite result

All commands run exactly as specified in the Build Report's "How to run" section, from
`/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-126-linkedin-handle-lookup`:

- `npm test` (type-checks via `tsc --noEmit`, then runs every `*.test.ts` under Node's built-in test
  runner): **1549 pass / 0 fail / 0 cancelled / 0 skipped**. Matches the Build Report's claimed count
  exactly.
- `npm run test:docs`: **122 pass / 0 fail**. Matches the Build Report's claimed count exactly
  (unaffected by this slice, as expected — no `.docs-test.ts` added).
- `npx openspec validate --all --strict`: **31/31 items pass**, including
  `change/126-linkedin-handle-lookup` explicitly listed as valid.
- Independently counted new tests: `grep -c "  it("` on the two new test files returns 21
  (`lookup.test.ts`) + 11 (`store.test.ts`) = **32**, matching the claimed "+32 new tests" exactly
  (1517 baseline → 1549).

All real, actually-executed, green — no assumed passes.

### Per-criterion results (issue #126 acceptance criteria, verbatim)

| # | Criterion | Result | Proving evidence |
|---|---|---|---|
| AC1 | A new lookup file (global or per-Brand) holds company/product name -> LinkedIn handle entries, Operator-maintained | **PASS** | `data/linkedin-handles.yaml` exists, committed, header comment states "HAND-EDITED by the Operator... NOT a live API lookup," gives the Operator two commented-out copy-paste examples. Proven loadable by `store.test.ts`'s `"loads the REAL committed data/linkedin-handles.yaml without throwing"` (ran it directly — passes). |
| AC2 | A typed store function resolves a name to its handle, or returns `null`/`undefined` when no entry exists (never fabricates) | **PASS** | `resolveHandle(table, name): string \| null` (`src/linkedin-handle/lookup.ts`) and `resolveLinkedInHandle(name, path?): Promise<string \| null>` (`src/linkedin-handle/store.ts`) — read both function bodies directly; no branch ever synthesizes a handle, the only return values are the committed `entry.handle` or `null`. Proven by `lookup.test.ts`'s `"resolveHandle — a found name..."` / `"...an unresolved name returns null, never fabricated"` describe blocks and `store.test.ts`'s equivalents — all pass. |
| AC3 | Tests cover: a found name, an unresolved name, and an empty lookup file | **PASS** | Found name: `store.test.ts` `"resolves a committed entry to its handle (AC2 — found name)"`, `lookup.test.ts` `"resolveHandle — a found name resolves to its handle (AC2)"` (3 sub-tests). Unresolved name: `store.test.ts` `"returns null for a name with no committed entry (AC2 — unresolved name)"`, `lookup.test.ts` equivalent (3 sub-tests). Empty lookup file: `store.test.ts` covers a missing file, a zero-byte existing file, and a comments-only existing file, each independently (all pass); `lookup.test.ts`'s `"parseLinkedInHandleTable — empty/absent input degrades to the empty table (AC3)"` covers the same at the pure layer for `null`/`undefined`/`{}`/non-object/array. |
| AC4 | Docs (CONTEXT.md or a store-level comment) note this is Operator-maintained, not a live API lookup | **PASS** | Read `lookup.ts` lines 1–30 and `store.ts` lines 1–20 directly: both top-of-file module doc comments state plainly "Operator-maintained... NOT a live lookup" and "never makes a network request, calls a LinkedIn API, or scrapes anything." `data/linkedin-handles.yaml`'s own header repeats it. AC4 explicitly allows "CONTEXT.md **or** a store-level comment" — the store-level-comment path chosen satisfies the criterion as written; CONTEXT.md is untouched, consistent with the AC's own "or." |

All 4 acceptance criteria: **PASS**.

### Per-scenario results (spec deltas → issue traceability)

`openspec/changes/126-linkedin-handle-lookup/specs/linkedin-handle-lookup/spec.md`, 3 Requirements / 6
Scenarios:

| Requirement | Scenario | Result | Covering test |
|---|---|---|---|
| Global typed lookup resolves name → handle | Committed entry resolves to its handle | **PASS** | `lookup.test.ts` "resolveHandle — a found name resolves to its handle (AC2)"; `store.test.ts` "resolves a committed entry to its handle (AC2 — found name)" |
| " | No committed entry → `null`, never fabricated | **PASS** | `lookup.test.ts` "resolveHandle — an unresolved name returns null, never fabricated (AC2)"; `store.test.ts` "returns null for a name with no committed entry" |
| " | Empty lookup (missing file or zero entries) → `null` for any name, no throw | **PASS** | `store.test.ts` "loads a MISSING file as the empty table, never throws" + "loads an EXISTING but zero-byte file..." + "returns null against a missing file, never throws" + "returns null against an existing-but-empty file, never throws" |
| Defensive parsing — malformed entry dropped, not a table crash | Malformed entry dropped, well-formed entry still resolves | **PASS** | `lookup.test.ts` "drops an entry with a blank handle, keeps the well-formed entry, and warns" (also verified: dropped entry, not-a-string handle, blank name, duplicate-key-first-wins — all pass) |
| " | File that fails to parse as YAML throws a path-naming error | **PASS** | `store.test.ts` "throws a path-naming error for a file that fails to parse as YAML, never a bare parser exception" — asserts the message matches `/Cannot parse LinkedIn Handle Lookup YAML/` and includes the path |
| Case-insensitive, whitespace-trimmed matching | Differently-cased/padded query resolves the same handle | **PASS** | `lookup.test.ts` "resolves case-insensitively and whitespace-trimmed" (`"  anthropic  "`, `"ANTHROPIC"` both resolve to the committed `"Anthropic"` entry's handle) |

All 6 Scenarios: **PASS**. Every Scenario traces back to a real acceptance criterion of issue #126 (no
invented Scenario beyond what the issue and its consumers — ADR-0019, issue #130 — actually ask for).

### Spec-vs-issue faithfulness check (job c)

- **Scope decision (global vs per-Brand) — verified, not silently assumed.** The issue explicitly
  flagged this as an open question ("confirm this during implementation... document the choice").
  Checked the developer's citations directly:
  - `docs/adr/0019-multi-channel-brand-profile-primary-tracked.md` (read in full) does say verbatim:
    *"LinkedIn `@mention` tagging of other companies/products (`#130`) is resolved through a separate,
    dedicated lookup (`#126`) — not through this list."* — confirms a single, separate lookup, not a
    per-Brand extension of the Channel list.
  - `gh issue view 130` (read in full) does say verbatim: *"resolve each company/product named in the
    Idea/Spec's structured companies data ... through #126's handle lookup"* — singular "the lookup,"
    consistent with one global table.
  - The reasoning given (third-party companies mentioned in news content recur across any Brand, unlike
    Brand-owned identity data such as `brand-profile.yaml` or Brand Assets) is sound and consistent with
    `CONTEXT.md`'s existing Brand/Channel model — a real company like Anthropic could plausibly be
    mentioned by more than one Brand's content, and there is no reason to fork that data per Brand.
  - The decision is written down in `proposal.md`'s dedicated "Scope decision" section, not just
    asserted in code comments — satisfies "document the choice."
  - **Verdict: reasonable, well-sourced, genuinely documented — not a silent assumption.**
- **No scope creep past the issue.** Verified `src/copy/*` is untouched (`git show 6071b12 --stat`
  confirms the commit touches only 9 files, all under `src/linkedin-handle/`, `data/`, and
  `openspec/changes/126-linkedin-handle-lookup/` — zero existing files modified, matching the Build
  Report's "Modified: none" claim exactly). The issue's own "This slice is resolution only" instruction
  is honored; no `@mention` insertion logic, no Copy wiring, no enumeration API beyond what AC2 asks for.
- **No contradiction with CONTEXT.md / ADRs / PRD #1.** This slice adds a new, self-contained store; it
  does not alter the Brand, Channel, Idea, Asset, or Copy vocabulary. ADR-0014 (typed store boundary,
  no DB for MVP) and ADR-0016 (Brand Asset precedent) are the cited precedents and the new code's shape
  genuinely mirrors them (typed store, defensive parsing, missing-file-degrades-gracefully).

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS (N/A, upheld)** | No publish-path code touched; `git show 6071b12 --stat` confirms zero files under any publish/producer path changed. |
| Public-metrics-only | **PASS (N/A, upheld)** | No metrics/Apify code touched. |
| Relative-not-absolute | **PASS (N/A, upheld)** | No scoring/baseline code touched. |
| Explicit-attribution | **PASS (N/A, upheld)** | No Post/`post_url`/ledger-attribution code touched. |
| Ledger-as-source-of-truth | **PASS (N/A, upheld)** | No ledger-write code path touched; `data/brands/*/ledger.json` absent from the commit's file list. |
| Never-fabricate | **PASS** | Read `resolveHandle`'s full body (`src/linkedin-handle/lookup.ts`): the only two return paths are the committed `entry.handle` (a Map lookup against Operator-authored data) or `null`. No default/fallback/guessed handle anywhere in the diff. |
| Lookup is genuinely Operator-maintained, not auto-populated | **PASS** | `grep -rn "linkedin-handles\|LinkedInHandle" src/ --include="*.ts" \| grep -v "src/linkedin-handle/"` → **no matches** — no other module in the repo reads, writes, or references this store yet (confirms "resolution only," nothing auto-populates it downstream in this slice). `grep -rn "writeFile\|appendFile" src/linkedin-handle/` → matches only inside `store.test.ts`, writing to `mkdtemp`-created temp fixtures, never to the real `data/linkedin-handles.yaml`. The real file itself is committed with zero entries and a header instructing hand-editing only. |
| Magnific fake used, no live Space calls | **PASS** | `grep -rn "spaces_\|creations_" src/linkedin-handle/` → **no matches**. This slice has no Space/MCP code at all (correctly not claiming to use the fake — there's nothing to fake), consistent with the issue's own "no live lookup or scraping" instruction. |
| No live LinkedIn API / network call | **PASS** | `grep -rn "fetch(\|http\.\|https\.\|axios\|XMLHttpRequest" src/linkedin-handle/` → **no matches**. `package.json`/`package-lock.json` diff against the issue's base is empty — no new HTTP/LinkedIn-SDK dependency added. |

### Defect list

None. No defects found in this round.

### Verdict

**PASS.** All 4 acceptance criteria verified against actual code and passing tests (not just the Build
Report's self-assessment); all 6 spec-delta Scenarios trace to real, passing tests; the global-vs-per-
Brand scope decision is genuinely documented and cross-checked against ADR-0019 and issue #130, not
silently assumed; the slice is purely additive (zero existing files modified); the lookup never
fabricates a handle and is verifiably hand-maintained only; no live Magnific or LinkedIn calls exist
anywhere in the diff. `openspec validate --strict` and the full test suite (`npm test`, `npm run
test:docs`) are green, run directly and independently confirmed. Clear to proceed to PR.
