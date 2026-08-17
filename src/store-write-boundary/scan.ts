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
 *
 * **Issue #235 — two residual holes closed:**
 *
 * 1. **File-backed write functions, when a store exports one under its own distinct name.** #233's own
 *    QA round found that `src/production-spec/store.ts`'s file-backed `saveSpec` sat outside this
 *    guard's SQL-only sweep AND outside `src/fs-boundary/`'s `node:fs` sweep at the same time (that
 *    guard already allow-lists `production-spec/store.ts` itself as "already-the-store," so a caller of
 *    `saveSpec` never imports `node:fs` and never trips it either) — a bypass invisible to both guards
 *    at once, in the seam between them. `saveSpec` poses none of `writeAsset`'s overload-ambiguity
 *    problem (one export name serving a file-backed AND a SQL-backed call shape): it is one unambiguous,
 *    distinctly-named, file-backed function, so it is named in `STORE_WRITE_FUNCTIONS` exactly like a
 *    SQL-backed write. No other store among the 15 named below has a second, distinctly-named file-backed
 *    write sibling today (verified: none of the others import `writeFileAtomic`/`node:fs` at all).
 * 2. **Namespace imports.** A star import of a store module ("import star as an alias" — deliberately not
 *    spelled out as a literal import statement in this comment; see the note below on why) followed by a
 *    call through that alias evaded the named-import matcher entirely. A namespace import binds every
 *    export of the module it names — not a narrower list a detector can read off the import statement the
 *    way a named import's `{ a, b }` list gives one — so `findStoreWriteImports` now treats a namespace
 *    import of a tracked store module as importing every one of that store's write functions. This is not
 *    an over-approximation: it is a literal reading of what a namespace import actually does at the
 *    language level, and it avoids the alternative (grepping for alias-qualified call sites), which would
 *    reopen the exact "which properties of a namespace object are actually invoked" scope-analysis problem
 *    this guard's whole regex-based, no-AST design deliberately stays out of.
 *
 * **A gotcha found while writing this very comment, worth stating plainly:** both `NAMED_IMPORT_PATTERN`
 * and `NAMESPACE_IMPORT_PATTERN` match on raw text, with no awareness of comment vs. code context (the
 * same "no parsing, no AST" choice `fs-boundary/scan.ts` already made) — a literal, syntactically-real
 * import statement written out inside a doc comment (as an example, the way this paragraph almost did)
 * would itself be matched as a violation. This file's own comments are therefore written to describe
 * shapes in prose rather than reproduce them verbatim; `proposal.md`'s "Known gaps" states this as a
 * disclosed limitation, not a silent one.
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
 *
 * Issue #235: also names a store's own FILE-BACKED write function, when one exists under a distinct
 * export name (unlike `writeAsset`'s ambiguous overload) — today, only
 * `src/production-spec/store.ts`'s `saveSpec` (the file-backed Production Spec write, sitting beside the
 * SQL-backed `saveProductionSpec` in the same file).
 */
export const STORE_WRITE_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  "src/trend/store.ts": ["createTrend"],
  "src/idea/store.ts": ["createIdea", "acceptIdea", "rejectIdea", "selectIdeaRecipes", "classifyIdea"],
  "src/production-queue/job-store.ts": ["createJob", "claimJob", "releaseJob", "requeueJob"],
  "src/production-queue/gate-request-store.ts": ["createGateRequest", "recordGateDecision"],
  "src/asset/store.ts": ["writeAsset", "addAssetMedia", "addAssetMediaBatch"],
  "src/post/store.ts": ["recordPost", "updatePostTrackingState"],
  "src/performance/store.ts": ["recordMetricSnapshot", "recordChannelBaseline", "recordPerformanceScore"],
  "src/brand-asset/store.ts": ["createBrandAsset"],
  "src/format/store.ts": ["createFormat", "updateFormat"],
  // saveProductionSpec: SQL-backed (asset.spec_json). saveSpec: file-backed (issue #235) — a distinct
  // export name, so unlike writeAsset it can be named unambiguously rather than left invisible.
  "src/production-spec/store.ts": ["saveProductionSpec", "saveSpec"],
  "src/channel/store.ts": ["createChannel", "setPrimaryChannel"],
  "src/brand/store.ts": ["createBrand", "updateBrand"],
  "src/copy/store.ts": ["upsertCopyVariant", "upsertCopyVariants"],
  "src/schedule-outbox/store.ts": ["reserveScheduleOutboxEntry", "confirmScheduleOutboxEntry"],
  // Issue #204's own new store — QA round 1's Defect 1: a store the guard cannot see is unprotected,
  // even when today's only caller (src/command-surface/tenancy.ts) is already legitimate.
  "src/run/store.ts": ["createRun"],
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

