import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRecipe } from "../recipe/registry.ts";

/**
 * Documentation-conformance suite. Proves the content `producer` agent definition exists, is model
 * Opus, and describes its role per CLAUDE.md / CONTEXT.md (acceptance criterion: "A producer agent
 * definition exists (Opus)").
 *
 * These assertions read the `producer.md` agent doc and pin its current front-matter/wording, so they
 * are kept OUT of the unit suite: the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts". Run with `npm run test:docs`. Editing the agent doc must never break `npm test`.
 *
 * The repo root is two levels up from src/production-spec/.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRODUCER_AGENT = join(REPO_ROOT, ".claude", "agents", "producer.md");

describe("producer agent definition", () => {
  it("exists and is readable", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares model opus in the front-matter", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /^model:\s*opus\s*$/m);
    assert.match(text, /^name:\s*producer\s*$/m);
  });

  it("describes generating a Production Spec and generate-never-publish", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /Production Spec/);
    assert.match(text, /never publish/i);
    // It must describe driving the Magnific Space and the Cast gate (its role per CONTEXT.md).
    assert.match(text, /Magnific/);
    assert.match(text, /Cast/);
  });

  it("is honest that production is attended and wired end-to-end today (ADR-0008), not just Spec composition", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    // Before the attended producer was restored (PR #46), this doc had to flag full production as the
    // TARGET design, not what ran today (audit finding C2, "not yet wired"). That gap is closed: the
    // whole flow — Spec, Cast, pick, render, Copy — runs attended in the Operator's own session. Pinning
    // the OLD "not yet wired" disclaimer here would now itself be a false claim — assert its ABSENCE.
    assert.doesNotMatch(
      text,
      /not yet (runnable|wired|operational|built)/i,
      "producer.md must NOT claim production is not yet wired — it is attended and wired today (ADR-0008)",
    );
    // It must name the attended runtime explicitly (ADR-0008) rather than staying silent about it.
    assert.match(text, /ADR-0008/, "producer.md must cite ADR-0008 for the attended-runtime decision");
    assert.match(
      text,
      /attended|Operator's session/i,
      "producer.md must state it runs attended, in the Operator's own session",
    );
    // The queue-job schema it documents must match the CURRENT generic gate/Recipe cursor (issue #56/57)
    // — not the retired fixed cast/render phase split. A real, checkable pin against production code.
    assert.match(text, /`recipe`/, "producer.md must describe the queue job's `recipe` field");
    assert.match(
      text,
      /awaiting_pick/,
      "producer.md must describe the CURRENT `awaiting_pick` queue status",
    );
    assert.doesNotMatch(
      text,
      /awaiting_cast/,
      "producer.md must not describe the retired `awaiting_cast` queue status",
    );
  });
});

describe("producer.md is a thin, recipe-generic conductor — no recipe-specific procedure (issue #88)", () => {
  it("resolves every Recipe-specific fact from the in-repo registry, never hard-coding one Recipe's shape", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /src\/recipe\/registry\.ts/);
    assert.match(text, /getRecipe\(job\.recipe\)/);
    assert.match(text, /thin,\s*\n?\s*recipe-generic conductor/i);
  });

  it("never reads production.space_id from a Brand Profile any more (issue #88 AC)", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.doesNotMatch(
      text,
      /production\.space_id/,
      "producer.md must not read/instruct reading production.space_id — the canvas id comes from the Recipe",
    );
    assert.match(text, /never read any Brand Profile field for it/i);
  });

  it("runs the Recipe's own producer Skill BY SLUG (ADR-0018) — never authoring prompts itself", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /produce-character-explainer/);
    assert.match(text, /produce-news-carousel/);
    assert.match(text, /Skill tool/);
  });

  it("resolves the Idea's Format from the ledger record, STOPping when it is absent (issue #88)", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /resolveIdeaFormat/);
    assert.match(text, /src\/producer\/resolve-format\.ts/);
    assert.match(text, /never guess or default a Format/i);
  });

  it("binds media slots via bindMediaSlots and STOPs on a missing required asset (ADR-0016)", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /bindMediaSlots/);
    assert.match(text, /src\/producer\/bind-media\.ts/);
    assert.match(text, /STOPS the whole run/i);
    assert.match(text, /ADR-0016/);
  });

  it("self-audits each phase against its #85 Phase Contract before advancing", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /auditAuthorPhase/);
    assert.match(text, /auditBindMediaPhase/);
    assert.match(text, /auditCopyPhase/);
    assert.match(text, /ADR-0017/);
  });

  it("drives ANY Recipe's canvas via the SAME generic driveToNextGate — pausing only at ITS declared gates", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /driveToNextGate/);
    assert.match(text, /Recipe\.gates/);
    assert.match(text, /gateless Recipe/i);
  });

  it("never hard-codes the wired Recipe's own canvas node names (e.g. 'Character Variants Generator')", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.doesNotMatch(text, /Character Variants Generator/);
    assert.doesNotMatch(text, /Selected Character/);
  });

  it("never hard-codes the News Carousel Recipe's own canvas node names either — pinned against the registry's REAL values (issue #89 Round 2 regression guard)", async () => {
    // #89 aligned the News Carousel Recipe's canvas node names to the live "Carrousel" capture
    // (issue #86): its real promptNode is "JSON Master" and its real brand-asset media slot/canvas
    // node is "Brand_Logo" — replacing the placeholders "Slides Prompts"/"Brand Logo", which named no
    // real canvas node at all. A stale citation of the OLD placeholder slipped into this very doc
    // during #88 (before #86's capture existed) and went uncaught because nothing reads this prose at
    // production time (the driver reads the live registry, never this doc) — the same doc-drift class
    // as the #88 Round-1 watermark regression this file already guards above.
    //
    // These values are read from the LIVE registry (`getRecipe`), never copied as a frozen literal:
    // if the registry's own values ever change again, the `assert.equal`/`assert.deepEqual` calls
    // below fail FIRST and loudly, so this guard's own premise can never itself go silently stale.
    const carousel = getRecipe("news-carousel")!;
    assert.equal(carousel.canvasInputs.promptNode, "JSON Master");
    assert.deepEqual(Object.keys(carousel.canvasInputs.mediaSlots), ["Brand_Logo"]);

    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.doesNotMatch(
      text,
      /Slides Prompts/,
      'producer.md must not cite "Slides Prompts" — retired (issue #86/#89); the News Carousel ' +
        `Recipe's real promptNode is "${carousel.canvasInputs.promptNode}" (src/recipe/registry.ts)`,
    );
    assert.doesNotMatch(
      text,
      /"Brand Logo"/,
      'producer.md must not cite "Brand Logo" — retired (issue #86/#89); the News Carousel Recipe\'s ' +
        `real canvas node is "${Object.keys(carousel.canvasInputs.mediaSlots)[0]}" (src/recipe/registry.ts)`,
    );
  });
});

describe("producer.md restores the watermark-@handle step, generically (QA-1, issue #88 Round 1 regression guard)", () => {
  // QA-1 (Round 1): the rewritten producer.md silently dropped the watermark-@handle step the
  // pre-#88 doc explicitly instructed (Phase B step 1: replace_text on "Watermark instructions",
  // setting production.watermark_handle) — a real, still-live step (the captured live Producer
  // Protocol, src/space-driver/fixtures/live-captures/02-spaces_get_nodes.keynodes.txt, contains
  // exactly this replace_text/@handle step). These assertions pin its restoration so it can never
  // silently disappear again.
  it("mentions the watermark step at all (the Round-1 regression: zero hits)", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /watermark/i, "producer.md must describe the watermark-handle step (QA-1)");
  });

  it("declares it as a GENERIC, Recipe-declared step — never hard-coded to one Recipe", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /watermarkNode/);
    assert.match(text, /Recipe\.space\.nodes\.watermarkNode/);
    assert.match(text, /generic/i);
  });

  it("names the exact driver primitive and Brand Profile reader that implement it", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /setWatermarkHandle/);
    assert.match(text, /src\/space-driver\/driver\.ts/);
    assert.match(text, /loadWatermarkHandle/);
    assert.match(text, /src\/production-spec\/brand-profile\.ts/);
  });

  it("skips cleanly when the Brand's handle is blank — never fails the run over an unset optional field", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /blank/i);
    assert.match(text, /skip/i);
  });

  it("states the watermark @handle is NOT part of the Asset's Copy (ADR-0012)", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /NOT (part of the Asset's Copy|Copy)/);
    assert.match(text, /ADR-0012/);
  });
});
