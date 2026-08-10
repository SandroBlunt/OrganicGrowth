/**
 * News Short Script Production Spec test fixtures — a known-valid Spec plus deliberately-broken
 * variants (issue #174).
 *
 * Mirrors `fixtures/news-carousel-specs.ts`'s own rationale: the valid Spec is the single source of
 * truth; each broken variant is derived from it by ONE focused mutation, so a test asserts exactly one
 * contract violation at a time. Fixtures are plain data (no I/O). The valid Spec is intentionally
 * brand-safe and totals 123 words across its four beats (within the 120-150 band).
 */

import type { NewsShortScriptBeat } from "../news-short-script-contract.ts";

/** A well-formed News Short Script Spec: hook -> 2 story beats -> cta, totaling 123 words. */
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
    },
    {
      role: "story",
      text:
        "The company says its new support agent handles a typical ticket end to end, no human review " +
        "needed for the easy cases, and it already runs across every region they operate in today.",
      source_url: "https://example.com/news/support-agent-rollout",
      show_cue: "Product demo screen recording, cut to the support dashboard.",
    },
    {
      role: "story",
      text:
        "Three former support leads told us the rollout felt sudden, with barely two weeks of notice " +
        "before their whole team's daily queue moved over to the new system without a real transition.",
      source_url: "https://example.com/news/support-leads-reaction",
      media_url: "https://example.com/media/interview-clip.mp4",
      show_cue: "Talking-head interview clip, captioned with the quote.",
    },
    {
      role: "cta",
      text:
        "Would you trust an AI agent to close out your own support ticket end to end? Tell us in the " +
        "comments, and follow Straw Motion for the plain read on every big AI move.",
      source_url: "https://example.com/news/ai-tool-replaces-roles",
      show_cue: "Straw Motion end card.",
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
