import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { EditStatus, RunStatus, SpaceMcpPort } from "../port.ts";
import { pinGoal, CHARACTER_NODE_NAME } from "../driver.ts";
import { FakeSpace } from "../fixtures/fake-space.ts";
import { parse } from "../../execution-protocol/parse.ts";
import { fakeSpaceState } from "../../execution-protocol/fixtures/space-state.ts";
import { LiveSpaceAdapter, SELECTED_CHARACTER_NODE_NAME } from "./adapter.ts";
import { LIVE_SPACE_ID, ReplayMcpTransport } from "./replay/transport.ts";

/**
 * Shared, parameterized `SpaceMcpPort` contract battery — ONE contract, run against TWO
 * implementations: the existing `FakeSpace` (unmodified) and the new `LiveSpaceAdapter` over
 * `ReplayMcpTransport` (real captured shapes). This is the strongest proof that the live adapter
 * satisfies the same port contract the fake already does (issue #40, AC2/AC5).
 */
interface ContractFixture {
  readonly port: SpaceMcpPort;
  /** A node name known to be uniquely resolvable AND runnable in `downstream` mode on this Space. */
  readonly castStartNodeId: string;
  /** A creation identifier this port can `fetchCreations` a real url for. */
  readonly knownCreationId: string;
  /** The Character candidate identifier to pin (via the SAME `pinGoal` both implementations receive). */
  readonly pinnedCharacter: string;
  /** A different candidate identifier that must NOT read back as pinned. */
  readonly notPinnedCharacter: string;
  /** The on-canvas node THIS implementation pins the Character to (and verifies the pin against) —
   *  the fake's and the real board's pin nodes are named differently (issue #40 gotcha #3). */
  readonly pinNodeName: string;
}

async function pollToTerminal<T extends { readonly phase: string }>(
  poll: () => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 10; i++) {
    const status = await poll();
    if (status.phase !== "running") return status;
  }
  throw new Error("shared contract: operation never reached terminal within 10 polls");
}

function runSharedPortContract(label: string, make: () => ContractFixture): void {
  describe(`shared SpaceMcpPort contract — ${label}`, () => {
    it("readState returns nodes with string id/name, including a JSON Master node", async () => {
      const { port } = make();
      const state = await port.readState();
      assert.ok(state.nodes.length > 0);
      for (const n of state.nodes) {
        assert.equal(typeof n.id, "string");
        assert.equal(typeof n.name, "string");
      }
      assert.ok(state.nodes.some((n) => n.name === "JSON Master"));
    });

    it("edit + editStatus reaches a terminal succeeded result", async () => {
      const { port } = make();
      const { editId } = await port.edit("a natural-language edit goal for the contract test");
      const status = await pollToTerminal<EditStatus>(() => port.editStatus(editId));
      assert.equal(status.phase, "succeeded");
    });

    it("run + runStatus reaches terminal with non-empty fired node names and creation ids", async () => {
      const { port, castStartNodeId } = make();
      const { runId } = await port.run(castStartNodeId, "downstream");
      const status = await pollToTerminal<RunStatus>(() => port.runStatus(runId));
      assert.equal(status.phase, "succeeded");
      assert.ok((status.firedNodeNames ?? []).length > 0);
      assert.ok((status.creationIds ?? []).length > 0);
    });

    it("fetchCreations resolves a known creation id to a string url", async () => {
      const { port, knownCreationId } = make();
      const creations = await port.fetchCreations([knownCreationId]);
      assert.equal(creations.length, 1);
      assert.equal(creations[0]!.identifier, knownCreationId);
      assert.equal(typeof creations[0]!.url, "string");
      assert.ok(creations[0]!.url.length > 0);
    });

    it("verifyPinned confirms the pinned Character and rejects a different one, after the SAME pinGoal edit", async () => {
      const { port, pinnedCharacter, notPinnedCharacter, pinNodeName } = make();
      const { editId } = await port.edit(pinGoal(pinnedCharacter, pinNodeName));
      const status = await pollToTerminal<EditStatus>(() => port.editStatus(editId));
      assert.equal(status.phase, "succeeded");
      assert.equal(await port.verifyPinned(pinnedCharacter, pinNodeName), true);
      assert.equal(await port.verifyPinned(notPinnedCharacter, pinNodeName), false);
    });
  });
}

function fakeCastStartNodeId(): string {
  const parsed = parse(fakeSpaceState());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("fixture parse failed");
  const cast = parsed.runPoints.find((rp) => rp.gate === "cast");
  assert.ok(cast);
  return cast!.start_node_id;
}

runSharedPortContract("FakeSpace (the Magnific fake, unmodified)", () => ({
  port: new FakeSpace(),
  castStartNodeId: fakeCastStartNodeId(),
  knownCreationId: "cast-1",
  pinnedCharacter: "cast-3",
  notPinnedCharacter: "cast-1",
  pinNodeName: CHARACTER_NODE_NAME,
}));

runSharedPortContract("LiveSpaceAdapter over ReplayMcpTransport (real captured shapes)", () => ({
  port: new LiveSpaceAdapter(new ReplayMcpTransport(), LIVE_SPACE_ID),
  // The real "Character Variants Generator" node id (README / fixture 02).
  castStartNodeId: "bfd20cd1-9468-4e96-a237-157b9aefda8f",
  knownCreationId: "9RwKMfINYZ",
  // The real pinned "Selected Character" creationIdentifier (fixture 02/README).
  pinnedCharacter: "VdPHh9JMMU",
  notPinnedCharacter: "some-other-candidate",
  pinNodeName: SELECTED_CHARACTER_NODE_NAME,
}));
