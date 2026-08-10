import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SPACE_LESS_TEST_RECIPE,
  validSpaceLessTestSpec,
  validateSpaceLessTestSpec,
  scanSpaceLessTestSpecForBannedWords,
} from "./space-less-recipe.ts";
import { PHASE_ORDER, declaresAllPhasesInOrder } from "../phase-contract.ts";
import { isWiredRecipe, getRecipe } from "../registry.ts";

describe("SPACE_LESS_TEST_RECIPE — a Space-less Recipe can be registered and passes the import-time guard (issue #170 AC1)", () => {
  it("is registrable in a slug-keyed Map, mirroring REGISTRY's own construction", () => {
    const map = new Map([[SPACE_LESS_TEST_RECIPE.slug, SPACE_LESS_TEST_RECIPE]]);
    assert.equal(map.get("test-space-less-recipe"), SPACE_LESS_TEST_RECIPE);
  });

  it("declares all six phases, in PHASE_ORDER's exact order — the SAME shape guard every wired Recipe runs", () => {
    assert.equal(declaresAllPhasesInOrder(SPACE_LESS_TEST_RECIPE.phases), true);
    assert.deepEqual(
      SPACE_LESS_TEST_RECIPE.phases.map((p) => p.phase),
      [...PHASE_ORDER],
    );
  });

  it("is NEVER added to the real REGISTRY — isWiredRecipe/getRecipe never see it (Review/queue untouched)", () => {
    assert.equal(isWiredRecipe("test-space-less-recipe"), false);
    assert.equal(getRecipe("test-space-less-recipe"), null);
  });
});

describe("SPACE_LESS_TEST_RECIPE declares NO space and NO canvasInputs — everything else stays required (ADR-0021)", () => {
  it("has no Space target and no canvas inputs", () => {
    assert.equal(SPACE_LESS_TEST_RECIPE.space, undefined);
    assert.equal(SPACE_LESS_TEST_RECIPE.canvasInputs, undefined);
  });

  it("still declares zero gates, a spec shape, a copy shape, and a copySkill", () => {
    assert.deepEqual(SPACE_LESS_TEST_RECIPE.gates, []);
    assert.equal(typeof SPACE_LESS_TEST_RECIPE.specShape.validate, "function");
    assert.equal(typeof SPACE_LESS_TEST_RECIPE.specShape.scanBannedWords, "function");
    assert.ok(SPACE_LESS_TEST_RECIPE.copyShape.maxChars > 0);
    assert.equal(SPACE_LESS_TEST_RECIPE.copySkill, "write-social-copy");
  });

  it("its bind-media, gate, and render Phase Contracts declare EMPTY checklists — the News Carousel zero-gate pattern", () => {
    const byPhase = new Map(SPACE_LESS_TEST_RECIPE.phases.map((p) => [p.phase, p]));
    assert.deepEqual(byPhase.get("bind-media")!.checklist, []);
    assert.deepEqual(byPhase.get("gate")!.checklist, []);
    assert.deepEqual(byPhase.get("render")!.checklist, []);
  });

  it("its author and copy Phase Contracts still carry real, referenced mechanical checks", () => {
    const byPhase = new Map(SPACE_LESS_TEST_RECIPE.phases.map((p) => [p.phase, p]));
    assert.equal(byPhase.get("author")!.checklist.length, 2);
    assert.equal(byPhase.get("copy")!.checklist.length, 1);
    for (const item of [...byPhase.get("author")!.checklist, ...byPhase.get("copy")!.checklist]) {
      assert.equal(item.kind, "mechanical");
      if (item.kind === "mechanical") assert.ok(item.reference.length > 0);
    }
  });
});

describe("validateSpaceLessTestSpec — the fixture's minimal Spec shape", () => {
  it("accepts a well-formed Spec", () => {
    assert.equal(validateSpaceLessTestSpec(validSpaceLessTestSpec()).ok, true);
  });

  it("rejects a non-object", () => {
    const result = validateSpaceLessTestSpec("not an object");
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]!.code, "not_an_object");
  });

  it("rejects a blank script", () => {
    const spec = { ...validSpaceLessTestSpec(), script: "   " };
    const result = validateSpaceLessTestSpec(spec);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "script_missing"));
  });

  it("rejects an empty shot_list", () => {
    const spec = { ...validSpaceLessTestSpec(), shot_list: [] };
    const result = validateSpaceLessTestSpec(spec);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "shot_list_missing"));
  });

  it("rejects a shot_list beat missing a description", () => {
    const spec = { ...validSpaceLessTestSpec(), shot_list: [{ beat: "hook", description: "" }] };
    const result = validateSpaceLessTestSpec(spec);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "shot_list_beat_shape"));
  });
});

describe("scanSpaceLessTestSpecForBannedWords — reuses the shared word-boundary matching core", () => {
  it("passes a clean Spec", () => {
    assert.equal(scanSpaceLessTestSpecForBannedWords(validSpaceLessTestSpec(), ["miracle"]).ok, true);
  });

  it("passes when the Brand defines no banned words at all", () => {
    assert.equal(scanSpaceLessTestSpecForBannedWords(validSpaceLessTestSpec(), []).ok, true);
  });

  it("catches a banned word in the script", () => {
    const spec = { ...validSpaceLessTestSpec(), script: "This is a miracle cure." };
    const result = scanSpaceLessTestSpecForBannedWords(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.field, "script");
  });

  it("catches a banned word in a shot_list beat's description", () => {
    const spec = {
      ...validSpaceLessTestSpec(),
      shot_list: [{ beat: "hook", description: "a guaranteed miracle result" }],
    };
    const result = scanSpaceLessTestSpecForBannedWords(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.field, "shot_list[0].description");
  });

  it("is whole-word and case-insensitive, matching the shared core", () => {
    const spec = { ...validSpaceLessTestSpec(), script: "Our platform is SECURE end to end." };
    assert.equal(scanSpaceLessTestSpecForBannedWords(spec, ["cure"]).ok, true);
  });
});
