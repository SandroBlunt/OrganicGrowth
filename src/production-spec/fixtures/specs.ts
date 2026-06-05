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

/** A well-formed Production Spec: 3 concepts, 3 clips, top-level post_copy (2 emojis) + 3 thumbnails. */
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
    post_copy: "Your first ten minutes decide your whole day ☀️☕",
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

/** post_copy longer than 180 chars. */
export function longPostCopy(): Record<string, unknown> {
  const s = clone(validSpec());
  s.post_copy = "A".repeat(181) + " ☀️"; // > 180 chars, still has an emoji
  return s;
}

/** post_copy with 0 emojis (contract requires 1-3). */
export function zeroEmojis(): Record<string, unknown> {
  const s = clone(validSpec());
  s.post_copy = "Your first ten minutes decide your whole day";
  return s;
}

/** post_copy with 4 emojis (contract allows at most 3). */
export function fourEmojis(): Record<string, unknown> {
  const s = clone(validSpec());
  s.post_copy = "Your morning ☀️☕✨🌟";
  return s;
}

/** No thumbnails field at all. */
export function missingThumbnails(): Record<string, unknown> {
  const s = clone(validSpec());
  delete s.thumbnails;
  return s;
}

/** post_copy moved INTO the first clip instead of top-level (contract requires top-level). */
export function nestedPostCopy(): Record<string, unknown> {
  const s = clone(validSpec());
  delete s.post_copy;
  (s.clips as Record<string, unknown>[])[0]!.post_copy =
    "Nested where it must not be ☀️☕";
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
