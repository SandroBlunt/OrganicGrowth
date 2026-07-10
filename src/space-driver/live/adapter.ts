/**
 * `LiveSpaceAdapter` — the live `SpaceMcpPort` implementation (issue #40).
 *
 * Drives a real Magnific Space through the injected `LiveMcpTransport` seam, parsing every raw MCP
 * response using the field mappings recorded in the sanctioned live capture
 * (`src/space-driver/fixtures/live-captures/README.md`):
 *
 *   - `readState()` merges a whole-board structural inventory (`spaces_state`) with scoped values for
 *     the handful of nodes the driver actually inspects (`spaces_get_nodes`), because the real
 *     `spaces_get_nodes` response is the one proven (by capture) to carry `nodeData` values.
 *   - `run`/`edit` read their operation id from DIFFERENT raw fields (`workflowRunIdentifier` vs
 *     `operationId` — gotcha #5); `runStatus`/`editStatus` are terminal iff `allTerminal:true`, and
 *     succeed iff `status:"completed"` / `workflowStatus:"success"` respectively.
 *   - `runStatus` resolves each fired node's id to its NAME via a fresh board read (the MCP reports ids,
 *     the port wants names — gotcha #4).
 *   - `fetchCreations` treats every url as a fresh, expiring signed URL — it is never cached.
 *   - `verifyPinned` reads the REAL `Selected Character` creation node's `creationIdentifier` — never
 *     the fake's `PINNED:` marker convention.
 *   - `readNodeTextRobust` (an adapter-level extra, not part of `SpaceMcpPort`) guards against the
 *     ~1,900-char read-API truncation for any single node, resolving from a linked document when one is
 *     available rather than silently trusting a partial read.
 *
 * This adapter makes NO live MCP call itself — every call is delegated to the injected
 * `LiveMcpTransport`. Tests inject `ReplayMcpTransport` (fixture replay) or a hand-rolled stub.
 */

import type { Creation, EditStatus, RunStatus, SpaceMcpPort } from "../port.ts";
import type { SpaceStateLike, SpaceStateNode } from "../../execution-protocol/parse.ts";
import { PRODUCER_PROTOCOL_NODE_NAME } from "../../execution-protocol/protocol.ts";
import { JSON_MASTER_NODE_NAME } from "../driver.ts";
import type { LiveMcpTransport } from "./transport.ts";
import { parseSpaceStateNodes } from "./space-state.ts";
import { parseCreationBlock } from "./creation.ts";
import type { RobustTextOptions, RobustTextResult } from "./text-truncation.ts";
import { readNodeTextRobust } from "./text-truncation.ts";

/** The real live board's Character-pin creation node (README gotcha #3 — NOT the fake's "Character #2"). */
export const SELECTED_CHARACTER_NODE_NAME = "Selected Character";

/** The real live board's finished-Asset output node (the Video Combiner's own creation). */
export const VIDEO_COMBINER_NODE_NAME = "Video Combiner";

