import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LiveMediaHost } from "./adapter.ts";
import type { CommandRunner } from "./command-runner.ts";
import type { S3Config } from "./s3.ts";
import type { MediaHostPort } from "../port.ts";

interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv | undefined;
}

function stubRunner(): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, env: options?.env });
    return { stdout: "", stderr: "" };
  };
  return { runner, calls };
}

const CONFIG: S3Config = { bucket: "strawmotion-schedule-media", region: "us-east-1" };

describe("LiveMediaHost (issue #144) — composes sips + the AWS CLI behind MediaHostPort", () => {
  it("implements MediaHostPort (type-level, plus a smoke call of every method)", async () => {
    const { runner } = stubRunner();
    const host: MediaHostPort = new LiveMediaHost({ config: CONFIG, runner, env: {} });
    await host.convertToJpg("/tmp/a.png", "/tmp/a.jpg");
    const result = await host.upload("/tmp/a.jpg", "a.jpg");
    assert.equal(result.url, "https://strawmotion-schedule-media.s3.us-east-1.amazonaws.com/a.jpg");
    await host.delete("a.jpg");
  });

  it("convertToJpg delegates to sips with the given sourcePath/destPath", async () => {
    const { runner, calls } = stubRunner();
    const host = new LiveMediaHost({ config: CONFIG, runner, sipsCommand: "sips", env: {} });
    await host.convertToJpg("/tmp/slide-0.png", "/tmp/slide-0.jpg");

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

  it("upload delegates to the AWS CLI, using the PRESET env verbatim (no .env load)", async () => {
    const { runner, calls } = stubRunner();
    const presetEnv = { AWS_ACCESS_KEY_ID: "preset-value" };
    const host = new LiveMediaHost({ config: CONFIG, runner, env: presetEnv });
    await host.upload("/tmp/a.jpg", "straw-motion/a.jpg");

    assert.equal(calls.length, 1);
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
      await host.upload("/tmp/a.jpg", "a.jpg");
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
      await host.upload("/tmp/a.jpg", "a.jpg");
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
      await host.upload("/tmp/a.jpg", "a.jpg");
      await host.delete("a.jpg");
      assert.equal(calls.length, 2);
      // Same resolved env object reference reused for the second call.
      assert.equal(calls[0]?.env, calls[1]?.env);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
