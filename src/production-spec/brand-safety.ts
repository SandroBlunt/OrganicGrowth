/**
 * Brand-safety scanner — pure deep module.
 *
 * Enforces the Brand Profile's hard banned-word filter on a Production Spec, so production never
 * reintroduces something Review would have filtered: a banned word in ANY text field (concepts, clip
 * prompts, post_copy, thumbnails) rejects the Spec, and a rejected Spec is never written (always-rule
 * 9; PRD #1 story 30).
 *
 * Pure and deterministic: no I/O. The banned-words list comes from `brand-profile.ts` (the I/O
 * boundary). Matching is case-insensitive and WHOLE-WORD (so the banned word "cure" does not flag the
 * unrelated word "secure"); banned phrases with spaces are matched as substrings on a word boundary.
 */

/** One banned-word match found in a Spec. */
export interface BannedWordHit {
  /** The configured banned word that matched (as written in the brand profile). */
  readonly word: string;
  /** Where it was found, e.g. `post_copy`, `clips[0].image_prompt`, `thumbnails[2]`. */
  readonly field: string;
}

/** The result of scanning a Spec for banned words. */
export interface BrandSafetyResult {
  readonly ok: boolean;
  readonly hits: readonly BannedWordHit[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Collect every `{ field, text }` pair from a Spec's known text-bearing fields. Untrusted shape:
 * anything missing or wrongly-typed is simply skipped (the validator catches structural problems).
 */
function collectTextFields(spec: unknown): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  if (!isObject(spec)) return out;

  const concepts = spec.character_concepts;
  if (Array.isArray(concepts)) {
    concepts.forEach((c, i) => {
      if (typeof c === "string") out.push({ field: `character_concepts[${i}]`, text: c });
    });
  }

  const clips = spec.clips;
  if (Array.isArray(clips)) {
    clips.forEach((clip, i) => {
      if (!isObject(clip)) return;
      for (const key of ["concept_title", "image_prompt", "video_prompt"]) {
        const v = clip[key];
        if (typeof v === "string") out.push({ field: `clips[${i}].${key}`, text: v });
      }
    });
  }

  if (typeof spec.post_copy === "string") {
    out.push({ field: "post_copy", text: spec.post_copy });
  }

  const thumbnails = spec.thumbnails;
  if (Array.isArray(thumbnails)) {
    thumbnails.forEach((t, i) => {
      if (typeof t === "string") out.push({ field: `thumbnails[${i}]`, text: t });
    });
  }

  return out;
}

/**
 * Scan a Production Spec for any of `bannedWords` (case-insensitive, whole-word). Returns `{ ok, hits }`.
 * When `bannedWords` is empty the scan always passes.
 *
 * @param spec        the candidate Production Spec (untrusted shape)
 * @param bannedWords the Brand Profile's banned words (from `loadBannedWords`)
 */
export function scanForBannedWords(
  spec: unknown,
  bannedWords: readonly string[],
): BrandSafetyResult {
  const hits: BannedWordHit[] = [];
  if (bannedWords.length === 0) return { ok: true, hits };

  const fields = collectTextFields(spec);
  for (const word of bannedWords) {
    // Word-boundary, case-insensitive. `\b` works for ASCII banned words; for accented banned words it
    // still anchors on the non-word boundary at each end of the run.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "iu");
    for (const { field, text } of fields) {
      if (pattern.test(text)) {
        hits.push({ word, field });
      }
    }
  }

  return { ok: hits.length === 0, hits };
}
