/**
 * Pure catalogue-entry manifest-completeness scanner (issue #212's "an automated check fails when a
 * catalogue entry has an incomplete manifest" acceptance criterion — the manifest half; the dangling-
 * reference-link half already shipped in #252's `reference-citation-scan.ts`).
 *
 * A catalogue entry's manifest is the union of its `SKILL.md` YAML frontmatter (`name`, `description` —
 * the entry's purpose) and its `metadata.yaml` (everything else) — see `docs/catalogue-manifest-
 * format.md` for the full field-by-field definition and the reasoning behind each. This module takes
 * already-read file CONTENT strings (never touches disk itself, mirroring `reference-citation-scan.ts`'s
 * own pure/impure split) and returns every missing, empty, or mismatched required field as a
 * `ManifestDefect` — an empty result means the manifest is complete.
 *
 * `checkManifestCompleteness` never throws on malformed input (a `SKILL.md` with no frontmatter, a
 * `metadata.yaml` that fails to parse) — it reports that failure as a defect and keeps checking whatever
 * else it safely can, so one bad file never crashes the whole guard run.
 *
 * **Issue #261: declared paths are checked for EXISTENCE, not just internal consistency.** Before this
 * change, `evals[].path` was only cross-checked against this same entry's own declared `scripts[].path`
 * set — a script that was renamed or deleted, with its eval still pointing at the same dead name, stayed
 * invisible: the two were consistent WITH EACH OTHER, and consistency was all that was measured. Now
 * `ManifestCheckOptions.pathExists`, an OPTIONAL predicate, is consulted for every declared
 * `scripts[].path`, `evals[].path`, `references[].path`, and `shared_references.path` (the three
 * additional path-shaped fields this module decided also deserve the same treatment — see
 * `docs/catalogue-manifest-format.md`'s "Path-shaped fields" section for the full field-by-field
 * decision, including which fields were deliberately left uncovered and why, and why
 * `shared_references.path` is checked directly here even though a sibling guard — the dangling-
 * reference-citation guard, same file — ALSO covers it for the common case: that sibling guard's
 * coverage turned out to depend on the literal `references/` folder-name segment surviving the
 * corruption, confirmed live, not assumed). This module still never touches disk itself: the predicate
 * is supplied by the caller (the real guard in `reference-citation-guard.docs-test.ts` backs it with
 * `existsSync`), so this module stays provable with in-memory fixtures alone, exactly like
 * `reference-citation-scan.ts`'s own `findDanglingReferenceCitations(citations, pathExists)`. The
 * EXISTING evals-cites-a-declared-script
 * consistency check is kept, unweakened, and runs independently of the new existence check — both are
 * needed, per the issue's own instruction, because they catch different errors (a well-formed but
 * unrelated path vs. a well-formed, related, but dead one).
 */

import { parse as parseYaml } from "yaml";

/** One catalogue entry's two source files, already read — content only, no paths resolved. */
export interface CatalogueEntrySource {
  readonly skillName: string;
  readonly skillMdContent: string;
  readonly metadataYamlContent: string;
}

/** One missing/invalid manifest field, naming which entry and which field so a failure message is
 *  immediately actionable. */
export interface ManifestDefect {
  readonly skillName: string;
  readonly field: string;
  readonly reason: string;
}

/** What "complete" requires, parameterized so the pure check is provable against fixtures independent
 *  of what the real repository's `LICENSE` file happens to say today. */
export interface ManifestCheckOptions {
  readonly expectedOwner: string;
  readonly expectedLicence: string;
  readonly minimumPurposeLength: number;
  /**
   * Optional path-existence predicate (issue #261). When supplied, every declared `scripts[].path`,
   * `evals[].path`, `references[].path`, and `shared_references.path` is ALSO checked against it, in
   * addition to the existing evals-cites-a-declared-script consistency check (kept, unweakened). Called as
   * `pathExists(skillName, declaredPath)` — `declaredPath` exactly as written in `metadata.yaml`,
   * relative to that catalogue entry's own directory; resolving it against a real directory and
   * consulting the filesystem is entirely the caller's job, since this module never touches disk itself
   * (mirrors `reference-citation-scan.ts`'s own pure/impure split). Left `undefined` by any caller that
   * only cares about the manifest's shape, not the real filesystem (every existing fixture-only test in
   * `manifest-completeness-scan.test.ts` before issue #261 leaves this unset, and stays green
   * unchanged); the real guard (`reference-citation-guard.docs-test.ts`) always supplies one, backed by
   * `existsSync`.
   */
  readonly pathExists?: (skillName: string, declaredPath: string) => boolean;
}

const ALLOWED_INSTALL_STRATEGIES = new Set(["copy-alongside", "vendored", "refuse-without"]);

