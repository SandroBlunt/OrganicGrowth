import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveIdeaFormat } from "./resolve-format.ts";

describe("resolveIdeaFormat — resolve the Idea's Format from the ledger record (issue #88)", () => {
  it("resolves ok:true with the Format slug when the Idea carries one", () => {
    const result = resolveIdeaFormat({ format: "unhypped-news" }, "idea-01");
    assert.deepEqual(result, { ok: true, format: "unhypped-news" });
  });

  it("STOPs with a clear message when the Idea has no format recorded (old/pre-multi-format record)", () => {
    const result = resolveIdeaFormat({}, "idea-01");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /idea-01/);
    assert.match(result.message, /no Format/i);
    assert.match(result.message, /never guess/i);
  });

  it("STOPs (never crashes) when format is present but somehow blank", () => {
    const result = resolveIdeaFormat({ format: "" }, "idea-02");
    assert.equal(result.ok, false);
  });

  it("never throws for any input shape", () => {
    assert.doesNotThrow(() => resolveIdeaFormat({}, "idea-03"));
  });
});
