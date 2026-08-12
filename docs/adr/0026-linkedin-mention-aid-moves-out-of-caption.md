# LinkedIn mention aid moves out of the caption body

**Status:** accepted — closes issue #186, surfaced at the first Unhypped Daily run's Zoho scheduling
pass (2026-08-11).

Issue #130 wove a trailing "Mentions: @Name, @Name." sentence into every drafted LinkedIn caption whose
Spec named a company/product with a committed handle — a paste aid: the literal text the Operator would
select from LinkedIn's own compose-box @mention dropdown, since OrganicGrowth can never embed a
functioning tag itself. That made sense while every scheduled post passed through a human CSV-upload
step (the pre-ADR-0020 pipeline) — the Operator saw the raw caption before it went live and could act on
the aid, then strip it. ADR-0020 made Zoho MCP scheduling the primary path: the composed caption now
goes out verbatim, with no human editing pass over the text itself, so the aid sentence ships as
published copy and reads as a leftover artifact.

Building a real Zoho @mention (`mentions[]` on `createSocialSchedule`, resolved via
`getSocialPostMentions`) was considered instead of a workaround — Zoho's schema does support it — but
the lookup tool it depends on isn't wired into this integration, so it isn't a live option yet.

## Decision

- `injectLinkedInMentions` no longer appends a trailing sentence to the caption body — the caption a
  Recipe drafts ships unchanged by mention-weaving.
- `CopyVariant` gains a `resolvedMentions?: readonly string[]` field, mirroring the existing
  `unresolvedMentions` field: every company/product name issue #126's lookup DID resolve a handle for,
  surfaced for the Operator to see and act on (manually type into LinkedIn's compose box) whenever
  they're actually about to publish — not just in the composing session.
- Real Zoho mention payloads stay out of scope until a mention-lookup tool (`getSocialPostMentions` or
  equivalent) is available through this integration.

## Why

Mentions can't be embedded programmatically — that hasn't changed since issue #130. What changed is
*where* the human who needs the aid sees it: it used to be a person reading the raw caption before
upload; now it's a person approving/publishing later, possibly in a different session. Baking the aid
into ship-ready copy text fit the old workflow and doesn't fit the new one — the fix reuses the same
shape issue #130 already chose for unresolved names (a structured field, not caption text) rather than
inventing a new mechanism.
