/**
 * Documentation-conformance suite for issue #247 (QA Round-1 defect 1).
 *
 * #247 rewrote 8 `.claude/commands/*.md` files so each names the specific `src/command-surface/`
 * function that is the sanctioned future target for the write/read it describes, wherever a real
 * command-surface command exists for that operation (Trends, Ideas, Jobs, Assets, Posts, Performance,
 * gates — Option A, issue #211). QA's Round-1 Verdict passed the slice but flagged, correctly, that
 * NOTHING in the automated suite pinned any of these ~15 new citations: a future edit could silently
 * revert any one of them back to a bare `data/brands/<slug>/...` path and every existing test would
 * stay green (QA's own repro: hand-revert `run-trends.md`'s `createTrend`/`createIdea` sentence and
 * `npm test`/`npm run test:docs` both still pass).
 *
 * This suite closes that gap, following the shape `src/claude-agents/tool-boundary.docs-test.ts`
 * (#246) already established: one `describe` per file, a positive assertion that the command name AND
 * its module both appear, and a "revert guard" — a `doesNotMatch` against the EXACT raw-path text the
 * citation replaced.
 *
 * **The revert guards are verified non-vacuous, not merely written to look right.** #246's own Round 2
 * shipped a `doesNotMatch` that could never have matched its own target (the text it was guarding
 * against wrapped across a blockquote marker, so the "old" shape the regex described never existed as
 * a contiguous string in the file). Every negative pattern below was checked, before being written
 * here, against the REAL pre-#247 text of each file (`git show 4d023e9:.claude/commands/<file>.md`) —
 * confirmed to MATCH that old text (so a revert is genuinely caught) and NOT match the current text (so
 * the guard is not already tripping on the fixed prose). Every read in this file runs through
 * `collapseWhitespace` for the same reason `src/db/adr.docs-test.ts` does: a literal multi-word
 * substring check must survive this repo's own prose line-wrapping, never fail (or silently pass) on a
 * wrap boundary that has nothing to do with the claim being pinned.
 *
 * Deliberately anchors on command names and path shapes (`createTrend`, `src/command-surface/gates.ts`,
 * `data/brands/<slug>/ledger.json`) — never on the surrounding free prose, which is expected to keep
 * being rewritten for clarity over time without this suite rotting (the Operator's own documented
 * caution for this round).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const COMMANDS_DIR = join(REPO_ROOT, ".claude", "commands");

/** Collapses whitespace runs (including a markdown hard line-wrap mid-sentence) to a single space, so
 *  a literal multi-word substring check survives this repo's ~100-column prose wrapping — the same
 *  helper `src/db/adr.docs-test.ts` uses, for the same reason. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Reads a `.claude/commands/<file>` with whitespace collapsed. */
async function readCommand(file: string): Promise<string> {
  return collapseWhitespace(await readFile(join(COMMANDS_DIR, file), "utf8"));
}

describe("run-trends.md names createTrend and createIdea (issue #247 QA defect 1)", () => {
  it("names createTrend (src/command-surface/trends.ts) for the trends.json write", async () => {
    const doc = await readCommand("run-trends.md");
    assert.match(doc, /createTrend/, "must name command-surface's createTrend");
    assert.match(doc, /src\/command-surface\/trends\.ts/, "must cite trends.ts as createTrend's module");
  });

  it("names createIdea (src/command-surface/ideas.ts) for the ledger-append write", async () => {
    const doc = await readCommand("run-trends.md");
    assert.match(doc, /createIdea/, "must name command-surface's createIdea");
    assert.match(doc, /src\/command-surface\/ideas\.ts/, "must cite ideas.ts as createIdea's module");
  });

  it("never reverts to the bare data/brands/<slug>/ paths these two citations replaced", async () => {
    const doc = await readCommand("run-trends.md");
    assert.doesNotMatch(
      doc,
      /data\/brands\/<slug>\/ideas\/<format>\/<run>\/trends\.json/,
      "must not revert to the raw trends.json path this slice replaced with createTrend",
    );
    assert.doesNotMatch(
      doc,
      /data\/brands\/<slug>\/ledger\.json/,
      "must not revert to the raw ledger path this slice replaced with createIdea",
    );
  });
});

