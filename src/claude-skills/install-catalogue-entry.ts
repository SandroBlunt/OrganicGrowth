/**
 * Catalogue-entry installer (issue #212's "installing one entry into a genuinely clean checkout is
 * verified end to end" acceptance criterion) — implements the decided shared-reference-dependency
 * install mechanism (`docs/catalogue-manifest-format.md`): copy the entry's whole `.claude/skills/
 * <entry>/` folder, and — per that entry's own `shared_references.install` declaration — the shared
 * `.claude/references/` folder, preserving their relative depth.
 *
 * Split, orchestration-shell-over-deep-module, per this repo's own convention:
 *
 *   - `planInstall` is PURE: given an already-parsed `metadata.yaml` object, it decides WHAT to copy —
 *     no disk access, unit-tested with in-memory fixtures covering all three `install` strategies.
 *   - `copyDirectoryRecursive` is a thin, generic impure helper: walks a source directory and writes
 *     every file to the same relative path under a destination directory, via `writeFileAtomic`
 *     (`src/fs/safe-io.ts`) — the same crash-safe writer every other durable file write in this
 *     codebase uses.
 *   - `installCatalogueEntry` is the thin orchestration shell: reads one entry's `metadata.yaml`, calls
 *     `planInstall`, then performs the copies `planInstall` decided on.
 */

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";

import { writeFileAtomic } from "../fs/safe-io.ts";

/** What an install must do for one catalogue entry, decided purely from its own declared
 *  `shared_references.install` strategy — never from disk state. */
export type InstallPlan =
  | { readonly installable: true; readonly strategy: "copy-alongside" | "vendored"; readonly copySharedReferences: boolean }
  | { readonly installable: false; readonly strategy: string; readonly reason: string };

/** The result of actually performing an install: every relative path copied, plus the plan that was
 *  followed (so a caller — or a test — can assert on both what was decided and what happened). */
export interface InstallResult {
  readonly plan: InstallPlan;
  readonly entryFiles: readonly string[];
  readonly sharedReferenceFiles: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decides what an install must copy for one catalogue entry, given its already-parsed `metadata.yaml`.
 * Pure — no disk access. Handles all three declared `shared_references.install` values, plus a
 * defensively-handled missing/unrecognized one (never throws; an invalid manifest is the completeness
 * guard's job to catch, not this function's).
 */
export function planInstall(metadata: unknown, skillName: string): InstallPlan {
  const install = isPlainObject(metadata) ? getInstallStrategy(metadata) : undefined;

  switch (install) {
    case "copy-alongside":
      return { installable: true, strategy: "copy-alongside", copySharedReferences: true };
    case "vendored":
      return { installable: true, strategy: "vendored", copySharedReferences: false };
    case "refuse-without":
      return {
        installable: false,
        strategy: "refuse-without",
        reason:
          `${skillName} declares its shared-reference dependency as "refuse-without" — it cannot be ` +
          `installed without that dependency separately supplied by the licensee.`,
      };
    default:
      return {
        installable: false,
        strategy: String(install ?? "(missing)"),
        reason:
          `${skillName}'s metadata.yaml has no recognized shared_references.install strategy ` +
          `(found ${JSON.stringify(install)}) — cannot decide what an install must copy.`,
      };
  }
}

function getInstallStrategy(metadata: Record<string, unknown>): unknown {
  const sharedReferences = metadata["shared_references"];
  return isPlainObject(sharedReferences) ? sharedReferences["install"] : undefined;
}

/**
 * Recursively copies every file under `srcDir` to the same relative path under `destDir`, creating any
 * missing parent directories, via `writeFileAtomic`. Returns the relative paths copied, sorted, for a
 * caller (or a test) to assert against.
 */
export async function copyDirectoryRecursive(srcDir: string, destDir: string): Promise<readonly string[]> {
  const copied: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(srcPath);
      } else if (entry.isFile()) {
        const relPath = relative(srcDir, srcPath).split("\\").join("/");
        const destPath = join(destDir, relPath);
        await mkdir(join(destPath, ".."), { recursive: true });
        const buf = await readFile(srcPath);
        await writeFileAtomic(destPath, buf);
        copied.push(relPath);
      }
    }
  }

  await walk(srcDir);
  return copied.sort();
}

/**
 * Installs one catalogue entry into `destDir`: copies `.claude/skills/<skillName>/` in full, and — per
 * that entry's own `planInstall` decision — the shared `.claude/references/` folder, both under a
 * `.claude/` root in `destDir`, preserving the relative depth the entry's own citations assume. Throws
 * when the entry declares it cannot be installed (`refuse-without`, or an unrecognized strategy) — a
 * genuine "cannot install" outcome, not a silent partial copy.
 */
export async function installCatalogueEntry(opts: {
  readonly repoRoot: string;
  readonly skillName: string;
  readonly destDir: string;
}): Promise<InstallResult> {
  const { repoRoot, skillName, destDir } = opts;
  const entrySrc = join(repoRoot, ".claude", "skills", skillName);
  const metadataContent = await readFile(join(entrySrc, "metadata.yaml"), "utf8");
  const metadata: unknown = parseYaml(metadataContent);

  const plan = planInstall(metadata, skillName);
  if (!plan.installable) {
    throw new Error(plan.reason);
  }

  const entryDest = join(destDir, ".claude", "skills", skillName);
  const entryFiles = await copyDirectoryRecursive(entrySrc, entryDest);

  let sharedReferenceFiles: readonly string[] = [];
  if (plan.copySharedReferences) {
    const sharedSrc = join(repoRoot, ".claude", "references");
    const sharedDest = join(destDir, ".claude", "references");
    sharedReferenceFiles = await copyDirectoryRecursive(sharedSrc, sharedDest);
  }

  return { plan, entryFiles, sharedReferenceFiles };
}
