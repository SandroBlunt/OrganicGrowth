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