describe("review-ideas.md names recordReviewDecision for both the accept and reject writes (issue #247 QA defect 1)", () => {
  it("names recordReviewDecision at the accept site (step 5.6)", async () => {
    const doc = await readCommand("review-ideas.md");
    assert.match(
      doc,
      /status: accepted.{0,150}recordReviewDecision/s,
      "the accept write must be followed by a recordReviewDecision citation",
    );
  });

  it("names recordReviewDecision at the reject site (step 6)", async () => {
    const doc = await readCommand("review-ideas.md");
    assert.match(
      doc,
      /status: rejected.{0,150}recordReviewDecision/s,
      "the reject write must be followed by a recordReviewDecision citation",
    );
  });

  it("cites src/command-surface/ideas.ts as recordReviewDecision's module", async () => {
    const doc = await readCommand("review-ideas.md");
    assert.match(doc, /src\/command-surface\/ideas\.ts/);
  });

  it("never reverts either write to a bare 'status: ... in data/brands/<slug>/ledger.json' shape", async () => {
    const doc = await readCommand("review-ideas.md");
    assert.doesNotMatch(
      doc,
      /status: accepted.{0,5}in.{0,5}data\/brands\/<slug>\/ledger\.json/,
      "must not revert the accept write to the raw ledger-path shape",
    );
    assert.doesNotMatch(
      doc,
      /status: rejected.{0,5}in.{0,5}data\/brands\/<slug>\/ledger\.json/,
      "must not revert the reject write to the raw ledger-path shape",
    );
  });
});

describe("pick.md and pick-cast.md name resolveGate for their pick-resolution writes (issue #247 QA defect 1)", () => {
  it("pick.md names resolveGate (src/command-surface/gates.ts)", async () => {
    const doc = await readCommand("pick.md");
    assert.match(doc, /resolveGate/, "must name command-surface's resolveGate");
    assert.match(doc, /src\/command-surface\/gates\.ts/, "must cite gates.ts as resolveGate's module");
  });

  it("pick.md never reverts its Guardrails ledger mention to the bare data/brands/<slug>/ledger.json path", async () => {
    const doc = await readCommand("pick.md");
    assert.doesNotMatch(
      doc,
      /Brand's ledger\s*\(`data\/brands\/<slug>\/ledger\.json`\)/,
      "must not revert to the raw ledger-path parenthetical this slice replaced",
    );
  });

  it("pick-cast.md names resolveGate (src/command-surface/gates.ts)", async () => {
    const doc = await readCommand("pick-cast.md");
    assert.match(doc, /resolveGate/, "must name command-surface's resolveGate");
    assert.match(doc, /src\/command-surface\/gates\.ts/, "must cite gates.ts as resolveGate's module");
  });

  it("pick-cast.md never reverts either ledger mention to a bare data/brands/<slug>/ledger.json path", async () => {
    const doc = await readCommand("pick-cast.md");
    assert.doesNotMatch(
      doc,
      /Brand resolver \(`data\/brands\/<slug>\/ledger\.json`\)/,
      "must not revert the Brand-resolver mention to the raw ledger path",
    );
    assert.doesNotMatch(
      doc,
      /Brand's ledger \(`data\/brands\/<slug>\/ledger\.json`\) is the source of truth/,
      "must not revert the Guardrails ledger mention to the raw path",
    );
  });
});

