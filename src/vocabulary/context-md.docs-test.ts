/**
 * Documentation-conformance suite for issue #201 AC3/AC4: `CONTEXT.md` defines closed `hook_type` and
 * `theme` vocabularies, each term with a one-line meaning, and the assertions are DERIVED from the
 * SAME source arrays the schema seeds from (`HOOK_TYPES`/`THEMES`) — never a second, hand-copied list —
 * so the doc and the code cannot silently drift apart.
 *
 * Mirrors the existing pattern (`src/schedule-batch/approval-gate.docs-test.ts`,
 * `src/format/cadence-rules-wording.docs-test.ts`): read the real shipped doc, assert real substrings.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { HOOK_TYPES } from "./hook-type.ts";
import { THEMES } from "./theme.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const CONTEXT_MD = join(REPO_ROOT, "CONTEXT.md");

/** Collapses whitespace runs (including a markdown hard line-wrap mid-sentence) to a single space, so
 *  a literal multi-word substring check survives CONTEXT.md's ~100-column prose wrapping. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * Extracts one glossary term's WHOLE entry — from its OWN heading LINE (`**Term**` at the start of a
 * line, immediately followed by `:` or ` (` — CONTEXT.md's definition-list style) up to (but not
 * including) the next blank-line-separated `**NextTerm**` heading, or end of file.
 *
 * Two failure modes a naive `doc.indexOf(heading)` hits, both real bugs this file caught on itself:
 * a term is often referenced INLINE inside another term's own prose (e.g. Hook Type's entry says
 * "alongside **Theme** below") — `indexOf` finds that inline mention, not the real heading, and grabs
 * the WRONG term's body. And a fixed char-count window silently truncates a long enumeration (the
 * `theme` list's last two values once fell outside a hardcoded 2000-char cutoff).
 */
function extractGlossaryEntry(doc: string, term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`(^|\\n)\\*\\*${escaped}\\*\\*[ :(]`);
  const headingMatch = headingPattern.exec(doc);
  assert.ok(headingMatch, `CONTEXT.md must define "${term}" as its own glossary heading (at the start of a line)`);
  const start = headingMatch.index + (headingMatch[1]?.length ?? 0);
  const nextHeadingMatch = /\n\n\*\*[^*]/.exec(doc.slice(start + term.length + 4));
  const end = nextHeadingMatch ? start + term.length + 4 + nextHeadingMatch.index : doc.length;
  return doc.slice(start, end);
}

describe("CONTEXT.md defines Hook Type as a closed vocabulary (issue #201 AC3)", () => {
  it("carries a 'Hook Type' glossary heading, framed as closed (not free text)", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const section = extractGlossaryEntry(doc, "Hook Type");
    assert.match(section, /closed/i, "the Hook Type entry must state the vocabulary is closed");
  });

  it("lists every HOOK_TYPES value with its exact meaning sentence, so the doc cannot drift from the schema seed", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const section = collapseWhitespace(extractGlossaryEntry(doc, "Hook Type"));
    for (const term of HOOK_TYPES) {
      assert.ok(section.includes(`\`${term.value}\``), `CONTEXT.md must list hook_type value "${term.value}"`);
      assert.ok(
        section.includes(term.meaning),
        `CONTEXT.md must state "${term.value}"'s exact meaning: "${term.meaning}"`,
      );
    }
  });
});

describe("CONTEXT.md defines Theme as a closed vocabulary (issue #201 AC3)", () => {
  it("carries a 'Theme' glossary heading, framed as closed (not free text)", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const section = extractGlossaryEntry(doc, "Theme");
    assert.match(section, /closed/i, "the Theme entry must state the vocabulary is closed");
  });

  it("lists every THEMES value with its exact meaning sentence, so the doc cannot drift from the schema seed", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const section = collapseWhitespace(extractGlossaryEntry(doc, "Theme"));
    for (const term of THEMES) {
      assert.ok(section.includes(`\`${term.value}\``), `CONTEXT.md must list theme value "${term.value}"`);
      assert.ok(
        section.includes(term.meaning),
        `CONTEXT.md must state "${term.value}"'s exact meaning: "${term.meaning}"`,
      );
    }
  });
});
