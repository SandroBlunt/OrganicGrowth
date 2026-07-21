import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { downloadAssetFiles } from "./download.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-asset-download-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A hand-rolled fetch stub — never touches the network. */
function stubFetch(byUrl: Record<string, { readonly ok: boolean; readonly status?: number; readonly body?: string }>) {
  return async (url: string | URL | Request): Promise<Response> => {
    const key = String(url);
    const entry = byUrl[key];
    if (entry === undefined) throw new Error(`stubFetch: no entry for ${key}`);
    return {
      ok: entry.ok,
      status: entry.status ?? (entry.ok ? 200 : 500),
      statusText: entry.ok ? "OK" : "Error",
      arrayBuffer: async () => new TextEncoder().encode(entry.body ?? "").buffer,
    } as Response;
  };
}

describe("downloadAssetFiles — turns remote creation URLs into durable local files", () => {
  it("downloads every target, in order, into a newly-created destination directory", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "idea-01.news-carousel.assets");
      const fetchImpl = stubFetch({
        "https://example.com/hook.png": { ok: true, body: "hook-bytes" },
        "https://example.com/then.png": { ok: true, body: "then-bytes" },
      });

      const results = await downloadAssetFiles(
        destDir,
        [
          { url: "https://example.com/hook.png", filename: "0-hook.png" },
          { url: "https://example.com/then.png", filename: "1-then.png" },
        ],
        fetchImpl,
      );

      assert.equal(results.length, 2);
      assert.equal(results[0]!.filename, "0-hook.png");
      assert.equal(results[0]!.path, join(destDir, "0-hook.png"));
      assert.equal(await readFile(join(destDir, "0-hook.png"), "utf8"), "hook-bytes");
      assert.equal(await readFile(join(destDir, "1-then.png"), "utf8"), "then-bytes");

      const entries = (await readdir(destDir)).sort();
      assert.deepEqual(entries, ["0-hook.png", "1-then.png"]);
    });
  });

  it("creates nested destination directories that don't exist yet", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "a", "b", "c");
      const fetchImpl = stubFetch({ "https://example.com/x.png": { ok: true, body: "x" } });

      await downloadAssetFiles(destDir, [{ url: "https://example.com/x.png", filename: "x.png" }], fetchImpl);

      assert.equal(await readFile(join(destDir, "x.png"), "utf8"), "x");
    });
  });

  it("throws, naming the failed file, on a non-OK response — never writes a partial file for it", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "assets");
      const fetchImpl = stubFetch({
        "https://example.com/ok.png": { ok: true, body: "ok" },
        "https://example.com/broken.png": { ok: false, status: 403 },
      });

      await assert.rejects(
        downloadAssetFiles(
          destDir,
          [
            { url: "https://example.com/ok.png", filename: "0-ok.png" },
            { url: "https://example.com/broken.png", filename: "1-broken.png" },
          ],
          fetchImpl,
        ),
        /1-broken\.png.*403/s,
      );

      // the first (successful) target still wrote — the failure is attributable to the second only.
      assert.equal(await readFile(join(destDir, "0-ok.png"), "utf8"), "ok");
      const entries = await readdir(destDir);
      assert.equal(entries.includes("1-broken.png"), false);
    });
  });

  it("throws, naming the failed file, when the fetch itself rejects (network error)", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "assets");
      const fetchImpl = async (): Promise<Response> => {
        throw new Error("ECONNRESET");
      };

      await assert.rejects(
        downloadAssetFiles(destDir, [{ url: "https://example.com/x.png", filename: "x.png" }], fetchImpl),
        /x\.png.*ECONNRESET/s,
      );
    });
  });

  it("an empty target list creates the destination directory and downloads nothing", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "assets");
      const results = await downloadAssetFiles(destDir, [], stubFetch({}));
      assert.deepEqual(results, []);
      assert.deepEqual(await readdir(destDir), []);
    });
  });
});
