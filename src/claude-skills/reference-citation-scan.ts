/**
 * Pure reference-citation scanner for the `.claude/skills/` catalogue (issue #252, #212's own
 * "automated check fails when a catalogue entry has an incomplete manifest or a dangling reference
 * link" acceptance criterion — the dangling-reference-link half of it; the manifest half stays on
 * #212).
 *
 * A model-prompting Skill cites one of the five shared craft-reference documents
 * (`prompt-discipline.md`, `cinematography.md`, `lighting.md`, `photography.md`,
 * `production-design.md`), or the shared `.claude/references/` folder itself, via a relative path of
 * the shape `(../)+(<segment>/)*references/(<name>.md)?` — from its own `SKILL.md`/`metadata.yaml`
 * (one directory shallower) or from a `references/*.md` sibling one directory deeper. Two sub-shapes,
 * both covered:
 *
 *   - a NAMED citation, e.g. `../../references/photography.md` — resolves to one specific document;
 *   - a bare-DIRECTORY citation, no filename, e.g. `../../references/` or a `metadata.yaml`
 *     `shared_references.path:` field — resolves to the shared folder itself.
 *
 * Either sub-shape may carry extra path segments between the `../` climb and the final `references/`
 * (e.g. a stale `../../../_shared/references/` pointer at a repo root `_shared/` that was never
 * created — issue #252 Round 1's Defect 1) — those are matched and resolved too, not skipped, because
 * a citation with an extra segment in the middle is exactly as dangling as one with the wrong depth.
 *
 * This module extracts every such citation and resolves it against the citing file's own location.
 * The named sub-shape is EXACTLY the reproduction shape issue #252 was filed with:
 *
 *     pat = re.compile(r'((?:\.\./)+references/([a-z-]+\.md))')
 *     t = os.path.normpath(os.path.join(os.path.dirname(f), m.group(1)))
 *
 * `findDanglingReferenceCitations` takes a `pathExists` PREDICATE rather than touching disk itself —
 * mirroring `src/fs-boundary/scan.ts`'s split between pure parsing (`scan.ts`) and the disk-walking
 * guard (`*-guard.docs-test.ts`). The real guard passes `existsSync`; this module's own test passes an
 * in-memory closure, so the parsing/resolution logic is provable with zero disk I/O. `existsSync` is
 * true for both a file and a directory, so the same predicate validates both sub-shapes unchanged.
 */

/** One source file, already read — repo-relative, forward-slash `path` plus its raw `content`. */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

/** One `(../)+(<segment>/)*references/(<name>.md)?` citation found inside a citing file, resolved
 *  against that file's own location — either a named-file citation or a bare-directory one (no
 *  filename). `resolvedPath` is a repo-relative, forward-slash path — normalized exactly like
 *  `os.path.normpath(os.path.join(dirname, rawPath))` in issue #252's own reproduction script. */
export interface ReferenceCitation {
  readonly citingFile: string;
  readonly rawPath: string;
  readonly resolvedPath: string;
}

const CITATION_PATTERN = /((?:\.\.\/)+(?:[a-zA-Z0-9_.-]+\/)*references\/(?:[a-z-]+\.md)?)/g;

/** The repo-relative directory a repo-relative file path sits in ("" for a root-level file), using
 *  forward slashes throughout — the same convention `src/fs-boundary`'s guard already uses. */
function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Normalizes a `/`-joined path: resolves every `..` and `.` segment, drops empty segments, never
 *  escapes above an empty root (mirrors `os.path.normpath`'s behaviour for the relative paths this
 *  scanner deals in — none of these citations ever legitimately climb above the repo root). */
function normalizeSegments(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/** Resolves a citation's raw relative path against the repo-relative directory of the file that
 *  cites it, e.g. (".claude/skills/veo-3-1", "../../references/photography.md") ->
 *  ".claude/references/photography.md". */
export function resolveCitationPath(citingDir: string, rawPath: string): string {
  return normalizeSegments(`${citingDir}/${rawPath}`);
}

/** Every `(../)+(<segment>/)*references/(<name>.md)?` citation in one file's content — named or
 *  bare-directory, with or without an intervening path segment — resolved against that file's own
 *  repo-relative path. Pure string matching, no disk access. */
export function extractReferenceCitations(file: SourceFile): readonly ReferenceCitation[] {
  const citingDir = dirnameOf(file.path);
  const found: ReferenceCitation[] = [];
  for (const match of file.content.matchAll(CITATION_PATTERN)) {
    const rawPath = match[1]!;
    found.push({
      citingFile: file.path,
      rawPath,
      resolvedPath: resolveCitationPath(citingDir, rawPath),
    });
  }
  return found;
}

/** Every citation across a corpus of files, in file order then match order. */
export function extractAllReferenceCitations(
  files: readonly SourceFile[],
): readonly ReferenceCitation[] {
  return files.flatMap((file) => extractReferenceCitations(file));
}

/**
 * Every citation whose `resolvedPath` does NOT exist per `pathExists`, sorted by citing file then raw
 * path for a stable, readable failure message. Pure given a pure `pathExists`; the real guard supplies
 * one backed by `existsSync`, so THIS function never touches disk itself.
 */
export function findDanglingReferenceCitations(
  citations: readonly ReferenceCitation[],
  pathExists: (resolvedPath: string) => boolean,
): readonly ReferenceCitation[] {
  return citations
    .filter((citation) => !pathExists(citation.resolvedPath))
    .sort((a, b) =>
      a.citingFile === b.citingFile
        ? a.rawPath.localeCompare(b.rawPath)
        : a.citingFile.localeCompare(b.citingFile),
    );
}
