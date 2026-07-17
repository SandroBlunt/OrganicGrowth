import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { median, recomputeBaseline, EMPTY_BASELINE_MEDIANS } from "./metrics.ts";

describe("median — pure, deterministic", () => {
  it("returns null for an empty array (never fabricates a baseline)", () => {
    assert.equal(median([]), null);
  });

  it("returns the single value for a one-element array", () => {
    assert.equal(median([7]), 7);
  });

  it("returns the middle value for an odd-length array, regardless of input order", () => {
    assert.equal(median([5, 1, 3]), 3);
  });

  it("averages the two middle values for an even-length array", () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it("does not mutate its input", () => {
    const values = [5, 1, 3];
    const snapshot = [...values];
    median(values);
    assert.deepEqual(values, snapshot);
  });
});

describe("recomputeBaseline — per-metric medians across a batch of AssetMetrics", () => {
  it("returns EMPTY_BASELINE_MEDIANS for an empty batch", () => {
    assert.deepEqual(recomputeBaseline([]), EMPTY_BASELINE_MEDIANS);
  });

  it("computes each metric's median independently", () => {
    const samples = [
      { shares: 1, comments: 10, reactions: 100, views: 1000 },
      { shares: 3, comments: 30, reactions: 300, views: 3000 },
      { shares: 5, comments: 50, reactions: 500, views: 5000 },
    ];
    assert.deepEqual(recomputeBaseline(samples), {
      shares: 3,
      comments: 30,
      reactions: 300,
      views: 3000,
    });
  });

  it("a genuinely all-zero metric across the batch medians to 0, not null (real reading, not missing)", () => {
    const samples = [
      { shares: 0, comments: 1, reactions: 1, views: 1 },
      { shares: 0, comments: 2, reactions: 2, views: 2 },
    ];
    assert.equal(recomputeBaseline(samples).shares, 0);
  });
});
