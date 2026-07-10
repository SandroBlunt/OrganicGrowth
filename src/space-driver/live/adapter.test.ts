import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LiveSpaceAdapter, SELECTED_CHARACTER_NODE_NAME, VIDEO_COMBINER_NODE_NAME } from "./adapter.ts";
import type { LiveMcpTransport } from "./transport.ts";
import { syntheticFailedEditStatus, syntheticFailedRunStatus } from "./replay/synthetic.ts";

const CAPTURES_DIR = fileURLToPath(new URL("../fixtures/live-captures/", import.meta.url));

function readCapture(filename: string): string {
  return readFileSync(`${CAPTURES_DIR}${filename}`, "utf8");
}

const SPACE_ID = "a1f05d67-1b98-4d10-9251-6603bea3b578";

/**
 * A hand-rolled `LiveMcpTransport` stub returning the REAL captured fixture text verbatim, with no
 * cross-call state beyond what each test configures explicitly — isolated unit tests of the adapter's
 * own parsing/mapping logic (as opposed to `contract.test.ts` / `replay/transport.ts`'s fuller replay).
 */
class StubTransport implements LiveMcpTransport {
  public runStatusCalls = 0;
  public creationsGetCalls: string[] = [];
  public runStatusOverride: string | undefined;
  public editStatusOverride: string | undefined;

  async spacesState(): Promise<string> {
    return readCapture("01-spaces_state.board.txt");
  }
  async spacesGetNodes(): Promise<string> {
    return readCapture("02-spaces_get_nodes.keynodes.txt");
  }
  async spacesRun(): Promise<string> {
    return readCapture("04-spaces_run.start.json");
  }
  async spacesRunStatus(): Promise<string> {
    this.runStatusCalls++;
    if (this.runStatusOverride !== undefined) return this.runStatusOverride;
    return this.runStatusCalls === 1
      ? readCapture("05-spaces_run_status.running.json")
      : readCapture("06-spaces_run_status.terminal.json");
  }
  async spacesEdit(): Promise<string> {
    return readCapture("09-spaces_edit.start.json");
  }
  async spacesEditStatus(): Promise<string> {
    if (this.editStatusOverride !== undefined) return this.editStatusOverride;
    return readCapture("10-spaces_edit_status.terminal.json");
  }
  async creationsGet(identifier: string): Promise<string> {
    this.creationsGetCalls.push(identifier);
    if (identifier === "9RwKMfINYZ") return readCapture("07-creations_get.image.txt");
    if (identifier === "IaAOyRntvE") return readCapture("08-creations_get.video.txt");
    throw new Error(`StubTransport: no fixture for creation ${identifier}`);
  }
}

describe("LiveSpaceAdapter.readState — merges the real whole-board inventory with scoped key-node values", () => {
  it("returns nodes carrying real ids/names, with JSON Master's truncated value and Selected Character's pin", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const state = await adapter.readState();

    assert.equal(state.nodes.length, 58, "the whole-board inventory (01) has 58 nodes");

    const jsonMaster = state.nodes.find((n) => n.name === "JSON Master");
    assert.ok(jsonMaster?.value);
    assert.match(jsonMaster!.value!, /"character_concepts"/);

    const selectedCharacter = state.nodes.find((n) => n.name === SELECTED_CHARACTER_NODE_NAME);
    assert.equal(selectedCharacter?.value, "VdPHh9JMMU");

    const videoCombiner = state.nodes.find((n) => n.name === VIDEO_COMBINER_NODE_NAME);
    assert.equal(videoCombiner?.value, "IaAOyRntvE");

    // A node with no captured value (e.g. a plain structural node) carries no `.value`.
    const clip1 = state.nodes.find((n) => n.name === "Clip 1");
    assert.ok(clip1);
    assert.equal(clip1!.value, undefined);
  });
});

describe("LiveSpaceAdapter.run / runStatus — real workflowRunIdentifier + allTerminal polling", () => {
  it("run() reads the real workflowRunIdentifier from the spaces_run start response", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const { runId } = await adapter.run("bfd20cd1-9468-4e96-a237-157b9aefda8f", "downstream");
    assert.equal(runId, "SNm4BWUb8d");
  });

  it("runStatus() reports running on the first (05) poll, then succeeded on the terminal (06) poll", async () => {
    const stub = new StubTransport();
    const adapter = new LiveSpaceAdapter(stub, SPACE_ID);
    const first = await adapter.runStatus("SNm4BWUb8d");
    assert.deepEqual(first, { phase: "running" });

    const second = await adapter.runStatus("SNm4BWUb8d");
    assert.equal(second.phase, "succeeded");
    assert.equal(second.creationIds?.length, 6);
    assert.deepEqual(
      [...(second.creationIds ?? [])].sort(),
      ["9RwKMfINYZ", "swKvZXPl8e", "NZ7kDum6D9", "jSbm3XOLD0", "l7ka2IEgv9", "xgqtiBnjfW"].sort(),
    );
  });

  it("resolves each fired node id to its real NAME via a fresh board read (the MCP gives ids only)", async () => {
    const stub = new StubTransport();
    const adapter = new LiveSpaceAdapter(stub, SPACE_ID);
    await adapter.runStatus("SNm4BWUb8d"); // running
    const terminal = await adapter.runStatus("SNm4BWUb8d"); // terminal
    assert.deepEqual(
      [...(terminal.firedNodeNames ?? [])].sort(),
      [
        "Character Variants Generator",
        "Character concepts list",
        "Nano Banana Style",
        "Seedream Style",
        "List #4",
        "List #3",
      ].sort(),
    );
  });

  it("maps a synthesized (NOT captured) start-node-missing runStatus to the Fallback-Protocol trigger", async () => {
    const stub = new StubTransport();
    stub.runStatusOverride = syntheticFailedRunStatus("start-node-missing");
    const adapter = new LiveSpaceAdapter(stub, SPACE_ID);
    const status = await adapter.runStatus("SNm4BWUb8d");
    assert.equal(status.phase, "failed");
    assert.equal(status.startNodeMissing, true);
    assert.ok(status.error);
  });

  it("maps a synthesized (NOT captured) generic failed runStatus without startNodeMissing", async () => {
    const stub = new StubTransport();
    stub.runStatusOverride = syntheticFailedRunStatus("generic");
    const adapter = new LiveSpaceAdapter(stub, SPACE_ID);
    const status = await adapter.runStatus("SNm4BWUb8d");
    assert.equal(status.phase, "failed");
    assert.equal(status.startNodeMissing, undefined);
  });
});

