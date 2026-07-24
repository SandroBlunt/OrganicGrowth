/**
 * Production Spec test fixtures — a known-valid Spec plus deliberately-broken variants.
 *
 * The valid Spec is the single source of truth; each broken variant is derived from it by a focused
 * mutation, so a test asserts exactly one contract violation at a time. Fixtures are plain data (no
 * I/O) so the validator can be tested purely.
 *
 * The valid Spec is intentionally also brand-safe against `fixtures/brand-profile.banned.yaml` (it
 * contains none of those banned words), so the same fixture drives both the validator and the
 * brand-safety tests.
 */

/** A well-formed Production Spec: 3 concepts, 3 clips, top-level thumbnails (media instructions only —
 *  `post_copy` is retired from the Spec, ADR-0012). */
export function validSpec(): Record<string, unknown> {
  return {
    character_concepts: [
      "A cheerful anthropomorphic alarm clock with expressive eyes",
      "A sleepy anthropomorphic coffee mug stretching awake",
      "A bright anthropomorphic window curtain pulling itself open",
    ],
    clips: [
      {
        id: "clip-1",
        clip_id: 1,
        concept_title: "The groggy wake-up",
        image_prompt:
          "Pixar 3D render of the anthropomorphic alarm clock rubbing its eyes at dawn in a cozy bedroom. Aspect Ratio 9:16.",
        video_prompt:
          "Slow push-in on the clock, it yawns and stretches its hands, soft voice says good morning, gentle chime sfx.",
      },
      {
        id: "clip-2",
        clip_id: 2,
        concept_title: "The first ten minutes",
        image_prompt:
          "Pixar 3D render of the anthropomorphic alarm clock opening the curtains to morning light. Aspect Ratio 9:16.",
        video_prompt:
          "Pan across the room, the clock flings the curtains wide, cheerful voice says let the day in, bright whoosh sfx.",
      },
      {
        id: "clip-3",
        clip_id: 3,
        concept_title: "The payoff",
        image_prompt:
          "Pixar 3D render of the anthropomorphic alarm clock dancing energized in the sunlit room. Aspect Ratio 9:16.",
        video_prompt:
          "Orbit around the clock, it dances with arms raised, upbeat voice says feel the difference, lively pop sfx.",
      },
    ],
    thumbnails: [
      "Pixar 3D close-up of the anthropomorphic alarm clock smiling at sunrise. Aspect Ratio 9:16.",
      "Pixar 3D the alarm clock opening curtains, golden light. Aspect Ratio 9:16.",
      "Pixar 3D the alarm clock dancing energized. Aspect Ratio 9:16.",
    ],
  };
}

/** Deep-clones a fixture so a mutation never leaks across tests. */
function clone(spec: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(spec);
}

/** 4 character_concepts (contract requires exactly 3). */
export function fourConcepts(): Record<string, unknown> {
  const s = clone(validSpec());
  (s.character_concepts as string[]).push("A spare anthropomorphic toaster");
  return s;
}

/** 2 clips (contract requires exactly 3). */
export function twoClips(): Record<string, unknown> {
  const s = clone(validSpec());
  (s.clips as unknown[]).pop();
  return s;
}

/** clips is the right length (3) but the entries are plain numbers, not clip objects. */
export function numericClips(): Record<string, unknown> {
  const s = clone(validSpec());
  s.clips = [1, 2, 3];
  return s;
}

/** A clip whose image_prompt does NOT end with the required `Aspect Ratio 9:16.` line. */
export function clipMissingAspectRatio(): Record<string, unknown> {
  const s = clone(validSpec());
  (s.clips as Record<string, unknown>[])[0]!.image_prompt =
    "Pixar 3D render of the anthropomorphic alarm clock at dawn, no aspect line";
  return s;
}

/** A clip missing its video_prompt (contract requires a non-empty video_prompt). */
export function clipMissingVideoPrompt(): Record<string, unknown> {
  const s = clone(validSpec());
  delete (s.clips as Record<string, unknown>[])[0]!.video_prompt;
  return s;
}

/** No thumbnails field at all. */
export function missingThumbnails(): Record<string, unknown> {
  const s = clone(validSpec());
  delete s.thumbnails;
  return s;
}

/** thumbnails moved INTO the first clip instead of top-level (contract requires top-level). */
export function nestedThumbnails(): Record<string, unknown> {
  const s = clone(validSpec());
  delete s.thumbnails;
  (s.clips as Record<string, unknown>[])[0]!.thumbnails = [
    "Pixar 3D nested thumbnail. Aspect Ratio 9:16.",
    "Pixar 3D nested thumbnail two. Aspect Ratio 9:16.",
    "Pixar 3D nested thumbnail three. Aspect Ratio 9:16.",
  ];
  return s;
}

/** A well-formed Spec with a non-empty top-level companies list (issue #125). */
export function specWithCompanies(): Record<string, unknown> {
  const s = clone(validSpec());
  s.companies = ["OpenAI", "Anthropic"];
  return s;
}

/** A well-formed Spec whose companies list is explicitly empty (the Idea names no real company). */
export function specWithEmptyCompanies(): Record<string, unknown> {
  const s = clone(validSpec());
  s.companies = [];
  return s;
}

/** companies present but not an array (contract requires an array, possibly empty). */
export function companiesNotArray(): Record<string, unknown> {
  const s = clone(validSpec());
  s.companies = "OpenAI";
  return s;
}

/** companies present as an array but containing a blank entry (contract requires non-empty strings). */
export function companiesBlankEntry(): Record<string, unknown> {
  const s = clone(validSpec());
  s.companies = ["OpenAI", "  "];
  return s;
}
