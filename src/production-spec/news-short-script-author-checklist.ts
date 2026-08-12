/**
 * News Short Script author-phase checklist — the News Short Script Recipe's own graduated author-phase
 * checklist (issue #187), mirroring `news-carousel-author-checklist.ts`'s own shape/philosophy exactly:
 * it layers NEW mechanical checks on top of this Recipe's own, ALREADY-REFERENCED structural validator
 * and banned-word scanner, never re-implementing either.
 *
 *   - `validateNewsShortScriptSpec` (`news-short-script-validate.ts`) covers "hook first, cta last, at
 *     least one story beat between", "every beat's fields are well-formed" (including its Curiosity
 *     Queries count, issue #187), and "the whole Spec's total word count is 120-150" — this module reads
 *     its `errors[].code`s to report those granularly, never re-deriving the rule itself.
 *   - `scanNewsShortScriptForBannedWords` (`news-short-script-brand-safety.ts`) covers "no banned word in
 *     any field" — REJECT-ONLY, never a silent swap (always-rule 9).
 *   - The referenced structural validator is the AUTHORITATIVE gate: a malformed/short/mis-ordered Spec
 *     fails this checklist's overall `ok` regardless of what the granular items below say.
 *
 * The genuinely NEW checks this module adds (2026-08-12 grilling; issue #187):
 *
 *   - **no-calendar-dates** — no beat's SPOKEN `text` states an explicit calendar date anywhere in the
 *     script body (not just an opening stamp), via `calendar-date-scan.ts`'s `scanTextFieldsForDates`,
 *     scoped to ONLY each beat's `text` field — never `source_url`/`media_url` (which legitimately carry
 *     a publication date as part of their own URL path) and never `show_cue` (a document annotation, not
 *     spoken content). REJECT-ONLY, mirroring the banned-word/dash-tell items' own contract.
 *   - **shot-list-variety** — no two beats' `source_url` share the same site/host across the WHOLE Shot
 *     List, mirroring the News Carousel Recipe's own `placement-variety` item (issue #106): fully
 *     computable from data already on the Spec, so it is `kind: "mechanical"` (ADR-0017). Unlike
 *     `placement-variety`, this needs no per-Format parameters — "no repeated source site" is a fixed,
 *     universal rule, not something a Format's Baseline Prompt tunes.
 *   - **curiosity-queries** — a granular re-derivation of `validateNewsShortScriptSpec`'s own
 *     `curiosity_queries_invalid` code, called out as its own checklist item (issue #187's own AC),
 *     exactly like the structural validator's `slide_role_order`/`slide_text_too_long` codes are split
 *     into the carousel checklist's own separate items.
 */

import { validateNewsShortScriptSpec } from "./news-short-script-validate.ts";
import { scanNewsShortScriptForBannedWords } from "./news-short-script-brand-safety.ts";
import { scanTextFieldsForDates } from "./calendar-date-scan.ts";
import type { TextField } from "./brand-safety.ts";
import type { ChecklistItemAudit, PhaseAuditResult } from "../recipe/phase-contract.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Best-effort beat extraction for the granular checks below — never throws on a malformed Spec; the
 *  REFERENCED `validateNewsShortScriptSpec` call is what actually rejects a malformed shape. */
function extractBeats(spec: unknown): readonly Record<string, unknown>[] {
  if (!isObject(spec)) return [];
  const beats = spec.beats;
  if (!Array.isArray(beats)) return [];
  return beats.filter(isObject);
}

/** Every beat's SPOKEN `text` field only — never `source_url`/`media_url`/`show_cue` (issue #187's own
 *  scope for the calendar-date scan; see module doc above). */
function spokenTextFields(beats: readonly Record<string, unknown>[]): TextField[] {
  const out: TextField[] = [];
  beats.forEach((beat, i) => {
    if (typeof beat.text === "string") out.push({ field: `beats[${i}].text`, text: beat.text });
  });
  return out;
}

/** One `source_url` site collision: the shared site/host, and every beat index that names it. */
export interface ShotListVarietyDuplicate {
  readonly site: string;
  readonly beatIndices: readonly number[];
}

/** The result of checking a Shot List's `source_url` fields for repeated sites (issue #187). */
export interface ShotListVarietyResult {
  readonly ok: boolean;
  readonly duplicates: readonly ShotListVarietyDuplicate[];
}

/** The registrable site/host `url` names (lowercased, `www.` stripped), or `null` when `url` doesn't
 *  parse as a URL at all — never throws (the referenced structural validator is what rejects a
 *  malformed `source_url`; this function simply has nothing to compare for one). */
function siteKeyFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

/**
 * Whether any two beats' `source_url` share the same site/host — CONTEXT.md's Shot List rule: "No two
 * beats in one script repeat the same source page or the same site/company." Two beats pointing at
 * different PAGES on the SAME site/host still collide (the stricter, site-level check subsumes the
 * "same exact page" case too). Exported for direct, focused testing, mirroring
 * `news-carousel-author-checklist.ts`'s own convention of keeping this kind of pure helper testable
 * through the checklist's own audit function.
 */
