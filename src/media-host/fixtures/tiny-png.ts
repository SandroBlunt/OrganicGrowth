/**
 * A tiny, valid, deterministic PNG built with zero new dependencies (`node:zlib` only) — issue #144's
 * fixture for the ONE real-`sips` test (`live/sips.test.ts`) and the manual live smoke script
 * (`live/smoke.ts`). Building it in code (rather than committing a binary fixture file) keeps the diff
 * text-only and the fixture trivially reviewable.
 */

import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WIDTH = 4;
const HEIGHT = 4;

/** Standard CRC-32 (the same algorithm PNG chunks use), implemented bit-by-bit — no lookup table needed. */
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

/** Build a real, valid 4x4 solid-red PNG (8-bit RGB, no filter) as an in-memory buffer. Pure. */
export function buildTinyPngBuffer(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB (no alpha)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const rowBytes = WIDTH * 3;
  const raw = Buffer.alloc((rowBytes + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < WIDTH; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = 255; // R
      raw[px + 1] = 0; // G
      raw[px + 2] = 0; // B
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Write a tiny, valid PNG to `path`. */
export async function writeTinyPng(path: string): Promise<void> {
  await writeFile(path, buildTinyPngBuffer());
}
