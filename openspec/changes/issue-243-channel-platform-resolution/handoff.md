# Slice Handoff — issue #243: A Brand with two Channels on one platform would collapse silently

## Build Report (developer)

### What changed

Before this change, `src/importer/execute.ts`'s `executeChannels` built a `platform -> channelId`
**map**: creating a second Channel on the same platform silently overwrote the first entry, so a Post on
that platform would attach to whichever Channel the map happened to return (the last one created), never
a decision. This change replaces that with **specific resolution**:

- A new pure module, `src/importer/resolve-post-channel.ts`, exports `resolvePostChannel(postUrl,
  channels)`. It resolves the platform (unchanged, via the existing `resolvePostPlatform`), then:
  - **Zero configured Channels for that platform** → refuse (unchanged from #240).
  - **Exactly one configured Channel** → resolve to it directly, no identifier check — this is the
    unambiguous fast path (see "Fork decision" below for why this matters for real data).
  - **Two or more configured Channels** → resolve by matching a platform-specific identifier extracted
    from the Post URL (`extractChannelIdentifier`) against the identifier extracted from each candidate
    Channel's own `url`; refuse — never default — when the identifier can't be extracted, or matches
    zero or more than one candidate.
- `extractChannelIdentifier(platform, url)` is a small, explicit rule per `KnownPlatform`: Facebook's
  `id=` query param or its alternate numeric-path permalink shape; YouTube's `@handle` or `channel/`/
  `user/` lookup path; X/TikTok's handle path segment; Instagram/LinkedIn's vanity path, excluding their
  canonical content-only link shapes (`/p/`, `/reel/`, `/feed/update/...`). Returns `null` — never a
  guess — for a blank/unparseable URL or a shape carrying no owner identifier.
- `src/importer/plan-idea.ts`: `PlanIdeaDeps.brandChannelPlatforms` (a derived `Set<KnownPlatform>`) is
  replaced by `brandChannels: readonly ChannelIdentity[]` — the Brand's FULL, ORDERED Channel list.
  `PlannedAsset` gains `postChannelIndex?: number` — the specific Channel `resolvePostChannel` resolved
  to (an index into that same list, not a platform lookup).
- `src/importer/plan.ts`: drops the derived `Set`; passes the ordered `channelPlans` array itself as
  `brandChannels` — its order is now load-bearing, since it is the SAME order `executeChannels` creates
  the real `channel` rows in.
- `src/importer/execute.ts`: `executeChannels` now returns an **ordered `readonly string[]`** of created
  `channel.id`s instead of a `platform -> id` map. The Asset loop resolves `channelId` via
  `channelIds[assetPlan.postChannelIndex]`, keeping the same defensive "planImport should have refused
  this plan" internal-error throw when the index is missing or out of bounds — never a silent default.

### Fork decision (issue's own ask)

**Decided: specific resolution, not `UNIQUE(brand_id, platform)`.** Argued in full in `proposal.md`;
summary:

- CONTEXT.md's own Channel definition says a Brand "may list several", with no per-platform cap, and
  the issue itself calls a second Facebook Page "an ordinary growth step". A uniqueness constraint would
  make the importer *refuse* that legitimate shape.
- A constraint doesn't fix the actual defect (imprecise resolution) — it just makes the ambiguous case
  impossible to create, which hides the gap behind a refusal a real Brand would hit on an ordinary
  growth step, rather than fixing resolution itself.
- No new migration; `src/db/schema.ts`/`src/db/migrate.ts` are untouched.

**A real-data finding not known when the issue was filed** (see proposal.md's own section on this):
Straw Motion's real ledger carries one Post (`idea-2026-W32-10`,
`https://www.facebook.com/122096865609396192/posts/122114019723396192`) whose URL carries a **different**
numeric Facebook Page id than the one recorded on that Brand's own single configured Channel
(`61591885769033` vs `122096865609396192`) — a verified real Facebook quirk (a Page can expose more than
one internally-valid numeric id depending which permalink shape produced the link), not a data error.
Had this change required an identifier match on *every* resolution, this real, already-correctly-imported
Post would refuse to import — a regression against #240's already-shipped behavior. That is exactly why
identifier matching is scoped to the **ambiguous case only** (2+ Channels on one platform): with exactly
one Channel configured for a platform, there is nothing to disambiguate, so nothing is checked, and this
real Post keeps resolving exactly as it does today. This is demonstrated directly in
`resolve-post-channel.test.ts`'s "resolves the real idea-2026-W32-10 Post even though its identifier does
NOT match the Channel's own url" test, and in the transcript below (Step 1b).

### Files touched

**New:**
- `src/importer/resolve-post-channel.ts` — `resolvePostChannel`, `extractChannelIdentifier`,
  `ChannelIdentity` type.
- `src/importer/resolve-post-channel.test.ts` — 25 unit tests.

**Modified:**
- `src/importer/plan-idea.ts` — `PlanIdeaDeps.brandChannels` (replacing `brandChannelPlatforms`),
  `PlannedAsset.postChannelIndex`, `planAssetPost` now calls `resolvePostChannel`.
- `src/importer/plan.ts` — drops the derived platform `Set`; threads the ordered `channelPlans` array.
- `src/importer/execute.ts` — `executeChannels` returns an ordered array; the Asset loop resolves by
  index, with an updated defensive-error message.
- `src/importer/plan-idea.test.ts` — `fakeDeps` updated for the new shape; new describe block for the
  two-Channels-on-one-platform case at this layer.
- `src/importer/plan.test.ts` — new describe block: full `planImport` end-to-end mini-repo coverage of
  the two-Channels-on-one-platform case (both successful disambiguations, both refusal shapes).
- `src/importer/execute.test.ts` — hand-built `ImportPlan` fixtures gain `postChannelIndex`; a new
  dedicated defensive test for `postUrl` present but `postChannelIndex` missing.
- `src/importer/reconcile.test.ts` — its hand-built `ImportPlan` fixture gains `postChannelIndex` (no
  behavior change in `reconcile.ts` itself — confirmed and stated explicitly, see below).

**New OpenSpec change:**
- `openspec/changes/issue-243-channel-platform-resolution/proposal.md`
- `openspec/changes/issue-243-channel-platform-resolution/tasks.md`
- `openspec/changes/issue-243-channel-platform-resolution/specs/importer/spec.md` (one MODIFIED
  Requirement, extended with 5 new Scenarios covering the two-Channel case; existing Scenarios kept)
- `openspec/changes/issue-243-channel-platform-resolution/handoff.md` (this file)

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-243-channel-platform-resolution
npx tsc -p tsconfig.json --noEmit                                  # typecheck
node --import tsx --test src/importer/resolve-post-channel.test.ts # the new module's own tests
node --import tsx --test src/importer/plan-idea.test.ts src/importer/plan.test.ts \
  src/importer/execute.test.ts src/importer/reconcile.test.ts      # every touched test file
npm test                                                            # full suite (typechecks first)
npm run build                                                       # tsc -p tsconfig.build.json
npm run test:docs                                                   # CONTEXT.md/ADR doc-conformance suite
npx openspec validate issue-243-channel-platform-resolution --strict
npx openspec validate --all --strict
```

**Results (this worktree, 2026-08-18):**
- `npm test`: **3694 tests / 958 suites / 0 fail** (baseline on `cdb68a0` was 3662/953/0 — net +32
  tests, +5 suites, all from this change).
- `npm run build`: clean, no errors.
- `npm run test:docs`: **351 tests / 94 suites / 0 fail**.
- `openspec validate issue-243-channel-platform-resolution --strict`: `Change
  'issue-243-channel-platform-resolution' is valid`.
- `openspec validate --all --strict`: **69 passed, 0 failed** (every existing spec + this change).

### Acceptance-criteria self-assessment

Issue #243's acceptance criteria, mapped to the specific test(s) that prove each:

1. **"Decide and record whether `(brand_id, platform)` should be unique... say which, and why, in the
   proposal."** → `proposal.md`'s "The fork" section: decided specific resolution, with the argument and
   the real-data finding that shaped the design. No test proves a decision document; this is a spec/
   proposal-level acceptance criterion.
2. **"If not unique: `resolve-post-platform.ts` must resolve to a specific Channel... and refuse when it
   cannot, never defaulting."** (Note: the issue names `resolve-post-platform.ts`; the actual new logic
   lives in the sibling module `resolve-post-channel.ts`, since `resolve-post-platform.ts` itself is
   deliberately left untouched — it only ever resolved a *platform*, never a Channel, and #240's own test
   file already documents that scope. `resolve-post-channel.ts` is the module that does the
   Channel-specific work the AC describes.) → proven by:
   - `resolve-post-channel.test.ts`'s entire "TWO Channels on the SAME platform" describe block (7 tests):
     resolves to the specific matching Channel in either direction, refuses on no-match, refuses on
     ambiguous-match, refuses on no-extractable-identifier, refuses when both Channels are blank, never
     lets a blank-url Channel win by default.
   - `plan-idea.test.ts`'s "a Brand with TWO Channels on the same platform resolves specifically, or
     refuses" describe block (2 tests) — the same behavior proven at the `planAssetPost` integration
     point.
   - `plan.test.ts`'s "a Brand with TWO Channels on the same platform resolves each Post specifically, or
     refuses" describe block (4 tests) — the same behavior proven end-to-end through `planImport`.
3. **"Either way, a test must prove the two-Channels-on-one-platform case behaves as decided rather than
   silently collapsing."** → the same 13 tests listed under (2), across all three layers (unit,
   `planAssetPost`, full `planImport`).
4. **"Keep the reconciliation's 'not counted' prose accurate if the entity list changes."** → the entity
   list does NOT change (no new table, no new migration) — `src/importer/reconcile.ts` is untouched; its
   existing prose (naming `channel` among the entities it does not independently count) stays accurate as
   written. `proposal.md`'s "What Changes" section states this explicitly rather than silently skipping
   it (task 5.1).
5. **"Prove it fails... build the two-Channels-on-one-platform case, watch it refuse or resolve as
   decided, then break it on purpose... Paste the transcripts."** → see the transcript below.

### Transcripts (resolve, then break on purpose)

Produced by a temporary demo script (`src/importer/__prove_243_demo.ts`, deleted immediately after
capture — never committed) calling `resolvePostChannel` directly:

```
--- Step 1: single configured Channel — the real straw-motion shape today ---
post_url: https://www.facebook.com/permalink.php?story_fbid=abc&id=61591885769033
configured Channels: [ 'https://www.facebook.com/profile.php?id=61591885769033' ]
result: {"ok":true,"platform":"facebook","channelIndex":0}

--- Step 1b: single configured Channel — the real idea-2026-W32-10 URL, mismatched id, still resolves ---
post_url: https://www.facebook.com/122096865609396192/posts/122114019723396192
configured Channels: [ 'https://www.facebook.com/profile.php?id=61591885769033' ]
result: {"ok":true,"platform":"facebook","channelIndex":0}

--- Step 2a: two Channels — a post_url naming the FIRST Page's id resolves to index 0 ---
post_url: https://www.facebook.com/permalink.php?story_fbid=x&id=61591885769033
configured Channels: [
  'https://www.facebook.com/profile.php?id=61591885769033',
  'https://www.facebook.com/profile.php?id=70000000000000'
]
result: {"ok":true,"platform":"facebook","channelIndex":0}

--- Step 2b: two Channels — a post_url naming the SECOND Page's id resolves to index 1 ---
post_url: https://www.facebook.com/permalink.php?story_fbid=y&id=70000000000000
configured Channels: [
  'https://www.facebook.com/profile.php?id=61591885769033',
  'https://www.facebook.com/profile.php?id=70000000000000'
]
result: {"ok":true,"platform":"facebook","channelIndex":1}

--- Step 3a (BREAK IT): two Channels — a post_url naming a THIRD, unconfigured id must REFUSE, never guess ---
post_url: https://www.facebook.com/permalink.php?story_fbid=z&id=99999999999999
configured Channels: [
  'https://www.facebook.com/profile.php?id=61591885769033',
  'https://www.facebook.com/profile.php?id=70000000000000'
]
result: {"ok":false,"reason":"post_url \"https://www.facebook.com/permalink.php?story_fbid=z&id=99999999999999\" identifier \"99999999999999\" matches none of this Brand's 2 configured \"facebook\" Channels"}

--- Step 3b (BREAK IT): two Channels — a post_url with NO extractable identifier must REFUSE, never default to hostname-only ---
post_url: https://www.facebook.com/watch/?v=123
configured Channels: [
  'https://www.facebook.com/profile.php?id=61591885769033',
  'https://www.facebook.com/profile.php?id=70000000000000'
]
result: {"ok":false,"reason":"post_url \"https://www.facebook.com/watch/?v=123\" carries no extractable facebook identifier, and this Brand has 2 configured \"facebook\" Channels — cannot disambiguate"}
```

Full-pipeline confirmation (`planImport`, never just the pure module) — the `planImport`-level test
output for the four two-Channel scenarios:

```
# Subtest: planImport — a Brand with TWO Channels on the same platform resolves each Post specifically, or refuses
    # Subtest: resolves to the SECOND Channel when the post_url's identifier matches only that one — never the first by default
    ok 1 - resolves to the SECOND Channel when the post_url's identifier matches only that one — never the first by default
    # Subtest: resolves to the FIRST Channel when the post_url's identifier matches that one instead
    ok 2 - resolves to the FIRST Channel when the post_url's identifier matches that one instead
    # Subtest: refuses — never silently collapses to whichever Channel was created last — when the post_url's identifier matches NEITHER configured Channel
    ok 3 - refuses ...
    # Subtest: refuses — never defaults to hostname-only resolution — when the post_url carries no extractable identifier at all
    ok 4 - refuses ...
ok 3 - planImport — a Brand with TWO Channels on the same platform resolves each Post specifically, or refuses
```

### Fakes / fixtures used

- **No Magnific fake needed and none touched.** This change is confined to `src/importer/` (planning/
  execution logic against SQLite) — no `magnific`/Zoho MCP tool is imported or called anywhere in this
  change or its tests. Confirmed by `grep -rn "magnific\|spaces_\|creations_" src/importer/` returning
  nothing new from this change.
- **Real, throwaway SQLite files** (`withTempDb`, never `:memory:`) for `execute.test.ts`/
  `reconcile.test.ts` — matching this codebase's established pattern.
- **mkdtemp'd mini-repo copies** (`withMiniRepo`, `plan.test.ts`'s own established helper) for the
  `planImport` end-to-end tests, including the new two-Channel scenarios — never the shared checkout.
- **Real read-only data**: `plan.test.ts`'s existing structural smoke test against the real
  `data/brands/mundotip`/`data/brands/straw-motion` (unmodified by this change, still green) — proves
  the real single-Channel case is unaffected.
- Nothing in this change reads or writes the shared checkout's `data/organicgrowth.db` or any live
  Brand's real `data/brands/<slug>/` state outside test fixtures.

### Self-review notes

- Removed the derived `Set<KnownPlatform>` (`brandChannelPlatforms`) entirely in favor of passing the
  Brand's already-existing ordered Channel list straight through — one fewer intermediate structure, and
  it removes the exact shape (a per-platform collapse) that caused the bug in the first place.
  `ChannelIdentity` (the new module's own minimal type) is deliberately NOT imported from `plan.ts`'s
  richer `ChannelPlanItem` to avoid a runtime import cycle (`plan.ts` → `plan-idea.ts` →
  `resolve-post-channel.ts` would become `resolve-post-channel.ts` → `plan.ts` → `plan-idea.ts`) — instead
  `ChannelPlanItem` is structurally assignable to the narrower `ChannelIdentity`, so no value import is
  needed in either direction.
- `extractChannelIdentifier` deliberately uses an if/else-if chain (not a `switch`) over the six
  `KnownPlatform` values so every branch's `return` is locally obvious and the function's declared
  `string | null` return type is satisfied without relying on switch-exhaustiveness inference.
- No dead code left behind: `resolvePostPlatform` is unchanged and still the sole platform-resolution
  step; the old `channelIdByPlatform` Map and its `.get(...)` lookup are fully removed, not left
  alongside the new array.
- Every acceptance criterion above maps to a named, currently-passing test — none is asserted only by
  prose.

### Known limits

- **Per-platform identifier coverage is real-Facebook-verified only.** The Facebook rule (`id=` query
  param, or the alternate numeric-path permalink shape) is proven against real Straw Motion data. The
  other five platforms' rules (YouTube `@handle`, X/TikTok handle path, Instagram/LinkedIn vanity path)
  are principled but not yet exercised against any real multi-Channel data for those platforms, since
  neither Brand has 2+ Channels on any non-Facebook platform today. If a real ambiguous case ever arises
  on one of those platforms, `resolvePostChannel` will refuse rather than guess (proven for the general
  "no extractable identifier" / "no match" paths, just not against a *real* URL of that shape yet).
- **Blank-`url` Channels remain permanently unresolvable in the ambiguous (2+) case** — by design (the
  issue's own steer: "a Channel nobody configured cannot own a Post"), but this means an Operator adding
  a second Page and not yet filling in its `brand-profile.yaml` `url` will see every Post to that
  platform refuse to import until the `url` is filled in, even Posts that plainly belong to the
  Original, already-configured Channel — filed as an inherent consequence of the decision, not a bug:
  the single-Channel fast path only helps once a SECOND Channel for that platform exists, at which point
  disambiguation becomes mandatory.
- No new migration and no schema change — if a future ticket ever decides differently (e.g. wants a
  `UNIQUE(brand_id, platform)` constraint after all, on top of specific resolution, for defense in depth),
  that is a distinct, additive migration this change does not attempt.

## QA Verdict — Round 1: FAIL

Verified independently in the worktree
`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-243-channel-platform-resolution` at `e15b8bf`
(base `cdb68a0`). Read `gh issue view 243`, `proposal.md`, `tasks.md`,
`specs/importer/spec.md`, `resolve-post-channel.ts`, `plan-idea.ts`, `plan.ts`, `execute.ts`, and every
touched test file. Ran every command myself; nothing here is taken on the Build Report's word alone.

### Suite result — all green, matches the Build Report exactly

- `npm test` → **3694 tests / 958 suites / 0 fail** (I ran it; baseline on `cdb68a0` is 3662/953/0 —
  confirmed the delta is genuinely **+32 tests / +5 suites**, all from this change: 25 in the new
  `resolve-post-channel.test.ts` (ran it standalone: 25/3/0), +2 new tests/+1 new suite in
  `plan-idea.test.ts`, +4 new tests/+1 new suite in `plan.test.ts`, +1 new test in `execute.test.ts`
  (no new suite), `reconcile.test.ts` fixture-only (0 new tests). 25+2+4+1 = 32; 3+1+1 = 5. Matches.)
- `npm run test:docs` → **351 tests / 94 suites / 0 fail**.
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, no errors.
- `npx openspec validate issue-243-channel-platform-resolution --strict` → `Change
  'issue-243-channel-platform-resolution' is valid`.
- `npx openspec validate --all --strict` → **69 passed, 0 failed**.

### Per-criterion results (issue #243)

1. **"Decide and record whether `(brand_id, platform)` should be unique... say which, and why, in the
   proposal."** → **PASS.** `proposal.md`'s "The fork" section decides specific resolution over a
   uniqueness constraint, with the argument from CONTEXT.md's Channel definition and the real-data
   finding. Documentation-level criterion, no test required.
2. **"If not unique: resolve to a specific Channel by matching the Post URL against the Channel's own
   handle/page identifier, and refuse when it cannot, never defaulting."** → **PASS.** Implemented in
   `src/importer/resolve-post-channel.ts` (the issue names `resolve-post-platform.ts`, which the
   developer correctly notes was never the Channel-resolution module — `resolve-post-platform.ts` is
   confirmed byte-identical to `cdb68a0`, `git diff` empty). Proven by 25 unit tests
   (`resolve-post-channel.test.ts`) + 2 `planAssetPost`-layer tests (`plan-idea.test.ts`) + 4
   `planImport`-layer tests (`plan.test.ts`), covering both successful disambiguation directions and
   both refusal shapes (no match, no extractable identifier).
3. **"A test proves the two-Channels-on-one-platform case behaves as decided, rather than silently
   collapsing."** → **PASS.** Same 13 tests as above across 3 layers.
4. **"The reconciliation's 'not counted' prose stays accurate if the entity list changes."** → **PASS.**
   `src/importer/reconcile.ts` is untouched (`git diff` empty) — `channel` was already named in its
   "not counted" list before this change; no new table/entity was added.

### Per-scenario results (`specs/importer/spec.md`, the one MODIFIED Requirement)

| Scenario | Result | Covering test |
|---|---|---|
| Single configured Facebook Channel resolves directly | PASS | `resolve-post-channel.test.ts` L11-16; `plan-idea.test.ts` L216-238; real-corpus smoke test in `plan.test.ts` L553-594 |
| idea-2026-W32-10 still resolves under the single-Channel fast path despite the mismatched id | PASS | `resolve-post-channel.test.ts` L18-24 — **verified independently against the real ledger, see below** |
| post_url resolving to a platform with zero configured Channels is a refusal | PASS | `resolve-post-channel.test.ts` L32-39; `plan-idea.test.ts` L257-274; `plan.test.ts` L250-279 |
| post_url resolving to no known platform at all is a refusal | PASS | `resolve-post-channel.test.ts` L41-46; `plan-idea.test.ts` L276-288 |
| post_url with no posted_at is a refusal | PASS | `plan-idea.test.ts` L290-302 (pre-existing #240 behavior, unaffected) |
| Two Channels — identifier picks the SECOND one it names | PASS | `resolve-post-channel.test.ts` L55-58; `plan-idea.test.ts` L309-338; `plan.test.ts` L321-332 |
| Two Channels — the OTHER matching identifier resolves to the FIRST | PASS | `resolve-post-channel.test.ts` L60-63; `plan.test.ts` L334-343 |
| Two Channels — identifier matches NEITHER is a refusal | PASS | `resolve-post-channel.test.ts` L65-71; `plan.test.ts` L345-353 |
| Two Channels — no extractable identifier at all is a refusal | PASS | `resolve-post-channel.test.ts` L73-80; `plan.test.ts` L355-360 |
| A blank-url Channel never wins a match by default | PASS | `resolve-post-channel.test.ts` L93-100 |

All 10 Scenarios pass with a real, exercised test — none asserted only by prose.

### Always-rules + Magnific-fake / hermeticity checks

- **No live Magnific/Zoho calls anywhere in this diff.** `grep -in "magnific\|spaces_\|creations_\|apify"` across the full `cdb68a0..HEAD` diff returns hits only inside the Build Report/proposal's own *prose* stating the change is hermetic — zero hits in actual code. Every test uses `withTempDb` (a real, throwaway SQLite file, never `:memory:`) or `withMiniRepo` (a mkdtemp'd copy) — never the live checkout's own `data/organicgrowth.db`. **PASS.**
- **No new migration, no schema change.** `git diff cdb68a0..HEAD -- src/db/schema.ts src/db/migrate.ts` is empty, as claimed. **PASS.**
- **No new runtime dependency.** `git diff cdb68a0..HEAD -- package.json package-lock.json` is empty. **PASS.**
- **`ledger-as-source-of-truth`.** Every write in `execute.ts` (`createChannel`, `createBrand`, `logPost`, etc.) is imported from `src/command-surface/index.ts` — confirmed `createChannel`/`logPost` are re-exported there, never a raw store/SQL bypass. **PASS.**
- **`explicit-attribution`.** A Post now resolves to the *specific* Channel named by its own Operator-logged `post_url`, matched against the Brand's own Operator-configured Channel `url`s — never inferred from anything else. This change **strengthens** this rule versus #240's platform-only resolution. **PASS.**
- **`relative-not-absolute` / `generate-never-publish` / `public-metrics-only`.** Untouched by this change (no scoring, content-generation, or publication code in the diff). **PASS.**

### Real-data finding — independently verified

Read `data/brands/straw-motion/brand-profile.yaml` and `ledger.json` directly myself (not from the Build
Report). Confirmed:
- Straw Motion's `channel` list has exactly **one** `facebook` entry, `url:
  https://www.facebook.com/profile.php?id=61591885769033` — and **4 of its 6** Channels (instagram,
  linkedin, x, tiktok) carry a blank `url`, exactly as claimed.
