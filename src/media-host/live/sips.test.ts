import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { convertPngToJpgViaSips } from "./sips.ts";
import type { CommandRunner } from "./command-runner.ts";
import { buildTinyPngBuffer, writeTinyPng } from "../fixtures/tiny-png.ts";

interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
}

function stubRunner(): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    return { stdout: "", stderr: "" };
  };
  return { runner, calls };
}

describe("convertPngToJpgViaSips — argv construction (stubbed runner, issue #144)", () => {
  it("invokes sips with the exact -s format jpeg ... --out ... argv", async () => {
    const { runner, calls } = stubRunner();
    await convertPngToJpgViaSips("/tmp/slide-0.png", "/tmp/slide-0.jpg", { runner });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "sips");
    assert.deepEqual(calls[0]?.args, [
      "-s",
      "format",
      "jpeg",
      "/tmp/slide-0.png",
      "--out",
      "/tmp/slide-0.jpg",
    ]);
  });

  it("honors a custom sipsCommand override", async () => {
    const { runner, calls } = stubRunner();
    await convertPngToJpgViaSips("/tmp/a.png", "/tmp/a.jpg", {
      runner,
      sipsCommand: "/usr/bin/sips",
    });
    assert.equal(calls[0]?.command, "/usr/bin/sips");
  });

  it("refuses to convert in place — throws WITHOUT invoking the runner when destPath === sourcePath", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(
      () => convertPngToJpgViaSips("/tmp/slide-0.png", "/tmp/slide-0.png", { runner }),
      /untouched/,
    );
    assert.equal(calls.length, 0);
  });

  it("resolves relative paths before comparing — a differently-spelled same file is still refused", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(() =>
      convertPngToJpgViaSips("./a/../a.png", "a.png", { runner }),
    );
    assert.equal(calls.length, 0);
  });
});

// The ONE real-command test in this suite (per issue #144's guidance: local, free, built into macOS).
// Skipped automatically on any non-macOS runner rather than failing the suite.
describe("convertPngToJpgViaSips — a REAL sips invocation on a tiny fixture PNG", () => {
  it(
    "converts a tiny PNG to a real JPG file, leaving the source PNG byte-for-byte untouched",
    { skip: process.platform !== "darwin" ? "sips is macOS-only" : false },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "og-sips-real-"));
      try {
        const pngPath = join(dir, "tiny.png");
        const jpgPath = join(dir, "tiny.jpg");
        await writeTinyPng(pngPath);
        const originalPngBytes = await readFile(pngPath);

        await convertPngToJpgViaSips(pngPath, jpgPath);

        const jpgBytes = await readFile(jpgPath);
        // JPEG magic bytes: FF D8 FF.
        assert.deepEqual(jpgBytes.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
        assert.ok(jpgBytes.length > 0);

        const pngBytesAfter = await readFile(pngPath);
        assert.deepEqual(pngBytesAfter, originalPngBytes);
        assert.deepEqual(pngBytesAfter, buildTinyPngBuffer());
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
