/**
 * Chapters — the one text-shaping rule behind Elgato Camera Hub's teleprompter library (issue #189,
 * `docs/adr/0027-producer-offers-camera-hub-teleprompter-upload.md`): split a script's plain body text
 * into the `chapters` array Camera Hub's own `Texts/<GUID>.json` schema expects (2026-08-12 smoke test).
 *
 * PURE, Recipe-agnostic — this file knows nothing about the News Short Script Recipe, `NEXT_SHOT_MARKER`,
 * or Assets at all; that Recipe-scoped glue lives in `src/camera-hub/news-short-script.ts` (ADR-0027:
 * "scoped to the News Short Script Recipe only... this module is a plain teleprompter-library
 * primitive").
 */

/**
 * Split `bodyText` into paragraph chapters: split on any run of blank-line whitespace between
 * paragraphs, then within EACH paragraph collapse every internal newline (plus its surrounding
 * whitespace) to a single space, and trim. Empty chunks (leading/trailing blank lines, or multiple
 * consecutive blank lines) are dropped — never an empty-string chapter.
 */
export function splitChapters(bodyText: string): string[] {
  return bodyText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
}
