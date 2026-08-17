import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderChartBody } from "./chart.ts";
import type { FitPerformanceData } from "../types.ts";

describe("renderChartBody — Fit Score (predicted) vs Performance Score (measured), AC5", () => {
  it("says no Idea has a Fit Score yet, for an empty dataset", () => {
    const html = renderChartBody({ points: [] });
    assert.match(html, /No Idea carries a Fit Score yet/);
  });

  it("plots each scored point as an SVG circle, labels both axes explicitly, and never confuses predicted with measured", () => {
    const data: FitPerformanceData = {
      points: [
        { ideaId: "i1", ideaTitle: "One", fitScore: 0.8, performanceScore: 0.6 },
        { ideaId: "i2", ideaTitle: "Two", fitScore: 0.3, performanceScore: 0.9 },
      ],
    };
    const html = renderChartBody(data);
    assert.match(html, /<circle/);
    assert.equal((html.match(/<circle/g) ?? []).length, 2);
    assert.match(html, /Fit Score \(predicted\)/);
    assert.match(html, /Performance Score \(measured\)/);
    assert.match(html, /2 Idea\(s\) plotted/);
    assert.match(html, /0 Idea\(s\) have a Fit Score but no Performance Score/);
  });

  it("EVERY point tied at the exact same coordinates still renders without collapsing/erroring (the real-world all-0.5 shape)", () => {
    const data: FitPerformanceData = {
      points: [
        { ideaId: "i1", ideaTitle: "One", fitScore: 0.5, performanceScore: 0.5 },
        { ideaId: "i2", ideaTitle: "Two", fitScore: 0.5, performanceScore: 0.5 },
        { ideaId: "i3", ideaTitle: "Three", fitScore: 0.5, performanceScore: 0.5 },
      ],
    };
    const html = renderChartBody(data);
    assert.equal((html.match(/<circle/g) ?? []).length, 3, "all three ties must still be drawn, not merged into one");
  });

  it("an Idea with a Fit Score but NO Performance Score is never plotted as if it scored 0 — it is listed separately and counted", () => {
    const data: FitPerformanceData = {
      points: [
        { ideaId: "i1", ideaTitle: "Scored", fitScore: 0.8, performanceScore: 0.6 },
        { ideaId: "i2", ideaTitle: "Unscored", fitScore: 0.4 },
      ],
    };
    const html = renderChartBody(data);
    assert.equal((html.match(/<circle/g) ?? []).length, 1, "only the scored Idea is plotted");
    assert.match(html, /Awaiting a Performance Score \(1\)/);
    assert.match(html, /Unscored/);
    assert.match(html, /1 Idea\(s\) plotted/);
    assert.match(html, /1 Idea\(s\) have a Fit Score but no Performance Score/);
  });

  it("when NOTHING is scored yet (today's real corpus), the chart says so honestly and lists every awaiting Idea", () => {
    const data: FitPerformanceData = {
      points: [
        { ideaId: "i1", ideaTitle: "A", fitScore: 0.8 },
        { ideaId: "i2", ideaTitle: "B", fitScore: 0.4 },
      ],
    };
    const html = renderChartBody(data);
    assert.equal((html.match(/<circle/g) ?? []).length, 0);
    assert.match(html, /Nothing plottable yet/);
    assert.match(html, /Awaiting a Performance Score \(2\)/);
  });
});
