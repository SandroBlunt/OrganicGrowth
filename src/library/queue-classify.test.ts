import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyQueueRow } from "./queue-classify.ts";

describe("classifyQueueRow — pure Job/Asset -> bucket classification (issue #210)", () => {
  it("a failed Job is always 'failed', regardless of the Asset's own status", () => {
    assert.equal(classifyQueueRow("failed", "in_production"), "failed");
    assert.equal(classifyQueueRow("failed", "produced"), "failed");
  });

  it("an awaiting_pick Job is 'parked'", () => {
    assert.equal(classifyQueueRow("awaiting_pick", "in_production"), "parked");
  });

  it("a done Job whose Asset still carries a pendingGate is 'parked' (the pause is on the Asset)", () => {
    assert.equal(classifyQueueRow("done", "in_production", "cast"), "parked");
  });

  it("a running Job is 'running'", () => {
    assert.equal(classifyQueueRow("running", "in_production"), "running");
  });

  it("a queued Job is 'queued'", () => {
    assert.equal(classifyQueueRow("queued", "queued"), "queued");
  });

  it("a done Job whose Asset reached produced/posted/tracking/scored is 'produced'", () => {
    for (const status of ["produced", "posted", "tracking", "scored"] as const) {
      assert.equal(classifyQueueRow("done", status), "produced");
    }
  });

  it("a done Job whose Asset has NOT reached produced yet is honestly 'done', never mislabeled 'produced'", () => {
    assert.equal(classifyQueueRow("done", "in_production"), "done");
    assert.equal(classifyQueueRow("done", "queued"), "done");
  });
});
