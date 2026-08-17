/**
 * Tests for `loadTrendsFile`/`parseTrendsFile` (`src/importer/load-trends.ts`) — issue #204.
 *
 * No pre-existing TypeScript loader reads a Run's `trends.json` (it is authored/read by the
 * `trend-scout` model-prompting Skill, not by any code module) — this is genuinely NEW parsing logic
 * this ticket owns, not a raw-JSON bypass of something that already exists.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTrendsFile, loadTrendsFile } from "./load-trends.ts";

describe("parseTrendsFile — PURE parsing of a Run's trends.json", () => {
  it("parses Straw Motion's real shape (evidence[].url)", () => {
    const raw = [
      {
        id: "trend-01",
        label: "China's open-weight models close the gap",
        momentum: 0.97,
        evidence: [{ source: "Moonshot AI", url: "https://www.kimi.com/blog/kimi-k3" }, { source: "TechCrunch", url: "https://techcrunch.com/example" }],
      },
    ];
    const trends = parseTrendsFile(raw);
    assert.equal(trends.length, 1);
    assert.equal(trends[0]!.id, "trend-01");
    assert.equal(trends[0]!.label, "China's open-weight models close the gap");
    assert.equal(trends[0]!.momentum, 0.97);
    assert.deepEqual(trends[0]!.sourceUrls, ["https://www.kimi.com/blog/kimi-k3", "https://techcrunch.com/example"]);
  });

  it("parses MundoTip's real shape (evidence[].url, page/text fields ignored)", () => {
    const raw = [{ id: "T01", label: "Rutina matutina", momentum: 2.22, evidence: [{ page: "lifehackIG", url: "https://www.facebook.com/reel/1552567153045436/", overperformance: 2.22, text: "I hate waking up like this fr!" }] }];
    const trends = parseTrendsFile(raw);
    assert.equal(trends[0]!.id, "T01");
    assert.deepEqual(trends[0]!.sourceUrls, ["https://www.facebook.com/reel/1552567153045436/"]);
  });

  it("drops a malformed entry (missing id or label) rather than crashing the whole file", () => {
    const raw = [{ label: "no id" }, { id: "trend-02" /* no label */ }, { id: "trend-03", label: "ok" }];
    const trends = parseTrendsFile(raw);
    assert.deepEqual(trends.map((t) => t.id), ["trend-03"]);
  });

  it("defaults momentum/sourceUrls when absent", () => {
    const trends = parseTrendsFile([{ id: "trend-01", label: "ok" }]);
    assert.equal(trends[0]!.momentum, undefined);
    assert.deepEqual(trends[0]!.sourceUrls, []);
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(parseTrendsFile({ not: "an array" }), []);
    assert.deepEqual(parseTrendsFile(null), []);
  });
});

describe("loadTrendsFile — the I/O shell", () => {
  it("reads and parses a real file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-trends-"));
    try {
      const path = join(dir, "trends.json");
      await writeFile(path, JSON.stringify([{ id: "trend-01", label: "ok" }]), "utf8");
      const trends = await loadTrendsFile(path);
      assert.equal(trends.length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns [] for a missing file (never throws)", async () => {
    const trends = await loadTrendsFile(join("/tmp", "og-nonexistent-trends-file.json"));
    assert.deepEqual(trends, []);
  });
});
