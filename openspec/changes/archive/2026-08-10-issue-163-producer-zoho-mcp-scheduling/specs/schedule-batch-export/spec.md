## ADDED Requirements

### Requirement: This capability is the explicit CSV/S3 FALLBACK path, used when Zoho MCP is unavailable, and always for X (ADR-0020)

`.claude/commands/export-schedule.md` SHALL document this capability as the FALLBACK mechanism: Zoho's
MCP tools (`schedule-batch-mcp-scheduling`'s `scheduleViaZohoMcpCommand`,
`src/commands/schedule-via-zoho-mcp.ts`) are the PRIMARY way a Run's produced News Carousel Assets get
scheduled for Facebook/Instagram/TikTok/LinkedIn; `exportScheduleCommand` is retained for when Zoho MCP
is unavailable, and always for X (Twitter), which the MCP path never schedules. `exportScheduleCommand`
SHALL NEVER write a `zoho_schedule_reference` onto any Asset it exports — that field is MCP-only (issue
#161); an Asset scheduled via this fallback path is confirmed live the ordinary way, via the Operator's
own `/log-post`, never by `src/schedule-batch/confirmed-live.ts`'s auto-log (which requires that stored
reference and refuses without it).

#### Scenario: export-schedule.md states Zoho MCP is the primary path and this command is the fallback

- **GIVEN** `.claude/commands/export-schedule.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states this command is the FALLBACK path (ADR-0020)
- **AND** it states Zoho MCP is the PRIMARY way Assets get scheduled
- **AND** it names `schedule-via-zoho-mcp.ts` as the primary path's own code

#### Scenario: An Asset exported via exportScheduleCommand never carries zoho_schedule_reference

- **GIVEN** an eligible news-carousel Asset exported successfully via `exportScheduleCommand`
- **WHEN** that Asset's ledger record is re-read through the `AssetStore`
- **THEN** its `zoho_schedule_reference` field is `undefined`
- **AND** its `scheduled_at` field is a well-formed ISO-8601 timestamp, exactly as before this slice
