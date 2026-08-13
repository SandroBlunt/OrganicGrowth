/**
 * `uploadTeleprompterScripts` — the ONE tested capability behind the whole Camera Hub teleprompter
 * upload feature (issue #189, ADR-0027, the "suggested shape"'s `addTeleprompterScript`, generalized to
 * a BATCH of scripts). Drives the 2026-08-12 smoke test's proven quit-verify -> write -> backup ->
 * rewrite -> relaunch order against an injectable Camera Hub root directory and an injectable
 * `CameraHubAppLifecyclePort` — NEVER the real `~/Library/Application Support/Elgato/Camera Hub/`, and
 * NEVER a real process, in any test.
 *
 * **Batched, not per-script** (ADR-0027 / the issue's own "Batch behavior matters"): `isRunning()` is
 * checked exactly ONCE per call, and `launch()` is called exactly ONCE per call, no matter how many
 * scripts are in `scripts` — steps 2-4 (write the Texts JSON, back up, rewrite the pointer list) repeat
 * per script, but the quit-verify and relaunch happen once across the whole batch.
 *
 * **Quit is semi-manual (ADR-0027):** this function does NOT attempt to quit Camera Hub itself — it only
 * VERIFIES, via the injected port's `isRunning()`, that it is ALREADY quit before touching any file. If
 * it is still running, this function does nothing further (no file touched, `launch()` never called) and
 * returns `{ ok: false, reason: "camera_hub_still_running" }` — the CALLER (the producer, conversationally
 * asking the Operator to quit and try again) is responsible for the retry loop.
 *
 * **Never throws** — every failure (the running check itself failing, a malformed `AppSettings.json`, a
 * write failure) is caught and returned as `{ ok: false, reason, uploaded: [] }`, mirroring
 * `collectShotListMedia`'s own "a failed step never fails the job" contract (ADR-0027: "Failure NEVER
 * fails/blocks an Asset's produce/save step").
 */

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeFileAtomic } from "../fs/safe-io.ts";
import type { CameraHubAppLifecyclePort } from "./app-lifecycle.ts";
import { appendLibraryGuids, buildScriptRecord, existingLibraryGuids, newScriptGuid } from "./library.ts";

/** One script to upload: `title` becomes the library's `friendlyName`; `bodyText` is split into
 *  `chapters` via `splitChapters` (`library.ts`'s `buildScriptRecord`). */
export interface TeleprompterScriptInput {
  readonly title: string;
  readonly bodyText: string;
}

/** One script that was actually written into the library (its Texts JSON written AND its GUID appended
 *  to the pointer list — both, or it does not count as uploaded). */
export interface UploadedTeleprompterScript {
  readonly title: string;
  readonly guid: string;
  readonly path: string;
}

export type UploadTeleprompterScriptsResult =
  | { readonly ok: true; readonly uploaded: readonly UploadedTeleprompterScript[] }
  | { readonly ok: false; readonly reason: string; readonly uploaded: readonly UploadedTeleprompterScript[] };

export interface UploadTeleprompterScriptsOptions {
  /** Injected clock, for a deterministic backup-filename timestamp. Defaults to the real clock. */
  readonly now?: () => Date;
  /** Injected GUID generator. Defaults to `newScriptGuid` (a fresh, valid, uppercase UUID per call). */
  readonly newGuid?: () => string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

interface AppSettingsFile {
  readonly exists: boolean;
  /** The exact original bytes — backed up VERBATIM, never re-serialized (preserves whatever formatting
   *  Camera Hub itself used). */
  readonly text: string;
  readonly raw: unknown;
}

/** Read + parse `AppSettings.json`. A missing file is NOT an error (nothing to back up, nothing to
 *  merge with — this is this Brand's very first upload). A file that exists but is not valid JSON, or
 *  parses to something other than a plain object, THROWS — refusing to touch a file whose shape we
 *  cannot safely merge into, rather than risk clobbering unrelated Camera Hub settings. */
async function readAppSettings(path: string): Promise<AppSettingsFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (isEnoent(err)) return { exists: false, text: "", raw: undefined };
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Camera Hub's AppSettings.json at ${path} is not valid JSON — refusing to touch it.`);
  }
  if (!isPlainObject(raw)) {
    throw new Error(`Camera Hub's AppSettings.json at ${path} did not parse to a JSON object — refusing to touch it.`);
  }
  return { exists: true, text, raw };
}

/** The timestamped `.bak-<ts>` sibling path `AppSettings.json` is ALWAYS backed up to before it is
 *  rewritten (issue #189 AC2). */
function backupPath(settingsPath: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${settingsPath}.bak-${stamp}`;
}

/**
 * Upload a batch of teleprompter scripts into the Camera Hub library rooted at `root`. See the module
 * doc above for the full order-of-operations and batching contract.
 */
export async function uploadTeleprompterScripts(
  root: string,
  lifecycle: CameraHubAppLifecyclePort,
  scripts: readonly TeleprompterScriptInput[],
  options: UploadTeleprompterScriptsOptions = {},
): Promise<UploadTeleprompterScriptsResult> {
  if (scripts.length === 0) {
    return { ok: true, uploaded: [] };
  }

  let running: boolean;
  try {
    running = await lifecycle.isRunning();
  } catch (err) {
    return {
      ok: false,
      reason: `could not check whether Camera Hub is running: ${err instanceof Error ? err.message : String(err)}`,
      uploaded: [],
    };
  }
  if (running) {
    return { ok: false, reason: "camera_hub_still_running", uploaded: [] };
  }

  const textsDir = join(root, "Texts");
  const settingsPath = join(root, "AppSettings.json");
  const newGuid = options.newGuid ?? newScriptGuid;
  const now = options.now ?? (() => new Date());

  try {
    // --- Read + validate AppSettings.json BEFORE writing anything (never leave orphaned Texts files
    //     behind an aborted, unparseable settings file) ------------------------------------------------
    const settings = await readAppSettings(settingsPath);
    const startIndex = existingLibraryGuids(settings.raw).length;

    // --- Write each script's Texts/<GUID>.json ------------------------------------------------------
    await mkdir(textsDir, { recursive: true });
    const uploaded: UploadedTeleprompterScript[] = [];
    const guids: string[] = [];
    for (const [i, script] of scripts.entries()) {
      const guid = newGuid();
      const record = buildScriptRecord(guid, script.title, script.bodyText, startIndex + i);
      const path = join(textsDir, `${guid}.json`);
      await writeFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`);
      uploaded.push({ title: script.title, guid, path });
      guids.push(guid);
    }

    // --- Back up AppSettings.json (ALWAYS, before rewriting it — issue #189 AC2) ----------------------
    if (settings.exists) {
      await writeFileAtomic(backupPath(settingsPath, now()), settings.text);
    }

    // --- Rewrite the pointer list, preserving every other key ----------------------------------------
    const nextSettings = appendLibraryGuids(settings.raw, guids);
    await writeFileAtomic(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`);

    // --- Relaunch, once, for the whole batch ----------------------------------------------------------
    await lifecycle.launch();

    return { ok: true, uploaded };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), uploaded: [] };
  }
}
