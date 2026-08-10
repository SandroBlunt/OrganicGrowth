/**
 * Tests for `src/asset/shot-list-media.ts` (issue #174). Every test injects a LOCAL FAKE downloader —
 * no test in this file ever calls `defaultShotListDownload` or the real `fetch`; this is the
 * "media-download tests must use local fakes/fixtures, never real network fetches" guarantee.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectShotListMedia,
  downloadedMediaPaths,
  type ShotListDownloader,
} from "./shot-list-media.ts";
import { validNewsShortScriptSpec } from "../production-spec/fixtures/news-short-script-specs.ts";
import type { NewsShortScriptSpec } from "../production-spec/news-short-script-contract.ts";

function specFixture(): NewsShortScriptSpec {
  return validNewsShortScriptSpec() as unknown as NewsShortScriptSpec;
}

describe("collectShotListMedia — best-effort, never fails the job (issue #174, ADR-0021)", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "og-shot-list-media-"));
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });
  after(async () => cleanup());

  it("a beat with no media_url resolves to a link, pointing at source_url, with no download attempted", async () => {
    const spec = specFixture();
    let calls = 0;
    const download: ShotListDownloader = async () => {
      calls += 1;
      return { ok: true, bytes: new Uint8Array([1]) };
    };
    const results = await collectShotListMedia(spec, dir, { download });

    // Beat index 1 (the first "story" beat in the fixture) has no media_url.
    const beat1 = results.find((r) => r.beatIndex === 1)!;
    assert.equal(beat1.media.kind, "link");
    if (beat1.media.kind !== "link") return;
    assert.equal(beat1.media.reason, "no_media_url");
    assert.equal(beat1.media.url, spec.beats[1]!.source_url);
    // download() was called only for beats that DO carry a media_url (beats 0 and 2 of the 4 fixture beats).
    assert.equal(calls, 2);
  });

  it("a beat whose download succeeds is marked downloaded, and the file lands on disk", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async (url) => ({
      ok: true,
      bytes: new TextEncoder().encode(`fake bytes for ${url}`),
      contentType: "video/mp4",
    });
    const results = await collectShotListMedia(spec, dir, { download });

    const beat0 = results.find((r) => r.beatIndex === 0)!;
    assert.equal(beat0.media.kind, "downloaded");
    if (beat0.media.kind !== "downloaded") return;
    assert.equal(beat0.media.filename, "beat-01-media.mp4");
    const written = await readFile(beat0.media.path, "utf8");
    assert.match(written, /fake bytes for/);
  });

  it("a beat whose download returns ok:false falls back to a marked link, naming the error", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async () => ({ ok: false, error: "404 Not Found" });
    const results = await collectShotListMedia(spec, dir, { download });

    const beat0 = results.find((r) => r.beatIndex === 0)!;
    assert.equal(beat0.media.kind, "link");
    if (beat0.media.kind !== "link") return;
    assert.equal(beat0.media.reason, "download_failed");
    assert.equal(beat0.media.error, "404 Not Found");
    assert.equal(beat0.media.url, spec.beats[0]!.media_url);
  });

  it("a beat whose download THROWS also falls back to a marked link — never propagates the throw", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async () => {
      throw new Error("stream unavailable");
    };
    const results = await collectShotListMedia(spec, dir, { download });

    const beat0 = results.find((r) => r.beatIndex === 0)!;
    assert.equal(beat0.media.kind, "link");
    if (beat0.media.kind !== "link") return;
    assert.equal(beat0.media.reason, "download_failed");
    assert.match(beat0.media.error!, /stream unavailable/);
  });

  it("results preserve beat order, one entry per beat, regardless of outcome mix", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async (url) =>
      url.includes("interview") ? { ok: false, error: "boom" } : { ok: true, bytes: new Uint8Array([9]) };
    const results = await collectShotListMedia(spec, dir, { download });

    assert.equal(results.length, spec.beats.length);
    assert.deepEqual(results.map((r) => r.beatIndex), [0, 1, 2, 3]);
    assert.deepEqual(results.map((r) => r.role), spec.beats.map((b) => b.role));
  });

  it("never throws out of the whole collection, even with a mix of every outcome", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async (url) => {
      if (url.includes("announcement")) return { ok: true, bytes: new Uint8Array([1]) };
      if (url.includes("interview")) throw new Error("network down");
      return { ok: false, error: "unreachable" };
    };
    await assert.doesNotReject(() => collectShotListMedia(spec, dir, { download }));
  });

  it("downloadedMediaPaths returns only the downloaded beats' local paths, in beat order", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async (url) =>
      url.includes("interview") ? { ok: false, error: "boom" } : { ok: true, bytes: new Uint8Array([1]) };
    const results = await collectShotListMedia(spec, dir, { download });
    const paths = downloadedMediaPaths(results);
    // Fixture has media_url on beats 0 and 2; beat 2's ("interview") download fails -> link, not downloaded.
    assert.equal(paths.length, 1);
    assert.match(paths[0]!, /beat-01-media/);
  });

  it("creates destDir only when at least one beat actually downloads (mkdir is lazy, but still safe when nothing downloads)", async () => {
    const emptyDir = join(dir, "no-downloads-here");
    const spec = specFixture();
    // Strip every media_url so nothing is ever attempted.
    const noMedia: NewsShortScriptSpec = {
      beats: spec.beats.map((b) => {
        const { media_url: _dropped, ...rest } = b;
        return rest;
      }),
    };
    const download: ShotListDownloader = async () => ({ ok: true, bytes: new Uint8Array([1]) });
    const results = await collectShotListMedia(noMedia, emptyDir, { download });
    assert.ok(results.every((r) => r.media.kind === "link"));
    // No crash even though emptyDir was never created — nothing needed writing into it.
    await assert.rejects(() => readdir(emptyDir));
  });
});
