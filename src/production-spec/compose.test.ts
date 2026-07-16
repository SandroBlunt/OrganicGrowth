import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeSpec } from "./compose.ts";
import { specPathFor } from "./store.ts";
import { validate } from "./validate.ts";
import { validateNewsCarouselSpec } from "./news-carousel-validate.ts";
import { validNewsCarouselSpec } from "./fixtures/news-carousel-specs.ts";
import type { Brief } from "./generate.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");

const RECIPE = "character-explainer-with-cast";

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
  };
}

describe("composeSpec — happy path", () => {
  it("writes ideas/<run>/idea-NN.spec.json that passes validation", async () => {
    await withTempDir(async (dir) => {
      const result = await composeSpec(acceptedBrief(), {
        ideasRoot: dir,
        brandProfilePath: BANNED_PROFILE,
        recipe: RECIPE,
      });

      assert.equal(result.written, true);
      const path = specPathFor("idea-2026-W22-01", "2026-W22", dir, RECIPE);
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
      // Smuggle a banned word ("miracle") into the Brief's beats — it flows into a clip's concept_title.
      const dirty: Brief = { ...brief, beats: ["This miracle trick", ...brief.beats!.slice(1)] };

      const result = await composeSpec(dirty, {
        ideasRoot: dir,
        brandProfilePath: BANNED_PROFILE,
        recipe: RECIPE,
      });

      assert.equal(result.written, false);
      assert.equal(result.reason, "brand-safety");
      assert.ok(result.bannedHits && result.bannedHits.some((h) => h.word === "miracle"));

      // The banned word must NEVER survive into a saved Spec: no file written.
      const path = specPathFor(brief.id, brief.run, dir, RECIPE);
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
        recipe: RECIPE,
        generator: () => ({
          character_concepts: ["a", "b", "c"],
          clips: [
            { id: "c1", clip_id: 1, concept_title: "x", image_prompt: "p Aspect Ratio 9:16.", video_prompt: "v" },
            { id: "c2", clip_id: 2, concept_title: "y", image_prompt: "p Aspect Ratio 9:16.", video_prompt: "v" },
          ],
          thumbnails: ["t1", "t2", "t3"],
        }),
      });

      assert.equal(result.written, false);
      assert.equal(result.reason, "validation");
      assert.ok(result.errors && result.errors.some((e) => e.code === "clips_count"));

      const path = specPathFor(brief.id, brief.run, dir, RECIPE);
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
        recipe: RECIPE,
      });
      assert.equal(result.written, true);
    });
  });
});

// === composeSpec is Recipe-generic: a DIFFERENT Recipe's own generator + validator (issue #60) ========

describe("composeSpec — a second Recipe's own generator + validator (proves the gate is Recipe-generic)", () => {
  const CAROUSEL_RECIPE = "news-carousel";

  it("writes a News Carousel Spec (a totally different shape) when its OWN validator passes it", async () => {
    await withTempDir(async (dir) => {
      const result = await composeSpec(acceptedBrief(), {
        ideasRoot: dir,
        brandProfilePath: join(HERE, "fixtures", "does-not-exist.yaml"),
        recipe: CAROUSEL_RECIPE,
        generator: () => validNewsCarouselSpec(5),
        validator: validateNewsCarouselSpec,
      });

      assert.equal(result.written, true);
      const path = specPathFor("idea-2026-W22-01", "2026-W22", dir, CAROUSEL_RECIPE);
      assert.equal(result.path, path);
      assert.equal(await exists(path), true);

      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      assert.equal(validateNewsCarouselSpec(parsed).ok, true);
      // The WIRED validator would reject this shape — proving the injected validator, not the default,
      // is what actually gated this write.
      assert.equal(validate(parsed).ok, false);
    });
  });

  it("REFUSES to write when the injected validator rejects the generated Spec (never falls back to the wired one)", async () => {
    await withTempDir(async (dir) => {
      const result = await composeSpec(acceptedBrief(), {
        ideasRoot: dir,
        brandProfilePath: join(HERE, "fixtures", "does-not-exist.yaml"),
        recipe: CAROUSEL_RECIPE,
        generator: () => ({ slides: [] }), // fails the carousel's OWN min-slides rule
        validator: validateNewsCarouselSpec,
      });
      assert.equal(result.written, false);
      assert.equal(result.reason, "validation");
      assert.ok(result.errors && result.errors.some((e) => e.code === "slides_count"));

      const path = specPathFor("idea-2026-W22-01", "2026-W22", dir, CAROUSEL_RECIPE);
      assert.equal(await exists(path), false);
    });
  });

  it("a second Recipe's Spec is saved BESIDE the first, never overwriting it (recipe-segmented path)", async () => {
    await withTempDir(async (dir) => {
      const brandProfilePath = join(HERE, "fixtures", "does-not-exist.yaml");
      const wired = await composeSpec(acceptedBrief(), { ideasRoot: dir, brandProfilePath, recipe: RECIPE });
      const carousel = await composeSpec(acceptedBrief(), {
        ideasRoot: dir,
        brandProfilePath,
        recipe: CAROUSEL_RECIPE,
        generator: () => validNewsCarouselSpec(6),
        validator: validateNewsCarouselSpec,
      });

      assert.equal(wired.written, true);
      assert.equal(carousel.written, true);
      assert.notEqual(wired.path, carousel.path);
      assert.equal(await exists(wired.path), true);
      assert.equal(await exists(carousel.path), true);
    });
  });
});