describe("LiveSpaceAdapter.edit / editStatus — real operationId + workflowStatus mapping", () => {
  it("edit() reads the real operationId from the spaces_edit start response", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const { editId } = await adapter.edit("Replace the JSON Master node's text");
    assert.equal(editId, "01KX5HCG31B3JN7CHJAVBW8VEQ");
  });

  it("editStatus() reports succeeded only because workflowStatus is 'success' (real 10 capture)", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const status = await adapter.editStatus("01KX5HCG31B3JN7CHJAVBW8VEQ");
    assert.deepEqual(status, { phase: "succeeded" });
  });

  it("maps a synthesized (NOT captured) failed editStatus to a failed EditStatus", async () => {
    const stub = new StubTransport();
    stub.editStatusOverride = syntheticFailedEditStatus();
    const adapter = new LiveSpaceAdapter(stub, SPACE_ID);
    const status = await adapter.editStatus("some-edit-id");
    assert.equal(status.phase, "failed");
    assert.ok(status.error);
  });
});

describe("LiveSpaceAdapter.fetchCreations — real creations_get parsing, never cached", () => {
  it("resolves the real image and video creation ids to their identifier + url", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const creations = await adapter.fetchCreations(["9RwKMfINYZ", "IaAOyRntvE"]);
    assert.equal(creations.length, 2);
    const byId = new Map(creations.map((c) => [c.identifier, c.url]));
    assert.equal(
      byId.get("9RwKMfINYZ"),
      "https://pikaso.cdnpk.net/private/production/4843244738/render.png?token=REDACTED",
    );
    assert.equal(
      byId.get("IaAOyRntvE"),
      "https://pikaso.cdnpk.net/private/production/4522929259/9ad7737c-ca82-4dae-a5af-acf6cc9f494b-0.mp4?token=REDACTED",
    );
  });

  it("fetches one id at a time through the transport (never a batch call)", async () => {
    const stub = new StubTransport();
    const adapter = new LiveSpaceAdapter(stub, SPACE_ID);
    await adapter.fetchCreations(["9RwKMfINYZ", "IaAOyRntvE"]);
    assert.deepEqual(stub.creationsGetCalls, ["9RwKMfINYZ", "IaAOyRntvE"]);
  });

  it("never caches a url: two fetches against a transport returning a fresh url each time both come back fresh", async () => {
    let call = 0;
    const freshTransport: LiveMcpTransport = {
      async spacesState() {
        return "";
      },
      async spacesGetNodes() {
        return "";
      },
      async spacesRun() {
        return "{}";
      },
      async spacesRunStatus() {
        return "{}";
      },
      async spacesEdit() {
        return "{}";
      },
      async spacesEditStatus() {
        return "{}";
      },
      async creationsGet(identifier: string) {
        call++;
        return `identifier: ${identifier}\nurl: "https://example.com/${identifier}?token=call-${call}"\n`;
      },
    };
    const adapter = new LiveSpaceAdapter(freshTransport, SPACE_ID);
    const first = await adapter.fetchCreations(["same-id"]);
    const second = await adapter.fetchCreations(["same-id"]);
    assert.equal(first[0]!.url, "https://example.com/same-id?token=call-1");
    assert.equal(second[0]!.url, "https://example.com/same-id?token=call-2");
    assert.notEqual(first[0]!.url, second[0]!.url, "the adapter must never return a cached url");
  });
});

describe("LiveSpaceAdapter.verifyPinned — reads the real Selected Character node, not a fake marker", () => {
  it("returns true for the real pinned character and false for any other identifier", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    assert.equal(await adapter.verifyPinned("VdPHh9JMMU"), true);
    assert.equal(await adapter.verifyPinned("some-other-candidate"), false);
  });
});

describe("LiveSpaceAdapter.readNodeTextRobust — the ~1,900-char truncation guard, wired to a real node", () => {
  it("flags the real truncated JSON Master value when no linked doc is available", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const result = await adapter.readNodeTextRobust("JSON Master");
    assert.equal(result.truncated, true);
    assert.equal(result.source, "canvas");
  });

  it("resolves the real truncated JSON Master value from a linked document when one is supplied", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const fullText = "the complete, non-truncated JSON Master contract";
    const result = await adapter.readNodeTextRobust("JSON Master", {
      linkedDocUrl: "https://docs.google.com/document/d/example",
      fetchDoc: async () => fullText,
    });
    assert.deepEqual(result, { text: fullText, truncated: false, source: "linked-doc" });
  });

  it("does not flag the real compact Producer Protocol value as truncated", async () => {
    const adapter = new LiveSpaceAdapter(new StubTransport(), SPACE_ID);
    const result = await adapter.readNodeTextRobust("Producer Protocol");
    assert.equal(result.truncated, false);
    assert.equal(result.source, "canvas");
  });
});
