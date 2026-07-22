/**
 * Tests for `src/asset/cast-candidates.ts` (issue #119).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { castCandidatesDirFor, castCandidateFilename, downloadCastCandidates } from "./cast-candidates.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-cast-candidates-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A hand-rolled fetch stub — never touches the network (mirrors download.test.ts's own helper). */
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

// ---------------------------------------------------------------------------
// castCandidatesDirFor — mirrors outputDirFor's convention, with .cast in place of .output
// ---------------------------------------------------------------------------

describe("castCandidatesDirFor — mirrors outputDirFor's id/run/recipe convention, with .cast in place of .output", () => {
  it("builds <ideasRoot>/<run>/idea-NN.<recipe>.cast for a full ledger id", () => {
    const dir = castCandidatesDirFor(
      "idea-2026-W30-01",
      "2026-W30",
      "data/brands/straw-motion/ideas",
      "character-explainer-with-cast",
    );
    assert.equal(
      dir,
      join("data/brands/straw-motion/ideas", "2026-W30", "idea-01.character-explainer-with-cast.cast"),
    );
  });

  it("never returns the .output or .spec.json/.assets names", () => {
    const dir = castCandidatesDirFor("idea-2026-W22-03", "2026-W22", "data/brands/mundotip/ideas", "character-explainer-with-cast");
    assert.ok(dir.endsWith(".cast"));
    assert.ok(!dir.endsWith(".output"));
    assert.ok(!dir.endsWith(".assets"));
    assert.ok(!dir.endsWith(".spec.json"));
  });

  it("handles an already-short idea id (no run prefix) the same way briefShortName/outputDirFor do", () => {
    const dir = castCandidatesDirFor("idea-01", "2026-W22", "ideas", "character-explainer-with-cast");
    assert.equal(dir, join("ideas", "2026-W22", "idea-01.character-explainer-with-cast.cast"));
  });

  it("is Recipe-generic: a DIFFERENT Recipe slug produces its OWN distinct directory, never hard-coded", () => {
    const wired = castCandidatesDirFor("idea-01", "2026-W22", "ideas", "character-explainer-with-cast");
    const future = castCandidatesDirFor("idea-01", "2026-W22", "ideas", "some-future-cast-recipe");
    assert.notEqual(wired, future);
    assert.ok(future.endsWith("idea-01.some-future-cast-recipe.cast"));
  });
});

// ---------------------------------------------------------------------------
// castCandidateFilename — pure, per-candidate naming
// ---------------------------------------------------------------------------

describe("castCandidateFilename — a stable, readable name per candidate", () => {
  it("names the file <index>-<identifier> with the URL's own extension", () => {
    const name = castCandidateFilename(1, { identifier: "cast-1", url: "https://magnific.example/cast/1.png" });
    assert.equal(name, "1-cast-1.png");
  });

  it("picks up a non-png extension from the URL", () => {
    const name = castCandidateFilename(3, { identifier: "cast-3", url: "https://magnific.example/cast/3.jpg" });
    assert.equal(name, "3-cast-3.jpg");
  });

  it("defaults to .png when the URL has no recognizable extension", () => {
    const name = castCandidateFilename(2, { identifier: "cast-2", url: "https://magnific.example/cast/render" });
    assert.equal(name, "2-cast-2.png");
  });

  it("ignores a query string when guessing the extension", () => {
    const name = castCandidateFilename(1, {
      identifier: "cast-1",
      url: "https://magnific.example/cast/1.png?token=abc123",
    });
    assert.equal(name, "1-cast-1.png");
  });

  it("falls back to .png for a malformed (unparseable) URL rather than throwing", () => {
    const name = castCandidateFilename(1, { identifier: "cast-1", url: "not-a-url" });
    assert.equal(name, "1-cast-1.png");
  });
});

// ---------------------------------------------------------------------------
// downloadCastCandidates — download every candidate, zip into ledger-ready records
// ---------------------------------------------------------------------------

describe("downloadCastCandidates — downloads every candidate and returns it ready for the ledger", () => {
  it("downloads all candidates, in order, and each result carries identifier/url/path", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "idea-01.character-explainer-with-cast.cast");
      const candidates = [
        { identifier: "cast-1", url: "https://magnific.example/cast/1.png" },
        { identifier: "cast-2", url: "https://magnific.example/cast/2.png" },
        { identifier: "cast-3", url: "https://magnific.example/cast/3.png" },
      ];
      const fetchImpl = stubFetch({
        "https://magnific.example/cast/1.png": { ok: true, body: "concept-1a" },
        "https://magnific.example/cast/2.png": { ok: true, body: "concept-1b" },
        "https://magnific.example/cast/3.png": { ok: true, body: "concept-2a" },
      });

      const result = await downloadCastCandidates(destDir, candidates, fetchImpl);

      assert.equal(result.length, 3);
      assert.deepEqual(result, [
        { identifier: "cast-1", url: "https://magnific.example/cast/1.png", path: join(destDir, "1-cast-1.png") },
        { identifier: "cast-2", url: "https://magnific.example/cast/2.png", path: join(destDir, "2-cast-2.png") },
        { identifier: "cast-3", url: "https://magnific.example/cast/3.png", path: join(destDir, "3-cast-3.png") },
      ]);

      assert.equal(await readFile(join(destDir, "1-cast-1.png"), "utf8"), "concept-1a");
      assert.equal(await readFile(join(destDir, "2-cast-2.png"), "utf8"), "concept-1b");
      assert.equal(await readFile(join(destDir, "3-cast-3.png"), "utf8"), "concept-2a");

      const entries = (await readdir(destDir)).sort();
      assert.deepEqual(entries, ["1-cast-1.png", "2-cast-2.png", "3-cast-3.png"]);
    });
  });

  it("throws, naming the failed candidate, on a non-OK response — never records a partial Cast", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "idea-01.character-explainer-with-cast.cast");
      const candidates = [
        { identifier: "cast-1", url: "https://magnific.example/cast/1.png" },
        { identifier: "cast-2", url: "https://magnific.example/cast/2.png" },
      ];
      const fetchImpl = stubFetch({
        "https://magnific.example/cast/1.png": { ok: true, body: "ok" },
        "https://magnific.example/cast/2.png": { ok: false, status: 403 },
      });

      await assert.rejects(downloadCastCandidates(destDir, candidates, fetchImpl), /2-cast-2\.png.*403/s);
    });
  });

  it("an empty candidate list creates the destination directory and downloads nothing", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "idea-01.character-explainer-with-cast.cast");
      const result = await downloadCastCandidates(destDir, [], stubFetch({}));
      assert.deepEqual(result, []);
      assert.deepEqual(await readdir(destDir), []);
    });
  });

  it("is Recipe/gate-generic: works identically for an arbitrary candidate set with no Recipe-specific shape", async () => {
    await withTempDir(async (dir) => {
      const destDir = join(dir, "idea-07.some-future-cast-recipe.cast");
      const candidates = [{ identifier: "variant-a", url: "https://magnific.example/variant/a.webp" }];
      const fetchImpl = stubFetch({ "https://magnific.example/variant/a.webp": { ok: true, body: "bytes" } });

      const result = await downloadCastCandidates(destDir, candidates, fetchImpl);
      assert.deepEqual(result, [
        { identifier: "variant-a", url: "https://magnific.example/variant/a.webp", path: join(destDir, "1-variant-a.webp") },
      ]);
    });
  });
});
