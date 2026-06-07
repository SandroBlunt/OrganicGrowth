/**
 * Thin write shell: materialises a new Brand directory from the skeleton template.
 *
 * `scaffoldBrand` is the ONLY place that touches the filesystem for new-Brand creation. It:
 *   1. Verifies the Brand directory does not already exist — throws if it does (no overwrites).
 *   2. Copies the `templates/brand-skeleton/` directory structure into `data/brands/<slug>/`.
 *   3. Overwrites the template placeholder files with the content built by the pure builders
 *      (`buildBrandProfile`, `buildSeeds`, `buildEmptyLedger` from `scaffolder.ts`).
 *
 * Design principle: this module contains NO business logic. All content decisions are made by the
 * pure builders before this function is called. The write shell only materialises them.
 *
 * After this function returns:
 *   - `data/brands/<slug>/brand-profile.yaml` contains the YAML-serialised brand profile.
 *   - `data/brands/<slug>/seeds.yaml` contains the YAML-serialised seeds.
 *   - `data/brands/<slug>/ledger.json` contains the JSON-serialised empty ledger.
 *   - Subdirectories from the skeleton (`ideas/`, `your-data/`) exist.
 *   - `listBrands(brandsRoot)` includes the new slug.
 */

import { mkdir, cp, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";

import type { BrandProfileContent, SeedsContent, EmptyLedger } from "./scaffolder.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The content built by the pure builders, ready to be written to disk. */
export interface ScaffoldContent {
  readonly brandProfile: BrandProfileContent;
  readonly seeds: SeedsContent;
  readonly ledger: EmptyLedger;
}

/** Options for `scaffoldBrand`. Allows injection of brandsRoot and templatePath in tests. */
export interface ScaffoldBrandOptions {
  /** Root for all Brand directories. Defaults to `"data/brands"`. */
  readonly brandsRoot?: string;
  /**
   * Path to the brand-skeleton template directory. Defaults to `"templates/brand-skeleton"`.
   * Tests inject a temp copy or the real template at an absolute path.
   */
  readonly templatePath?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BRANDS_ROOT = "data/brands";
const DEFAULT_TEMPLATE_PATH = "templates/brand-skeleton";

// ---------------------------------------------------------------------------
// scaffoldBrand
// ---------------------------------------------------------------------------

/**
 * Materialise a new Brand directory at `<brandsRoot>/<slug>/` from the skeleton template,
 * then write the built brand-profile, seeds, and ledger over the template files.
 *
 * Throws with a clear message that includes the slug if the Brand directory already exists.
 * Never overwrites an existing Brand directory — callers must check first.
 *
 * @param slug     The filesystem-safe Brand slug (validated by `validateSlug` before calling this).
 * @param content  The pre-built content from the pure builders.
 * @param options  Injected paths for testing.
 */
export async function scaffoldBrand(
  slug: string,
  content: ScaffoldContent,
  options: ScaffoldBrandOptions = {},
): Promise<void> {
  const brandsRoot = options.brandsRoot ?? DEFAULT_BRANDS_ROOT;
  const templatePath = options.templatePath ?? DEFAULT_TEMPLATE_PATH;
  const brandDir = join(brandsRoot, slug);

  // Guard: do not overwrite an existing Brand directory.
  let exists = false;
  try {
    const s = await stat(brandDir);
    if (s.isDirectory()) {
      exists = true;
    }
  } catch {
    // Not found — that's the expected case for a new Brand.
  }

  if (exists) {
    throw new Error(
      `Cannot scaffold Brand "${slug}": the directory "${brandDir}" already exists. ` +
        `Remove it first or choose a different Brand name.`,
    );
  }

  // Copy the skeleton template directory into the new Brand directory.
  // `cp` with recursive+force creates the destination and copies all files/subdirs.
  await cp(templatePath, brandDir, { recursive: true });

  // Ensure the brands root itself exists (in case it was just created by cp implicitly — belt-and-suspenders).
  await mkdir(brandsRoot, { recursive: true });

  // Write the built brand-profile YAML over the template placeholder.
  const profileYaml = yamlStringify(content.brandProfile);
  await writeFile(join(brandDir, "brand-profile.yaml"), profileYaml, "utf8");

  // Write the built seeds YAML over the template placeholder.
  const seedsYaml = yamlStringify(content.seeds);
  await writeFile(join(brandDir, "seeds.yaml"), seedsYaml, "utf8");

  // Write the empty ledger JSON over the template placeholder.
  const ledgerJson = JSON.stringify(content.ledger, null, 2) + "\n";
  await writeFile(join(brandDir, "ledger.json"), ledgerJson, "utf8");
}
