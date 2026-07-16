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
npm run build            # tsc -p tsconfig.build.json: exit 0

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

---

## QA Verdict (qa)

### QA Verdict — Round 1: PASS

All four required commands were actually run (not assumed) and were green. Every acceptance criterion
maps to a real, passing test. The OpenSpec change faithfully matches the issue and the design docs
(ADR-0001, ADR-0013, CONTEXT.md). No live Magnific calls, no live Apify calls during `npm test`, no
token leakage. The always-rules (generate-never-publish, public-metrics-only, relative-not-absolute,
explicit-attribution, ledger-as-source-of-truth, never-fabricate) all hold in the built code. The
fixtures are consistent with genuine actor output and the three actor slugs are confirmed to exist on
the Apify store. The one flagged pre-existing gap (`performance-tracker.md`'s per-Idea framing) was
independently confirmed present on `main` via an isolated git worktree — it predates this slice and is
correctly out of scope.

### Suite result

| Command | Result |
|---|---|
| `npm test` | **1053/1053 passing**, 0 failed, 0 skipped (`# tests 1053 / # pass 1053 / # fail 0`) — matches the claimed count (baseline 994 → +59 new tests, consistent with the new `src/apify/*` and updated `scaffolder`/`run-pipeline` test files) |
| `npm run test:docs` | **25/25 passing**, 0 failed |
| `npm run build` | `tsc -p tsconfig.build.json` — exit 0, no output (clean) |
| `npx openspec validate issue-48-instagram-youtube-actors --strict` | `Change 'issue-48-instagram-youtube-actors' is valid`, exit 0 |
| `npx openspec validate --strict --all` | `Totals: 20 passed, 0 failed (20 items)`, exit 0 (includes `change/issue-48-instagram-youtube-actors`) |

All five commands were run directly by qa in this session, not copy-pasted from the Build Report.

### Per-criterion results

| # | Acceptance criterion (verbatim from issue #48) | Result | Proving test(s) |
|---|---|---|---|
| 1 | Verified, working Apify actor slugs recorded for Instagram: peer-profile posts scrape (Trends) + single-post public-metrics scrape (Performance) | **PASS** | `src/apify/platform.test.ts` ("resolves the Instagram trends actor" / "post actor"); `src/brand/scaffolder.test.ts` ("includes the verified Instagram actor pair (no longer a placeholder)"); `src/brand/scaffold-brand.test.ts` (Instagram/YouTube describe block); `src/apify/apify-docs.test.ts` (template documents both slugs); `src/apify/normalize-metrics.test.ts` (field mapping proven against real captured fixtures). Actor existence independently re-verified by qa via `curl` against `apify.com/apify/instagram-scraper` and `apify.com/apify/instagram-post-scraper` — both HTTP 200 with matching page titles ("Instagram Scraper" / "Instagram Post Scraper"), and the post-scraper's input-schema page confirms its `username` field's description literally says "username, profile URL, or post URL" — corroborating the developer's claimed quirk |
| 2 | Verified, working Apify actor slugs recorded for YouTube, and `youtube` accepted as a `platform` value across the brand scaffolder + templates | **PASS** | `src/apify/platform.test.ts` (YouTube trends/post actor resolution); `src/brand/scaffolder.test.ts` ("includes the verified YouTube actor pair", "buildBrandProfile — accepts youtube as a platform value"); `src/brand/scaffold-brand.test.ts` ("seeds.yaml has apify.youtube set... channel.platform is youtube"); `src/commands/run-pipeline-onboarding.test.ts` ("accepts 'youtube' as a valid platform (issue #48)"); `src/apify/apify-docs.test.ts` (both templates list/document youtube). qa independently confirmed `streamers/youtube-scraper` exists (HTTP 200, page title "YouTube Scraper") and its input schema uses `startUrls` (matching the claimed shared-actor input shape for both channel and single-video URLs) |
| 3 | `trend-scout` successfully pulls peer posts/videos and computes over-performance for both platforms | **PASS** (as far as hermetic tests can prove) | `src/apify/apify-docs.test.ts` ("trend-scout detects a source's platform per-URL...") pins the rewritten prompt's platform-detection + actor-selection + field-mapping documentation; `src/apify/normalize-metrics.test.ts` proves the field mapping the prompt describes is correct against real sanitized fixtures. The over-performance formula itself is unchanged (prompt-only, pre-existing, not re-implemented in TS) — this is consistent with the proposal's stated Non-Goal and does not weaken the criterion, since the formula only needs correctly-normalized inputs, which are proven |
| 4 | `performance-tracker` successfully pulls public metrics for a posted URL on both platforms and computes a Performance Score against the Channel baseline | **PASS** (as far as hermetic tests can prove) | `src/apify/apify-docs.test.ts` ("performance-tracker detects a post's platform per-URL...") pins the rewritten prompt; `src/apify/normalize-metrics.test.ts` ("mapYoutubeItem — maps real captured YouTube items defensively", instagram single-post-scraper fixture test) proves the field mapping feeding the (unchanged, baseline-relative) Performance Score formula documented in `performance-tracker.md` §4 |
| 5 | Public-metrics-only rule holds (rule #2) — no private Insights data | **PASS** | `src/apify/normalize-metrics.test.ts` "always reports shares as 0 with a note" tests (both platforms); code inspection of `mapInstagramItem`/`mapYoutubeItem` confirms only `likesCount`/`commentsCount`/`videoPlayCount`/`videoViewCount`/`likes`/`viewCount` are read — all public aggregate fields; `grep -rniE "insights|access_token|reach\b|impressions\b|saves\b|follower_count"` against `src/apify/` returned no matches (the one `private` hit is prose in `fixtures/README.md` explaining these ARE public, not a private field name) |
| 6 | `templates/brand-skeleton/seeds.yaml` documents the new actor slugs the same way it documents Facebook's | **PASS** | `src/apify/apify-docs.test.ts` ("templates/brand-skeleton/seeds.yaml documents Instagram + YouTube actors like Facebook's (issue #48 AC6)"); direct read of the template confirms `instagram:`/`youtube:` are uncommented, active keys in the same style as `facebook:`, with `linkedin:` still commented out |

### Per-scenario results (spec delta: `specs/apify-platform-integration/spec.md`)

| Requirement | Scenario | Result | Covering test |
|---|---|---|---|
| A URL's platform is detected from its own domain, never assumed | Facebook/Instagram/YouTube domains detected correctly | PASS | `platform.test.ts` "detects facebook.com" / "detects fb.watch" / "detects instagram.com" / "detects a single Instagram post URL" / "detects youtube.com" / "detects a youtu.be short link" |
| " | Unrecognised/unparseable URL returns null, never a guess | PASS | `platform.test.ts` "returns null for an unrecognised domain" / "returns null for an unparseable URL" |
| Apify actor slugs resolved defensively, never fabricated | A verified actor slug resolves correctly | PASS | `platform.test.ts` "resolves the Instagram trends actor" (and Facebook/YouTube equivalents) |
| " | Not-yet-wired placeholder resolves to null, not the literal string | PASS | `platform.test.ts` "returns null for the LinkedIn placeholder — never returns the literal '...' string" |
| youtube accepted platform + verified actor pair; Instagram's pair also verified | `buildSeeds` returns the verified Instagram actor pair, not a placeholder | PASS | `scaffolder.test.ts` "includes the verified Instagram actor pair (no longer a placeholder)" |
| " | `buildSeeds` returns the verified YouTube actor pair | PASS | `scaffolder.test.ts` "includes the verified YouTube actor pair" (line ~324) |
| " | `buildBrandProfile` stores `channel.platform: youtube` verbatim | PASS | `scaffolder.test.ts` "sets channel.platform to youtube when answered" |
| " | The onboarding conductor's platform prompt accepts youtube | PASS | `run-pipeline-onboarding.test.ts` "accepts 'youtube' as a valid platform (issue #48)" |
| " | LinkedIn still carries the unverified placeholder end-to-end | PASS | `scaffold-brand.test.ts` "seeds.yaml has apify.linkedin actors set to the '...' placeholder, not an invented slug"; `scaffolder.test.ts` "does NOT invent an actor slug for the not-yet-wired linkedin" |
| Instagram/YouTube items mapped defensively into the four Performance metrics | Non-video Instagram post maps views to 0 without an error | PASS | `normalize-metrics.test.ts` "maps a non-video (Sidecar) profile post..." |
| " | Video Instagram post maps views from videoPlayCount | PASS | `normalize-metrics.test.ts` "maps a Video post's views from videoPlayCount" |
| " | YouTube video item maps reactions/comments/views correctly | PASS | `normalize-metrics.test.ts` "maps a channel-video-list item" / "maps the single-video fixture identically" |
| " | Garbled/empty item never throws, defaults to 0, noted | PASS | `normalize-metrics.test.ts` "defaults every numeric field to 0 and notes it for a garbled/empty item" (both platforms) + "never throws on null/undefined/non-object input" (both platforms) |
| trend-scout/performance-tracker document per-URL platform detection + verified actors | `trend-scout.md` documents per-source detection + verified actors | PASS | `apify-docs.test.ts` full "trend-scout detects a source's platform per-URL..." describe block (6 tests) |
| " | `performance-tracker.md` documents per-post detection + verified actors (incl. `username` quirk) | PASS | `apify-docs.test.ts` full "performance-tracker detects a post's platform per-URL..." describe block (6 tests) |
| Template documents Instagram/YouTube like Facebook's | Template's Instagram/YouTube blocks are active, not commented | PASS | `apify-docs.test.ts` "templates/brand-skeleton/seeds.yaml documents Instagram + YouTube actors like Facebook's" describe block (3 tests) |

Every Requirement's every Scenario in the spec delta traces to a passing test — spec is green against
itself AND against the issue (job (c) requirement).

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | This slice touches zero Magnific/production code (`src/production-spec/**`, `src/space-driver/**`, `src/recipe/**`, `src/asset/**`, `src/production-queue/**` all absent from `git diff main...issue-48-instagram-youtube-actors --stat`, confirmed by qa) |
| Public-metrics-only | PASS | See criterion 5 above; `grep -rniE "insights\|access_token\|reach\b\|impressions\b\|saves\b\|follower_count"` against `src/apify/` → no field-name matches |
| Relative-not-absolute | PASS | `performance-tracker.md` §4's Performance Score formula is unchanged and still `norm(metric) = metric / baseline_median(metric)` — scored against `ledger.baseline`, never a raw count; `trend-scout.md` §5 (peer-scrape) computes over-performance as `post engagement ÷ page baseline`, and explicitly instructs dropping posts at/below baseline when `overperformance_only` is set — both formulas apply identically across all three now-wired platforms since step 3/step 3 of each agent normalizes to the same four metrics first |
| Explicit-attribution | PASS (unaffected) | No ledger-writer changes in this slice (Non-Goals states this explicitly, confirmed by diff — `performance-tracker.md`'s attribution guardrail line, "Only score Ideas that have a logged `post_url`," is untouched) |
| Ledger-as-source-of-truth | PASS (unaffected) | No ledger schema/writer changes in this slice |
| Never-fabricate | PASS | `resolveApifyActor` returns `null` rather than a fabricated slug for LinkedIn (tested); `detectPlatformFromUrl` returns `null` rather than guessing for an unrecognised domain (tested); both agent prompts explicitly document skip-not-fabricate for a not-yet-wired platform's source/post (tested via `apify-docs.test.ts`); fixtures carry real, non-round engagement numbers and real-looking IDs/shortcodes, consistent with genuine Apify captures rather than hand-invented data (see fixture check below) |
| Magnific fake / no live-Space calls | PASS | `git diff main...issue-48-instagram-youtube-actors -- . \| grep -iE "spaces_\|creations_\|magnific"` returns only prose lines *asserting the absence* of Magnific involvement (in `handoff.md`, `proposal.md`, `apify-docs.test.ts`, `normalize-metrics.test.ts`, `platform.test.ts`, `CONTEXT.md`) — zero actual `spaces_*`/`creations_*` tool-call sites, zero credits, zero board mutation. All this slice's fixtures are plain Apify JSON, loaded from disk in tests (`normalize-metrics.test.ts`'s `loadFixture` reads `./fixtures/*.sample.json` via `node:fs/promises` only) |
| No token leakage | PASS | `git diff main...issue-48-instagram-youtube-actors` grepped for token-shaped strings and `APIFY_API_TOKEN=` assignments — no matches beyond the standard `${APIFY_API_TOKEN}` shell-interpolation pattern already used by the pre-existing Facebook curl examples |

### Live-actor-slug audit (issue task item 3)

Could not re-run the developer's live Apify verification (would spend the Operator's credits), so this
was audited as evidence instead:

- **Actor existence, independently reconfirmed by qa via `curl`:** `apify.com/apify/instagram-scraper`,
  `apify.com/apify/instagram-post-scraper`, and `apify.com/streamers/youtube-scraper` all return
  HTTP 200 with page `<title>` tags matching the actors' real names ("👁 Instagram Scraper", "📝
  Instagram Post Scraper", "📹 YouTube Scraper") — these are real, published Apify Store actors, not
  invented slugs.
- **Input shape corroboration:** the Instagram Post Scraper's own input-schema page describes its
  `username` field as accepting "username, profile URL, or post URL" — independently corroborating the
  developer's claimed (and initially surprising) quirk that a post URL goes into a field literally
  named `username`. The YouTube Scraper's input-schema page confirms a `startUrls` field, consistent
  with the claimed shared-actor-for-both-jobs input shape.
- **Fixture realism:** the four `src/apify/fixtures/*.sample.json` files carry non-round, plausible
  engagement numbers (e.g. `16310`/`16311` likes across two captures of the same post one run apart —
  consistent with a real, slowly-accruing like count, not a fabricated static number), real-looking
  Instagram shortcodes/IDs and YouTube video IDs, and ISO timestamps consistent with the stated capture
  date. The Instagram fixture correctly includes both a `Sidecar` (non-video) item with `null`
  video-view fields and a `Video` item with a populated `videoPlayCount` — exactly the two cases the
  field-mapping code and its tests need, which is the kind of shape a genuine capture naturally
  produces rather than something hand-invented for test convenience. No fixture field is implausible
  for its actor (`likesCount`/`commentsCount`/`videoPlayCount`/`videoViewCount`/`ownerUsername` for
  Instagram; `likes`/`commentsCount`/`viewCount`/`channelName`/`channelUsername` for YouTube all match
  those actors' documented/observed output shapes).
- **Transparency check:** the handoff and `fixtures/README.md` both state plainly what was verified
  live (actor reachability + one small live run per actor) vs what is asserted from that evidence
  (the rest of the field-mapping/edge-case coverage, built on the captured samples) — no overclaiming
  found.

Conclusion: the "verified, working" claim is well-supported by available evidence; nothing here reads
as fabricated.

### Field-mapping defensiveness + platform-from-URL check (issue task item 4)

- **Defensive mapping confirmed:** every numeric field in `normalize-metrics.ts` goes through
  `numberField`, which defaults to `0` and appends a note when the candidate is missing, non-numeric,
  negative, or `NaN` — proven by `normalize-metrics.test.ts`'s "ignores negative/NaN/non-numeric
  values" and "defaults every numeric field to 0 and notes it for a garbled/empty item" tests (both
  platforms), and "never throws on null/undefined/non-object input" (both platforms). One malformed
  record cannot crash a Run — `mapInstagramItem`/`mapYoutubeItem` coerce non-object input to `{}`
  before mapping.
- **Platform-from-URL, never from Channel/Format, confirmed both in code and in the prompts:**
  `detectPlatformFromUrl` takes only a `url: string` argument — it has no access to
  `brand-profile.yaml`/Format state, so it structurally cannot infer from the Channel. Both
  `trend-scout.md` and `performance-tracker.md` explicitly instruct "never assume the Format's/
  Channel's own platform" / "never assumed from the Brand's Channel platform" (pinned by
  `apify-docs.test.ts`), matching the Straw Motion motivating case (Facebook Channel, Instagram/
  YouTube peers) end to end.

### Pre-existing-gap confirmation (issue task Note)

Independently confirmed via an isolated `git worktree add --detach <tmp-dir> main` (never `git checkout
-- .` in the working tree) that `.claude/agents/performance-tracker.md` on `main` (commit `0cc9724`,
which is also the exact merge-base with this branch) already contains the identical per-Idea framing
lines flagged in the Known Limits (`"ledger Ideas with status: posted | tracking and a post_url"`,
`"Select Brand <brand>'s ledger Ideas with a post_url and status posted or tracking"`, `"Only score
Ideas that have a logged post_url"`). This gap is genuinely pre-existing and not introduced by this
slice — not held against the verdict, per instruction. Worktree was removed after the check
(`git worktree remove --force`).

### Defect list

None. No defects found in this round.

### Verdict

**PASS.** Proceed to open the branch/PR.
