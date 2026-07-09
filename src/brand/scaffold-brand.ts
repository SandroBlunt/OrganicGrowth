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
 * The YAML files are NOT re-serialised from scratch — that would throw away the template's guidance
 * comments (what each field means, which platforms are wired, the Apify block explanation). Instead
 * we parse the template file into a comment-preserving document, overwrite each field's value with
 * the builder's output, and drop only the now-obsolete `TODO:` fill-me-in prompts. The Operator's
 * scaffolded Brand keeps every explanatory comment; the JSON ledger has no comments, so it is written
 * plainly. All three writes go through the shared crash-safe `writeFileAtomic` helper.
 *
 * After this function returns:
 *   - `data/brands/<slug>/brand-profile.yaml` contains the built brand profile, comments intact.
 *   - `data/brands/<slug>/seeds.yaml` contains the built seeds, comments intact.
 *   - `data/brands/<slug>/ledger.json` contains the JSON-serialised empty ledger.
 *   - Subdirectories from the skeleton (`ideas/`, `your-data/`) exist.
 *   - `listBrands(brandsRoot)` includes the new slug.
 */

import { mkdir, cp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument, visit, isNode } from "yaml";

import type { BrandProfileContent, SeedsContent, EmptyLedger } from "./scaffolder.ts";
import { assertValidBrandSlug } from "./resolver.ts";
import { writeFileAtomic } from "../fs/safe-io.ts";

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
// Helpers
// ---------------------------------------------------------------------------

/** True when `err` is a Node error carrying the given `errno` code (e.g. `"ENOENT"`). */
function hasErrnoCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === code
  );
}

/**
 * Fill a template YAML file's values from `content` while preserving its guidance comments.
 *
 * The template ships with explanatory comments (document headers, section notes, the Apify-block
 * explanation) AND per-field `TODO:` prompts. We keep the former and drop the latter: `setIn`
 * overwrites each top-level field's value in place — which discards the trailing comment on any field
 * whose value is a collection, and keeps it on scalar fields — then a `visit` pass clears the trailing
 * comment on any node that still reads `TODO` (the obsolete "fill me in" prompt for a field we just
 * filled). Comments that sit *before* a key (the section/header guidance) are never touched.
 *
 * @param templateText  the raw template YAML (source of the comments)
 * @param content       the built values, keyed by the template's top-level keys
 * @returns             the filled YAML text, comments preserved
 */
function fillYamlFromTemplate(templateText: string, content: object): string {
  const doc = parseDocument(templateText);
  for (const [key, value] of Object.entries(content)) {
    doc.setIn([key], value);
  }
  visit(doc, (_key, node) => {
    if (isNode(node) && typeof node.comment === "string" && node.comment.includes("TODO")) {
      node.comment = null;
    }
  });
  return doc.toString();
}

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
  // Tenancy boundary: the slug is joined into paths below, so validate it before any I/O.
  assertValidBrandSlug(slug);

  const brandsRoot = options.brandsRoot ?? DEFAULT_BRANDS_ROOT;
  const templatePath = options.templatePath ?? DEFAULT_TEMPLATE_PATH;
  const brandDir = join(brandsRoot, slug);

  // Guard: do not overwrite an existing Brand directory. Only `ENOENT` means "not there yet"; any
  // other stat error (permission, a non-directory in the path) is rethrown rather than silently
  // treated as absent — otherwise we would copy over / clobber-merge a directory we could not read.
  let exists = false;
  try {
    const s = await stat(brandDir);
    if (s.isDirectory()) {
      exists = true;
    }
  } catch (err: unknown) {
    if (!hasErrnoCode(err, "ENOENT")) throw err;
    // ENOENT — that's the expected case for a new Brand.
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

  // Fill the built values into the template YAML, preserving its guidance comments, then write
  // atomically over the copied placeholders. Read the pristine template as the comment source.
  const profileTemplate = await readFile(join(templatePath, "brand-profile.yaml"), "utf8");
  const profileYaml = fillYamlFromTemplate(profileTemplate, content.brandProfile);
  await writeFileAtomic(join(brandDir, "brand-profile.yaml"), profileYaml);

  const seedsTemplate = await readFile(join(templatePath, "seeds.yaml"), "utf8");
  const seedsYaml = fillYamlFromTemplate(seedsTemplate, content.seeds);
  await writeFileAtomic(join(brandDir, "seeds.yaml"), seedsYaml);

  // The ledger is JSON (no comments to preserve) — write it plainly, still atomically.
  const ledgerJson = JSON.stringify(content.ledger, null, 2) + "\n";
  await writeFileAtomic(join(brandDir, "ledger.json"), ledgerJson);
}
