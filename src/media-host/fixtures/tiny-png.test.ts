import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildTinyPngBuffer, writeTinyPng } from "./tiny-png.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("buildTinyPngBuffer (issue #144 — a real, valid PNG built with zero new dependencies)", () => {
  it("starts with the PNG magic signature", () => {
    const buf = buildTinyPngBuffer();
    assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE);
  });

  it("ends with an IEND chunk", () => {
    const buf = buildTinyPngBuffer();
    // IEND chunk: length(4)=0 + type "IEND"(4) + crc(4) = 12 bytes at the very end.
    const tail = buf.subarray(buf.length - 8, buf.length - 4).toString("ascii");
    assert.equal(tail, "IEND");
  });

  it("is deterministic — building it twice yields identical bytes", () => {
    assert.deepEqual(buildTinyPngBuffer(), buildTinyPngBuffer());
  });
});

describe("writeTinyPng", () => {
  it("writes a real PNG file to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-tiny-png-"));
    try {
      const path = join(dir, "tiny.png");
      await writeTinyPng(path);
      const onDisk = await readFile(path);
      assert.deepEqual(onDisk, buildTinyPngBuffer());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
