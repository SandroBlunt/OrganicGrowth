import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { uploadViaAwsCli, deleteViaAwsCli, publicJpgUrl, type S3Config } from "./s3.ts";
import type { CommandRunner, CommandOptions } from "./command-runner.ts";

interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: CommandOptions | undefined;
}

function stubRunner(behavior?: (call: RecordedCall) => void): {
  runner: CommandRunner;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = async (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    behavior?.(call);
    return { stdout: "", stderr: "" };
  };
  return { runner, calls };
}

const CONFIG: S3Config = { bucket: "strawmotion-schedule-media", region: "us-east-1" };

describe("publicJpgUrl (issue #144 AC3 — a public, direct, virtual-hosted-style .jpg link)", () => {
  it("builds the bucket's virtual-hosted-style URL for a key", () => {
    assert.equal(
      publicJpgUrl(CONFIG, "straw-motion/2026-W32/idea-01/0-hook.jpg"),
      "https://strawmotion-schedule-media.s3.us-east-1.amazonaws.com/straw-motion/2026-W32/idea-01/0-hook.jpg",
    );
  });

  it("rejects a key that does not end in .jpg", () => {
    assert.throws(() => publicJpgUrl(CONFIG, "a.png"), /\.jpg/);
  });
});

describe("uploadViaAwsCli — argv construction (stubbed runner, issue #144)", () => {
  it("invokes aws s3 cp with the exact argv and returns the public .jpg URL", async () => {
    const { runner, calls } = stubRunner();
    const result = await uploadViaAwsCli("/tmp/slide-0.jpg", "straw-motion/idea-01/0-hook.jpg", CONFIG, {
      runner,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "aws");
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "cp",
      "/tmp/slide-0.jpg",
      "s3://strawmotion-schedule-media/straw-motion/idea-01/0-hook.jpg",
      "--region",
      "us-east-1",
      "--content-type",
      "image/jpeg",
    ]);
    // Never passes any --acl flag — the bucket's own policy already grants public GetObject
    // (issue #144's environment note; no ACL needed or wanted).
    assert.ok(!calls[0]?.args.some((a) => a.includes("acl")));
    assert.equal(
      result.url,
      "https://strawmotion-schedule-media.s3.us-east-1.amazonaws.com/straw-motion/idea-01/0-hook.jpg",
    );
  });

  it("rejects a key that does not end in .jpg WITHOUT invoking the runner", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(
      () => uploadViaAwsCli("/tmp/a.png", "straw-motion/a.png", CONFIG, { runner }),
      /\.jpg/,
    );
    assert.equal(calls.length, 0);
  });

  it("honors a custom awsCommand override", async () => {
    const { runner, calls } = stubRunner();
    await uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, {
      runner,
      awsCommand: "/usr/local/bin/aws",
    });
    assert.equal(calls[0]?.command, "/usr/local/bin/aws");
  });

  it("passes the given env through to the runner untouched", async () => {
    const { runner, calls } = stubRunner();
    const env = { AWS_ACCESS_KEY_ID: "AKIA_TEST_VALUE_1234" };
    await uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, { runner, env });
    assert.equal(calls[0]?.options?.env, env);
  });

  it("redacts an AWS credential value out of a thrown command error's message", async () => {
    const secret = "wJalrXUtnFEMI-SECRET-VALUE-EXAMPLE";
    const { runner } = stubRunner(() => {
      throw new Error(`AccessDenied using secret ${secret}`);
    });
    const env = { AWS_SECRET_ACCESS_KEY: secret };
    await assert.rejects(
      () => uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, { runner, env }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes(secret));
        assert.match(error.message, /\[REDACTED\]/);
        return true;
      },
    );
  });
});

describe("deleteViaAwsCli — argv construction (stubbed runner, issue #144)", () => {
  it("invokes aws s3 rm with the exact argv", async () => {
    const { runner, calls } = stubRunner();
    await deleteViaAwsCli("straw-motion/idea-01/0-hook.jpg", CONFIG, { runner });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "aws");
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "rm",
      "s3://strawmotion-schedule-media/straw-motion/idea-01/0-hook.jpg",
      "--region",
      "us-east-1",
    ]);
  });

  it("redacts an AWS credential value out of a thrown delete error's message too", async () => {
    const secret = "AKIA_DELETE_PATH_SECRET_1234";
    const { runner } = stubRunner(() => {
      throw new Error(`denied: ${secret}`);
    });
    await assert.rejects(
      () => deleteViaAwsCli("a.jpg", CONFIG, { runner, env: { AWS_ACCESS_KEY_ID: secret } }),
      (error: unknown) => {
        assert.ok(error instanceof Error && !error.message.includes(secret));
        return true;
      },
    );
  });
});
