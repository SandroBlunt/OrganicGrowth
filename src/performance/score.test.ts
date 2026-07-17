import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computePerformanceScore, PERFORMANCE_SCORE_WEIGHTS } from "./score.ts";

const ZERO_METRICS = { shares: 0, comments: 0, reactions: 0, views: 0 };
const NULL_BASELINE = { shares: null, comments: null, reactions: null, views: null };

describe("PERFORMANCE_SCORE_WEIGHTS — the ADR-0001 weights sum to exactly 1", () => {
  it("sums to 1", () => {
    const sum =
      PERFORMANCE_SCORE_WEIGHTS.shares +
      PERFORMANCE_SCORE_WEIGHTS.comments +
      PERFORMANCE_SCORE_WEIGHTS.reactions +
      PERFORMANCE_SCORE_WEIGHTS.views;
    assert.equal(sum, 1);
  });
});

describe("computePerformanceScore — relative to the Channel baseline, never absolute", () => {
  it("scores exactly at baseline as 0.5 (the midpoint — neither over nor under performing)", () => {
    const metrics = { shares: 10, comments: 10, reactions: 10, views: 10 };
    const baseline = { shares: 10, comments: 10, reactions: 10, views: 10 };
    assert.equal(computePerformanceScore(metrics, baseline), 0.5);
  });

  it("scores 2x baseline across every metric as the max, 1.0", () => {
    const metrics = { shares: 20, comments: 20, reactions: 20, views: 20 };
    const baseline = { shares: 10, comments: 10, reactions: 10, views: 10 };
    assert.equal(computePerformanceScore(metrics, baseline), 1);
  });

  it("clips beyond 2x baseline — one viral outlier cannot push the score past 1.0", () => {
    const metrics = { shares: 1000, comments: 1000, reactions: 1000, views: 1000 };
    const baseline = { shares: 10, comments: 10, reactions: 10, views: 10 };
    assert.equal(computePerformanceScore(metrics, baseline), 1);
  });

  it("scores 0 across the board when every metric is 0 vs a real positive baseline", () => {
    const baseline = { shares: 10, comments: 10, reactions: 10, views: 10 };
    assert.equal(computePerformanceScore(ZERO_METRICS, baseline), 0);
  });

  it("weights shares highest (0.35), then comments (0.25), then reactions/views (0.20 each)", () => {
    const baseline = { shares: 10, comments: 10, reactions: 10, views: 10 };
    // Only shares is 2x baseline, everything else exactly at baseline (norm 0.5).
    const metrics = { shares: 20, comments: 10, reactions: 10, views: 10 };
    const score = computePerformanceScore(metrics, baseline);
    // 0.35*1.0 + 0.25*0.5 + 0.20*0.5 + 0.20*0.5 = 0.35 + 0.125 + 0.10 + 0.10 = 0.675
    assert.ok(Math.abs(score - 0.675) < 1e-9, `expected ~0.675, got ${score}`);
  });

  it("a metric with no established baseline (null median) scores NEUTRAL, never a fabricated ratio", () => {
    const metrics = { shares: 500, comments: 0, reactions: 0, views: 0 };
    assert.equal(computePerformanceScore(metrics, NULL_BASELINE), 0.5);
  });

  it("a zero baseline median with a zero reading stays neutral (0/0 is not fabricated as over/under)", () => {
    const baseline = { shares: 0, comments: 10, reactions: 10, views: 10 };
    const metrics = { shares: 0, comments: 10, reactions: 10, views: 10 };
    assert.equal(computePerformanceScore(metrics, baseline), 0.5);
  });

  it("a zero baseline median with ANY positive reading scores that metric at the max (unambiguously above)", () => {
    const baseline = { shares: 0, comments: 10, reactions: 10, views: 10 };
    const metrics = { shares: 5, comments: 10, reactions: 10, views: 10 };
    const score = computePerformanceScore(metrics, baseline);
    // shares norm = 1 (max), everything else exactly at baseline (0.5).
    const expected = 0.35 * 1 + 0.25 * 0.5 + 0.2 * 0.5 + 0.2 * 0.5;
    assert.ok(Math.abs(score - expected) < 1e-9);
  });

  it("never returns a value outside [0, 1]", () => {
    const baseline = { shares: 1, comments: 1, reactions: 1, views: 1 };
    const metrics = { shares: 999999, comments: 999999, reactions: 999999, views: 999999 };
    const score = computePerformanceScore(metrics, baseline);
    assert.ok(score >= 0 && score <= 1);
  });
});
