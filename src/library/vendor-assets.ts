/**
 * Serves the Library's page-chrome JS — the Material Design 3 components loaded by `render/html.ts`'s
 * import map — straight out of `node_modules`, for the `/vendor/...` route (`server.ts`). No bundler, no
 * build step: the same "boring on purpose" shape as the rest of this viewer, just extended to JavaScript
 * modules instead of only HTML strings.
 *
 * `resolveVendorFile` is pure — every rejection (unknown package, wrong extension, a `..` segment) is a
 * plain string computation, unit-testable with no disk touched. `readVendorFile` is the one impure
 * export, and the one `node:fs` import in this file — registered in `src/fs-boundary/allow-list.ts`
 * beside `media.ts`, this directory's other (and, until now, only) `node:fs` reader.
 */

import { readFile } from "node:fs/promises";
import { join, resolve as resolvePath, sep } from "node:path";

const VENDOR_ROOT = resolvePath(process.cwd(), "node_modules");

/** Every npm package this viewer may serve out of `node_modules` via `/vendor/...` — nothing else is
 *  reachable, no matter what a request path names. This is exactly the transitive runtime dependency
 *  closure the chosen Material Design 3 components need in a browser (`@material/web`, the `lit` family
 *  it is built on, and `tslib`) — not "everything installed," a short, deliberate list. */
const VENDOR_PACKAGE_ALLOW_LIST: ReadonlySet<string> = new Set([
  "@material/web",
  "lit",
  "lit-html",
  "lit-element",
  "@lit/reactive-element",
  "@lit/context",
  "@lit-labs/ssr-dom-shim",
  "tslib",
]);

const VENDOR_PREFIX = "/vendor/";

/** Splits a `/vendor/...` request path into its npm package name and the subpath within it, handling a
 *  scoped package (`@scope/name/...`) the same way Node's own module resolution does. `null` for
 *  anything not shaped like `/vendor/<package>/<at-least-one-subpath-segment>`. */
function splitVendorPath(requestPath: string): { readonly packageName: string; readonly subpath: string } | null {
  if (!requestPath.startsWith(VENDOR_PREFIX)) return null;
  const segments = requestPath.slice(VENDOR_PREFIX.length).split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  const scoped = segments[0]!.startsWith("@");
  if (scoped && segments.length < 2) return null;
  const packageName = scoped ? `${segments[0]}/${segments[1]}` : segments[0]!;
  const subpathSegments = scoped ? segments.slice(2) : segments.slice(1);
  if (subpathSegments.length === 0) return null;

  return { packageName, subpath: subpathSegments.join("/") };
}

/**
 * Resolves a `/vendor/...` request path to the absolute file this server may read, or `null` when the
 * path names a package outside {@link VENDOR_PACKAGE_ALLOW_LIST}, a non-`.js` file, or contains a `.`/
 * `..` path segment. Never decodes percent-escapes in `requestPath` — an encoded `..` (`%2e%2e`) is
 * treated as a literal, nonexistent directory name rather than a traversal attempt, so there is nothing
 * here for a decode step to defeat. A final `startsWith` check against the package's own directory is
 * defense in depth beyond the segment check, in case `join`'s own normalization ever surprises this.
 */
export function resolveVendorFile(requestPath: string): string | null {
  const split = splitVendorPath(requestPath);
  if (split === null) return null;
  if (!VENDOR_PACKAGE_ALLOW_LIST.has(split.packageName)) return null;
  if (!split.subpath.endsWith(".js")) return null;
  if (split.subpath.split("/").some((seg) => seg === "." || seg === "..")) return null;

  const packageRoot = join(VENDOR_ROOT, split.packageName);
  const absolutePath = join(packageRoot, split.subpath);
  if (!absolutePath.startsWith(packageRoot + sep)) return null;
  return absolutePath;
}

/** Reads the vendor file `requestPath` resolves to, or `null` for anything {@link resolveVendorFile}
 *  rejects, or that genuinely is not on disk (e.g. `npm install` has not been run yet). A missing file
 *  is an ordinary 404, not an error to surface — mirrors `resolveMediaFile`'s own choice. */
export async function readVendorFile(requestPath: string): Promise<Buffer | null> {
  const absolutePath = resolveVendorFile(requestPath);
  if (absolutePath === null) return null;
  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}
