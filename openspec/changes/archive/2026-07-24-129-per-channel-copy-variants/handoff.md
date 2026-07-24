# Slice Handoff — issue #129 (Per-channel Copy variants)

One bidirectional doc: `developer` writes the Build Report below; `qa` appends a QA Verdict beneath it.
Nothing here is ever overwritten; a retry appends a new `Round-N Build` block.

---

## Build Report (Round 1)

### What changed

Built the COMPOSING half of epic #120's "captions tuned per social media channel" ask — the half #128
(shape + validation) deliberately deferred. `Copy` (`src/copy/contract.ts`) now optionally carries one
`CopyVariant` per targeted Channel platform; a new `composeCopyForChannels` (`src/copy/compose.ts`)
actually composes them; the ledger records them (no new write path needed — `parseCopy` just parses the
new field); the output bundle (`post.json`/`caption.txt`) carries and labels them; and both
`write-social-copy` and `producer.md` document the new per-platform flow.

**Design decisions made and documented in `proposal.md`:**
- **"Targeted" = every entry on the Brand's `channel` list**, not just Channels with a filled-in `url`.
  This isn't a new call — ADR-0019 already says so explicitly ("`#128`/`#129` consume the non-primary
  entries too, to know which platforms need a Copy variant"), and CONTEXT.md's own Channel entry already
  states "Straw Motion targets Facebook, Instagram, LinkedIn, X, and TikTok." So Straw Motion now
  composes 5 variants, MundoTip 4, going forward. A Brand with exactly one Channel entry (a fresh Brand,
  or either real Brand before its own #127 migration) still gets exactly one variant, unchanged — proven
  with an in-memory single-entry fixture, since neither live Brand is single-Channel today.
- **The primary Channel always keeps the chosen Recipe's OWN `copyShape`** — never
  `platform-shape.ts`'s generic `facebook` table entry (477 chars vs. the wired Recipes' own
  180/2200) — wiring the rule `platform-shape.ts`'s own doc comment already committed to during #128.
  Every other (non-primary) targeted platform resolves its own documented bounds. This is also what
  makes the single-Channel regression provable BY CONSTRUCTION rather than by careful case-by-case
  preservation: with exactly one (primary) Channel, `composeCopyForChannels` runs the identical
  draft → inject → validate sequence, against the identical shape, as `composeCopy` — so the two are
  asserted `deepEqual` in tests.

**Code, by file:**

1. **`src/copy/contract.ts`** — `Copy` gains `variants?: readonly CopyVariant[]`
   (`CopyVariant = { platform, caption, hashtags }`). Purely additive: `caption`/`hashtags` stay
   required; a single-Channel Copy has no `variants` key at all.
