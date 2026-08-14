/**
 * `uploadCameraHubScriptsCommand` — the orchestration shell for issue #189 /
 * `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`: the producer's Camera Hub
 * teleprompter upload offer.
 *
 * There is deliberately **no standalone `/command`** for this (ADR-0027: "In-conversation offer only,
 * mirroring Schedule Batch... There is no standalone command.") — the Operator never runs this directly.
 * The producer runs it itself, via its own `Bash` tool, ONLY after asking the Operator to quit Camera
 * Hub and getting their confirmation — mirroring how `scheduleViaZohoMcpCommand` is the real code the
 * producer's own documented sequence follows (`GEMINI.md`).
 *
 * Thin: sweep the WHOLE Brand ledger for un-uploaded `news-short-script` Assets
 * (`src/camera-hub/news-short-script.ts`'s `selectUnuploadedNewsShortScripts` — no Run/Format scoping,
 * ADR-0027's "no silent drops"), read each one's already-produced `script.txt` off its own recorded
 * `spec_path` (`outputDirFromSpecPath`), strip the document-only `[Next shot]` marker
 * (`stripNextShotMarkers`), and drive ONE batched call to `uploadTeleprompterScripts`
 * (`src/camera-hub/upload.ts` — a single quit-verify, a single relaunch, across the whole batch). On
 * success, stamp each uploaded Asset's `camera_hub_uploaded_at` via `AssetStore.writeAsset`
 * (ledger-as-source-of-truth) — its `status` is preserved EXACTLY as it was (this field carries no
 * lifecycle meaning of its own, ADR-0011 unchanged).
 *
 * **Never blocks, never throws.** A missing `spec_path`, an unreadable `script.txt`, or the whole batch
 * failing (Camera Hub still running, a malformed `AppSettings.json`, …) is reported in the returned
 * string and changes NOTHING on the ledger for the affected Idea(s) — `script.txt` stays available for
 * manual copy-paste regardless (ADR-0027, mirroring the Shot List media download's own non-fatal
 * failures).
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBrand } from "../brand/resolver.ts";
import { loadIdeas } from "../ledger/ledger.ts";
import { writeAsset } from "../asset/store.ts";
import type { AssetStatus } from "../asset/asset.ts";
import {
  SUPPORTED_RECIPE,
  outputDirFromSpecPath,
  selectUnuploadedNewsShortScripts,
  stripNextShotMarkers,
} from "../camera-hub/news-short-script.ts";
import { uploadTeleprompterScripts, type TeleprompterScriptInput } from "../camera-hub/upload.ts";
import {
  createDefaultCameraHubAppLifecycle,
  type CameraHubAppLifecyclePort,
} from "../camera-hub/app-lifecycle.ts";

/** The real, macOS-default Camera Hub content-library root. NEVER used by a test — every test injects
 *  `options.root` pointed at a temp directory (mirrors the fake-Magnific-Space convention). */
export function defaultCameraHubRoot(): string {
  return join(homedir(), "Library", "Application Support", "Elgato", "Camera Hub");
}

export interface UploadCameraHubScriptsOptions {
  readonly brandsRoot?: string;
  readonly ledgerPath?: string;
  /** The Camera Hub content-library root. Every test passes a temp directory here; only an omitted
   *  value falls back to the real macOS path. */
  readonly root?: string;
  /** The app-lifecycle port. Every test injects a fake here; only an omitted value falls back to the
   *  real, `pgrep`/`open`-backed default. */
  readonly lifecycle?: CameraHubAppLifecyclePort;
  /** Injected clock, for deterministic timestamps. Defaults to the real clock. */
  readonly now?: () => Date;
  /** Injected GUID generator, passed straight through to `uploadTeleprompterScripts`. */
  readonly newGuid?: () => string;
}

interface PreparedScript {
  readonly ideaId: string;
  readonly recipe: string;
  readonly status: AssetStatus;
  readonly title: string;
  readonly bodyText: string;
}

