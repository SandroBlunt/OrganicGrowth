import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scanTextFieldsForDashes } from "./dash-safety.ts";

describe("scanTextFieldsForDashes — reject-only dash 'tell' scanner (issue #108)", () => {
  it("passes text with no dash at all", () => {
    const result = scanTextFieldsForDashes([{ field: "text", text: "A plain sentence with no dash." }]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("flags an em dash", () => {
    const result = scanTextFieldsForDashes([{ field: "text", text: "Same week — same story." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0]!.match, "—");
    assert.equal(result.hits[0]!.field, "text");
  });

  it("flags an en dash", () => {
    const result = scanTextFieldsForDashes([{ field: "text", text: "Same week – same story." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0]!.match, "–");
  });

  it("flags a hyphen used as a spaced dash (\" - \")", () => {
    const result = scanTextFieldsForDashes([{ field: "text", text: "Same week - same story." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0]!.match, " - ");
  });

  it("does NOT flag an ordinary hyphenated compound word", () => {
    const result = scanTextFieldsForDashes([
      { field: "text", text: "This is a state-of-the-art task-assistant." },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("does NOT flag a bare negative number (a hyphen with no trailing whitespace)", () => {
    const result = scanTextFieldsForDashes([
      { field: "text", text: "Distribution was -3.7x the baseline, down from -1.2x." },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("scans multiple fields independently, naming only the field(s) with a hit", () => {
    const result = scanTextFieldsForDashes([
      { field: "slides[0].text", text: "Clean line, no tell." },
      { field: "slides[1].text", text: "Broken line — with a tell." },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0]!.field, "slides[1].text");
  });

  it("reports more than one tell when more than one appears in the SAME field", () => {
    const result = scanTextFieldsForDashes([{ field: "text", text: "One — two – three - four." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits.length, 3);
    const matches = result.hits.map((h) => h.match).sort();
    assert.deepEqual(matches, [" - ", "–", "—"].sort());
  });

  it("an empty fields list always passes", () => {
    const result = scanTextFieldsForDashes([]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("never rewrites — the result carries only hits, never a 'corrected' text", () => {
    const result = scanTextFieldsForDashes([{ field: "text", text: "Same week — same story." }]);
    assert.equal("text" in result, false);
    assert.equal("corrected" in result, false);
  });
});
