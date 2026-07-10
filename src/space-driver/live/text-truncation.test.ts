import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { looksTruncated, readNodeTextRobust } from "./text-truncation.ts";
import { parseSpaceStateNodes } from "./space-state.ts";

const CAPTURES_DIR = fileURLToPath(new URL("../fixtures/live-captures/", import.meta.url));

function readCapture(filename: string): string {
  return readFileSync(`${CAPTURES_DIR}${filename}`, "utf8");
}

describe("looksTruncated — against the REAL captured JSON Master and Producer Protocol values", () => {
  it("flags the real captured JSON Master value as truncated (it is cut off mid-JSON)", () => {
    const state = parseSpaceStateNodes(readCapture("02-spaces_get_nodes.keynodes.txt"));
    const jsonMaster = state.nodes.find((n) => n.name === "JSON Master");
    assert.ok(jsonMaster?.value);
    assert.equal(looksTruncated(jsonMaster!.value), true);
  });

  it("does NOT flag the real captured Producer Protocol value (it reads whole)", () => {
    const state = parseSpaceStateNodes(readCapture("02-spaces_get_nodes.keynodes.txt"));
    const protocol = state.nodes.find((n) => n.name === "Producer Protocol");
    assert.ok(protocol?.value);
    assert.equal(looksTruncated(protocol!.value), false);
  });

  it("does not flag undefined", () => {
    assert.equal(looksTruncated(undefined), false);
  });
});

describe("readNodeTextRobust — truncation-aware resolution with an optional linked-doc fallback", () => {
  it("passes through untruncated text unchanged", async () => {
    const result = await readNodeTextRobust("short text");
    assert.deepEqual(result, { text: "short text", truncated: false, source: "canvas" });
  });

  it("passes through undefined unchanged", async () => {
    const result = await readNodeTextRobust(undefined);
    assert.deepEqual(result, { text: undefined, truncated: false, source: "canvas" });
  });

  it("flags truncated text with no linked doc available (never silently trusted)", async () => {
    const truncated = "x".repeat(2000);
    const result = await readNodeTextRobust(truncated);
    assert.equal(result.truncated, true);
    assert.equal(result.source, "canvas");
    assert.equal(result.text, truncated);
  });

  it("resolves truncated text from a linked document when a URL + fetcher are supplied", async () => {
    const truncated = "x".repeat(2000);
    const fullText = "the complete document content, fetched fresh";
    let fetchedUrl: string | undefined;
    const result = await readNodeTextRobust(truncated, {
      linkedDocUrl: "https://docs.google.com/document/d/example",
      fetchDoc: async (url) => {
        fetchedUrl = url;
        return fullText;
      },
    });
    assert.equal(fetchedUrl, "https://docs.google.com/document/d/example");
    assert.deepEqual(result, { text: fullText, truncated: false, source: "linked-doc" });
  });
});
