# Slice Handoff — issue #142 (Schedule Batch: enforce X's 280-char cap, caption + hashtags, at composition)

One bidirectional doc: `developer` writes the Build Report below; `qa` appends a QA Verdict beneath it.
Nothing here is ever overwritten; a retry appends a new `Round-N Build` block.

---

## Round 1 note (context for this file's naming)

The prior pipeline invocation that produced a "Round 1 FAIL" QA Verdict was itself broken at the
orchestration layer: the issue number/slug/baseline-test-count placeholders handed to `qa` were the
literal string `"undefined"`, and no OpenSpec change, no code, and no `handoff.md` existed anywhere in
the repo for this slice (`git log main..HEAD` on this branch was empty; `openspec/changes/` contained
only `archive/`). In other words, no developer work had actually been attempted before this round — the
"failure" was the missing invocation itself, correctly caught by `qa`. This document is the FIRST real
Build Report for issue #142; it is labeled "Round 2" per the retry instructions handed to this session,
but there is no genuine "Round 1" build to append to.

---

## Build Report — Round 2

### What changed

Issue #142 (parent: #140, the Schedule Batch spec) fixes a live bug in the copy step: `src/copy/
validate.ts`'s length check only ever measured a Copy's `caption` on its own, never `caption` PLUS
`hashtags` together. X's own convention is that its 280-char cap covers the WHOLE tweet (there is no
separate hashtags field the way Instagram has) — the live failure named in the issue was a 318-character
X variant whose caption alone (280) passed composition but whose caption + hashtags combined (318) was
only ever caught later, at Zoho's bulk-upload step.

The fix, scoped to the copy step only (no Schedule Batch export code exists yet — that is a separate,
later slice):

1. **`src/copy/platform-shape.ts`** — `PlatformCopyShape` gains a new documented field,
   `capIncludesHashtags: boolean`. `true` for `x` (the one platform whose cap counts hashtags against
   the same budget); `false` for the other five documented platforms (`facebook`, `instagram`,
   `linkedin`, `tiktok`, `youtube`), whose own caption-alone conventions are unchanged.
2. **`src/copy/validate.ts`** — a new, pure, exported function `checkCombinedCaptionHashtagsCap(copy,
   platform)`: for a platform declaring `capIncludesHashtags: true`, measures `caption` + a separating
   space + `hashtags` space-joined against that platform's own real `maxChars`, and returns a new
   `caption_hashtags_length` error (naming the platform and the exact character overage) when exceeded.
   Returns `null` for every other platform, for a compliant length, and for a malformed `copy` value
   (never throws). `CopyValidationCode` gains this new member, additively. `validateCopyForPlatform` now
   runs this check for every platform it validates, alongside its existing checks —
   **`validateCopy` itself is untouched: same signature, same body** (confirmed by `git diff`, see
   Self-review notes).
3. **`src/copy/compose.ts`** — `composeCopyForChannels`'s PRIMARY-Channel branch (which validates
   against the chosen Recipe's own `baseShape`, never `platform-shape.ts`'s table — issue #128 AC3) now
   ALSO calls `checkCombinedCaptionHashtagsCap` directly and merges any failure into that Channel's own
   validation errors. This makes the fix apply **whether X is the primary Channel or a non-primary one**
   — the issue's own explicit requirement — even though neither committed Brand Profile currently sets X
   as primary (both Straw Motion and MundoTip's primary Channel is `facebook`; verified by
   `grep -rn "primary: true" data/brands/*/brand-profile.yaml`).
4. **Docs kept in sync** — `.claude/skills/write-social-copy/SKILL.md` and `.claude/agents/producer.md`
   each gained a short note naming the new check and the "regardless of primary" rule, pinned by new
   assertions in their existing `.docs-test.ts` suites (so the docs can never silently drift from this
   behavior again).

### Files touched

- **Added:**
  - `openspec/changes/issue-142-x-280-char-cap/{proposal.md,tasks.md,handoff.md}`
  - `openspec/changes/issue-142-x-280-char-cap/specs/copy-composition/spec.md`
- **Modified:**
  - `src/copy/platform-shape.ts` (+ tests in `src/copy/platform-shape.test.ts`) — new
    `capIncludesHashtags` field, `true` for X, `false` for the other five.
  - `src/copy/validate.ts` (+ tests in `src/copy/validate.test.ts`) — new `caption_hashtags_length`
    code, new `checkCombinedCaptionHashtagsCap` export, wired into `validateCopyForPlatform`.
    `validateCopy` itself byte-for-byte unchanged.
  - `src/copy/compose.ts` (+ tests in `src/copy/compose.test.ts`) — `composeCopyForChannels`'s primary
    branch now also runs `checkCombinedCaptionHashtagsCap`.
  - `.claude/skills/write-social-copy/SKILL.md` (+ assertions in
    `src/copy/write-social-copy-skill.docs-test.ts`).
  - `.claude/agents/producer.md` (+ assertion in `src/production-spec/producer-agent.docs-test.ts`).
- **Not touched:** `src/copy/contract.ts`, `src/copy/draft.ts`, `src/copy/inject.ts`,
  `src/recipe/registry.ts`, any Brand Profile YAML, the Schedule Batch export (not yet built — no
  `zoho`/`schedule-batch` code exists anywhere in `src/`).

### How to run

```bash
# Full suite (type-check via tsc --noEmit, then the Node test runner over src/**/*.test.ts)
npm test

