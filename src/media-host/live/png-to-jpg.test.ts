import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import jpeg from "jpeg-js";

import { convertPngToJpg } from "./png-to-jpg.ts";
import { buildTinyPngBuffer, writeTinyPng } from "../fixtures/tiny-png.ts";

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

describe("convertPngToJpg — the cross-platform sips replacement (issue #209)", () => {
  it("converts a tiny PNG to a real JPG file, leaving the source PNG byte-for-byte untouched — ALWAYS runs, no platform skip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-png-to-jpg-"));
    try {
      const pngPath = join(dir, "tiny.png");
      const jpgPath = join(dir, "tiny.jpg");
      await writeTinyPng(pngPath);
      const originalPngBytes = await readFile(pngPath);

      await convertPngToJpg(pngPath, jpgPath);

      const jpgBytes = await readFile(jpgPath);
      assert.deepEqual(jpgBytes.subarray(0, 3), JPEG_MAGIC);
      assert.ok(jpgBytes.length > 0);

      const pngBytesAfter = await readFile(pngPath);
      assert.deepEqual(pngBytesAfter, originalPngBytes);
      assert.deepEqual(pngBytesAfter, buildTinyPngBuffer());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to convert in place — throws WITHOUT reading anything when destPath === sourcePath", async () => {
    await assert.rejects(() => convertPngToJpg("/tmp/slide-0.png", "/tmp/slide-0.png"), /untouched/);
  });

  it("resolves relative paths before comparing — a differently-spelled same file is still refused", async () => {
    await assert.rejects(() => convertPngToJpg("./a/../a.png", "a.png"));
  });

  it("converts a REAL repo carousel-slide-shaped PNG (brand-logo.png, RGBA) end to end", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-png-to-jpg-real-"));
    try {
      const jpgPath = join(dir, "logo.jpg");
      await convertPngToJpg("data/brands/straw-motion/assets/brand-logo.png", jpgPath);
      const jpgBytes = await readFile(jpgPath);
      assert.deepEqual(jpgBytes.subarray(0, 3), JPEG_MAGIC);
      const decoded = jpeg.decode(jpgBytes, { useTArray: true });
      assert.equal(decoded.width, 383);
      assert.equal(decoded.height, 80);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("honors a custom quality option", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-png-to-jpg-quality-"));
    try {
      const pngPath = join(dir, "tiny.png");
      const lowPath = join(dir, "low.jpg");
      const highPath = join(dir, "high.jpg");
      await writeTinyPng(pngPath);
      await convertPngToJpg(pngPath, lowPath, { quality: 10 });
      await convertPngToJpg(pngPath, highPath, { quality: 95 });
      const low = await readFile(lowPath);
      const high = await readFile(highPath);
      assert.notDeepEqual(low, high);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
