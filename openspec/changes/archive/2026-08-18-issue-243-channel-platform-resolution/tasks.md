## 1. Ground the build — read before writing any code

- [x] 1.1 Read issue #243's body AND its 2026-08-17 comment (the feasibility note the fork turns on);
  confirm its blocker #240 is merged.
- [x] 1.2 Read `src/importer/resolve-post-platform.ts`, `src/importer/plan-idea.ts`'s `planAssetPost`,
  `src/importer/execute.ts`'s `executeChannels`/Asset loop — the exact code #240 shipped that collapses
  two Channels on the same platform to a `platform -> channelId` map.
  `src/production-spec/brand-profile.ts`'s `Channel`/`loadChannels` — confirm no `handle` field exists,
  `url` is the only usable identifier.
- [x] 1.3 Inspect the real `data/brands/straw-motion/ledger.json` and `brand-profile.yaml`: confirm the 7
  real `post_url`s' exact shapes and each Channel's configured `url`. Found: 6 of 7 share the Channel's
  own numeric Facebook id; the 7th (`idea-2026-W32-10`) uses a DIFFERENT Facebook permalink shape with a
  DIFFERENT numeric id for the SAME real Page — a fact the fork's design has to survive (see
  `proposal.md`).
- [x] 1.4 Decide the fork (specific resolution, not `UNIQUE(brand_id, platform)`) and write the argument
  into `proposal.md`, including the real-data finding above and how the design accounts for it.

## 2. Pure deep module (test-first)

- [x] 2.1 `src/importer/resolve-post-channel.ts` (+`.test.ts`) — `resolvePostChannel`: unambiguous when
  exactly one Channel is configured for the resolved platform (no identifier check); identifier-matched,
  or refused, when 2+ Channels share a platform. `extractChannelIdentifier`: one rule per `KnownPlatform`,
  covering the real Facebook `id=` param + its alternate numeric-path shape, YouTube's `@handle`/
  `channel`/`user` paths, X/TikTok's handle path, Instagram/LinkedIn's vanity path vs canonical
  content-only link shapes, and blank/unparseable URLs.
- [x] 2.2 Unit-test the two-Channels-on-one-platform case directly: resolves to whichever of the two
  matches by identifier; refuses (never picks) when the identifier matches neither, matches both, or
  cannot be extracted at all; a blank-`url` second Channel never "wins" a match by default.
- [x] 2.3 Unit-test the real `idea-2026-W32-10` shape explicitly: with only ONE Channel configured, it
  still resolves — proving the single-Channel fast path is what keeps this real Post importing despite
  its non-matching identifier.

## 3. Wire specific resolution through planning (test-first)

- [x] 3.1 `src/importer/plan-idea.ts` — `PlanIdeaDeps.brandChannelPlatforms` (a derived
  `Set<KnownPlatform>`) replaced by `brandChannels: readonly ChannelIdentity[]` (the Brand's full,
  ORDERED Channel list). `PlannedAsset` gains `postChannelIndex?: number`. `planAssetPost` calls
  `resolvePostChannel`, turning a refusal into a named problem exactly like every other unparseable
  record.
- [x] 3.2 `src/importer/plan.ts` — drop the derived `brandChannelPlatforms` Set; thread the ordered
  `channelPlans` array itself into `PlanIdeaDeps.brandChannels`.
- [x] 3.3 `src/importer/plan-idea.test.ts` — update `fakeDeps` for the new shape; add the
  two-Channels-on-one-platform case at this layer (resolves the right index; refuses on ambiguity).
- [x] 3.4 `src/importer/plan.test.ts` — add a full `planImport` end-to-end mini-repo test: two Facebook
  Channels, a Post resolving to each in turn, and both refusal shapes (matches neither; carries no
  extractable identifier).

## 4. Wire specific resolution through execution (test-first)

- [x] 4.1 `src/importer/execute.ts` — `executeChannels` returns an ORDERED `readonly string[]` of created
  `channel.id`s (never a `platform -> id` map). The Asset loop resolves `channelId` via
  `channelIds[assetPlan.postChannelIndex]`, keeping the same defensive internal-error throw (never a
  silent default) when the index is missing or out of bounds.
- [x] 4.2 `src/importer/execute.test.ts` — update the hand-built `ImportPlan` fixtures to carry
  `postChannelIndex`; add a dedicated defensive test for `postUrl` present but `postChannelIndex` absent.
- [x] 4.3 `src/importer/reconcile.test.ts` — update its hand-built `ImportPlan` fixture for the new field
  (no behavior change in `reconcile.ts` itself — confirmed not needed).

## 5. Full-suite regression + OpenSpec + self-review + Build Report

