/**
 * A pure `package.json` `scripts`-shape checker (issue #199, QA Round-1 Defect D1).
 *
 * D1: the "npm test merges both suites" spec Requirement had four testable Scenarios and zero
 * persisted automated test — the behaviour was true on the day it shipped, but nothing would catch a
 * future silent revert (e.g. someone quietly dropping the `*.docs-test.ts` glob back out of the `test`
 * script). This module reads the ALREADY-PARSED `package.json` (never a copied string constant — the
 * caller reads the real file and hands this module the parsed result) and pins the MEANINGFUL
 * properties of the `test` script: that the typecheck step runs first, and that a given glob is one of
 * its `node --test` arguments — robust to harmless reformatting (extra whitespace around `&&`, quote
 * style) so it stays a real regression guard, not a nuisance test someone deletes the next time the
 * script is tidied.
 *
 * Sibling to `src/ci/workflow.ts` under the same `ci-pipeline` capability; kept as its own module
 * because it checks a different real file (`package.json`) with different shape rules (npm's own
 * `&&`-chained shell script convention, not GitHub Actions YAML).
 */

export interface PackageJsonScripts {
  scripts?: Record<string, string>;
}

/** Parses a `package.json` document's `scripts` map. Never throws on a malformed document — a missing
 *  or non-object `scripts` key reads as `{}`, so callers get an absent-script answer rather than a
 *  crash. */
export function parsePackageJsonScripts(rawJsonText: string): PackageJsonScripts {
  const parsed: unknown = JSON.parse(rawJsonText);
  if (parsed === null || typeof parsed !== "object") return {};
  const scripts = (parsed as Record<string, unknown>).scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) return {};
  return { scripts: scripts as Record<string, string> };
}

/** An npm script's top-level `&&`-chained commands, each trimmed — robust to extra whitespace around
 *  `&&`, a harmless reformatting concern this Requirement is explicitly meant to survive. */
function chainedCommands(script: string): string[] {
  return script.split("&&").map((part) => part.trim());
}

/** True only when the FIRST command in the given script is exactly this repo's typecheck step
 *  (`tsc -p tsconfig.json --noEmit`) — the ordering the "type error fails before any test runs"
 *  behaviour depends on. */
export function runsTypecheckFirst(script: string): boolean {
  return chainedCommands(script)[0] === "tsc -p tsconfig.json --noEmit";
}

/** True when the given script's `node --test` invocation covers the given glob pattern as one of its
 *  quoted arguments (either single- or double-quoted). Matches the glob as a whole quoted token, so
 *  checking for `"src/**\/*.test.ts"` never false-positives against a script that only carries the
 *  differently-suffixed `"src/**\/*.docs-test.ts"`. */
export function coversTestGlob(script: string, glob: string): boolean {
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`["']${escaped}["']`).test(script);
}
