/**
 * Produced-media tree discovery — the shell that finds every file under a Brand's produced Asset
 * output bundles (issue #197), the second of the two sources the backup command unions (the first
 * being `ledger-media-refs.ts`'s ledger-recorded paths).
 *
 * A produced Asset's OWN bundle directory is named `idea-NN.<recipe>.output` (current) or
 * `idea-NN.<recipe>.assets` (legacy — never migrated; both stay gitignored,
 * `.gitignore`'s own comment). This module walks a Brand's whole `ideasRoot` and collects EVERY file
 * under any directory whose name ends in `.output` or `.assets` — not just the ones the ledger
 * happens to reference by path. That matters because a bundle can carry files the ledger never
 * points at individually (a `caption.txt`, a `post.json`, a slide from a botched/superseded render
 * left on disk) — the produced-media tree is "everything actually rendered", the ledger refs are
 * "what the ledger currently points at"; the backup command unions both so neither leaves a gap.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const BUNDLE_DIR_SUFFIXES = [".output", ".assets"];

function isBundleDirName(name: string): boolean {
  return BUNDLE_DIR_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Recursively collect every file under `ideasRoot` that sits inside a `.output`/`.assets` bundle
 * directory (at any depth — a Format's nested Run layout, e.g.
 * `ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/idea-NN.<recipe>.output/`, ADR-0023, is walked
 * the same way as a flat legacy `ideas/<run>/idea-NN.<recipe>.output/`). Returns absolute paths,
 * sorted for determinism. A missing/unreadable `ideasRoot` (a brand-new Brand with no Ideas yet)
 * yields `[]` rather than throwing.
 */
export async function collectProducedMediaFiles(ideasRoot: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, insideBundle: boolean): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // A bundle dir is named "idea-NN.<recipe>.output"/".assets" — never starting with a dot — so
      // this skip only ever excludes stray hidden entries (.DS_Store, .git, ...), never a bundle.
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, insideBundle || isBundleDirName(entry.name));
      } else if (entry.isFile() && insideBundle) {
        found.push(full);
      }
    }
  }

  await walk(ideasRoot, false);
  return found.sort();
}
