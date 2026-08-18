## MODIFIED Requirements

### Requirement: An Asset's post_url resolves to a Channel from its own URL, never assumed, and becomes a Post row

`src/importer/resolve-post-platform.ts`'s `resolvePostPlatform` SHALL determine the platform an Asset's logged `post_url` was published to purely from the URL's own hostname — never assumed from the Brand's primary Channel, never hardcoded to any single platform, and a `post_url` that does not resolve to any of `KNOWN_PLATFORMS` SHALL be a named refusal blocking the plan. `src/importer/resolve-post-channel.ts`'s `resolvePostChannel` SHALL then resolve that Asset's `post_url` to a SPECIFIC Channel among the Brand's Channels configured for that platform — a platform with zero configured Channels SHALL be a named refusal blocking the plan; a platform with exactly ONE configured Channel SHALL resolve to it directly, with no identifier check (unambiguous by construction — the only candidate); a platform with TWO OR MORE configured Channels SHALL be resolved by matching a platform-specific identifier extracted from the Post URL (`extractChannelIdentifier`) against the identifier extracted from a candidate Channel's own `url` OR any of its OPTIONAL `alternate_urls` (`brand-profile.yaml`'s per-Channel escape hatch, issue #243 round 2, for a real account that legitimately answers to more than one URL/id), and, when that identifier cannot be extracted from the Post URL, or matches zero or more than one candidate Channel, that ONE Post SHALL be reported — never silently dropped, but also never blocking the rest of the plan — on `ImportPlan.unresolvedPosts` (see the dedicated Requirement below for the full report-only contract). `src/importer/execute.ts`'s `executeImport` SHALL log each resolved Post through `src/command-surface/index.ts`'s `logPost`, keyed `(asset_id, channel_id)` per ADR-0028, against that SPECIFIC resolved Channel — never a store bypassed, and never merely "a" Channel for the resolved platform.

#### Scenario: a Facebook post_url resolves against the Brand's own single configured Facebook Channel

- **GIVEN** a Brand whose `channel` list includes exactly one `primary: true` `facebook` entry, and an
  Asset whose `post_url` is a `facebook.com` permalink carrying a `posted_at`
- **WHEN** the plan is built and executed
- **THEN** a `post` row exists for that Asset, with `channel_id` referencing the Brand's own `facebook`
  `channel` row — never a hardcoded platform, and no identifier match is required since it is the only
  candidate

#### Scenario: the real idea-2026-W32-10 Post still resolves under the single-Channel fast path despite carrying a different Facebook Page id than its Channel's own configured url

- **GIVEN** a Brand with exactly one configured `facebook` Channel whose `url` carries numeric Page id
  `61591885769033`, and a real logged Post `post_url` of
  `https://www.facebook.com/122096865609396192/posts/122114019723396192` (the alternate Facebook
  permalink shape, carrying a DIFFERENT numeric id for the SAME real Page)
- **WHEN** the plan is built
- **THEN** it still resolves to that one Channel — the single-Channel case never requires an identifier
  match, so this real, correct Post is not regressed by this change

#### Scenario: a post_url resolving to a platform the Brand has no configured Channel for is a refusal

- **GIVEN** an Asset whose `post_url` resolves to `"instagram"` and a Brand whose `channel` list carries
  no `instagram` entry
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea, the Asset, and the unresolved platform

#### Scenario: a post_url that does not resolve to any known platform at all is a refusal

- **GIVEN** an Asset's `post_url` pointing at a host matching none of `KNOWN_PLATFORMS`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the offending URL

#### Scenario: a post_url with no posted_at is a refusal, never a fabricated timestamp

- **GIVEN** an Asset carrying `post_url` but no `posted_at`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea and Asset — no `post` row is ever created with a
  fabricated `posted_at`

#### Scenario: two Channels on the same platform — the post_url's identifier picks the SPECIFIC one it names

- **GIVEN** a Brand configuring TWO `facebook` Channels, each with a distinct numeric Page id in its own
  `url`, and an Asset whose `post_url` carries the SECOND Channel's numeric id in its own `id=` query
  param
- **WHEN** the plan is built
- **THEN** the Asset resolves to the SECOND Channel specifically (never the first, never whichever was
  created last) — proven by its resolved Channel index, not merely by platform

#### Scenario: two Channels on the same platform — the OTHER Channel's own matching identifier resolves to it instead

- **GIVEN** the same Brand as above, but a second Asset whose `post_url` carries the FIRST Channel's
  numeric id instead
- **WHEN** the plan is built
- **THEN** that Asset resolves to the FIRST Channel specifically

#### Scenario: two Channels on the same platform — an identifier matching NEITHER configured Channel is reported and deferred, never silently picked and never blocking the plan (issue #243 round 2)

- **GIVEN** a Brand configuring TWO `facebook` Channels, and an Asset whose `post_url` carries a numeric
  id matching neither Channel's own `url` nor any of their `alternate_urls`
- **WHEN** `planImport` runs
- **THEN** the plan still succeeds (`ok: true`) — this one Asset carries no `postUrl`/`postChannelIndex`
  and is named, by Brand/Idea/Recipe/URL/reason, on `plan.unresolvedPosts` — no `post` row is ever
  created against a guessed Channel, and no OTHER Idea, Asset, or Brand in the plan is affected

#### Scenario: two Channels on the same platform — a post_url with no extractable identifier at all is reported and deferred, never a hostname-only default and never blocking the plan (issue #243 round 2)

- **GIVEN** a Brand configuring TWO `facebook` Channels, and an Asset whose `post_url` is a Facebook
  link shape that carries no owner-identifying segment at all (e.g. a bare `watch/`-shaped link)
- **WHEN** `planImport` runs
- **THEN** the plan still succeeds, this Asset is named on `plan.unresolvedPosts` stating that
  resolution cannot disambiguate — never falling back to the hostname-only resolution this change
  replaced, and never aborting the rest of the plan over this one record

#### Scenario: a Channel with a blank url never wins a match by default

- **GIVEN** a Brand configuring TWO Channels on the same platform, one with a real `url` and one with a
  blank `url` (an added-but-not-yet-configured second Page), and a Post whose identifier matches the
  configured one
- **WHEN** the plan is built
- **THEN** it resolves to the configured Channel specifically — the blank-`url` Channel is never treated
  as a match, since a Channel nobody has configured cannot own a Post

#### Scenario: a Channel's alternate_urls resolves a Post whose identifier matches only an alternate, not the Channel's own url (issue #243 round 2 — the Operator's configurable recovery route)

- **GIVEN** a Brand configuring TWO `facebook` Channels, the FIRST also declaring an `alternate_urls`
  entry, and an Asset whose `post_url` identifier matches that alternate rather than the first Channel's
  own `url`
- **WHEN** the plan is built
- **THEN** the Asset resolves to the FIRST Channel specifically — the same `extractChannelIdentifier`
  rule is applied to `alternate_urls` as to `url` itself, and this is checked ONLY in the ambiguous (2+
  Channels) case, never in the single-Channel fast path

#### Scenario: two Channels on the same platform — a resolvable Post is unaffected by an unrelated unresolved Post elsewhere in the same Brand

- **GIVEN** a Brand configuring TWO `facebook` Channels, with one Idea's Asset carrying a `post_url`
  matching NEITHER Channel and a second, unrelated Idea's Asset carrying a `post_url` that resolves
  cleanly to the FIRST Channel
- **WHEN** the plan is built
- **THEN** the plan succeeds, BOTH Ideas import, the first Asset carries no `postUrl`/`postChannelIndex`
  and is named on `plan.unresolvedPosts`, and the second Asset resolves its `postChannelIndex` normally
  — one unresolvable Post never prevents an otherwise-good Idea/Asset from importing

### Requirement: the run ends with a per-entity reconciliation — counts in versus counts out, for both Brands

`src/importer/reconcile.ts`'s `buildReconciliation` SHALL compute, per Brand and in total, the count of Ideas, Assets, Jobs, and Posts the plan says should exist ("counts in") alongside a REAL query against the database after `executeImport` ran ("counts out" — never an echo of the plan's own numbers), plus the dead-media-paths, duplicate-job-identity-keys, and (issue #243 round 2) unresolved-Posts reports. A Post named on the unresolved-Posts report SHALL be excluded from BOTH `Posts in` and `Posts out` — never folded into either count, since no `post` row is ever created for it and its own Idea/Asset otherwise import normally. `formatReconciliationMarkdown` SHALL render this as human-readable Markdown suitable for posting on the tracked issue, and SHALL state, in prose on the report itself, exactly which entities this reconciliation counts and cross-checks (Ideas, Assets, Jobs, Posts), which it does not (at minimum: Brand, Channel, Format, Run, Trend, `idea_recipe`, `asset_media`, `gate_request`, `copy_variant`, `metric_snapshot`, `performance_score`, `channel_baseline`, `brand_asset`, `baseline_prompt`), and that the Posts columns exclude any Post named on the Unresolved Posts section below them — so a category never named, or an exclusion never explained, can never again be mistaken for one this report has verified or accounted for.

#### Scenario: counts in and counts out match after a clean import

- **GIVEN** a plan that executes cleanly
- **WHEN** the reconciliation is built
- **THEN** every Brand's Ideas/Assets/Jobs/Posts counts-in equal its counts-out, and the totals equal 61
  Ideas, 54 Assets, 66 jobs, and 7 Posts for the real corpus

#### Scenario: a mismatch between counts in and counts out is visible, never hidden

- **GIVEN** a plan whose `executeImport` was never actually run against the database being reconciled
- **WHEN** the reconciliation is built
- **THEN** counts-out is zero while counts-in reflects the plan — the mismatch is directly visible in
  the report, not silently reconciled away

#### Scenario: the report states what it does and does not cover, in prose, on the report itself

- **GIVEN** any built reconciliation report
- **WHEN** it is rendered to Markdown
- **THEN** it names Ideas, Assets, Jobs, and Posts as the entities it counts and cross-checks, and
  separately names at least one entity it creates but does NOT independently count (e.g.
  `channel_baseline`) — so a reader of the report alone, not just this file's source, can see the
  boundary of what a clean reconciliation actually proves

#### Scenario: an unresolved Post is excluded from Posts in/out and named instead in its own Unresolved Posts section (issue #243 round 2)

- **GIVEN** a plan carrying one unresolved Post (a `post_url` `resolvePostChannel` could not resolve to
  a specific Channel) alongside otherwise-normal Ideas/Assets/Jobs/Posts
- **WHEN** the reconciliation is built and rendered to Markdown
- **THEN** the unresolved Post is NOT counted in either `Posts in` or `Posts out`, is named by
  Brand/Idea/Recipe/URL/reason in a dedicated "Unresolved Posts" section, and the report's own prose
  states this exclusion explicitly

## ADDED Requirements

### Requirement: Unresolved Posts (a Channel-ambiguous post_url) are reported for an Operator decision, never silently dropped, and never block the rest of the plan

`src/importer/plan-idea.ts`'s `planAssetPost` SHALL treat a `resolvePostChannel` refusal whose `kind` is `"ambiguous"` (2+ Channels configured for the resolved platform, and identifier matching — including any Channel's `alternate_urls` — could not pick exactly one) as a NON-blocking report, never a `problem` that fails the plan: the Asset carries no `postUrl`/`postChannelIndex` and instead is named, by Brand/Idea/Recipe/`post_url`/reason, on `src/importer/plan.ts`'s `ImportPlan.unresolvedPosts`, mirroring `deadMediaPaths`/`duplicateJobKeys`'s own report-only discipline. A `resolvePostChannel` refusal whose `kind` is `"unknown-platform"` or `"no-configured-channel"` SHALL remain a BLOCKING `problem`, unchanged from this capability's pre-round-2 behavior — these are not the Channel-configuration ambiguity `alternate_urls` exists to resolve.

#### Scenario: a genuinely ambiguous Post is reported, and the rest of the plan still succeeds

- **GIVEN** a Brand with 2+ Channels on one platform and an Asset whose `post_url` identifier matches
  neither Channel's `url` nor `alternate_urls`
- **WHEN** the plan is built
- **THEN** `planImport` returns `ok: true`, that one Asset appears on `ImportPlan.unresolvedPosts` by
  name, and every other Idea/Asset/Brand in the plan is unaffected

#### Scenario: an unknown platform or a Brand with zero configured Channels for a platform STAYS a blocking refusal

- **GIVEN** an Asset whose `post_url` either resolves to no known platform at all, or resolves to a
  platform the Brand has no configured Channel for
- **WHEN** the plan is built
- **THEN** `planImport` returns `ok: false`, naming the record — this is NOT routed to
  `ImportPlan.unresolvedPosts`, since no `alternate_urls` configuration could ever fix either case
