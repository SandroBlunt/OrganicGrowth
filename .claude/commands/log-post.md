---
name: log-post
description: "Link a published Facebook Post URL back to the Idea it came from, so its performance can be tracked."
---

# /log-post

Record that the Operator published a Post from an Idea. **This is the only way a Post is attributed to
an Idea — attribution is explicit, never inferred.**

Usage: `/log-post <idea-id> <facebook-url> [posted-at]`

## Steps

1. **Validate** `<idea-id>` exists in `data/ledger.json` and is `status: accepted` (warn if it's
   `suggested`/`rejected` and confirm intent).
2. **Validate the URL** is a `facebook.com` permalink. Reject anything else.
3. **Record** on the ledger entry: `post_url`, `posted_at` (arg or now, ISO-8601), and
   `status: tracking`.
4. **Confirm:** "Linked Post ◀ Idea `<id>`. Run `/track-performance` once engagement has accrued
   (give it a few days)."

## Guardrails
- One Post per Idea. If one is already logged, confirm before overwriting.
- Only `facebook.com` URLs. Don't accept a guess — the Operator states the URL.
- Don't pull metrics here; that's `/track-performance`.
