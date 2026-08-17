import { describe, it } from "node:test";
import assert from "node:assert/strict";

import jpeg from "jpeg-js";

import { encodeJpeg } from "./jpeg-encode.ts";

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** Builds a small, deterministic RGBA buffer: four solid quadrants, each a distinct color — enough
 *  structure that a byte-for-byte-wrong encoder (e.g. channels swapped) would fail the round-trip check
 *  below, while still tiny and fast. */
function buildQuadrantRgba(size: number): { readonly rgba: Buffer; readonly width: number; readonly height: number } {
  const width = size;
  const height = size;
  const rgba = Buffer.alloc(width * height * 4);
  const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const quadrant = (x < width / 2 ? 0 : 1) + (y < height / 2 ? 0 : 2);
      const color = colors[quadrant]!;
      const r = color[0]!;
      const g = color[1]!;
      const b = color[2]!;
      const px = (y * width + x) * 4;
      rgba[px] = r;
      rgba[px + 1] = g;
      rgba[px + 2] = b;
      rgba[px + 3] = 255;
    }
  }
  return { rgba, width, height };
}

describe("encodeJpeg", () => {
  it("produces bytes starting with the JPEG magic (FF D8 FF)", () => {
    const { rgba, width, height } = buildQuadrantRgba(32);
    const jpegBytes = encodeJpeg(rgba, width, height);
    assert.deepEqual(jpegBytes.subarray(0, 3), JPEG_MAGIC);
  });

  it("round-trips through jpeg-js's own decoder with each quadrant's dominant color intact", () => {
    const { rgba, width, height } = buildQuadrantRgba(64);
    const jpegBytes = encodeJpeg(rgba, width, height, 95);
    const decoded = jpeg.decode(jpegBytes, { useTArray: true });
    assert.equal(decoded.width, width);
    assert.equal(decoded.height, height);

    function sampleAt(x: number, y: number): readonly [number, number, number] {
      const px = (y * width + x) * 4;
      return [decoded.data[px]!, decoded.data[px + 1]!, decoded.data[px + 2]!];
    }
    // Sample well inside each quadrant (away from lossy-compression edges) and check it is still
    // recognizably that quadrant's dominant channel — real correctness proof, not just "some bytes came
    // back".
    const [r0, g0, b0] = sampleAt(4, 4); // red quadrant
    assert.ok(r0 > 200 && g0 < 50 && b0 < 50, `top-left should stay red-dominant, got [${r0},${g0},${b0}]`);
    const [r3, g3, b3] = sampleAt(width - 5, height - 5); // yellow quadrant
    assert.ok(r3 > 200 && g3 > 200 && b3 < 50, `bottom-right should stay yellow-dominant, got [${r3},${g3},${b3}]`);
  });

  it("defaults to quality 90 when none is given", () => {
    const { rgba, width, height } = buildQuadrantRgba(48);
    const defaulted = encodeJpeg(rgba, width, height);
    const explicit = encodeJpeg(rgba, width, height, 90);
    assert.deepEqual(defaulted, explicit);
  });

  it("a higher quality argument changes the encoded output", () => {
    const { rgba, width, height } = buildQuadrantRgba(48);
    const low = encodeJpeg(rgba, width, height, 10);
    const high = encodeJpeg(rgba, width, height, 95);
    assert.notDeepEqual(low, high);
  });
});
