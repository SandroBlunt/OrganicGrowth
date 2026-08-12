/**
 * News Short Script Production Spec test fixtures — a known-valid Spec plus deliberately-broken
 * variants (issue #174; curiosity_queries + distinct-source beats added issue #187).
 *
 * Mirrors `fixtures/news-carousel-specs.ts`'s own rationale: the valid Spec is the single source of
 * truth; each broken variant is derived from it by ONE focused mutation, so a test asserts exactly one
 * contract violation at a time. Fixtures are plain data (no I/O). The valid Spec is intentionally
 * brand-safe and totals 124 words across its four beats (within the 120-150 band); each beat's
 * `source_url` names a DISTINCT site/host (issue #187's Shot List variety rule), and every beat carries
 * 3 Curiosity Queries (issue #187's own new field, `MIN_CURIOSITY_QUERIES`-`MAX_CURIOSITY_QUERIES`).
 */

import type { NewsShortScriptBeat } from "../news-short-script-contract.ts";

/** A well-formed News Short Script Spec: hook -> 2 story beats -> cta, totaling 124 words. */
export function validNewsShortScriptSpec(): Record<string, unknown> {
  const beats: NewsShortScriptBeat[] = [
    {
      role: "hook",
      text:
        "This AI tool just replaced three job roles overnight, and almost nobody outside the company " +
        "noticed until the layoffs hit the news this morning.",
      source_url: "https://example.com/news/ai-tool-replaces-roles",
      media_url: "https://example.com/media/announcement-clip.mp4",
      show_cue: "Source page screenshot of the announcement, then the clip.",
      curiosity_queries: [
        "AI tool replaces support jobs announcement",
        "company layoffs after AI rollout 2026",
        "AI customer support tool press release",
      ],
    },
    {
      role: "story",
      text:
        "The company says its new support agent handles a typical ticket end to end, no human review " +
        "needed for the easy cases, and it already runs across every region they operate in today.",
      source_url: "https://newsdesk.example.org/support-agent-rollout",
      show_cue: "Product demo screen recording, cut to the support dashboard.",
      curiosity_queries: [
        "AI support agent ticket resolution demo",
        "company support agent product page",
        "AI support agent every region rollout",
      ],
    },
    {
      role: "story",
      text:
        "Three former support leads told us the rollout felt sudden, with barely two weeks of notice " +
        "before their whole team's daily queue moved over to the new system without a real transition. " +
        "The company has not said whether every customer gets the same rollout speed, and none of the " +
        "three had used the tool themselves before it went live.",
      source_url: "https://insider.example.net/support-leads-reaction",
      media_url: "https://example.com/media/interview-clip.mp4",
      show_cue: "Talking-head interview clip, captioned with the quote.",
      curiosity_queries: [
        "former support lead AI rollout interview",
        "employees reaction AI replacing support team",
        "AI transition support staff two weeks notice",
      ],
    },
    {
      role: "cta",
      text: "Did AI change your week? Tell us how.",
      source_url: "https://www.youtube.com/@strawmotion",
      show_cue: "Straw Motion end card.",
      curiosity_queries: [
        "Straw Motion YouTube channel",
        "AI job displacement viewer reactions",
        "AI customer support backlash coverage",
      ],
    },
  ];
  return { beats };
}

/** Deep-clones a fixture so a mutation never leaks across tests. */
function clone(spec: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(spec);
}

/** beats is an empty array (structurally present, but contract requires at least one beat). */
export function emptyBeats(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  s.beats = [];
  return s;
}

/** The first beat's role is "story" instead of "hook". */
export function firstBeatNotHook(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[0] = { ...beats[0]!, role: "story" };
  return s;
}

/** The last beat's role is "story" instead of "cta". */
export function lastBeatNotCta(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[beats.length - 1] = { ...beats[beats.length - 1]!, role: "story" };
  return s;
}

/** A middle beat is "hook" instead of "story" — breaks the required hook -> story* -> cta shape. */
export function middleBeatWrongRole(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[1] = { ...beats[1]!, role: "hook" };
  return s;
}

/** The second beat is missing its show_cue entirely. */
export function missingShowCue(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as Array<Partial<NewsShortScriptBeat>>;
  const { show_cue: _dropped, ...rest } = beats[1]!;
  beats[1] = rest;
  return s;
}

/** The first beat's source_url is not a URL at all. */
export function sourceUrlNotAUrl(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[0] = { ...beats[0]!, source_url: "not-a-url" };
  return s;
}

/** The first beat's media_url is not a URL at all. */
export function mediaUrlNotAUrl(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[0] = { ...beats[0]!, media_url: "not-a-url" };
  return s;
}

/** Every beat's text is trimmed to just one word — the total word count falls well below 120. */
export function wordCountTooLow(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  s.beats = beats.map((b) => ({ ...b, text: "Hi." }));
  return s;
}

/** Every beat's text is padded well past 150 words total. */
export function wordCountTooHigh(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  const padding = new Array(40).fill("word").join(" ");
  s.beats = beats.map((b, i) => (i === 0 ? { ...b, text: `${b.text} ${padding}` } : b));
  return s;
}

/** The second beat's curiosity_queries field is missing entirely (issue #187). */
export function missingCuriosityQueries(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as Array<Partial<NewsShortScriptBeat>>;
  const { curiosity_queries: _dropped, ...rest } = beats[1]!;
  beats[1] = rest;
  return s;
}

/** The second beat's curiosity_queries has only 2 entries (below MIN_CURIOSITY_QUERIES, issue #187). */
export function curiosityQueriesTooFew(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[1] = { ...beats[1]!, curiosity_queries: ["one query", "two query"] };
  return s;
}

/** The second beat's curiosity_queries has 6 entries (above MAX_CURIOSITY_QUERIES, issue #187). */
export function curiosityQueriesTooMany(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[1] = {
    ...beats[1]!,
    curiosity_queries: ["q1", "q2", "q3", "q4", "q5", "q6"],
  };
  return s;
}

/** The second beat's curiosity_queries contains a blank entry (issue #187). */
export function curiosityQueriesBlankEntry(): Record<string, unknown> {
  const s = clone(validNewsShortScriptSpec());
  const beats = s.beats as NewsShortScriptBeat[];
  beats[1] = { ...beats[1]!, curiosity_queries: ["a real query", "   ", "another real query"] };
  return s;
}
