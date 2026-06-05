import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeSpec } from "./compose.ts";
import { specPathFor } from "./store.ts";
import { validate } from "./validate.ts";
import type { Brief } from "./generate.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-compose-"));
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

function acceptedBrief(): Brief {
  return {
    id: "idea-2026-W22-01",
    run: "2026-W22",
    title: "El truco de los primeros 10 minutos al despertar",
    character_concepts: [
      "A cheerful anthropomorphic alarm clock",
      "A sleepy anthropomorphic coffee mug",
      "A bright anthropomorphic window curtain",
    ],
    beats: ["The groggy wake-up", "The first ten minutes", "The energized payoff"],
    post_copy: "Your first ten minutes decide your whole day ☀️☕",
  };
}

describe("composeSpec — happy path", () => {
  it("writes ideas/<run>/idea-NN.spec.json that passes validation", async () => {
    await withTempDir(async (dir) => {
      const result = await composeSpec(acceptedBrief(), {
        ideasRoot: dir,
        brandProfilePath: BANNED_PROFILE,
      });

      assert.equal(result.written, true);
      const path = specPathFor("idea-2026-W22-01", "2026-W22", dir);
      assert.equal(result.path, path);
      assert.equal(await exists(path), true);

      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      assert.equal(validate(parsed).ok, true);
    });
  });
});

describe("composeSpec — brand-safety gate", () => {
  it("REFUSES to write a Spec containing a banned word", async () => {
    await withTempDir(async (dir) => {
      const brief = acceptedBrief();
      // Smuggle a banned word ("miracle") into the Brief's copy.
      const dirty: Brief = { ...brief, post_copy: "This miracle trick fixes mornings ☀️☕" };

      const result = await composeSpec(dirty, {
        ideasRoot: dir,
        brandProfilePath: BANNED_PROFILE,
      });

      assert.equal(result.written, false);
      assert.equal(result.reason, "brand-safety");
      assert.ok(result.bannedHits && result.bannedHits.some((h) => h.word === "miracle"));

      // The banned word must NEVER survive into a saved Spec: no file written.
      const path = specPathFor(brief.id, brief.run, dir);
      assert.equal(await exists(path), false);
    });
  });
});

describe("composeSpec — validation gate", () => {
  it("REFUSES to write a Spec that fails validation (injected bad generator)", async () => {
    await withTempDir(async (dir) => {
      const brief = acceptedBrief();
      // Inject a generator that yields a contract-violating Spec (2 clips).
      const result = await composeSpec(brief, {
        ideasRoot: dir,
        brandProfilePath: BANNED_PROFILE,
        generator: () => ({
          character_concepts: ["a", "b", "c"],
          clips: [
            { id: "c1", clip_id: 1, concept_title: "x", image_prompt: "p Aspect Ratio 9:16.", video_prompt: "v" },
            { id: "c2", clip_id: 2, concept_title: "y", image_prompt: "p Aspect Ratio 9:16.", video_prompt: "v" },
          ],
          post_copy: "two clips only ☀️☕",
          thumbnails: ["t1", "t2", "t3"],
        }),
      });

      assert.equal(result.written, false);
      assert.equal(result.reason, "validation");
      assert.ok(result.errors && result.errors.some((e) => e.code === "clips_count"));

      const path = specPathFor(brief.id, brief.run, dir);
      assert.equal(await exists(path), false);
    });
  });
});

describe("composeSpec — empty banned list (real profile shape)", () => {
  it("writes the Spec when the brand profile has no banned words", async () => {
    await withTempDir(async (dir) => {
      const result = await composeSpec(acceptedBrief(), {
        ideasRoot: dir,
        brandProfilePath: join(HERE, "fixtures", "does-not-exist.yaml"), // missing -> [] banned words
      });
      assert.equal(result.written, true);
    });
  });
});
