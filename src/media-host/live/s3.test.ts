import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { uploadViaAwsCli, deleteViaAwsCli, presignViaAwsCli, directJpgUrl, type S3Config } from "./s3.ts";
import type { CommandRunner, CommandOptions } from "./command-runner.ts";
import { MAX_PRESIGN_SECONDS } from "../aws-presign-limit.ts";

interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: CommandOptions | undefined;
}

/** A canned presign stdout value a stubbed `aws s3 presign` call returns — a plausible-shaped but
 *  clearly-fake signed URL (the query string is fixed prose, never a real/realistic HMAC signature —
 *  keeps this fixture out of reach of the credential scanner's own url-path-token pattern, which only
 *  ever matches a PATH segment, never a query-string value, but there is no reason to tempt it). */
const FAKE_PRESIGNED_QUERY =
  "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=fixture-signature-not-real";

function stubRunner(behavior?: (call: RecordedCall) => void): {
  runner: CommandRunner;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = async (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    behavior?.(call);
    if (args.includes("presign")) {
      const key = args[2] ?? "";
      return { stdout: `https://example-signed.invalid${key.replace(/^s3:\/\/[^/]+/, "")}?${FAKE_PRESIGNED_QUERY}\n`, stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  return { runner, calls };
}

const CONFIG: S3Config = { bucket: "strawmotion-schedule-media", region: "us-east-1" };

describe("directJpgUrl (issue #198 — the UNSIGNED direct URL, used only to prove the bucket refuses it)", () => {
  it("builds the bucket's virtual-hosted-style URL for a key", () => {
    assert.equal(
      directJpgUrl(CONFIG, "straw-motion/2026-W32/idea-01/tok/0-hook.jpg"),
      "https://strawmotion-schedule-media.s3.us-east-1.amazonaws.com/straw-motion/2026-W32/idea-01/tok/0-hook.jpg",
    );
  });

  it("rejects a key that does not end in .jpg", () => {
    assert.throws(() => directJpgUrl(CONFIG, "a.png"), /\.jpg/);
  });
});

describe("presignViaAwsCli — argv construction (stubbed runner, issue #198)", () => {
  it("invokes aws s3 presign with the exact argv and returns the trimmed stdout URL", async () => {
    const { runner, calls } = stubRunner();
    const url = await presignViaAwsCli("straw-motion/idea-01/tok/0-hook.jpg", CONFIG, 3600, { runner });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "aws");
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "presign",
      "s3://strawmotion-schedule-media/straw-motion/idea-01/tok/0-hook.jpg",
      "--region",
      "us-east-1",
      "--expires-in",
      "3600",
    ]);
    assert.match(url, /^https:\/\/example-signed\.invalid/);
    assert.ok(!url.endsWith("\n"));
  });

  it("rejects a key that does not end in .jpg WITHOUT invoking the runner", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(() => presignViaAwsCli("straw-motion/a.png", CONFIG, 3600, { runner }), /\.jpg/);
    assert.equal(calls.length, 0);
  });

  it("rejects an expiresInSeconds beyond AWS's ceiling WITHOUT invoking the runner", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(
      () => presignViaAwsCli("a.jpg", CONFIG, MAX_PRESIGN_SECONDS + 1, { runner }),
      /604800/,
    );
    assert.equal(calls.length, 0);
  });

  it("throws a clear error when the AWS CLI returns empty stdout", async () => {
    const runner: CommandRunner = async () => ({ stdout: "", stderr: "" });
    await assert.rejects(() => presignViaAwsCli("a.jpg", CONFIG, 3600, { runner }), /no URL/);
  });
});

describe("uploadViaAwsCli — cp then presign, in order (stubbed runner, issue #144; re-shaped issue #198)", () => {
  it("invokes aws s3 cp, then aws s3 presign, and returns the signed URL", async () => {
    const { runner, calls } = stubRunner();
    const result = await uploadViaAwsCli(
      "/tmp/slide-0.jpg",
      "straw-motion/idea-01/tok/0-hook.jpg",
      CONFIG,
      3600,
      { runner },
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.args[1], "cp");
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "cp",
      "/tmp/slide-0.jpg",
      "s3://strawmotion-schedule-media/straw-motion/idea-01/tok/0-hook.jpg",
      "--region",
      "us-east-1",
      "--content-type",
      "image/jpeg",
    ]);
    // Never passes any --acl flag — the object simply inherits the bucket's own, now-private, default
    // access (issue #198 — no bucket policy grants public access anymore).
    assert.ok(!calls[0]?.args.some((a) => a.includes("acl")));

    assert.equal(calls[1]?.args[1], "presign");
    assert.deepEqual(calls[1]?.args, [
      "s3",
      "presign",
      "s3://strawmotion-schedule-media/straw-motion/idea-01/tok/0-hook.jpg",
      "--region",
      "us-east-1",
      "--expires-in",
      "3600",
    ]);

    assert.match(result.url, /^https:\/\/example-signed\.invalid/);
  });

  it("rejects a key that does not end in .jpg WITHOUT invoking the runner", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(
      () => uploadViaAwsCli("/tmp/a.png", "straw-motion/a.png", CONFIG, 3600, { runner }),
      /\.jpg/,
    );
    assert.equal(calls.length, 0);
  });

  it("rejects an invalid expiresInSeconds WITHOUT invoking the runner", async () => {
    const { runner, calls } = stubRunner();
    await assert.rejects(() => uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, 0, { runner }), /positive integer/);
    assert.equal(calls.length, 0);
  });

  it("honors a custom awsCommand override for both calls", async () => {
    const { runner, calls } = stubRunner();
    await uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, 3600, {
      runner,
      awsCommand: "/usr/local/bin/aws",
    });
    assert.equal(calls[0]?.command, "/usr/local/bin/aws");
    assert.equal(calls[1]?.command, "/usr/local/bin/aws");
  });

  it("passes the given env through to the runner untouched, for both calls", async () => {
    const { runner, calls } = stubRunner();
    const env = { AWS_ACCESS_KEY_ID: "AKIA_TEST_VALUE_1234" };
    await uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, 3600, { runner, env });
    assert.equal(calls[0]?.options?.env, env);
    assert.equal(calls[1]?.options?.env, env);
  });

  it("redacts an AWS credential value out of a thrown command error's message", async () => {
    const secret = "wJalrXUtnFEMI-SECRET-VALUE-EXAMPLE";
    const runner: CommandRunner = async () => {
      throw new Error(`AccessDenied using secret ${secret}`);
    };
    const env = { AWS_SECRET_ACCESS_KEY: secret };
    await assert.rejects(
      () => uploadViaAwsCli("/tmp/a.jpg", "a.jpg", CONFIG, 3600, { runner, env }),
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
    await deleteViaAwsCli("straw-motion/idea-01/tok/0-hook.jpg", CONFIG, { runner });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "aws");
    assert.deepEqual(calls[0]?.args, [
      "s3",
      "rm",
      "s3://strawmotion-schedule-media/straw-motion/idea-01/tok/0-hook.jpg",
      "--region",
      "us-east-1",
    ]);
  });

  it("redacts an AWS credential value out of a thrown delete error's message too", async () => {
    const secret = "AKIA_DELETE_PATH_SECRET_1234";
    const runner: CommandRunner = async () => {
      throw new Error(`denied: ${secret}`);
    };
    await assert.rejects(
      () => deleteViaAwsCli("a.jpg", CONFIG, { runner, env: { AWS_ACCESS_KEY_ID: secret } }),
      (error: unknown) => {
        assert.ok(error instanceof Error && !error.message.includes(secret));
        return true;
      },
    );
  });
});
