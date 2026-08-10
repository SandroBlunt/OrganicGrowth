import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for issue #163 ("ADR-0020 slice: Producer schedules Posts via Zoho
 * MCP after the conversational approval; CSV becomes the fallback"). Pins the shipped prose
 * (`.claude/agents/producer.md`, `.claude/commands/export-schedule.md`, and the new
 * `docs/zoho-mcp-server-setup.md`) this slice's docs-only acceptance criteria (AC3, AC5, AC6) depend on.
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRODUCER_AGENT = join(REPO_ROOT, ".claude", "agents", "producer.md");
const EXPORT_SCHEDULE_CMD = join(REPO_ROOT, ".claude", "commands", "export-schedule.md");
const ZOHO_MCP_SETUP_DOC = join(REPO_ROOT, "docs", "zoho-mcp-server-setup.md");

describe("producer.md documents the MCP-primary Zoho scheduling sequence (issue #163, ADR-0020)", () => {
  it("names the real MCP tools, in the documented order: upload, then validate, then schedule", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /ZohoSocial_uploadSocialMediaFromUrl/);
    const validateIdx = doc.indexOf("ZohoSocial_validateSocialPost");
    const scheduleIdx = doc.indexOf("ZohoSocial_createSocialSchedule");
    assert.ok(validateIdx >= 0 && scheduleIdx >= 0, "both tools must be named");
    assert.ok(validateIdx < scheduleIdx, "validate must be documented BEFORE schedule");
  });

  it("names the portal -> Zoho Social Brand -> Channels resolution tools", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /ZohoSocial_getSocialPortals/);
    assert.match(doc, /ZohoSocial_getSocialBrands/);
    assert.match(doc, /ZohoSocial_getSocialChannels/);
  });

  it("names the code this whole sequence mirrors", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /scheduleViaZohoMcpCommand/);
    assert.match(doc, /src\/commands\/schedule-via-zoho-mcp\.ts/);
    assert.match(doc, /runMcpSchedule/);
    assert.match(doc, /buildMcpSchedulePlan/);
  });

  it("names the later confirmed-live check tools and confirmZohoPostLive", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /ZohoSocial_getSocialSchedule/);
    assert.match(doc, /ZohoSocial_listSocialSchedules/);
    assert.match(doc, /ZohoSocial_getPublishStatus/);
    assert.match(doc, /ZohoSocial_getSocialPublishedPostDetail/);
    assert.match(doc, /confirmZohoPostLive/);
  });
});

describe("producer.md states Zoho's Approval workflow is never used, on any Channel (issue #163 AC3, ADR-0020)", () => {
  it("explicitly forbids updateSocialPostApprovalStatus and isApprovalNeeded", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /never call `ZohoSocial_updateSocialPostApprovalStatus`/);
    assert.match(doc, /never set\s*\n?\s*`isApprovalNeeded`/);
    assert.match(doc, /Zoho's own Approval workflow is never used/);
  });

  it("the agent's own tools frontmatter grants scheduling tools but withholds publish/approval tools", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    const frontmatterEnd = doc.indexOf("\n---", doc.indexOf("---") + 3);
    const frontmatter = doc.slice(0, frontmatterEnd);
    assert.match(frontmatter, /mcp__zoho-social__ZohoSocial_createSocialSchedule/);
    assert.match(frontmatter, /mcp__zoho-social__ZohoSocial_validateSocialPost/);
    assert.doesNotMatch(frontmatter, /ZohoSocial_publishSocialPost/);
    assert.doesNotMatch(frontmatter, /ZohoSocial_updateSocialPostApprovalStatus/);
  });
});

describe("producer.md states X always stays CSV/manual, and MCP-unavailable offers the fallback explicitly (issue #163 AC4)", () => {
  it("states X (Twitter) always stays CSV/manual, never MCP", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /X \(Twitter\) always stays CSV\/manual — never MCP/);
  });

  it("states MCP unavailable offers the fallback explicitly, never a silent switch", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /MCP unavailable -> offer the CSV\/S3 export fallback explicitly/);
    assert.match(doc, /never a silent switch/);
    assert.match(doc, /WHOLE remaining step reverts to the Operator, by hand/);
  });
});

describe("export-schedule.md documents itself as the CSV/S3 fallback path (issue #163 AC5, ADR-0020)", () => {
  it("states Zoho MCP is the primary path and this command is the fallback", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /FALLBACK path \(ADR-0020\)/);
    assert.match(doc, /PRIMARY way/);
    assert.match(doc, /schedule-via-zoho-mcp\.ts/);
  });

  it("still states the export is never triggered outside the same approval-gated flow", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /runs it only after the Operator approves/);
    assert.match(doc, /conversational only and is never written to the ledger/);
  });
});

describe("docs/zoho-mcp-server-setup.md — the server-registration note (issue #163 AC6)", () => {
  it("exists and states local scope only, never project scope or a committed config", async () => {
    const doc = await readFile(ZOHO_MCP_SETUP_DOC, "utf8");
    assert.match(doc, /--scope local/);
    assert.match(doc, /[Nn]ever use `--scope project`/);
    assert.match(doc, /never commit/i);
  });

  it("documents the new-scope re-login gotcha and the misleading 401 INVALID_OAUTHSCOPE failure", async () => {
    const doc = await readFile(ZOHO_MCP_SETUP_DOC, "utf8");
    assert.match(doc, /session restart/i);
    assert.match(doc, /fresh `claude mcp login/);
    assert.match(doc, /401 INVALID_OAUTHSCOPE/);
    assert.match(doc, /misleading/i);
  });

  it("states this is a one-time setup step, not code", async () => {
    const doc = await readFile(ZOHO_MCP_SETUP_DOC, "utf8");
    assert.match(doc, /not code/);
    assert.match(doc, /one-time/i);
  });
});
