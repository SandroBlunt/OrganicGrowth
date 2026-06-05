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

describe("specPathFor", () => {
  it("derives ideas/<run>/idea-NN.spec.json beside the Brief", () => {
    const path = specPathFor("idea-2026-W22-01", "2026-W22", "ideas");
    assert.equal(path, join("ideas", "2026-W22", "idea-2026-W22-01.spec.json"));
  });
});

describe("saveSpec", () => {
  it("writes a Spec to ideas/<run>/idea-NN.spec.json as valid JSON", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "2026-W22"), { recursive: true });
      const path = specPathFor("idea-2026-W22-01", "2026-W22", dir);
      await saveSpec(validSpec(), path);

      assert.equal(await exists(path), true);
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      assert.equal(validate(parsed).ok, true);
    });
  });

  it("creates the run directory if it does not exist", async () => {
    await withTempDir(async (dir) => {
      const path = specPathFor("idea-2026-W22-05", "2026-W22", dir);
      // No mkdir first — saveSpec must create the run dir.
      await saveSpec(validSpec(), path);
      assert.equal(await exists(path), true);
    });
  });
});
