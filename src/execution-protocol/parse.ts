/**
 * Execution Protocol parser — pure deep module.
 *
 * `parse(spaceState)` reads the `Producer Protocol` node from a `spaces_state` snapshot, parses its
 * ordered run-points, and resolves each run-point's by-NAME `start` reference to the node it points at
 * — rejecting any run-point that resolves to a non-uniquely-named node (the Space has duplicate names
 * elsewhere; only uniquely-named nodes are valid run-points; ADR-0003, PRD #1 stories 24-25).
 *
 * Pure and deterministic: no I/O, no clock, no Space, no network. It takes an already-read state object
 * (the live read happens in the Space-driver shell, against the fake in tests) and returns a result.
 * It HARD-CODES NO node IDs for run-points — every run-point ID comes from resolving its name against
 * THIS state, so the same parser generalizes across any conforming Space (PRD #1 story 31).
 *
 * Every failure is returned as a `{ code, message }` (never thrown for expected shapes), so callers and
 * tests can assert the SPECIFIC reason, not just pass/fail — mirroring `production-spec/validate.ts`.
 */

import {
  PRODUCER_PROTOCOL_NODE_NAME,
  type RunMode,
  type RunPointGate,
} from "./protocol.ts";

/** The minimal node shape the parser reads (a Space-state node: an `id`, a `name`, optional text). */
export interface SpaceStateNode {
  readonly id: string;
  readonly name: string;
  readonly value?: string;
}

/** The minimal `spaces_state` shape the parser reads. */
export interface SpaceStateLike {
  readonly nodes: readonly SpaceStateNode[];
}

/**
 * A run-point with its by-name reference RESOLVED to a concrete node ID on the current Space. This is
 * what the runner drives: the node `id` was looked up by `start_name`, never hard-coded.
 */
export interface ResolvedRunPoint {
  /** The node NAME the protocol referenced. */
  readonly start_name: string;
  /** The node ID that name resolved to on this Space (looked up, not hard-coded). */
  readonly start_node_id: string;
  /** The run mode. */
  readonly mode: RunMode;
  /** The human gate that follows this run-point, or `null`. */
  readonly gate: RunPointGate;
}

/** Stable, machine-checkable identifiers for each parse failure. */
export type ParseErrorCode =
  | "protocol_node_missing"
  | "protocol_node_empty"
  | "protocol_not_json"
  | "protocol_shape_invalid"
  | "run_point_shape_invalid"
  | "run_point_mode_invalid"
  | "run_point_gate_invalid"
  | "run_point_unresolved"
  | "run_point_ambiguous";

/** One parse failure: a stable `code` plus a human-readable `message`. */
export interface ParseError {
  readonly code: ParseErrorCode;
  readonly message: string;
}

/** The result of parsing a Space's Execution Protocol. */
export type ParseResult =
  | { readonly ok: true; readonly runPoints: readonly ResolvedRunPoint[] }
  | { readonly ok: false; readonly errors: readonly ParseError[] };

const VALID_MODES: ReadonlySet<string> = new Set<RunMode>(["downstream", "singular"]);
const VALID_GATES: ReadonlySet<string> = new Set(["cast"]); // plus `null`, handled explicitly

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Count how many nodes carry a given name (for the unique-name guard). */
function countByName(nodes: readonly SpaceStateNode[], name: string): number {
  return nodes.reduce((n, node) => (node.name === name ? n + 1 : n), 0);
}

/** Find the single node with a given name, or undefined if absent. */
function findByName(
  nodes: readonly SpaceStateNode[],
  name: string,
): SpaceStateNode | undefined {
  return nodes.find((node) => node.name === name);
}

/**
 * Parse and resolve the Execution Protocol from a Space-state snapshot.
 *
 * @param spaceState an already-read `spaces_state` snapshot (the fake, in tests). Never reaches the
 *                   live Space — the parser is pure.
 */
export function parse(spaceState: SpaceStateLike): ParseResult {
  const nodes = spaceState?.nodes ?? [];

  // 1. Locate the Producer Protocol node by name.
  const protocolNode = findByName(nodes, PRODUCER_PROTOCOL_NODE_NAME);
  if (!protocolNode) {
    return fail("protocol_node_missing", `No "${PRODUCER_PROTOCOL_NODE_NAME}" node on the Space.`);
  }
  const raw = protocolNode.value;
  if (typeof raw !== "string" || raw.trim() === "") {
    return fail(
      "protocol_node_empty",
      `The "${PRODUCER_PROTOCOL_NODE_NAME}" node has no text content.`,
    );
  }

  // 2. Parse its JSON.
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return fail(
      "protocol_not_json",
      `The "${PRODUCER_PROTOCOL_NODE_NAME}" node does not hold valid JSON.`,
    );
  }
  if (!isObject(doc) || !Array.isArray(doc.run_points)) {
    return fail(
      "protocol_shape_invalid",
      "Execution Protocol must be an object with a `run_points` array.",
    );
  }

  // 3. Resolve each run-point by name (collecting all failures, like validate()).
  const errors: ParseError[] = [];
  const resolved: ResolvedRunPoint[] = [];

  doc.run_points.forEach((rp, i) => {
    if (!isObject(rp) || typeof rp.start !== "string" || rp.start.trim() === "") {
      errors.push({
        code: "run_point_shape_invalid",
        message: `run_points[${i}] must be an object with a non-empty string \`start\` (node name).`,
      });
      return;
    }
    const name = rp.start;

    if (typeof rp.mode !== "string" || !VALID_MODES.has(rp.mode)) {
      errors.push({
        code: "run_point_mode_invalid",
        message: `run_points[${i}] (\`${name}\`) has an invalid \`mode\` (got ${JSON.stringify(rp.mode)}).`,
      });
      return;
    }
    const gateRaw = rp.gate ?? null;
    if (gateRaw !== null && (typeof gateRaw !== "string" || !VALID_GATES.has(gateRaw))) {
      errors.push({
        code: "run_point_gate_invalid",
        message: `run_points[${i}] (\`${name}\`) has an invalid \`gate\` (got ${JSON.stringify(rp.gate)}).`,
      });
      return;
    }

    // By-name resolution + unique-name guard (the load-bearing rule).
    const matches = countByName(nodes, name);
    if (matches === 0) {
      errors.push({
        code: "run_point_unresolved",
        message: `run_points[${i}] references node "${name}", which is not on the Space.`,
      });
      return;
    }
    if (matches > 1) {
      errors.push({
        code: "run_point_ambiguous",
        message: `run_points[${i}] references "${name}", which names ${matches} nodes — a run-point must point at a uniquely-named node.`,
      });
      return;
    }

    const node = findByName(nodes, name)!;
    resolved.push({
      start_name: name,
      start_node_id: node.id,
      mode: rp.mode as RunMode,
      gate: gateRaw as RunPointGate,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, runPoints: resolved };
}

function fail(code: ParseErrorCode, message: string): ParseResult {
  return { ok: false, errors: [{ code, message }] };
}
