import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mediaKindFromContentType, extensionForContentType, extensionFromUrl } from "./media-kind.ts";

describe("mediaKindFromContentType — pure content-type -> MediaKind mapping", () => {
  it("classifies video/*, audio/*, and everything else as image (issue #208)", () => {
    assert.equal(mediaKindFromContentType("video/mp4"), "video");
    assert.equal(mediaKindFromContentType("audio/mpeg"), "audio");
    assert.equal(mediaKindFromContentType("image/png"), "image");
    assert.equal(mediaKindFromContentType(undefined), "image");
    assert.equal(mediaKindFromContentType("application/octet-stream"), "image");
  });
});

describe("extensionForContentType — pure content-type -> file extension mapping", () => {
  it("maps known content types to their extension, defaulting to .bin", () => {
    assert.equal(extensionForContentType("image/png"), ".png");
    assert.equal(extensionForContentType("image/jpeg"), ".jpg");
    assert.equal(extensionForContentType("video/mp4"), ".mp4");
    assert.equal(extensionForContentType(undefined), ".bin");
    assert.equal(extensionForContentType("application/octet-stream"), ".bin");
  });
});

describe("extensionFromUrl — pure, best-effort extension inference from a rendered creation's URL", () => {
  it("reads a recognizable trailing extension, ignoring a query string", () => {
    assert.equal(extensionFromUrl("https://magnific.example/carousel/asset/1.png"), ".png");
    assert.equal(extensionFromUrl("https://magnific.example/asset/1.mp4"), ".mp4");
    assert.equal(extensionFromUrl("https://magnific.example/asset/1.jpg?sig=abc"), ".jpg");
  });

  it("defaults to .bin when the URL carries no recognizable extension", () => {
    assert.equal(extensionFromUrl("https://magnific.example/asset/opaque-id"), ".bin");
  });
});
