import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  auditNewsShortScriptAuthorPhase,
  checkShotListVariety,
} from "./news-short-script-author-checklist.ts";
import {
  validNewsShortScriptSpec,
  missingShowCue,
  wordCountTooLow,
  missingCuriosityQueries,
  curiosityQueriesTooFew,
} from "./fixtures/news-short-script-specs.ts";
import {
  calendarDateInBeatText,
  duplicateSourceSite,
  exactDuplicateSourcePage,
} from "./fixtures/news-short-script-author-checklist-specs.ts";
import type { ChecklistItemAudit, PhaseAuditResult } from "../recipe/phase-contract.ts";

/** Select a checklist item by its STABLE id — never by array position, mirroring
 *  `news-carousel-author-checklist.test.ts`'s own convention. */
function item(result: PhaseAuditResult, id: string): ChecklistItemAudit {
  const found = result.items.find((i) => i.id === id);
  assert.ok(found, `checklist item "${id}" must exist`);
  return found;
}

describe("auditNewsShortScriptAuthorPhase — the Recipe's own graduated author-phase checklist (issue #187)", () => {
  it("a baseline-adherent Spec passes every mechanical item", () => {
    const result = auditNewsShortScriptAuthorPhase(validNewsShortScriptSpec(), []);
    assert.equal(result.ok, true, JSON.stringify(result.items));
    assert.equal(result.phase, "author");
    assert.equal(result.recipe, "news-short-script");
    assert.ok(result.items.every((i) => i.kind === "mechanical"));
    for (const i of result.items) {
      assert.equal(i.ok, true, `${i.id}: ${i.description}`);
    }
  });

  it("fails the 'role-order-word-count' item on a malformed Spec — REFERENCES validateNewsShortScriptSpec, does not duplicate it", () => {
    const result = auditNewsShortScriptAuthorPhase(wordCountTooLow(), []);
    assert.equal(result.ok, false);
    assert.equal(item(result, "role-order-word-count").ok, false);
  });

  it("fails the 'beat-fields' item on a beat missing a required field — REFERENCES the SAME validator", () => {
    const result = auditNewsShortScriptAuthorPhase(missingShowCue(), []);
    assert.equal(result.ok, false);
    assert.equal(item(result, "beat-fields").ok, false);
  });

  it("fails the 'curiosity-queries' item when a beat has no Curiosity Queries at all", () => {
    const result = auditNewsShortScriptAuthorPhase(missingCuriosityQueries(), []);
    assert.equal(result.ok, false);
    assert.equal(item(result, "curiosity-queries").ok, false);
    // Every OTHER item stays unaffected by this one focused mutation.
    assert.equal(item(result, "role-order-word-count").ok, true);
    assert.equal(item(result, "no-calendar-dates").ok, true);
    assert.equal(item(result, "shot-list-variety").ok, true);
  });

  it("fails the 'curiosity-queries' item when a beat has too few Curiosity Queries", () => {
    const result = auditNewsShortScriptAuthorPhase(curiosityQueriesTooFew(), []);
    assert.equal(result.ok, false);
    assert.equal(item(result, "curiosity-queries").ok, false);
  });

  it("fails the 'no-calendar-dates' item when a beat's spoken text states an explicit calendar date (issue #187)", () => {
    const result = auditNewsShortScriptAuthorPhase(calendarDateInBeatText(), []);
    assert.equal(result.ok, false);
    const dateItem = item(result, "no-calendar-dates");
    assert.equal(dateItem.ok, false);
    assert.match(dateItem.detail!, /August 11th, 2026/);
    assert.match(dateItem.detail!, /beats\[0\]\.text/);
    // Every OTHER item stays unaffected by this one focused mutation.
    assert.equal(item(result, "role-order-word-count").ok, true);
    assert.equal(item(result, "shot-list-variety").ok, true);
  });

  it("fails the 'shot-list-variety' item when two beats' source_url share the same site (issue #187)", () => {
    const result = auditNewsShortScriptAuthorPhase(duplicateSourceSite(), []);
    assert.equal(result.ok, false);
    const varietyItem = item(result, "shot-list-variety");
    assert.equal(varietyItem.ok, false);
    assert.match(varietyItem.detail!, /example\.com/);
    // Every OTHER item stays unaffected by this one focused mutation.
    assert.equal(item(result, "role-order-word-count").ok, true);
    assert.equal(item(result, "no-calendar-dates").ok, true);
  });

  it("fails the same item when two beats share the EXACT same source page (a stricter case of the same site rule)", () => {
    const result = auditNewsShortScriptAuthorPhase(exactDuplicateSourcePage(), []);
    assert.equal(result.ok, false);
    assert.equal(item(result, "shot-list-variety").ok, false);
  });

  it("fails the 'banned-words' item — REFERENCES scanNewsShortScriptForBannedWords, does not duplicate it", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Array<Record<string, unknown>>;
    beats[0]!.text = "This is a miracle cure for everything.";
    const result = auditNewsShortScriptAuthorPhase(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.equal(item(result, "banned-words").ok, false);
  });

  it("never throws on a wildly malformed candidate Spec", () => {
    assert.doesNotThrow(() => auditNewsShortScriptAuthorPhase("not an object", []));
    assert.doesNotThrow(() => auditNewsShortScriptAuthorPhase({ beats: "nope" }, []));
    assert.doesNotThrow(() => auditNewsShortScriptAuthorPhase(null, []));
    const result = auditNewsShortScriptAuthorPhase({ beats: [1, 2, 3] }, []);
    assert.equal(result.ok, false);
  });
});

describe("checkShotListVariety — no two beats' source_url share the same site/host (issue #187)", () => {
  it("passes when every beat's source_url names a distinct site", () => {
    const result = checkShotListVariety([
      { source_url: "https://example.com/a" },
      { source_url: "https://other.example.org/b" },
      { source_url: "https://third.example.net/c" },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.duplicates, []);
  });

  it("strips a leading www. before comparing, so www.example.com and example.com collide", () => {
    const result = checkShotListVariety([
      { source_url: "https://www.example.com/a" },
      { source_url: "https://example.com/b" },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.duplicates[0]!.site, "example.com");
    assert.deepEqual(result.duplicates[0]!.beatIndices, [0, 1]);
  });

  it("is case-insensitive on the hostname", () => {
    const result = checkShotListVariety([
      { source_url: "https://Example.com/a" },
      { source_url: "https://EXAMPLE.COM/b" },
    ]);
    assert.equal(result.ok, false);
  });

  it("never throws on a beat with a malformed or missing source_url — simply has nothing to compare", () => {
    assert.doesNotThrow(() =>
      checkShotListVariety([{ source_url: "not-a-url" }, { source_url: "https://example.com/a" }]),
    );
    assert.doesNotThrow(() => checkShotListVariety([{}, { source_url: "https://example.com/a" }]));
  });

  it("an empty beats list always passes", () => {
    assert.equal(checkShotListVariety([]).ok, true);
  });
});
