import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSpec, specPathFor } from "./store.ts";
import { validate } from "./validate.ts";
import { validSpec } from "./fixtures/specs.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-spec-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const RECIPE = "character-explainer-with-cast";

describe("specPathFor", () => {
  it("derives the SHORT idea-NN.<recipe>.spec.json name from the full ledger id, beside the Brief", () => {
    const path = specPathFor("idea-2026-W22-01", "2026-W22", "root", RECIPE);
    // The ledger id is idea-<run>-NN; the Spec takes the Brief's short idea-NN name PLUS a Recipe segment.
    assert.equal(path, join("root", "2026-W22", `idea-01.${RECIPE}.spec.json`));
  });

  it("is idempotent when handed an already-short idea id", () => {
    const path = specPathFor("idea-07", "2026-W22", "root", RECIPE);
    assert.equal(path, join("root", "2026-W22", `idea-07.${RECIPE}.spec.json`));
  });

  it("segments by Recipe — two Recipes of the same Idea get DIFFERENT paths (issue #56, ADR-0011)", () => {
    const first = specPathFor("idea-2026-W22-01", "2026-W22", "root", RECIPE);
    const second = specPathFor("idea-2026-W22-01", "2026-W22", "root", "carousel");
    assert.notEqual(first, second, "two Recipes of one Idea must not collide on one Spec path");
  });

  it("matches the real mundotip tree convention (idea-NN.<recipe>.spec.json beside idea-NN.md)", async () => {
    // The real Brief on disk is data/brands/mundotip/ideas/2026-W22/idea-01.md.
    const ideasRoot = join("data", "brands", "mundotip", "ideas");
    const briefPath = join(ideasRoot, "2026-W22", "idea-01.md");
    assert.equal(await exists(briefPath), true);

    const specPath = specPathFor("idea-2026-W22-01", "2026-W22", ideasRoot, RECIPE);
    assert.equal(specPath, join(ideasRoot, "2026-W22", `idea-01.${RECIPE}.spec.json`));
  });
});

describe("saveSpec", () => {
  it("writes a Spec to ideas/<run>/idea-NN.<recipe>.spec.json as valid JSON", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "2026-W22"), { recursive: true });
      const path = specPathFor("idea-2026-W22-01", "2026-W22", dir, RECIPE);
      await saveSpec(validSpec(), path);

      assert.equal(await exists(path), true);
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      assert.equal(validate(parsed).ok, true);
    });
  });

  it("creates the run directory if it does not exist", async () => {
    await withTempDir(async (dir) => {
      const path = specPathFor("idea-2026-W22-05", "2026-W22", dir, RECIPE);
      // No mkdir first — saveSpec must create the run dir.
      await saveSpec(validSpec(), path);
      assert.equal(await exists(path), true);
    });
  });

  it("two Recipes of one Idea each save to their own file — the second does not overwrite the first", async () => {
    await withTempDir(async (dir) => {
      const firstPath = specPathFor("idea-2026-W22-01", "2026-W22", dir, RECIPE);
      const secondPath = specPathFor("idea-2026-W22-01", "2026-W22", dir, "carousel");
      await saveSpec(validSpec(), firstPath);
      await saveSpec(validSpec(), secondPath);
      assert.equal(await exists(firstPath), true);
      assert.equal(await exists(secondPath), true);
    });
  });
});
