# News Carousel fetches real source media by default; a slide can be generated, image, or video

**Status:** accepted — extends the News Carousel Recipe (ADR-0010/0018). Captured in the 2026-08-12
carousel grilling.

Idea-05 (2026-W32) proved the shape: the Operator left a one-off production note asking the producer to
fetch real images from the story's own source first, falling back to asking the Operator only if a
source image was unreachable or low quality. It worked, and it read as far more credible than a fully
generated equivalent. Doing that by hand, as a per-idea note, is exactly the manual work the Operator
doesn't want to keep doing.

## Decision

- **Fetching real source media is now a standing rule** of the News Carousel Recipe, not a one-off
  Operator note: the producer tries the story's own source first, for both images and — newly — video.
- **A slide is one of three kinds**, chosen per slide within the same 7-slide spec (no new Recipe):
  fully generated, a real image composited into a reserved frame, or a real video composited into a
  reserved window — mirroring how idea-05 (images) and idea-06 (video) were each built by hand.
- **The fallback changes**: if real media can't be fetched or is too low quality, the producer falls
  back straight to a generated slide. The old "pause and ask the Operator to drop it in the chat"
  fallback is dropped — the Operator does not want to be the manual fetch step anymore.

## Why / consequence

This is a real trade-off, not a free upgrade: a News Carousel Asset with even one video slide can no
longer go through the automatic Zoho bulk-CSV export (ADR-0020's fallback path only handles images) and
must be posted by hand, same as any other video Asset. Accepted knowingly — the Operator wants video
slides as a first-class option regardless.
