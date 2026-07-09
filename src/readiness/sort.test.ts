/**
 * Tests for the deterministic finding sorter (`sortFindings`).
 *
 * The sort is three-level (C49 wanted this pinned directly): phase (research < production < publish),
 * then severity within a phase (block before advisory), then code alphabetically as a stable tie-break.
 * These tests exercise each level, and prove the sort is pure (input array is not mutated).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortFindings } from "./sort.ts";
import type { Finding } from "./types.ts";

function f(phase: Finding["phase"], severity: Finding["severity"], code: string): Finding {
  return { phase, severity, code, message: `${code} message` };
}

describe("sortFindings — three-level deterministic ordering (C49)", () => {
  it("orders by phase first, then severity, then code — from a shuffled input", () => {
    // One finding for every combination that forces each tie-break level to decide the order.
    const shuffled: Finding[] = [
      f("publish", "advisory", "P-b"),
      f("research", "advisory", "R-a"), // same phase+severity as R-b → code decides
      f("production", "block", "PR-a"),
      f("research", "block", "R-z"),
      f("research", "advisory", "R-b"),
      f("publish", "block", "P-a"),
      f("research", "block", "R-a"), // same phase+severity as R-z → code decides
      f("production", "advisory", "PR-a"),
    ];

    const codes = sortFindings(shuffled).map((x) => `${x.phase}:${x.severity}:${x.code}`);

    assert.deepEqual(codes, [
      // research phase: block before advisory; within each, code ascending
      "research:block:R-a",
      "research:block:R-z",
      "research:advisory:R-a",
      "research:advisory:R-b",
      // production phase next
      "production:block:PR-a",
      "production:advisory:PR-a",
      // publish phase last
      "publish:block:P-a",
      "publish:advisory:P-b",
    ]);
  });

  it("is pure — it returns a new array and does not mutate the input", () => {
    const input: Finding[] = [
      f("publish", "advisory", "z"),
      f("research", "block", "a"),
    ];
    const before = input.map((x) => x.code).join(",");
    const out = sortFindings(input);

    assert.notEqual(out, input, "returns a new array");
    assert.equal(input.map((x) => x.code).join(","), before, "input order is unchanged");
    assert.deepEqual(out.map((x) => x.code), ["a", "z"]);
  });
});
