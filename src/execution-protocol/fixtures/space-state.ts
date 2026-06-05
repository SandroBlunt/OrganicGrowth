/**
 * FAKE Magnific Space — a synthetic `spaces_state` fixture standing in for the live "JSON master"
 * Space. THIS IS THE MAGNIFIC FAKE: the build is hermetic, so the parser is driven entirely through
 * this captured/synthetic state at the MCP read boundary — NO live `spaces_*` calls, no credits, no
 * board mutation (CLAUDE.md build pipeline; ADR-0003/0004).
 *
 * Shape mirrors the relevant slice of a `spaces_state` read: a `nodes` array where each node has an
 * `id` (the Space's internal identifier) and a `name`. The `Producer Protocol` node additionally
 * carries a text `value` holding the Execution Protocol JSON. Only the fields the parser reads are
 * modelled; a real `spaces_state` carries much more (connections, positions, creation identifiers),
 * which the parser ignores.
 *
 * Deliberate properties exercised by the tests:
 *   - The run-point targets ("Character Variants Generator", "Clip extractor") are UNIQUELY named.
 *   - There are DUPLICATE-named nodes elsewhere (two "Character #2" creation nodes) — those are not
 *     valid run-points, so a protocol pointing at that name must be rejected.
 *   - Node IDs are opaque/arbitrary, so resolution must happen BY NAME (a hard-coded ID would not
 *     generalize across Spaces).
 */

import {
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalProtocol,
  serializeProtocol,
} from "../protocol.ts";

/** The minimal node shape the parser reads from a `spaces_state` snapshot. */
export interface FakeSpaceNode {
  readonly id: string;
  readonly name: string;
  /** Text content (only the `Producer Protocol` node carries the protocol JSON here). */
  readonly value?: string;
}

/** The minimal `spaces_state` shape the parser reads. */
export interface FakeSpaceState {
  readonly nodes: readonly FakeSpaceNode[];
}

/**
 * A conforming fake Space: holds a `Producer Protocol` node with the canonical protocol, uniquely-named
 * run-point targets, and duplicate names elsewhere (the two "Character #2" creation nodes).
 */
export function fakeSpaceState(): FakeSpaceState {
  return {
    nodes: [
      { id: "node-json-master-6bc54e3e", name: "JSON Master", value: '{"…":"…"}' },
      { id: "node-cvg-bfd20cd1", name: "Character Variants Generator" },
      { id: "node-concepts-list-77a1", name: "Character concepts list" },
      { id: "node-nano-banana-2b3c", name: "Nano Banana Style (3 imgs)" },
      { id: "node-seedream-4d5e", name: "Seedream Style (3 imgs)" },
      // Duplicate-named creation nodes — NOT valid run-points (the human Cast pin lands on one of
      // these by hand; by-name resolution to either is ambiguous).
      { id: "node-character2-ba631f44", name: "Character #2" },
      { id: "node-character2-dup-91ff", name: "Character #2" },
      { id: "node-clip-extractor-1a2b", name: "Clip extractor" },
      { id: "node-video-combiner-3c4d", name: "Video Combiner" },
      { id: "node-final-output-5e6f", name: "Final Output" },
      {
        id: "node-producer-protocol-9z9z",
        name: PRODUCER_PROTOCOL_NODE_NAME,
        value: serializeProtocol(canonicalProtocol()),
      },
    ],
  };
}

/**
 * A fake Space whose protocol points its cast run-point at the DUPLICATE-named "Character #2" node
 * (an invalid run-point). Used to assert the parser rejects a run-point that resolves non-uniquely.
 */
export function fakeSpaceStateWithDuplicateRunPoint(): FakeSpaceState {
  const base = fakeSpaceState();
  const badProtocol = serializeProtocol({
    run_points: [
      { start: "Character #2", mode: "downstream", gate: "cast" },
      { start: "Clip extractor", mode: "downstream", gate: null },
    ],
  });
  return {
    nodes: base.nodes.map((n) =>
      n.name === PRODUCER_PROTOCOL_NODE_NAME ? { ...n, value: badProtocol } : n,
    ),
  };
}

/**
 * A fake Space whose protocol points a run-point at a node NAME that does not exist on the canvas at
 * all. Used to assert the unresolved-name failure is distinct from the duplicate-name failure.
 */
export function fakeSpaceStateWithMissingRunPoint(): FakeSpaceState {
  const base = fakeSpaceState();
  const badProtocol = serializeProtocol({
    run_points: [
      { start: "Character Variants Generator", mode: "downstream", gate: "cast" },
      { start: "Nonexistent Node", mode: "downstream", gate: null },
    ],
  });
  return {
    nodes: base.nodes.map((n) =>
      n.name === PRODUCER_PROTOCOL_NODE_NAME ? { ...n, value: badProtocol } : n,
    ),
  };
}

/** A fake Space with no `Producer Protocol` node at all (protocol-missing failure path). */
export function fakeSpaceStateWithoutProtocolNode(): FakeSpaceState {
  const base = fakeSpaceState();
  return { nodes: base.nodes.filter((n) => n.name !== PRODUCER_PROTOCOL_NODE_NAME) };
}
