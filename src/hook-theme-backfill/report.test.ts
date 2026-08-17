/**
 * Tests for `countClassifications` / `formatBackfillReport` (`report.ts`, issue #206) — pure formatting,
 * no I/O.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { countClassifications, formatBackfillReport } from "./report.ts";
import type { BackfillPlan } from "./backfill.ts";

const EMPTY_PLAN: BackfillPlan = { toUpdate: [], alreadyCorrect: [], reported: [], noEntry: [] };

describe("countClassifications — per-hook-type and per-theme counts over the FINAL state", () => {
  it("counts every Idea exactly once, by its current hookType and theme", () => {
    const counts = countClassifications([
      { hookType: "reframe", theme: "product_or_tool" },
      { hookType: "reframe", theme: "safety_or_risk" },
      { hookType: "irony", theme: "product_or_tool" },
      { hookType: "unclassified", theme: "unclassified" },
    ]);
    assert.deepEqual(counts.hookType, { reframe: 2, irony: 1, unclassified: 1 });
    assert.deepEqual(counts.theme, { product_or_tool: 2, safety_or_risk: 1, unclassified: 1 });
  });

  it("returns empty count maps for an empty list", () => {
    const counts = countClassifications([]);
    assert.deepEqual(counts.hookType, {});
    assert.deepEqual(counts.theme, {});
  });
});

describe("formatBackfillReport — a readable Markdown summary of what a backfill run did", () => {
  it("states zero for every bucket, and 'None.' for reported/noEntry, on a fully-empty plan", () => {
    const report = formatBackfillReport(EMPTY_PLAN, countClassifications([]));
    assert.match(report, /Updated.*0/s);
    assert.match(report, /Already correct.*0/s);
    assert.match(report, /Reported.*0/s);
    assert.match(report, /No matching classification.*0/s);
    assert.match(report, /None\./);
  });

  it("lists every updated Idea's before -> after, by title", () => {
    const plan: BackfillPlan = {
      toUpdate: [
        {
          ideaId: "idea-1",
          title: "AI just got a job",
          before: { hookType: "unclassified", theme: "unclassified" },
          after: { hookType: "reframe", theme: "product_or_tool", hookTypeSource: "heading", themeSource: "inferred" },
        },
      ],
      alreadyCorrect: [],
      reported: [],
      noEntry: [],
    };
    const report = formatBackfillReport(plan, countClassifications([{ hookType: "reframe", theme: "product_or_tool" }]));
    assert.match(report, /AI just got a job/);
    assert.match(report, /unclassified.*reframe|reframe.*unclassified/s);
    assert.match(report, /heading/);
    assert.match(report, /inferred/);
  });

  it("lists every reported Idea's reason", () => {
    const plan: BackfillPlan = {
      toUpdate: [],
      alreadyCorrect: [],
      reported: [{ ideaId: "idea-4", title: "An unfittable hook", reason: "No closed Hook Type matches this hook text." }],
      noEntry: [],
    };
    const report = formatBackfillReport(plan, countClassifications([]));
    assert.match(report, /An unfittable hook/);
    assert.match(report, /No closed Hook Type matches this hook text\./);
  });

  it("includes the per-hook-type and per-theme count tables", () => {
    const report = formatBackfillReport(EMPTY_PLAN, countClassifications([{ hookType: "irony", theme: "culture_or_reaction" }]));
    assert.match(report, /irony/);
    assert.match(report, /culture_or_reaction/);
  });
});
