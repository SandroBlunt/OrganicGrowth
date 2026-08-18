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

## Round 2 (QA round 1 FAIL — two defects fixed)

QA round 1 found the design above real but incomplete: **Defect 1 [HIGH]** — the single-Channel fast
path's protection for `idea-2026-W32-10` is a *deferral*, not a fix, and reverts to a hard refusal the
day a second Facebook Channel is configured, with no documented (or existing) recovery route, and
`planImport` fails the ENTIRE plan on any one such refusal. **Defect 2 [MEDIUM]** — no test proved the
2-Channel `postChannelIndex` survived `executeChannels`'s array-index lookup to a real, non-zero,
persisted `post.channel_id` row; only manual tracing had confirmed it.

### Defect 1 fix — the recovery route: a Channel declares `alternate_urls`

**Decided: a Channel entry may carry an OPTIONAL `alternate_urls: string[]` list** (`brand-profile.yaml`,
alongside its existing `url`/`primary`) — additional URLs that SAME real account is also known to answer
to. `resolvePostChannel`'s ambiguous (2+ Channels) branch now matches a Post's identifier against a
candidate Channel's `url` **OR any of its `alternate_urls`**, using the exact same `extractChannelIdentifier`
rule for both. This directly closes the gap: the Operator can now describe Straw Motion's real Facebook
quirk (`idea-2026-W32-10`'s Post carries a DIFFERENT valid numeric Page id than the Channel's own `url`)
by adding that id as an `alternate_urls` entry — **before** a second Facebook Channel is ever configured,
so the protection never actually lapses in practice, and again **after**, as an explicit repair.

Why this shape, not something else:
- It is **configurable without editing ledger data** — the Post's own logged `post_url` (the Operator's
  attribution record) is never touched; only `brand-profile.yaml` changes (explicit-attribution).
- It **never softens a refusal into a guess** — `alternate_urls` is exercised through the SAME identifier
  match every other Channel goes through; an unconfigured id still refuses exactly as before. A Post whose
  identifier still matches nothing (or matches 2+ Channels, e.g. a misconfigured duplicate
  `alternate_urls` entry) still refuses to resolve to a specific Channel — proven by
  `resolve-post-channel.test.ts`'s "still refuses (ambiguous) when the SAME alternate id is misconfigured
  on BOTH Channels" test.
- It needs **no schema change** — `alternate_urls` lives entirely in `brand-profile.yaml` and the derived
  `ChannelPlanItem`/`ChannelIdentity` in-memory shapes; `src/db/schema.ts`/`src/db/migrate.ts` are
  untouched, migrations 1–4 stay byte-for-byte frozen (confirmed: `git diff` against both files is empty).
  `resolvePostChannel` is only ever called from the one-shot importer's planning phase today (never from
  the live `/log-post` path, which stays file-ledger-only) — so this is genuinely additive, not a
  retrofit onto a path that would need a persisted column.

### Should one unresolvable Post fail the entire plan? Decided: NO

This ticket's own `#204`-inherited rule — "name the record and refuse, never a silent drop" — is right and
stays. But it does not follow that the whole plan must abort. **Decided: an unresolvable Post (the
`kind: "ambiguous"` refusal only — see below) is now a THIRD report-only category**, `ImportPlan.unresolvedPosts`,
mirroring the two categories this ticket's own module doc comment already names as deliberately
non-blocking: `deadMediaPaths` (AC6) and `duplicateJobKeys` (AC5). The Idea/Asset itself still imports
normally; only that one `post` row is skipped, named by Brand/Idea/Recipe/URL/reason on the plan itself
and on the final reconciliation's new "Unresolved Posts" section — never silently dropped, never blocking.

Why: this is a **one-shot migration** importing potentially hundreds of records across two Brands. One
ambiguous Post — a genuinely Operator-fixable configuration gap, not a corrupt record — holding the ENTIRE
import hostage is disproportionate, and defeats the very purpose a fast path like the single-Channel case
exists to serve (see Defect 1's own framing: the "protection" is meaningless if the day it's actually
needed, it takes down everything else with it). The precedent for exactly this shape of decision
(non-blocking, but never silently dropped) already exists in this same module for two adjacent problems;
extending it a third time is the more consistent design, not a new one.

**This is deliberately SCOPED, not a blanket softening.** `resolvePostChannel`'s failure result now
carries a `kind: "unknown-platform" | "no-configured-channel" | "ambiguous"` discriminant. Only
`"ambiguous"` (the genuine 2+ Channel disambiguation gap this ticket exists to fix) is routed to the
non-blocking `unresolvedPosts` report. `"unknown-platform"` (the URL doesn't name any known platform at
all — no Channel configuration could ever fix that) and `"no-configured-channel"` (the Brand has literally
no Channel for that platform) STAY hard-blocking `problems`, unchanged from #240's original behavior —
these are not what `alternate_urls` exists to solve, and softening them too would be exactly the kind of
un-argued scope creep this ticket must not commit.

### Residual case (Known Limits)