/** The fixed set of node NAMES `readState()` requests scoped values for, regardless of protocol content. */
const KEY_NODE_NAMES: readonly string[] = [
  JSON_MASTER_NODE_NAME,
  PRODUCER_PROTOCOL_NODE_NAME,
  SELECTED_CHARACTER_NODE_NAME,
  VIDEO_COMBINER_NODE_NAME,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LiveSpaceAdapter: ${what} response is not valid JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`LiveSpaceAdapter: ${what} response is not a JSON object`);
  }
  return parsed;
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function stringArrayField(obj: Record<string, unknown>, key: string): readonly string[] {
  const value = obj[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export class LiveSpaceAdapter implements SpaceMcpPort {
  constructor(
    private readonly transport: LiveMcpTransport,
    private readonly spaceId: string,
  ) {}

  async readState(): Promise<SpaceStateLike> {
    const boardText = await this.transport.spacesState(this.spaceId);
    const inventory = parseSpaceStateNodes(boardText).nodes;

    const idsOfInterest = KEY_NODE_NAMES
      .map((name) => inventory.find((n) => n.name === name)?.id)
      .filter((id): id is string => id !== undefined);

    const valueById = new Map<string, string | undefined>();
    if (idsOfInterest.length > 0) {
      const scopedText = await this.transport.spacesGetNodes(this.spaceId, idsOfInterest);
      for (const n of parseSpaceStateNodes(scopedText).nodes) {
        valueById.set(n.id, n.value);
      }
    }

    const nodes: SpaceStateNode[] = inventory.map((n) => {
      const scopedValue = valueById.get(n.id);
      const value = scopedValue !== undefined ? scopedValue : n.value;
      return value !== undefined ? { id: n.id, name: n.name, value } : { id: n.id, name: n.name };
    });
    return { nodes };
  }

  async edit(goal: string): Promise<{ readonly editId: string }> {
    const raw = await this.transport.spacesEdit(this.spaceId, goal);
    const json = parseJson(raw, "spaces_edit");
    const editId = stringField(json, "operationId");
    if (editId === undefined) {
      throw new Error("LiveSpaceAdapter: spaces_edit response is missing operationId");
    }
    return { editId };
  }

  async editStatus(editId: string): Promise<EditStatus> {
    const raw = await this.transport.spacesEditStatus(this.spaceId, editId);
    const json = parseJson(raw, "spaces_edit_status");
    if (json["allTerminal"] !== true) return { phase: "running" };

    if (json["workflowStatus"] !== "success") {
      const error = stringField(json, "error") ?? `edit workflowStatus was ${JSON.stringify(json["workflowStatus"])}`;
      return { phase: "failed", error };
    }

    // `creationIdentifiers` is present only on the agent-recovery variant (§ replay/synthetic.ts); a
    // plain inject's terminal editStatus (the real `10` capture) carries no such field at all.
    if (!("creationIdentifiers" in json)) return { phase: "succeeded" };
    return { phase: "succeeded", creationIds: stringArrayField(json, "creationIdentifiers") };
  }

  async run(startNodeId: string, mode: string): Promise<{ readonly runId: string }> {
    const raw = await this.transport.spacesRun(this.spaceId, startNodeId, mode);
    const json = parseJson(raw, "spaces_run");
    const runId = stringField(json, "workflowRunIdentifier");
    if (runId === undefined) {
      throw new Error("LiveSpaceAdapter: spaces_run response is missing workflowRunIdentifier");
    }
    return { runId };
  }

  async runStatus(runId: string): Promise<RunStatus> {
    const raw = await this.transport.spacesRunStatus(this.spaceId, runId);
    const json = parseJson(raw, "spaces_run_status");
    if (json["allTerminal"] !== true) return { phase: "running" };

    if (json["status"] !== "completed") {
      const error = stringField(json, "error") ?? `run status was ${JSON.stringify(json["status"])}`;
      const startNodeMissing = json["startNodeMissing"] === true;
      return startNodeMissing ? { phase: "failed", error, startNodeMissing: true } : { phase: "failed", error };
    }

    const creationIds = stringArrayField(json, "creationIdentifiers");
    const nodeRuns = Array.isArray(json["nodeRuns"]) ? json["nodeRuns"] : [];
    const firedNodeIds = nodeRuns
      .filter(isRecord)
      .map((nr) => stringField(nr, "nodeId"))
      .filter((id): id is string => id !== undefined);
    const firedNodeNames = await this.resolveNodeNames(firedNodeIds);

    return { phase: "succeeded", firedNodeNames, creationIds };
  }

  async fetchCreations(ids: readonly string[]): Promise<readonly Creation[]> {
    const results: Creation[] = [];
    for (const id of ids) {
      // One id at a time, per the real `creations_get` tool; every fetch is fresh — never memoized.
      const raw = await this.transport.creationsGet(id);
      const parsed = parseCreationBlock(raw);
      if (parsed !== null) results.push({ identifier: parsed.identifier, url: parsed.url });
    }
    return results;
  }

  async verifyPinned(character: string): Promise<boolean> {
    const state = await this.readState();
    const node = state.nodes.find((n) => n.name === SELECTED_CHARACTER_NODE_NAME);
    return node?.value === character;
  }

  /**
   * Read one node's text guarded against the ~1,900-char read-API truncation (not part of
   * `SpaceMcpPort` — an adapter-level convenience for a caller that needs guaranteed-complete text; the
   * driver itself only needs before/after CHANGE detection on `JSON Master`, which doesn't require
   * this). Resolves from `docOptions.linkedDocUrl` when the value looks truncated and a fetcher is
   * supplied; otherwise returns the truncated value explicitly flagged.
   */
  async readNodeTextRobust(nodeName: string, docOptions: RobustTextOptions = {}): Promise<RobustTextResult> {
    const state = await this.readState();
    const raw = state.nodes.find((n) => n.name === nodeName)?.value;
    return readNodeTextRobust(raw, docOptions);
  }

  /** Resolve node ids to their real NAMEs via a fresh whole-board read (the MCP reports ids only). */
  private async resolveNodeNames(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const boardText = await this.transport.spacesState(this.spaceId);
    const nodes = parseSpaceStateNodes(boardText).nodes;
    const nameById = new Map(nodes.map((n) => [n.id, n.name] as const));
    return ids.map((id) => nameById.get(id)).filter((name): name is string => name !== undefined);
  }
}
