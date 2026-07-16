/**
 * Deterministic Brand-rule injection — pure deep module (ADR-0012, issue #58).
 *
 * Brings the previously-dead `required_cta`/`required_hashtags` Brand Profile rules LIVE: given a
 * drafted Copy (`draft.ts`'s output — the producer's LLM job, or a test's fake drafter) and the Brand's
 * rules, deterministically ensures the required CTA and required hashtags are present — appending them
 * when absent, and DEDUPING (never appending a second time) when the draft already contains them. This
 * is a bounded, deterministic backstop — never an unbounded model loop — so `validateCopy` (`validate.ts`)
 * can then check the result is actually contract-conformant.
 *
 * Pure: no I/O, no clock, no Space, no network.
 */

import type { BrandCopyRules } from "../production-spec/brand-profile.ts";
import type { Copy } from "./contract.ts";

/** Strip a leading `#` and lower-case, so hashtag presence checks are agnostic to the `#` and case. */
function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim();
  return (trimmed.startsWith("#") ? trimmed.slice(1) : trimmed).toLowerCase();
}

/**
 * Ensure `caption` includes `requiredCta`, appending it when absent. DEDUPES: if `caption` already
 * contains the CTA text (case-insensitive substring match), it is returned UNCHANGED — never appended a
 * second time. A `null`/blank `requiredCta` (the real profile's default — no CTA enforced) is a no-op.
 */
export function injectRequiredCta(caption: string, requiredCta: string | null): string {
  if (requiredCta === null) return caption;
  const cta = requiredCta.trim();
  if (cta.length === 0) return caption;
  if (caption.toLowerCase().includes(cta.toLowerCase())) return caption;
  const trimmed = caption.trimEnd();
  return trimmed.length > 0 ? `${trimmed} ${cta}` : cta;
}

/**
 * Ensure `hashtags` includes every entry of `required`, appending any missing ones (each normalized to
 * carry a leading `#`). DEDUPES against what is already present (case-insensitive, `#`-agnostic) — a
 * required hashtag already in `hashtags` (with or without its own `#`) is never appended a second time.
 * Existing entries and their order are preserved; missing required hashtags are appended in the order
 * they were configured.
 */
export function injectRequiredHashtags(
  hashtags: readonly string[],
  required: readonly string[],
): string[] {
  const seen = new Set(hashtags.map(normalizeHashtag));
  const out = [...hashtags];
  for (const raw of required) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const norm = normalizeHashtag(trimmed);
    if (seen.has(norm)) continue;
    out.push(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
    seen.add(norm);
  }
  return out;
}

/** Inject both the required CTA (into `caption`) and the required hashtags (into `hashtags`). */
export function injectRequiredParts(copy: Copy, rules: BrandCopyRules): Copy {
  return {
    caption: injectRequiredCta(copy.caption, rules.requiredCta),
    hashtags: injectRequiredHashtags(copy.hashtags, rules.requiredHashtags),
  };
}
