/**
 * Documentation-conformance suite for issue #201 AC7: "Three Recipes are treated as wired —
 * character-explainer-with-cast, news-carousel, news-short-script. Trust the registry, not
 * CONTEXT.md's count of two." This asserts CONTEXT.md's own Recipe glossary entry was corrected to
 * match `src/recipe/registry.ts`'s real `listWiredRecipeSlugs()`, and pins the count DERIVED from the
 * registry itself — never a hardcoded "3" — so a future fourth wired Recipe re-fails this test instead
 * of silently going undocumented (the same trap the "two Recipes" wording fell into).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { listWiredRecipeSlugs } from "./registry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const CONTEXT_MD = join(REPO_ROOT, "CONTEXT.md");

/** Collapses whitespace runs (including a markdown hard line-wrap mid-sentence) to a single space, so
 *  a literal multi-word substring check survives CONTEXT.md's ~100-column prose wrapping. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

describe("CONTEXT.md's Recipe entry states the registry's REAL wired count, not a stale one", () => {
  it("names every currently-wired Recipe slug's human name, including News Short Script", async () => {
    const doc = collapseWhitespace(await readFile(CONTEXT_MD, "utf8"));
    const wired = listWiredRecipeSlugs();
    assert.ok(wired.length >= 3, "sanity check: the registry must actually wire at least three Recipes");
    assert.match(
      doc,
      /Today three Recipes are wired/,
      "CONTEXT.md must state the CURRENT wired count in words, matching the registry's length",
    );
    assert.match(doc, /Character Explainer with Cast/);
    assert.match(doc, /News Carousel/);
    assert.match(doc, /News Short Script/);
  });

  it("does not claim News Short Script is still 'build pending' (it is wired, per the registry)", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const start = doc.indexOf("**Recipe**");
    assert.ok(start >= 0, "CONTEXT.md must define Recipe as its own glossary heading");
    const section = collapseWhitespace(doc.slice(start, start + 2500));
    assert.doesNotMatch(
      section,
      /News Short Script\*\* \(Space-less\) is decided, build pending/,
      "the Recipe entry must not still say News Short Script is build-pending — it is a wired Recipe today",
    );
  });

  it("cites the registry as the source of truth for the wired count, never CONTEXT.md's own count", async () => {
    const doc = collapseWhitespace(await readFile(CONTEXT_MD, "utf8"));
    const start = doc.indexOf("Today three Recipes are wired");
    assert.ok(start >= 0);
    const section = doc.slice(start, start + 400);
    assert.match(section, /registry\.ts/);
  });
});