export async function uploadCameraHubScriptsCommand(
  brand: string,
  options: UploadCameraHubScriptsOptions = {},
): Promise<string> {
  const brandPaths = resolveBrand(brand, options.brandsRoot);
  const ledgerPath = options.ledgerPath ?? brandPaths.ledger;
  const root = options.root ?? defaultCameraHubRoot();
  const lifecycle = options.lifecycle ?? createDefaultCameraHubAppLifecycle();
  const now = options.now ?? (() => new Date());

  const header = `Camera Hub teleprompter upload for Brand: ${brand}.`;

  // --- 1. Sweep the WHOLE ledger — every Run, every Format (ADR-0027: no silent drops) --------------

  const ideas = await loadIdeas(ledgerPath, brand);
  const swept = selectUnuploadedNewsShortScripts(ideas);
  if (swept.length === 0) {
    return `${header}\nNothing to upload — no un-uploaded "${SUPPORTED_RECIPE}" Assets found.`;
  }

  // --- 2. Read each swept Asset's already-produced script.txt off its own recorded spec_path ---------

  const prepared: PreparedScript[] = [];
  const skipped: string[] = [];
  for (const item of swept) {
    const specPath = item.asset.spec_path;
    if (specPath === undefined) {
      skipped.push(`${item.ideaId}: its "${SUPPORTED_RECIPE}" Asset carries no spec_path — skipped.`);
      continue;
    }
    const dir = outputDirFromSpecPath(specPath, SUPPORTED_RECIPE);
    let raw: string;
    try {
      raw = await readFile(join(dir, "script.txt"), "utf8");
    } catch (err) {
      skipped.push(
        `${item.ideaId}: could not read script.txt in ${dir} (${err instanceof Error ? err.message : String(err)}) — skipped.`,
      );
      continue;
    }
    prepared.push({
      ideaId: item.ideaId,
      recipe: item.asset.recipe,
      status: item.asset.status,
      title: item.asset.copy?.title ?? item.ideaId,
      bodyText: stripNextShotMarkers(raw),
    });
  }

  if (prepared.length === 0) {
    const lines = [header, "Nothing uploaded — none of the swept Assets' script.txt could be read."];
    if (skipped.length > 0) lines.push("Skipped:", ...skipped.map((s) => `  - ${s}`));
    return lines.join("\n");
  }

  // --- 3. ONE batched upload call — single quit-verify, single relaunch, for the whole batch ----------

  const instant = now();
  const inputs: TeleprompterScriptInput[] = prepared.map((p) => ({ title: p.title, bodyText: p.bodyText }));
  const result = await uploadTeleprompterScripts(root, lifecycle, inputs, {
    now: () => instant,
    ...(options.newGuid !== undefined ? { newGuid: options.newGuid } : {}),
  });

  if (!result.ok) {
    const lines = [
      header,
      `Upload NOT completed (${result.reason}) — script.txt remains available for manual copy-paste; ` +
        "the ledger was not changed for:",
      ...prepared.map((p) => `  - ${p.ideaId}`),
    ];
    if (skipped.length > 0) lines.push("Skipped:", ...skipped.map((s) => `  - ${s}`));
    return lines.join("\n");
  }

  // --- 4. Stamp camera_hub_uploaded_at, status UNCHANGED (no new lifecycle meaning, ADR-0011) ---------

  const uploadedAt = instant.toISOString();
  for (const p of prepared) {
    await writeAsset(p.ideaId, p.recipe, { status: p.status, camera_hub_uploaded_at: uploadedAt }, { ledgerPath });
  }

  const lines = [header, `Uploaded ${prepared.length} script(s) to Camera Hub:`, ...prepared.map((p) => `  - ${p.ideaId}`)];
  if (skipped.length > 0) lines.push("Skipped:", ...skipped.map((s) => `  - ${s}`));
  return lines.join("\n");
}

/**
 * CLI entry: print the upload result. Only runs when invoked directly, e.g.
 * `npx tsx src/commands/upload-camera-hub-scripts.ts <brand>` — deliberately NOT wired to an `npm run`
 * alias or a `.agents/commands/*.md` doc (ADR-0027: "there is no standalone command"). This exists so
 * the `producer` agent's own `Bash` tool has a concrete way to run the REAL upload, after the Operator
 * has approved and confirmed they quit Camera Hub — the Operator never invokes this directly.
 *
 * Exported so tests can invoke the usage-error path directly without spawning a subprocess.
 */
export async function main(): Promise<void> {
  const [brand] = process.argv.slice(2);
  if (brand === undefined) {
    process.stderr.write("usage: npx tsx src/commands/upload-camera-hub-scripts.ts <brand>\n");
    process.exitCode = 1;
    return;
  }
  const output = await uploadCameraHubScriptsCommand(brand);
  process.stdout.write(`${output}\n`);
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`upload-camera-hub-scripts failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