export function checkShotListVariety(beats: readonly Record<string, unknown>[]): ShotListVarietyResult {
  const bySite = new Map<string, number[]>();
  beats.forEach((beat, i) => {
    const url = typeof beat.source_url === "string" ? beat.source_url : undefined;
    const site = url !== undefined ? siteKeyFromUrl(url) : null;
    if (site === null) return;
    const indices = bySite.get(site) ?? [];
    indices.push(i);
    bySite.set(site, indices);
  });
  const duplicates: ShotListVarietyDuplicate[] = [...bySite.entries()]
    .filter(([, indices]) => indices.length > 1)
    .map(([site, beatIndices]) => ({ site, beatIndices }));
  return { ok: duplicates.length === 0, duplicates };
}

/**
 * Audit a candidate News Short Script Production Spec against its FULL, graduated author-phase
 * checklist (issue #187). Runs entirely as CODE — every item either REFERENCES
 * `validateNewsShortScriptSpec`/`scanNewsShortScriptForBannedWords` (never duplicated) or is one of the
 * NEW mechanical checks this module adds. Never throws.
 *
 * @param candidateSpec the candidate News Short Script Production Spec (untrusted shape)
 * @param bannedWords   the Brand's banned words (`production-spec/brand-profile.ts`'s `loadBannedWords`)
 */
export function auditNewsShortScriptAuthorPhase(
  candidateSpec: unknown,
  bannedWords: readonly string[],
): PhaseAuditResult {
  const structural = validateNewsShortScriptSpec(candidateSpec);
  const safety = scanNewsShortScriptForBannedWords(candidateSpec, bannedWords);
  const beats = extractBeats(candidateSpec);
  const dates = scanTextFieldsForDates(spokenTextFields(beats));
  const variety = checkShotListVariety(beats);

  const hasStructuralCode = (code: string): boolean => structural.errors.some((e) => e.code === code);

  const items: ChecklistItemAudit[] = [
    {
      id: "role-order-word-count",
      description:
        "hook first, cta last, at least one story beat between them; the WHOLE script's total word " +
        "count falls in 120-150 words.",
      kind: "mechanical",
      ok:
        !hasStructuralCode("not_an_object") &&
        !hasStructuralCode("beats_missing") &&
        !hasStructuralCode("beats_empty") &&
        !hasStructuralCode("beat_role_order") &&
        !hasStructuralCode("word_count_out_of_range"),
    },
    {
      id: "beat-fields",
      description:
        "Every beat has a non-empty text/source_url/show_cue, a well-formed role, and a well-formed " +
        "source_url/media_url.",
      kind: "mechanical",
      ok:
        !hasStructuralCode("beat_shape") &&
        !hasStructuralCode("beat_role_invalid") &&
        !hasStructuralCode("source_url_invalid") &&
        !hasStructuralCode("media_url_invalid"),
    },
    {
      id: "curiosity-queries",
      description:
        "Every beat carries 3-5 non-empty Curiosity Queries (CONTEXT.md \"Curiosity Queries\") — " +
        "suggested search queries helping the Operator find better real source material for that beat.",
      kind: "mechanical",
      ok: !hasStructuralCode("curiosity_queries_invalid"),
    },
    {
      id: "no-calendar-dates",
      description:
        "No beat's spoken text states an explicit calendar date anywhere in the script body — " +
        "reject-only; the platform shows the date itself.",
      kind: "mechanical",
      ok: dates.ok,
      ...(dates.ok ? {} : { detail: dates.hits.map((h) => `"${h.match}" in ${h.field}`).join("; ") }),
    },
    {
      id: "shot-list-variety",
      description:
        "No two beats' source_url repeat the same source page or the same site/company across the " +
        "Shot List (CONTEXT.md \"Shot List\").",
      kind: "mechanical",
      ok: variety.ok,
      ...(variety.ok
        ? {}
        : {
            detail: variety.duplicates
              .map((d) => `"${d.site}" in beats[${d.beatIndices.join(", ")}]`)
              .join("; "),
          }),
    },
    {
      id: "banned-words",
      description: "No banned word in any field — reject-only, never a silent swap.",
      kind: "mechanical",
      ok: safety.ok,
      ...(safety.ok ? {} : { detail: safety.hits.map((h) => `"${h.word}" in ${h.field}`).join("; ") }),
    },
  ];

  // The referenced structural validator is the authoritative gate for shape/order/word-count: a
  // malformed Spec fails the whole checklist even if a granular item above couldn't itself tell why.
  const ok = structural.ok && items.every((i) => i.ok !== false);

  return { recipe: "news-short-script", phase: "author", ok, items };
}
