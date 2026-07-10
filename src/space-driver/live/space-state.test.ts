import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseSpaceStateNodes } from "./space-state.ts";

const CAPTURES_DIR = fileURLToPath(new URL("../fixtures/live-captures/", import.meta.url));

function readCapture(filename: string): string {
  return readFileSync(`${CAPTURES_DIR}${filename}`, "utf8");
}

describe("parseSpaceStateNodes — real spaces_state / spaces_get_nodes captures into SpaceStateLike", () => {
  it("parses the whole-board 01 capture into 58 nodes with id+name, no values (no nodeData table)", () => {
    const state = parseSpaceStateNodes(readCapture("01-spaces_state.board.txt"));
    assert.equal(state.nodes.length, 58);
    const jsonMaster = state.nodes.find((n) => n.name === "JSON Master");
    assert.ok(jsonMaster);
    assert.equal(jsonMaster!.id, "6bc54e3e-ffc9-4038-aeb7-667dc9f3b474");
    assert.equal(jsonMaster!.value, undefined);
  });

  it("parses the scoped 02 capture's 6 nodes, resolving values from nodeData", () => {
    const state = parseSpaceStateNodes(readCapture("02-spaces_get_nodes.keynodes.txt"));
    assert.equal(state.nodes.length, 6);

    const jsonMaster = state.nodes.find((n) => n.name === "JSON Master");
    assert.ok(jsonMaster?.value, "JSON Master must carry its text value");
    assert.match(jsonMaster!.value!, /"character_concepts"/);

    const selectedCharacter = state.nodes.find((n) => n.name === "Selected Character");
    assert.equal(selectedCharacter?.value, "VdPHh9JMMU", "creation node value = creationIdentifier");

    const videoCombiner = state.nodes.find((n) => n.name === "Video Combiner");
    assert.equal(videoCombiner?.value, "IaAOyRntvE", "generator node value = currentCreationIdentifier");

    // Character Variants Generator is a prompt-generator with only model/instructions keys — no value.
    const generator = state.nodes.find((n) => n.name === "Character Variants Generator");
    assert.ok(generator);
    assert.equal(generator!.value, undefined);

    const protocol = state.nodes.find((n) => n.name === "Producer Protocol");
    assert.ok(protocol?.value);
    assert.match(protocol!.value!, /^f\{/, "the real capture's stray leading junk is preserved verbatim");
  });

  it("parses the single-node 11 post-inject capture", () => {
    const state = parseSpaceStateNodes(readCapture("11-spaces_get_nodes.jsonmaster-after-inject.txt"));
    assert.equal(state.nodes.length, 1);
    assert.equal(state.nodes[0]!.name, "JSON Master");
    assert.match(state.nodes[0]!.value ?? "", /ISSUE40-INJECT/);
  });

  it("returns an empty node list for a response with no nodes table", () => {
    const state = parseSpaceStateNodes("board:\n  uuid: x\n");
    assert.deepEqual(state.nodes, []);
  });
});