- `idea-2026-W32-10`'s real `post_url` is `https://www.facebook.com/122096865609396192/posts/122114019723396192`
  — a different numeric Facebook id (`122096865609396192`) than the Channel's own configured
  `61591885769033`. This is real, not a fabricated example. **Claim confirmed.**

### The question I most want answered — and it is a real, undisclosed gap (Defect 1 below)

Traced what happens to `idea-2026-W32-10` the day a second Facebook Channel is configured for Straw
Motion (an event the issue itself calls "an ordinary growth step"):

1. `resolvePostChannel` now takes the `candidates.length >= 2` branch for `facebook`.
2. `extractChannelIdentifier("facebook", "https://www.facebook.com/122096865609396192/posts/122114019723396192")`
   → `"122096865609396192"` (the alternate-permalink numeric segment).
3. That identifier is compared against `extractChannelIdentifier(platform, channel.url)` for **both**
   configured Channels — the original (`61591885769033`) and whatever the second one's `url` is. Neither
   will equal `122096865609396192` in the ordinary case (the Operator has no reason to configure a
   Channel's `url` to Straw Motion's own *alternate* internal Facebook id — the naturally-configured
   `url` is the canonical `profile.php?id=...` one).
4. Result: `matches.length === 0` → **hard refusal**: `"...identifier \"122096865609396192\" matches none
   of this Brand's 2 configured \"facebook\" Channels"`.
