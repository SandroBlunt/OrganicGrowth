/**
 * Tests for `commitPath` (`src/git/commit-path.ts`) — the Library admin module's "write + auto-commit"
 * save behavior. Unit tests inject a fake `CommandRunner` to prove the exact argv (never a blanket
 * `git add -A`/`git commit -a` that could sweep up unrelated dirty state); one integration test runs
 * `execFileRunner` for real, against a disposable local `git init` repo — a real local process, never
 * the network, mirroring `command-runner.test.ts`'s own "proven directly, for real" convention.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { commitPath, execFileRunner, type CommandRunner } from "./commit-path.ts";

const execFileAsync = promisify(execFile);

describe("commitPath — argv shape (fake CommandRunner, no real git)", () => {
  it("stages and commits with an explicit pathspec on BOTH `git add` and `git commit` — never -A/-a", async () => {
    const calls: { command: string; args: readonly string[]; cwd: string }[] = [];
    const fake: CommandRunner = async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      return { stdout: "", stderr: "" };
    };

    const result = await commitPath("data/brands/acme/formats/life-hacks.yaml", "Admin: update Recipes", "/repo", fake);

    assert.equal(result, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      command: "git",
      args: ["add", "--", "data/brands/acme/formats/life-hacks.yaml"],
      cwd: "/repo",
    });
    assert.deepEqual(calls[1], {
      command: "git",
      args: ["commit", "-m", "Admin: update Recipes", "--", "data/brands/acme/formats/life-hacks.yaml"],
      cwd: "/repo",
    });
  });

  it("returns false (never throws) when git reports nothing to commit — clean-tree wording", async () => {
    const fake: CommandRunner = async (_command, args) => {
      if (args[0] === "commit") {
        const err = new Error("git commit failed") as Error & { stdout?: string; stderr?: string };
        err.stdout = "nothing to commit, working tree clean\n";
        err.stderr = "";
        throw err;
      }
      return { stdout: "", stderr: "" };
    };

    const result = await commitPath("some/path.md", "msg", "/repo", fake);
    assert.equal(result, false);
  });

  it("returns false (never throws) when git reports nothing to commit — untracked-files-present wording", async () => {
    // A real Operator's working tree usually has OTHER dirty/untracked files sitting around too — git
    // phrases "nothing to commit" differently in that case ("nothing added to commit but untracked
    // files present"), not the clean-tree wording above.
    const fake: CommandRunner = async (_command, args) => {
      if (args[0] === "commit") {
        const err = new Error("git commit failed") as Error & { stdout?: string; stderr?: string };
        err.stdout = "nothing added to commit but untracked files present (use \"git add\" to track)\n";
        err.stderr = "";
        throw err;
      }
      return { stdout: "", stderr: "" };
    };

    const result = await commitPath("some/path.md", "msg", "/repo", fake);
    assert.equal(result, false);
  });

  it("re-throws any OTHER git failure (not a 'nothing to commit' outcome)", async () => {
    const fake: CommandRunner = async (_command, args) => {
      if (args[0] === "commit") {
        const err = new Error("git commit failed") as Error & { stdout?: string; stderr?: string };
        err.stdout = "";
        err.stderr = "fatal: not a git repository\n";
        throw err;
      }
      return { stdout: "", stderr: "" };
    };

    await assert.rejects(() => commitPath("some/path.md", "msg", "/repo", fake), /git commit failed/);
  });
});

describe("commitPath — real git, in a disposable local repo (execFileRunner, no network)", () => {
  let repo: string;

  before(async () => {
    repo = await mkdtemp(join(tmpdir(), "og-commit-path-"));
    await execFileAsync("git", ["init", "--quiet"], { cwd: repo });
    await execFileAsync("git", ["config", "user.email", "test@example.invalid"], { cwd: repo });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repo });
    await writeFile(join(repo, "unrelated.txt"), "unrelated dirty change, never committed by commitPath\n");
  });

  after(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("commits only the target file, leaving other dirty/untracked files untouched", async () => {
    await writeFile(join(repo, "tracked.md"), "# hello\n");

    const committed = await commitPath("tracked.md", "Admin: save tracked.md", repo, execFileRunner);
    assert.equal(committed, true);

    const log = await execFileAsync("git", ["log", "--oneline", "-1", "--format=%s"], { cwd: repo });
    assert.equal(log.stdout.trim(), "Admin: save tracked.md");

    const status = await execFileAsync("git", ["status", "--porcelain"], { cwd: repo });
    assert.equal(status.stdout.trim(), "?? unrelated.txt", "unrelated.txt must stay untouched, never staged/committed");
  });

  it("returns false, doesn't throw, re-saving byte-identical content", async () => {
    const committed = await commitPath("tracked.md", "Admin: no-op save", repo, execFileRunner);
    assert.equal(committed, false);
  });

  it("commits a deletion of the target file only", async () => {
    await rm(join(repo, "tracked.md"));
    const committed = await commitPath("tracked.md", "Admin: delete tracked.md", repo, execFileRunner);
    assert.equal(committed, true);

    const files = await execFileAsync("git", ["ls-files"], { cwd: repo });
    assert.equal(files.stdout.includes("tracked.md"), false);
  });
});
