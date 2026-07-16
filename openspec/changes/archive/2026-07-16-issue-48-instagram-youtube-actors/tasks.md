## 1. Research + live-verify Instagram and YouTube Apify actors

- [x] 1.1 Research reputable, high-usage actors via the Apify store (WebFetch): Instagram peer-profile
  scrape + single-post scrape; YouTube channel-videos scrape + single-video scrape.
- [x] 1.2 Verify actor existence/access against the Operator's own Apify account
  (`set -a; [ -f .env ] && . ./.env; set +a` — token never printed/committed):
  `apify/instagram-scraper`, `apify/instagram-post-scraper`, `streamers/youtube-scraper`.
- [x] 1.3 Run one small (2–5 item), cheap live run per actor against real public accounts already
  recorded in `data/brands/straw-motion/seeds.yaml` (`evolving.ai`, `@curiousrefuge`); confirm the
  input shape and read the real output field names (including the Instagram post-scraper's oddly-named
  `username` input field for a post URL, and that neither platform's response carries a public share
  count anywhere).
- [x] 1.4 Sanitize the captured responses (strip captions/comment lists/personal names+avatars; keep
  only url/id/timestamp/the numeric metric fields) and save as fixtures:
  `src/apify/fixtures/{instagram-profile-posts,instagram-post,youtube-channel-videos,youtube-video}.sample.json`
  + `src/apify/fixtures/README.md` documenting provenance/sanitization.

## 2. `src/apify/platform.ts` — platform detection + actor resolution (test-first)

- [x] 2.1 Write failing tests (`platform.test.ts`): `detectPlatformFromUrl` maps facebook.com/fb.com/
  fb.watch/instagram.com/youtube.com/youtu.be/linkedin.com hostnames correctly, is case-insensitive,
  and returns `null` (never guesses) for an unrecognised domain or an unparseable URL.
- [x] 2.2 Write failing tests: `resolveApifyActor` reads `apify.<platform>.<purpose>` from an
  already-parsed `seeds.yaml`-shaped object; returns `null` (never the literal `"..."`) for the
  not-yet-wired placeholder, a missing platform block, a missing/non-string purpose key, or garbled
  (non-object) `apifyConfig`; trims whitespace on a resolved slug.
- [x] 2.3 Implement `detectPlatformFromUrl` and `resolveApifyActor` in `src/apify/platform.ts`.

## 3. `src/apify/normalize-metrics.ts` — defensive Instagram/YouTube field mapping (test-first)

- [x] 3.1 Write failing tests (`normalize-metrics.test.ts`) against the REAL sanitized fixtures from
  §1.4: a non-video Instagram post maps views to 0 (no video fields, not an error) while reactions/
  comments map from `likesCount`/`commentsCount`; a Video-type post maps views from `videoPlayCount`;
  the single-post-scraper fixture maps identically; `shares` is always 0 with an explanatory note for
  both Instagram and YouTube; a YouTube channel-list item and the single-video fixture map identically;
  a garbled/empty/`null`/non-object item never throws and defaults every numeric field to 0 with a note.
- [x] 3.2 Implement `mapInstagramItem` and `mapYoutubeItem` in `src/apify/normalize-metrics.ts`.

## 4. `youtube` as an accepted `platform` value + verified Instagram actors (test-first)

- [x] 4.1 Write failing tests (`scaffolder.test.ts`): `buildSeeds` returns the verified Instagram actor
  pair (not the placeholder) and the verified YouTube actor pair for their respective platforms;
  `buildBrandProfile` accepts `platform: "youtube"`; LinkedIn is the one platform still asserted to
  carry the `"..."` placeholder.
- [x] 4.2 Update `BrandInterviewAnswers.platform`, `APIFY_ACTORS` (verified Instagram + YouTube actor
  pairs) in `src/brand/scaffolder.ts`.
- [x] 4.3 Update `scaffold-brand.test.ts`'s C43 placeholder-actor describe block to test LinkedIn
  (still unverified) instead of Instagram (now verified); add a new describe block asserting
  Instagram's and YouTube's verified actors survive end-to-end scaffolding.
- [x] 4.4 Update `src/commands/run-pipeline.ts`'s onboarding platform re-ask loop to accept `youtube`
  (case-insensitive) alongside facebook/instagram/linkedin, and update its prompt copy.
