## Why

`trend-scout` and `performance-tracker` only actually work against **Facebook** today — it's the only
platform with verified Apify actor slugs (`data/brands/<slug>/seeds.yaml`'s `apify` block).
`instagram` is modeled as a `platform` value (`BrandInterviewAnswers`,
`src/brand/scaffolder.ts`) but its actor slugs are the `"..."` placeholder; `youtube` isn't modeled as
a `platform` value at all. This surfaced concretely while onboarding the Brand "Straw Motion"
(`data/brands/straw-motion/`): its two named competitors are Instagram accounts and its third is a
YouTube channel, none of which `trend-scout` could scrape — only Straw Motion's own Facebook Page (via
curated-newsletter mode) was usable in the meantime.

Post-issue-#53, a Format's trend sources and peer-vs-curated mode live on its own file
(`data/brands/<slug>/formats/<format>.yaml`, `src/format/store.ts`) — separate from the per-platform
Apify actor configuration, which stays on `seeds.yaml` (`apify.<platform>.trends_actor`/`post_actor`).
A Format's peer sources can therefore span more than one platform even though a Brand has exactly one
Channel platform (e.g. Straw Motion's Channel is Facebook, but its recorded peers are Instagram and
YouTube) — so the platform used to pick an Apify actor must be derived from each source/post URL
itself, never assumed from the Format's or the Brand's own Channel platform.

## What Changes

- **Verify and wire real Apify actors** for Instagram (`apify/instagram-scraper` for a peer profile's
  recent posts, `apify/instagram-post-scraper` for one post's public metrics) and YouTube
  (`streamers/youtube-scraper`, which accepts either a channel URL or a single video URL — used for
  both jobs). Verified against live runs on the Operator's own Apify account (small, cheap runs — 2–3
  items — against real public accounts already recorded in `data/brands/straw-motion/seeds.yaml`'s
  competitor list); sanitized sample outputs are captured as test fixtures
  (`src/apify/fixtures/*.sample.json`, `src/apify/fixtures/README.md`).
- **Add `youtube` as an accepted `platform` value end-to-end**: `BrandInterviewAnswers.platform`
  (`src/brand/scaffolder.ts`), `buildBrandProfile`, `buildSeeds` (verified actor pair, not a
  placeholder), the `/run-pipeline` onboarding conductor's platform re-ask loop
  (`src/commands/run-pipeline.ts`), and the `brand-profile.yaml`/`seeds.yaml` skeleton templates.
  `buildSeeds` also gains the verified Instagram actor pair (replacing its previous `"..."`
  placeholder) — LinkedIn remains the one placeholder platform (no verified actor yet).
- **Add two pure deep modules** (`src/apify/`, new capability): `platform.ts`
  (`detectPlatformFromUrl` — derives a platform from a URL's hostname; `resolveApifyActor` — reads
  `apify.<platform>.<purpose>` from an already-parsed `seeds.yaml` object defensively, returning `null`
  for a missing/placeholder actor rather than fabricating one) and `normalize-metrics.ts`
  (`mapInstagramItem`/`mapYoutubeItem` — defensive field mapping from a raw Apify dataset item to the
  four Performance metrics: shares/comments/reactions/views, with missing/invalid numeric fields
  defaulting to 0 and noted, per data-handling rule 4). Neither platform publicly exposes a share
  count, so `shares` is always 0 for Instagram/YouTube items — noted, never fabricated.
- **Update `trend-scout.md` and `performance-tracker.md`** (prompt-driven content agents) to detect
  each source/post URL's platform from its own domain and use the matching `apify.<platform>.*`
  actor — documenting the verified Instagram/YouTube actors, the curl invocations, and the defensive
  field-mapping table (mirroring `normalize-metrics.ts`'s logic in prose, since these agents have no
  compiled-TS execution path — Read/Bash/WebFetch only). A source/post on a platform with no wired
  actor (LinkedIn today) is reported as blocked and skipped, never fabricated.
- **Update `templates/brand-skeleton/seeds.yaml`** to document the Instagram and YouTube actor blocks
  the same way it already documents Facebook's (uncommented, real slugs); LinkedIn stays a
  commented-out roadmap placeholder.
- **Update `data/brands/straw-motion/seeds.yaml`** with the same verified `apify.instagram`/
  `apify.youtube` blocks (the motivating real data for this issue) and correct its and
  `formats/unhypped-news.yaml`'s stale "not yet usable — see issue #48" comments. The Format's
  `sources.mode` stays `curated` — switching to peer-scrape mode for a Format that already runs
  successfully in curated mode is an editorial/Operator decision, not made by this slice.
