# Producer schedules Posts directly via Zoho MCP; the conversational approval becomes the human gate that used to be the CSV upload

**Status:** accepted — captured in the 2026-08-10 grilling session (Straw Motion W32), including live
smoke tests against the Operator's real Zoho MCP server, not documentation alone.

ADR-0002 drew the human-publish line at "a human reviews, publishes the Post, and logs the URL." For a
*News Carousel* Asset, the concrete shape that took (`schedule-batch-export`/`schedule-batch-approval-gate`
OpenSpec capabilities) was: the Producer hosts media and writes CSVs, and the Operator's own two remaining
manual acts — uploading the CSV to Zoho Social, then reviewing the queue there — stood in for "a human
decides what goes live." The Operator has since provisioned an official Zoho MCP server (`*.zohomcp.com`,
built via Zoho's own MCP builder) exposing tools that can create a scheduled post directly. If the
Producer calls those tools itself, the CSV-upload act — the thing that used to *be* the human decision —
disappears. This ADR decides what replaces it, and settles two related questions raised along the way:
whether to lean on Zoho Social's own Approval workflow, and whether to move performance tracking off
Apify onto Zoho now that a live MCP connection exists.

## Decision

- **MCP becomes the primary scheduling path** for Facebook, Instagram, TikTok, and LinkedIn, replacing
  the CSV/S3 export as the default. The CSV/S3 export (`/export-schedule`) is **retained only as a
  fallback** for when MCP is unavailable. When the fallback is used, the *whole* remaining step — not
  just logging — reverts to the Operator doing it by hand; there is no silent, automatic switch.
- **X (Twitter) is permanently excluded from the MCP path.** Zoho's own MCP tool description warns that
  using it to post to X risks the account being flagged as a bot and terminated. X stays on the CSV/manual
  path always — the same kind of standing exception the Character Explainer Recipe's video already has
  (Zoho's Bulk/CSV scheduler is images-only).
- **The Operator's in-conversation approval — before the Producer calls any Zoho write-tool — is now the
  human gate**, replacing the CSV-upload act. This is the same mechanism the Schedule Batch approval
  (issue #148) and each Recipe's own pick-gates already use; it is simply pointed at a new tool. Nothing
  reaches the Operator's real Zoho account unattended.
- **No Zoho-side Approval workflow is used**, for any channel, including LinkedIn (which does have
  Approvals enabled on the Operator's paid plan). Live-tested: setting `isApprovalNeeded: true` and
  approving it in Zoho's own UI does not move a post to scheduled — it only converts it to a plain draft,
  which still needs a separate manual scheduling step. With only one user on the Operator's Zoho org,
  Approvals has no second reviewer to provide, so it is pure friction with no offsetting benefit. Every
  MCP-eligible channel is treated the same way: straight to scheduling, no draft detour.
- **Media still hosts on S3 first** (unchanged infrastructure) — Zoho's own upload-from-URL tool pulls
  from that hosted URL rather than taking a direct file upload.
- **Attribution logs automatically for the MCP path, but only once a post is confirmed live** — checked
  later by the exact reference Zoho returned at schedule-time, never guessed from timing. A separate,
  one-time exception applies to Straw Motion's 2026-W32 batch, produced before this ADR: those posts have
  no such reference (they went out via the old CSV path), so closing them out means the agent matching
  Zoho's sent posts back to Ideas by timestamp/platform — and every such match, confident or not, is shown
  to the Operator for explicit confirmation before it's logged. That heuristic-matching path is specific
  to this one legacy transition batch, not a standing feature.
- **Performance tracking stays on Apify, public metrics only — ADR-0001 is unchanged.** Considered and
  rejected, against live data rather than documentation: Zoho Social's own post-detail tools return
  engagement counts but no shares figure at all; Zoho Analytics has no built-in feed from Zoho Social; and
  connecting Zoho Analytics directly to Facebook (bypassing Zoho Social) produces Page-level daily
  rollups with no per-post breakdown and, again, no shares figure. None of the three paths can produce
  what the Performance Score formula needs (one row per specific post, including shares) — this isn't a
  preference, every real option was checked and came up short on the same two points.

## Why

The value ADR-0002 actually protects was never "a CSV gets uploaded" — it's "a human decides what goes
live." Once Zoho's MCP tools make that upload mechanical, the only thing left to carry that decision is
whoever chooses to make the call — so the conversational approval already used everywhere else in this
pipeline (Cast picks, the Schedule Batch approval itself) is the natural, and now the only, thing standing
in for it. Layering Zoho's own Approval feature on top looked like a free second check, but testing it
live showed it doesn't actually deliver one on a single-user account — it just adds clicks that dead-end
at the same "still needs manual scheduling" place a plain draft would, so keeping it would have been
friction with nothing behind it. X's exclusion is a hard constraint from Zoho itself, not a preference.
Performance tracking's outcome is the least glamorous kind of finding — "we checked, and it doesn't work"
— but the alternative (assuming Zoho's own data would obviously be richer) was worth ruling out for real
rather than by reputation, given how central the Performance Score's shares weighting is to the whole
feedback loop.

## Consequences

- `CONTEXT.md`'s **Schedule Batch** entry is rewritten to describe both mechanisms (MCP primary, CSV
  fallback) rather than only the CSV path.
- A future build slice implements: the Producer's MCP-calling code (portal/brand/channel lookups,
  validate-then-schedule, the conversational-approval gate, the confirmed-live check before auto-logging),
  the one-time W32 heuristic-matching closeout, and updates to `.claude/agents/producer.md` and the
  `schedule-batch-*` OpenSpec capabilities to describe the new primary path (CSV's spec becomes the
  fallback-only description). None of this is built yet — this ADR is the design handoff, not the slice.
- Whoever builds it should register the Zoho MCP server at **local** scope (never `project`/`.mcp.json` —
  the server URL carries what is effectively a bearer token) and remember that adding new tools to an
  already-authenticated server needs both a session restart *and* a fresh `claude mcp login` to pick up
  the new OAuth scope — a stale token fails with a misleading `401 INVALID_OAUTHSCOPE` rather than a clear
  "missing scope" message.
- Not decided here, flagged for a future conversation: the Character Explainer Recipe (fully manual today,
  since it's video and the CSV Bulk Scheduler is images-only) could plausibly ride the MCP path too, since
  Zoho's MCP genuinely does support video — worth revisiting once the News Carousel path is built and
  proven.
