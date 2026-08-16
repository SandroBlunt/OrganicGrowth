import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listTrackedFiles, readScannableFiles, scanRepo } from "./tracked-files.ts";

const FAKE_TOKEN = "fedcba9876543210fedcba9876543210fedcba"; // synthetic, 39 hex chars — not a real secret

function git(cwd: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args as string[], { cwd }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

/**
 * Builds a disposable temp git repo with:
 *   - a TRACKED file carrying a credential-shaped URL (should be found),
 *   - an UNTRACKED file carrying the SAME shape (must NOT be found — proves `git ls-files`, not a
 *     working-tree walk),
 *   - a `.gitignore`d file carrying the same shape (also must NOT be found),
 *   - a TRACKED binary-ish file (a NUL byte) that must be skipped without throwing,
 *   - a TRACKED clean text file (no findings).
 */
async function buildFixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "og-secrets-scan-fixture-"));
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test"]);

  const secretUrl = `https://social-000000000.zohomcp.com/mcp/${FAKE_TOKEN}/message`;

  await writeFile(join(root, "tracked-secret.json"), JSON.stringify({ url: secretUrl }));
  await writeFile(join(root, "clean.md"), "nothing interesting here\n");
  await writeFile(join(root, "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]));
  await writeFile(join(root, ".gitignore"), "ignored-secret.json\n");
  await writeFile(join(root, "ignored-secret.json"), JSON.stringify({ url: secretUrl }));
  // Untracked but NOT gitignored — proves this is about the git INDEX, not .gitignore rules either.
  await writeFile(join(root, "untracked-secret.json"), JSON.stringify({ url: secretUrl }));

  await git(root, ["add", "tracked-secret.json", "clean.md", "binary.bin", ".gitignore"]);
  await git(root, ["commit", "-q", "-m", "fixture"]);

  return root;
}

describe("tracked-files — git-ls-files-driven scanning (issue #197)", () => {
  let root: string;

  before(async () => {
    root = await buildFixtureRepo();
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("listTrackedFiles lists exactly the committed files, never the untracked/ignored ones", async () => {
    const files = await listTrackedFiles(root);
    assert.deepEqual(
      [...files].sort(),
      [".gitignore", "binary.bin", "clean.md", "tracked-secret.json"],
    );
  });

  it("listTrackedFiles returns [] for a directory that is not a git repo (never throws)", async () => {
    const notARepo = await mkdtemp(join(tmpdir(), "og-not-a-repo-"));
    try {
      const files = await listTrackedFiles(notARepo);
      assert.deepEqual(files, []);
    } finally {
      await rm(notARepo, { recursive: true, force: true });
    }
  });

  it("readScannableFiles skips binary content without throwing, and skips a file that no longer exists", async () => {
    const files = await readScannableFiles(root, [
      "binary.bin",
      "clean.md",
      "does-not-exist.json",
    ]);
    assert.deepEqual(
      files.map((f) => f.path),
      ["clean.md"],
    );
  });

  it("scanRepo finds the credential-shaped string in the TRACKED file", async () => {
    const findings = await scanRepo(root);
    const paths = findings.map((f) => f.path);
    assert.ok(paths.includes("tracked-secret.json"), `expected tracked-secret.json in ${JSON.stringify(paths)}`);
  });

  it("scanRepo does NOT find the same secret shape in an untracked file", async () => {
    const findings = await scanRepo(root);
    const paths = findings.map((f) => f.path);
    assert.ok(!paths.includes("untracked-secret.json"));
  });

  it("scanRepo does NOT find the same secret shape in a gitignored file", async () => {
    const findings = await scanRepo(root);
    const paths = findings.map((f) => f.path);
    assert.ok(!paths.includes("ignored-secret.json"));
  });

  it("scanRepo reports exactly one finding across the whole fixture repo", async () => {
    const findings = await scanRepo(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.path, "tracked-secret.json");
    assert.equal(findings[0]?.value, FAKE_TOKEN);
  });
});
