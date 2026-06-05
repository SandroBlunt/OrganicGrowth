/**
 * Production Spec composer — pure deep module.
 *
 * Builds a contract-conformant Production Spec from an accepted Brief, DETERMINISTICALLY (no model
 * call, no I/O, no clock). The generated Spec always passes `validate()` (PRD #1 stories 3-4): the
 * generator and the validator share `contract.ts`, so the producer can never emit a Spec that its own
 * validator would reject.
 *
 * NOTE ON SCOPE: the eventual Producer will likely have an LLM draft the creative prompt text. This
 * slice deliberately uses a deterministic template so the build is hermetic and the "generated Spec
 * passes validation" criterion is provable without a model. The contract enforced here is the same
 * one a model-drafted Spec would have to pass — the validator is the contract's guardian either way.
 */

import {
  REQUIRED_CHARACTER_CONCEPTS,
  REQUIRED_CLIPS,
  REQUIRED_THUMBNAILS,
  MAX_POST_COPY_CHARS,
  ASPECT_RATIO_LINE,
  type ProductionSpec,
  type SpecClip,
} from "./contract.ts";

/**
 * The accepted Brief fields the composer reads. Mirrors `ideas/<run>/idea-NN.md` front-matter + body;
 * optional fields are synthesized to satisfy the contract when a Brief is sparse.
 */
export interface Brief {
  readonly id: string;
  readonly run: string;
  readonly title: string;
  readonly angle?: string;
  /** Up to 3 distinct anthropomorphic concepts; padded/trimmed to exactly 3. */
  readonly character_concepts?: readonly string[];
  /** Narrative beats, one per clip; padded/trimmed to exactly 3. */
  readonly beats?: readonly string[];
  /** Suggested social copy; defaulted (with emoji) when absent or out of contract. */
  readonly post_copy?: string;
}

/** Pad an array to exactly `n` entries using `fill(i)`, or trim to the first `n`. */
function toExactly<T>(items: readonly T[], n: number, fill: (i: number) => T): T[] {
  const out = items.slice(0, n);
  for (let i = out.length; i < n; i += 1) out.push(fill(i));
  return out;
}

/** Default anthropomorphic concepts, used when a Brief supplies fewer than three. */
function defaultConcept(i: number): string {
  const objects = ["mug", "alarm clock", "window curtain", "toaster", "lamp"];
  const obj = objects[i % objects.length];
  return `A friendly anthropomorphic ${obj} with expressive eyes`;
}

/** Default narrative beats, used when a Brief supplies fewer than three. */
function defaultBeat(i: number): string {
  return ["The setup", "The simple change", "The payoff"][i] ?? `Beat ${i + 1}`;
}

/** Build one clip from the lead concept and a beat. The image prompt ends with the 9:16 line. */
function buildClip(lead: string, beat: string, index: number): SpecClip {
  return {
    id: `clip-${index + 1}`,
    clip_id: index + 1,
    concept_title: beat,
    image_prompt: `Pixar 3D render of ${lead} during "${beat}", warm cinematic lighting. ${ASPECT_RATIO_LINE}`,
    video_prompt: `Slow camera move on ${lead}, it acts out ${beat.toLowerCase()}, gentle voice line, soft ambient sfx.`,
  };
}

/** Suffix that gives default post_copy its required emojis (exactly two, with a leading space). */
const POST_COPY_EMOJI_TAIL = " ☀️✨";

/**
 * Coerce a Brief's suggested post_copy into the contract (<=180 chars, 1-3 emojis). If the Brief's
 * copy already conforms it is kept verbatim; otherwise the Brief title is truncated by code point and
 * the emoji tail appended, so the result always satisfies the contract. Pure: no I/O.
 */
function buildPostCopy(brief: Brief): string {
  const candidate = brief.post_copy?.trim();
  if (
    candidate &&
    [...candidate].length <= MAX_POST_COPY_CHARS &&
    countEmojis(candidate) >= 1 &&
    countEmojis(candidate) <= 3
  ) {
    return candidate;
  }
  // Truncate the title by CODE POINT (so an emoji is never split), then append the emoji tail.
  const room = MAX_POST_COPY_CHARS - [...POST_COPY_EMOJI_TAIL].length;
  const head = [...brief.title].slice(0, Math.max(0, room)).join("").trimEnd();
  return head + POST_COPY_EMOJI_TAIL;
}

/** Count emoji (grapheme clusters whose head is an Extended_Pictographic code point). */
function countEmojis(text: string): number {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    const first = segment.codePointAt(0);
    if (first === undefined) continue;
    if (/\p{Extended_Pictographic}/u.test(String.fromCodePoint(first))) count += 1;
  }
  return count;
}

/**
 * Compose a contract-conformant Production Spec from an accepted Brief. Deterministic and pure.
 *
 * @param brief the accepted Brief (the machine-readable Spec is its sibling)
 */
export function generate(brief: Brief): ProductionSpec {
  const concepts = toExactly(
    brief.character_concepts ?? [],
    REQUIRED_CHARACTER_CONCEPTS,
    defaultConcept,
  );
  const lead = concepts[0]!;
  const beats = toExactly(brief.beats ?? [], REQUIRED_CLIPS, defaultBeat);
  const clips = beats.map((beat, i) => buildClip(lead, beat, i));
  const thumbnails = toExactly(
    beats.map(
      (beat) => `Pixar 3D close-up of ${lead} during "${beat}", vibrant. ${ASPECT_RATIO_LINE}`,
    ),
    REQUIRED_THUMBNAILS,
    (i) => `Pixar 3D close-up of ${lead}, frame ${i + 1}. ${ASPECT_RATIO_LINE}`,
  );

  return {
    character_concepts: concepts,
    clips,
    post_copy: buildPostCopy(brief),
    thumbnails,
  };
}
