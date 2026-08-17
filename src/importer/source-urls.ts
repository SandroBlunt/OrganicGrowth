/**
 * `extractSourceUrls` — pulls the real, openly-readable links out of a Brief's `## Source(s)` section
 * (issue #204).
 *
 * `src/idea/store.ts`'s `assertOpenlyReadableSource` (issue #228) already found, and left this ticket
 * to decide: a `## Source(s)` section's bullets are MOSTLY clean `https://` links, but a real minority
 * are editorial/verification notes carrying no URL at all (e.g. "(No distinct official X corporate blog
 * post was found for this specific feature.)"). This module's rule, decided here (see this issue's
 * `handoff.md` for the write-up): **extract links, not lines.** Every `https?://` URL substring found
 * ANYWHERE inside the `## Source(s)` section's text is kept (deduplicated, first-seen order); a bullet
 * that carries no URL at all contributes nothing and is silently excluded — it is prose ABOUT sourcing,
 * not itself a citation, and there is no schema field to hold it separately (no acceptance criterion
 * asks for one). This is a documented DROP, not a silent one: this module's own doc comment and the
 * ticket's handoff both name the decision explicitly.
 *
 * Operating over the section's raw text (rather than splitting into physical lines first) is
 * deliberate: a real bullet routinely wraps its URL onto a markdown-wrapped continuation line (a
 * `**PRIMARY (...):**` bold lead-in followed by the citation two lines later) — splitting by line first
 * would either miss the URL or require reassembling wrapped bullets, which whole-section regex matching
 * sidesteps entirely.
 *
 * Pure: no disk, no network, no clock.
 */

/** Matches a `## Source(s)` heading line exactly as every real Brief in this repo writes it (verified
 *  across every Brief markdown file under each Brand's `ideas` directory, both Brands, every folder
 *  layout). */
const SOURCES_HEADING = /^## Source\(s\)\s*$/m;

/** Matches any `## ` heading line — used to find where the Source(s) section ENDS (the next heading,
 *  or end of string when Source(s) is the last section). */
const ANY_HEADING = /^## /m;

/** A URL substring: `http(s)://` followed by any run of non-whitespace characters. Trailing markdown/
 *  prose punctuation is stripped separately (see `stripTrailingPunctuation`) since a URL embedded in a
 *  sentence (`(https://example.com/a/b).`) has no whitespace to naturally bound it on the right. */
const URL_PATTERN = /https?:\/\/\S+/g;

/** Trailing characters that are prose/markdown punctuation, never part of a real URL, when they appear
 *  at the very end of a matched substring: closing paren, period, comma, semicolon, colon, closing
 *  bracket, and markdown's own bold/italic closer `*`. Stripped repeatedly (a URL can end in more than
 *  one, e.g. `.)`) until none remain at the end. */
const TRAILING_PUNCTUATION = /[)\].,;:*]+$/;

function stripTrailingPunctuation(url: string): string {
  let out = url;
  let next = out.replace(TRAILING_PUNCTUATION, "");
  while (next !== out) {
    out = next;
    next = out.replace(TRAILING_PUNCTUATION, "");
  }
  return out;
}

/** Extracts the `## Source(s)` section's own body text (excluding the heading line itself), or `null`
 *  when the Brief has no such section at all (e.g. MundoTip's pre-Format Ideas, which never cite
 *  sources). PURE. */
function sourcesSectionText(brief: string): string | null {
  const headingMatch = SOURCES_HEADING.exec(brief);
  if (headingMatch === null) return null;
  const bodyStart = headingMatch.index + headingMatch[0].length;
  const rest = brief.slice(bodyStart);
  ANY_HEADING.lastIndex = 0;
  const nextHeading = ANY_HEADING.exec(rest);
  return nextHeading === null ? rest : rest.slice(0, nextHeading.index);
}

/**
 * Every distinct, openly-readable URL found in `brief`'s `## Source(s)` section, in first-seen order.
 * Returns `[]` when the Brief has no `## Source(s)` section, or when every bullet in it is an
 * editorial/verification note with no URL. PURE, never throws.
 */
export function extractSourceUrls(brief: string): string[] {
  const section = sourcesSectionText(brief);
  if (section === null) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of section.matchAll(URL_PATTERN)) {
    const url = stripTrailingPunctuation(match[0]);
    if (url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