/** The only `tools[].kind` value any real entry uses today (a `python3` runtime interpreter). A closed
 *  enum, not merely "must be a non-empty string" — an unrecognised kind is exactly the kind of
 *  well-typed-but-wrong value this module exists to catch (issue #212 Round 2, Defect 1's sibling
 *  sweep). Widen this set, with a reason, the day a real entry legitimately needs a second kind. */
const ALLOWED_TOOL_KINDS = new Set(["runtime-interpreter"]);

/** Extracts and parses a `SKILL.md`'s leading `---\n...\n---` YAML frontmatter block. Returns
 *  `undefined` when no frontmatter block is found or it fails to parse as an object — never throws. */
export function parseSkillFrontmatter(skillMdContent: string): Record<string, unknown> | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMdContent);
  if (match === null) return undefined;
  try {
    const parsed: unknown = parseYaml(match[1]!);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Extracts a licence type (first token of the LICENSE file's first line, e.g. "MIT" from
 *  "MIT License") and copyright holder (from a "Copyright (c) YYYY <holder>" line) from an already-read
 *  `LICENSE` file's content. Returns `undefined` when either cannot be found — never throws. */
export function parseLicenceFile(licenceContent: string): { spdxId: string; holder: string } | undefined {
  const firstLine = licenceContent.split(/\r?\n/).find((line) => line.trim().length > 0);
  const spdxId = firstLine?.trim().split(/\s+/)[0];
  const holderMatch = /Copyright \(c\) \d{4}\s+(.+)/.exec(licenceContent);
  const holder = holderMatch?.[1]?.trim();
  if (spdxId === undefined || holder === undefined || holder.length === 0) return undefined;
  return { spdxId, holder };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a dot-separated path (e.g. "target_model.vendor") out of an already-parsed object tree. */
function getIn(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj;
  for (const segment of path.split(".")) {
    if (!isPlainObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Every missing/invalid required manifest field for one catalogue entry, per `docs/catalogue-manifest-
 * format.md`'s field list. Pure: given the same inputs, always returns the same result.
 */
export function checkManifestCompleteness(
  source: CatalogueEntrySource,
  options: ManifestCheckOptions,
): readonly ManifestDefect[] {
  const defects: ManifestDefect[] = [];
  const fail = (field: string, reason: string): void => {
    defects.push({ skillName: source.skillName, field, reason });
  };

  const frontmatter = parseSkillFrontmatter(source.skillMdContent);
  if (frontmatter === undefined) {
    fail("SKILL.md#frontmatter", "SKILL.md has no parsable YAML frontmatter block");
  }

  let metadata: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = parseYaml(source.metadataYamlContent);
    if (isPlainObject(parsed)) metadata = parsed;
  } catch {
    // handled below via the undefined check
  }
  if (metadata === undefined) {
    fail("metadata.yaml", "metadata.yaml has no parsable YAML content");
    return defects; // nothing further can be safely checked
  }

  const requireNonEmptyString = (field: string, value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim().length > 0) return value;
    fail(field, `expected a non-empty string, found ${JSON.stringify(value)}`);
    return undefined;
  };

  const requireArray = (field: string, value: unknown, minLength: number): readonly unknown[] | undefined => {
    if (!Array.isArray(value)) {
      fail(field, `expected an array, found ${JSON.stringify(value)}`);
      return undefined;
    }
    if (value.length < minLength) {
      fail(field, `expected at least ${minLength} entr${minLength === 1 ? "y" : "ies"}, found ${value.length}`);
      return undefined;
    }
    return value;
  };

  // name (+ SKILL.md/metadata.yaml name consistency)
  const metaName = requireNonEmptyString("name", metadata["name"]);
  if (frontmatter !== undefined) {
    const frontmatterName = requireNonEmptyString("SKILL.md#name", frontmatter["name"]);
    if (metaName !== undefined && frontmatterName !== undefined && metaName !== frontmatterName) {
      fail("name", `SKILL.md frontmatter name (${frontmatterName}) does not match metadata.yaml name (${metaName})`);
    }
  }

  // version
  const version = requireNonEmptyString("version", metadata["version"]);
  if (version !== undefined && !/^\d+\.\d+\.\d+/.test(version)) {
    fail("version", `expected a semver string (X.Y.Z), found ${JSON.stringify(version)}`);
  }

  // licence
  const licence = requireNonEmptyString("licence", metadata["licence"]);
  if (licence !== undefined && licence !== options.expectedLicence) {
    fail("licence", `expected "${options.expectedLicence}" (from LICENSE), found "${licence}"`);
  }

  // owner
  const owner = requireNonEmptyString("owner", metadata["owner"]);
  if (owner !== undefined && owner !== options.expectedOwner) {
    fail("owner", `expected "${options.expectedOwner}" (from LICENSE), found "${owner}"`);
  }

  // purpose (SKILL.md frontmatter description)
  if (frontmatter !== undefined) {
    const description = frontmatter["description"];
    if (typeof description !== "string" || description.trim().length === 0) {
      fail("purpose", "SKILL.md frontmatter has no non-empty description");
    } else if (description.trim().length < options.minimumPurposeLength) {
      fail(
        "purpose",
        `SKILL.md frontmatter description is ${description.trim().length} characters, ` +
          `below the required minimum of ${options.minimumPurposeLength}`,
      );
    }
  }

  // entities.reads / entities.writes
  requireArray("entities.reads", getIn(metadata, "entities.reads"), 1);
  if (!Array.isArray(getIn(metadata, "entities.writes"))) {
    fail("entities.writes", `expected an array (may be empty), found ${JSON.stringify(getIn(metadata, "entities.writes"))}`);
  }

  // tools
  const tools = metadata["tools"];
  if (!Array.isArray(tools)) {
    fail("tools", `expected an array (may be empty), found ${JSON.stringify(tools)}`);
  } else {
    tools.forEach((tool, index) => {
      if (!isPlainObject(tool) || typeof tool["name"] !== "string" || tool["name"].trim().length === 0) {
        fail(`tools[${index}].name`, `expected a non-empty string, found ${JSON.stringify(isPlainObject(tool) ? tool["name"] : tool)}`);
      }
      if (!isPlainObject(tool) || typeof tool["kind"] !== "string" || tool["kind"].trim().length === 0) {
        fail(`tools[${index}].kind`, `expected a non-empty string, found ${JSON.stringify(isPlainObject(tool) ? tool["kind"] : tool)}`);
      } else if (!ALLOWED_TOOL_KINDS.has(tool["kind"])) {
        fail(
          `tools[${index}].kind`,
          `expected one of ${JSON.stringify([...ALLOWED_TOOL_KINDS])}, found ${JSON.stringify(tool["kind"])}`,
        );
      }
    });
  }

  // target_model.*
  requireNonEmptyString("target_model.vendor", getIn(metadata, "target_model.vendor"));
  const modelId = getIn(metadata, "target_model.model_id");
  const modelName = getIn(metadata, "target_model.model");
  const hasModelId = typeof modelId === "string" && modelId.trim().length > 0;
  const hasModelName = typeof modelName === "string" && modelName.trim().length > 0;
  if (!hasModelId && !hasModelName) {
    fail("target_model.model_id", "expected a non-empty target_model.model_id or target_model.model");
  }
  requireArray("target_model.modalities", getIn(metadata, "target_model.modalities"), 1);
  if (!Array.isArray(getIn(metadata, "target_model.fallbacks"))) {
    fail(
      "target_model.fallbacks",
      `expected an array (may be empty), found ${JSON.stringify(getIn(metadata, "target_model.fallbacks"))}`,
    );
  }

  // config: inputs / outputs
  requireArray("inputs", metadata["inputs"], 1);
  requireArray("outputs", metadata["outputs"], 1);

  // A small local helper: given a field name + declared path, checks it against options.pathExists (if
  // supplied) and records a defect naming that exact field when the path does not resolve — issue #261.
  const checkPathExists = (field: string, path: string): void => {
    if (options.pathExists !== undefined && !options.pathExists(source.skillName, path)) {
      fail(
        field,
        `declared but no file exists at ${JSON.stringify(path)} (resolved relative to this entry's own directory)`,
      );
    }
  };

  // scripts — each declared entry's path must be a non-empty string (previously silently filtered out
  // of the evals cross-check set below rather than flagged) AND, when a path-existence predicate is
  // supplied, must resolve to a real file on disk (issue #261: a renamed/deleted script with no
  // existence check stayed invisible as long as nothing else cited it).
  const scriptsField = metadata["scripts"];
  const declaredScriptPaths = new Set<string>();
  if (Array.isArray(scriptsField)) {
    scriptsField.forEach((entry, index) => {
      const path = isPlainObject(entry) ? entry["path"] : undefined;
      if (typeof path !== "string" || path.trim().length === 0) {
        fail(`scripts[${index}].path`, `expected a non-empty string, found ${JSON.stringify(path)}`);
        return;
      }
      declaredScriptPaths.add(path);
      checkPathExists(`scripts[${index}].path`, path);
    });
  }

  // evals — each entry's path must be more than well-formed: it must actually name one of this entry's
  // own declared scripts:, per docs/catalogue-manifest-format.md ("evals ... points at an existing
  // scripts: test entry"). A path that is merely a non-empty string but names no real script would
  // otherwise pass silently (issue #212 Round 2, Defect 1's sibling sweep). This consistency check is
  // kept, unweakened, by issue #261 — it catches a DIFFERENT error than existence (a well-formed path
  // that simply names the wrong thing) — and now runs ALONGSIDE an independent existence check: a
  // script renamed/deleted with its eval still citing the old, dead name is consistent with itself but
  // no longer resolves, which is exactly the shape #261 was filed to close.
  const evals = requireArray("evals", metadata["evals"], 1);
  if (evals !== undefined) {
    evals.forEach((entry, index) => {
      const path = isPlainObject(entry) ? entry["path"] : undefined;
      if (typeof path !== "string" || path.trim().length === 0) {
        fail(`evals[${index}].path`, `expected a non-empty string, found ${JSON.stringify(path)}`);
        return;
      }
      if (!declaredScriptPaths.has(path)) {
        fail(
          `evals[${index}].path`,
          `expected a path present in this entry's own scripts: list, found ${JSON.stringify(path)} ` +
            `(scripts: ${JSON.stringify([...declaredScriptPaths])})`,
        );
      }
      checkPathExists(`evals[${index}].path`, path);
    });
  }

  // references — this entry's own reference documents (translation-notes.md, official-guidelines.md,
  // README.md, ...). Not itself a required field (unchanged scope from #212 — see
  // docs/catalogue-manifest-format.md), but every declared entry's path is exactly as path-shaped as
  // scripts:/evals:, and issue #261 decided it deserves the same existence treatment: no OTHER guard
  // watches it. The dangling-reference-citation guard (the sibling guard in the SAME file) only matches
  // a `(../)+references/...`-shaped CLIMBING citation — a same-directory `references/<name>.md` value
  // never satisfies that pattern, so without this, a renamed/deleted own-reference document would be
  // invisible to every guard in this repository (see docs/catalogue-manifest-format.md's "Path-shaped
  // fields" section for the full decision record of what was and was not extended this way).
  const referencesField = metadata["references"];
  if (Array.isArray(referencesField)) {
    referencesField.forEach((entry, index) => {
      const path = isPlainObject(entry) ? entry["path"] : undefined;
      if (typeof path !== "string" || path.trim().length === 0) {
        fail(`references[${index}].path`, `expected a non-empty string, found ${JSON.stringify(path)}`);
        return;
      }
      checkPathExists(`references[${index}].path`, path);
    });
  }

  // shared_references.*
  // Existence is checked directly here too (issue #261), not left to the sibling dangling-reference-
  // citation guard alone: that guard's regex only recognises a citation whose literal `references/`
  // folder-name segment survives (e.g. it catches a wrong CLIMB depth or an inserted bogus segment) —
  // it cannot see a `shared_references.path` value whose `references` segment itself was mistyped or
  // renamed to something else entirely, because the value would then no longer match the citation shape
  // it scans for at all. Confirmed live (see this change's handoff.md): a corrupted-depth path was
  // caught by the sibling guard as expected, but a `references`-segment-renamed path was not — exactly
  // the seam-between-two-guards gap the issue asked to confirm, not assume. Checking it directly here
  // closes that seam for good, on top of (not instead of) the sibling guard's own broader citation walk.
  const sharedReferencesPath = requireNonEmptyString("shared_references.path", getIn(metadata, "shared_references.path"));
  if (sharedReferencesPath !== undefined) {
    checkPathExists("shared_references.path", sharedReferencesPath);
  }
  // Every entry with a shared_references block genuinely depends on the shared references (its own
  // entities.reads always cites them) — required is not merely "a boolean," it must be true. A
  // present-but-false value is a well-typed lie about a real structural dependency (issue #212 Round 2,
  // Defect 1): it would leave install-time (vendored/refuse-without) callers believing the dependency is
  // optional when every real entry's citations say otherwise.
  const required = getIn(metadata, "shared_references.required");
  if (required !== true) {
    fail(
      "shared_references.required",
      `expected true (this entry's own entities.reads cites the shared references), found ${JSON.stringify(required)}`,
    );
  }
  const install = getIn(metadata, "shared_references.install");
  if (typeof install !== "string" || install.trim().length === 0) {
    fail("shared_references.install", `expected a non-empty string, found ${JSON.stringify(install)}`);
  } else if (!ALLOWED_INSTALL_STRATEGIES.has(install)) {
    fail(
      "shared_references.install",
      `expected one of ${JSON.stringify([...ALLOWED_INSTALL_STRATEGIES])}, found ${JSON.stringify(install)}`,
    );
  }

  return defects;
}

/** Every defect across a corpus of catalogue entries, sorted by skill name then field, for a stable,
 *  readable failure message. */
export function findIncompleteManifests(
  sources: readonly CatalogueEntrySource[],
  options: ManifestCheckOptions,
): readonly ManifestDefect[] {
  return sources
    .flatMap((source) => checkManifestCompleteness(source, options))
    .sort((a, b) => (a.skillName === b.skillName ? a.field.localeCompare(b.field) : a.skillName.localeCompare(b.skillName)));
}