If a Post's identifier genuinely matches none of a Brand's configured Channels' `url`/`alternate_urls` —
because the Post really does belong to an account the Brand hasn't configured at all, or because the
Operator hasn't yet added the right `alternate_urls` entry — it stays unresolved: reported, not refused,
and not attributed to any Channel until the Operator fixes the Brand's `brand-profile.yaml` (add the
missing `alternate_urls` entry) and the record is re-imported. See `handoff.md`'s "Known limits" for the
concrete mechanics of that recovery path, since the one-shot importer itself is not re-runnable against an
already-populated database (a distinct, pre-existing constraint this change does not attempt to lift).

### Defect 2 fix — a real, load-bearing test for the 2-Channel wiring

`execute.test.ts` gained a dedicated test writing a 2-Channel plan through the REAL `executeImport` path
against a real, throwaway SQLite file, resolving `postChannelIndex: 1` (deliberately non-zero), and
asserting `post.channel_id` equals the SECOND Channel's own real row id — fetched independently by each
Channel's distinct `url`, never assumed — while also asserting it does NOT equal the first Channel's row
id. Proven red→green: swapping `postChannelIndex` to `0` fails the assertion (captured in `handoff.md`'s
transcript), confirming the assertion is genuinely load-bearing, not a tautology a bug could still pass.

## Impact

- **New code:** `src/importer/resolve-post-channel.ts` (+`.test.ts`).
- **Modified code (round 1):** `src/importer/plan-idea.ts` (`PlanIdeaDeps`, `PlannedAsset`, `planAssetPost`),
  `src/importer/plan.ts` (drops the derived Set, threads the ordered Channel list), `src/importer/execute.ts`
  (`executeChannels` returns an ordered array; the Asset loop resolves by index), plus each touched
  module's own test file (`plan-idea.test.ts`, `plan.test.ts`, `execute.test.ts`, `reconcile.test.ts` —
  the latter two only for the new `postChannelIndex` field on their hand-built `ImportPlan` fixtures).
- **Modified code (round 2 — the two QA defects):** `src/production-spec/brand-profile.ts`
  (`Channel.alternateUrls`, `channelsFrom`'s new `alternateUrlsFrom`), `src/importer/resolve-post-channel.ts`
  (`ChannelIdentity.alternateUrls`, `channelIdentifiers`, `ResolvePostChannelResult`'s new `kind`
  discriminant), `src/importer/plan.ts` (`ChannelPlanItem.alternateUrls`, the new `UnresolvedPostReport`
  type, `ImportPlan.unresolvedPosts`), `src/importer/plan-idea.ts` (`PlannedAsset.unresolvedPost`,
  `planAssetPost` branches on `kind`), `src/importer/reconcile.ts` (`ReconciliationReport.unresolvedPosts`,
  a new "Unresolved Posts" Markdown section, updated coverage prose) — plus each touched module's own test
  file, and a genuinely NEW `execute.test.ts` case proving the 2-Channel wiring (Defect 2).
- **Untouched (deliberately, both rounds):** `src/db/schema.ts`/`src/db/migrate.ts` (no new migration,
  both rounds — specific resolution AND its `alternate_urls` recovery route need no schema change; every
  migration 1–4 stays byte-for-byte identical, confirmed by `git diff`), `src/importer/resolve-post-platform.ts`
  (still hostname-only platform resolution, unchanged), `src/channel/store.ts` (used exactly as built),
  `data/brands/*/ledger.json`, `data/brands/*/brand-profile.yaml`, and `data/queue.json` (read-only
  throughout — the real Brands' own configuration is never edited by this change; only the CODE that
  would let an Operator configure `alternate_urls` is built).
- **Hermetic.** No `magnific`/Zoho MCP tool is imported or called anywhere in this change. Every test is
  either a pure unit test or opens a real, throwaway SQLite file (`withTempDb`, never `:memory:`) / a
  mkdtemp'd mini-repo copy — never the live checkout.
- **Always-rules upheld:** `relative-not-absolute` is what this change directly protects — a Performance
  Score's Channel baseline can no longer silently pool two real audiences into one. `explicit-attribution`
  is strengthened: a Post now names the SPECIFIC Channel it belongs to, never "a" Channel for its
  platform, and round 2's `alternate_urls` recovery route is deliberately a `brand-profile.yaml`
  configuration change, never an edit to the Post's own logged `post_url` (the Operator's attribution
  record stays untouched). `ledger-as-source-of-truth`/`generate-never-publish`/`public-metrics-only` are
  untouched by construction (no content-generation, publication, or metrics code in this change).

## Capabilities

### Modified Capabilities

- `importer`: an Asset's `post_url` now resolves to a SPECIFIC Channel (not merely a platform), refusing
  when a Brand's 2+ Channels on the same platform cannot be disambiguated by URL identifier — closing the
  silent-collapse gap #243 exists to fix, while keeping every real Post (including the one whose URL
  carries a different numeric Facebook id than its own Channel's configured `url`) importing exactly as
  it does today.
- `importer` (round 2): a Channel may declare `alternate_urls`, giving the Operator a configurable route
  to disambiguate a real account that legitimately answers to more than one URL/id, WITHOUT editing ledger
  data; and a Post that still cannot be resolved to a specific Channel (the genuinely ambiguous case only)
  is reported on the plan's own `unresolvedPosts` and the reconciliation's new "Unresolved Posts" section
  — never silently dropped, but also never blocking the rest of the plan the way it did before.
