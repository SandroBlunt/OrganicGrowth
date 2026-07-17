## MODIFIED Requirements

### Requirement: Instagram and YouTube Apify items are mapped defensively into the four Performance metrics

`mapInstagramItem`, `mapYoutubeItem`, and `mapFacebookItem` (issue #84) SHALL map one raw Apify dataset
item — from `apify/instagram-scraper`/`apify/instagram-post-scraper`, `streamers/youtube-scraper`, and
`apify/facebook-post-scraper`/`apify/facebook-posts-scraper` respectively — into `{ url, postedAt,
shares, comments, reactions, views, notes }`. `shares` SHALL always be `0` for Instagram and YouTube
(neither publicly exposes a share count), recorded as a note rather than silently omitted. Facebook
DOES publicly expose a share count, so `mapFacebookItem` SHALL map its `shares` field through — it
SHALL NEVER be forced to `0` the way Instagram/YouTube's is. Any other missing/invalid numeric field
SHALL default to `0` and be recorded in `notes` (data-handling rule 4 — "missing → 0, note it"). None
of the three functions SHALL throw on `null`, `undefined`, or non-object input.

`mapFacebookItem`'s field mapping (`likes`→reactions, `comments`→comments, `shares`→shares,
`viewsCount`→views, `time` falling back to Unix-seconds `timestamp`→`postedAt`) is derived from the
Apify Store's DOCUMENTED output schema for `apify/facebook-post-scraper`/`apify/facebook-posts-scraper`
— unlike the Instagram/YouTube mapping (verified against a live sanctioned capture in issue #48), it is
NOT yet verified against a live run; this is flagged honestly in the module docstring and
`src/apify/fixtures/README.md`, backed by a SYNTHETIC (not live-captured) fixture.

#### Scenario: A non-video Instagram post maps views to 0 without an error (not "missing")

- **GIVEN** a real captured Instagram profile-post item of `type: "Sidecar"` (a carousel/image post,
  no `videoPlayCount`/`videoViewCount`)
- **WHEN** `mapInstagramItem` maps it
- **THEN** `reactions`/`comments` map from `likesCount`/`commentsCount`, `views` is `0`, and `shares`
  is `0` with a note explaining Instagram does not publicly expose a share count

#### Scenario: A video Instagram post maps views from videoPlayCount

- **GIVEN** a real captured Instagram item of `type: "Video"` with a populated `videoPlayCount`
- **WHEN** `mapInstagramItem` maps it
- **THEN** `views` equals that `videoPlayCount` value

#### Scenario: A YouTube video item maps reactions/comments/views from likes/commentsCount/viewCount

- **GIVEN** a real captured `streamers/youtube-scraper` item (from either a channel-video-list run or
  a single-video run)
- **WHEN** `mapYoutubeItem` maps it
- **THEN** `reactions` equals `likes`, `comments` equals `commentsCount`, `views` equals `viewCount`,
  and `shares` is `0` with a note explaining YouTube does not publicly expose a share count

#### Scenario: A Facebook post maps its real share count through, never forcing it to 0

- **GIVEN** a Facebook dataset item with `likes: 412`, `comments: 37`, `shares: 58`, `viewsCount: 9820`
- **WHEN** `mapFacebookItem` maps it
- **THEN** `reactions` equals `412`, `comments` equals `37`, `shares` equals `58` (NOT forced to `0`),
  and `views` equals `9820`

#### Scenario: A garbled/empty item never throws and defaults every numeric field to 0, noted

- **GIVEN** `{}`, `null`, `undefined`, or a non-object value
- **WHEN** `mapInstagramItem`, `mapYoutubeItem`, or `mapFacebookItem` maps it
- **THEN** it does not throw; `shares`/`comments`/`reactions`/`views` are all `0`; `url`/`postedAt` are
  `null`; and `notes` records which fields were defaulted
