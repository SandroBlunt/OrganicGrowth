import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FakeZohoSchedulePort } from "./fake-zoho-schedule-port.ts";
import type { ZohoPostRequest } from "../mcp-schedule-port.ts";

function request(platform = "facebook"): ZohoPostRequest {
  return {
    target: { zohoBrandName: "Straw Motion", platform, label: platform },
    mediaIds: ["fake-media-1"],
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
  };
}

describe("FakeZohoSchedulePort — THIS IS THE ZOHO MCP FAKE (issue #163)", () => {
  it("records every call, in order, with its exact arguments", async () => {
    const port = new FakeZohoSchedulePort();
    await port.uploadMediaFromUrl("https://bucket.example/0-hook.jpg");
    await port.validatePost(request());
    await port.createSchedule(request());

    assert.deepEqual(
      port.calls.map((c) => c.kind),
      ["upload", "validate", "schedule"],
    );
  });

  it("uploadMediaFromUrl returns a fresh mediaId per call", async () => {
    const port = new FakeZohoSchedulePort();
    const a = await port.uploadMediaFromUrl("https://bucket.example/0-hook.jpg");
    const b = await port.uploadMediaFromUrl("https://bucket.example/1-then.jpg");
    assert.notEqual(a.mediaId, b.mediaId);
  });

  it("validatePost defaults to always-ok, and honors an injected validate override", async () => {
    const okPort = new FakeZohoSchedulePort();
    assert.deepEqual(await okPort.validatePost(request()), { ok: true });

    const failPort = new FakeZohoSchedulePort({
      validate: (r) => (r.target.platform === "x" ? { ok: false, problems: ["x is never scheduled via MCP"] } : { ok: true }),
    });
    assert.deepEqual(await failPort.validatePost(request("x")), {
      ok: false,
      problems: ["x is never scheduled via MCP"],
    });
    assert.deepEqual(await failPort.validatePost(request("facebook")), { ok: true });
  });

  it("createSchedule defaults to an incrementing fake-ref-N reference, and honors an injected reference override", async () => {
    const port = new FakeZohoSchedulePort();
    const first = await port.createSchedule(request());
    const second = await port.createSchedule(request());
    assert.equal(first.reference, "fake-ref-1");
    assert.equal(second.reference, "fake-ref-2");

    const customPort = new FakeZohoSchedulePort({
      reference: (r, i) => `${r.target.platform}-${i}`,
    });
    const custom = await customPort.createSchedule(request("linkedin"));
    assert.equal(custom.reference, "linkedin-1");
  });
});
