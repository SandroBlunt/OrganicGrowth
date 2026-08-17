/**
 * Pure module-boundary import detection — the deep module behind the node:fs boundary guard (issue
 * #205 AC7). Named generically ("node fs", two words, never spelled out as the literal module
 * specifier in this file's own prose) deliberately: this very doc comment would otherwise trip its own
 * detector the moment `node-fs-guard.test.ts` scans this file — proof the chosen match shape (a real ES
 * import/require SITE, never a bare substring search) is the right one, since even talking ABOUT the
 * target string in prose is a realistic thing a doc comment does.
 *
 * `findNodeFsImports` takes already-read file contents (never touches disk itself) and returns which
 * ones hold a static ES import, or a CommonJS `require` call, naming that Node built-in module (its
 * `/promises` entry point too) — never a bare substring search for the module specifier's own text,
 * which would false-positive on exactly the kind of doc-comment prose this paragraph is an example of.
 *
 * `isTestPath` mirrors this ticket's own re-derivation command (a `git grep` over every tracked `.ts`
 * file under `src/`, piped through `grep -v test`) EXACTLY: a path is test-support when it merely
 * CONTAINS the substring `"test"` anywhere — matching `*.test.ts`, `*.docs-test.ts`, and a fixture path
 * with "test" in a directory name alike. Test-support code is free to import the target module (temp
 * dirs, fixture files, spawned-subprocess fixtures) without ever appearing in the audit or the
 * allow-list; this function is what keeps the guard's target set identical to the one this ticket's own
 * audit was built from.
 */

const TARGET_MODULE = "node:fs";
const NODE_FS_IMPORT_PATTERN = new RegExp(
  `from\\s+["'\`]${TARGET_MODULE}(/promises)?["'\`]|require\\(\\s*["'\`]${TARGET_MODULE}(/promises)?["'\`]\\s*\\)`,
);

/** One source file, already read — repo-relative, forward-slash `path` plus its raw `content`. */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

/** `true` when `path` is test-support code by this repo's own convention: it contains the substring
 *  `"test"` anywhere (case-sensitive, matching `git grep -v test`'s own default). */
export function isTestPath(path: string): boolean {
  return path.includes("test");
}

/** `true` when `content` holds a static ES import site or a CommonJS `require` call naming the target
 *  built-in module (either entry point, any quote style). Pure string matching — no parsing, no AST. */
export function importsNodeFs(content: string): boolean {
  return NODE_FS_IMPORT_PATTERN.test(content);
}

/**
 * Every non-test file (`!isTestPath`) among `files` whose content imports `node:fs`/`node:fs/promises`,
 * as repo-relative paths, sorted ascending. Pure: given the same `files`, always returns the same
 * result — no disk, no network, no clock.
 */
export function findNodeFsImports(files: readonly SourceFile[]): readonly string[] {
  return files
    .filter((file) => !isTestPath(file.path))
    .filter((file) => importsNodeFs(file.content))
    .map((file) => file.path)
    .sort();
}
