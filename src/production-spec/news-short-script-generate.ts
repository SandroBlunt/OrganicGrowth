/**
 * News Short Script Production Spec composer — pure deep module (ADR-0031, issue #264).
 *
 * Mirrors `news-carousel-generate.ts`'s own doc comment exactly: a DETERMINISTIC template (no model
 * call, no I/O, no clock) standing in for the `news-short-script` Recipe's own `producerSkill`
 * (`"produce-news-short-script"`). The contract enforced is the one that Skill's real output would have
 * to pass — `news-short-script-validate.ts`'s `validateNewsShortScriptSpec` — including its whole-Spec
 * word-count band (`[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`), which this module hits EXACTLY by construction
 * (never by chance): each beat's spoken `text` is built to a fixed target word count from the Brief's
 * own title (as many of its words as fit), padded out with a small, fixed filler phrase list when the
 * title runs short — so the total is always inside range regardless of how long or short the Brief's
 * title is (`news-short-script-generate.test.ts`'s own short-title/long-title regression proof).
 *
 * Issue #273 round 1 fix: every beat's `source_url` used to sit on the SAME host (`example.com`), which
 * `news-short-script-author-checklist.ts`'s `auditNewsShortScriptAuthorPhase` (its `shot-list-variety`
 * item) always rejects — undetected before this ticket because `author-at-review.ts`'s accept-time
 * self-check only ran the GENERIC `auditAuthorPhase`, never this Recipe's OWN checklist. `HOST_CYCLE`
 * cycles each beat's `source_url` through 3 distinct IANA-reserved documentation hosts
 * (`example.com`/`.org`/`.net`) as a FALLBACK — still an obvious, non-fabricated placeholder, just no
 * longer host-colliding.
 *
 * Issue #273 round 2 fix (QA round 1's own finding): round 1's fix was purely mechanical — the "story"
 * beat (the 90-word bulk of the script) still built its `text` from the Brief's own `title` padded out
 * with `FILLER_WORDS`, and for any real title (a handful of words) that meant the SAME ~20-word filler
 * phrase got concatenated ~4 times to reach 90 words — real, live padding, not merely a theoretical risk
 * (QA's own repro). Two changes:
 *
 *   - The "story" beat now draws its words from `brief.talkingPoints` FIRST (the Brief's own real
 *     `## Talking Points` bullets, `src/idea/brief-content.ts`) when the Brief has any, falling back to
 *     `FILLER_WORDS` padding only for whatever's left over — a real Brief's talking points (4-6 full
 *     sentences) comfortably cover the 90-word target without needing filler at all. "hook"/"cta" stay
 *     title-grounded (their 20-word targets never need more than `FILLER_WORDS`' own 21 distinct entries,
 *     so they never repeat a phrase regardless).
 *   - Each beat's `source_url` now prefers a REAL, distinct-site URL from `brief.sourceUrls` (the Brief's
 *     own `## Source(s)` citations) before falling back to `HOST_CYCLE` for whatever shortfall remains —
 *     grounding the Shot List in the Idea's own real sources when available, never colliding either way.
 */

import {
  MIN_TOTAL_WORDS,
  MAX_TOTAL_WORDS,
  type NewsShortScriptBeat,
  type NewsShortScriptRole,
  type NewsShortScriptSpec,
} from "./news-short-script-contract.ts";
import type { Brief } from "./generate.ts";

/** Per-beat target word counts, summing to a value safely inside `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`
 *  regardless of rounding — 130 sits comfortably between 120 and 150. */
const BEAT_WORD_TARGETS: readonly { readonly role: NewsShortScriptRole; readonly words: number }[] = [
  { role: "hook", words: 20 },
  { role: "story", words: 90 },
  { role: "cta", words: 20 },
];

/** A small, fixed filler phrase — never randomness — used only to pad a beat's word count up to its
 *  target when the Brief's own title runs short. */
const FILLER_WORDS: readonly string[] = [
  "today",
  "this",
  "story",
  "keeps",
  "moving",
  "fast",
  "and",
  "the",
  "facts",
  "keep",
  "shifting",
  "as",
  "more",
  "details",
  "come",
  "in",
  "across",
  "the",
  "board",
  "right",
  "now",
];

/** Build a beat's spoken `text` at EXACTLY `target` words: `contentWords` first (grounding the beat in
 *  real material — the Brief's title for hook/cta, its Talking Points for story, issue #273 round 2),
 *  then filler words cycling from `FILLER_WORDS` to reach the target when real content runs short. */
function wordsExactly(target: number, contentWords: readonly string[]): string {
  const words: string[] = [];
  for (const w of contentWords) {
    if (words.length >= target) break;
    words.push(w);
  }
  let i = 0;
  while (words.length < target) {
    words.push(FILLER_WORDS[i % FILLER_WORDS.length]!);
    i += 1;
  }
  return `${words.join(" ")}.`;
}

function toWords(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0);
}

