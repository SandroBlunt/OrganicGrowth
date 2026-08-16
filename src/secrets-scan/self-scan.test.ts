import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { scanRepo, listTrackedFiles } from "./tracked-files.ts";
import { redactSecret } from "./scanner.ts";

/**
 * THE live guard (issue #197, QA Round 1 Defect 1): runs the scanner against THIS repository's own
 * real, currently-tracked file set and asserts it is clean. Everything else in this directory proves
 * the DETECTION LOGIC works (`scanner.test.ts`'s fixtures, `tracked-files.test.ts`'s disposable temp
 * repo, `historical-incident.test.ts`'s real `git show` content) — none of them ever point `scanRepo`
 * at the real repository root, so none of them prove the guard is actually WIRED. This file is the one
 * that does: if a future commit reintroduces a credential-shaped string into any tracked file — in
 * `.claude/`, in `data/`, anywhere — `npm test` fails right here, on this exact assertion.
 *
 * `REPO_ROOT` is derived from `import.meta.url` (this file's own on-disk location), exactly like
 * `historical-incident.test.ts` already does — NOT from `process.cwd()` (which a caller could invoke
 * `npm test` from a different directory) and NOT from any assumption about "the primary checkout".
 * This file lives at `<repo-root>/src/secrets-scan/self-scan.test.ts`, so two directories up is
 * whatever repository root this file physically sits inside — the correct root in a normal checkout
 * AND in a git worktree (a worktree has its own on-disk root; the module's own bytes are already
 * sitting inside it, regardless of where the primary checkout lives). `scanRepo` itself then shells
 * out to `git ls-files` with THAT root as `cwd`, which git resolves correctly for a worktree too (a
 * worktree's `.git` is a small pointer FILE to the real git dir elsewhere; every git command run
 * inside a worktree already transparently follows it — this is not something this module has to
 * handle itself).
 *
 * No allowlist, no known-findings baseline, no path/directory exception of any kind — every tracked
 * file is scanned exactly the same way `scanRepo`'s own tests already prove it scans a fixture repo.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("scanRepo — guards THIS repository's real tracked files (issue #197)", () => {
  it("finds zero credential-shaped strings in the actual, currently-tracked file set", async () => {
    const findings = await scanRepo(REPO_ROOT);

    // If this ever fails, the assertion failure message must NEVER leak the secret itself — report
    // where and what KIND, with the value REDACTED, never `finding.value` verbatim. An empty
    // `summary` here is exactly `assert.deepEqual(findings, [])`'s intent, just failure-safe.
    const summary = findings.map(
      (f) => `${f.path}:${f.line} [${f.kind}] ${redactSecret(f.value)}`,
    );
    assert.deepEqual(
      summary,
      [],
      "credential-shaped string(s) found in tracked files (see summary above — values redacted)",
    );
  });

  it("genuinely scans a non-trivial number of real tracked files, proving this is not a no-op stub", async () => {
    // A companion sanity check: if `REPO_ROOT` resolution or the git plumbing broke silently (e.g.
    // resolved to an empty directory), the assertion above would trivially "pass" with zero findings
    // for the wrong reason. This repository has well over 1000 tracked files; require a floor far
    // below that (robust to future deletions) but far above "accidentally scanned nothing".
    const tracked = await listTrackedFiles(REPO_ROOT);
    assert.ok(
      tracked.length > 100,
      `expected REPO_ROOT (${REPO_ROOT}) to resolve to a real git working tree with real tracked ` +
        `files — got ${tracked.length}`,
    );
  });
});