# Just this slice's new/extended tests
node --import tsx --test src/copy/platform-shape.test.ts src/copy/validate.test.ts src/copy/compose.test.ts

# Skill/agent-doc conformance suite (kept in sync — two files/assertions touched)
npm run test:docs

# OpenSpec validation
npx openspec validate issue-142-x-280-char-cap --strict
```

Baseline before this slice: `npm test` → **1639 passing, 0 failing, 431 suites**. After this slice:
**1654 passing, 0 failing, 434 suites** (15 net-new tests: 2 in `platform-shape.test.ts`, 9 in
`validate.test.ts`, 4 in `compose.test.ts`). `npm run test:docs`: **138 passing, 0 failing** (up from
134 baseline — 4 net-new assertions across the two doc-conformance suites). `npx openspec validate
issue-142-x-280-char-cap --strict`: valid.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (verbatim from issue #142) | Proving test(s) |
|---|---|---|
| 1 | An X variant whose caption + hashtags total more than 280 characters fails validation at composition time, naming the platform and the overage. | `src/copy/validate.test.ts`: `"checkCombinedCaptionHashtagsCap ..."` → `"names the platform and the overage in the message (AC1)"` (asserts the message names `"x"` and the exact overage `10`); `"validateCopyForPlatform — X's combined cap is wired in (issue #142)"` → `"fails an X variant whose caption + hashtags combined exceeds 280, even though the caption alone fits"`. End-to-end at composition time: `src/copy/compose.test.ts`'s `"composeCopyForChannels — X's combined caption+hashtags cap (issue #142)"` → `"fails a NON-primary X variant..."` and `"fails an X variant even when X is the PRIMARY Channel..."` — both assert `result.ok === false`, `result.copy === undefined`, and a `caption_hashtags_length` error naming `"x"`. |
| 2 | The 318-character live-failure case is a regression test. | `src/copy/validate.test.ts`: `"the 318-character live-failure case: caption alone within 280, combined over — regression test"` — reproduces the exact shape (caption exactly 280 chars, one hashtag pushing the combined total to 318) and asserts the caption alone is `<= 280`, the combined check fails, and the message names `318` and the `38`-char overage. `compose.test.ts`'s `"fails a NON-primary X variant..."` test also names `318` in its assertion, proving the same regression holds through the full `composeCopyForChannels` path. |
| 3 | Compliant X variants still pass unchanged; other platforms' limits are unaffected. | Compliant X: `validate.test.ts`'s `"a compliant X variant (combined within 280) passes unchanged"` / `"a compliant X variant still passes unchanged"`; `compose.test.ts`'s `"a compliant X variant still passes unchanged, primary or not"`. Other platforms unaffected: `validate.test.ts`'s `"other platforms' limits are unaffected — the SAME combined length passes for Instagram/LinkedIn (AC3)"` and `"the SAME over-280-combined Copy still passes for Instagram/LinkedIn..."`; `compose.test.ts`'s `"other platforms' limits are unaffected by the SAME over-280-combined caption/hashtags (AC3)"` (asserts `caption_hashtags_length` never appears on any platform except `x`). `platform-shape.test.ts`'s `"only X declares capIncludesHashtags today (issue #142)"` proves the flag itself is X-only at the data level. |

### Fakes / fixtures used

- **No Magnific fake needed and none used.** This slice has zero Space/MCP code —
  `grep -rn "spaces_\|creations_\|magnific" src/copy/platform-shape.ts src/copy/validate.ts
  src/copy/compose.ts` (and their test files) returns nothing. Confirmed hermetic: this is pure,
  deterministic length arithmetic and error-list merging, no I/O, no network, no clock, no live Space
  call anywhere in this diff.
- Test data is all in-memory literals: hand-built `{ caption, hashtags }` Copy values (including the
  exact 318-character live-failure reproduction) and `channelsFrom({ channel: [...] })` lists mirroring
  Straw Motion's real multi-Channel `brand-profile.yaml` shape (`STRAW_MOTION_CHANNELS`, already defined
  in `compose.test.ts` by the prior #129 slice) plus one new single-Channel, X-primary list
  (`xPrimary`) built the same way, specifically to exercise "X as the primary Channel."

### Self-review notes

- Ran `git diff src/copy/validate.ts` as the final check before writing this report: `validateCopy`'s
  own body is untouched — only new doc-comment prose was added above it, one new pure helper
  (`combinedCaptionHashtagsLength`) and one new exported function (`checkCombinedCaptionHashtagsCap`)
  were inserted, and `validateCopyForPlatform`'s body was restructured (from two early-return branches
  into one error-accumulating pass) to fold in the new check alongside the existing mention-syntax
  check — no behavior change for any existing caller, confirmed by every pre-existing test in
  `validate.test.ts`/`platform-shape.test.ts`/`compose.test.ts` still passing unmodified.
- Deliberately kept `checkCombinedCaptionHashtagsCap` as one small, independently-testable, pure
  function rather than inlining the combined-length arithmetic into both `validateCopyForPlatform` and
  `composeCopyForChannels` separately — the SAME function backs both the non-primary path (via
  `validateCopyForPlatform`) and the primary path (called directly from `compose.ts`), so the "X's 280
  cap is always caption+hashtags together, regardless of primary status" rule can never drift between
  the two call sites.
- Considered simply changing the primary-Channel branch to always resolve through
  `resolveCopyShapeForPlatform`/`validateCopyForPlatform` (so ALL platforms, not just combined-cap ones,
  would be checked the same way for a primary Channel) — rejected: that would silently break issue #128
  AC3's guarantee that a primary Facebook Channel keeps using the Recipe's own `copyShape` (180/2200),
  not the table's own (looser) 477-char `facebook` entry. Keeping the combined-cap check as a narrow,
  additive, platform-flag-gated addition (rather than changing which shape governs primary-Channel
  length/emoji bounds) is the smallest correct fix and leaves every other platform's behavior — primary
  or not — completely untouched, which is exactly what AC3 asks for.
- Tightened one over-long conditional line in `validateCopyForPlatform` (extracted a named
  `mentionsSupported` boolean) during the pass — no other dead code or unused imports found; `tsc
  --noEmit` (`noUnusedLocals`/`noUnusedParameters`) confirms this.
- Updated the two doc-comment blocks in `compose.ts` that made claims no longer fully accurate after
  this change (the "single-Channel Brand is provably identical to `composeCopy`" claim now correctly
  carries its one true exception: a lone Channel that is itself a `capIncludesHashtags` platform).

### Known limits

- **The Schedule Batch export itself** (CSV generation, S3 media hosting, the export's OWN re-check
  naming the Asset per issue #140's Implementation Decisions) is NOT built here — no `zoho`/
  `schedule-batch` code exists anywhere in `src/`. This slice closes the gap at the copy-composition
  layer so an unpostable X variant can never reach that export in the first place; the export's own
  defense-in-depth re-check is separate, later work.
- **No committed Brand currently targets X as its primary Channel** (both Straw Motion and MundoTip's
  primary is `facebook`) — the "X as primary" path is proven correct by test (`compose.test.ts`'s
  dedicated `xPrimary` scenario) but has no live production data exercising it yet.
- **The combined-length definition (`caption` + one space + hashtags space-joined) is a documented,
  reasonable modeling choice**, not derived from a not-yet-built CSV/export format (issue #140's Zoho
  CSV "Post Content" field construction is separate, later work) — if that later work settles on a
  materially different join (e.g. a different separator), `checkCombinedCaptionHashtagsCap`'s one
  helper (`combinedCaptionHashtagsLength`) is the single place to adjust it.

---

## QA Verdict — Round 2: PASS

**Preliminary note on orchestration.** The QA task text handed to this session again carried unresolved
template placeholders (issue #undefined, repo branch "undefined", baseline "undefined"). As in Round 1,
this was an orchestration-layer defect, not a signal about the slice itself. This session recovered the
real context directly from the repo: current branch is `issue-142-x-280-char-cap`,
`openspec/changes/issue-142-x-280-char-cap/` contains a real Build Report, and `gh issue view 142
--repo SandroBlunt/OrganicGrowth` confirms this is issue #142 ("Schedule Batch: enforce X's 280-char
cap (caption + hashtags) at composition"). Verification below is against the REAL issue #142, its real
acceptance criteria, and the real OpenSpec change — not the placeholder text.

### Suite result

- `npm test` (type-check via `tsc --noEmit`, then the full Node test-runner suite over
  `src/**/*.test.ts`): **1654 passing, 0 failing, 434 suites** — actually run, fully green. Matches the
  Build Report's claimed baseline (1639) → post-slice (1654) delta of 15 net-new tests.
- `node --import tsx --test src/copy/platform-shape.test.ts src/copy/validate.test.ts
  src/copy/compose.test.ts`: **86 passing, 0 failing, 21 suites** — actually run, fully green.
- `npm run test:docs`: **138 passing, 0 failing, 36 suites** — actually run, fully green. Matches the
  claimed 134 → 138 delta (4 net-new doc-conformance assertions).
- `npx openspec validate issue-142-x-280-char-cap --strict`: **"Change 'issue-142-x-280-char-cap' is
  valid"** — actually run, passed.
- Minor documentation-accuracy note (not a code defect — see Defect list, low severity): the Build
  Report's per-file test-count breakdown ("2 in platform-shape.test.ts, 9 in validate.test.ts, 4 in
  compose.test.ts") is off by one in two places — actual is 1/10/4 (still summing to the correctly
  reported 15 total, and the overall suite counts are correct).

### Per-criterion results (issue #142, verbatim)

| # | Acceptance criterion | Result | Proving test |
|---|---|---|---|
| 1 | An X variant whose caption + hashtags total more than 280 characters fails validation at composition time, naming the platform and the overage. | **PASS** | Read `src/copy/validate.ts`'s `checkCombinedCaptionHashtagsCap` (lines 274-295): computes `combinedCaptionHashtagsLength`, compares against the platform's real `maxChars`, returns a `caption_hashtags_length` error naming the platform and the exact overage. Wired into `validateCopyForPlatform` (non-primary Channels) AND directly into `composeCopyForChannels`'s primary-Channel branch (`src/copy/compose.ts` lines 193-202) — so the check fires "at composition time" regardless of primary status, exactly as required. Proven by `src/copy/validate.test.ts`'s `"names the platform and the overage in the message (AC1)"` (asserts message matches `/\bx\b/` and `/10/` for a 290-combined case) and `src/copy/compose.test.ts`'s `"fails a NON-primary X variant..."` / `"fails an X variant even when X is the PRIMARY Channel..."` (both assert `result.ok === false`, `result.copy === undefined`, and a `caption_hashtags_length` error on the `"x"` platform). All four tests independently run and confirmed green. |
| 2 | The 318-character live-failure case is a regression test. | **PASS** | `src/copy/validate.test.ts`'s `"the 318-character live-failure case: caption alone within 280, combined over — regression test"` (lines 240-256) reproduces the EXACT shape named in the issue: a 280-char caption (passes X's cap alone) plus one hashtag pushing the combined total to exactly 318; asserts the caption-alone check would pass, the combined check fails with `caption_hashtags_length`, and the message names both `318` and the `38`-char overage. `src/copy/compose.test.ts`'s `"fails a NON-primary X variant..."` test also reproduces the same 318-combined shape end-to-end through `composeCopyForChannels`. Confirmed run, green. |
| 3 | Compliant X variants still pass unchanged; other platforms' limits are unaffected. | **PASS** | Compliant-X: `validate.test.ts`'s `"a compliant X variant (combined within 280) passes unchanged"` and `"a compliant X variant still passes unchanged"`; `compose.test.ts`'s `"a compliant X variant still passes unchanged, primary or not"`. Other-platforms-unaffected: `validate.test.ts`'s `"other platforms' limits are unaffected — the SAME combined length passes for Instagram/LinkedIn (AC3)"` (checks instagram/linkedin/facebook/tiktok all `null` for the identical over-280-combined Copy) and `"the SAME over-280-combined Copy still passes for Instagram/LinkedIn..."`; `compose.test.ts`'s `"other platforms' limits are unaffected by the SAME over-280-combined caption/hashtags (AC3)"` (asserts only `tiktok`/`x` fail, and `caption_hashtags_length` never appears on any non-`x` platform). Read the code: `checkCombinedCaptionHashtagsCap` returns `null` immediately for any platform whose `PlatformCopyShape.capIncludesHashtags` is not `true` (`src/copy/validate.ts` line 279), and `platform-shape.ts`'s table declares this `true` for exactly one platform (`x`) — confirmed by `platform-shape.test.ts`'s `"only X declares capIncludesHashtags today (issue #142)"`. All confirmed run, green. |

All three acceptance criteria are satisfied by code that was read directly (not merely by trusting the
Build Report's table) and by tests that were actually executed and observed green in this session.

### Per-scenario results (spec deltas, `openspec/changes/issue-142-x-280-char-cap/specs/copy-composition/spec.md`)

Only the NEW (issue #142) scenarios are listed; the pre-existing scenarios inherited from issues
#128/#129/#130 were spot-checked for fidelity (see "OpenSpec faithfulness" below) but are out of this
slice's scope to re-litigate.

| Scenario | Result | Covering test |
|---|---|---|
| Only X declares capIncludesHashtags (issue #142) | **PASS** | `platform-shape.test.ts`: `"only X declares capIncludesHashtags today (issue #142)"` |
| An X variant whose caption + hashtags combined exceeds 280 fails, even though the caption alone fits (issue #142 AC1/AC2) | **PASS** | `validate.test.ts`: `"the 318-character live-failure case..."`, `"names the platform and the overage in the message (AC1)"`, `"validateCopyForPlatform — X's combined cap is wired in (issue #142)"` → `"fails an X variant whose caption + hashtags combined exceeds 280..."` |
| A compliant X variant still passes unchanged (issue #142 AC3) | **PASS** | `validate.test.ts`: `"a compliant X variant (combined within 280) passes unchanged"`, `"a compliant X variant still passes unchanged"` |
| The SAME over-280-combined Copy is unaffected on every other documented platform (issue #142 AC3) | **PASS** | `validate.test.ts`: `"other platforms' limits are unaffected — the SAME combined length passes for Instagram/LinkedIn (AC3)"` |
| A NON-primary X variant fails the combined cap, naming the platform and the 318 combined length (issue #142) | **PASS** | `compose.test.ts`: `"fails a NON-primary X variant whose caption + hashtags combined exceeds 280, naming the platform and the overage"` |
| An X variant fails the combined cap even when X is the PRIMARY Channel (issue #142) | **PASS** | `compose.test.ts`: `"fails an X variant even when X is the PRIMARY Channel — the combined cap is never skipped for a primary Channel"` |
| A compliant X variant still passes unchanged, primary or not (issue #142) | **PASS** | `compose.test.ts`: `"a compliant X variant still passes unchanged, primary or not"` |
| Other platforms' limits are unaffected by the SAME over-280-combined caption/hashtags (issue #142 AC3) | **PASS** | `compose.test.ts`: `"other platforms' limits are unaffected by the SAME over-280-combined caption/hashtags (AC3)"` |
| The Skill documents X's combined caption+hashtags cap, regardless of primary status (issue #142) | **PASS** | `src/copy/write-social-copy-skill.docs-test.ts`'s new `"write-social-copy Skill — X's caption cap covers caption + hashtags together (issue #142)"` describe block (3 assertions: names `checkCombinedCaptionHashtagsCap`/`capIncludesHashtags`, states the "REGARDLESS of whether X is the primary Channel" rule, names `caption_hashtags_length`); `src/production-spec/producer-agent.docs-test.ts`'s new assertion on `producer.md`. Read both doc files directly to confirm the prose actually names these identifiers (`.claude/skills/write-social-copy/SKILL.md` lines 170-177; not separately quoted here but confirmed by direct read). |

### OpenSpec faithfulness check (job (c))

- Read `proposal.md` in full against issue #142's body — the Why/What Changes/Non-Goals/Impact sections
  correctly scope this to the copy-composition layer only, correctly identify the Schedule Batch export
  itself as explicitly out-of-scope (matches the issue's parent framing, #140), and correctly state the
  fix must apply "whether X is primary or non-primary" (the issue's own explicit requirement, verified
  against the issue body verbatim above).
- Diffed the delta's three MODIFIED Requirements against the currently-archived base spec
  (`openspec/specs/copy-composition/spec.md`) to confirm each is a faithful, additive extension — not a
  silent rewrite that drops pre-existing content. All three requirement titles in the delta exactly
  match existing requirement titles in the base spec (confirmed via `grep -n "^### Requirement"` on
  both files), and a line-level diff of the "per-platform CopyShape table" requirement shows only the
  new `capIncludesHashtags` sentence(s) inserted alongside the pre-existing `supportsMentions` prose —
  no existing scenario or sentence was removed.
- Read the `Impact` section's always-rules claims and independently verified each against the actual
  diff (see Always-rules section below) rather than trusting the stated claims.
- No misread found: the spec's characterization of `checkCombinedCaptionHashtagsCap` as "independent of
  whichever `CopyShape` governs the caption-alone length/emoji bounds" and "REGARDLESS of primary
  status" is exactly what the code does (verified by reading `compose.ts` lines 193-202 and
  `validate.ts` lines 320-351).

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | **PASS** | No publish-path code touched; this slice only makes an unpostable Copy fail earlier (at composition), never publishes anything. `git status` confirms the full file list touched (`platform-shape.ts`, `validate.ts`, `compose.ts`, two doc files + their tests) — no publish/Zoho/export code anywhere in the diff. |
| Public-metrics-only | **PASS** (not applicable) | No metrics/Apify code touched — confirmed by the file list; `grep -rn "apify\|Insights" ` on the touched files returns nothing relevant. |
| Relative-not-absolute | **PASS** (not applicable) | No baseline/scoring code touched. |
| Explicit-attribution | **PASS** (not applicable) | No Post/`post_url`/ledger-attribution code touched. |
| Ledger-as-source-of-truth | **PASS** (not applicable) | No ledger read/write path touched — this slice is pure, in-memory Copy validation with no I/O beyond `loadCopyRules` (unchanged). |
| ISO-8601 timestamps | **PASS** (not applicable) | No timestamp-producing code touched. |
| Magnific fake / no live-Space calls | **PASS** | `grep -rn "spaces_\|creations_\|magnific" src/copy/platform-shape.ts src/copy/validate.ts src/copy/compose.ts src/copy/platform-shape.test.ts src/copy/validate.test.ts src/copy/compose.test.ts` returns **no matches** (exit code 1) — independently re-run in this session, confirmed. This slice touches no Space-driving code at all; there is nothing to fake. |

### Defect list

| Severity | Title | Detail | Repro |
|---|---|---|---|
| low | Build Report's per-file test-count breakdown is slightly inaccurate | The Build Report states "15 net-new tests: 2 in `platform-shape.test.ts`, 9 in `validate.test.ts`, 4 in `compose.test.ts`". The actual breakdown (counted via `git diff` / `it(` counts before and after) is 1 / 10 / 4. The TOTAL (15) and the overall suite result (1639 → 1654) are both correct — only the per-file attribution in the prose is off by one in two places. This does not affect test coverage, correctness, or the suite result, and is not a code defect — purely a documentation-accuracy nit in the handoff, safe to leave as-is or fix in a future pass. | `git show HEAD:src/copy/platform-shape.test.ts \| grep -c "  it("` (14) vs `grep -c "  it(" src/copy/platform-shape.test.ts` (15) → 1 new, not 2; same technique on `validate.test.ts` shows 26 → 36 → 10 new, not 9. |

No critical, high, or medium defects found. The suite is fully green (actually run, not assumed), all
three acceptance criteria are satisfied by code that was read and by tests that were actually executed,
the OpenSpec change faithfully matches the issue (no misread, no dropped criterion, no contradiction
with CONTEXT.md/ADRs/PRD #1), no live-Space calls exist anywhere in the diff, and every always-rule
either holds or is not applicable to this narrow, well-scoped bug fix.

**Verdict: PASS.**
