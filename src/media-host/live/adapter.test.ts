import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LiveMediaHost } from "./adapter.ts";
import type { CommandRunner } from "./command-runner.ts";
import type { S3Config } from "./s3.ts";
import type { MediaHostPort } from "../port.ts";
import { writeTinyPng } from "../fixtures/tiny-png.ts";

interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv | undefined;
}

function stubRunner(): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, env: options?.env });
    if (args.includes("presign")) {
      return { stdout: "https://example-signed.invalid/a.jpg?X-Amz-Signature=fixture-not-real\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  return { runner, calls };
}

const CONFIG: S3Config = { bucket: "strawmotion-schedule-media", region: "us-east-1" };

describe("LiveMediaHost (issue #144) — composes the pure-JS PNG->JPG converter (issue #209) + the AWS CLI behind MediaHostPort", () => {
  it("implements MediaHostPort (type-level, plus a smoke call of every method)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-live-media-host-smoke-"));
    try {
      const pngPath = join(dir, "a.png");
      const jpgPath = join(dir, "a.jpg");
      await writeTinyPng(pngPath);
      const { runner } = stubRunner();
      const host: MediaHostPort = new LiveMediaHost({ config: CONFIG, runner, env: {} });
      await host.convertToJpg(pngPath, jpgPath);
      const result = await host.upload(jpgPath, "a.jpg", { expiresInSeconds: 3600 });
      assert.match(result.url, /^https:\/\/example-signed\.invalid/);
      await host.delete("a.jpg");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("convertToJpg is pure JS — it converts a real PNG to a real JPG WITHOUT ever calling the CommandRunner (issue #209)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-live-media-host-convert-"));
    try {
      const pngPath = join(dir, "slide-0.png");
      const jpgPath = join(dir, "slide-0.jpg");
      await writeTinyPng(pngPath);
      const { runner, calls } = stubRunner();
      const host = new LiveMediaHost({ config: CONFIG, runner, env: {} });
      await host.convertToJpg(pngPath, jpgPath);

      assert.equal(calls.length, 0, "convertToJpg must not shell out to anything — no macOS-only sips call, no CommandRunner call at all");
      const jpgBytes = await readFile(jpgPath);
      assert.deepEqual(jpgBytes.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("honors a jpegQuality override", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-live-media-host-quality-"));
    try {
      const pngPath = join(dir, "slide-0.png");
      const lowPath = join(dir, "low.jpg");
      const highPath = join(dir, "high.jpg");
      await writeTinyPng(pngPath);
      const { runner: lowRunner } = stubRunner();
      const { runner: highRunner } = stubRunner();
      await new LiveMediaHost({ config: CONFIG, runner: lowRunner, env: {}, jpegQuality: 10 }).convertToJpg(pngPath, lowPath);
      await new LiveMediaHost({ config: CONFIG, runner: highRunner, env: {}, jpegQuality: 95 }).convertToJpg(pngPath, highPath);
      const low = await readFile(lowPath);
      const high = await readFile(highPath);
      assert.notDeepEqual(low, high);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("upload delegates to the AWS CLI (cp then presign), using the PRESET env verbatim (no .env load)", async () => {
    const { runner, calls } = stubRunner();
    const presetEnv = { AWS_ACCESS_KEY_ID: "preset-value" };
    const host = new LiveMediaHost({ config: CONFIG, runner, env: presetEnv });
    await host.upload("/tmp/a.jpg", "straw-motion/a.jpg", { expiresInSeconds: 3600 });

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.command, "aws");
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "cp",
      "/tmp/a.jpg",
      "s3://strawmotion-schedule-media/straw-motion/a.jpg",
      "--region",
      "us-east-1",
      "--content-type",
      "image/jpeg",
    ]);
    assert.equal(calls[0]?.env, presetEnv);
    assert.deepEqual(calls[1]?.args, [
      "s3",
      "presign",
      "s3://strawmotion-schedule-media/straw-motion/a.jpg",
      "--region",
      "us-east-1",
      "--expires-in",
      "3600",
    ]);
    assert.equal(calls[1]?.env, presetEnv);
  });

  it("delete delegates to the AWS CLI with the exact rm argv", async () => {
    const { runner, calls } = stubRunner();
    const host = new LiveMediaHost({ config: CONFIG, runner, env: {} });
    await host.delete("straw-motion/a.jpg");

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "rm",
      "s3://strawmotion-schedule-media/straw-motion/a.jpg",
      "--region",
      "us-east-1",
    ]);
  });

  it("without a preset env, lazily loads .env (merged under process.env) on first upload — proven with a temp .env fixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-live-media-host-"));
    try {
      const envPath = join(dir, ".env");
      await writeFile(envPath, "AWS_ACCESS_KEY_ID=from-dotenv-fixture\n", "utf8");
      const { runner, calls } = stubRunner();
      const host = new LiveMediaHost({
        config: CONFIG,
        runner,
        envFilePath: envPath,
      });
      await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
      assert.equal(calls[0]?.env?.AWS_ACCESS_KEY_ID, "from-dotenv-fixture");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("when .env has nothing relevant, the resolved env still carries process.env through unchanged (falls through to the AWS CLI's own default chain)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-live-media-host-"));
    try {
      const { runner, calls } = stubRunner();
      const host = new LiveMediaHost({
        config: CONFIG,
        runner,
        envFilePath: join(dir, "does-not-exist.env"),
      });
      await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
      assert.equal(calls[0]?.env?.PATH, process.env.PATH);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves the env only once and reuses it across upload + delete calls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-live-media-host-"));
    try {
      const envPath = join(dir, ".env");
      await writeFile(envPath, "AWS_ACCESS_KEY_ID=only-once\n", "utf8");
      const { runner, calls } = stubRunner();
      const host = new LiveMediaHost({ config: CONFIG, runner, envFilePath: envPath });
      await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
      await host.delete("a.jpg");
      assert.equal(calls.length, 3); // cp + presign (upload) + rm (delete)
      // Same resolved env object reference reused across every call.
      assert.equal(calls[0]?.env, calls[1]?.env);
      assert.equal(calls[1]?.env, calls[2]?.env);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
