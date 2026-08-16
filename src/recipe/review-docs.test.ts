/**
 * `/review-ideas` Recipe-offering: prompt-conformance tests (issue #54 AC3/AC4; the enqueue call
 * updated for issue #56's Recipe-aware queue).
 *
 * `/review-ideas` is a prompt-driven command (`.claude/commands/review-ideas.md`) — there is no
 * compiled TS runtime for its conversational behavior to unit-test directly. These assertions pin the
 * SOURCE TEXT of that prompt so the Recipe-offering requirements this slice adds are provable by
 * `npm test`, not just by hand-reading the doc. Deliberately kept as a REGULAR `.test.ts` (not
 * `*.docs-test.ts`), mirroring `src/format/format-docs.test.ts`'s own stated rationale: this behavior
 * (pre-fill from the Format, offer only wired Recipes, log declined Recipes verbatim) IS a core
 * acceptance criterion of this slice, not incidental documentation conformance.
 *
 * No Magnific Space involved — this is a plain markdown-file read.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

async function readReviewIdeasDoc(): Promise<string> {
  return readFile(join(REPO_ROOT, ".claude", "commands", "review-ideas.md"), "utf8");
}

describe("/review-ideas pre-fills Recipes from the Idea's Format default_recipes (issue #54 AC3)", () => {
  it("loads the Idea's Format and reads default_recipes to pre-fill the offer", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /loadFormat\(brand, idea\.format\)/);
    assert.match(doc, /default_recipes/);
    assert.match(doc, /src\/format\/store\.ts/);
  });

  it("never fabricates a Format when the Idea has none recorded", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /no `format` recorded.*never fabricate/is);
  });

  it("lets the Operator trim/extend the pre-filled Recipes conversationally", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /trim\/extend conversationally/i);
    assert.match(doc, /may drop some, keep all, or ask to add another Recipe/i);
  });
});

describe("/review-ideas offers only WIRED Recipes — an unwired Recipe is never offered (issue #54 AC4)", () => {
  it("filters the Format's default_recipes to wired-only via offeredRecipes/isWiredRecipe", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /offeredRecipes\(format\.defaultRecipes\)/);
    assert.match(doc, /isWiredRecipe/);
    assert.match(doc, /src\/recipe\/offer\.ts/);
    assert.match(doc, /src\/recipe\/registry\.ts/);
  });

  it("states a Format default that is not wired is never offered, no matter what the file says", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /never offered.*no matter what the Format file says/is);
  });

  it("refuses to add an unwired Recipe even on the Operator's explicit request", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /not wired.*do \*\*not\*\* add it/is);
    assert.match(doc, /even on\s*\n?\s*explicit request/i);
  });

  it("the guardrails restate that only wired Recipes are ever offered", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /\*\*Only wired Recipes are ever offered\.\*\*/);
  });
});

describe("/review-ideas logs declined Recipes verbatim, mirroring Rejection Reasons (issue #54 AC3)", () => {
  it("captures a free-text reason for each declined Recipe and logs it verbatim", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /each entry in `declined`.*capture a free-text reason/is);
    assert.match(doc, /log it \*\*verbatim\*\*/);
  });

  it("states declined-Recipe feedback is logged only in v1 — never auto-applied", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /logged\s*\n?\s*only, v1 does not auto-apply it to future suggestions/i);
  });

  it("writes the selection via writeIdeaRecipeSelection", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /writeIdeaRecipeSelection\(ideaId, chosen, declinedWithReasons/);
    assert.match(doc, /src\/ledger\/ledger\.ts/);
  });
});

describe("/review-ideas enqueues the chosen Recipe set (issue #56 — Recipe-aware queue)", () => {
  it("passes `chosen` (the resolved Recipe selection) as an explicit argument to enqueueOnAccept", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /enqueueOnAccept\(ideaId, brand, chosen, \{ ledgerPath: resolveBrand\(brand\)\.ledger \}\)/);
    assert.match(doc, /chosen.*is what makes the queue Recipe-aware/is);
  });

  it("states one job is enqueued PER chosen Recipe, keyed on the composite (brand, idea, recipe)", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /ONE job PER chosen\s*\n?\s*Recipe/i);
    assert.match(doc, /\(brand, idea, recipe\)/);
    assert.match(doc, /never dropped as a duplicate/i);
  });

  it("only skips auto-enqueue when the Operator chose zero Recipes (a brand-new state, not a regression)", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /If `chosen` is\s*\n?\s*\*\*empty\*\*/);
    assert.match(doc, /do \*\*not\*\* enqueue/);
  });
});
