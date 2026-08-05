import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { execFileRunner, MediaHostCommandError } from "./command-runner.ts";

// These tests run the REAL Node binary (via `process.execPath`) — a local process, never the network —
// so `execFileRunner`'s promise-wrapping and error-handling are proven for real without depending on
// `sips` or the AWS CLI being installed (those are exercised by `sips.test.ts`'s one real-command test
// and the manual `live/smoke.ts` script; see `command-runner.ts`'s docstring).
describe("execFileRunner (issue #144) — the one REAL command runner, proven against node itself", () => {
  it("resolves with stdout/stderr on a zero exit", async () => {
    const result = await execFileRunner(process.execPath, [
      "-e",
      "process.stdout.write('hello'); process.stderr.write('warn')",
    ]);
    assert.equal(result.stdout, "hello");
    assert.equal(result.stderr, "warn");
  });

  it("rejects with a MediaHostCommandError carrying stdout/stderr on a non-zero exit", async () => {
    await assert.rejects(
      () =>
        execFileRunner(process.execPath, [
          "-e",
          "process.stdout.write('partial'); process.stderr.write('boom'); process.exit(2)",
        ]),
      (error: unknown) => {
        assert.ok(error instanceof MediaHostCommandError);
        assert.equal(error.command, process.execPath);
        assert.equal(error.stdout, "partial");
        assert.equal(error.stderr, "boom");
        assert.match(error.message, new RegExp(`^${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} failed:`));
        return true;
      },
    );
  });

  it("rejects with a MediaHostCommandError when the command does not exist", async () => {
    await assert.rejects(
      () => execFileRunner("this-command-does-not-exist-anywhere", []),
      (error: unknown) => error instanceof MediaHostCommandError,
    );
  });

  it("passes the given env through to the child process", async () => {
    const result = await execFileRunner(
      process.execPath,
      ["-e", "process.stdout.write(process.env.OG_TEST_MARKER ?? 'missing')"],
      { env: { ...process.env, OG_TEST_MARKER: "present" } },
    );
    assert.equal(result.stdout, "present");
  });
});
