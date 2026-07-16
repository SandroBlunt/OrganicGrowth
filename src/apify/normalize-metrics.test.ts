/**
 * Tests for `mapInstagramItem` / `mapYoutubeItem` — pure, no I/O.
 *
 * The fixtures in `./fixtures/*.sample.json` are SANITIZED captures from real, sanctioned live Apify
 * verification runs (issue #48 — see `fixtures/README.md`). These are the "Magnific fake" equivalent
 * for this slice: no live Apify call happens during `npm test`, and there is no Magnific Space
 * involvement at all in this slice.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mapInstagramItem, mapYoutubeItem } from "./normalize-metrics.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<unknown[]> {
  const text = await readFile(join(HERE, "fixtures", name), "utf8");
  return JSON.parse(text) as unknown[];
}

// ---------------------------------------------------------------------------
// mapInstagramItem — against real (sanitized) captures
// ---------------------------------------------------------------------------

describe("mapInstagramItem — maps real captured Instagram items defensively", () => {
  it("maps a non-video (Sidecar) profile post: reactions/comments from counts, views 0 (no video fields)", async () => {
    const items = await loadFixture("instagram-profile-posts.sample.json");
    const sidecar = items[0] as Record<string, unknown>;
    assert.equal(sidecar.type, "Sidecar", "fixture assumption: first item is a non-video post");

    const mapped = mapInstagramItem(sidecar);
    assert.equal(mapped.url, "https://www.instagram.com/p/Da2q0HRgN9t/");
    assert.equal(mapped.postedAt, "2026-07-16T12:44:03.000Z");
    assert.equal(mapped.reactions, 2309);
    assert.equal(mapped.comments, 621);
    assert.equal(mapped.views, 0, "a non-video post has no videoPlayCount/videoViewCount");
    assert.equal(mapped.shares, 0);
  });

  it("maps a Video post's views from videoPlayCount", async () => {
    const items = await loadFixture("instagram-profile-posts.sample.json");
    const video = items.find((i) => (i as Record<string, unknown>).type === "Video") as Record<string, unknown>;
    assert.ok(video, "fixture must contain at least one Video-type item");

    const mapped = mapInstagramItem(video);
    assert.equal(mapped.views, 674393);
    assert.equal(mapped.reactions, 16310);
    assert.equal(mapped.comments, 584);
  });

  it("maps the single-post-scraper fixture (apify/instagram-post-scraper)", async () => {
    const items = await loadFixture("instagram-post.sample.json");
    const mapped = mapInstagramItem(items[0]);
    assert.equal(mapped.url, "https://www.instagram.com/p/Da0YoASz8cj/");
    assert.equal(mapped.reactions, 16311);
    assert.equal(mapped.comments, 585);
    assert.equal(mapped.views, 674539);
    assert.equal(mapped.shares, 0);
  });

  it("always reports shares as 0 with a note — Instagram does not publicly expose share counts", async () => {
    const items = await loadFixture("instagram-post.sample.json");
    const mapped = mapInstagramItem(items[0]);
    assert.equal(mapped.shares, 0);
    assert.ok(
      mapped.notes.some((n) => /shares/.test(n) && /Instagram/.test(n)),
      "notes must explain the shares:0 default",
    );
  });

  it("defaults every numeric field to 0 and notes it for a garbled/empty item (never throws)", () => {
    const mapped = mapInstagramItem({});
    assert.equal(mapped.reactions, 0);
    assert.equal(mapped.comments, 0);
    assert.equal(mapped.views, 0);
    assert.equal(mapped.shares, 0);
    assert.equal(mapped.url, null);
    assert.equal(mapped.postedAt, null);
    assert.ok(mapped.notes.length >= 4, "one note per defaulted field, plus the shares note");
  });

  it("never throws on null/undefined/non-object input", () => {
    assert.doesNotThrow(() => mapInstagramItem(null));
    assert.doesNotThrow(() => mapInstagramItem(undefined));
    assert.doesNotThrow(() => mapInstagramItem("not an object"));
    assert.doesNotThrow(() => mapInstagramItem(42));
  });

  it("ignores negative/NaN/non-numeric values and defaults them to 0", () => {
    const mapped = mapInstagramItem({ likesCount: -5, commentsCount: "no", videoPlayCount: NaN });
    assert.equal(mapped.reactions, 0);
    assert.equal(mapped.comments, 0);
    assert.equal(mapped.views, 0);
  });
});

// ---------------------------------------------------------------------------
// mapYoutubeItem — against real (sanitized) captures
// ---------------------------------------------------------------------------

describe("mapYoutubeItem — maps real captured YouTube items defensively", () => {
  it("maps a channel-video-list item (streamers/youtube-scraper)", async () => {
    const items = await loadFixture("youtube-channel-videos.sample.json");
    const first = items[0] as Record<string, unknown>;
    const mapped = mapYoutubeItem(first);
    assert.equal(mapped.url, "https://www.youtube.com/watch?v=llFR17DcfMo");
    assert.equal(mapped.postedAt, "2026-06-30T17:52:04.000Z");
    assert.equal(mapped.reactions, 491);
    assert.equal(mapped.comments, 56);
    assert.equal(mapped.views, 13103);
    assert.equal(mapped.shares, 0);
  });

  it("maps all items in the channel-video-list fixture without loss", async () => {
    const items = await loadFixture("youtube-channel-videos.sample.json");
    const mapped = items.map((i) => mapYoutubeItem(i));
    assert.equal(mapped.length, 3);
    assert.deepEqual(mapped.map((m) => m.views), [13103, 6505, 10228]);
    assert.deepEqual(mapped.map((m) => m.reactions), [491, 234, 361]);
    assert.deepEqual(mapped.map((m) => m.comments), [56, 29, 53]);
  });

  it("maps the single-video fixture identically to its channel-list counterpart", async () => {
    const items = await loadFixture("youtube-video.sample.json");
    const mapped = mapYoutubeItem(items[0]);
    assert.equal(mapped.views, 13103);
    assert.equal(mapped.reactions, 491);
    assert.equal(mapped.comments, 56);
  });

  it("always reports shares as 0 with a note — YouTube does not publicly expose share counts", async () => {
    const items = await loadFixture("youtube-video.sample.json");
    const mapped = mapYoutubeItem(items[0]);
    assert.equal(mapped.shares, 0);
    assert.ok(
      mapped.notes.some((n) => /shares/.test(n) && /YouTube/.test(n)),
      "notes must explain the shares:0 default",
    );
  });

  it("defaults every numeric field to 0 and notes it for a garbled/empty item (never throws)", () => {
    const mapped = mapYoutubeItem({});
    assert.equal(mapped.reactions, 0);
    assert.equal(mapped.comments, 0);
    assert.equal(mapped.views, 0);
    assert.equal(mapped.shares, 0);
    assert.equal(mapped.url, null);
    assert.equal(mapped.postedAt, null);
    assert.ok(mapped.notes.length >= 4);
  });

  it("never throws on null/undefined/non-object input", () => {
    assert.doesNotThrow(() => mapYoutubeItem(null));
    assert.doesNotThrow(() => mapYoutubeItem(undefined));
    assert.doesNotThrow(() => mapYoutubeItem("not an object"));
    assert.doesNotThrow(() => mapYoutubeItem(42));
  });
});
