/**
 * Pure store-write import detection — the deep module behind the store-write boundary guard (issue
 * #233, following up on #205's own AC2: "the command surface is the only thing that writes"). Mirrors
 * `src/fs-boundary/scan.ts`'s shape exactly: a pure detector matching a real import SITE, never a bare
 * substring or bare function-name search — the same discipline that guard's own doc comment needed
 * (talking ABOUT a target name in prose is a realistic thing a doc comment does), plus one this guard
 * needs of its own: two unrelated modules in this repo already export a function with the SAME bare name
 * (`brand/resolver.ts`'s file-scanning `listBrands` vs `brand/store.ts`'s SQL-backed `listBrands(db)`),
 * so matching must resolve the import SPECIFIER to the store module it actually points at, never just
 * the imported name.
 *
 * **Scope: writes only, never reads** — a deliberate, recorded decision (this change's `proposal.md`,
 * "Reads vs writes"), not an oversight. `STORE_WRITE_FUNCTIONS` therefore names each SQL-backed domain
 * store's write-function exports ONLY.
 */

import { dirname, join, normalize } from "node:path";

/** One source file, already read — repo-relative, forward-slash `path` plus its raw `content`. */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

/** One (importing file, store module, write function names) violation-or-allow-list-candidate. */
export interface StoreWriteImport {
  readonly path: string;
  readonly store: string;
  readonly functions: readonly string[];
}

/**
 * Every SQL-backed (`db: DatabaseSync` first-argument) domain store shipped by #201/#222/#223/#203,
 * keyed by its repo-relative module path, mapped to its write-function export names ONLY — never a read.
 * `AssetStore.writeAsset` is one export name serving two overloads (a file-backed `{ ledgerPath }` one
 * and a SQL-backed `{ db }` one); a real-import-SITE detector cannot tell which overload a given call
 * site invokes without type-checking (out of scope, the same choice `fs-boundary/scan.ts` already made
 * for `require` vs `import` spelling) — so every import of `writeAsset` is a candidate here regardless of
 * which overload it turns out to use, and the allow-list states each one's overload explicitly.
 */
export const STORE_WRITE_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  "src/trend/store.ts": ["createTrend"],
  "src/idea/store.ts": ["createIdea", "acceptIdea", "rejectIdea", "selectIdeaRecipes"],
  "src/production-queue/job-store.ts": ["createJob", "claimJob", "releaseJob", "requeueJob"],
  "src/production-queue/gate-request-store.ts": ["createGateRequest", "recordGateDecision"],
  "src/asset/store.ts": ["writeAsset", "addAssetMedia", "addAssetMediaBatch"],
  "src/post/store.ts": ["recordPost", "updatePostTrackingState"],
  "src/performance/store.ts": ["recordMetricSnapshot", "recordChannelBaseline", "recordPerformanceScore"],
  "src/brand-asset/store.ts": ["createBrandAsset"],
  "src/format/store.ts": ["createFormat", "updateFormat"],
  "src/production-spec/store.ts": ["saveProductionSpec"],
  "src/channel/store.ts": ["createChannel", "setPrimaryChannel"],
  "src/brand/store.ts": ["createBrand", "updateBrand"],
  "src/copy/store.ts": ["upsertCopyVariant", "upsertCopyVariants"],
};

/** `true` when `path` is test-support code by this repo's own convention — identical rule to
 *  `fs-boundary/scan.ts`'s own `isTestPath`, deliberately re-stated here rather than imported, so this
 *  guard stays fully self-contained (removable/reviewable on its own, mirroring `node-fs-guard.test.ts`'s
 *  own "the one place this touches disk" independence). */
export function isTestPath(path: string): boolean {
  return path.includes("test");
}

/** `true` when `path` is the command surface itself — the one place a store write function is meant to
 *  be imported directly. */
export function isCommandSurfacePath(path: string): boolean {
  return path.startsWith("src/command-surface/");
}

const NAMED_IMPORT_PATTERN = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'`]([^"'`]+)["'`]/g;

/** Resolves a relative import `specifier` written inside `fromPath` to a repo-relative, forward-slash
 *  path — pure string/path algebra, no disk access. A bare (non-relative) specifier (an npm package, a
 *  `node:` built-in) can never resolve to a `src/` store module, so it returns `null` and is skipped. */
function resolveSpecifier(fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return normalize(join(dirname(fromPath), specifier)).split("\\").join("/");
}

/** Parses every named `import { a, b as c } from "..."` site in `content`, resolving each specifier
 *  against `path`. Returns each site's resolved store module path (if any) and the ORIGINAL (pre-`as`)
 *  imported names it names, in source order. Pure: no disk, no network, no clock. */
function findNamedImportSites(
  path: string,
  content: string,
): ReadonlyArray<{ readonly resolvedModule: string; readonly names: readonly string[] }> {
  const sites: Array<{ resolvedModule: string; names: string[] }> = [];
  for (const match of content.matchAll(NAMED_IMPORT_PATTERN)) {
    const [, namesRaw, specifier] = match;
    const resolvedModule = resolveSpecifier(path, specifier!);
    if (resolvedModule === null) continue;
    const names = namesRaw!
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.split(/\s+as\s+/)[0]!.trim());
    sites.push({ resolvedModule, names });
  }
  return sites;
}

/**
 * Every non-test, non-`src/command-surface/**` file among `files` that imports one or more of a SQL-
 * backed domain store's write functions by name, as `{ path, store, functions }`, one entry per (file,
 * store) pair, `functions` in source order, results sorted ascending by `path`. Pure: given the same
 * `files`, always returns the same result — no disk, no network, no clock.
 */
export function findStoreWriteImports(files: readonly SourceFile[]): readonly StoreWriteImport[] {
  const results: StoreWriteImport[] = [];
  for (const file of files) {
    if (isTestPath(file.path) || isCommandSurfacePath(file.path)) continue;
    for (const site of findNamedImportSites(file.path, file.content)) {
      const writeFunctions = STORE_WRITE_FUNCTIONS[site.resolvedModule];
      if (writeFunctions === undefined) continue;
      const matched = site.names.filter((name) => writeFunctions.includes(name));
      if (matched.length === 0) continue;
      results.push({ path: file.path, store: site.resolvedModule, functions: matched });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
