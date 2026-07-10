/**
 * Parse a raw `spaces_state` / `spaces_get_nodes` TOON response into the driver's `SpaceStateLike`
 * (`src/execution-protocol/parse.ts`) — pure deep module, no I/O.
 *
 * Per the sanctioned live capture (`src/space-driver/fixtures/live-captures/README.md`), a node's
 * resolved `.value` is:
 *   - its `text` key, for a `text`-type node (e.g. `JSON Master`, `Producer Protocol`), or
 *   - its `creationIdentifier` key, for a `creation` node (e.g. `Selected Character`), or
 *   - its `currentCreationIdentifier` key, for a generator/combiner node (e.g. `Video Combiner`).
 * A node with none of those keys in `nodeData` (most structural/prompt-generator nodes) carries no
 * `.value` at all — matching the shape the existing fake fixture already models.
 */

import type { SpaceStateLike, SpaceStateNode } from "../../execution-protocol/parse.ts";
import { parseToonTables } from "./toon.ts";

const VALUE_KEYS = ["text", "creationIdentifier", "currentCreationIdentifier"] as const;

/**
 * Parse a raw TOON `spaces_state`/`spaces_get_nodes` response into `SpaceStateLike`. Nodes come from
 * the `nodes[N]{...}` table (id, name); a node's `.value` is resolved from the `nodeData[N]{...}` table
 * (present only on a scoped `spaces_get_nodes` read, per the real capture) using the first matching key
 * in {@link VALUE_KEYS}. A response with no `nodes` table at all yields `{ nodes: [] }`.
 */
export function parseSpaceStateNodes(toonText: string): SpaceStateLike {
  const tables = parseToonTables(toonText);
  const nodesTable = tables["nodes"];
  if (!nodesTable) return { nodes: [] };

  const valueByElement = new Map<string, Map<string, string | null>>();
  for (const row of tables["nodeData"]?.rows ?? []) {
    const elementId = row["elementId"];
    const key = row["key"];
    if (elementId === null || elementId === undefined || key === null || key === undefined) continue;
    if (!valueByElement.has(elementId)) valueByElement.set(elementId, new Map());
    valueByElement.get(elementId)!.set(key, row["value"] ?? null);
  }

  const nodes: SpaceStateNode[] = nodesTable.rows.map((row) => {
    const id = row["id"] ?? "";
    const name = row["name"] ?? "";
    const kv = valueByElement.get(id);
    const value = kv ? resolveNodeValue(kv) : undefined;
    return value !== undefined ? { id, name, value } : { id, name };
  });

  return { nodes };
}

/** The first {@link VALUE_KEYS} entry present as a string in this node's key/value map, if any. */
function resolveNodeValue(kv: ReadonlyMap<string, string | null>): string | undefined {
  for (const key of VALUE_KEYS) {
    const value = kv.get(key);
    if (typeof value === "string") return value;
  }
  return undefined;
}
