# Apify fixtures (issue #48)

Sanitized samples from real, **sanctioned live verification runs** made against the Operator's own
Apify account while wiring up Instagram and YouTube (`APIFY_API_TOKEN` from `.env`, never printed or
committed). Kept small and cheap: 2–3 items per run, against public accounts already recorded in
`data/brands/straw-motion/seeds.yaml` as competitors. Nothing here required Magnific — these are
plain Apify HTTP responses.

## Provenance

| Fixture | Actor | Input | Captured against |
|---|---|---|---|
| `instagram-profile-posts.sample.json` | `apify/instagram-scraper` | `{"directUrls":["https://www.instagram.com/evolving.ai/"],"resultsLimit":5,"resultsType":"posts"}` | `evolving.ai` (public IG account) |
| `instagram-post.sample.json` | `apify/instagram-post-scraper` | `{"username":["https://www.instagram.com/p/Da0YoASz8cj/"]}` (the actor's own field is literally named `username` even though the value is a post URL — confirmed live) | one post from the run above |
| `youtube-channel-videos.sample.json` | `streamers/youtube-scraper` | `{"startUrls":[{"url":"https://www.youtube.com/@curiousrefuge/videos"}],"maxResults":3,"sortVideosBy":"NEWEST"}` | `@curiousrefuge` (public YouTube channel) |
| `youtube-video.sample.json` | `streamers/youtube-scraper` | `{"startUrls":[{"url":"https://www.youtube.com/watch?v=llFR17DcfMo"}]}` | one video from the run above |

## Sanitization (public-metrics-only, rule 2)

The raw actor responses also included caption/description text, per-comment author names + avatar
URLs, and other non-metric fields. These fixtures keep ONLY the fields `src/apify/normalize-metrics.ts`
actually reads (or needs for identity/debugging): `url`, `id`/`shortCode`, `type`, `timestamp`/`date`,
`likesCount`/`likes`, `commentsCount`, `videoViewCount`/`videoPlayCount`/`viewCount`,
`ownerUsername`/`channelName`/`channelUsername`, `title`, `duration`. The engagement numbers
themselves are real, unmodified public counts (that is the entire point of ADR-0001 / rule 2 —
they're public metrics, not private data) as of the capture date (2026-07-16).

## What this proves

- Both `apify/instagram-scraper` + `apify/instagram-post-scraper` and `streamers/youtube-scraper`
  exist, are reachable with the Operator's token, accept the documented input shape, and return the
  field names `normalize-metrics.ts` maps (`normalize-metrics.test.ts` asserts against these fixtures
  verbatim).
- Neither platform's raw response carries a public share count anywhere — confirming
  `mapInstagramItem`/`mapYoutubeItem`'s `shares: 0` (with a note) is a defensive default for a field
  that genuinely does not exist publicly, not a bug.
- Instagram's non-video ("Sidecar") posts carry neither `videoViewCount` nor `videoPlayCount` — the
  `views` default-to-0 path is exercised by real data, not just a synthetic case.
