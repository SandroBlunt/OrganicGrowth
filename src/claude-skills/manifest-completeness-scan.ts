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
}

const ALLOWED_INSTALL_STRATEGIES = new Set(["copy-alongside", "vendored", "refuse-without"]);

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

  // evals
  const evals = requireArray("evals", metadata["evals"], 1);
  if (evals !== undefined) {
    evals.forEach((entry, index) => {
      if (!isPlainObject(entry) || typeof entry["path"] !== "string" || entry["path"].trim().length === 0) {
        fail(`evals[${index}].path`, `expected a non-empty string, found ${JSON.stringify(isPlainObject(entry) ? entry["path"] : entry)}`);
      }
    });
  }

  // shared_references.*
  requireNonEmptyString("shared_references.path", getIn(metadata, "shared_references.path"));
  const required = getIn(metadata, "shared_references.required");
  if (typeof required !== "boolean") {
    fail("shared_references.required", `expected a boolean, found ${JSON.stringify(required)}`);
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
