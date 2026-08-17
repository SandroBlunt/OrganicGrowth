/**
 * Tests for `resolveTrendInfo` (`src/importer/resolve-trend-info.ts`) — issue #204.
 *
 * Straw Motion's Ideas always carry `trend_label` inline (verified: every real Idea record that names
 * a `trend_id` also carries `trend_label`) — the cheap, always-available path. MundoTip's pre-Format
 * Ideas carry only the short `trend` code, with the label living in that Run's `trends.json` — the one
 * real case this module actually needs to read that file for. MundoTip never uses a Format-namespaced
 * layout (it has no Format at all), so its `trends.json` always lives at the legacy flat path.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveTrendInfo } from "./resolve-trend-info.ts";

describe("resolveTrendInfo — Straw Motion's inline trend_label (no I/O needed)", () => {
  it("uses the idea's own trendLabel directly, without reading any file", async () => {
    const info = await resolveTrendInfo(
      { id: "idea-01", run: "2026-W29", trendId: "trend-01", trendLabel: "Agentic AI moves into real work" },
      "straw-motion",
      "/nonexistent/brands/root/would/throw/if/read",
    );
    assert.deepEqual(info, { label: "Agentic AI moves into real work", sourceUrls: [] });
  });
});

describe("resolveTrendInfo — MundoTip's short-code Trend, looked up in trends.json", () => {
  it("finds the label by id in the Run's legacy-flat trends.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-resolve-trend-"));
    try {
      const runDir = join(dir, "mundotip", "ideas", "2026-W22");
      await mkdir(runDir, { recursive: true });
      await writeFile(
        join(runDir, "trends.json"),
        JSON.stringify([{ id: "T01", label: "Rutina matutina", momentum: 2.22, evidence: [{ url: "https://example.com/a" }] }]),
        "utf8",
      );
      const info = await resolveTrendInfo({ id: "idea-2026-W22-01", run: "2026-W22", trendId: "T01" }, "mundotip", dir);
      assert.deepEqual(info, { label: "Rutina matutina", momentum: 2.22, sourceUrls: ["https://example.com/a"] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null when the trend id is not found in that Run's trends.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-resolve-trend-"));
    try {
      const runDir = join(dir, "mundotip", "ideas", "2026-W22");
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "trends.json"), JSON.stringify([{ id: "T02", label: "other" }]), "utf8");
      const info = await resolveTrendInfo({ id: "idea-2026-W22-01", run: "2026-W22", trendId: "T01" }, "mundotip", dir);
      assert.equal(info, null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null when trends.json does not exist at all", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-resolve-trend-"));
    try {
      const info = await resolveTrendInfo({ id: "idea-2026-W22-01", run: "2026-W22", trendId: "T01" }, "mundotip", dir);
      assert.equal(info, null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
