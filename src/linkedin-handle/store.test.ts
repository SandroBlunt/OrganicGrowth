/**
 * Tests for the LinkedIn Handle Lookup's I/O shell (`src/linkedin-handle/store.ts`).
 *
 * All Space/network-independent — this slice has no Magnific Space or MCP code at all (pure filesystem
 * + string logic), so the Magnific fake is not exercised here; nothing to fake. Tests use temp-dir
 * fixtures for isolation, plus one check against the REAL committed `data/linkedin-handles.yaml` (task
 * 4.1) to prove the shipped file itself loads cleanly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_LINKEDIN_HANDLES_PATH,
  loadLinkedInHandleTable,
  resolveLinkedInHandle,
} from "./store.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-linkedin-handles-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// loadLinkedInHandleTable
// ---------------------------------------------------------------------------

describe("loadLinkedInHandleTable", () => {
  it("round-trips a hand-written YAML file with real entries", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "Anthropic: anthropic\n1Password: 1password\n", "utf8");
      const table = await loadLinkedInHandleTable(path);
      assert.equal(table.byNormalizedName.size, 2);
      assert.equal(table.byNormalizedName.get("anthropic")?.handle, "anthropic");
      assert.equal(table.byNormalizedName.get("1password")?.handle, "1password");
    });
  });

  it("loads a MISSING file as the empty table, never throws (AC3 — file not yet created)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.yaml");
      const table = await loadLinkedInHandleTable(path);
      assert.equal(table.byNormalizedName.size, 0);
    });
  });

  it("loads an EXISTING but zero-byte file as the empty table (AC3 — empty lookup file)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "", "utf8");
      const table = await loadLinkedInHandleTable(path);
      assert.equal(table.byNormalizedName.size, 0);
    });
  });

  it("loads an EXISTING comments-only file as the empty table (AC3)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "# no entries committed yet\n", "utf8");
      const table = await loadLinkedInHandleTable(path);
      assert.equal(table.byNormalizedName.size, 0);
    });
  });

  it("throws a path-naming error for a file that fails to parse as YAML, never a bare parser exception", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      // Unterminated flow mapping — genuinely invalid YAML syntax.
      await writeFile(path, "Anthropic: [unterminated\n", "utf8");
      await assert.rejects(loadLinkedInHandleTable(path), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot parse LinkedIn Handle Lookup YAML/);
        assert.ok(err.message.includes(path), "error names the offending path");
        return true;
      });
    });
  });

  it("loads the REAL committed data/linkedin-handles.yaml without throwing", async () => {
    // Confirms the shipped file itself (task 4.1) is valid, whatever entries the Operator has added.
    const table = await loadLinkedInHandleTable(DEFAULT_LINKEDIN_HANDLES_PATH);
    assert.equal(typeof table.byNormalizedName.size, "number");
  });
});

// ---------------------------------------------------------------------------
// resolveLinkedInHandle — the one typed store function issue #130 calls (AC2, AC3)
// ---------------------------------------------------------------------------

describe("resolveLinkedInHandle", () => {
  it("resolves a committed entry to its handle (AC2 — found name)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "Anthropic: anthropic\n", "utf8");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), "anthropic");
    });
  });

  it("returns null for a name with no committed entry (AC2 — unresolved name)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "Anthropic: anthropic\n", "utf8");
      assert.equal(await resolveLinkedInHandle("Unknown Startup", path), null);
    });
  });

  it("returns null against a missing file, never throws (AC3 — empty lookup file)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.yaml");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), null);
    });
  });

  it("returns null against an existing-but-empty file, never throws (AC3)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "", "utf8");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), null);
    });
  });

  it("defaults to DEFAULT_LINKEDIN_HANDLES_PATH when no path is given", async () => {
    // Just proves it never throws against the real committed file — same guarantee as the load test above.
    await assert.doesNotReject(() => resolveLinkedInHandle("Some Company Nobody Has Committed"));
  });
});
