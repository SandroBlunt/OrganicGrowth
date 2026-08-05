/**
 * Tests for the Mention Handle Registry's I/O shell (`src/mention-handle/store.ts`).
 *
 * All Space/network-independent — this slice has no Magnific Space or MCP code at all (pure filesystem
 * + string logic), so the Magnific fake is not exercised here; nothing to fake. Tests use temp-dir
 * fixtures for isolation, plus one check against the REAL committed `data/mention-handles.yaml` to prove
 * the shipped file itself loads cleanly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_MENTION_HANDLES_PATH,
  loadMentionHandleTable,
  resolveLinkedInHandle,
  resolveMentionHandle,
} from "./store.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-mention-handles-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// loadMentionHandleTable
// ---------------------------------------------------------------------------

describe("loadMentionHandleTable", () => {
  it("round-trips a hand-written, nested YAML file with real entries", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(
        path,
        "Anthropic:\n  linkedin: anthropic\n  x: AnthropicAI\n1Password:\n  linkedin: 1password\n",
        "utf8",
      );
      const table = await loadMentionHandleTable(path);
      assert.equal(table.byNormalizedName.size, 2);
      assert.equal(table.byNormalizedName.get("anthropic")?.handles.get("linkedin"), "anthropic");
      assert.equal(table.byNormalizedName.get("anthropic")?.handles.get("x"), "AnthropicAI");
      assert.equal(table.byNormalizedName.get("1password")?.handles.get("linkedin"), "1password");
    });
  });

  it("loads a MISSING file as the empty table, never throws (AC3 — file not yet created)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.yaml");
      const table = await loadMentionHandleTable(path);
      assert.equal(table.byNormalizedName.size, 0);
    });
  });

  it("loads an EXISTING but zero-byte file as the empty table (AC3 — empty registry file)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "", "utf8");
      const table = await loadMentionHandleTable(path);
      assert.equal(table.byNormalizedName.size, 0);
    });
  });

  it("loads an EXISTING comments-only file as the empty table (AC3)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "# no entries committed yet\n", "utf8");
      const table = await loadMentionHandleTable(path);
      assert.equal(table.byNormalizedName.size, 0);
    });
  });

  it("throws a path-naming error for a file that fails to parse as YAML, never a bare parser exception", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      // Unterminated flow mapping — genuinely invalid YAML syntax.
      await writeFile(path, "Anthropic: [unterminated\n", "utf8");
      await assert.rejects(loadMentionHandleTable(path), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot parse Mention Handle Registry YAML/);
        assert.ok(err.message.includes(path), "error names the offending path");
        return true;
      });
    });
  });

  it("loads the REAL committed data/mention-handles.yaml without throwing", async () => {
    // Confirms the shipped file itself is valid, whatever entries the Operator has added.
    const table = await loadMentionHandleTable(DEFAULT_MENTION_HANDLES_PATH);
    assert.equal(typeof table.byNormalizedName.size, "number");
  });
});

// ---------------------------------------------------------------------------
// resolveMentionHandle — the generic, platform-keyed typed store function (AC2, AC3)
// ---------------------------------------------------------------------------

describe("resolveMentionHandle", () => {
  it("resolves a committed entry to its handle for the queried platform (AC2 — found)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "Anthropic:\n  linkedin: anthropic\n  x: AnthropicAI\n", "utf8");
      assert.equal(await resolveMentionHandle("Anthropic", "linkedin", path), "anthropic");
      assert.equal(await resolveMentionHandle("Anthropic", "x", path), "AnthropicAI");
    });
  });

  it("returns null for a company that has no committed handle for the queried platform (AC2 — platform-keyed)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "Anthropic:\n  linkedin: anthropic\n", "utf8");
      assert.equal(await resolveMentionHandle("Anthropic", "x", path), null);
      assert.equal(await resolveMentionHandle("Anthropic", "instagram", path), null);
    });
  });

  it("returns null for a company with no committed entry (AC2 — unresolved name)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "Anthropic:\n  linkedin: anthropic\n", "utf8");
      assert.equal(await resolveMentionHandle("Unknown Startup", "linkedin", path), null);
    });
  });

  it("returns null against a missing file, never throws (AC3 — empty registry file)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.yaml");
      assert.equal(await resolveMentionHandle("Anthropic", "linkedin", path), null);
    });
  });

  it("defaults to DEFAULT_MENTION_HANDLES_PATH when no path is given", async () => {
    // Just proves it never throws against the real committed file — same guarantee as the load test above.
    await assert.doesNotReject(() =>
      resolveMentionHandle("Some Company Nobody Has Committed", "linkedin"),
    );
  });
});

// ---------------------------------------------------------------------------
// resolveLinkedInHandle — the friendly LinkedIn-only alias (unchanged contract for src/copy/linkedin-mentions.ts)
// ---------------------------------------------------------------------------

describe("resolveLinkedInHandle — friendly alias over resolveMentionHandle(name, 'linkedin', path)", () => {
  it("resolves a company's linkedin handle specifically, even when other platforms are also committed", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "Anthropic:\n  linkedin: anthropic\n  x: AnthropicAI\n", "utf8");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), "anthropic");
    });
  });

  it("returns null when a company is committed but has NO linkedin handle, even though it has other platforms", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "Anthropic:\n  x: AnthropicAI\n", "utf8");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), null);
    });
  });

  it("returns null for a name with no committed entry", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "Anthropic:\n  linkedin: anthropic\n", "utf8");
      assert.equal(await resolveLinkedInHandle("Unknown Startup", path), null);
    });
  });

  it("returns null against a missing file, never throws (AC3)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.yaml");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), null);
    });
  });

  it("returns null against an existing-but-empty file, never throws (AC3)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "mention-handles.yaml");
      await writeFile(path, "", "utf8");
      assert.equal(await resolveLinkedInHandle("Anthropic", path), null);
    });
  });

  it("defaults to DEFAULT_MENTION_HANDLES_PATH when no path is given", async () => {
    await assert.doesNotReject(() => resolveLinkedInHandle("Some Company Nobody Has Committed"));
  });
});
