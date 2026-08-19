import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { authorSpecForRecipe, auditAuthoredSpec, DEFAULT_SPEC_AUTHORS } from "./author-at-review.ts";
import { getRecipe, listWiredRecipeSlugs } from "../recipe/registry.ts";
import type { Brief } from "./generate.ts";

const BRIEF: Brief = { id: "idea-01", run: "2026-W33", title: "A brand new headline about real news" };

// A REALISTIC Brief — mirroring the real shape `accept-idea.ts` now builds once it can find and parse
// the Idea's own Brief markdown (issue #273 round 2): real, distinct Talking Points plus real Source(s)
// URLs, exactly like every real straw-motion Brief carries (this ticket's own handoff.md). Used for
// every "happy path" test below in place of the bare, title-only `BRIEF` — proving the DEFAULT authors'
// output against the REAL Brief-building shape, not a synthetic shortcut (QA round 1's own finding).
const REALISTIC_BRIEF: Brief = {
  id: "idea-01",
  run: "2026-W33",
  title: "A brand new headline about real news",
  angle: "A grounded framing paragraph explaining why this story matters right now.",
  talkingPoints: [
    "The company shipped a new capability three weeks after its last release.",
    "Pricing dropped by half for the introductory period, undercutting every rival.",
    "Independent benchmarks show a real jump in the underlying model's accuracy.",
    "Engineering teams now face integration fatigue from the pace of change.",
    "The discount is temporary and doubles back once the promotional window ends.",
    "Analysts say the move is aimed squarely at developers evaluating rival tools.",
  ],
  sourceUrls: ["https://example.com/official-announcement", "https://example.org/independent-coverage"],
};

describe("authorSpecForRecipe — authors a candidate Spec and self-checks it via auditAuthorPhase (ADR-0031, issue #264)", () => {
  it("every wired Recipe has a registered default author", () => {
    for (const slug of listWiredRecipeSlugs()) {
      assert.ok(DEFAULT_SPEC_AUTHORS[slug] !== undefined, `no default author for wired Recipe "${slug}"`);
    }
  });

  it("authors a valid News Carousel Spec that passes its own audit", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    assert.equal(outcome.audit.ok, true);
    assert.equal(recipe.specShape.validate(outcome.spec).ok, true);
  });

  it("authors a valid Character Explainer with Cast Spec that passes its own audit", () => {
    const recipe = getRecipe("character-explainer-with-cast")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(recipe.specShape.validate(outcome.spec).ok, true);
  });

  it("authors a valid News Short Script Spec that passes its own audit", () => {
    const recipe = getRecipe("news-short-script")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    assert.equal(recipe.specShape.validate(outcome.spec).ok, true);
  });

  it("a banned word in the Brief's title fails the audit — ok: false, naming the banned-words check", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, { ...BRIEF, title: "VERBOTEN headline" }, ["VERBOTEN"]);
    assert.equal(outcome.ok, false);
    const bannedItem = outcome.audit.items.find((i) => i.id === "banned-words");
    assert.equal(bannedItem?.ok, false);
  });

  it("a malformed candidate Spec (from an injected broken author) fails the shape check, never throws", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, [], { [recipe.slug]: () => ({}) });
    assert.equal(outcome.ok, false);
    const shapeItem = outcome.audit.items.find((i) => i.id === "spec-shape");
    assert.equal(shapeItem?.ok, false);
  });

  it("an unregistered Recipe slug returns ok: false rather than throwing", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, [], {});
    assert.equal(outcome.ok, false);
  });

  it("the returned Spec is the SAME one the audit checked — never a second, re-derived copy", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    const reaudit = recipe.specShape.validate(outcome.spec);
    assert.equal(reaudit.ok, true);
  });
});