/**
 * The real content words a beat's `text` should draw from FIRST (issue #273 round 2): the "story" beat
 * — the 90-word bulk of the script, where round-1's title-only fallback padded most heavily — draws from
 * EVERY one of the Brief's own `talkingPoints`, concatenated in order (real, distinct material, never
 * one phrase repeated); every other role stays title-grounded (its 20-word target never needs more real
 * words than a real headline already supplies, and never repeats a `FILLER_WORDS` phrase either — see
 * this module's own doc comment). Falls back to the title alone when the Brief carries no talking points
 * at all.
 */
function contentWordsFor(role: NewsShortScriptRole, brief: Brief): string[] {
  const titleWords = toWords(brief.title);
  if (role !== "story") return titleWords;
  const talkingPoints = brief.talkingPoints ?? [];
  return talkingPoints.length > 0 ? toWords(talkingPoints.join(" ")) : titleWords;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "story";
}

/** A small, fixed cycle of distinct, IANA-reserved documentation hosts (never a single, colliding host)
 *  — issue #273: two-or-more beats sharing one `source_url` host/site always fails
 *  `news-short-script-author-checklist.ts`'s `shot-list-variety` item (CONTEXT.md "Shot List": "No two
 *  beats in one script repeat the same source page or the same site/company"). Cycling deterministically
 *  keeps this generator pure and reproducible; a REAL Shot List's sources come from the Brief's own
 *  material (`produce-news-short-script`'s own Skill job) — this stand-in never fabricates a real one. */
const HOST_CYCLE: readonly string[] = ["example.com", "example.org", "example.net"];

/** The registrable site/host of `url` (lowercased, leading `www.` stripped), or `null` when `url`
 *  doesn't parse — mirrors `news-short-script-author-checklist.ts`'s own `siteKeyFromUrl` exactly (kept
 *  local rather than imported: that module is the CHECKER, this one is what it checks, and duplicating
 *  this one small, pure helper avoids a checklist module depending on the generator it audits). */
function siteKeyFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve `count` `source_url` values, one per beat, EACH on a distinct site/host — never a collision,
 * whether real or synthetic (issue #273 round 2). Prefers the Brief's own real, distinct-site
 * `sourceUrls` (its `## Source(s)` citations) first, then fills any remaining slots from the synthetic
 * `HOST_CYCLE` fallback, skipping a synthetic host that happens to already be in use. `HOST_CYCLE` alone
 * always supplies enough distinct hosts for the fixed `BEAT_WORD_TARGETS.length` (3) this module ever
 * calls with, so the fallback loop always terminates with a full, distinct-site list.
 */
function resolveSourceUrls(brief: Brief, slug: string, count: number): string[] {
  const candidates = [...(brief.sourceUrls ?? []), ...HOST_CYCLE.map((host, i) => `https://${host}/source/${slug}-${i}`)];
  const usedSites = new Set<string>();
  const out: string[] = [];
  for (const url of candidates) {
    if (out.length >= count) break;
    const site = siteKeyFromUrl(url);
    if (site === null || usedSites.has(site)) continue;
    usedSites.add(site);
    out.push(url);
  }
  return out;
}

function buildBeat(role: NewsShortScriptRole, words: number, brief: Brief, sourceUrl: string): NewsShortScriptBeat {
  const text = wordsExactly(words, contentWordsFor(role, brief));
  return {
    role,
    text,
    source_url: sourceUrl,
    show_cue: `Show the "${brief.title}" story on screen (${role}).`,
    curiosity_queries: [
      `${brief.title} latest update`,
      `${brief.title} explained`,
      `${brief.title} background`,
    ],
  };
}

/**
 * Compose a contract-conformant News Short Script Production Spec from a minimal Brief. Deterministic
 * and pure — the SAME shape of stand-in `generate.ts`'s `generate` already is for the wired Recipe.
 *
 * @param brief a Brief (`id`, `run`, `title`, optionally `angle`/`companies`/`talkingPoints`/`sourceUrls`)
 */
export function generateNewsShortScriptSpec(brief: Brief): NewsShortScriptSpec {
  const slug = slugify(brief.title);
  const sourceUrls = resolveSourceUrls(brief, slug, BEAT_WORD_TARGETS.length);
  const beats = BEAT_WORD_TARGETS.map((target, index) => buildBeat(target.role, target.words, brief, sourceUrls[index]!));
  const total = beats.reduce((sum, b) => sum + b.text.trim().split(/\s+/).filter((w) => w.length > 0).length, 0);
  if (total < MIN_TOTAL_WORDS || total > MAX_TOTAL_WORDS) {
    // Defensive: BEAT_WORD_TARGETS is a static, committed constant summing to 130 — this can only fire
    // if that constant itself regresses, in which case failing loudly is far better than silently
    // emitting a Spec that would fail its own validator downstream.
    throw new Error(
      `news-short-script-generate: BEAT_WORD_TARGETS sums to ${total} words, outside ` +
        `[${MIN_TOTAL_WORDS}, ${MAX_TOTAL_WORDS}] — fix the target list.`,
    );
  }
  return { beats };
}