5. Because `planImport` collects every problem across both Brands and only returns `ok: true` when
   `problems.length === 0` (`plan.ts` L481-483), this **one** refusal blocks the **entire** one-shot
   import — not just this Post, not just Straw Motion.

This is not a hypothetical corner case: per project memory, the live one-shot import (issue #204) has
**not yet run** in production — it is Operator-gated. The window in which the Operator could add a second
real Facebook Page *before* that live run is open right now. If that happens, the entire import blocks on
exactly the Post this ticket's own single-Channel fast path was built to protect — the protection is a
deferral, not a fix, and it evaporates on the very next legitimate multi-Channel growth step.

I searched the "Known limits" section and `proposal.md` thoroughly: this specific consequence is **not
disclosed**. Two adjacent (but different) limits are disclosed — non-Facebook platforms' identifier rules
being unverified against real ambiguous data, and a blank-`url` second Channel never resolving — but
neither covers this case (here the second Channel's `url` would be *filled in*; the problem is that
`Channel.url` can only carry one identifier string, so there is no way to configure a Channel that
recognizes both of a single real Facebook Page's valid internal ids). There is also no documented recovery
route: the Operator cannot fix this by editing `brand-profile.yaml` (the schema has nowhere to put a
second identifier for one Channel), and editing the ledger's own logged `post_url` to "fix" it conflicts
with treating the Operator's logged URL as the untouched attribution record.

### Defect list

1. **[HIGH] Undisclosed limitation: the single-Channel fast path's protection for `idea-2026-W32-10` (and
   any future Post like it) is a deferral, not a fix, and silently reverts to a hard refusal — blocking
   the entire one-shot import — the moment Straw Motion configures a second Facebook Channel.** Not
   mentioned in "Known limits," and no recovery route is documented or exists in the current Channel
   schema (single `url` string per Channel). This directly contradicts the design's own stated purpose
   (avoiding a regression on this exact real Post) the moment the ordinary-growth scenario the issue
   itself names actually occurs, and the live import this would block (#204) has not yet run.
   **Repro:**
   a. Take a copy of `data/brands/straw-motion/brand-profile.yaml` and add a second `facebook` Channel
      entry with any real `url`, e.g. `https://www.facebook.com/profile.php?id=88888888888888`.
   b. Call `resolvePostChannel("https://www.facebook.com/122096865609396192/posts/122114019723396192",
      [{platform:"facebook", url:"https://www.facebook.com/profile.php?id=61591885769033"},
      {platform:"facebook", url:"https://www.facebook.com/profile.php?id=88888888888888"}])`.
   c. Observe `{ ok: false, reason: '...identifier "122096865609396192" matches none of this Brand's 2
      configured "facebook" Channels' }`.
   d. Note `planImport` (`plan.ts` L481-483) fails the *whole* plan on any single problem — this refusal
      would block importing both Brands entirely, not just this one Post.
   **Requested fix:** at minimum, disclose this explicitly in "Known limits" with a concrete recovery
   route (e.g., how the Operator would actually get `idea-2026-W32-10` importing again once a second FB
   Channel exists); ideally, propose a design mitigation (e.g., a Channel recording a list of known
   alternate identifiers, or an explicit per-Post Channel override) as a scoped follow-up.

2. **[MEDIUM] Test-coverage gap: no test proves the two-Channel case's `postChannelIndex` survives
   `executeChannels`'s array-index lookup all the way to the real `post.channel_id` DB row for a
   *non-zero* index.** `execute.test.ts`'s only Channel-wiring assertion at the DB level
   (`L187-246`) uses exactly one configured Channel (`postChannelIndex: 0`); the 2-Channel case is only
   checked up through `PlannedAsset.postChannelIndex`'s numeric value at the planning layer
   (`plan-idea.test.ts`, `plan.test.ts`), never through `executeImport`'s real `channelIds[index]`
   lookup and the real, persisted `post.channel_id`. I traced `executeChannels`/`channelPlans`/
   `brandChannels` manually and confirmed the array order is consistent end-to-end (same array reference
   threaded from `planBrand` through to `executeChannels`), so I found no actual bug — but per the
   standing lesson from #204/#210, this is exactly the kind of untested wiring seam that hid two prior
   silent defects behind green suites. **Requested fix:** add one `execute.test.ts` case with 2
   same-platform Channels, asserting `post.channel_id` equals the **second** created Channel's real row
   id (not just that `postChannelIndex === 1` at the plan layer).

### Why FAIL rather than PASS-with-notes

Every acceptance criterion, every spec Scenario, the full suite, the build, and both `openspec validate`
runs are genuinely green — this is solid, well-tested work. But Defect 1 is a real, live, high-impact gap
in the deliverable's own honesty: the Build Report's "Known limits" section is exactly the place this
belonged, the developer clearly had every fact needed to state it (they reasoned in detail about the
underlying Facebook quirk), and its absence means the Operator has no warning that the exact scenario
motivating this design will itself defeat that design on the next ordinary step — with the live import
still pending. Per this task's own instruction, this "must not be undiscovered" — since it was not
disclosed, I am sending this back rather than passing it silently forward.

## Build Report — Round 2 (developer)

Both defects fixed. Read the QA Verdict above in full before starting; nothing below reopens or
contradicts Round 1's still-valid work — the fork decision (specific resolution over a uniqueness
constraint) and the base identifier-matching mechanics are unchanged.

### Defect 1 [HIGH] — status: FIXED

**The recovery route, decided and built: a Channel may declare `alternate_urls`.**

- `src/production-spec/brand-profile.ts`: `Channel` gains an OPTIONAL `alternateUrls?: readonly
  string[]`, read from `brand-profile.yaml`'s new per-Channel `alternate_urls` list via a new
  `alternateUrlsFrom` helper (mirrors `bannedWordsFrom`/`requiredHashtagsFrom`'s own defensive
  parsing exactly — non-string/blank entries dropped, a missing/non-array value yields nothing). The
  field is OMITTED (never `[]`) when a Channel configures none, so every pre-existing `deepEqual`
  assertion against a `Channel`/`ChannelPlanItem` literal keeps passing unchanged — no test churn beyond
  what genuinely needed new coverage.
- `src/importer/resolve-post-channel.ts`: `ChannelIdentity` gains the same optional `alternateUrls`.
  A new `channelIdentifiers(platform, channel)` helper returns every identifier a Channel is known to
  answer to — its own `url` PLUS each of its `alternateUrls`, run through the exact same
  `extractChannelIdentifier` rule. The ambiguous (2+ Channels) branch of `resolvePostChannel` now matches
  against `channelIdentifiers(...)` instead of `extractChannelIdentifier(platform, c.channel.url)` alone
  — the ONLY behavioral change to the matching logic itself. The single-Channel fast path is completely
  untouched: `alternateUrls` is never consulted there, because nothing needs disambiguating.
- `src/importer/plan.ts`: `ChannelPlanItem` gains the same optional `alternateUrls`, threaded straight
  through `planBrand`'s Channel-plan-building loop from `loadChannels`'s output — no new I/O, no new
  file read.

**Why this shape** (full argument in `proposal.md`'s new "Round 2" section): it is configurable entirely
via `brand-profile.yaml`, never by editing the Post's own logged `post_url` (the explicit-attribution
record stays untouched); it needs no schema change (`resolvePostChannel` only ever runs at one-shot
import PLAN time — the live `/log-post` path stays file-ledger-only today, confirmed by `grep -rln
"logPost(" src/ | grep -v test` returning only `command-surface/posts.ts` and `importer/execute.ts`);
and it never softens a refusal into a guess — a Post whose identifier still matches nothing, or matches
2+ Channels (e.g. a misconfigured duplicate `alternate_urls` entry), still refuses to resolve to a
specific Channel. Proven by `resolve-post-channel.test.ts`'s "still refuses (ambiguous) when the SAME
alternate id is misconfigured on BOTH Channels" test.

**Whole-plan-vs-per-record — decided: NO, one unresolvable Post must not fail the entire plan.**
`resolvePostChannel`'s result gained a `kind: "unknown-platform" | "no-configured-channel" | "ambiguous"`
discriminant, so this is a SCOPED change, not a blanket softening:

- `kind: "ambiguous"` (the genuine 2+ Channel disambiguation gap — exactly what `alternate_urls` exists
  to close) is now routed by `plan-idea.ts`'s `planAssetPost` to a NEW non-blocking report,
  `PlannedAsset.unresolvedPost`, instead of a blocking `problem`.
- `kind: "unknown-platform"` and `"no-configured-channel"` STAY hard-blocking `problem`s, byte-for-byte
  unchanged from #240's original behavior — no `alternate_urls` configuration could ever fix an
  unrecognized platform or a platform the Brand has literally no Channel for, so softening those too
  would have been unargued scope creep.

`src/importer/plan.ts` surfaces `unresolvedPost` as a THIRD report-only category —
`ImportPlan.unresolvedPosts` — mirroring `deadMediaPaths`/`duplicateJobKeys`'s own established,
already-argued discipline (named on the plan, never blocking, an Operator decision not an import
failure). `src/importer/reconcile.ts` carries it through to `ReconciliationReport.unresolvedPosts` and a
new "Unresolved Posts" Markdown section, and its coverage prose now states explicitly that `Posts
in`/`Posts out` EXCLUDE any Post named there — so this round 2 change cannot itself reproduce issue
#240's own "uncounted category" lesson (a category silently excluded from every count AND never named
anywhere else). This was the one place I checked hardest for a self-inflicted repeat of that exact bug.

