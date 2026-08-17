import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseRunSyncDatasetItems } from "./response.ts";

describe("parseRunSyncDatasetItems (issue #200)", () => {
  it("returns the first item of a non-empty array", () => {
    const body = JSON.stringify([{ likes: 40 }, { likes: 999 }]);
    assert.deepEqual(parseRunSyncDatasetItems(body), { likes: 40 });
  });

  it("returns null for an empty array — a routine 'no data', never fabricated", () => {
    assert.equal(parseRunSyncDatasetItems("[]"), null);
  });

  it("throws for invalid JSON", () => {
    assert.throws(() => parseRunSyncDatasetItems("not json"), /not valid JSON/i);
  });

  it("throws for valid JSON that is not an array (e.g. an error object)", () => {
    assert.throws(() => parseRunSyncDatasetItems('{"error":"actor failed"}'), /not a JSON array/i);
  });

  it("throws for a bare JSON scalar", () => {
    assert.throws(() => parseRunSyncDatasetItems("42"), /not a JSON array/i);
  });
});
