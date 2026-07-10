import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseToonField, parseToonTables, splitToonRow } from "./toon.ts";

const CAPTURES_DIR = fileURLToPath(new URL("../fixtures/live-captures/", import.meta.url));

function readCapture(filename: string): string {
  return readFileSync(`${CAPTURES_DIR}${filename}`, "utf8");
}

describe("splitToonRow — quoted-field-aware row splitting", () => {
  it("splits a simple unquoted row on commas", () => {
    assert.deepEqual(splitToonRow("a,b,c"), ["a", "b", "c"]);
  });

  it("keeps a quoted field's embedded commas and escaped quotes intact", () => {
    const row = String.raw`id-1,text,"{\n  \"a\": 1,\n  \"b\": 2\n}"`;
    const fields = splitToonRow(row);
    assert.equal(fields.length, 3);
    assert.equal(fields[0], "id-1");
    assert.equal(fields[1], "text");
    assert.equal(fields[2], String.raw`"{\n  \"a\": 1,\n  \"b\": 2\n}"`);
  });

  it("handles a trailing empty field", () => {
    assert.deepEqual(splitToonRow("a,b,"), ["a", "b", ""]);
  });
});

describe("parseToonField — literal null, JSON-string-literal quoted fields, bare tokens", () => {
  it("parses the bare literal null to null", () => {
    assert.equal(parseToonField("null"), null);
  });

  it("unescapes a quoted field via JSON.parse (embedded quotes and newlines)", () => {
    const raw = String.raw`"line one\nline \"two\""`;
    assert.equal(parseToonField(raw), 'line one\nline "two"');
  });

  it("returns a bare token unchanged", () => {
    assert.equal(parseToonField("idle"), "idle");
    assert.equal(parseToonField("bfd20cd1-9468-4e96-a237-157b9aefda8f"), "bfd20cd1-9468-4e96-a237-157b9aefda8f");
  });
});

describe("parseToonTables — against the REAL captured spaces_state / spaces_get_nodes fixtures", () => {
  it("parses the whole-board nodes[58] table from the real 01-spaces_state capture", () => {
    const text = readCapture("01-spaces_state.board.txt");
    const tables = parseToonTables(text);
    const nodes = tables["nodes"];
    assert.ok(nodes, 'expected a "nodes" table');
    assert.equal(nodes!.count, 58);
    assert.equal(nodes!.rows.length, 58);
    const jsonMaster = nodes!.rows.find((r) => r["name"] === "JSON Master");
    assert.ok(jsonMaster, "JSON Master must be present");
    assert.equal(jsonMaster!["id"], "6bc54e3e-ffc9-4038-aeb7-667dc9f3b474");
    assert.equal(jsonMaster!["type"], "text");
    // sourceNodeId is a bare `null` literal on this row.
    assert.equal(jsonMaster!["sourceNodeId"], null);
  });

  it("parses the scoped nodes[6] + nodeData[10] tables from the real 02-spaces_get_nodes capture", () => {
    const text = readCapture("02-spaces_get_nodes.keynodes.txt");
    const tables = parseToonTables(text);
    const nodes = tables["nodes"];
    const nodeData = tables["nodeData"];
    assert.ok(nodes);
    assert.ok(nodeData);
    assert.equal(nodes!.rows.length, 6);
    assert.equal(nodeData!.rows.length, 10);

    // The Selected Character node's creationIdentifier is a plain (unquoted) bare token.
    const pinRow = nodeData!.rows.find(
      (r) => r["elementId"] === "ba631f44-a804-4f8f-98c7-2c31b5eb1002" && r["key"] === "creationIdentifier",
    );
    assert.ok(pinRow, "expected the Selected Character creationIdentifier row");
    assert.equal(pinRow!["value"], "VdPHh9JMMU");

    // The Video Combiner node's currentCreationIdentifier.
    const combinerRow = nodeData!.rows.find(
      (r) =>
        r["elementId"] === "26aaee96-607b-4925-87d3-84471c8ce5c3" && r["key"] === "currentCreationIdentifier",
    );
    assert.ok(combinerRow);
    assert.equal(combinerRow!["value"], "IaAOyRntvE");

    // The JSON Master text row is a quoted, escaped, TRUNCATED JSON string (real read-API truncation) —
    // it must still parse as a string via JSON.parse without throwing.
    const jsonMasterText = nodeData!.rows.find(
      (r) => r["elementId"] === "6bc54e3e-ffc9-4038-aeb7-667dc9f3b474" && r["key"] === "text",
    );
    assert.ok(jsonMasterText);
    assert.equal(typeof jsonMasterText!["value"], "string");
    assert.match(jsonMasterText!["value"] as string, /"character_concepts"/);

    // The Producer Protocol node's raw text row starts with the documented stray "f{" data glitch.
    const protocolText = nodeData!.rows.find(
      (r) => r["elementId"] === "909da70a-282e-4f1d-b255-6765ac7a8b29" && r["key"] === "text",
    );
    assert.ok(protocolText);
    assert.match(protocolText!["value"] as string, /^f\{/);
  });

  it("parses the single-node nodes[1] + nodeData[2] tables from the real 11-post-inject capture", () => {
    const text = readCapture("11-spaces_get_nodes.jsonmaster-after-inject.txt");
    const tables = parseToonTables(text);
    const nodes = tables["nodes"];
    const nodeData = tables["nodeData"];
    assert.ok(nodes);
    assert.ok(nodeData);
    assert.equal(nodes!.rows.length, 1);
    assert.equal(nodes!.rows[0]!["name"], "JSON Master");
    const textRow = nodeData!.rows.find((r) => r["key"] === "text");
    assert.ok(textRow);
    assert.match(textRow!["value"] as string, /ISSUE40-INJECT/);
  });
});
