/**
 * Backup runner — the orchestration shell that copies every Brand's media (ledger-referenced files
 * UNION the produced-media tree) to a durable destination and writes the manifest (issue #197).
 *
 * Composes, per Brand: `resolveBrand` (paths), `loadIdeas` (the ledger), `collectLedgerMediaRefs`
 * (ledger-side refs), `resolveRawLedgerPath` (raw path -> absolute, existence-checked), a missing-path
 * report (never a silent skip), `collectProducedMediaFiles` (the produced-media tree), a union of
 * both sources keyed on the resolved absolute path (so a file referenced by BOTH the ledger and the
 * tree walk is copied exactly once), `backupKeyFor` (destination-relative key), and
 * `copyFileWithDigest` (the actual copy + manifest entry). Writes `<destination>/manifest.json` via
 * the same atomic writer every other durable file in this codebase uses.
 *
 * Brands are discovered via `listBrands` — not a hardcoded pair — so a Brand added after this slice
 * ships is backed up automatically, with no code change (issue #197 names "both Brands" as of today;
 * this is how that requirement stays true after a third Brand is onboarded).
 */

import { mkdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { DEFAULT_BRANDS_ROOT, listBrands, resolveBrand } from "../brand/resolver.ts";
import { loadIdeas } from "../ledger/ledger.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";
import { writeFileAtomic } from "../fs/safe-io.ts";
import { collectLedgerMediaRefs } from "./ledger-media-refs.ts";
import { resolveRawLedgerPath, backupKeyFor } from "./path-resolve.ts";
import { collectProducedMediaFiles } from "./produced-media-tree.ts";
import { copyFileWithDigest } from "./copy.ts";
import type { BackupManifest, ManifestEntry, MissingLedgerPath } from "./manifest.ts";

export interface BackupRunOptions {
  readonly brandsRoot?: string;
  /** The repo root ledger-recorded relative paths resolve against. Defaults to `process.cwd()`. */
  readonly repoRoot?: string;
  readonly now?: () => string;
}

export interface PerBrandBackupResult {
  readonly brand: string;
  readonly copiedCount: number;
  readonly missingLedgerPaths: readonly MissingLedgerPath[];
}

export interface BackupRunResult {
  readonly destination: string;
  readonly manifestPath: string;
  readonly generatedAt: string;
  readonly brands: readonly PerBrandBackupResult[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run one full backup pass for every Brand under `brandsRoot`, copying files to `destination` and
 * writing `<destination>/manifest.json`. Never throws for a Brand whose ledger is missing or
 * unreadable — that Brand simply contributes zero ledger refs (its produced-media tree, if any, is
 * still backed up) and the run continues for every other Brand; a genuine copy failure for one file
 * DOES propagate (mirrors `downloadAssetFiles`'s "never silently ship a partial Asset" posture — a
 * failed backup should be visibly failed, not silently short).
 */
export async function runMediaBackup(
  destination: string,
  options: BackupRunOptions = {},
): Promise<BackupRunResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const rawBrandsRoot = options.brandsRoot ?? DEFAULT_BRANDS_ROOT;
  // Anchor brandsRoot to repoRoot explicitly, rather than relying on a relative path being
  // implicitly resolved against `process.cwd()` by the underlying `fs` calls — the two coincide by
  // default (repoRoot defaults to `process.cwd()` itself), but MUST also coincide when a caller
  // passes a relative `brandsRoot` together with an EXPLICIT, different `repoRoot`, so a ledger's
  // relative media paths (resolved against `repoRoot` in `resolveRawLedgerPath`) and the produced-
  // media tree walk (rooted at `paths.ideasRoot`, derived from `brandsRoot`) always agree on which
  // filesystem tree they are both looking at.
  const brandsRoot = isAbsolute(rawBrandsRoot) ? rawBrandsRoot : join(repoRoot, rawBrandsRoot);
  const now = options.now ?? (() => new Date().toISOString());

  await mkdir(destination, { recursive: true });

  const brandSlugs = await listBrands(brandsRoot);
  const entries: ManifestEntry[] = [];
  const perBrand: PerBrandBackupResult[] = [];

  for (const brand of brandSlugs) {
    const paths = resolveBrand(brand, brandsRoot);

    let ideas: readonly LedgerIdea[];
    try {
      ideas = await loadIdeas(paths.ledger, brand);
    } catch {
      ideas = [];
    }

    const ledgerRefs = collectLedgerMediaRefs(ideas, brand);
    const missingLedgerPaths: MissingLedgerPath[] = [];

    // Union of ledger-referenced files (existing ones) and the produced-media tree, keyed on the
    // resolved absolute path so a file appearing in both sources is copied exactly once.
    const filesToCopy = new Set<string>();

    for (const ref of ledgerRefs) {
      const abs = resolveRawLedgerPath(ref.path, repoRoot);
      if (await fileExists(abs)) {
        filesToCopy.add(abs);
      } else {
        missingLedgerPaths.push({
          brand: ref.brand,
          ideaId: ref.ideaId,
          recipe: ref.recipe,
          path: ref.path,
        });
      }
    }

    for (const abs of await collectProducedMediaFiles(paths.ideasRoot)) {
      filesToCopy.add(abs);
    }

    let copiedCount = 0;
    for (const abs of filesToCopy) {
      const key = backupKeyFor(abs, repoRoot, brand);
      const destPath = join(destination, key);
      const digest = await copyFileWithDigest(abs, destPath);
      entries.push({ brand, path: key, sha256: digest.sha256, sizeBytes: digest.sizeBytes });
      copiedCount++;
    }

    perBrand.push({ brand, copiedCount, missingLedgerPaths });
  }

  const generatedAt = now();
  const manifest: BackupManifest = {
    generatedAt,
    destination,
    entries,
    missingLedgerPaths: perBrand.flatMap((b) => b.missingLedgerPaths),
  };
  const manifestPath = join(destination, "manifest.json");
  await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return { destination, manifestPath, generatedAt, brands: perBrand };
}
