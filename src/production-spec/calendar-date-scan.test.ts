import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scanTextFieldsForDates } from "./calendar-date-scan.ts";

describe("scanTextFieldsForDates — reject-only calendar-date 'tell' scanner (issue #187)", () => {
  it("passes text with no calendar date at all", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "You just got a huge discount on AI." }]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("flags a month name + day", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "It shipped on August 11." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.match, "August 11");
    assert.equal(result.hits[0]!.field, "text");
  });

  it("flags a month name + ordinal day + year", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "It shipped on August 11th, 2026." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.match, "August 11th, 2026");
  });

  it("flags an abbreviated month name + day", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "Filed on Aug. 11." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.match, "Aug. 11");
  });

  it("flags a day-of-month phrasing", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "It happened the 11th of August." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.match, "11th of August");
  });

  it("flags an ISO date", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "Logged as 2026-08-11 in the ledger." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.match, "2026-08-11");
  });

  it("flags a numeric slash date", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "Filed 8/11/2026." }]);
    assert.equal(result.ok, false);
    assert.equal(result.hits[0]!.match, "8/11/2026");
  });

  it("does NOT flag a lowercase month-shaped word used as an ordinary verb", () => {
    const result = scanTextFieldsForDates([
      { field: "text", text: "You may want to march forward on this one." },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("does NOT flag a plain percentage or price figure", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "The price fell to twenty cents." }]);
    assert.equal(result.ok, true);
  });

  it("scans multiple fields independently, naming only the field(s) with a hit", () => {
    const result = scanTextFieldsForDates([
      { field: "beats[0].text", text: "Clean line, no date." },
      { field: "beats[1].text", text: "Announced August 11th." },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0]!.field, "beats[1].text");
  });

  it("an empty fields list always passes", () => {
    const result = scanTextFieldsForDates([]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("never rewrites — the result carries only hits, never a 'corrected' text", () => {
    const result = scanTextFieldsForDates([{ field: "text", text: "Shipped August 11th." }]);
    assert.equal("text" in result, false);
    assert.equal("corrected" in result, false);
  });
});
