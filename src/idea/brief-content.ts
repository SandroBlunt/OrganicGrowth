/**
 * `brief-content.ts` — parses an Idea's Brief markdown into the structured, story-specific fields the
 * Production-Spec author stand-ins need to vary content per-story (issue #273 round 2).
 *
 * QA's round-1 finding: `accept-idea.ts` built its `Brief` from only the ledger Idea's `id`/`run`/
 * `title` — never the real Brief markdown on disk, which is where an Idea's actual story material lives.
 * No deterministic generator, however carefully checklisted, can vary its output based on content it was
 * never given: a checklist can only ever catch SYMPTOMS of genericness, never manufacture content that
 * was never passed in. This module is the fix for the "never passed in" half of that: it is a PURE
 * (no I/O, no clock) parser over the SAME markdown content `src/importer/load-brief.ts`'s `loadBrief`
 * already loads (I/O stays there) — it extracts the sections CONTEXT.md's own "Idea" definition names as
 * part of every Brief ("angle, a hook concept, talking points, a hashtag set, and a predicted Fit
 * Score"):
 *
 *   - `## Angle` — the Idea's own framing paragraph. `src/production-spec/generate.ts`'s `Brief.angle`
 *     field has existed since ADR-0031, but nothing in the accept path ever populated it from real
 *     content before this ticket — this module is the first thing that does.
 *   - `## Talking Points` (either capitalization — every real straw-motion Brief carries this heading;
 *     verified across all 51 of its Brief files, both Formats, this ticket's own `handoff.md`) — the
 *     bulleted, story-specific facts a Spec-author stand-in can cite instead of repeating the bare
 *     headline on every slide/beat.
 *   - `## Source(s)` — reuses `src/importer/source-urls.ts`'s existing, already-tested
 *     `extractSourceUrls` verbatim (never re-implemented, never duplicated) for the real, openly-readable
 *     citation URLs.
 *
 * A markdown Brief with no matching section for a given field simply omits that field (`[]` for
 * `talkingPoints`/`sourceUrls`, `undefined` for `angle`) — never fabricated, never guessed (always-rule
 * 8). This module never throws: a malformed or minimal Brief just yields fewer/empty fields.
 */

import { extractSourceUrls } from "../importer/source-urls.ts";

/** Matches any `## ` heading line — used to find where a matched section ENDS (the next heading, or end
 *  of string when the matched section is the Brief's last one). */
const ANY_HEADING = /^## /m;

/** The "## Talking Points" heading, either capitalization (real straw-motion Briefs use both — some say
 *  "## Talking Points", others "## Talking points"). */
const TALKING_POINTS_HEADING = /^## Talking [Pp]oints\s*$/m;

/** The "## Angle" heading. */
const ANGLE_HEADING = /^## Angle\s*$/m;

/**
 * `heading`'s own section body text (excluding the heading line itself), or `null` when `markdown` has
 * no match for `heading` at all. Mirrors `source-urls.ts`'s own private `sourcesSectionText`,
 * generalized to any heading — kept local here (not exported from `source-urls.ts`, which stays a
 * single-purpose, already-shipped module this one only calls INTO for URLs, never edits). PURE.
 */
function sectionBody(markdown: string, heading: RegExp): string | null {
  const match = heading.exec(markdown);
  if (match === null) return null;
  const bodyStart = match.index + match[0].length;
  const rest = markdown.slice(bodyStart);
  ANY_HEADING.lastIndex = 0;
  const nextHeading = ANY_HEADING.exec(rest);
  return nextHeading === null ? rest : rest.slice(0, nextHeading.index);
}

/**
 * Every bullet under a `## Talking Points`/`## Talking points` heading, trimmed, deduplicated (first-
 * seen order), non-empty, in document order. A bullet line starts with `-` or `*`; a following non-
 * bullet, non-blank line is folded into the PREVIOUS bullet as a wrapped continuation (a real bullet
 * occasionally wraps across lines, mirroring `extractSourceUrls`'s own documented convention for wrapped
 * Source(s) bullets). Returns `[]` when the Brief has no such section at all. PURE, never throws.
 */
export function extractTalkingPoints(markdown: string): string[] {
  const section = sectionBody(markdown, TALKING_POINTS_HEADING);
  if (section === null) return [];

  const points: string[] = [];
  let current: string | null = null;
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet !== null) {
      if (current !== null) points.push(current.trim());
      current = bullet[1] ?? "";
    } else if (current !== null && line.length > 0) {
      current = `${current} ${line}`;
    }
  }
  if (current !== null) points.push(current.trim());

  const seen = new Set<string>();
  return points.filter((point) => {
    if (point.length === 0 || seen.has(point)) return false;
    seen.add(point);
    return true;
  });
}

/**
 * The `## Angle` section's own paragraph text, whitespace-collapsed onto one line, or `undefined` when
 * the Brief has no such section (or the section is blank). PURE, never throws.
 */
export function extractAngle(markdown: string): string | undefined {
  const section = sectionBody(markdown, ANGLE_HEADING);
  if (section === null) return undefined;
  const text = section.trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : undefined;
}

/** The story-specific fields this module extracts from one Brief's raw markdown. */
export interface ParsedBriefContent {
  readonly angle?: string;
  readonly talkingPoints: readonly string[];
  readonly sourceUrls: readonly string[];
}

/**
 * Parse `markdown` (one Idea's Brief content, as `src/importer/load-brief.ts`'s `loadBrief` returns it)
 * into its `angle`/`talkingPoints`/`sourceUrls`. PURE, never throws — a Brief missing any given section
 * simply omits/empties that field, never fabricated.
 */
export function parseBriefContent(markdown: string): ParsedBriefContent {
  const angle = extractAngle(markdown);
  return {
    ...(angle !== undefined ? { angle } : {}),
    talkingPoints: extractTalkingPoints(markdown),
    sourceUrls: extractSourceUrls(markdown),
  };
}
