import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findMatchingSchedule, matchesRequest } from "./reconcile.ts";
import type { ZohoPostRequest, ZohoScheduleRecord } from "../schedule-batch/mcp-schedule-port.ts";

function request(overrides: Partial<ZohoPostRequest> = {}): ZohoPostRequest {
  return {
    target: { zohoBrandName: "Straw Motion", platform: "facebook", label: "facebook" },
    mediaIds: ["fake-media-1"],
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
    ...overrides,
  };
}

function record(overrides: Partial<ZohoScheduleRecord> = {}): ZohoScheduleRecord {
  return {
    reference: "zoho-ref-1",
    content: "caption\n\n#AInews",
    scheduledAtLocal: "08/11/2026 15:06",
    ...overrides,
  };
}

describe("matchesRequest — identity by content + local schedule time, never by reference or timing alone", () => {
  it("matches when content and scheduledAtLocal are both identical", () => {
    assert.equal(matchesRequest(record(), request()), true);
  });

  it("does not match when content differs", () => {
    assert.equal(matchesRequest(record({ content: "a different caption" }), request()), false);
  });

  it("does not match when scheduledAtLocal differs", () => {
    assert.equal(matchesRequest(record({ scheduledAtLocal: "08/11/2026 16:06" }), request()), false);
  });

  it("Zoho's own reference plays no part in matching", () => {
    assert.equal(matchesRequest(record({ reference: "some-other-ref" }), request()), true);
  });
});

describe("findMatchingSchedule — pure lookup over every schedule Zoho reports for one target", () => {
  it("returns the matching entry when present", () => {
    const existing = [record({ reference: "ref-a", content: "unrelated" }), record({ reference: "ref-b" })];
    const match = findMatchingSchedule(existing, request());
    assert.equal(match?.reference, "ref-b");
  });

  it("returns null when nothing matches", () => {
    const existing = [record({ content: "unrelated one" }), record({ scheduledAtLocal: "01/01/2026 00:00" })];
    assert.equal(findMatchingSchedule(existing, request()), null);
  });

  it("returns null for an empty list", () => {
    assert.equal(findMatchingSchedule([], request()), null);
  });
});
