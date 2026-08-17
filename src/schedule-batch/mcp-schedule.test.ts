import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runMcpSchedule,
  combineZohoScheduleReferences,
  mcpUnavailableFallbackMessage,
  type McpScheduleAssetInput,
} from "./mcp-schedule.ts";
import { FakeZohoSchedulePort } from "./fixtures/fake-zoho-schedule-port.ts";
import type { Copy } from "../copy/contract.ts";
import type { McpTargetGroup } from "./mcp-plan.ts";

const RUN = "2026-W32";
const IDEA = `idea-${RUN}-01`;

function copyFor(...platforms: readonly string[]): Copy {
  return {
    caption: "primary caption",
    hashtags: ["#AInews"],
    variants: platforms.map((platform) => ({
      platform,
      caption: `${platform} body.`,
      hashtags: ["#AInews"],
    })),
  };
}

function group(zohoBrandName: string, platforms: readonly string[]): McpTargetGroup {
  return {
    zohoBrandName,
    timezone: "Europe/Berlin",
    channels: platforms.map((platform) => ({ platform, label: platform })),
    scheduledAtLocal: "08/11/2026 15:06",
  };
}

function asset(overrides: Partial<McpScheduleAssetInput> = {}): McpScheduleAssetInput {
  return {
    ideaId: IDEA,
    recipe: "news-carousel",
    scheduledAtUtc: "2026-08-11T13:06:00.000Z",
    groups: [group("Straw Motion", ["facebook", "instagram"])],
    copy: copyFor("facebook", "instagram"),
    mediaUrls: ["https://bucket.example/0-hook.jpg", "https://bucket.example/1-then.jpg"],
    ...overrides,
  };
}

describe("combineZohoScheduleReferences — pure combination (issue #163)", () => {
  it("returns a bare string when exactly one reference was scheduled", () => {
    assert.equal(combineZohoScheduleReferences(["fb-post-1"]), "fb-post-1");
  });

  it("flattens multiple string references into one array, in order", () => {
    assert.deepEqual(
      combineZohoScheduleReferences(["fb-post-1", "ig-post-1", "li-post-1"]),
      ["fb-post-1", "ig-post-1", "li-post-1"],
    );
  });

  it("flattens an array-shaped reference's own entries into the combined result", () => {
    assert.deepEqual(
      combineZohoScheduleReferences([["fb-a", "fb-b"], "ig-post-1"]),
      ["fb-a", "fb-b", "ig-post-1"],
    );
  });
});

describe("runMcpSchedule — AC1: no Zoho write-tool call before approval (issue #163)", () => {
  it("approved: false makes ZERO port calls and refuses clearly", async () => {
    const port = new FakeZohoSchedulePort();
    const result = await runMcpSchedule({ assets: [asset()], approved: false, port });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "not-approved");
    assert.match(result.message, /not yet approved/i);
    assert.equal(port.calls.length, 0);
  });
});

describe("runMcpSchedule — AC2: upload, then validate, then schedule, in that exact order (issue #163)", () => {
  it("uploads every slide ONCE per Asset, before any validate/schedule call", async () => {
    const port = new FakeZohoSchedulePort();
    const result = await runMcpSchedule({ assets: [asset()], approved: true, port });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(
      port.calls.map((c) => c.kind),
      ["upload", "upload", "validate", "schedule", "validate", "schedule"],
    );
    const uploadCalls = port.calls.filter((c) => c.kind === "upload");
    assert.deepEqual(
      uploadCalls.map((c) => c.url),
      ["https://bucket.example/0-hook.jpg", "https://bucket.example/1-then.jpg"],
    );
  });

  it("every validate/schedule request carries the uploaded mediaIds, in upload order", async () => {
    const port = new FakeZohoSchedulePort();
    await runMcpSchedule({ assets: [asset()], approved: true, port });

    const validateCall = port.calls.find((c) => c.kind === "validate")!;
    assert.equal(validateCall.kind, "validate");
    assert.deepEqual(validateCall.request.mediaIds, ["fake-media-1", "fake-media-2"]);
  });

  it("a failing validate is never followed by a schedule call for that SAME Channel", async () => {
    const port = new FakeZohoSchedulePort({
      validate: (request) => (request.target.platform === "facebook" ? { ok: false, problems: ["bad media"] } : { ok: true }),
    });
    const result = await runMcpSchedule({ assets: [asset()], approved: true, port });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const scheduleCalls = port.calls.filter((c) => c.kind === "schedule");
    assert.equal(scheduleCalls.length, 1);
    assert.equal(scheduleCalls[0]!.kind, "schedule");
    assert.equal(scheduleCalls[0]!.request.target.platform, "instagram");

    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0]!.reason, "validation-failed");
    assert.equal(result.failures[0]!.platform, "facebook");
    assert.match(result.failures[0]!.message, /bad media/);
  });

  it("one Asset's failed Channel does not block that SAME Asset's other Channels, or a sibling Asset", async () => {
    const port = new FakeZohoSchedulePort({
      validate: (request) => (request.target.platform === "facebook" ? { ok: false } : { ok: true }),
    });
    const second = asset({
      ideaId: `idea-${RUN}-02`,
      groups: [group("Straw Motion", ["instagram"])],
      copy: copyFor("instagram"),
    });
    const result = await runMcpSchedule({ assets: [asset(), second], approved: true, port });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.scheduled.length, 2);
    const first = result.scheduled.find((s) => s.ideaId === IDEA)!;
    assert.deepEqual(first.scheduledPlatforms, ["instagram"]);
    const sibling = result.scheduled.find((s) => s.ideaId === `idea-${RUN}-02`)!;
    assert.deepEqual(sibling.scheduledPlatforms, ["instagram"]);
  });
});