- **Update `CONTEXT.md`/`CLAUDE.md`'s platform enumeration** (`Facebook, Instagram, or LinkedIn` →
  `Facebook, Instagram, YouTube, or LinkedIn`) and CONTEXT.md's "platform" flagged ambiguity to state
  Facebook/Instagram/YouTube are verified (LinkedIn is the one remaining roadmap platform) and that a
  source's/Post's platform is derived from its own URL.

## Non-Goals (explicitly out of scope)

- **LinkedIn** stays unverified (`"..."` placeholder) — no Apify actor was researched/verified for it
  in this slice.
- **The trend-scout/idea-strategist over-performance formula itself** is unchanged — only the
  per-platform actor selection and field mapping that feeds it. `src/apify/` does not implement a
  "compute over-performance"/baseline module; that reasoning is (and remains) the agent's own, exactly
  as it already is for Facebook.
- **`performance-tracker.md`'s pre-existing per-Idea `post_url`/`status` framing** predates the
  per-Asset ledger re-grain (ADR-0011, issues #55–#58) and was not migrated by that epic either; this
  slice layers multi-platform actor selection on top of that existing (unmigrated) framing without
  attempting the separate, larger Asset-grain migration for this agent — out of scope here (see the
  handoff's Known Limits).
- **Switching Straw Motion's `unhypped-news` Format from curated to peer-scrape mode** is not done —
  the actors are now wired so the Operator *can* switch later, but this slice does not make that
  editorial call.
- **No live Magnific Space call of any kind** — this slice touches Apify only.

## Capabilities

### Added Capabilities

- `apify-platform-integration`: platform detection from a URL (`detectPlatformFromUrl`), defensive
  Apify actor slug resolution from `seeds.yaml` (`resolveApifyActor`), defensive Instagram/YouTube
  field mapping into the four Performance metrics (`mapInstagramItem`/`mapYoutubeItem`), `youtube` as
  an accepted `platform` value with a verified actor pair (Instagram gains one too), and the
  `trend-scout`/`performance-tracker` prompt updates + template documentation that put all of the
  above to use.

## Impact

- **New code:** `src/apify/platform.ts` (+ test), `src/apify/normalize-metrics.ts` (+ test),
  `src/apify/apify-docs.test.ts`, `src/apify/fixtures/*.sample.json` (+ `README.md`).
- **Modified code:** `src/brand/scaffolder.ts` (+ test), `src/brand/scaffold-brand.test.ts`,
  `src/commands/run-pipeline.ts`, `src/commands/run-pipeline-onboarding.test.ts`,
  `templates/brand-skeleton/seeds.yaml`, `templates/brand-skeleton/brand-profile.yaml`,
  `data/brands/straw-motion/seeds.yaml`, `data/brands/straw-motion/formats/unhypped-news.yaml`
  (comments only — `sources.mode` unchanged), `.claude/agents/trend-scout.md`,
  `.claude/agents/performance-tracker.md`, `CONTEXT.md`, `CLAUDE.md`.
- **Not touched:** `data/brands/straw-motion/ledger.json`, `data/brands/straw-motion/ideas/2026-W29/
  trends.md` (a past Run's output — a historical record, not living config), `data/brands/mundotip/**`
  (Facebook-only, no Instagram/YouTube peers recorded), any `src/production-spec/**`,
  `src/space-driver/**`, `src/recipe/**`, `src/asset/**`, `src/production-queue/**` module — this
  slice is entirely about Trend Research + Performance data sourcing, not production.
- **Hermetic:** every test is either a pure-function unit test against sanitized fixture JSON, or a
  plain markdown/YAML text-content assertion — zero `spaces_*`/`creations_*` calls, zero Magnific
  credits, zero board mutation. Live verification against Apify happened once, by hand, outside the
  test suite (documented in the handoff and in `src/apify/fixtures/README.md`); `npm test` makes zero
  live Apify calls.
- **Always-rules upheld:** public-metrics-only (`shares`/`comments`/`reactions`/`views` only; Instagram/
  YouTube's `shares: 0` is a documented absence of a public field, not a private metric substituted
  in); never-fabricate (a not-yet-wired platform is reported and skipped, never scraped with the wrong
  actor or guessed at; `resolveApifyActor` returns `null` rather than inventing a slug); relative-not-
  absolute (unaffected — the over-performance/baseline formulas are unchanged); explicit-attribution
  and ledger-as-source-of-truth (unaffected — no ledger writer changes in this slice);
  generate-never-publish (unaffected — no Magnific Space involvement at all in this slice).
