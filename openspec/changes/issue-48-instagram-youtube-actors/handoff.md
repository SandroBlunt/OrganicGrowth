# Slice Handoff — issue-48-instagram-youtube-actors

One bidirectional document: the `developer`'s Build Report below, followed by the `qa` Verdict (and
any Round-N retry blocks), appended — never overwritten.

---

## Build Report (developer)

### What changed

Wired real, live-verified Apify actors for **Instagram** and **YouTube** into Trend Research and
Performance tracking, and added `youtube` as a fully accepted `platform` value end-to-end:

- **Instagram**: `apify/instagram-scraper` (a peer profile's recent posts — Trends) and
  `apify/instagram-post-scraper` (one post's public metrics by URL — Performance). Replaces the
  previous `"..."` placeholder.
- **YouTube**: `streamers/youtube-scraper` for both jobs — its `startUrls` input accepts either a
  channel URL (Trends) or a single video URL (Performance), confirmed live.
- **`youtube` as a `platform` value**: `BrandInterviewAnswers.platform`, `buildBrandProfile`,
  `buildSeeds` (`src/brand/scaffolder.ts`), the `/run-pipeline` onboarding conductor's platform
  re-ask loop (`src/commands/run-pipeline.ts`), and both skeleton templates.
- **Two new pure deep modules** (`src/apify/`): `platform.ts` — `detectPlatformFromUrl` (derives a
  platform from a URL's own hostname — a Format's peer sources, or a Brand's own Posts, can be on a
  *different* platform than the Brand's Channel, e.g. Straw Motion's Channel is Facebook but its
  recorded competitors are Instagram/YouTube) and `resolveApifyActor` (defensive `apify.<platform>.
  <purpose>` lookup from `seeds.yaml`, returning `null` — never a fabricated slug — for a
  missing/placeholder actor); `normalize-metrics.ts` — `mapInstagramItem`/`mapYoutubeItem`, defensive
  field mapping from a raw Apify dataset item into `{ url, postedAt, shares, comments, reactions,
  views, notes }`. Neither Instagram nor YouTube publicly exposes a share count, so `shares` is always
  `0` for both — noted, never fabricated.
- **`trend-scout.md` and `performance-tracker.md`** (prompt-driven agents) rewritten to detect each
  source/post URL's platform from its own domain and use the matching `apify.<platform>.*` actor,
  documenting the verified curl invocations and the defensive field-mapping table for all three
  platforms. A source/post on a not-yet-wired platform (LinkedIn today) is reported as blocked and
  skipped, never fabricated.
- **Templates + real Brand data**: `templates/brand-skeleton/seeds.yaml` now documents
  `apify.instagram`/`apify.youtube` uncommented (like Facebook's), LinkedIn stays commented;
  `templates/brand-skeleton/brand-profile.yaml`'s platform comment lists all four values.
  `data/brands/straw-motion/seeds.yaml` gains the same verified `apify.instagram`/`apify.youtube`
  blocks (the motivating real data — its two Instagram competitors + one YouTube channel are now
  actually scrapable), and its and `formats/unhypped-news.yaml`'s stale "not yet usable — see issue
  #48" comments are corrected. `sources.mode` for `unhypped-news` stays `curated` — switching it to
  peer-scrape is an editorial/Operator call, not made here.
- **`CONTEXT.md`/`CLAUDE.md`**: platform enumeration updated to `Facebook, Instagram, YouTube, or
  LinkedIn`; CONTEXT.md's "platform" flagged ambiguity now states Facebook/Instagram/YouTube are
  verified (LinkedIn is the one remaining roadmap platform) and that a source's/Post's platform is
  derived from its own URL.

### Files touched

**New:**
- `src/apify/platform.ts`, `src/apify/platform.test.ts`
- `src/apify/normalize-metrics.ts`, `src/apify/normalize-metrics.test.ts`
- `src/apify/apify-docs.test.ts`
- `src/apify/fixtures/instagram-profile-posts.sample.json`
- `src/apify/fixtures/instagram-post.sample.json`
- `src/apify/fixtures/youtube-channel-videos.sample.json`
- `src/apify/fixtures/youtube-video.sample.json`
- `src/apify/fixtures/README.md`
- `openspec/changes/issue-48-instagram-youtube-actors/{proposal.md,tasks.md,handoff.md,specs/apify-platform-integration/spec.md}`

**Modified:**
- `src/brand/scaffolder.ts` (+ `scaffolder.test.ts`)
- `src/brand/scaffold-brand.test.ts`
- `src/commands/run-pipeline.ts` (+ `run-pipeline-onboarding.test.ts`)
- `templates/brand-skeleton/seeds.yaml`, `templates/brand-skeleton/brand-profile.yaml`
- `data/brands/straw-motion/seeds.yaml`, `data/brands/straw-motion/formats/unhypped-news.yaml`
  (comments only — `sources.mode` unchanged)
- `.claude/agents/trend-scout.md`, `.claude/agents/performance-tracker.md`
- `CONTEXT.md`, `CLAUDE.md`

### How to run

```bash
npm test                # tsc --noEmit + full suite: 1053/1053 passing
npm run test:docs       # docs-conformance: 25/25 passing
npm run build           # tsc -p tsconfig.build.json: exit 0

# This slice's own tests, isolated:
node --import tsx --test src/apify/platform.test.ts src/apify/normalize-metrics.test.ts src/apify/apify-docs.test.ts
node --import tsx --test src/brand/scaffolder.test.ts src/brand/scaffold-brand.test.ts
node --import tsx --test src/commands/run-pipeline-onboarding.test.ts

npx openspec validate issue-48-instagram-youtube-actors --strict   # valid
npx openspec validate --strict --all                                # 20/20 passed
```

### Acceptance-criteria self-assessment

| # | Criterion | Proof |
|---|---|---|
| 1 | Verified, working Instagram actor slugs (Trends + Performance) | Live-verified (see Fixtures below); recorded in `src/brand/scaffolder.ts` `APIFY_ACTORS.instagram`, `templates/brand-skeleton/seeds.yaml`, `data/brands/straw-motion/seeds.yaml`. Proven by `src/apify/platform.test.ts` ("resolves the Instagram trends/post actor"), `src/brand/scaffolder.test.ts` ("buildSeeds — verified Instagram and YouTube actor slugs"), `src/brand/scaffold-brand.test.ts` ("seeds.yaml has apify.instagram set to the verified actor pair"), `src/apify/apify-docs.test.ts` ("templates/brand-skeleton/seeds.yaml documents Instagram + YouTube actors..."), field mapping proven against real captures by `src/apify/normalize-metrics.test.ts` ("mapInstagramItem — maps real captured Instagram items defensively") |
| 2 | Verified YouTube actor slug + `youtube` accepted as `platform` end-to-end | Live-verified; `src/brand/scaffolder.ts` `APIFY_ACTORS.youtube`, `BrandInterviewAnswers.platform` union. Proven by `src/brand/scaffolder.test.ts` ("buildSeeds — verified... YouTube actor pair", "buildBrandProfile — accepts youtube as a platform value"), `src/brand/scaffold-brand.test.ts` ("seeds.yaml has apify.youtube set to the verified actor pair; channel.platform is youtube"), `src/commands/run-pipeline-onboarding.test.ts` ("accepts 'youtube' as a valid platform (issue #48)"), `src/apify/apify-docs.test.ts` (both templates) |
| 3 | trend-scout pulls peer posts/videos + computes over-performance for both platforms | Live-verified pulls (peer profile + channel — see Fixtures); `.claude/agents/trend-scout.md` rewritten to detect platform per source URL and use the matching actor, keeping the SAME over-performance formula (now fed by normalized metrics). Proven by `src/apify/apify-docs.test.ts` ("trend-scout detects a source's platform per-URL...") pinning the rewritten prompt, and `src/apify/normalize-metrics.test.ts` proving the field mapping the prompt describes is correct against real data |
| 4 | performance-tracker pulls metrics for both platforms + computes Performance Score vs baseline | Live-verified single-post/video pulls; `.claude/agents/performance-tracker.md` rewritten to detect platform per `post_url` and use the matching actor, keeping the SAME Performance Score formula. Proven by `src/apify/apify-docs.test.ts` ("performance-tracker detects a post's platform per-URL...") and `src/apify/normalize-metrics.test.ts` ("mapYoutubeItem — maps real captured YouTube items defensively") |
| 5 | Public-metrics-only holds — no private Insights data | `mapInstagramItem`/`mapYoutubeItem` only ever read public aggregate fields (`likesCount`/`commentsCount`/`videoPlayCount`/`viewCount`/`likes`); `shares` is a documented `0` (a field that genuinely doesn't exist publicly), never a private number substituted in. Fixtures are sanitized — captions, comment-author names/avatars stripped (`src/apify/fixtures/README.md`). Proven by `src/apify/normalize-metrics.test.ts`'s "always reports shares as 0 with a note" tests and by the fixtures themselves carrying only public aggregate fields |
| 6 | `templates/brand-skeleton/seeds.yaml` documents new actors like Facebook's | Uncommented `apify.instagram`/`apify.youtube` blocks added, matching Facebook's active form; LinkedIn stays commented. Proven by `src/apify/apify-docs.test.ts` ("templates/brand-skeleton/seeds.yaml documents Instagram + YouTube actors like Facebook's (issue #48 AC6)") |

### Fakes / fixtures used

- **No Magnific fake needed and none used** — this slice makes **zero** `spaces_*`/`creations_*`
  calls and has no Magnific Space involvement whatsoever (Trend Research + Performance are entirely
  Apify-driven). Confirmed by grep: no `magnific`/`spaces_`/`creations_` reference anywhere in this
  slice's diff.
- **Apify fixtures (this slice's hermeticity boundary):** `src/apify/fixtures/*.sample.json` —
  sanitized captures from **real, sanctioned live verification runs** made against the Operator's own
  Apify account (`APIFY_API_TOKEN` from `.env`, never printed/committed) while researching this issue.
  Small and cheap: 2–5 items per run, against public accounts already recorded as competitors in
  `data/brands/straw-motion/seeds.yaml` (`evolving.ai`, `theaifield`, `@curiousrefuge`). Full
  provenance (exact actor, exact input, exact source account) and the sanitization rule are documented
  in `src/apify/fixtures/README.md`. `npm test` reads these fixture files from disk only — it makes
  **zero live Apify calls**.
- Live verification also included two no-op existence checks (`GET /v2/acts/<actor>`) confirming
  `apify/instagram-scraper`, `apify/instagram-post-scraper`, and `streamers/youtube-scraper` are all
  reachable with the Operator's token before spending any credits on an actual run.

### Self-review notes

- Simplify pass: kept `src/apify/` to exactly two modules (platform resolution, field mapping) rather
  than also building a "compute over-performance" module — that reasoning was, and remains, the
  prompt-driven agent's own job (matching the pre-existing Facebook-only convention; issue #48 is
  about actor/field wiring, not re-architecting the scoring logic).
  `resolveApifyActor`/`detectPlatformFromUrl` are referenced by name in `trend-scout.md`/
  `performance-tracker.md` as the canonical rule, mirroring how `format/store.ts` is referenced from
  `trend-scout.md` today (issue #53's existing convention) — the prompts still describe the behavior
  in prose since the content agents have no compiled-TS execution path.
- Renamed the pre-existing C43 regression test in `scaffold-brand.test.ts` from "Instagram carries the
  placeholder" to "LinkedIn carries the placeholder" (Instagram is now wired) rather than deleting the
  coverage — the "a not-yet-wired platform never gets a fabricated slug" behavior still needs a live
  regression target, and LinkedIn is now that target.
- Removed no dead code (both new modules are minimal and every exported function is used by tests and
  referenced from the two agent prompts).

### Known limits

- **LinkedIn remains unverified** (`"..."` placeholder) — out of scope for this issue; no LinkedIn
  Apify actor was researched.
- **`performance-tracker.md`'s Inputs/Process still frame Performance around a per-Idea `post_url`/
  `status`** (`"ledger Ideas with status: posted | tracking and a post_url"`). This predates — and was
  not touched by — the per-Asset ledger re-grain (ADR-0011, issues #55–#58), which moved `post_url`/
  `status` onto each Idea's `assets[]` array (one per chosen Recipe). This is a **pre-existing gap**,
  not introduced by this slice: `git log`/`openspec/changes/archive/2026-07-16-issue-55-per-asset-ledger`
  confirm `performance-tracker.md` was not part of that epic's scope either. This slice layers
  multi-platform actor selection on top of that existing (unmigrated) framing without attempting the
  separate, larger Asset-grain migration for this agent — flagging it here rather than silently
  leaving it undiscovered.
- **Straw Motion's `unhypped-news` Format stays in `curated` mode** — the Instagram/YouTube actors are
  now wired so the Operator *can* switch it to peer-scrape mode later, but that editorial decision is
  not made by this slice.
- **Facebook's own field-mapping logic was not extracted into `src/apify/normalize-metrics.ts`** — it
  stays exactly as it already was (documented in prose in both agent prompts, no compiled counterpart)
  to keep this slice's diff focused on the two new platforms; not a regression, just not generalized.