describe("runMcpSchedule — combined receipts and scheduledAt (issue #163)", () => {
  it("a fully-scheduled Asset's outcome carries every platform and its combined reference + scheduledAt", async () => {
    const port = new FakeZohoSchedulePort();
    const result = await runMcpSchedule({ assets: [asset()], approved: true, port });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.scheduled.length, 1);
    const outcome = result.scheduled[0]!;
    assert.equal(outcome.ideaId, IDEA);
    assert.equal(outcome.recipe, "news-carousel");
    assert.equal(outcome.scheduledAt, "2026-08-11T13:06:00.000Z");
    assert.deepEqual(outcome.scheduledPlatforms, ["facebook", "instagram"]);
    assert.deepEqual(outcome.reference, ["fake-ref-1", "fake-ref-2"]);
  });

  it("an Asset with no MCP-eligible Channels at all (empty groups) is silently skipped — no upload, no failure", async () => {
    const port = new FakeZohoSchedulePort();
    const result = await runMcpSchedule({
      assets: [asset({ groups: [] })],
      approved: true,
      port,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.scheduled.length, 0);
    assert.equal(result.failures.length, 0);
    assert.equal(port.calls.length, 0);
  });

  it("a Channel with no composed Copy variant is recorded as a failure, never scheduled, never crashes", async () => {
    const port = new FakeZohoSchedulePort();
    const result = await runMcpSchedule({
      assets: [asset({ copy: copyFor("facebook") })], // no "instagram" variant, but group targets it too
      approved: true,
      port,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.scheduled.length, 1);
    assert.deepEqual(result.scheduled[0]!.scheduledPlatforms, ["facebook"]);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0]!.reason, "no-copy-variant");
    assert.equal(result.failures[0]!.platform, "instagram");
  });
});

describe("runMcpSchedule — AC3: Zoho's Approval workflow is never used (issue #163, ADR-0020)", () => {
  it("no recorded request ever carries an isApprovalNeeded (or similarly-named approval) field", async () => {
    const port = new FakeZohoSchedulePort();
    await runMcpSchedule({ assets: [asset()], approved: true, port });

    for (const call of port.calls) {
      if (call.kind === "upload" || call.kind === "list") continue;
      const keys = Object.keys(call.request);
      assert.deepEqual(keys.sort(), ["content", "mediaIds", "scheduledAtLocal", "target"]);
      assert.doesNotMatch(JSON.stringify(call.request), /approval/i);
    }
  });
});

describe("runMcpSchedule — X is defensively excluded even if present in the input (issue #163, ADR-0020)", () => {
  it("never calls the port for a Channel whose platform is x, even if a group somehow still carried it", async () => {
    const port = new FakeZohoSchedulePort();
    const result = await runMcpSchedule({
      assets: [asset({ groups: [group("Straw Motion Personal", ["linkedin", "x"])], copy: copyFor("linkedin", "x") })],
      approved: true,
      port,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const call of port.calls) {
      if (call.kind === "upload" || call.kind === "list") continue;
      assert.notEqual(call.request.target.platform, "x");
    }
    assert.deepEqual(result.scheduled[0]!.scheduledPlatforms, ["linkedin"]);
  });
});

describe("mcpUnavailableFallbackMessage — AC4: explicit fallback offer, whole remaining step manual (issue #163)", () => {
  it("names the CSV/S3 export command and states the whole remaining step is the Operator's own", () => {
    const message = mcpUnavailableFallbackMessage("straw-motion", "unhypped-news", RUN, "2026-08-11");
    assert.match(message, /npm run export-schedule straw-motion unhypped-news 2026-W32 2026-08-11/);
    assert.match(message, /exportScheduleCommand/);
    assert.match(message, /src\/commands\/export-schedule\.ts/);
    assert.match(message, /WHOLE remaining step is the Operator's own, by hand/);
    assert.match(message, /no silent, automatic switch/i);
  });

  it("states X always uses the CSV/manual path, MCP available or not", () => {
    const message = mcpUnavailableFallbackMessage("straw-motion", "unhypped-news", RUN, "2026-08-11");
    assert.match(message, /X \(Twitter\) always uses this CSV\/manual path/);
  });
});