/** Matches `import * as alias from "specifier"` (and `import type * as alias from "..."`, mirroring
 *  `NAMED_IMPORT_PATTERN`'s own choice to still match a type-only named import — kept consistent rather
 *  than a narrower judgment call for just this pattern). The alias itself is not used for detection (see
 *  `findNamespaceImportSites`'s own doc comment for why); only the specifier matters. */
const NAMESPACE_IMPORT_PATTERN = /import\s+(?:type\s+)?\*\s+as\s+\w+\s*from\s*["'`]([^"'`]+)["'`]/g;

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
 * Parses every `import * as alias from "..."` site in `content` (issue #235), resolving each specifier
 * against `path`. A namespace import binds EVERY export of the module it names — there is no narrower
 * name list to read off the import statement itself the way a named import's `{ a, b }` list gives one —
 * so when a specifier resolves to a tracked store module, this returns ALL of that store's write-function
 * names as the site's `names`, regardless of which of them the file actually goes on to call via
 * `alias.<name>(...)`. This is a literal reading of what got imported, not an over-approximation: the
 * alternative (grepping for `alias.<name>(` call sites) would reopen the exact "which properties of a
 * namespace object are actually invoked" scope-analysis problem this guard's regex-based, no-AST design
 * deliberately stays out of (an aliased reference, e.g. `const fn = store.createIdea`, would evade a
 * call-site grep the same way a namespace import evaded the named-import matcher in the first place).
 * Pure: no disk, no network, no clock.
 */
function findNamespaceImportSites(
  path: string,
  content: string,
): ReadonlyArray<{ readonly resolvedModule: string; readonly names: readonly string[] }> {
  const sites: Array<{ resolvedModule: string; names: readonly string[] }> = [];
  for (const match of content.matchAll(NAMESPACE_IMPORT_PATTERN)) {
    const [, specifier] = match;
    const resolvedModule = resolveSpecifier(path, specifier!);
    if (resolvedModule === null) continue;
    const writeFunctions = STORE_WRITE_FUNCTIONS[resolvedModule];
    if (writeFunctions === undefined) continue;
    sites.push({ resolvedModule, names: writeFunctions });
  }
  return sites;
}

/**
 * Every non-test, non-`src/command-surface/**` file among `files` that imports one or more of a SQL-
 * backed domain store's write functions by name — via a named import (`{ a, b }`) or a namespace import
 * (`* as alias`, issue #235; every one of that store's write functions is reported, per
 * `findNamespaceImportSites`'s own doc comment) — as `{ path, store, functions }`, one entry per (file,
 * store, site) pair, `functions` in source order, results sorted ascending by `path`. Pure: given the same
 * `files`, always returns the same result — no disk, no network, no clock.
 */
export function findStoreWriteImports(files: readonly SourceFile[]): readonly StoreWriteImport[] {
  const results: StoreWriteImport[] = [];
  for (const file of files) {
    if (isTestPath(file.path) || isCommandSurfacePath(file.path)) continue;
    const sites = [
      ...findNamedImportSites(file.path, file.content),
      ...findNamespaceImportSites(file.path, file.content),
    ];
    for (const site of sites) {
      const writeFunctions = STORE_WRITE_FUNCTIONS[site.resolvedModule];
      if (writeFunctions === undefined) continue;
      const matched = site.names.filter((name) => writeFunctions.includes(name));
      if (matched.length === 0) continue;
      results.push({ path: file.path, store: site.resolvedModule, functions: matched });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
