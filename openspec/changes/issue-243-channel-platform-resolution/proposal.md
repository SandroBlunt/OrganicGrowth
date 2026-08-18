## Why

There is no `UNIQUE(brand_id, platform)` on the `channel` table, and #240's importer resolves a Post's
Channel from its URL's **hostname alone** — that only ever narrows a `post_url` to a *platform*
(`facebook`, `instagram`, ...), never to a specific `channel` row. Before this change,
`src/importer/execute.ts`'s `executeChannels` built a `platform -> channelId` **map**: creating a second
Channel on the same platform silently overwrote the first entry, so any Post on that platform would
attach to whichever Channel the map happened to return — the LAST one created, never a decision. Not a
crash: a silent success producing wrong data. Because Performance is measured **per Channel against that
Channel's own baseline** (`relative-not-absolute`), two real Pages collapsing into one Channel would pool
two audiences into one baseline and make every score drawn from it wrong, in a direction nobody would
think to check.

## The fork — decided: SPECIFIC resolution, not a UNIQUE constraint

The issue's own follow-up comment (2026-08-17) already established the feasibility fact this fork turns
on: a Channel carries no `handle` field (`brand-profile.yaml`'s own comment: *"No `handle` field —
LinkedIn `@mention` tagging is a separate lookup"*), but its `url` already carries a usable identifier —
straw-motion's primary `facebook` Channel is `.../profile.php?id=61591885769033`, and that same numeric
id appears in 6 of straw-motion's 7 real logged Post URLs
(`.../permalink.php?story_fbid=...&id=61591885769033`). A Post CAN be matched to a specific Channel by
comparing an identifier extracted from the Post URL against one extracted from each Channel's own `url`.

That tips this decision toward **specific resolution over a `UNIQUE(brand_id, platform)` constraint**:

- **A uniqueness constraint refuses a legitimate shape.** CONTEXT.md's own Channel definition says "A
  Brand may list several" and gives no per-platform cap; the issue itself calls a second Facebook Page
  "an ordinary growth step, not an exotic case" (#129 already shipped per-Channel Copy variants, so
  multi-Channel-per-Brand is a live, exercised shape, not hypothetical). A constraint would make the
  importer REFUSE that Brand shape outright.
- **A constraint does not fix the actual defect.** The defect is that resolution is imprecise, not that
  the schema is too permissive. Even with the constraint in place, resolution would still only ever
  reach "the one Channel on this platform" — it would just never be tested against two, because two
  could never exist. Fixing resolution fixes the real problem; the constraint only hides it behind a
  refusal that a real Brand would hit on an ordinary growth step.

So: `src/importer/resolve-post-channel.ts`'s new `resolvePostChannel` resolves a Post's `post_url` to a
**specific Channel index**, and refuses — never defaults — when it cannot.

## A real-data finding this ticket's design has to account for (not known when the issue was filed)

Straw Motion's real ledger carries **7** `post_url`-bearing Assets. Six use the classic
`permalink.php?...&id=61591885769033` shape and share that Channel's own numeric id verbatim. The
seventh — `idea-2026-W32-10` — is `https://www.facebook.com/122096865609396192/posts/122114019723396192`,
a DIFFERENT Facebook permalink shape whose leading numeric segment is a **different** number
(`122096865609396192`) than the one recorded on that Brand's own configured Channel
(`61591885769033`) — for the same real, single Facebook Page. This is a verified real Facebook quirk (a
Page can expose more than one internally-valid numeric id depending which permalink shape produced the
link), not a data error on either side; #240's own test file already documents this exact URL as "the
real idea-2026-W32-10 shape".

Had this change required an identifier match on *every* resolution, this real, already-correctly-imported
Post would refuse to import — a regression against #240's already-shipped, already-run behavior. The
design below avoids that: **identifier matching only runs when a platform genuinely has more than one
configured Channel.** With exactly one Channel configured for a platform, that Channel is the only
possible answer — nothing to disambiguate, so nothing is checked, and idea-2026-W32-10 keeps resolving
exactly as it does today. Identifier matching (and its refusal path) is reserved for the case this ticket
actually exists to close: 2+ Channels on the same platform.

## What Changes

- **New pure module, `src/importer/resolve-post-channel.ts`** — `resolvePostChannel(postUrl, channels)`:
  - Resolves the platform via the existing `resolvePostPlatform` (unchanged, still hostname-only).
  - Filters the Brand's configured Channels to that platform. Zero matches → refuse (unchanged from
    #240). **Exactly one match → resolve directly, no identifier check** (see the real-data finding
    above for why). **Two or more matches → identifier-matched**, or refuse.
  - `extractChannelIdentifier(platform, url)` — a small, explicit, per-platform rule set (the Facebook
    `id=` query param or its alternate numeric-path-segment permalink shape; YouTube's `@handle` or
    `channel/`/`user/` lookup path; X/TikTok's handle path segment; Instagram/LinkedIn's vanity path,
    excluding their canonical content-only link shapes) that returns `null` — never a guess — for a
    blank/unparseable URL or a shape carrying no owner identifier at all (e.g. a bare
    `youtube.com/watch?v=...` link).
  - A Channel with a blank `url` (four of straw-motion's six) never matches anything: `extractChannelIdentifier`
    returns `null` for a blank string, and a `null` post-identifier or a `null` channel-identifier is
    never treated as a match — a Channel nobody has configured cannot own a Post, exactly per the
    issue's own steer.
- **`src/importer/plan-idea.ts`** — `PlanIdeaDeps.brandChannelPlatforms: ReadonlySet<KnownPlatform>` is
  replaced by `brandChannels: readonly ChannelIdentity[]` (the Brand's FULL Channel list, in creation
  order). `PlannedAsset` gains `postChannelIndex?: number` — the SPECIFIC Channel `resolvePostChannel`
  resolved to, an index into that same list (not a platform lookup). `planAssetPost` now calls
  `resolvePostChannel` and turns any refusal into a named problem, exactly like every other unparseable
  record this importer refuses on.
- **`src/importer/plan.ts`** — no longer builds a derived `Set<KnownPlatform>`; passes the ordered
  `channelPlans` array itself into `PlanIdeaDeps.brandChannels`, since that array's ORDER is now
  load-bearing (it is the same order `executeChannels` creates the real `channel` rows in, so a resolved
  `postChannelIndex` names a valid row at execute time).
- **`src/importer/execute.ts`** — `executeChannels` returns an ordered `readonly string[]` of created
  `channel.id`s (replacing the old `platform -> channelId` Map, which is exactly the shape that
  collapsed two same-platform Channels). The Asset loop resolves `channelId` via
  `channelIds[assetPlan.postChannelIndex]`, throwing the SAME defensive "planImport should have refused
  this plan" internal error when the index is out of bounds or missing — never falling back to "the"
  Channel for the platform.
- **Tests** prove the two-Channels-on-one-platform case at three layers: the new module's own unit tests
  (`resolve-post-channel.test.ts`), `plan-idea.test.ts` (the `planAssetPost` integration point), and
  `plan.test.ts` (a full `planImport` end-to-end mini-repo test) — each covering both the successful
  disambiguation (matches the right one of two) and the refusal (matches neither, matches both, or
  carries no extractable identifier at all).
- **`src/importer/reconcile.ts` is untouched.** No new table, no new entity — the "not counted" prose
  (`brand`, `channel`, `format`, ...) stays accurate as written; this change does not add or remove a row
  from that list.
- **No new migration.** `src/db/schema.ts`/`src/db/migrate.ts` are untouched — this ticket's decision is
  resolution logic, not schema.

## Impact

- **New code:** `src/importer/resolve-post-channel.ts` (+`.test.ts`).
- **Modified code:** `src/importer/plan-idea.ts` (`PlanIdeaDeps`, `PlannedAsset`, `planAssetPost`),
  `src/importer/plan.ts` (drops the derived Set, threads the ordered Channel list), `src/importer/execute.ts`
  (`executeChannels` returns an ordered array; the Asset loop resolves by index), plus each touched
  module's own test file (`plan-idea.test.ts`, `plan.test.ts`, `execute.test.ts`, `reconcile.test.ts` —
  the latter two only for the new `postChannelIndex` field on their hand-built `ImportPlan` fixtures).
