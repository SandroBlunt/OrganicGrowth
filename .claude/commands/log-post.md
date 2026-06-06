---
name: log-post
description: "Link a published Facebook Post URL back to the Idea it came from for the named Brand, so its performance can be tracked."
---

# /log-post

Usage: `/log-post <brand> <idea-id> <facebook-url> [posted-at]`

Record that the Operator published a Post from an Idea of the named Brand. **This is the only way a
Post is attributed to an Idea — attribution is explicit, never inferred.**

`<brand>` is required — omitting it is an error, never a silent default.

**Gate 3 — Publish. Brand: `<brand>`.** The Operator is logging a Post for Brand `<brand>`. The
`post_url` is written to `data/brands/<slug>/ledger.json`.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's ledger path via the resolver.
   State the active Brand: "Logging Post for Brand: `<brand>`."
2. **Validate** `<idea-id>` exists in `data/brands/<slug>/ledger.json` and is `status: produced`
   (warn if it's `suggested`/`rejected`/`accepted` and confirm intent).
3. **Validate the URL** is a `facebook.com` permalink. Reject anything else.
4. **Record** on the Brand's ledger entry: `post_url`, `posted_at` (arg or now, ISO-8601), and
   `status: posted`.
5. **Confirm:** "Linked Post ◀ Idea `<id>` for Brand `<brand>`. Run `/track-performance <brand>`
   once engagement has accrued (give it a few days)."

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- Attribution is explicit: this is the only way a Post is linked to an Idea — never inferred.
- All ledger reads/writes are scoped to `data/brands/<slug>/ledger.json`.
- One Post per Idea. If one is already logged, confirm before overwriting.
- Only `facebook.com` URLs. Don't accept a guess — the Operator states the URL.
- Don't pull metrics here; that's `/track-performance <brand>`.
