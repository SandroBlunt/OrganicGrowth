/**
 * SYNTHESIZED fixtures — NOT live captures.
 *
 * The one sanctioned live capture (`src/space-driver/fixtures/live-captures/README.md`, "NOT captured")
 * only exercised SUCCESS paths: a `runStatus` reporting `phase:"failed"` (including the
 * `startNodeMissing` Fallback-Protocol trigger), a failed `editStatus`, and an agent-recovery
 * `editStatus` that surfaces `creationIdentifiers` (the one real edit capture happened to be a plain
 * `JSON Master` inject, which produces no creations) were never exercised live.
 *
 * These builders hand-construct the raw JSON the adapter would receive for those cases, extrapolated
 * from the REAL success shapes' field names (`allTerminal`, `status`, `workflowStatus`,
 * `workflowRunIdentifier`, `operationId`, `creationIdentifiers`, `error`, `startNodeMissing`) — never
 * presented as captured. A second live capture (deliberately out of this slice's scope; see the parent
 * epic #39) would be needed to confirm the exact real shape of a genuine failure response.
 */

export type SyntheticRunFailureReason = "generic" | "start-node-missing";

/** A synthesized terminal `spaces_run_status` reporting failure (optionally start-node-missing). */
export function syntheticFailedRunStatus(reason: SyntheticRunFailureReason): string {
  return JSON.stringify({
    success: true,
    allTerminal: true,
    workflowRunIdentifier: "SNm4BWUb8d",
    status: "failed",
    createdAt: "2026-07-10T08:11:37.000000Z",
    completedAt: "2026-07-10T08:11:50.000000Z",
    creationIdentifiers: [],
    nodeRuns: [],
    error:
      reason === "start-node-missing"
        ? "start node bfd20cd1-9468-4e96-a237-157b9aefda8f is no longer on the canvas"
        : "the run failed",
    ...(reason === "start-node-missing" ? { startNodeMissing: true } : {}),
  });
}

/** A synthesized terminal `spaces_edit_status` reporting failure. */
export function syntheticFailedEditStatus(): string {
  return JSON.stringify({
    success: true,
    allTerminal: true,
    operationId: "01KX5HCG31B3JN7CHJAVBW8VEQ",
    workflowStatus: "failed",
    error: "the spaces_specialist agent could not complete the requested edit",
  });
}

/**
 * A synthesized terminal `spaces_edit_status` for the agent-run-by-goal Fallback-Protocol recovery
 * path: it succeeds AND reports the creations the agent produced. Extends the REAL captured terminal
 * shape (`10`) with a `creationIdentifiers` field — synthesized because the one real edit capture was a
 * plain `JSON Master` inject (which produces no creations), not a recovery run.
 */
export function syntheticEditStatusWithCreationIds(creationIds: readonly string[]): string {
  return JSON.stringify({
    success: true,
    allTerminal: true,
    operationId: "01KX5HCG31B3JN7CHJAVBW8VEQ",
    workflowStatus: "success",
    creationIdentifiers: creationIds,
  });
}