- **Untouched (deliberately):** `src/db/schema.ts`/`src/db/migrate.ts` (no new migration —
  specific resolution needs no schema change), `src/importer/resolve-post-platform.ts` (still
  hostname-only platform resolution, unchanged), `src/importer/reconcile.ts` (no new counted entity),
  `src/channel/store.ts` (used exactly as built), `data/brands/*/ledger.json` and `data/queue.json`
  (read-only throughout).
- **Hermetic.** No `magnific`/Zoho MCP tool is imported or called anywhere in this change. Every test is
  either a pure unit test or opens a real, throwaway SQLite file (`withTempDb`, never `:memory:`) / a
  mkdtemp'd mini-repo copy — never the live checkout.
- **Always-rules upheld:** `relative-not-absolute` is what this change directly protects — a Performance
  Score's Channel baseline can no longer silently pool two real audiences into one. `explicit-attribution`
  is strengthened: a Post now names the SPECIFIC Channel it belongs to, never "a" Channel for its
  platform. `ledger-as-source-of-truth`/`generate-never-publish`/`public-metrics-only` are untouched by
  construction (no content-generation, publication, or metrics code in this change).

## Capabilities

### Modified Capabilities

- `importer`: an Asset's `post_url` now resolves to a SPECIFIC Channel (not merely a platform), refusing
  when a Brand's 2+ Channels on the same platform cannot be disambiguated by URL identifier — closing the
  silent-collapse gap #243 exists to fix, while keeping every real Post (including the one whose URL
  carries a different numeric Facebook id than its own Channel's configured `url`) importing exactly as
  it does today.
