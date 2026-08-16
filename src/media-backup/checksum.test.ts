import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { digestBuffer, digestFile } from "./checksum.ts";

describe("digestBuffer", () => {
  it("returns the correct sha256 hex digest and byte size", () => {
    const buf = Buffer.from("hello world");
    const expectedSha = createHash("sha256").update(buf).digest("hex");
    const result = digestBuffer(buf);
    assert.equal(result.sha256, expectedSha);
    assert.equal(result.sizeBytes, 11);
  });

  it("is deterministic", () => {
    const buf = Buffer.from("same content");
    assert.deepEqual(digestBuffer(buf), digestBuffer(Buffer.from("same content")));
  });

  it("differs for different content", () => {
    assert.notEqual(digestBuffer(Buffer.from("a")).sha256, digestBuffer(Buffer.from("b")).sha256);
  });
});

describe("digestFile", () => {
  it("reads a real file and matches digestBuffer of the same bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-checksum-"));
    try {
      const path = join(dir, "x.txt");
      await writeFile(path, "fixture content");
      const fromFile = await digestFile(path);
      const fromBuffer = digestBuffer(Buffer.from("fixture content"));
      assert.deepEqual(fromFile, fromBuffer);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("propagates ENOENT for a missing file", async () => {
    await assert.rejects(() => digestFile("/definitely/does/not/exist.txt"));
  });
});
