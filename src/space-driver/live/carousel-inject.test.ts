import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "../port.ts";
import type { SpaceStateLike } from "../../execution-protocol/parse.ts";
import { injectGoal, JSON_MASTER_NODE_NAME, type PollOptions } from "../driver.ts";
import { FakeSpace } from "../fixtures/fake-space.ts";
import {
  validCarouselSpec,
  largeCarouselSpec,
  oversizedSlideCarouselSpec,
} from "../../production-spec/fixtures/news-carousel-specs.ts";
import {
  extractSlideFromGoal,
  injectLargeCarouselSpec,
  planCarouselInject,
  skeletonGoal,
  slideReplaceGoal,
} from "./carousel-inject.ts";
import { SPACES_EDIT_WRITE_LIMIT_CHARS } from "./write-limit.ts";

const FAST: PollOptions = { sleep: async () => {} };
const NODE = JSON_MASTER_NODE_NAME;

describe("planCarouselInject — a Spec that already fits in one write plans a single goal", () => {
  it("plans exactly the same single goal injectGoal() itself would build", () => {
    const spec = validCarouselSpec();
    const planned = planCarouselInject(spec, NODE);
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.deepEqual(planned.plan.goals, [injectGoal(spec, NODE)]);
  });
});

describe("planCarouselInject — a ~17 KB Spec is chunked into one skeleton + one goal per slide", () => {
  it("every planned goal is at/under the modelled write limit", () => {
    const spec = largeCarouselSpec();
    const planned = planCarouselInject(spec, NODE);
    assert.equal(planned.ok, true);
    if (!planned.ok) return;

    // 1 skeleton goal + 7 per-slide goals.
    assert.equal(planned.plan.goals.length, 8);
    for (const goal of planned.plan.goals) {
      assert.ok(
        goal.length <= SPACES_EDIT_WRITE_LIMIT_CHARS,
        `goal is ${goal.length} chars, over the ${SPACES_EDIT_WRITE_LIMIT_CHARS}-char limit`,
      );
    }
  });

  it("the skeleton goal establishes a 7-element placeholder slides array", () => {
    const spec = largeCarouselSpec();
    const planned = planCarouselInject(spec, NODE);
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.equal(planned.plan.goals[0], skeletonGoal(NODE, 7));
  });

  it("reassembling every per-slide goal's embedded JSON reproduces the ORIGINAL slides array exactly — no data lost", () => {
    const spec = largeCarouselSpec();
    const originalSlides = (spec as { slides: unknown[] }).slides;
    const planned = planCarouselInject(spec, NODE);
    assert.equal(planned.ok, true);
    if (!planned.ok) return;

    const perSlideGoals = planned.plan.goals.slice(1); // drop the skeleton goal
    assert.equal(perSlideGoals.length, originalSlides.length);
    const reassembled = perSlideGoals.map((g) => extractSlideFromGoal(g));
    assert.deepEqual(reassembled, originalSlides);
  });

  it("each per-slide goal names its own slide index and the target node, and embeds ONLY that slide", () => {
    const spec = largeCarouselSpec();
    const slides = (spec as { slides: { slide_index: number }[] }).slides;
    const planned = planCarouselInject(spec, NODE);
    assert.equal(planned.ok, true);
    if (!planned.ok) return;

    for (let i = 0; i < slides.length; i++) {
      const goal: string = planned.plan.goals[i + 1]!;
      assert.equal(goal, slideReplaceGoal(slides[i], i, NODE));
      assert.match(goal, new RegExp(`slides\\[${i}\\]`));
      assert.match(goal, new RegExp(NODE));
    }
  });
});

