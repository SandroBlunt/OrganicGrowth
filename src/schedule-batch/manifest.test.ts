import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildManifest } from "./manifest.ts";

describe("manifest — the Schedule Batch's cleanup contract (issue #145)", () => {
  it("builds the full manifest shape from its inputs, purely", () => {
    const manifest = buildManifest({
      brand: "straw-motion",
      format: "unhypped-news",
      run: "2026-W32",
      createdAt: "2026-08-04T11:07:47.394Z",
      csvFiles: ["zoho-main.csv", "zoho-linkedin-x.csv"],
      assets: [
        {
          idea: "idea-2026-W32-01",
          recipe: "news-carousel",
          scheduled_at: "2026-08-04T14:23:00.000Z",
          s3_keys: ["straw-motion/2026-W32/idea-01/0-hook.jpg"],
          urls: ["https://strawmotion-schedule-media.s3.amazonaws.com/straw-motion/2026-W32/idea-01/0-hook.jpg"],
          rows: { "zoho-main.csv": ["Facebook", "Instagram", "TikTok"], "zoho-linkedin-x.csv": ["LinkedInProfile", "X"] },
          stripped_notes: [],
        },
      ],
    });

    assert.equal(manifest.batch, "unhypped-news-2026-W32");
    assert.equal(manifest.brand, "straw-motion");
    assert.equal(manifest.format, "unhypped-news");
    assert.equal(manifest.run, "2026-W32");
    assert.equal(manifest.created_at, "2026-08-04T11:07:47.394Z");
    assert.deepEqual(manifest.csv_files, ["zoho-main.csv", "zoho-linkedin-x.csv"]);
    assert.equal(manifest.ideas.length, 1);
    assert.equal(manifest.ideas[0]!.idea, "idea-2026-W32-01");
    assert.deepEqual(manifest.ideas[0]!.rows["zoho-main.csv"], ["Facebook", "Instagram", "TikTok"]);
  });

  it("flattens every Asset's own stripped_notes into the top-level stripped_notes list", () => {
    const manifest = buildManifest({
      brand: "straw-motion",
      format: "unhypped-news",
      run: "2026-W32",
      createdAt: "2026-08-04T11:07:47.394Z",
      csvFiles: ["zoho-main.csv"],
      assets: [
        {
          idea: "idea-01",
          recipe: "news-carousel",
          scheduled_at: "x",
          s3_keys: [],
          urls: [],
          rows: {},
          stripped_notes: ["LINKEDIN: [Unresolved linkedin mentions ...]"],
        },
        {
          idea: "idea-02",
          recipe: "news-carousel",
          scheduled_at: "y",
          s3_keys: [],
          urls: [],
          rows: {},
          stripped_notes: [],
        },
      ],
    });
    assert.deepEqual(manifest.stripped_notes, ["LINKEDIN: [Unresolved linkedin mentions ...]"]);
  });

  it("is pure — never shares array references with its inputs", () => {
    const csvFiles = ["zoho-main.csv"];
    const manifest = buildManifest({
      brand: "b",
      format: "f",
      run: "r",
      createdAt: "now",
      csvFiles,
      assets: [],
    });
    csvFiles.push("mutated.csv");
    assert.deepEqual(manifest.csv_files, ["zoho-main.csv"]);
  });
});
