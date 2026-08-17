/**
 * Tests for `planBackfill` (`backfill.ts`, issue #206) — the pure planning module that decides, for a
 * given snapshot of committed Ideas and the classification data, what `classifyIdea` calls a real run
 * should make. Pure: no disk, no network, no clock, no database — every input is a plain in-memory
 * value, so this suite proves the DECISION logic (matching, idempotency, the "report don't force"
 * mechanism) without paying for a SQLite round-trip.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { planBackfill, type ExistingIdeaSnapshot } from "./backfill.ts";
import type { BriefClassificationEntry } from "./classifications.ts";

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

const BRIEF_A = "# idea-01 — A reframe story\n## Hook concept\nOpen on the reframe...\n";
const BRIEF_B = "# idea-02 — A skeptic's story\n## Hook Concept\nThe skeptic's question...\n";
const BRIEF_UNKNOWN = "# idea-99 — Never classified\n## Hook concept\nSomething nobody read yet.\n";
const BRIEF_HEADINGLESS = "# idea-03 — no hook heading at all\n";

const CLASSIFIED_A: BriefClassificationEntry = {
  kind: "classified",
  briefSha256: sha256(BRIEF_A),
  briefPath: "data/brands/straw-motion/ideas/fixture/idea-01.md",
  title: "A reframe story",
  hookType: "reframe",
  hookTypeSource: "heading",
  theme: "product_or_tool",
  themeSource: "heading",
  rationale: "Hook literally says 'the reframe'.",
};

const CLASSIFIED_B: BriefClassificationEntry = {
  kind: "classified",
  briefSha256: sha256(BRIEF_B),
  briefPath: "data/brands/straw-motion/ideas/fixture/idea-02.md",
  title: "A skeptic's story",
  hookType: "skeptics_question",
  hookTypeSource: "heading",
  theme: "industry_or_business",
  themeSource: "inferred",
  rationale: "Hook literally says 'the skeptic's question'.",
};

const REPORTED: BriefClassificationEntry = {
  kind: "reported",
  briefSha256: sha256("# idea-04 — an unfittable hook\n## Hook concept\nSomething no closed term matches.\n"),
  briefPath: "data/brands/straw-motion/ideas/fixture/idea-04.md",
  title: "An unfittable hook",
  reason: "The hook text names no technique matching any of the 10 closed Hook Types.",
};

function ideaFor(id: string, brief: string, overrides: Partial<ExistingIdeaSnapshot> = {}): ExistingIdeaSnapshot {
  return {
    id,
    title: overrides.title ?? "Some Idea",
    brief,
    hookType: overrides.hookType ?? "unclassified",
    theme: overrides.theme ?? "unclassified",
    ...(overrides.hookTypeSource !== undefined ? { hookTypeSource: overrides.hookTypeSource } : {}),
    ...(overrides.themeSource !== undefined ? { themeSource: overrides.themeSource } : {}),
  };
}

describe("planBackfill — matching, idempotency, and the report-don't-force mechanism (issue #206)", () => {
  it("an unclassified Idea whose brief matches a classified entry is planned as an update", () => {
    const plan = planBackfill([ideaFor("idea-A", BRIEF_A)], [CLASSIFIED_A]);
    assert.equal(plan.toUpdate.length, 1);
    assert.equal(plan.toUpdate[0]!.ideaId, "idea-A");
    assert.equal(plan.toUpdate[0]!.after.hookType, "reframe");
    assert.equal(plan.toUpdate[0]!.after.theme, "product_or_tool");
    assert.equal(plan.toUpdate[0]!.after.hookTypeSource, "heading");
    assert.equal(plan.toUpdate[0]!.after.themeSource, "heading");
    assert.deepEqual(plan.alreadyCorrect, []);
    assert.deepEqual(plan.reported, []);
    assert.deepEqual(plan.noEntry, []);
  });

  it("matches purely by brief content hash — never by title or id", () => {
    // Deliberately mismatched title/id vs the classification's own recorded title/path.
    const plan = planBackfill([ideaFor("some-other-id", BRIEF_A, { title: "Totally different title" })], [CLASSIFIED_A]);
    assert.equal(plan.toUpdate.length, 1);
    assert.equal(plan.toUpdate[0]!.ideaId, "some-other-id");
  });

  it("multiple Ideas each match their own classification independently", () => {
    const plan = planBackfill([ideaFor("idea-A", BRIEF_A), ideaFor("idea-B", BRIEF_B)], [CLASSIFIED_A, CLASSIFIED_B]);
    assert.equal(plan.toUpdate.length, 2);
    const byId = new Map(plan.toUpdate.map((a) => [a.ideaId, a]));
    assert.equal(byId.get("idea-A")?.after.hookType, "reframe");
    assert.equal(byId.get("idea-B")?.after.hookType, "skeptics_question");
  });

  it("an Idea already carrying the desired values (re-run case) is alreadyCorrect, not toUpdate — idempotent", () => {
    const plan = planBackfill(
      [
        ideaFor("idea-A", BRIEF_A, {
          hookType: "reframe",
          theme: "product_or_tool",
          hookTypeSource: "heading",
          themeSource: "heading",
        }),
      ],
      [CLASSIFIED_A],
    );
    assert.deepEqual(plan.toUpdate, []);
    assert.equal(plan.alreadyCorrect.length, 1);
    assert.equal(plan.alreadyCorrect[0]!.ideaId, "idea-A");
  });

  it("an Idea partially matching (e.g. right hookType, but no provenance recorded yet) is still toUpdate", () => {
    const plan = planBackfill([ideaFor("idea-A", BRIEF_A, { hookType: "reframe", theme: "product_or_tool" })], [CLASSIFIED_A]);
    assert.equal(plan.toUpdate.length, 1, "provenance is part of what classifyIdea writes — missing it still counts as a change");
  });

  it("an Idea whose brief matches NO classification entry is noEntry — the honest, expected outcome for the 10 headingless Briefs", () => {
    const plan = planBackfill([ideaFor("idea-headingless", BRIEF_HEADINGLESS)], [CLASSIFIED_A]);
    assert.deepEqual(plan.toUpdate, []);
    assert.equal(plan.noEntry.length, 1);
    assert.equal(plan.noEntry[0]!.ideaId, "idea-headingless");
  });

  it("an Idea whose brief matches a REPORTED entry is surfaced as reported — never forced into the nearest term", () => {
    const briefText = "# idea-04 — an unfittable hook\n## Hook concept\nSomething no closed term matches.\n";
    const plan = planBackfill([ideaFor("idea-D", briefText)], [REPORTED]);
    assert.deepEqual(plan.toUpdate, [], "a reported entry must never produce a write");
    assert.equal(plan.reported.length, 1);
    assert.equal(plan.reported[0]!.ideaId, "idea-D");
    assert.equal(plan.reported[0]!.reason, REPORTED.reason);
  });

  it("an unmatched Idea whose brief matches nothing at all is left completely untouched (no write planned)", () => {
    const plan = planBackfill([ideaFor("idea-U", BRIEF_UNKNOWN)], [CLASSIFIED_A, CLASSIFIED_B, REPORTED]);
    assert.deepEqual(plan.toUpdate, []);
    assert.equal(plan.noEntry.length, 1);
    assert.equal(plan.noEntry[0]!.ideaId, "idea-U");
  });

  it("an empty existingIdeas list produces an empty plan in every bucket", () => {
    const plan = planBackfill([], [CLASSIFIED_A]);
    assert.deepEqual(plan, { toUpdate: [], alreadyCorrect: [], reported: [], noEntry: [] });
  });

  it("is pure — calling it twice with the same input yields deepEqual results", () => {
    const ideas = [ideaFor("idea-A", BRIEF_A)];
    const entries = [CLASSIFIED_A];
    assert.deepEqual(planBackfill(ideas, entries), planBackfill(ideas, entries));
  });
});