describe("planCarouselInject — fails clearly BEFORE issuing any edit when it cannot chunk within the limit", () => {
  it("fails when a single slide's own surgical goal alone exceeds the limit", () => {
    const spec = oversizedSlideCarouselSpec();
    const planned = planCarouselInject(spec, NODE);
    assert.equal(planned.ok, false);
    if (planned.ok) return;
    assert.equal(planned.error.code, "carousel_chunk_too_large");
    assert.match(planned.error.message, /slides\[4\]/);
    assert.match(planned.error.message, new RegExp(String(SPACES_EDIT_WRITE_LIMIT_CHARS)));
  });

  it("fails when the oversized Spec has no slides array to chunk by at all", () => {
    const hugeFlatSpec = { not_slides: "x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS + 500) };
    const planned = planCarouselInject(hugeFlatSpec, NODE);
    assert.equal(planned.ok, false);
    if (planned.ok) return;
    assert.equal(planned.error.code, "carousel_chunk_too_large");
    assert.match(planned.error.message, /slides/);
  });
});

describe("injectLargeCarouselSpec — a Spec that fits in one write behaves exactly like the existing injectSpec", () => {
  it("issues exactly ONE edit, unchanged from today's single-shot inject", async () => {
    const space = new FakeSpace();
    const spec = validCarouselSpec();
    const result = await injectLargeCarouselSpec(space, spec, NODE, FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(space.editGoals.length, 1);
    assert.equal(space.editGoals[0], injectGoal(spec, NODE));
  });
});

describe("injectLargeCarouselSpec — a ~17 KB Spec reaches the canvas intact via chunked, within-limit writes", () => {
  it("issues exactly 8 edits (1 skeleton + 7 slides), every single one within the modelled limit", async () => {
    const space = new FakeSpace();
    const spec = largeCarouselSpec();
    const result = await injectLargeCarouselSpec(space, spec, NODE, FAST);
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.error));
    assert.equal(space.editGoals.length, 8);
    for (const goal of space.editGoals) {
      assert.ok(goal.length <= SPACES_EDIT_WRITE_LIMIT_CHARS);
    }
  });

  it("no single edit ever embeds the FULL spec — the whole-spec single-shot goal would have been over the limit", async () => {
    const space = new FakeSpace();
    const spec = largeCarouselSpec();
    const wholeSpecGoal = injectGoal(spec, NODE);
    assert.ok(wholeSpecGoal.length > SPACES_EDIT_WRITE_LIMIT_CHARS, "fixture sanity: this Spec IS too big for one write");

    await injectLargeCarouselSpec(space, spec, NODE, FAST);
    for (const goal of space.editGoals) {
      assert.notEqual(goal, wholeSpecGoal);
    }
  });

  it("reassembling the issued per-slide edits reproduces the original slides exactly (round-trips through the port)", async () => {
    const space = new FakeSpace();
    const spec = largeCarouselSpec();
    const originalSlides = (spec as { slides: unknown[] }).slides;
    await injectLargeCarouselSpec(space, spec, NODE, FAST);
    const reassembled = space.editGoals.slice(1).map((g) => extractSlideFromGoal(g));
    assert.deepEqual(reassembled, originalSlides);
  });

  it("confirms the node's text changed after the full chunked sequence (readback confirm)", async () => {
    const space = new FakeSpace();
    const result = await injectLargeCarouselSpec(space, largeCarouselSpec(), NODE, FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(typeof result.text, "string");
    assert.ok(result.text.length > 0);
  });
});

describe("injectLargeCarouselSpec — refuses to attempt any edit when the plan itself cannot fit the limit", () => {
  it("issues ZERO edits when a single slide alone cannot fit (the write limit is checked FIRST)", async () => {
    const space = new FakeSpace();
    const result = await injectLargeCarouselSpec(space, oversizedSlideCarouselSpec(), NODE, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "carousel_chunk_too_large");
    assert.equal(space.editGoals.length, 0, "no edit may be attempted once planning has already failed");
  });
});

/** A `SpaceMcpPort` stub whose edit() fails starting at the Nth call (1-based) — proves the chunked
 *  executor stops immediately on the first failure, never continuing past it. */
class FailingAtNthEditSpace implements SpaceMcpPort {
  public editGoals: string[] = [];
  private editCount = 0;
  constructor(private readonly failAt: number) {}

  async readState(): Promise<SpaceStateLike> {
    return { nodes: [{ id: "n1", name: NODE, value: "placeholder" }] };
  }
  async edit(goal: string): Promise<{ readonly editId: string }> {
    this.editGoals.push(goal);
    this.editCount++;
    return { editId: `edit-${this.editCount}` };
  }
  async editStatus(editId: string): Promise<EditStatus> {
    const n = Number(editId.split("-")[1]);
    return n === this.failAt ? { phase: "failed", error: "simulated mid-sequence failure" } : { phase: "succeeded" };
  }
  async run(): Promise<{ readonly runId: string }> {
    return { runId: "run-1" };
  }
  async runStatus(): Promise<RunStatus> {
    return { phase: "succeeded", firedNodeNames: [], creationIds: [] };
  }
  async fetchCreations(): Promise<readonly Creation[]> {
    return [];
  }
  async verifyPinned(): Promise<boolean> {
    return false;
  }
}

describe("injectLargeCarouselSpec — a mid-sequence edit failure stops immediately, never continuing", () => {
  it("stops after the 3rd edit fails, never issuing the remaining 5 edits", async () => {
    const space = new FailingAtNthEditSpace(3);
    const result = await injectLargeCarouselSpec(space, largeCarouselSpec(), NODE, FAST);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "carousel_chunk_edit_failed");
    assert.match(result.error.message, /simulated mid-sequence failure/);
    assert.equal(space.editGoals.length, 3, "must stop at the failing edit, never issue the remaining ones");
  });
});
