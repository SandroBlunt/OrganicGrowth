import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composeAndCast, injectSpec, pinCharacter } from "../driver.ts";
import type { PollOptions } from "../driver.ts";
import { parse } from "../../execution-protocol/parse.ts";
import {
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalProtocol,
  serializeProtocol,
} from "../../execution-protocol/protocol.ts";
import type { SpaceStateLike } from "../../execution-protocol/parse.ts";
import { validSpec } from "../../production-spec/fixtures/specs.ts";
import { LiveSpaceAdapter } from "./adapter.ts";
import { LIVE_SPACE_ID, REAL_CAST_CREATION_IDS, ReplayMcpTransport } from "./replay/transport.ts";

/**
 * The EXISTING, unmodified `driver.ts` (ADR-0003's Space driver) run with `LiveSpaceAdapter` over
 * `ReplayMcpTransport` in place of the fake — proving the driver's Phase-A/Phase-B logic is genuinely
 * port-agnostic, using the sanctioned live capture's real response shapes (issue #40, AC2).
 */
const FAST: PollOptions = { sleep: async () => {} };

describe("injectSpec over the live adapter — confirms the REAL 02 (pre) -> 11 (post-inject) readback change", () => {
  it("succeeds and returns the real post-inject JSON Master text", async () => {
    const port = new LiveSpaceAdapter(new ReplayMcpTransport(), LIVE_SPACE_ID);
    const result = await injectSpec(port, validSpec(), FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.text, /ISSUE40-INJECT/, "the real 11 capture is the confirmed post-inject text");
  });
});

describe("pinCharacter over the live adapter — confirms via verifyPinned against the real board", () => {
  it("succeeds for the real pinned Selected Character identifier", async () => {
    const port = new LiveSpaceAdapter(new ReplayMcpTransport(), LIVE_SPACE_ID);
    const result = await pinCharacter(port, "VdPHh9JMMU", FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.character, "VdPHh9JMMU");
  });
});

describe("composeAndCast over the live adapter — as captured (the real Producer Protocol node schema)", () => {
  it("parse() legitimately fails against the real board's current Producer Protocol content", async () => {
    const port = new LiveSpaceAdapter(new ReplayMcpTransport(), LIVE_SPACE_ID);
    const state = await port.readState();
    const parsed = parse(state);
    // README gotcha #2: the live board's Producer Protocol node still holds a pre-canonical "steps"
    // document (with a stray leading "f{"), not yet the run_points shape parse() expects. This is a
    // real, documented finding — not a bug in this slice's adapter.
    assert.equal(parsed.ok, false);
  });

  it("recovers via the Fallback Protocol and still surfaces a real, non-empty Cast", async () => {
    // The recovery editStatus-with-creationIds shape was not itself captured live (the one real edit
    // capture was a plain JSON Master inject, which produces no creations) — SYNTHESIZED, reusing two
    // REAL creation ids so no creation data is invented (see replay/synthetic.ts).
    const replay = new ReplayMcpTransport({ fallbackCreationIds: [...REAL_CAST_CREATION_IDS].slice(0, 2) });
    const port = new LiveSpaceAdapter(replay, LIVE_SPACE_ID);
    const state = await port.readState();

    const result = await composeAndCast(port, state, validSpec(), FAST);
    assert.equal(result.ok, true, "the driver must recover via the Fallback Protocol, not hard-fail");
    if (!result.ok) return;
    assert.equal(result.cast.usedAgentFallback, true);
    assert.equal(result.cast.cast.length, 2);
  });
});

describe("composeAndCast over the live adapter — with the canonical protocol authored (deferred runtime step)", () => {
  it("runs the NAMED cast run-point through 100% real run/runStatus/creation data", async () => {
    const replay = new ReplayMcpTransport();
    const port = new LiveSpaceAdapter(replay, LIVE_SPACE_ID);
    const state = await port.readState();

    // Models the deferred runtime-authoring step (protocol.ts's own docstring: "Authoring this JSON onto
    // the live canvas node is deferred to runtime") — the REAL node ids/names come from the live
    // capture; only the Producer Protocol node's text is substituted with the canonical artifact.
    const withCanonicalProtocol: SpaceStateLike = {
      nodes: state.nodes.map((n) =>
        n.name === PRODUCER_PROTOCOL_NODE_NAME
          ? { id: n.id, name: n.name, value: serializeProtocol(canonicalProtocol()) }
          : n,
      ),
    };
    const parsed = parse(withCanonicalProtocol);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const castRunPoint = parsed.runPoints.find((rp) => rp.gate === "cast");
    assert.equal(castRunPoint?.start_name, "Character Variants Generator");
    assert.equal(castRunPoint?.start_node_id, "bfd20cd1-9468-4e96-a237-157b9aefda8f", "the real node id");

    const result = await composeAndCast(port, withCanonicalProtocol, validSpec(), FAST);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.cast.usedAgentFallback, false, "resolved the named run-point, no recovery needed");
    assert.equal(result.cast.cast.length, 6);
    assert.deepEqual(
      [...result.cast.cast].map((c) => c.identifier).sort(),
      [...REAL_CAST_CREATION_IDS].sort(),
      "the real terminal run's 6 creation ids (fixture 06)",
    );
    for (const c of result.cast.cast) {
      assert.equal(typeof c.url, "string");
      assert.ok(c.url.length > 0);
    }
  });
});
