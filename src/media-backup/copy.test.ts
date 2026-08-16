import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { copyFileWithDigest } from "./copy.ts";
import { digestBuffer } from "./checksum.ts";

describe("copyFileWithDigest", () => {
  it("copies the file byte-for-byte and returns the correct digest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-copy-"));
    try {
      const src = join(dir, "src.png");
      const dest = join(dir, "nested", "dest.png");
      await writeFile(src, "fake-image-bytes");

      const digest = await copyFileWithDigest(src, dest);

      const written = await readFile(dest);
      assert.equal(written.toString("utf8"), "fake-image-bytes");
      assert.deepEqual(digest, digestBuffer(Buffer.from("fake-image-bytes")));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates missing parent directories at the destination", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-copy-"));
    try {
      const src = join(dir, "src.txt");
      const dest = join(dir, "a", "b", "c", "dest.txt");
      await writeFile(src, "x");
      await copyFileWithDigest(src, dest);
      assert.equal((await readFile(dest)).toString("utf8"), "x");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("propagates a read failure for a missing source file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-copy-"));
    try {
      await assert.rejects(() =>
        copyFileWithDigest(join(dir, "missing.png"), join(dir, "dest.png")),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
