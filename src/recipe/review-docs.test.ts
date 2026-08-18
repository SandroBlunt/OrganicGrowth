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

  it("writes the selection via writeIdeaRecipeSelection, through the compiled accept-idea command", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /writes the Recipe selection onto the Brand's ledger \(`writeIdeaRecipeSelection`/);
    assert.match(doc, /src\/ledger\/ledger\.ts/);
  });
});

describe("/review-ideas performs the accept mutation via the COMPILED accept-idea command (issue #254 Round 3, Defect B)", () => {
  it("instructs running `npm run accept-idea` instead of calling writeIdeaRecipeSelection/enqueueOnAccept directly", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /never\s*\n?\s*write the ledger or call `writeIdeaRecipeSelection`\/`enqueueOnAccept` yourself/);
    assert.match(doc, /npm run accept-idea -- <brand> <ideaId> "<chosen-csv>" '<declined-json>'/);
    assert.match(doc, /src\/commands\/accept-idea\.ts/);
    assert.match(doc, /acceptIdeaCommand/);
  });

  it("sets the Idea's status to accepted via markIdeaAccepted — the first compiled writer of this field", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /sets the Idea's status: accepted.*`markIdeaAccepted`/s);
    assert.match(doc, /FIRST compiled writer of this field/);
  });

  it("states one job is enqueued PER chosen Recipe, keyed on the composite (brand, idea, recipe)", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /ONE\s*\n?\s*job PER chosen\s*\n?\s*Recipe/i);
    assert.match(doc, /\(brand, idea, recipe\)/);
    assert.match(doc, /never dropped as a duplicate/i);
  });

  it("states the compiled command opens + migrates data/organicgrowth.db BY DEFAULT — no separate 'also pass db' step to remember", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /opens \+ migrates\s*\n?\s*`data\/organicgrowth\.db` \*\*BY DEFAULT\*\*/);
    assert.match(doc, /no separate "also pass\s*\n?\s*`db`" step to remember/);
    assert.match(doc, /the SQL sync always runs/);
  });

  it("states the Operator's chosen Recipes become visible to /run-worker via the SQL job table", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /the SQL `job` table the unattended worker's\s*\n?\s*`\/run-worker` actually reads/);
  });

  it("instructs relaying the command's own output verbatim — a SQL failure is reported plainly, never silently swallowed or retried", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /Relay the command's own printed output to the Operator VERBATIM/);
    assert.match(doc, /never silently swallow this, never re-run the command/);
  });

  it("only skips auto-enqueue when the Operator chose zero Recipes (a brand-new state, not a regression)", async () => {
    const doc = await readReviewIdeasDoc();
    assert.match(doc, /If `chosen` was\s*\n?\s*\*\*empty\*\*/);
    assert.match(doc, /accepted but not yet queued/i);
  });
});
