/**
 * A minimal, dependency-free PNG decoder (issue #209) — the cross-platform replacement for shelling
 * out to macOS's `sips` to read a slide's source PNG.
 *
 * Zero new dependencies: `node:zlib`'s built-in `inflateSync` is the ONLY import, mirroring
 * `src/media-host/fixtures/tiny-png.ts`'s own zero-dependency PNG *encoder* (this module is
 * deliberately its reverse — chunk-walk, then `zlib.inflateSync`, then un-filter). PNG's chunked
 * structure and scanline filtering are small, well-specified algorithms; unlike JPEG encoding, hand-
 * rolling them for a decoder is a reasonable, bounded amount of code, not a codec-correctness gamble.
 *
 * Deliberately narrow: this codebase's own real carousel-slide PNGs (verified directly against every
 * `.png` file under `data/`) are ALL 8-bit, non-interlaced, and either truecolor (`colorType: 2`) or
 * truecolor-with-alpha (`colorType: 6`) — so that is exactly what this decoder supports. Anything else
 * (a palette, a grayscale image, 16-bit depth, Adam7 interlacing) is REFUSED with a clear, named error
 * rather than silently mis-decoded — the same "refuse and report, never repair" posture epic #195's
 * importer uses for a file it cannot confidently parse.
 *
 * Always returns RGBA (a `colorType: 2` source gets a synthesized, fully-opaque alpha channel) so the
 * caller (`png-to-jpg.ts`) has exactly one pixel shape to hand to the JPEG encoder, regardless of which
 * of the two supported PNG color types it read.
 */

import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class PngDecodeError extends Error {
  constructor(message: string) {
    super(`PngDecodeError: ${message}`);
    this.name = "PngDecodeError";
  }
}

/** A decoded PNG's pixels, always expanded to RGBA — one row-major byte quadruple per pixel. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bytes, row-major, top row first, RGBA per pixel. */
  readonly rgba: Buffer;
}

/** Standard CRC-32 (the same algorithm every PNG chunk's trailing checksum uses), computed bit-by-bit —
 *  no lookup table needed for images this small. Mirrors `tiny-png.ts`'s own encoder-side `crc32`,
 *  duplicated here (not imported) because that module is a test fixture, not a production dependency. */
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

interface RawChunk {
  readonly type: string;
  readonly data: Buffer;
}

/** Walks every chunk in a PNG buffer (after its 8-byte signature), verifying each one's CRC-32 against
 *  its own type+data. Throws `PngDecodeError` on a bad signature, a truncated chunk, or a CRC mismatch —
 *  never silently accepts corrupted bytes. */
