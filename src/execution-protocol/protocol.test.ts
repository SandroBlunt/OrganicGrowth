import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  READ_API_TRUNCATION_CAP,
  PROTOCOL_SIZE_BUDGET,
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalProtocol,
  canonicalCarouselProtocol,
  serializeProtocol,
} from "./protocol.ts";

describe("canonical Producer Protocol — content", () => {
  it("has ordered run-points: cast first, clip second", () => {
    const rp = canonicalProtocol().run_points;
    assert.equal(rp.length, 2);
    assert.equal(rp[0]!.start, "Character Variants Generator");
    assert.equal(rp[1]!.start, "Clip extractor");
  });

  it("marks the human Cast gate between Phase A and Phase B", () => {
    const rp = canonicalProtocol().run_points;
    // The cast run-point pauses at the Cast gate; the clip run-point has no gate (renders unattended).
    assert.equal(rp[0]!.gate, "cast");
    assert.equal(rp[1]!.gate, null);
  });

  it("drives both run-points downstream (ADR-0003 two-phase split)", () => {
    for (const p of canonicalProtocol().run_points) {
      assert.equal(p.mode, "downstream");
    }
  });

  it("references nodes only by name — never by a hard-coded node ID", () => {
    const json = serializeProtocol(canonicalProtocol());
    // A by-ID protocol would carry id-shaped strings; ours carries only readable names.
    assert.ok(!/node-[0-9a-f]/i.test(json), "protocol must not embed node IDs");
    assert.match(json, /Character Variants Generator/);
    assert.match(json, /Clip extractor/);
  });
});

describe("canonical Producer Protocol — read-API round-trip (Spike 3)", () => {
  it("serializes comfortably under the ~1,900-char read cap (no truncation)", () => {
    const size = serializeProtocol(canonicalProtocol()).length;
    // Proven hermetically: a real read would truncate at READ_API_TRUNCATION_CAP; staying under the
    // tighter budget guarantees the node round-trips through the read API without losing run-points.
    assert.ok(
      size <= PROTOCOL_SIZE_BUDGET,
      `serialized protocol is ${size} chars; must be <= ${PROTOCOL_SIZE_BUDGET}`,
    );
    assert.ok(size < READ_API_TRUNCATION_CAP);
  });

  it("the budget is itself comfortably under the hard cap", () => {
    assert.ok(PROTOCOL_SIZE_BUDGET < READ_API_TRUNCATION_CAP);
  });
});

describe("Producer Protocol node name", () => {
  it("is the agreed canvas node name", () => {
    assert.equal(PRODUCER_PROTOCOL_NODE_NAME, "Producer Protocol");
  });
});

describe("canonical carousel Producer Protocol — the single-lane 'Carrousel' Space (issue #81, node name verified against the live capture in issue #86/#89)", () => {
  it("has exactly ONE run-point, starting at 'JSON Master' (the real, captured inject node)", () => {
    const rp = canonicalCarouselProtocol().run_points;
    assert.equal(rp.length, 1);
    assert.equal(rp[0]!.start, "JSON Master");
  });

  it("has no gate — a zero-gate Recipe renders straight through", () => {
    assert.equal(canonicalCarouselProtocol().run_points[0]!.gate, null);
  });

  it("runs downstream", () => {
    assert.equal(canonicalCarouselProtocol().run_points[0]!.mode, "downstream");
  });

  it("references the node only by name — never a hard-coded node ID", () => {
    const json = serializeProtocol(canonicalCarouselProtocol());
    assert.ok(!/node-[0-9a-f]/i.test(json), "protocol must not embed node IDs");
    assert.match(json, /JSON Master/);
  });

  it("serializes comfortably under the read-API truncation cap", () => {
    const size = serializeProtocol(canonicalCarouselProtocol()).length;
    assert.ok(size <= PROTOCOL_SIZE_BUDGET);
    assert.ok(size < READ_API_TRUNCATION_CAP);
  });
});
