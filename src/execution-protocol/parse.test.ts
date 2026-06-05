import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse, type ParseErrorCode, type ParseResult } from "./parse.ts";
import {
  fakeSpaceState,
  fakeSpaceStateWithDuplicateRunPoint,
  fakeSpaceStateWithMissingRunPoint,
  fakeSpaceStateWithoutProtocolNode,
  type FakeSpaceState,
} from "./fixtures/space-state.ts";
import { serializeProtocol, PRODUCER_PROTOCOL_NODE_NAME } from "./protocol.ts";

/** Whether a failed parse result carries an error with the given code. */
function hasCode(result: ParseResult, code: ParseErrorCode): boolean {
  return result.ok === false && result.errors.some((e) => e.code === code);
}

/** Replace the Producer Protocol node's text with a raw string (for malformed-content tests). */
function withProtocolText(raw: string): FakeSpaceState {
  const base = fakeSpaceState();
  return {
    nodes: base.nodes.map((n) =>
      n.name === PRODUCER_PROTOCOL_NODE_NAME ? { ...n, value: raw } : n,
    ),
  };
}

describe("parse — correct resolution against the fake spaces_state", () => {
  it("resolves the cast and clip run-points to the correct nodes", () => {
    const result = parse(fakeSpaceState());
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.runPoints.length, 2);
    const [cast, clip] = result.runPoints;

    assert.equal(cast!.start_name, "Character Variants Generator");
    assert.equal(cast!.start_node_id, "node-cvg-bfd20cd1");
    assert.equal(cast!.mode, "downstream");

    assert.equal(clip!.start_name, "Clip extractor");
    assert.equal(clip!.start_node_id, "node-clip-extractor-1a2b");
    assert.equal(clip!.mode, "downstream");
  });

  it("parses the human Cast gate (cast run-point gated, clip run-point not)", () => {
    const result = parse(fakeSpaceState());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.runPoints[0]!.gate, "cast");
    assert.equal(result.runPoints[1]!.gate, null);
  });

  it("resolves IDs BY NAME from the state — no hard-coded run-point IDs", () => {
    // Re-id every node; resolution must follow the new IDs purely via the name lookup.
    const base = fakeSpaceState();
    const remapped: FakeSpaceState = {
      nodes: base.nodes.map((n) => ({ ...n, id: `RELABELLED-${n.id}` })),
    };
    const result = parse(remapped);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.runPoints[0]!.start_node_id, "RELABELLED-node-cvg-bfd20cd1");
    assert.equal(result.runPoints[1]!.start_node_id, "RELABELLED-node-clip-extractor-1a2b");
  });
});

describe("parse — unique-name guard", () => {
  it("rejects a run-point that points at a duplicate-named node", () => {
    const result = parse(fakeSpaceStateWithDuplicateRunPoint());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "run_point_ambiguous"), true);
    // The clear error must name the offending node.
    if (!result.ok) {
      const err = result.errors.find((e) => e.code === "run_point_ambiguous");
      assert.match(err!.message, /Character #2/);
    }
  });

  it("rejects a run-point that resolves to no node, distinctly from the ambiguous case", () => {
    const result = parse(fakeSpaceStateWithMissingRunPoint());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "run_point_unresolved"), true);
    assert.equal(hasCode(result, "run_point_ambiguous"), false);
  });
});

describe("parse — missing / malformed protocol node", () => {
  it("fails clearly when there is no Producer Protocol node", () => {
    const result = parse(fakeSpaceStateWithoutProtocolNode());
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "protocol_node_missing"), true);
  });

  it("fails when the protocol node holds no text", () => {
    const result = parse(withProtocolText(""));
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "protocol_node_empty"), true);
  });

  it("fails when the protocol node holds non-JSON text", () => {
    const result = parse(withProtocolText("not json {"));
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "protocol_not_json"), true);
  });

  it("fails when the JSON lacks a run_points array", () => {
    const result = parse(withProtocolText(JSON.stringify({ steps: [] })));
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "protocol_shape_invalid"), true);
  });
});

describe("parse — run-point field validation", () => {
  it("rejects a run-point with an invalid mode", () => {
    const raw = serializeProtocol({
      run_points: [{ start: "Clip extractor", mode: "sideways" as never, gate: null }],
    });
    const result = parse(withProtocolText(raw));
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "run_point_mode_invalid"), true);
  });

  it("rejects a run-point with an invalid gate", () => {
    const raw = serializeProtocol({
      run_points: [
        { start: "Character Variants Generator", mode: "downstream", gate: "review" as never },
      ],
    });
    const result = parse(withProtocolText(raw));
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "run_point_gate_invalid"), true);
  });

  it("rejects a run-point missing its `start` node name", () => {
    const raw = JSON.stringify({ run_points: [{ mode: "downstream", gate: null }] });
    const result = parse(withProtocolText(raw));
    assert.equal(result.ok, false);
    assert.equal(hasCode(result, "run_point_shape_invalid"), true);
  });
});

describe("parse — error reasons are specific", () => {
  it("every error carries a code and a non-empty message", () => {
    const result = parse(fakeSpaceStateWithDuplicateRunPoint());
    assert.equal(result.ok, false);
    if (result.ok) return;
    for (const err of result.errors) {
      assert.equal(typeof err.code, "string");
      assert.equal(typeof err.message, "string");
      assert.ok(err.message.length > 0);
    }
  });
});
