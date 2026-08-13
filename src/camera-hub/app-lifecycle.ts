/**
 * The Camera Hub app-lifecycle port (issue #189,
 * `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`).
 *
 * Mirrors the existing hermetic-build seams (`src/space-driver/port.ts`'s `SpaceMcpPort`,
 * `src/media-host/port.ts`'s `MediaHostPort`): a narrow interface `upload.ts` drives; tests ALWAYS
 * inject a FAKE (`fixtures/fake-app-lifecycle.ts`) — no test ever touches a real process.
 *
 * Deliberately just two operations, matching ADR-0027's decision that QUIT is semi-manual (the producer
 * asks the Operator to quit Camera Hub themselves, conversationally — never scripted here) while
 * RELAUNCH is a plain, ordinary app launch (no special permission, safe to automate):
 *
 *   - `isRunning` — a read-only process check, used ONLY to VERIFY the Operator's manual quit before any
 *     file is touched (`upload.ts` never proceeds while this returns `true`).
 *   - `launch` — relaunch the app once the batch's writes are done.
 *
 * There is NO `quit` method on this port at all — that is a structural guarantee that this module can
 * never script an automated quit (the smoke test's own `osascript` quit attempt failed on a confirmation
 * dialog; ADR-0027 deliberately did not pursue an Accessibility-permission workaround).
 *
 * `createDefaultCameraHubAppLifecycle` is the ONE real, macOS-shell-backed implementation (`pgrep`/
 * `open`) — used only when the caller omits `options.lifecycle` (see `src/commands/
 * upload-camera-hub-scripts.ts`). No test in this repository ever calls `isRunning()`/`launch()` on the
 * object it returns — only its SHAPE is checked (`app-lifecycle.test.ts`).
 */

import { execFile } from "node:child_process";

/** The narrow port `upload.ts` drives. A FAKE implements this in every test; the real, macOS-shell
 *  default implements it at runtime. Callers make NO call outside this interface. */
export interface CameraHubAppLifecyclePort {
  /** Is Camera Hub currently running? Used only to verify a manual quit before any file is touched. */
  isRunning(): Promise<boolean>;
  /** Launch (or bring to front) Camera Hub — a plain app launch, no special permission needed. */
  launch(): Promise<void>;
}

function isErrnoExitCode(err: unknown): err is { readonly code: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "number"
  );
}

/** Run `pgrep -f pattern`, resolving its bare exit code (0 = at least one match, 1 = no match) rather
 *  than its stdout — we only need a yes/no. Any OTHER exit code (or a non-exit-code failure, e.g.
 *  `pgrep` itself missing) rejects, so a genuinely broken check surfaces as a failure rather than a
 *  silently-wrong "not running". */
function pgrepExitCode(pattern: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile("pgrep", ["-f", pattern], (error) => {
      if (error === null) {
        resolve(0);
        return;
      }
      if (isErrnoExitCode(error)) {
        resolve(error.code);
        return;
      }
      reject(error);
    });
  });
}

function runOpen(appName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", ["-a", appName], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Options for the real, macOS-default app-lifecycle — override only for a differently-named build of
 *  Camera Hub; every test instead injects a fake port entirely (never these options). */
export interface DefaultCameraHubAppLifecycleOptions {
  /** The `pgrep -f` pattern identifying the Camera Hub process. Defaults to `"Camera Hub"`. */
  readonly processPattern?: string;
  /** The `open -a` application name. Defaults to `"Elgato Camera Hub"`. */
  readonly appName?: string;
}

/**
 * The ONE real implementation: `pgrep -f "<processPattern>"` for `isRunning`, `open -a "<appName>"` for
 * `launch`. Never exercised by `npm test` — every test injects a fake instead (mirrors
 * `src/media-host/live/adapter.ts`'s own "real, but only proven by a manual smoke path" posture).
 */
export function createDefaultCameraHubAppLifecycle(
  options: DefaultCameraHubAppLifecycleOptions = {},
): CameraHubAppLifecyclePort {
  const processPattern = options.processPattern ?? "Camera Hub";
  const appName = options.appName ?? "Elgato Camera Hub";
  return {
    async isRunning(): Promise<boolean> {
      const code = await pgrepExitCode(processPattern);
      if (code === 0) return true;
      if (code === 1) return false;
      throw new Error(`pgrep -f "${processPattern}" exited with unexpected code ${code}`);
    },
    async launch(): Promise<void> {
      await runOpen(appName);
    },
  };
}
