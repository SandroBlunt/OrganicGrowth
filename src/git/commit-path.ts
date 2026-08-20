/**
 * `commitPath` — commits a change to exactly ONE path, nothing else.
 *
 * The Library admin module's "write + auto-commit" save behavior (a deliberate exception to the
 * Library's own read-only rule, scoped to that one module) exists to keep ADR-0014's promise —
 * "documents the human authors... stay files, git-diffable, Operator-editable" — true even though the
 * edit itself now comes from a form instead of a text editor. Both `git add` and `git commit` are
 * called with an EXPLICIT pathspec, so whatever else happens to be staged or dirty in the working tree
 * (e.g. unrelated, concurrent in-progress work elsewhere in the repo) is never swept into this commit —
 * only `path`'s own change is committed, regardless of what else the index or working tree holds.
 *
 * Takes an injectable `CommandRunner` so tests never shell out to a real git process.
 */

import { execFile } from "node:child_process";

/** What a command run returns on success. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

/** The narrow seam: run `command args...` in `cwd` and resolve with its output, or reject on a
 *  non-zero exit (the rejection carries `stdout`/`stderr` too, for `commitPath`'s own "nothing to
 *  commit" detection). */
export type CommandRunner = (command: string, args: readonly string[], cwd: string) => Promise<CommandResult>;

/** The one real implementation — shells out via `node:child_process`. */
export const execFileRunner: CommandRunner = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(command, args as string[], { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

function isNothingToCommit(err: unknown): boolean {
  const text = `${(err as { stdout?: string })?.stdout ?? ""} ${(err as { stderr?: string })?.stderr ?? ""}`;
  // Git's exact wording varies with what else is going on in the working tree — e.g. a clean tree says
  // "nothing to commit, working tree clean"; a tree with OTHER untracked/unstaged files present (as a
  // real Operator's working tree usually has, mid-session) instead says "nothing added to commit but
  // untracked files present" or "no changes added to commit". All three mean the same thing for us:
  // the target path itself had no change to commit.
  return /nothing to commit|nothing added to commit|no changes added to commit/i.test(text);
}

/**
 * Stages and commits only `path`'s own change, with `message`. Returns `true` if a commit was made,
 * `false` if there was nothing to commit (the write produced byte-identical content — an ordinary,
 * expected outcome, not an error, e.g. an Operator re-saving a form without changing anything).
 */
export async function commitPath(
  path: string,
  message: string,
  cwd: string = process.cwd(),
  runner: CommandRunner = execFileRunner,
): Promise<boolean> {
  await runner("git", ["add", "--", path], cwd);
  try {
    await runner("git", ["commit", "-m", message, "--", path], cwd);
    return true;
  } catch (err: unknown) {
    if (isNothingToCommit(err)) return false;
    throw err;
  }
}
