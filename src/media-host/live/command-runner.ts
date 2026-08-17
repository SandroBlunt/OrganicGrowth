/**
 * The `CommandRunner` seam: how the live Media Host adapter shells out to the AWS CLI (issue #144).
 * `convertToJpg` no longer shells out to anything (issue #209 replaced the macOS-only `sips` call with a
 * pure-JS PNG->JPG converter, `png-to-jpg.ts`) — this seam is now used ONLY for the AWS CLI's
 * `upload`/`delete` calls. Every `live/*.ts` module that needs to run a command takes a `CommandRunner`
 * as an injectable option — tests ALWAYS inject a stub that records the exact argv and returns a canned
 * result, so command CONSTRUCTION is proven without a real process, a real file, or the network.
 * `execFileRunner` (the one REAL implementation, shelling out via `node:child_process`) is proven
 * directly, for real, by THIS module's own tests (run against the Node binary itself — a local process,
 * never the network). Beyond that it is exercised only by `live/smoke.ts` (a manual, non-`npm test`
 * script — see its docstring), for the AWS CLI calls.
 */

import { execFile } from "node:child_process";

/** What a command run returns on success. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandOptions {
  /** The environment to run the command with. Omit to inherit the caller's own `process.env`. */
  readonly env?: NodeJS.ProcessEnv | undefined;
}

/** The narrow seam: run `command args...` and resolve with its output, or reject on a non-zero exit. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

/**
 * Raised when a shelled-out command exits non-zero. Carries `stdout`/`stderr` for diagnosis. The
 * message is built by the CALLER (`live/s3.ts`), which redacts any credential values before they ever
 * reach here — this class itself does not know what a "secret" is.
 */
export class MediaHostCommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly stdout: string,
    public readonly stderr: string,
    cause: string,
  ) {
    super(`${command} failed: ${cause}`);
    this.name = "MediaHostCommandError";
  }
}

/**
 * The REAL command runner — shells out via `node:child_process.execFile`. NEVER used in a test; every
 * `live/*.test.ts` injects a stub `CommandRunner` instead (this module's own doc comment above).
 */
export const execFileRunner: CommandRunner = (command, args, options) =>
  new Promise((resolveResult, reject) => {
    execFile(command, args as string[], { env: options?.env }, (error, stdout, stderr) => {
      if (error) {
        reject(new MediaHostCommandError(command, stdout, stderr, error.message));
        return;
      }
      resolveResult({ stdout, stderr });
    });
  });