**Why "report, don't abort" is the right call, not just a preference:** this is a ONE-SHOT migration
(the production import has not yet run — confirmed still true; `data/organicgrowth.db` in this worktree
is a fresh, empty test artifact, never the live checkout's own database). One ambiguous Post — an
Operator-fixable CONFIGURATION gap, not a corrupt record — holding the entire import hostage for both
Brands is disproportionate, and it directly defeats the single-Channel fast path's own stated purpose
(Defect 1's own framing): a "protection" that takes down everything else the one moment it's actually
needed is not a protection an Operator can rely on.

**Residual case (Known Limits, updated — see below):** if a Post's identifier genuinely matches nothing
configured (no `alternate_urls` entry exists yet, or the Post truly belongs to an unconfigured account),
it stays reported-but-unattributed until the Operator adds the right `alternate_urls` entry. Because the
one-shot importer is NOT re-runnable against an already-populated database (`brand.slug` is `UNIQUE`,
confirmed in `src/db/schema.ts` — a second run would raise a UNIQUE-constraint error, not merge), the
practical recovery window is BEFORE that one run: configure `alternate_urls` first, then run once. If a
Post is discovered unresolved only AFTER the one-shot import has already committed, there is currently no
standalone command to attach a Post to an Asset already in SQL — `logPost` (the command-surface function)
is only ever called by the importer itself today, never by a live command. This is now stated explicitly
in Known Limits below, not left implicit.

### Defect 2 [MEDIUM] — status: FIXED

`src/importer/execute.test.ts` gained a new test, "wires a 2-Channel Brand's postChannelIndex to the
SPECIFIC (non-zero) Channel row", that:

1. Builds a 2-Channel plan (`https://www.facebook.com/acme-first` / `.../acme-second`) with
   `postChannelIndex: 1` (deliberately the SECOND, non-zero index).
2. Runs it through the REAL `executeImport` against a real, throwaway SQLite file (`withTempDb`).
3. Fetches BOTH Channel rows independently, by their own distinct `url` (never assumed, never relying on
   insertion order or a bare `platform = 'facebook'` filter that a 2-row table would make ambiguous).
4. Asserts `post.channel_id` equals the SECOND Channel's own row id, AND asserts it does NOT equal the
   first Channel's row id (`assert.notEqual`) — so a zero-default bug could never pass this test by
   accident, exactly per the requested fix.

**Red → green transcript** (temporarily swapped `postChannelIndex: 1` to `0` in the test's own fixture,
ran the file, confirmed failure, then restored):

```
$ node --import tsx --test src/importer/execute.test.ts   # BROKEN: postChannelIndex: 0 (should be 1)
    # Subtest: wires a 2-Channel Brand's postChannelIndex to the SPECIFIC (non-zero) Channel row — issue #243 round 2's Defect 2 fix (QA round 1)
    not ok 5 - wires a 2-Channel Brand's postChannelIndex to the SPECIFIC (non-zero) Channel row — issue #243 round 2's Defect 2 fix (QA round 1)
      ---
      error: |-
        Expected values to be strictly equal:
        + actual - expected

        + '8fae4c63-742d-47b7-bc7a-7d9f3dd0313b'
        - '9bfc459f-6a44-4839-8005-51d8827e1adf'

      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: '9bfc459f-6a44-4839-8005-51d8827e1adf'
      actual: '8fae4c63-742d-47b7-bc7a-7d9f3dd0313b'
      operator: 'strictEqual'
      ...

$ node --import tsx --test src/importer/execute.test.ts   # RESTORED: postChannelIndex: 1
    # Subtest: wires a 2-Channel Brand's postChannelIndex to the SPECIFIC (non-zero) Channel row — issue #243 round 2's Defect 2 fix (QA round 1)
    ok 5 - wires a 2-Channel Brand's postChannelIndex to the SPECIFIC (non-zero) Channel row — issue #243 round 2's Defect 2 fix (QA round 1)
      ---
      duration_ms: 8.944542
      type: 'test'
      ...
```

The two UUIDs are two REAL, distinct `channel.id` rows in the real SQLite file this test wrote — the
first (`8fae...`) is the FIRST Channel's row, the second (`9bfc...`) is the SECOND's; the broken run
wired the Post to the first when it should have wired it to the second, exactly the off-by-one class of
bug this test now guards against. The fixture change was never committed — `git diff` on
`execute.test.ts` at HEAD carries only the restored, correct `postChannelIndex: 1`.

### Other tests added this round (beyond the two defects' own minimum)

- `resolve-post-channel.test.ts`: a new "alternateUrls give the Operator a configurable recovery route"
  describe block (5 tests) — resolves the REAL `idea-2026-W32-10` shape via an alternate once a second
  Channel exists; proves the SAME scenario refuses WITHOUT the `alternate_urls` entry (isolating that the
  fix is specifically the new field, not a general softening); resolves via the SECOND Channel's own
  alternate; still refuses when the same alternate is misconfigured onto both Channels; confirms
  `alternateUrls` is irrelevant in the single-Channel fast path. Plus `kind` assertions added to every
  existing refusal-shape test (`"no-configured-channel"`, `"unknown-platform"`, `"ambiguous"`).
- `plan-idea.test.ts`: the old "refuses... cannot be matched" test rewritten to prove the new
  non-blocking-report behavior; a new dedicated test proves the "no posted_at" case STILL blocks (the
  data-quality/configuration-gap distinction is itself tested, not just documented); a new test proves
  `alternate_urls` resolution at the `planAssetPost` integration layer.
- `plan.test.ts`: both old ambiguous-case "refuses" tests rewritten to prove `ok: true` +
  `plan.unresolvedPosts` instead; a new end-to-end test proves an unresolved Post on one Idea does NOT
  block a second, resolvable Idea in the SAME Brand (the load-bearing proof for the whole-plan decision);
  a new end-to-end `alternate_urls` success test (the real `idea-2026-W32-10` shape, mini-repo, full
  `planImport`); the real-corpus smoke test gained `plan.unresolvedPosts.length === 0` (both real Brands
  have at most one configured Channel per platform today, so nothing is genuinely ambiguous yet —
  regression coverage for the day that changes).
- `reconcile.test.ts`: `unresolvedPosts` added to the shared fixture; new assertions prove
  `report.unresolvedPosts` carries through, and the Markdown names the section, the record, and the new
  "excludes any Post reported below as unresolved" coverage-prose sentence.
- `brand-profile.test.ts`: a new `alternate_urls` describe block (4 tests) — reads a configured list
  trimmed; omits the key entirely (never `[]`) when unconfigured, so no existing `deepEqual` assertion
  anywhere in this file needed touching; drops non-string/blank entries defensively; a non-array value
  yields no key, never a crash.

### Files touched (round 2, in addition to round 1's list)

**Modified:**
- `src/production-spec/brand-profile.ts` — `Channel.alternateUrls`, `alternateUrlsFrom`,
  `channelsFrom` threads it through (omit-when-empty).
- `src/production-spec/brand-profile.test.ts` — new `alternate_urls` describe block.
- `src/importer/resolve-post-channel.ts` — `ChannelIdentity.alternateUrls`, `channelIdentifiers`,
  `ResolvePostChannelResult`'s new `kind` discriminant (`ResolvePostChannelRefusalKind`).
- `src/importer/resolve-post-channel.test.ts` — `alternateUrls` describe block, `kind` assertions.
- `src/importer/plan-idea.ts` — `PlannedAsset.unresolvedPost`, `planAssetPost` branches on `kind`.
- `src/importer/plan-idea.test.ts` — rewritten ambiguous-case test, new posted_at/alternate_urls tests.
- `src/importer/plan.ts` — `ChannelPlanItem.alternateUrls`, new `UnresolvedPostReport` type,
  `ImportPlan.unresolvedPosts`, `planBrand`/`planImport` thread it through.
- `src/importer/plan.test.ts` — rewritten ambiguous-case tests, new does-not-block/alternate_urls tests,
  real-corpus `unresolvedPosts.length === 0` regression assertion.
- `src/importer/reconcile.ts` — `ReconciliationReport.unresolvedPosts`, new Markdown section, updated
  coverage prose.
- `src/importer/reconcile.test.ts` — `unresolvedPosts` fixture entry + new assertions.
- `src/importer/execute.test.ts` — new Defect 2 test.
- `openspec/changes/issue-243-channel-platform-resolution/proposal.md` — new "Round 2" section (both
  decisions argued), updated Impact/Capabilities.
- `openspec/changes/issue-243-channel-platform-resolution/tasks.md` — new "6. Round 2" section.
- `openspec/changes/issue-243-channel-platform-resolution/specs/importer/spec.md` — the existing
  MODIFIED post_url Requirement extended (alternate_urls + non-blocking ambiguous case, 3 new Scenarios,
  2 Scenarios rewritten); a NEW MODIFIED block for the per-entity-reconciliation Requirement (the
  Posts-in/out exclusion, 1 new Scenario); a NEW ADDED Requirement for the Unresolved Posts report (2
  Scenarios).

**Untouched, confirmed (both rounds):** `src/db/schema.ts`, `src/db/migrate.ts` (`git diff e15b8bf --
src/db/schema.ts src/db/migrate.ts` is empty — migrations 1–4 stay byte-for-byte frozen, no new schema at
all), `package.json`/`package-lock.json` (no new dependency), `src/importer/resolve-post-platform.ts`,
`src/importer/execute.ts` (no code change needed — an unresolved Post already produces no `postUrl` on
its `PlannedAsset`, exactly like an Asset that never carried one; `executeImport`'s existing `if
(assetPlan.postUrl !== undefined)` guard already does the right thing with zero changes), `src/channel/
store.ts`, every real `data/brands/*/brand-profile.yaml` and `data/brands/*/ledger.json` (read-only
throughout — no live Brand's real configuration was edited; only the CODE that lets an Operator configure
`alternate_urls` was built, deliberately, to avoid touching a file shared with other in-flight worktrees).

### How to run (round 2 — same commands as round 1, still accurate)

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-243-channel-platform-resolution
npx tsc -p tsconfig.json --noEmit
node --import tsx --test src/importer/resolve-post-channel.test.ts src/importer/plan-idea.test.ts \
  src/importer/plan.test.ts src/importer/execute.test.ts src/importer/reconcile.test.ts \
  src/production-spec/brand-profile.test.ts
npm test
npm run build
npm run test:docs
npx openspec validate issue-243-channel-platform-resolution --strict
npx openspec validate --all --strict
```

**Results (this worktree, 2026-08-18, round 2):**
- `npm test`: **3708 tests / 960 suites / 0 fail** (round 1 baseline was 3694/958/0 — net **+14 tests,
  +2 suites**, all accounted for: +5/+1 suite `resolve-post-channel.test.ts`, +2/+0 `plan-idea.test.ts`,
  +2/+0 `plan.test.ts`, +1/+0 `execute.test.ts`, +0/+0 `reconcile.test.ts` (assertions added to existing
  tests only, no new `it()`), +4/+1 suite `brand-profile.test.ts`. 5+2+2+1+0+4 = 14; 1+0+0+0+0+1 = 2.
  Matches exactly.)
- `npm run build`: clean, no errors.
- `npm run test:docs`: **351 tests / 94 suites / 0 fail** — unchanged from round 1 (no CONTEXT.md/ADR
  doc touched this round).
- `openspec validate issue-243-channel-platform-resolution --strict`: `Change
  'issue-243-channel-platform-resolution' is valid`.
- `openspec validate --all --strict`: **69 passed, 0 failed**.

### Acceptance-criteria / defect self-assessment (round 2)

1. **Defect 1 [HIGH] — recovery route exists and is proven.** → `resolve-post-channel.test.ts`'s
   "resolves the real idea-2026-W32-10 Post via a Channel's alternate_urls, once a SECOND facebook
   Channel makes it genuinely ambiguous" test (unit layer); `plan.test.ts`'s "resolves via a Channel's
   alternate_urls — the Operator's configurable recovery route" test (full `planImport`, real
   `idea-2026-W32-10`-shaped mini-repo).
2. **Defect 1 [HIGH] — refusal never softens into a guess.** → `resolve-post-channel.test.ts`'s "WITHOUT
   the alternate_urls entry, the same second-Channel scenario refuses (ambiguous)" and "still refuses
   (ambiguous) when the SAME alternate id is misconfigured on BOTH Channels".
3. **Defect 1 [HIGH] — one unresolvable Post does not fail the entire plan.** → `plan.test.ts`'s "an
   unresolved Post on one Idea does not block a SECOND, otherwise-resolvable Idea in the same Brand" —
   asserts BOTH Ideas import, the resolvable one's `postChannelIndex` is unaffected.
4. **Defect 1 [HIGH] — refusal-that-should-stay-blocking stays blocking.** → `resolve-post-channel.test.ts`'s
   `kind` assertions on the `"no-configured-channel"`/`"unknown-platform"` tests; `plan-idea.test.ts`'s
   "still refuses (blocks) when post_url is present but posted_at is missing" test (a different,
   deliberately-untouched blocking path, proven still blocking).
5. **Defect 1 [HIGH] — disclosed in Known Limits with the recovery route spelled out.** → see the updated
   "Known limits" section below, plus `proposal.md`'s "Round 2" section.
6. **Defect 2 [MEDIUM] — a real test proves the 2-Channel index survives to the correct, non-zero
   `post.channel_id` row.** → `execute.test.ts`'s new test, red→green transcript above.

### Self-review notes (round 2)

- Considered making ALL of `resolvePostChannel`'s refusal shapes non-blocking, not just the ambiguous
  case — rejected: `"unknown-platform"`/`"no-configured-channel"` are not what `alternate_urls` exists to
  fix, and softening them too would have been unargued scope creep beyond what QA's Defect 1 actually
  asked for. The `kind` discriminant makes this an explicit, tested boundary rather than an implicit one.
- Considered persisting `alternate_urls` into the SQL `channel` table (a new column) for future-proofing
  against the day `/log-post` moves onto the command surface — rejected for this slice: `resolvePostChannel`
  is exclusively a planning-time concern today (confirmed by grep), so persisting it now would be a
  speculative schema change with no current reader; flagged instead as a Known Limit for a future ticket
  to pick up if/when that day comes.
- Did NOT edit any real Brand's `data/brands/<slug>/brand-profile.yaml` (e.g. proactively adding Straw
  Motion's own real `alternate_urls` entry) — deliberately: that is Brand configuration/content, not
  engineering code, or so the `/build-issue` pipeline's channel boundary treats the Brand's own
  `brand-profile.yaml`; the Operator applies the recovery route once a real second Channel is actually
  configured. This is stated as the concrete recovery route in Known Limits, not silently left undone.
- No dead code: `channelIdentifiers` is the one new matching primitive, used exactly once (inside the
  ambiguous branch); no old code path was left half-migrated.

### Known limits (round 2 — supersedes round 1's version in full)

- **The one-shot importer is not re-runnable against an already-populated database.** `brand.slug` is
  `UNIQUE` (`src/db/schema.ts`) — a second `executeImport` run against the same database raises a
  UNIQUE-constraint error rather than merging or updating. This means `alternate_urls`' practical recovery
  window is BEFORE the one production run: the Operator should configure it in `brand-profile.yaml` ahead
  of that run for any Channel/Post pair known to need it (Straw Motion's own `idea-2026-W32-10` is the one
  concretely known case today — recorded here so the Operator has the exact fix ready:
  `alternate_urls: ["https://www.facebook.com/122096865609396192"]` on that Brand's existing primary
  `facebook` Channel entry, needed ONLY once/if a second Facebook Channel is ever configured for Straw
  Motion). If a Post is discovered unresolved only AFTER the one-shot import has already committed, there
  is currently no standalone command to attach a Post to an already-imported SQL Asset — `logPost` (the
  command-surface function) is called only by the importer itself today. Closing that gap is a distinct,
  future ticket (e.g. exposing a small `resolveUnresolvedPost` command-surface entry point), not attempted
  here — it was out of scope for this defect fix and would itself need its own test-first design.
- **Per-platform identifier coverage is real-Facebook-verified only** (unchanged from round 1) — YouTube/
  X/TikTok/Instagram/LinkedIn's rules are principled but not yet exercised against real ambiguous data on
  those platforms, since neither real Brand has 2+ Channels on any non-Facebook platform today.
- **Blank-`url` Channels remain permanently unresolvable in the ambiguous (2+) case** (unchanged from
  round 1) — by design, an Operator adding a second Page and not yet filling in its `url` (or its
  `alternate_urls`) will see Posts to that platform refuse to resolve until it is filled in.
- **`alternate_urls` is not persisted to the SQL `channel` table** — it lives in `brand-profile.yaml` and
  the in-memory `ChannelPlanItem`/`ChannelIdentity` shapes only, read fresh at each plan. This is
  sufficient because `resolvePostChannel` only ever runs at one-shot-import planning time today (confirmed:
  `grep -rln "resolvePostChannel" src/ | grep -v test` returns only `src/importer/{resolve-post-channel,execute,plan-idea,plan}.ts`).
  If a future ticket wires the live `/log-post` path onto the SQL command surface, that ticket would need
  to decide separately whether `alternate_urls` should persist — a distinct, additive migration this
  change deliberately does not attempt (migrations 1–4 stay byte-for-byte frozen, per the round 2 brief).
- No new migration and no schema change, still — `src/db/schema.ts`/`src/db/migrate.ts` remain untouched
  by both rounds combined.
