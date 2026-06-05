import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Initial harness test — proves the Node + TypeScript test runner is wired and `npm test` executes
 * green. The substantive behavior is covered by the production-queue tests; this is the smoke test
 * the runtime acceptance criterion asks for.
 */
describe("harness", () => {
  it("runs TypeScript tests under the Node test runner", () => {
    const sum: number = [1, 2, 3].reduce((a, b) => a + b, 0);
    assert.equal(sum, 6);
  });
});
