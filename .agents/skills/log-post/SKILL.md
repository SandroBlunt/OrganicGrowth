---
name: log-post
description: >-
  Link a published Facebook Post URL back to the Idea AND Recipe it came from for the named Brand, so its performance can be tracked.
---

# Log Post Workflow

Usage: `log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]`

Record that the Operator published a Post from one of an Idea's **Assets** (one per chosen Recipe) for the named Brand.

**Explicit Attribution:** This is the only way a Post is attributed to an Idea's Asset — attribution is keyed `(Idea, Recipe)`, explicit, and never inferred (always-rules #5).

## Steps

1. **Resolve Brand:** Slugify `<brand>` and load ledger `data/brands/<slug>/ledger.json`.
2. **Run:** `npm run log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]` (or call `logPostCommand()`).
   - Verifies `<recipe>` matches an Asset on `<idea-id>`.
   - Verifies Asset is `produced`.
   - Validates `facebook.com` URL.
   - Writes `post_url` and `posted_at`, transitioning status `produced → posted`.
   - Refreshes generated view `post.json` in output bundle.
3. **Confirm:** Report link confirmation and recommend running `track-performance` after engagement accrues.
