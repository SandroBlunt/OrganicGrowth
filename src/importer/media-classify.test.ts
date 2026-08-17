/**
 * Tests for `classifyMedia` (`src/importer/media-classify.ts`) — issue #204.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyMedia } from "./media-classify.ts";

describe("classifyMedia — kind + mime from a filename's extension", () => {
  it("classifies a .png as image/image-png", () => {
    assert.deepEqual(classifyMedia("0-hook.png"), { kind: "image", mime: "image/png" });
  });

  it("classifies a .jpg as image/image-jpeg", () => {
    assert.deepEqual(classifyMedia("1-then.jpg"), { kind: "image", mime: "image/jpeg" });
  });

  it("classifies a .jpeg as image/image-jpeg too", () => {
    assert.deepEqual(classifyMedia("photo.jpeg"), { kind: "image", mime: "image/jpeg" });
  });

  it("classifies a .mp4 as video/video-mp4", () => {
    assert.deepEqual(classifyMedia("clip.mp4"), { kind: "video", mime: "video/mp4" });
  });

  it("classifies a .wav as audio/audio-wav", () => {
    assert.deepEqual(classifyMedia("beat-01-media.wav"), { kind: "audio", mime: "audio/wav" });
  });

  it("is case-insensitive on the extension", () => {
    assert.deepEqual(classifyMedia("SHOT.PNG"), { kind: "image", mime: "image/png" });
  });

  it("returns null for an unrecognized extension (e.g. a dead script.txt reference)", () => {
    assert.equal(classifyMedia("script.txt"), null);
  });

  it("returns null for a filename with no extension", () => {
    assert.equal(classifyMedia("README"), null);
  });
});
