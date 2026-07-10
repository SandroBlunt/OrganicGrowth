/**
 * The injectable live-MCP transport seam — the ONLY boundary `LiveSpaceAdapter` calls through.
 *
 * One method per `magnific` MCP tool the adapter needs, each returning the tool's raw textual response
 * exactly as the MCP call would (JSON text for `spaces_run`/`spaces_run_status`/`spaces_edit`/
 * `spaces_edit_status`; TOON text for `spaces_state`/`spaces_get_nodes`; a key/value block for
 * `creations_get`). The adapter owns all parsing; this interface owns none — it is a pure transport.
 *
 * The `developer` build agent has no `magnific` MCP tools (hermetic build, CLAUDE.md). Tests inject
 * `ReplayMcpTransport` (`live/replay/transport.ts`) — which returns the sanctioned live capture's fixture
 * files verbatim — or a hand-rolled stub for isolated unit tests. Nothing in this package calls a live
 * `spaces_*`/`creations_*` MCP tool.
 */
export interface LiveMcpTransport {
  /** `spaces_state` — the whole-board TOON snapshot. */
  spacesState(spaceId: string): Promise<string>;
  /** `spaces_get_nodes` — a TOON snapshot scoped to the given node ids. */
  spacesGetNodes(spaceId: string, nodeIds: readonly string[]): Promise<string>;
  /** `spaces_run` — start a run at `startNodeId` in `mode`. Raw JSON text. */
  spacesRun(spaceId: string, startNodeId: string, mode: string): Promise<string>;
  /** `spaces_run_status` — poll a run's status. Raw JSON text. */
  spacesRunStatus(spaceId: string, runId: string): Promise<string>;
  /** `spaces_edit` — issue a natural-language edit goal. Raw JSON text. */
  spacesEdit(spaceId: string, goal: string): Promise<string>;
  /** `spaces_edit_status` — poll an edit's status. Raw JSON text. */
  spacesEditStatus(spaceId: string, editId: string): Promise<string>;
  /** `creations_get` — fetch one creation by identifier (one at a time). A key/value text block. */
  creationsGet(identifier: string): Promise<string>;
}