- [x] 4.5 Add a failing-then-passing test (`run-pipeline-onboarding.test.ts`) that onboarding a Brand
  with `platform: youtube` writes `channel.platform: youtube` and the verified `apify.youtube` actor
  pair into the scaffolded `seeds.yaml`.

## 5. Prompt updates: trend-scout.md and performance-tracker.md (test-first via doc-tests)

- [x] 5.1 Write failing tests (`src/apify/apify-docs.test.ts`, mirrors `format-docs.test.ts`'s
  convention): `trend-scout.md` states peer sources can be Facebook/Instagram/YouTube, documents
  per-source-URL platform detection (never assuming the Format's/Channel's platform), names the
  verified Instagram/YouTube actor slugs, documents the defensive field mapping (`videoPlayCount`/
  `viewCount`, shares-always-0 for both platforms with the "does not publicly expose a share count"
  wording), references `src/apify/normalize-metrics.ts`, and still requires skipping a not-yet-wired
  platform's page rather than fabricating a scrape.
- [x] 5.2 Write failing tests: `performance-tracker.md` states it scrapes Facebook/Instagram/YouTube
  posts, documents per-post-URL platform detection (never assumed from the Brand's Channel platform),
  names the verified Instagram/YouTube actor slugs (including the Instagram post-scraper's `username`
  input-field quirk), documents shares-always-0 for both platforms, references
  `src/apify/normalize-metrics.ts`, and still requires skipping a not-yet-wired platform's post.
- [x] 5.3 Rewrite `.claude/agents/trend-scout.md`'s "Two modes"/"What a Trend is"/Inputs/peer-scrape
  Process/Guardrails sections for multi-platform sourcing (curl examples for all three actors); rewrite
  `.claude/agents/performance-tracker.md`'s Inputs/Process/Guardrails sections the same way, until §5.1
  and §5.2 are green.

## 6. Templates + real Brand data

- [x] 6.1 Write failing tests (`apify-docs.test.ts`): `templates/brand-skeleton/seeds.yaml` has
  uncommented `apify.instagram`/`apify.youtube` blocks with the verified slugs (LinkedIn stays
  commented); `templates/brand-skeleton/brand-profile.yaml`'s platform comment lists
  `facebook | instagram | linkedin | youtube`.
- [x] 6.2 Update `templates/brand-skeleton/seeds.yaml` and `templates/brand-skeleton/brand-profile.yaml`
  until §6.1 is green.
- [x] 6.3 Update `data/brands/straw-motion/seeds.yaml`: add the verified `apify.instagram`/
  `apify.youtube` blocks; correct the stale "not yet usable — see issue #48" comments on `seed_pages`
  and on the `apify` block's intro comment.
- [x] 6.4 Update `data/brands/straw-motion/formats/unhypped-news.yaml`'s `sources.seed_pages` comment
  (now scrapable if the Operator switches to peer mode) — `sources.mode` itself stays `curated`
  (unchanged; an editorial decision, not this slice's to make).

## 7. Domain-vocabulary docs

- [x] 7.1 Update `CONTEXT.md`'s overview line and "platform" flagged ambiguity: add `youtube`, state
  Facebook/Instagram/YouTube are verified (LinkedIn is the remaining roadmap platform), and note a
  source's/Post's platform is derived from its own URL, not the Channel's.
- [x] 7.2 Update `CLAUDE.md`'s overview line to match.

## 8. OpenSpec

- [x] 8.1 Author `proposal.md`, this `tasks.md`, and the `apify-platform-integration` ADDED-capability
  spec delta (Requirements + Scenarios).
- [x] 8.2 `npx openspec validate issue-48-instagram-youtube-actors --strict` green.

## 9. Self-review

- [x] 9.1 `npm test` green (type-check + full suite) and `npm run test:docs` green — confirm no
  regressions from the pre-existing suite size.
- [x] 9.2 Simplify / dead-code pass; confirm every issue #48 acceptance criterion maps to a named test.
- [x] 9.3 Write the Build Report into `handoff.md`, explicitly flagging the Apify fixtures as the
  "fake"/stand-in for this slice (no Magnific Space involvement at all) and listing Known Limits
  transparently (LinkedIn unverified; performance-tracker.md's pre-existing per-Idea framing predating
  the Asset-grain ledger re-grain, unchanged by this slice).