describe("log-post.md names logPost (Posts) and getAssetByRecipe (Assets) (issue #247 QA defects 1 and 2)", () => {
  it("names logPost (src/command-surface/posts.ts) for the post_url write", async () => {
    const doc = await readCommand("log-post.md");
    assert.match(doc, /logPost/, "must name command-surface's logPost");
    assert.match(doc, /src\/command-surface\/posts\.ts/, "must cite posts.ts as logPost's module");
  });

  it("names getAssetByRecipe (src/command-surface/assets.ts) for the Asset lookup (QA defect 2 fix)", async () => {
    const doc = await readCommand("log-post.md");
    assert.match(doc, /getAssetByRecipe/, "must name command-surface's getAssetByRecipe for the recipe-keyed Asset lookup");
    assert.match(
      doc,
      /src\/command-surface\/assets\.ts/,
      "must cite assets.ts as getAssetByRecipe's module",
    );
  });

  it("never reverts the Gate-3 write to the bare data/brands/<slug>/ledger.json path", async () => {
    const doc = await readCommand("log-post.md");
    assert.doesNotMatch(
      doc,
      /Asset in `data\/brands\/<slug>\/ledger\.json` via/,
      "must not revert to the raw ledger-path shape this slice replaced with logPost/AssetStore.writeAsset",
    );
  });
});

describe("track-performance.md names recordPerformanceSnapshot/recordPerformanceScore (issue #247 QA defect 1)", () => {
  it("names both Performance functions and their module", async () => {
    const doc = await readCommand("track-performance.md");
    assert.match(doc, /recordPerformanceSnapshot/, "must name command-surface's recordPerformanceSnapshot");
    assert.match(doc, /recordPerformanceScore/, "must name command-surface's recordPerformanceScore");
    assert.match(
      doc,
      /src\/command-surface\/performance\.ts/,
      "must cite performance.ts as their module",
    );
  });

  it("never reverts the metrics write to the bare AssetStore.writeAsset-in-data/brands/ shape", async () => {
    const doc = await readCommand("track-performance.md");
    assert.doesNotMatch(
      doc,
      /`AssetStore\.writeAsset` in `data\/brands\/<slug>\/ledger\.json`/,
      "must not revert to the raw ledger-path shape this slice replaced",
    );
  });
});

describe("export-schedule.md names saveAsset for the scheduled_at stamp (issue #247 QA defect 1)", () => {
  it("names saveAsset (src/command-surface/assets.ts)", async () => {
    const doc = await readCommand("export-schedule.md");
    assert.match(doc, /saveAsset/, "must name command-surface's saveAsset");
    assert.match(doc, /src\/command-surface\/assets\.ts/, "must cite assets.ts as saveAsset's module");
  });

  it("never reverts the Idea-load step to the bare data/brands/<slug>/ledger.json path", async () => {
    const doc = await readCommand("export-schedule.md");
    assert.doesNotMatch(
      doc,
      /Loads.{0,10}every Idea in `<format>`'s `<run>` from `data\/brands\/<slug>\/ledger\.json`/,
      "must not revert to the raw ledger-path shape this slice replaced",
    );
  });
});

describe("queue.md names enqueueJob/claimJob/releaseJob as the SQL job table's own operations (issue #247 QA defect 1)", () => {
  it("names all three Jobs functions and their module", async () => {
    const doc = await readCommand("queue.md");
    assert.match(doc, /enqueueJob/, "must name command-surface's enqueueJob");
    assert.match(doc, /claimJob/, "must name command-surface's claimJob");
    assert.match(doc, /releaseJob/, "must name command-surface's releaseJob");
    assert.match(doc, /src\/command-surface\/jobs\.ts/, "must cite jobs.ts as their module");
  });

  it("never reverts the Guardrails ledger mention to the bare data/brands/<slug>/ledger.json path", async () => {
    const doc = await readCommand("queue.md");
    assert.doesNotMatch(
      doc,
      /Each Brand's ledger \(`data\/brands\/<slug>\/ledger\.json`\) stays the source of truth/,
      "must not revert to the raw ledger-path shape this slice replaced",
    );
  });
});
