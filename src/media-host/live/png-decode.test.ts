import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";

import { decodePng, PngDecodeError } from "./png-decode.ts";
import { buildTinyPngBuffer } from "../fixtures/tiny-png.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Standard CRC-32 — an INDEPENDENT implementation from `png-decode.ts`'s own (a second, hand-written
 *  copy), so a test fixture built with this function is a genuine cross-check, not a decoder testing
 *  itself. */
function crc32(buf: Uint8Array): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

/** Builds a real, valid PNG from an explicit grid of pixels, applying `filterType` (0–4) to EVERY
 *  scanline — an independent, hand-written encoder (not `tiny-png.ts`'s, which always uses filter 0)
 *  so every one of PNG's five filter types is genuinely exercised and cross-checked by `decodePng`. */
function buildPng(pixels: readonly (readonly Pixel[])[], filterType: number, withAlpha: boolean): Buffer {
  const height = pixels.length;
  const width = pixels[0]!.length;
  const bpp = withAlpha ? 4 : 3;
  const stride = width * bpp;

  // Raw (unfiltered) scanlines first, so each filter type can be computed against real neighbor bytes.
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pixels[y]![x]!;
      const base = y * stride + x * bpp;
      raw[base] = p.r;
      raw[base + 1] = p.g;
      raw[base + 2] = p.b;
      if (withAlpha) raw[base + 3] = p.a ?? 255;
    }
  }

  function at(buf: Buffer, y: number, x: number): number {
    if (y < 0 || x < 0) return 0;
    return buf[y * stride + x]!;
  }

  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    filtered[rowStart] = filterType;
    for (let x = 0; x < stride; x++) {
      const raw_ = raw[y * stride + x]!;
      const a = x >= bpp ? at(raw, y, x - bpp) : 0;
      const b = y > 0 ? at(raw, y - 1, x) : 0;
      const c = y > 0 && x >= bpp ? at(raw, y - 1, x - bpp) : 0;
      let out: number;
      switch (filterType) {
        case 0:
          out = raw_;
          break;
        case 1:
          out = raw_ - a;
          break;
        case 2:
          out = raw_ - b;
          break;
        case 3:
          out = raw_ - Math.floor((a + b) / 2);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          out = raw_ - pred;
          break;
        }
        default:
          throw new Error("unsupported filter type in test fixture");
      }
      filtered[rowStart + 1 + x] = out & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = withAlpha ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(filtered)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const RED: Pixel = { r: 255, g: 0, b: 0 };
const GREEN: Pixel = { r: 0, g: 255, b: 0 };
const BLUE: Pixel = { r: 0, g: 0, b: 255 };
const WHITE: Pixel = { r: 255, g: 255, b: 255 };

const GRID: readonly (readonly Pixel[])[] = [
  [RED, GREEN, BLUE],
  [BLUE, WHITE, RED],
  [GREEN, RED, WHITE],
];

describe("decodePng — round-trips a real, valid PNG built independently of the decoder", () => {
  it("decodes tiny-png.ts's own fixture (filter 0, RGB, no alpha) — every pixel solid red", async () => {
    const decoded = decodePng(buildTinyPngBuffer());
    assert.equal(decoded.width, 4);
    assert.equal(decoded.height, 4);
    assert.equal(decoded.rgba.length, 4 * 4 * 4);
    for (let px = 0; px < 16; px++) {
      assert.deepEqual(
        [decoded.rgba[px * 4], decoded.rgba[px * 4 + 1], decoded.rgba[px * 4 + 2], decoded.rgba[px * 4 + 3]],
        [255, 0, 0, 255],
      );
    }
  });

  for (const filterType of [0, 1, 2, 3, 4]) {
    it(`decodes a 3x3 RGB PNG filtered with type ${filterType}`, () => {
      const png = buildPng(GRID, filterType, false);
      const decoded = decodePng(png);
      assert.equal(decoded.width, 3);
      assert.equal(decoded.height, 3);
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const expected = GRID[y]![x]!;
          const px = y * 3 + x;
          assert.deepEqual(
            [decoded.rgba[px * 4], decoded.rgba[px * 4 + 1], decoded.rgba[px * 4 + 2], decoded.rgba[px * 4 + 3]],
            [expected.r, expected.g, expected.b, 255],
            `filter ${filterType}, pixel (${x},${y})`,
          );
        }
      }
    });
  }

  it("decodes an RGBA (colorType 6) PNG, preserving a real alpha channel", () => {
    const withAlpha: readonly (readonly Pixel[])[] = [
      [{ ...RED, a: 128 }, { ...GREEN, a: 0 }],
      [{ ...BLUE, a: 255 }, { ...WHITE, a: 64 }],
    ];
    const png = buildPng(withAlpha, 4, true);
    const decoded = decodePng(png);
    assert.equal(decoded.width, 2);
    assert.equal(decoded.height, 2);
    assert.deepEqual([decoded.rgba[0], decoded.rgba[1], decoded.rgba[2], decoded.rgba[3]], [255, 0, 0, 128]);
    assert.deepEqual([decoded.rgba[4], decoded.rgba[5], decoded.rgba[6], decoded.rgba[7]], [0, 255, 0, 0]);
  });

  it("decodes a REAL repo PNG file (brand-logo.png) — correct dimensions and buffer size", async () => {
    const path = "data/brands/straw-motion/assets/brand-logo.png";
    const bytes = await readFile(path);
    const decoded = decodePng(bytes);
    assert.equal(decoded.width, 383);
    assert.equal(decoded.height, 80);
    assert.equal(decoded.rgba.length, 383 * 80 * 4);
  });
});

describe("decodePng — refuses rather than mis-decodes", () => {
  it("throws PngDecodeError for a non-PNG buffer", () => {
    assert.throws(() => decodePng(Buffer.from("not a png")), PngDecodeError);
  });

  it("throws PngDecodeError for a corrupted chunk (bad CRC)", () => {
    const png = buildPng(GRID, 0, false);
    const corrupted = Buffer.from(png);
    const idx = corrupted.length - 6;
    corrupted[idx] = (corrupted[idx]! ^ 0xff) & 0xff; // flip a byte inside IEND's / IDAT's trailing region
    assert.throws(() => decodePng(corrupted), PngDecodeError);
  });

  it("throws PngDecodeError for an unsupported color type (palette)", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 3; // palette
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const png = Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(Buffer.from([0, 0]))),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    assert.throws(() => decodePng(png), /color type/);
  });

  it("throws PngDecodeError for a 16-bit depth PNG", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 16;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const png = Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 0, 0, 0]))),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    assert.throws(() => decodePng(png), /bit depth/);
  });

  it("throws PngDecodeError for an interlaced PNG", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 1; // Adam7
    const png = Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0]))),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    assert.throws(() => decodePng(png), /interlaced/);
  });

  it("throws PngDecodeError when IDAT is missing", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const png = Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IEND", Buffer.alloc(0))]);
    assert.throws(() => decodePng(png), /IDAT/);
  });
});