describe("authorSpecForRecipe — widened per-Recipe self-check via auditAuthoredSpec (issue #273)", () => {
  it("news-carousel: the default author's own audit carries the NEW card-style-distinctness item, and it passes", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "card-style-distinctness");
    assert.ok(item, "the widened checklist's card-style-distinctness item must be present");
    assert.equal(item?.ok, true);
  });

  it("news-carousel: the default author's own audit carries the NEW slide-text-variety item, and it passes on a REALISTIC Brief (issue #273 round 2)", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "slide-text-variety");
    assert.ok(item, "the widened checklist's slide-text-variety item must be present");
    assert.equal(item?.ok, true);
  });

  it("news-carousel: an author producing a filler Spec (one card_style repeated on every slide) is REJECTED loudly, not silently persisted", () => {
    const recipe = getRecipe("news-carousel")!;
    const fillerAuthor = (brief: Brief) => ({
      slides: [
        "hook", "then", "shift", "proof", "different", "next", "cta",
      ].map((role, i) => ({
        slide_index: i,
        role,
        card_style: "full_width", // uniform on every slide — the exact issue #273 reproduction
        stat_callout: `Slide ${i + 1}`,
        text: `${brief.title} (${role})`,
        companies: [],
        image_prompt: `A card about "${brief.title}" (${role}).`,
      })),
    });
    const outcome = authorSpecForRecipe(recipe, BRIEF, [], { [recipe.slug]: fillerAuthor });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "card-style-distinctness");
    assert.equal(item?.ok, false);
  });

  it("news-short-script: the default author's own audit runs the FULL Recipe-specific checklist (shot-list-variety present), and it passes", () => {
    const recipe = getRecipe("news-short-script")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    assert.equal(outcome.audit.recipe, "news-short-script");
    const item = outcome.audit.items.find((i) => i.id === "shot-list-variety");
    assert.ok(item, "the FULL news-short-script checklist's shot-list-variety item must be present");
    assert.equal(item?.ok, true);
  });

  it("news-short-script: the default author's own audit carries the NEW no-repeated-phrases item, and it passes on a REALISTIC Brief (issue #273 round 2)", () => {
    const recipe = getRecipe("news-short-script")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "no-repeated-phrases");
    assert.ok(item, "the widened checklist's no-repeated-phrases item must be present");
    assert.equal(item?.ok, true);
  });

  it("news-short-script: an author whose beats all cite the same source host is REJECTED loudly on shot-list-variety", () => {
    const recipe = getRecipe("news-short-script")!;
    const collidingAuthor = (brief: Brief) => ({
      beats: [
        { role: "hook", text: "A short hook line here today.", source_url: "https://example.com/a", show_cue: "show a" },
        { role: "story", text: `${brief.title} unfolds with more detail across many words to fill the count for this story beat properly here.`, source_url: "https://example.com/b", show_cue: "show b" },
        { role: "cta", text: "Follow along for more updates soon please.", source_url: "https://example.com/c", show_cue: "show c" },
      ],
    });
    const outcome = authorSpecForRecipe(recipe, BRIEF, [], { [recipe.slug]: collidingAuthor });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "shot-list-variety");
    assert.equal(item?.ok, false);
  });

  it("character-explainer-with-cast: has no registered refinement — auditAuthoredSpec falls back to the generic auditAuthorPhase unchanged", () => {
    const recipe = getRecipe("character-explainer-with-cast")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    // Only the two generic items exist — no Recipe-specific item was added.
    assert.deepEqual(
      outcome.audit.items.map((i) => i.id).sort(),
      ["banned-words", "spec-shape"],
    );
  });

  it("auditAuthoredSpec is the SAME function authorSpecForRecipe uses internally — calling it directly on the default author's output agrees", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, REALISTIC_BRIEF, []);
    assert.equal(outcome.ok, true, JSON.stringify(!outcome.ok ? outcome.audit.items : null));
    if (!outcome.ok) return;
    const direct = auditAuthoredSpec(recipe, outcome.spec, []);
    assert.deepEqual(direct, outcome.audit);
  });
});

// ---------------------------------------------------------------------------
// issue #273 round 2 (QA round 1's own defect): a title-only Brief — the EXACT shape accept-idea.ts
// built BEFORE this round's fix, and the shape it still falls back to when no Brief markdown can be
// found — must NOT silently author a passing, filler Spec. This is the direct, hand-verifiable proof QA
// asked for: the default generators piped through the widened checklist on a title-only Brief.
// ---------------------------------------------------------------------------

describe("issue #273 round 2: a title-only Brief (no real story content) is REJECTED loudly, not silently authored as filler", () => {
  it("news-carousel: a title-only Brief fails authorship on slide-text-variety — the generator has nothing but the bare headline to repeat", () => {
    const recipe = getRecipe("news-carousel")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, false, "a title-only Brief must not author a passing News Carousel Spec");
    if (outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "slide-text-variety");
    assert.equal(item?.ok, false, "slide-text-variety must be the (or a) failing item");
  });

  it("news-short-script: a title-only Brief fails authorship on no-repeated-phrases — the story beat has nothing real to draw from besides filler padding", () => {
    const recipe = getRecipe("news-short-script")!;
    const outcome = authorSpecForRecipe(recipe, BRIEF, []);
    assert.equal(outcome.ok, false, "a title-only Brief must not author a passing News Short Script Spec");
    if (outcome.ok) return;
    const item = outcome.audit.items.find((i) => i.id === "no-repeated-phrases");
    assert.equal(item?.ok, false, "no-repeated-phrases must be the (or a) failing item");
  });
});
