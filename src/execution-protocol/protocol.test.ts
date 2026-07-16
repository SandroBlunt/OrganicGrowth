import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  READ_API_TRUNCATION_CAP,
  PROTOCOL_SIZE_BUDGET,
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalProtocol,
  canonicalCarouselProtocol,
  carouselSlideRunPointName,
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

// === canonicalCarouselProtocol — the News Carousel Recipe's Space (issue #60) =========================

describe("canonical carousel Producer Protocol — content", () => {
  it("has SEVEN run-points, one per slide pipeline, named 'Image Prompt Slide N' in order", () => {
    const rp = canonicalCarouselProtocol().run_points;
    assert.equal(rp.length, 7);
    for (let i = 0; i < 7; i += 1) {
      assert.equal(rp[i]!.start, `Image Prompt Slide ${i + 1}`);
      assert.equal(rp[i]!.start, carouselSlideRunPointName(i + 1));
    }
  });

  it("every run-point has NO gate — the News Carousel Recipe is zero-gate (Operator-confirmed)", () => {
    for (const p of canonicalCarouselProtocol().run_points) {
      assert.equal(p.gate, null);
    }
  });

  it("drives every run-point downstream", () => {
    for (const p of canonicalCarouselProtocol().run_points) {
      assert.equal(p.mode, "downstream");
    }
  });

  it("references nodes only by name — never by a hard-coded node ID", () => {
    const json = serializeProtocol(canonicalCarouselProtocol());
    assert.ok(!/node-[0-9a-f]/i.test(json), "protocol must not embed node IDs");
    assert.match(json, /Image Prompt Slide 1/);
    assert.match(json, /Image Prompt Slide 7/);
  });
});

describe("canonical carousel Producer Protocol — read-API round-trip (Spike 3)", () => {
  it("serializes comfortably under the ~1,900-char read cap (no truncation), even with 7 run-points", () => {
    const size = serializeProtocol(canonicalCarouselProtocol()).length;
    assert.ok(
      size <= PROTOCOL_SIZE_BUDGET,
      `serialized carousel protocol is ${size} chars; must be <= ${PROTOCOL_SIZE_BUDGET}`,
    );
    assert.ok(size < READ_API_TRUNCATION_CAP);
  });
});
