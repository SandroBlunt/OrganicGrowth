/**
 * Tests for `loadBrief` (`src/importer/load-brief.ts`) — issue #204.
 *
 * Reuses `src/format/brief-path.ts`'s existing `resolveBriefPathCandidates` (the SAME candidate-path
 * logic `/review-ideas` already models: trust `brief_path` verbatim when the ledger has one, else try
 * the nested-daily / format-namespaced-flat / legacy-flat candidates in order) — this module is the thin
 * I/O shell that tries each candidate against a real filesystem and returns the first that exists.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadBrief } from "./load-brief.ts";

describe("loadBrief — reads a Brief's markdown content via the existing candidate-path resolver", () => {
  it("reads the file at the ledger's own verbatim brief_path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-load-brief-"));
    try {
      const briefPath = join(dir, "idea-01.md");
      await writeFile(briefPath, "# Hello\n", "utf8");
      const result = await loadBrief({ id: "idea-01", run: "2026-W29", briefPath }, "straw-motion");
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.content, "# Hello\n");
        assert.equal(result.path, briefPath);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the legacy flat candidate when no format/brief_path is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-load-brief-"));
    try {
      const ideasDir = join(dir, "data", "brands", "mundotip", "ideas");
      await mkdir(join(ideasDir, "2026-W22"), { recursive: true });
      // resolveBriefPathCandidates derives the on-disk short name via briefShortName: for an id shaped
      // "idea-<run>-NN" it strips the run-embedded prefix, so "idea-2026-W22-01" + run "2026-W22"
      // resolves to "idea-01.md" on disk (the real MundoTip file naming).
      await writeFile(join(ideasDir, "2026-W22", "idea-01.md"), "# Hola\n", "utf8");
      const result = await loadBrief({ id: "idea-2026-W22-01", run: "2026-W22" }, "mundotip", join(dir, "data", "brands"));
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.content, "# Hola\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports every tried candidate when none exist on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-load-brief-"));
    try {
      const result = await loadBrief({ id: "idea-99", run: "2026-W29" }, "straw-motion", join(dir, "data", "brands"));
      assert.equal(result.ok, false);
      if (!result.ok) assert.ok(result.candidates.length > 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports zero candidates for a garbled run id, never throws", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-load-brief-"));
    try {
      const result = await loadBrief({ id: "idea-99", run: "../../etc/passwd" }, "straw-motion", join(dir, "data", "brands"));
      assert.equal(result.ok, false);
      if (!result.ok) assert.deepEqual(result.candidates, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