function readChunks(buffer: Buffer): readonly RawChunk[] {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngDecodeError("not a PNG file (bad signature)");
  }
  const chunks: RawChunk[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      throw new PngDecodeError("truncated chunk header");
    }
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new PngDecodeError(`truncated "${type}" chunk data`);
    }
    const data = buffer.subarray(dataStart, dataEnd);
    const storedCrc = buffer.readUInt32BE(dataEnd);
    const computedCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    if (storedCrc !== computedCrc) {
      throw new PngDecodeError(`CRC mismatch on "${type}" chunk — the file is corrupt`);
    }
    chunks.push({ type, data: Buffer.from(data) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

const SUPPORTED_COLOR_TYPES = new Set([2, 6]);

/** PNG's "predictor" for one un-filtered byte, given its already-reconstructed left (`a`), above (`b`),
 *  and above-left (`c`) neighbors — the Paeth filter (type 4)'s own algorithm, from the PNG spec. */
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Reverses PNG's per-scanline filtering (spec section 9), given the already-`zlib.inflateSync`'d IDAT
 *  bytes: `stride` bytes of pixel data per row, each row prefixed by one filter-type byte. Returns the
 *  raw, unfiltered pixel bytes (no filter-type bytes), `stride * height` long. */
function unfilterScanlines(inflated: Buffer, width: number, height: number, bytesPerPixel: number): Buffer {
  const stride = width * bytesPerPixel;
  const expected = (stride + 1) * height;
  if (inflated.length !== expected) {
    throw new PngDecodeError(
      `unexpected decompressed size: got ${inflated.length} bytes, expected ${expected} for a ` +
        `${width}x${height} image at ${bytesPerPixel} bytes/pixel`,
    );
  }

  const out = Buffer.alloc(stride * height);
  let priorRowStart = -1; // no prior row for the first scanline — treated as all-zero

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = inflated[rowStart];
    const srcStart = rowStart + 1;
    const dstStart = y * stride;

    for (let x = 0; x < stride; x++) {
      const raw = inflated[srcStart + x]!;
      const a = x >= bytesPerPixel ? out[dstStart + x - bytesPerPixel]! : 0;
      const b = priorRowStart >= 0 ? out[priorRowStart + x]! : 0;
      const c = priorRowStart >= 0 && x >= bytesPerPixel ? out[priorRowStart + x - bytesPerPixel]! : 0;

      let value: number;
      switch (filterType) {
        case 0: // None
          value = raw;
          break;
        case 1: // Sub
          value = raw + a;
          break;
        case 2: // Up
          value = raw + b;
          break;
        case 3: // Average
          value = raw + Math.floor((a + b) / 2);
          break;
        case 4: // Paeth
          value = raw + paethPredictor(a, b, c);
          break;
        default:
          throw new PngDecodeError(`unknown scanline filter type ${String(filterType)} on row ${y}`);
      }
      out[dstStart + x] = value & 0xff;
    }
    priorRowStart = dstStart;
  }

  return out;
}

/**
 * Decode a PNG buffer into row-major RGBA pixels. Throws `PngDecodeError` for anything this decoder
 * does not support (see the module doc) or anything malformed — never returns a wrong-but-plausible
 * result.
 */
export function decodePng(buffer: Buffer): DecodedPng {
  const chunks = readChunks(buffer);

  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (ihdr === undefined) throw new PngDecodeError("missing IHDR chunk");
  if (ihdr.data.length !== 13) throw new PngDecodeError("malformed IHDR chunk");

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8]!;
  const colorType = ihdr.data[9]!;
  const interlace = ihdr.data[12]!;

  if (bitDepth !== 8) {
    throw new PngDecodeError(`unsupported bit depth ${bitDepth} — only 8-bit PNGs are supported`);
  }
  if (!SUPPORTED_COLOR_TYPES.has(colorType)) {
    throw new PngDecodeError(
      `unsupported PNG color type ${colorType} — only truecolor (2) and truecolor-with-alpha (6) are supported`,
    );
  }
  if (interlace !== 0) {
    throw new PngDecodeError("interlaced PNGs (Adam7) are not supported");
  }
  if (width <= 0 || height <= 0) {
    throw new PngDecodeError(`invalid dimensions ${width}x${height}`);
  }

  const idatChunks = chunks.filter((c) => c.type === "IDAT");
  if (idatChunks.length === 0) throw new PngDecodeError("missing IDAT chunk(s)");
  const compressed = Buffer.concat(idatChunks.map((c) => c.data));
  const inflated = inflateSync(compressed);

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const unfiltered = unfilterScanlines(inflated, width, height, bytesPerPixel);

  if (colorType === 6) {
    return { width, height, rgba: unfiltered };
  }

  // colorType 2 (RGB) — synthesize a fully-opaque alpha channel so the caller always gets RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let px = 0; px < width * height; px++) {
    rgba[px * 4] = unfiltered[px * 3]!;
    rgba[px * 4 + 1] = unfiltered[px * 3 + 1]!;
    rgba[px * 4 + 2] = unfiltered[px * 3 + 2]!;
    rgba[px * 4 + 3] = 255;
  }
  return { width, height, rgba };
}
