# Zoho MCP server setup (one-time, per Operator machine)

This is **infrastructure/tooling setup**, not code (mirrors
[`docs/schedule-batch-s3-setup.md`](./schedule-batch-s3-setup.md)'s own "documented one-time step, never
reimplemented as a command" posture). It documents how the Operator registers the official Zoho MCP
server (built via Zoho's own MCP builder, `*.zohomcp.com`) so the `producer` agent can call its
`ZohoSocial_*` tools attended, in the Operator's own session (ADR-0020). Nothing in this repo reads or
writes this registration — `src/schedule-batch/mcp-schedule-port.ts`'s `ZohoSchedulePort` only needs the
tools to already be present in the session; the server itself is registered by hand, once, outside this
repo's code.

## Register at LOCAL scope only — never `project` scope, never a committed config

Register the Zoho MCP server with Claude Code's **local** scope:

```
claude mcp add --scope local zoho-social https://<your-org>.zohomcp.com/...
```

**Never use `--scope project`, and never commit a `.mcp.json` (or any other config file) that carries
this URL.** The server's own URL embeds what is effectively a bearer token — anyone who has the URL has
the Operator's live Zoho access, the same way anyone who has an AWS access key has S3 access. `local`
scope keeps the registration in the Operator's own machine-level Claude Code config, never checked into
git, never shared across a team, never visible in a PR diff. This mirrors the Media Host's own credential
rule (`docs/schedule-batch-s3-setup.md`'s "Credentials" section): no live secret ever lives in this repo
or in `data/`.

## Gotcha: adding new tools to an already-authenticated server needs a session restart AND a fresh login

If the Zoho MCP server is reconfigured (Zoho's own MCP builder adds a new tool, or widens an existing
tool's scope) **after** the Operator has already authenticated a session against it, that session's
existing OAuth token does **not** automatically pick up the new scope. Two things are both required,
in order:

1. **Restart the Claude Code session** — a running session keeps using its already-negotiated tool list;
   it will not discover a newly-added tool mid-session.
2. **Run a fresh `claude mcp login zoho-social`** (or the equivalent re-auth flow) — a stale token, even
   after a restart, fails against the new/widened scope.

**The failure mode is misleading.** Skipping step 2 (or both) does not fail with a clear "missing scope"
message — it fails with a plain `401 INVALID_OAUTHSCOPE`, which reads like a broken credential rather
than "this token predates the tool you're calling." If the `producer` agent (or anyone) hits
`401 INVALID_OAUTHSCOPE` against a Zoho tool that WAS working before, the first thing to check is
whether the server's tool set changed since the last login — re-authenticate before assuming the
credential itself is broken.

## The tools the `producer` agent uses (see `.claude/agents/producer.md`)

Granted (least privilege — only the tools the documented MCP-scheduling sequence actually calls):
`ZohoSocial_getSocialPortals`, `ZohoSocial_getSocialBrands`, `ZohoSocial_getSocialChannels`,
`ZohoSocial_uploadSocialMediaFromUrl`, `ZohoSocial_validateSocialPost`, `ZohoSocial_createSocialSchedule`,
`ZohoSocial_getSocialSchedule`, `ZohoSocial_listSocialSchedules`, `ZohoSocial_getPublishStatus`,
`ZohoSocial_getSocialPublishedPostDetail`.

**Deliberately NOT granted**, even though the server may expose them: `ZohoSocial_publishSocialPost`
(instant-publish — the Producer schedules, it never publishes directly) and
`ZohoSocial_updateSocialPostApprovalStatus` (Zoho's own Approval workflow — ADR-0020 decided, after a
live test, that it never delivers a real second reviewer on a single-user Zoho org and only adds a
dead-end "still needs manual scheduling" draft step; it is never used, on any Channel). Because
`producer.md`'s own `tools:` frontmatter omits both, the agent cannot call either even if a prompt asked
it to — this is a structural guard, not just a documented rule.