- [x] 5.1 Confirm `src/importer/reconcile.ts`'s "not counted" prose needs no edit (no entity added/
  removed by this change) — state this explicitly in `proposal.md` rather than silently skipping it.
- [x] 5.2 Author `proposal.md`, this `tasks.md`, and the `importer` capability's spec delta
  (`specs/importer/spec.md`) — one MODIFIED requirement (matching the LIVE spec's wording verbatim
  before extending it) plus an ADDED requirement for the two-Channels-on-one-platform case. Run
  `openspec validate --strict` until green.
- [x] 5.3 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run build`, `npm run test:docs` —
  green, at/above the 3662/953/0-fail baseline.
- [x] 5.4 Self-review pass: confirm every issue #243 acceptance criterion maps to a specific test; remove
  any dead code/unused exports/imports.
- [x] 5.5 Write the Build Report into `handoff.md`, including the required transcripts (resolve, then
  break on purpose and confirm refusal).

## 6. Round 2 — fix QA round 1's two defects

- [x] 6.1 [HIGH] Give the Operator a documented, configurable recovery route for the day a second
  same-platform Channel is configured and the single-Channel fast path stops protecting a real Post whose
  URL carries an alternate valid id: `Channel.alternateUrls` (`brand-profile.yaml`'s `alternate_urls`),
  threaded through `ChannelPlanItem`/`ChannelIdentity`, checked by `resolvePostChannel`'s ambiguous-case
  identifier match alongside a Channel's own `url`. Additive only — `src/db/schema.ts`/`src/db/migrate.ts`
  untouched, migrations 1–4 stay byte-for-byte frozen.
- [x] 6.2 [HIGH] Decide and implement whether one unresolvable Post should fail the entire plan: NO —
  scoped EXACTLY to the genuine `kind: "ambiguous"` refusal (never `"unknown-platform"`/
  `"no-configured-channel"`, which stay blocking). `resolvePostChannel` gains a `kind` discriminant;
  `plan-idea.ts`'s `planAssetPost` routes `"ambiguous"` to a new NON-blocking `unresolvedPost` report
  instead of a blocking `problem`; `plan.ts` surfaces it as a third report-only category,
  `ImportPlan.unresolvedPosts`, alongside `deadMediaPaths`/`duplicateJobKeys`; `reconcile.ts` carries it
  through to a new "Unresolved Posts" Markdown section and updates its "Posts in/out" coverage prose to
  state the exclusion explicitly (never silently re-creating issue #240's own "uncounted category" gap).
- [x] 6.3 Tests: `resolve-post-channel.test.ts` gains an `alternateUrls` describe block (resolves via a
  first/second Channel's alternate, still refuses on a misconfigured duplicate alternate, alternates are
  irrelevant in the single-Channel fast path) plus `kind` assertions on every refusal-shape test.
  `plan-idea.test.ts`'s and `plan.test.ts`'s prior "refuses" tests for the ambiguous case are rewritten to
  prove the new non-blocking-report behavior instead (never simply relaxed/deleted); `plan.test.ts` gains
  a dedicated "one unresolved Post does not block a second, resolvable Idea in the same Brand" test and an
  `alternate_urls` end-to-end success test; the real-corpus smoke test gains a `plan.unresolvedPosts.length
  === 0` regression assertion. `brand-profile.test.ts` gains a dedicated `alternate_urls` describe block.
- [x] 6.4 [MEDIUM] Defect 2: `execute.test.ts` gains a dedicated 2-Channel test writing through the REAL
  `executeImport` path against a real, throwaway SQLite file, asserting `post.channel_id` equals the
  SECOND Channel's own real row id (deliberately non-zero `postChannelIndex: 1`) — fetched independently
  by each Channel's distinct `url`, never assumed. Proven red→green by temporarily swapping
  `postChannelIndex` to `0`, confirming the assertion fails, then restoring it — transcript in
  `handoff.md`'s Round 2 Build Report.
- [x] 6.5 Update `proposal.md`'s "Round 2" section (both decisions argued explicitly, including the
  whole-plan-vs-per-record question), `specs/importer/spec.md` (the MODIFIED post_url Requirement extended
  for `alternate_urls` + the non-blocking ambiguous case; a NEW Requirement for the Unresolved Posts
  report, mirroring Dead-media-paths/Duplicate-job-keys; the per-entity-reconciliation Requirement
  MODIFIED for the new Posts-in/out exclusion). Run `openspec validate --strict` until green.
- [x] 6.6 Re-run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run build`, `npm run test:docs` —
  green, at/above the Round 1 baseline (3694/958/0).
- [x] 6.7 Append a `Round 2 Build` block to `handoff.md` (never overwrite Round 1's Build Report or QA
  Verdict) covering both defects, the recovery-route argument, the whole-plan decision, both red→green
  transcripts, and updated suite numbers.
