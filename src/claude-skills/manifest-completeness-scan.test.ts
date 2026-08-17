/**
 * Tests for the pure manifest-completeness scanner (`src/claude-skills/manifest-completeness-scan.ts`,
 * issue #212).
 *
 * Pure, in-memory fixtures only — no disk I/O in this file at all (the disk-walking half lives in
 * `reference-citation-guard.docs-test.ts`'s manifest-completeness `describe` block).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkManifestCompleteness,
  findIncompleteManifests,
  parseLicenceFile,
  parseSkillFrontmatter,
  type CatalogueEntrySource,
  type ManifestCheckOptions,
} from "./manifest-completeness-scan.ts";

const OPTIONS: ManifestCheckOptions = {
  expectedOwner: "Sandro Franco",
  expectedLicence: "MIT",
  minimumPurposeLength: 100,
};

const COMPLETE_SKILL_MD = `---
name: gen-prompting-fixture-model
description: >
  Translate a user's image-generation intent into a production-ready prompt for the Fixture Model.
  Covers text-to-image and image-to-image edit. Invoke this skill whenever the user asks for a new
  image on the Fixture stack.
user-invocable: true
---

# Prompting for Fixture Model
`;

const COMPLETE_METADATA_YAML = `
name: gen-prompting-fixture-model
version: 0.1.0
licence: MIT
owner: Sandro Franco
domain_path: gen-prompting/code/image/fixture-model
variant: code
target_model:
  vendor: fixture-vendor
  model_id: fixture-model-1
  modalities: [text-to-image, image-to-image]
  fallbacks: []
entities:
  reads:
    - references/*.md
    - ../../references/*.md
  writes: []
tools:
  - name: python3
    kind: runtime-interpreter
    required_for: [scripts/build-prompt.py, scripts/test_build_prompt.py]
inputs:
  - name: subject
    type: string
    required: true
outputs:
  - name: prompt
    type: string
scripts:
  - path: scripts/build-prompt.py
    purpose: Assemble and validate a Fixture Model prompt.
references:
  - path: references/README.md
    purpose: Pointer to shared references at ../../references/.
evals:
  - path: scripts/test_build_prompt.py
    method: unit-tests
    purpose: Proves build-prompt.py assembles a valid prompt.
source_tracking:
  official_guidelines_url: https://example.com/fixture-model
  fetched_at: 2026-01-01
shared_references:
  mode: relative-link
  path: ../../references/
  required: true
  install: copy-alongside
`;

function completeSource(skillName = "fixture-model"): CatalogueEntrySource {
  return { skillName, skillMdContent: COMPLETE_SKILL_MD, metadataYamlContent: COMPLETE_METADATA_YAML };
}

describe("parseSkillFrontmatter", () => {
  it("parses a real SKILL.md-shaped frontmatter block", () => {
    const fm = parseSkillFrontmatter(COMPLETE_SKILL_MD);
    assert.equal(fm?.["name"], "gen-prompting-fixture-model");
    assert.ok(typeof fm?.["description"] === "string" && fm["description"].length > 0);
  });

  it("returns undefined when there is no frontmatter block", () => {
    assert.equal(parseSkillFrontmatter("# Just a heading\n\nNo frontmatter here.\n"), undefined);
  });

  it("returns undefined when the frontmatter block fails to parse as an object (never throws)", () => {
    assert.equal(parseSkillFrontmatter("---\n- just\n- a\n- list\n---\n"), undefined);
  });
});

describe("parseLicenceFile", () => {
  it("extracts the SPDX id and copyright holder from a real MIT LICENSE shape", () => {
    const content = "MIT License\n\nCopyright (c) 2026 Sandro Franco\n\nPermission is hereby granted...\n";
    assert.deepEqual(parseLicenceFile(content), { spdxId: "MIT", holder: "Sandro Franco" });
  });

  it("returns undefined when no copyright line is present", () => {
    assert.equal(parseLicenceFile("MIT License\n\nNo copyright line here.\n"), undefined);
  });

  it("returns undefined for empty content", () => {
    assert.equal(parseLicenceFile(""), undefined);
  });
});

describe("checkManifestCompleteness — the complete fixture passes clean", () => {
  it("returns [] for a fully complete manifest", () => {
    assert.deepEqual(checkManifestCompleteness(completeSource(), OPTIONS), []);
  });
});

describe("checkManifestCompleteness — one missing/invalid field at a time", () => {
  function withMetadata(patchedYaml: string): CatalogueEntrySource {
    return { skillName: "fixture-model", skillMdContent: COMPLETE_SKILL_MD, metadataYamlContent: patchedYaml };
  }

  it("catches a missing name", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("name: gen-prompting-fixture-model\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "name"), JSON.stringify(defects));
  });

  it("catches a non-semver version", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("version: 0.1.0", "version: not-a-version");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "version"), JSON.stringify(defects));
  });

  it("catches a missing licence", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("licence: MIT\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "licence"), JSON.stringify(defects));
  });

  it("catches a licence that does not match the expected LICENSE value", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("licence: MIT", "licence: Apache-2.0");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "licence"), JSON.stringify(defects));
  });

  it("catches a missing owner", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("owner: Sandro Franco\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "owner"), JSON.stringify(defects));
  });

  it("catches an owner that does not match the expected LICENSE holder", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("owner: Sandro Franco", "owner: Someone Else");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "owner"), JSON.stringify(defects));
  });

  it("catches a too-short purpose (SKILL.md description)", () => {
    const shortSkillMd = COMPLETE_SKILL_MD.replace(
      /description: >[\s\S]*?user-invocable: true/,
      'description: "Too short."\nuser-invocable: true',
    );
    const source: CatalogueEntrySource = {
      skillName: "fixture-model",
      skillMdContent: shortSkillMd,
      metadataYamlContent: COMPLETE_METADATA_YAML,
    };
    const defects = checkManifestCompleteness(source, OPTIONS);
    assert.ok(defects.some((d) => d.field === "purpose"), JSON.stringify(defects));
  });

  it("catches a SKILL.md/metadata.yaml name mismatch", () => {
    const mismatchedSkillMd = COMPLETE_SKILL_MD.replace(
      "name: gen-prompting-fixture-model",
      "name: gen-prompting-different-name",
    );
    const source: CatalogueEntrySource = {
      skillName: "fixture-model",
      skillMdContent: mismatchedSkillMd,
      metadataYamlContent: COMPLETE_METADATA_YAML,
    };
    const defects = checkManifestCompleteness(source, OPTIONS);
    assert.ok(defects.some((d) => d.field === "name"), JSON.stringify(defects));
  });

  it("catches an empty entities.reads", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "entities:\n  reads:\n    - references/*.md\n    - ../../references/*.md\n  writes: []",
      "entities:\n  reads: []\n  writes: []",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "entities.reads"), JSON.stringify(defects));
  });

  it("catches a missing entities.writes", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("  writes: []\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "entities.writes"), JSON.stringify(defects));
  });

  it("catches a tools entry missing its kind", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "  - name: python3\n    kind: runtime-interpreter\n    required_for: [scripts/build-prompt.py, scripts/test_build_prompt.py]",
      "  - name: python3\n    required_for: [scripts/build-prompt.py, scripts/test_build_prompt.py]",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "tools[0].kind"), JSON.stringify(defects));
  });

  it("catches a missing target_model.vendor", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("  vendor: fixture-vendor\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "target_model.vendor"), JSON.stringify(defects));
  });

  it("catches a target_model with neither model_id nor model", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("  model_id: fixture-model-1\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "target_model.model_id"), JSON.stringify(defects));
  });

  it("accepts target_model.model as an alternative to target_model.model_id (the grok-imagine shape)", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("model_id: fixture-model-1", "model: fixture-model-1");
    assert.deepEqual(checkManifestCompleteness(withMetadata(yaml), OPTIONS), []);
  });

  it("catches an empty target_model.modalities", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "modalities: [text-to-image, image-to-image]",
      "modalities: []",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "target_model.modalities"), JSON.stringify(defects));
  });

  it("catches a missing target_model.fallbacks", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("  fallbacks: []\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "target_model.fallbacks"), JSON.stringify(defects));
  });

  it("catches an empty inputs list", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "inputs:\n  - name: subject\n    type: string\n    required: true",
      "inputs: []",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "inputs"), JSON.stringify(defects));
  });

  it("catches an empty outputs list", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "outputs:\n  - name: prompt\n    type: string",
      "outputs: []",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "outputs"), JSON.stringify(defects));
  });

  it("catches an empty evals list", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "evals:\n  - path: scripts/test_build_prompt.py\n    method: unit-tests\n    purpose: Proves build-prompt.py assembles a valid prompt.",
      "evals: []",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "evals"), JSON.stringify(defects));
  });

  it("catches a missing shared_references.path", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("  path: ../../references/\n  required: true", "  required: true");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "shared_references.path"), JSON.stringify(defects));
  });

  it("catches a missing shared_references.required", () => {
    const yaml = COMPLETE_METADATA_YAML.replace(
      "  path: ../../references/\n  required: true\n  install: copy-alongside",
      "  path: ../../references/\n  install: copy-alongside",
    );
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "shared_references.required"), JSON.stringify(defects));
  });

  it("catches a missing shared_references.install", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("  install: copy-alongside\n", "");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "shared_references.install"), JSON.stringify(defects));
  });

  it("catches an out-of-enum shared_references.install value", () => {
    const yaml = COMPLETE_METADATA_YAML.replace("install: copy-alongside", "install: teleport");
    const defects = checkManifestCompleteness(withMetadata(yaml), OPTIONS);
    assert.ok(defects.some((d) => d.field === "shared_references.install"), JSON.stringify(defects));
  });

  it("catches unparsable metadata.yaml content without throwing", () => {
    const defects = checkManifestCompleteness(withMetadata(":\n  - this is not: [valid yaml"), OPTIONS);
    assert.ok(defects.length > 0);
  });
});

describe("findIncompleteManifests", () => {
  it("returns [] across multiple complete entries", () => {
    const sources = [completeSource("a"), completeSource("b")];
    assert.deepEqual(findIncompleteManifests(sources, OPTIONS), []);
  });

  it("aggregates and sorts defects by skill name then field", () => {
    const broken = (skillName: string): CatalogueEntrySource => ({
      skillName,
      skillMdContent: COMPLETE_SKILL_MD,
      metadataYamlContent: COMPLETE_METADATA_YAML.replace("licence: MIT\n", ""),
    });
    const defects = findIncompleteManifests([broken("z-skill"), broken("a-skill")], OPTIONS);
    assert.deepEqual(
      defects.map((d) => d.skillName),
      ["a-skill", "z-skill"],
    );
  });
});
