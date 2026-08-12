/**
 * Tests for `src/asset/carousel-real-media.ts` (ADR-0024, issue #188). Every test injects a LOCAL FAKE
 * downloader — no test in this file ever calls `defaultCarouselMediaDownload` or the real `fetch`, and
 * NOTHING here ever calls a Magnific `spaces_*`/`creations_*` tool (there are none to call — this
 * module never touches a Space at all). Hermetic: no network, no credits, no board mutation.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  resolveCarouselSlideMedia,
  resolveCarouselMedia,
  applyCarouselMediaResolutions,
  MIN_IMAGE_BYTES,
  MIN_VIDEO_BYTES,
  type CarouselMediaDownloader,
  type CarouselSlideLike,
} from "./carousel-real-media.ts";
import { hasVideoSlide } from "../production-spec/news-carousel-contract.ts";
import type { CarouselSlide, NewsCarouselSpec } from "../production-spec/news-carousel-contract.ts";

function bigBytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(1);
}

function generatedSlide(i: number): CarouselSlideLike {
  return { slide_index: i, role: "then" };
}

function imageSlide(i: number, sourceUrl = "https://example.com/story/photo.jpg"): CarouselSlideLike {
  return { slide_index: i, role: "proof", kind: "image", source_url: sourceUrl };
}

function videoSlide(i: number, sourceUrl = "https://example.com/story/clip.mp4"): CarouselSlideLike {
  return { slide_index: i, role: "proof", kind: "video", source_url: sourceUrl };
}

describe("resolveCarouselSlideMedia — fetch-first, fallback-to-generated, no pause (ADR-0024, issue #188)", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "og-carousel-real-media-"));
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });
  after(async () => cleanup());

  it("a generated-kind slide (or one with no kind at all) resolves to null — download is never called", async () => {
    let calls = 0;
    const download: CarouselMediaDownloader = async () => {
      calls += 1;
      return { ok: true, bytes: bigBytes(MIN_IMAGE_BYTES) };
    };
    const explicit = await resolveCarouselSlideMedia({ ...generatedSlide(0), kind: "generated" }, dir, { download });
    const implicit = await resolveCarouselSlideMedia(generatedSlide(1), dir, { download });
    assert.equal(explicit, null);
    assert.equal(implicit, null);
    assert.equal(calls, 0);
  });

  it("a reachable, adequate image source is fetched, written to disk, and resolves 'image' — no pause, a plain awaited call", async () => {
    const download: CarouselMediaDownloader = async () => ({
      ok: true,
      bytes: bigBytes(MIN_IMAGE_BYTES + 1),
      contentType: "image/jpeg",
    });
    const resolution = await resolveCarouselSlideMedia(imageSlide(3), dir, { download });
    assert.ok(resolution);
    assert.equal(resolution.slideIndex, 3);
    assert.equal(resolution.requestedKind, "image");
    assert.equal(resolution.resolvedKind, "image");
    assert.equal(resolution.outcome.kind, "fetched");
    if (resolution.outcome.kind !== "fetched") return;
    assert.equal(resolution.outcome.filename, "slide-04-media.jpg");
    const written = await readFile(resolution.outcome.path);
    assert.equal(written.length, MIN_IMAGE_BYTES + 1);
  });

  it("a reachable, adequate video source is fetched, written to disk, and resolves 'video'", async () => {
    const download: CarouselMediaDownloader = async () => ({
      ok: true,
      bytes: bigBytes(MIN_VIDEO_BYTES + 1),
      contentType: "video/mp4",
    });
    const resolution = await resolveCarouselSlideMedia(videoSlide(3), dir, { download });
    assert.ok(resolution);
    assert.equal(resolution.resolvedKind, "video");
    assert.equal(resolution.outcome.kind, "fetched");
    if (resolution.outcome.kind !== "fetched") return;
    assert.equal(resolution.outcome.filename, "slide-04-media.mp4");
  });

  it("an unreachable source (download returns ok:false) falls back to 'generated', naming the error — no file written", async () => {
    const download: CarouselMediaDownloader = async () => ({ ok: false, error: "404 Not Found" });
    const resolution = await resolveCarouselSlideMedia(imageSlide(2), dir, { download });
    assert.ok(resolution);
    assert.equal(resolution.resolvedKind, "generated");
    assert.equal(resolution.outcome.kind, "fallback");
    if (resolution.outcome.kind !== "fallback") return;
    assert.equal(resolution.outcome.reason, "unreachable");
    assert.equal(resolution.outcome.error, "404 Not Found");
  });

  it("a download that THROWS also falls back to 'generated' — never propagates the throw", async () => {
    const download: CarouselMediaDownloader = async () => {
      throw new Error("stream unavailable");
    };
    await assert.doesNotReject(() => resolveCarouselSlideMedia(imageSlide(2), dir, { download }));
    const resolution = await resolveCarouselSlideMedia(imageSlide(2), dir, { download });
    assert.ok(resolution);
    assert.equal(resolution.outcome.kind, "fallback");
    if (resolution.outcome.kind !== "fallback") return;
    assert.equal(resolution.outcome.reason, "unreachable");
    assert.match(resolution.outcome.error!, /stream unavailable/);
  });

  it("a reachable but TOO-SMALL response falls back with reason 'low_quality' — never written to disk", async () => {
    const download: CarouselMediaDownloader = async () => ({
      ok: true,
      bytes: bigBytes(10),
      contentType: "image/jpeg",
    });
    const resolution = await resolveCarouselSlideMedia(imageSlide(5), dir, { download });
    assert.ok(resolution);
    assert.equal(resolution.resolvedKind, "generated");
    assert.equal(resolution.outcome.kind, "fallback");
    if (resolution.outcome.kind !== "fallback") return;
    assert.equal(resolution.outcome.reason, "low_quality");
  });

  it("a reachable, big-enough response with the WRONG content-type family falls back with reason 'low_quality'", async () => {
    const download: CarouselMediaDownloader = async () => ({
      ok: true,
      bytes: bigBytes(MIN_IMAGE_BYTES + 1),
      contentType: "text/html",
    });
    const resolution = await resolveCarouselSlideMedia(imageSlide(5), dir, { download });
    assert.ok(resolution);
    assert.equal(resolution.outcome.kind, "fallback");
    if (resolution.outcome.kind !== "fallback") return;
    assert.equal(resolution.outcome.reason, "low_quality");
  });

  it("a slide typed image/video but with no source_url at all falls back, unreachable, without ever calling download", async () => {
    let calls = 0;
    const download: CarouselMediaDownloader = async () => {
      calls += 1;
      return { ok: true, bytes: bigBytes(MIN_IMAGE_BYTES + 1) };
    };
    const resolution = await resolveCarouselSlideMedia({ slide_index: 1, role: "then", kind: "image" }, dir, {
      download,
    });
    assert.ok(resolution);
    assert.equal(resolution.outcome.kind, "fallback");
    if (resolution.outcome.kind !== "fallback") return;
    assert.equal(resolution.outcome.reason, "unreachable");
    assert.equal(calls, 0);
  });

  it("never pauses for input — the whole decision is a single, non-interactive await", async () => {
    // Nothing here calls a prompt/gate/AskUserQuestion-style primitive; proven simply by the function
    // signature (slide, destDir, options) -> Promise<...> with no interactive channel at all.
    const download: CarouselMediaDownloader = async () => ({ ok: false, error: "boom" });
    const result = await resolveCarouselSlideMedia(imageSlide(0), dir, { download });
    assert.equal(typeof result, "object");
  });
});

describe("resolveCarouselMedia — resolves every image/video slide of a Spec, sequential, in slide order", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "og-carousel-real-media-batch-"));
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });
  after(async () => cleanup());

  it("contributes nothing for a generated-only Spec", async () => {
    const download: CarouselMediaDownloader = async () => ({ ok: true, bytes: bigBytes(MIN_IMAGE_BYTES + 1) });
    const spec = { slides: [generatedSlide(0), generatedSlide(1), generatedSlide(2)] };
    const results = await resolveCarouselMedia(spec, dir, { download });
    assert.deepEqual(results, []);
  });

  it("resolves a mix of generated/image/video slides, one entry per attempted slide, in slide order", async () => {
    const download: CarouselMediaDownloader = async (url) =>
      url.includes("clip")
        ? { ok: true, bytes: bigBytes(MIN_VIDEO_BYTES + 1), contentType: "video/mp4" }
        : { ok: true, bytes: bigBytes(MIN_IMAGE_BYTES + 1), contentType: "image/jpeg" };
    const spec = {
      slides: [generatedSlide(0), imageSlide(1), generatedSlide(2), videoSlide(3), imageSlide(4)],
    };
    const results = await resolveCarouselMedia(spec, dir, { download });
    assert.equal(results.length, 3);
    assert.deepEqual(results.map((r) => r.slideIndex), [1, 3, 4]);
    assert.deepEqual(results.map((r) => r.resolvedKind), ["image", "video", "image"]);
  });

  it("never throws, even with a mix of every outcome (fetched, unreachable, low_quality)", async () => {
    const download: CarouselMediaDownloader = async (url) => {
      if (url.includes("ok")) return { ok: true, bytes: bigBytes(MIN_IMAGE_BYTES + 1), contentType: "image/jpeg" };
      if (url.includes("throws")) throw new Error("network down");
      if (url.includes("tiny")) return { ok: true, bytes: bigBytes(5) };
      return { ok: false, error: "unreachable" };
    };
    const spec = {
      slides: [
        imageSlide(0, "https://example.com/ok.jpg"),
        imageSlide(1, "https://example.com/throws.jpg"),
        imageSlide(2, "https://example.com/tiny.jpg"),
        imageSlide(3, "https://example.com/unreachable.jpg"),
      ],
    };
    await assert.doesNotReject(() => resolveCarouselMedia(spec, dir, { download }));
    const results = await resolveCarouselMedia(spec, dir, { download });
    assert.deepEqual(
      results.map((r) => r.outcome.kind),
      ["fetched", "fallback", "fallback", "fallback"],
    );
  });
});

// ---------------------------------------------------------------------------
// applyCarouselMediaResolutions
// ---------------------------------------------------------------------------

function baseSlide(i: number, role: CarouselSlide["role"]): CarouselSlide {
  return {
    slide_index: i,
    role,
    card_style: "full_width",
    stat_callout: "Stat.",
    text: "Text.",
    companies: [],
    image_prompt: `prompt for slide ${i}`,
  };
}

describe("applyCarouselMediaResolutions — bakes the RESOLVED (post-fallback) kind back into the Spec", () => {
  it("a successfully-fetched slide is left exactly as authored (kind/source_url unchanged)", () => {
    const spec: NewsCarouselSpec = {
      slides: [
        { ...baseSlide(0, "hook"), kind: "image", source_url: "https://example.com/a.jpg" },
      ],
    };
    const resolved = applyCarouselMediaResolutions(spec, [
      {
        slideIndex: 0,
        role: "hook",
        requestedKind: "image",
        sourceUrl: "https://example.com/a.jpg",
        resolvedKind: "image",
        outcome: { kind: "fetched", path: "/tmp/x.jpg", filename: "x.jpg" },
      },
    ]);
    assert.deepEqual(resolved.slides[0], spec.slides[0]);
  });

  it("a fallen-back slide is demoted to kind 'generated', with source_url dropped entirely", () => {
    const spec: NewsCarouselSpec = {
      slides: [{ ...baseSlide(0, "hook"), kind: "video", source_url: "https://example.com/a.mp4" }],
    };
    const resolved = applyCarouselMediaResolutions(spec, [
      {
        slideIndex: 0,
        role: "hook",
        requestedKind: "video",
        sourceUrl: "https://example.com/a.mp4",
        resolvedKind: "generated",
        outcome: { kind: "fallback", reason: "unreachable", error: "404" },
      },
    ]);
    assert.equal(resolved.slides[0]!.kind, "generated");
    assert.equal("source_url" in resolved.slides[0]!, false);
  });

  it("a slide with no matching resolution (already generated) is left untouched", () => {
    const spec: NewsCarouselSpec = { slides: [baseSlide(0, "then")] };
    const resolved = applyCarouselMediaResolutions(spec, []);
    assert.deepEqual(resolved.slides[0], spec.slides[0]);
  });

  it("is pure — never mutates the input Spec", () => {
    const spec: NewsCarouselSpec = {
      slides: [{ ...baseSlide(0, "hook"), kind: "video", source_url: "https://example.com/a.mp4" }],
    };
    const before = structuredClone(spec);
    applyCarouselMediaResolutions(spec, [
      {
        slideIndex: 0,
        role: "hook",
        requestedKind: "video",
        sourceUrl: "https://example.com/a.mp4",
        resolvedKind: "generated",
        outcome: { kind: "fallback", reason: "low_quality" },
      },
    ]);
    assert.deepEqual(spec, before);
  });

  it("end-to-end: hasVideoSlide reads the ACTUAL, post-fallback shape — never the authored intent", () => {
    const requestedVideoSpec: NewsCarouselSpec = {
      slides: [{ ...baseSlide(0, "hook"), kind: "video", source_url: "https://example.com/a.mp4" }],
    };
    // The fetch failed -> falls back to generated -> hasVideoSlide must read FALSE, even though the
    // Skill originally REQUESTED a video slide.
    const resolvedAfterFallback = applyCarouselMediaResolutions(requestedVideoSpec, [
      {
        slideIndex: 0,
        role: "hook",
        requestedKind: "video",
        sourceUrl: "https://example.com/a.mp4",
        resolvedKind: "generated",
        outcome: { kind: "fallback", reason: "unreachable" },
      },
    ]);
    assert.equal(hasVideoSlide(resolvedAfterFallback), false);

    // The fetch succeeded -> stays video -> hasVideoSlide reads TRUE.
    const resolvedAfterSuccess = applyCarouselMediaResolutions(requestedVideoSpec, [
      {
        slideIndex: 0,
        role: "hook",
        requestedKind: "video",
        sourceUrl: "https://example.com/a.mp4",
        resolvedKind: "video",
        outcome: { kind: "fetched", path: "/tmp/a.mp4", filename: "a.mp4" },
      },
    ]);
    assert.equal(hasVideoSlide(resolvedAfterSuccess), true);
  });
});
