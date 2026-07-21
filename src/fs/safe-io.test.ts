import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic, readJsonFile } from "./safe-io.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-safe-io-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("writeFileAtomic", () => {
  it("writes the full contents and leaves no temp file behind", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "ledger.json");
      await writeFileAtomic(path, '{"ideas":[]}\n');

      assert.equal(await readFile(path, "utf8"), '{"ideas":[]}\n');
      // no orphaned temp files
      const entries = await readdir(dir);
      assert.deepEqual(entries, ["ledger.json"]);
    });
  });

  it("round-trips raw bytes unchanged (a downloaded image, not text)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "slide.png");
      // PNG magic bytes plus values outside the ASCII range — corrupted by any utf8 re-encode.
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80]);
      await writeFileAtomic(path, bytes);

      assert.deepEqual(await readFile(path), bytes);
      const entries = await readdir(dir);
      assert.deepEqual(entries, ["slide.png"]);
    });
  });

  it("overwrites an existing file's contents completely", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "ledger.json");
      await writeFile(path, '{"old":true}', "utf8");
      await writeFileAtomic(path, '{"new":true}');

      assert.equal(await readFile(path, "utf8"), '{"new":true}');
      const entries = await readdir(dir);
      assert.deepEqual(entries, ["ledger.json"]);
    });
  });

  it("leaves the previous file intact when the target directory is missing (write fails)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "no-such-subdir", "ledger.json");
      await assert.rejects(writeFileAtomic(path, "{}"));
      // the missing directory is never created; nothing is left dangling in `dir`
      const entries = await readdir(dir);
      assert.deepEqual(entries, []);
    });
  });
});

describe("readJsonFile", () => {
  it("parses valid JSON", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "data.json");
      await writeFile(path, '{"ideas":[{"id":"idea-A"}]}', "utf8");
      const parsed = await readJsonFile<{ ideas: Array<{ id: string }> }>(path);
      assert.equal(parsed.ideas[0]!.id, "idea-A");
    });
  });

  it("throws an Error naming the path (and a recovery hint) on truncated JSON", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "truncated.json");
      await writeFile(path, '{"ideas":[', "utf8"); // truncated mid-write
      await assert.rejects(readJsonFile(path), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /truncated\.json/); // names the file
        assert.match(err.message, /restore it from version control/i); // recovery hint
        // it is NOT a bare SyntaxError with no path
        assert.notEqual(err.constructor.name, "SyntaxError");
        return true;
      });
    });
  });

  it("propagates ENOENT (with its code) for a missing file so callers can special-case it", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.json");
      await assert.rejects(readJsonFile(path), (err: unknown) => {
        assert.equal((err as { code?: string }).code, "ENOENT");
        return true;
      });
    });
  });
});