2. **`src/copy/compose.ts`** — new `composeCopyForChannels(input, baseShape, channels, options)`.
   Iterates the Brand's FULL Channel list; the primary Channel's variant uses `baseShape` +
   `validateCopy` (byte-identical to `composeCopy`'s own path); every other targeted platform resolves
   its own bounds (`resolveCopyShapeForPlatform`) and validates via `validateCopyForPlatform`
   (LinkedIn's `@mention` TEXT-SYNTAX check included, never a lookup/insertion — #130). Collects EVERY
   platform's failures (never stops at the first); never partially applies a Copy. A zero-Channel Brand
   degrades to the same unlabeled compose `composeCopy` already performs. `composeCopy` itself is
   completely untouched — same signature, same body, confirmed by `git diff` (only new code appended
   after it).
3. **`src/asset/asset.ts`** — `parseCopy` additively parses an optional `variants` array (new
   `parseCopyVariant`/`parseCopyVariants`), defensively dropping malformed entries and degrading to the
   plain shape when nothing valid parses. `writeAsset`/`upsertAsset` already pass any extra `Copy`
   fields through unmodified, so saving a multi-variant Copy onto an Asset "just works" — no new ledger
   write path, and the ledger records every variant (always-rule 7).
4. **`src/asset/output-bundle.ts`** — `generatePostJson` deep-clones `copy.variants` (new `cloneCopy`
   helper) onto `post.json` when present; `null`/no-variants Copy unaffected. `captionText` renders
   EVERY variant, each headed by an `=== PLATFORM ===` label and separated by a blank line, when
   `copy.variants` is present and non-empty; the single-block, no-`variants` path is BYTE-FOR-BYTE
   unchanged (shared `renderCaptionBlock` helper keeps the two paths from ever drifting, verified against
   the exact pre-existing byte strings in the test suite).
5. **`.claude/skills/write-social-copy/SKILL.md`** — new Input item (read the Brand's full Channel
   list); Step 1 drafts one variant per targeted platform from the same produced material, never one
   shared caption; Step 2 checks the primary via `validateCopy` and every other targeted platform via
   `validateCopyForPlatform`; completion criterion + "what this Skill does not do" updated (explicitly
   defers LinkedIn `@mention` resolution to #130, and states it doesn't track/publish to non-primary
   Channels itself).
6. **`.claude/agents/producer.md`** — Copy-phase section mirrors the same instructions briefly; every
   pre-existing pinned reference (`copySkill`, `injectRequiredParts`, `validateCopy`, `auditCopyPhase`,
   `ADR-0012`) retained verbatim (confirmed by the full, unmodified pre-existing docs-test suite still
   passing). Save-phase output-bundle description notes `caption.txt` now labels every variant when more
   than one is targeted.
7. **`CONTEXT.md`** — the **Copy** glossary entry states one Copy per Asset can hold one variant per
   targeted Channel platform; no new term coined; **Asset**/**Channel** untouched.

### Files touched

- **Added:** `openspec/changes/129-per-channel-copy-variants/{proposal.md,tasks.md,handoff.md}` +
  `specs/{copy-composition,asset-store,asset-output-bundle,producer-conductor}/spec.md`.
- **Modified:**
  - `src/copy/contract.ts` — `CopyVariant`, `Copy.variants`.
  - `src/copy/compose.ts` — `composeCopyForChannels`, `ComposeCopyVariantFailure`,
    `ComposeCopyForChannelsResult`; `composeCopy` unchanged.
  - `src/copy/compose.test.ts` — new `composeCopyForChannels` describe blocks (AC1/AC5 regression,
    AC2 multi-Channel, failure aggregation, LinkedIn mention, unknown-platform fallback, required
    CTA/hashtags per variant).
  - `src/asset/asset.ts` — `parseCopyVariant`, `parseCopyVariants`, `parseCopy` extended.
  - `src/asset/asset.test.ts` — new `parseCopy`/`parseCopyVariant`/`parseCopyVariants` tests.
  - `src/asset/output-bundle.ts` — `cloneCopy`, `renderCaptionBlock`; `generatePostJson`/`captionText`
    extended.
  - `src/asset/output-bundle.test.ts` — new multi-variant `generatePostJson`/`captionText` tests, plus
    a full multi-Channel produce-flow round-trip test.
  - `.claude/skills/write-social-copy/SKILL.md`, `.claude/agents/producer.md`, `CONTEXT.md`.
  - `src/copy/write-social-copy-skill.docs-test.ts`,
    `src/production-spec/producer-agent.docs-test.ts` — new pinned assertions for the doc changes.
- **Not touched:** `src/copy/draft.ts`, `src/copy/inject.ts`, `src/copy/validate.ts`,
  `src/copy/platform-shape.ts`, `src/recipe/registry.ts`, `src/linkedin-handle/*`, any Brand Profile
  YAML, `src/producer/two-recipes-end-to-end.test.ts` (deliberately — see Known limits).

### How to run

```bash
# Full suite (type-check via tsc --noEmit, then the Node test runner over src/**/*.test.ts)
npm test

# Just this slice's new/extended tests
node --import tsx --test src/copy/compose.test.ts src/asset/asset.test.ts src/asset/output-bundle.test.ts

# Skill/agent-doc conformance suite (this slice's doc edits are pinned here)
npm run test:docs
node --import tsx --test src/copy/write-social-copy-skill.docs-test.ts src/production-spec/producer-agent.docs-test.ts

# OpenSpec validation
npx openspec validate 129-per-channel-copy-variants --strict
npx openspec validate --all --strict
```

Baseline before this slice: `npm test` → 1578 passing, 0 failing; `npm run test:docs` → 122 passing, 0
failing. After this slice: **`npm test` → 1606 passing, 0 failing** (28 net-new tests); **`npm
test:docs` → 133 passing, 0 failing** (11 net-new). `openspec validate 129-per-channel-copy-variants
--strict`: valid. `openspec validate --all --strict`: 32 passed, 0 failed (unchanged count — this is a
change, not yet an archived spec).

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #129, verbatim) | Proving test(s) |
|---|---|---|
| 1 | `Copy`'s shape supports one variant per targeted platform (single-Channel Brands keep today's one-variant behavior unchanged). | `src/copy/contract.ts`'s `Copy.variants?: readonly CopyVariant[]` (optional, additive). Behaviorally proven by `src/copy/compose.test.ts`'s `"composeCopyForChannels — AC1/AC5"` describe: `"is provably IDENTICAL to composeCopy's own result for a Brand with exactly ONE (primary) Channel"` (deep-equal assertion) and `"carries NO variants field at all for a single-Channel Brand"` (asserts `Object.keys(copy) === ["caption","hashtags"]`). `src/asset/asset.test.ts`'s `"carries NO variants key at all when the raw Copy doesn't have one"` proves the ledger-parse side too. |
| 2 | `write-social-copy` composes a distinct caption per targeted platform, each satisfying that platform's #128 CopyShape bounds. | `src/copy/compose.test.ts`'s `"composeCopyForChannels — AC2"` describe: `"composes exactly one labeled variant per targeted platform, including the primary"` (5 variants for Straw Motion's list), `"the primary Channel's variant uses the Recipe's OWN copyShape... never platform-shape.ts's own facebook table entry"`, `"each non-primary variant is validated against ITS OWN documented platform bounds"` (X ≤280, TikTok ≤150, Instagram ≤2200, LinkedIn ≤3000, and X strictly shorter than LinkedIn for the same long input). The Skill's own instructions are pinned by `src/copy/write-social-copy-skill.docs-test.ts`'s new `"composes one variant per targeted Channel platform"` describe. |
| 3 | The ledger records all variants on the Asset (ledger-as-source-of-truth, always-rule 7). | `src/asset/asset.test.ts`'s `"parses well-formed variants, labeled by platform"` (round-trips a raw ledger Copy with `variants` verbatim) plus the drop/degrade tests for malformed entries. End-to-end: `src/asset/output-bundle.test.ts`'s new `"produce-flow composition, multi-Channel"` describe writes a multi-variant Copy via `writeAsset` (the SAME ledger write path every existing produce flow uses) and reads it back unchanged via `refreshPostJson`. |
| 4 | The output bundle (`post.json`/`caption.txt`) presents each variant labeled by its platform, paste-ready. | `src/asset/output-bundle.test.ts`'s `"AC3 — carries every variant on copy.variants, labeled by platform"` (`generatePostJson`), `"renders EVERY variant, each labeled by platform, paste-ready"` and `"each variant's own block never leaks another variant's caption/hashtags"` (`captionText`), and the multi-Channel produce-flow test's literal byte-string assertion on the written `caption.txt` (`=== FACEBOOK ===` / `=== LINKEDIN ===` / `=== X ===` blocks). |
| 5 | A single-Channel Brand's existing produced-Asset behavior is unchanged (regression check against today's wired path). | Structural: `src/producer/two-recipes-end-to-end.test.ts` (the real wired-path tracer bullet) is **completely untouched** by this diff (`git diff` confirms zero lines changed) and still passes unmodified inside the full `npm test` run — it calls `composeCopy` directly, which is itself byte-for-byte unchanged. Behavioral: `compose.test.ts`'s AC1/AC5 describe (above); `output-bundle.test.ts`'s `"AC5 regression: an empty variants array renders IDENTICALLY to no variants field at all"` and `"an Asset's Copy with no variants field yields a copy with no variants key"`; `asset.test.ts`'s degrade-to-plain-shape tests. |

### Fakes / fixtures used

- **No Magnific fake needed and none used.** `grep -rn "spaces_\|creations_"` over every file this diff
  touches (`git diff -- src .claude CONTEXT.md`) returns nothing — this slice is Copy/ledger/
  output-bundle code only, exactly as the issue's own scope note says. No `spaces_*`/`creations_*` call,
  no credits, no board mutation anywhere in the diff.
- Test data is all in-memory or temp-directory: `channelsFrom({ channel: [...] })` literals mirroring
  the REAL Straw Motion 5-platform list and MundoTip's shape (compose.test.ts), the existing
  `fixtures/brand-profile.{copy-rules,no-rules}.yaml` Copy-step fixtures (unchanged, reused as-is), and
  `mkdtemp`-based temp ledgers/output directories for the output-bundle round-trip tests (mirrors every
  pre-existing `output-bundle.test.ts` pattern — nothing new invented).

### Self-review notes

- Deliberately kept `composeCopy` **completely untouched** rather than reimplementing it in terms of
  `composeCopyForChannels` — a single-Channel Brand's compose path is therefore provably the SAME code
  that ran before this slice, not just behaviorally equivalent new code. The AC1/AC5 regression tests
  assert `deepEqual` against `composeCopy`'s own live result, not a hand-copied expectation, so the two
  can never silently drift apart.
- Considered making `composeCopyForChannels`'s zero-Channel branch just call `composeCopy` directly
  (further reducing duplication), but that would need a slightly different options type dance for no
  real benefit — the inlined 5-line branch is simpler to read and is itself covered by a dedicated
  regression test against `composeCopy`'s live result.
- Considered omitting the primary Channel's own entry from `copy.variants` (since it's already mirrored
  at the top level) to reduce redundancy, but decided against it: the issue asks for the bundle to
  "present each variant labeled by its platform" — a caption.txt that silently treats one platform as
  "the unlabeled default" while labeling the rest would be a worse Operator experience (which platform
  is the unlabeled one?) and would force every reader of `copy.variants` to special-case the primary.
  Keeping `variants` fully self-contained (every targeted platform, primary included) was judged
  simpler and more robust.
- Added new pinned `docs-test` assertions for BOTH doc files this slice edits (`write-social-copy`
  Skill and `producer.md`'s Copy phase) rather than only editing the prose — every new paragraph is
  backed by a real, running assertion, the same discipline the rest of this codebase's doc files
  already follow.
- Ran `git diff src/copy/compose.ts` as the final check before writing this report to confirm
  `composeCopy`'s existing body has zero changed lines (only new code appended after it) — no dead
  code, no unused imports (`tsc --noEmit` clean throughout).

### Known limits

- **Per issue scope, deliberately not built:** LinkedIn `@mention` *resolution* (turning a well-formed
  mention into a real Page handle via `src/linkedin-handle/`) — explicitly issue #130's job. This
  slice's LinkedIn variant is just a normally-composed caption satisfying LinkedIn's #128 bounds; a
  malformed mention's TEXT SYNTAX is still rejected (`validateCopyForPlatform`, already wired by #128),
  but nothing here inserts or resolves a handle.
- **`src/producer/two-recipes-end-to-end.test.ts` was deliberately left untouched**, not rewired onto
  `composeCopyForChannels` — per the proposal's Non-Goals, this is what makes it a clean structural
  regression guard for AC5, but it also means there is no END-TO-END proof (queue → gate → render →
  multi-variant copy → `/log-post`) of the multi-Channel path through that specific tracer. The
  multi-Channel path IS proven end-to-end at the ledger/output-bundle boundary (the new
  `"produce-flow composition, multi-Channel"` test), just not chained through the Space-driver legs —
  consistent with the issue's own scope note that this slice is Copy/ledger/output-bundle code, not a
  Space-driving change.
- **Real per-platform tone variation is the `write-social-copy` Skill's own LLM judgment call**, same as
  every other "grounded, never invented" content decision in this codebase (naming companies, varying
  the CTA). The deterministic test doubles (`defaultDraftCopy`/`skillDraftCopy`) prove the SHAPE
  mechanics (each variant respects its own platform's bounds, genuinely different truncation/emoji
  counts) but do not themselves write creatively different prose per platform — that only happens live,
  in the Operator's session.

---

## QA Verdict — Round 1: PASS

### Suite result

All commands actually run in this worktree (`/Users/CaxtonTaylor/Developer/OrganicGrowth/.claude/worktrees/issue-129-per-channel-copy-variants`, branch `129-per-channel-copy-variants`), real output observed, not assumed:

| Command | Result |
|---|---|
| `npm test` | **1606 passing, 0 failing** (matches Build Report's claimed count exactly) |
| `npm run test:docs` | **133 passing, 0 failing** (matches claimed count) |
| `npx openspec validate --all --strict` | **32 passed, 0 failed** |
| `npx openspec validate 129-per-channel-copy-variants --strict` | `Change '129-per-channel-copy-variants' is valid` |
| `npx tsc --noEmit` | clean, no output |

All green, actually run, not taken on faith.

### Per-criterion results (issue #129 acceptance criteria, verbatim)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `Copy`'s shape supports one variant per targeted platform (single-Channel Brands keep today's one-variant behavior unchanged). | **PASS** | `src/copy/contract.ts` — `Copy.variants?: readonly CopyVariant[]`, additive. `src/copy/compose.test.ts:301-308` asserts `assert.deepEqual(perChannel, plain)` between `composeCopyForChannels` (1 Channel) and `composeCopy`'s own live result — a real regression proof, not a hand-copied expectation. `asset.test.ts:176-180` proves the parse side keeps no `variants` key for a plain raw Copy. |
| 2 | `write-social-copy` composes a distinct caption per targeted platform, each satisfying that platform's #128 CopyShape bounds. | **PASS** | `compose.test.ts:341-472` — 5 variants for Straw Motion's real 5-platform list, primary variant proven to use the Recipe's OWN 180/1-3 shape (never the table's looser 477-char `facebook` entry), each non-primary variant checked against genuinely different caps (X ≤280, TikTok ≤150, Instagram ≤2200, LinkedIn ≤3000, X strictly shorter than LinkedIn on the same input), LinkedIn `@mention` syntax check isolated to only the LinkedIn variant, required CTA/hashtags injected into every variant. `SKILL.md`'s prose is pinned by `write-social-copy-skill.docs-test.ts`'s new describe block (verified passing). |
| 3 | The ledger records all variants on the Asset (ledger-as-source-of-truth, always-rule 7). | **PASS** | `upsertAsset`/`writeAsset` (`src/asset/asset.ts`/`src/asset/store.ts`) do a plain object-spread merge — no field allow-list, so `copy.variants` passes through unmodified; confirmed by reading the code. `output-bundle.test.ts:611-686`'s produce-flow test writes a 3-variant Copy through the REAL `writeAsset` path and reads it back byte-identical via `refreshPostJson`. Also spot-checked against Straw Motion's real production `ledger.json` (see below). |
| 4 | The output bundle (`post.json`/`caption.txt`) presents each variant labeled by its platform, paste-ready. | **PASS** | `captionText` (`src/asset/output-bundle.ts:155-163`) renders each variant under `=== PLATFORM ===`, a blank line, then `renderCaptionBlock`'s clean caption+hashtag block — verified by reading the actual rendered byte string in `output-bundle.test.ts:263-279` and the produce-flow test's literal assertion (`=== FACEBOOK ===` / `=== LINKEDIN ===` / `=== X ===`). Genuinely paste-ready: each block is self-contained (own caption, own hashtags, no leakage — proven by `"each variant's own block never leaks another variant's caption/hashtags"`, `output-bundle.test.ts:281-296`). |
| 5 | A single-Channel Brand's existing produced-Asset behavior is unchanged (regression check against today's wired path). | **PASS** | `git diff -- src/copy/compose.ts` confirms `composeCopy`'s existing body has ZERO changed lines — verified directly, not just claimed. `src/producer/two-recipes-end-to-end.test.ts` has zero diff (`git diff --stat` empty) and still passes inside the full `npm test` run. `compose.test.ts`'s AC1/AC5 deep-equal test (above) plus `output-bundle.test.ts`'s byte-identical-for-empty/absent-variants tests close the loop end to end. |

### Per-scenario results (OpenSpec spec deltas)

**`copy-composition`** (`openspec/changes/129-per-channel-copy-variants/specs/copy-composition/spec.md`):

| Scenario | Verdict | Covering test |
|---|---|---|
| A single-Channel Copy has no variants field | PASS | `compose.test.ts:310-317` |
| A multi-Channel Copy's top-level fields mirror the primary variant | PASS | `compose.test.ts:354-362` |
| A single-(primary)-Channel Brand's result is identical to composeCopy's own result | PASS | `compose.test.ts:301-308` |
| A multi-Channel Brand composes one labeled variant per targeted platform | PASS | `compose.test.ts:342-352` |
| The primary Channel's variant never consults platform-shape.ts's own bounds | PASS | `compose.test.ts:364-382` |
| Each non-primary variant is validated against its own platform's bounds | PASS | `compose.test.ts:384-403` |
| Every targeted platform's failures are collected; a partially-valid Copy is never surfaced | PASS | `compose.test.ts:405-423` |
| A malformed LinkedIn @mention fails only the LinkedIn variant | PASS | `compose.test.ts:425-438` |
| An undocumented platform falls back to the Recipe's own baseShape | PASS | `compose.test.ts:440-460` |
| The Skill instructs one distinct caption per targeted platform | PASS | `write-social-copy-skill.docs-test.ts` (new describe, run confirmed green) |
| The Skill defers LinkedIn @mention resolution to issue #130 | PASS | same file, same describe |

**`asset-store`** (`specs/asset-store/spec.md`):

| Scenario | Verdict | Covering test |
|---|---|---|
| A raw Copy with no variants key parses to the exact pre-#129 shape | PASS | `asset.test.ts:176-180` |
| Well-formed variants parse verbatim, labeled by platform | PASS | `asset.test.ts:182-192` |
| A malformed variant entry is dropped; well-formed siblings are kept | PASS | `asset.test.ts:194-211` |
| A variants array that is entirely malformed degrades to the plain shape | PASS | `asset.test.ts:213-221` |

**`asset-output-bundle`** (`specs/asset-output-bundle/spec.md`):

| Scenario | Verdict | Covering test |
|---|---|---|
| post.json carries every variant, unchanged from the ledger's own Copy | PASS | `output-bundle.test.ts:164-186` (AC3) |
| An Asset's Copy with no variants field yields a post.json copy with no variants key | PASS | `output-bundle.test.ts:188-197` (AC5) |
| captionText renders every variant, labeled by platform, paste-ready | PASS | `output-bundle.test.ts:263-279` |
| An absent or empty variants array renders byte-identical output to before this capability | PASS | `output-bundle.test.ts:245-257` |

**`producer-conductor`** (`specs/producer-conductor/spec.md`): all 4 scenarios (reads full Channel list first; instructs one variant per targeted platform + states single-Channel unchanged; names the two per-variant checkers; output-bundle description states caption.txt labels every variant) — **PASS**, covered by `producer-agent.docs-test.ts`'s new describe block, confirmed passing in the actual `npm run test:docs` run, and spot-checked against the real prose in `.claude/agents/producer.md`'s diff.

### ADDED vs MODIFIED header check

`grep -n "^### Requirement" openspec/specs/*/spec.md` against every one of this slice's 6 new requirement
titles returned **zero matches** — none already exists verbatim in the archived specs, so `ADDED` (never
`MODIFIED`) is the correct header for all of them. Verified directly, not just trusted from the
proposal's own claim of having run this check.

### Always-rules + Magnific-fake checks

| Rule | Verdict | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No publish-path code touched; `SKILL.md`/`producer.md` diffs explicitly restate the human still posts every variant manually. |
| Public-metrics-only / relative-not-absolute | PASS | No metrics/baseline/performance-tracker code touched (confirmed via `git status` file list — none of `src/performance/*` appear). |
| Explicit-attribution | PASS | `src/commands/log-post.ts` and `src/commands/report.ts` do not read `.copy`/`.copy.variants` at all (`grep -n "copy" src/commands/log-post.ts src/commands/report.ts` → no matches) — `post_url` attribution stays keyed on `(idea, recipe)` exactly as before; multiple Copy variants cannot confuse which Asset/Recipe/Idea a Post belongs to because variants live entirely inside the `copy` field, orthogonal to attribution. |
| Ledger-as-source-of-truth | PASS | `upsertAsset` merges via plain object spread (no allow-list, no strip) — `copy.variants` reaches `ledger.json` through the SAME existing write path every other Asset field already uses. `post.json` stays a generated view (`generatePostJson` is pure, no hidden state); confirmed no second, hand-maintained store was introduced. |
| Magnific fake / no live Space calls | PASS | `git diff -- src .claude CONTEXT.md \| grep -in "spaces_\|creations_"` → **zero matches** (checked directly by QA, not just re-run from the Build Report's claim). This slice touches no Space-driving code at all — consistent with the issue's own scope note. |

### Design-decision scrutiny (per the launching agent's specific ask)

**(a) Is "targeted platform = every Channel-list entry" actually documented and justified, not silently assumed?**
Yes. `proposal.md`'s "Design decision: what counts as 'targeted'" section quotes ADR-0019's own
Consequences bullet verbatim ("`#128`/`#129` consume the non-primary entries too, to know which
platforms need a Copy variant") and CONTEXT.md's pre-existing Channel glossary line ("Straw Motion
targets Facebook, Instagram, LinkedIn, X, and TikTok"). I read ADR-0019
(`docs/adr/0019-multi-channel-brand-profile-primary-tracked.md`) directly and confirmed both quotes are
accurate — this is a decision the ADR already made during the earlier #124 grilling, not something this
slice's developer invented under time pressure. I also read both real Brands' actual
`data/brands/{straw-motion,mundotip}/brand-profile.yaml` directly: Straw Motion genuinely lists 5
Channel entries (facebook primary with a real `url`, the other 4 with `url: ""`); MundoTip lists 4. The
consequence (5 / 4 variants going forward) is real and was surfaced prominently in the proposal, not
buried. Judgment: **legitimate, well-documented, traceable to a prior explicit architectural decision —
not a misread.**

**(b) Does the primary Channel's variant stay byte-identical to today's single-`composeCopy` output?**
Yes, proven two ways: (1) `composeCopy`'s function body is verified via `git diff` to have zero changed
lines — it is literally the same code running today. (2) `composeCopyForChannels`'s single-Channel path
is asserted `deepEqual` against a live call to `composeCopy` with the same inputs
(`compose.test.ts:301-308`), so the two can never silently drift — this isn't a hand-maintained
"looks the same" comparison, it's a structural guarantee. `two-recipes-end-to-end.test.ts`, the real
wired-path tracer, is untouched and still green.

**(c) Do old ledger records (pre-shape `{caption, hashtags}`, no `variants` key) still parse correctly?**
Yes — verified directly against real production data, not just the test suite. I ran `parseCopy` from
this branch against Straw Motion's actual `data/brands/straw-motion/ledger.json`: **13 real Copy
records, all 13 parsed to the exact pre-#129 shape** (no `variants` key introduced, nothing dropped,
nothing thrown). MundoTip's ledger currently has 0 Assets with a `copy` field, so nothing to check there
yet. `parseCopyVariants(undefined)` returns `[]`, and `parseCopy` only adds a `variants` key when at
least one entry actually parses — so an old record with no `variants` field at all is structurally
guaranteed to degrade to the old shape, which the source read confirms
(`src/asset/asset.ts:293-301`). This satisfies data-handling rule 4 (defensive parsing) and means
`report`/`log-post`/`track-performance` and any other command reading an old ledger entry is unaffected.

### Defect list

None. No defects found in this round.

### Verdict

**PASS.** All acceptance criteria are proven by real, passing tests (verified by reading the tests, not
just trusting the Build Report's table). All spec-delta Scenarios trace to the issue and pass. The
ADDED-vs-MODIFIED header discipline was followed correctly. The "targeted platform" design decision is a
faithful continuation of an already-accepted ADR, not a misread or a scope-creep invention, and is
prominently documented. The primary-Channel regression is a structural (not just behavioral) guarantee.
Old ledger records parse cleanly under the new code, confirmed against real production data for both
Brands. No live Magnific/Space calls anywhere in the diff. All always-rules hold. This slice is ready for
a PR.
