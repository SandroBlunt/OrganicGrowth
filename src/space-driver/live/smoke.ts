/**
 * Manual, one-off SMOKE test for the live `SpaceMcpPort` adapter (issue #207). NEVER run by `npm test`
 * or `npm run test:docs` — this is not a `*.test.ts` file and nothing else imports it, mirroring
 * `src/media-host/live/smoke.ts`'s own shape.
 *
 * --- WHY THIS SCRIPT CANNOT DO THE WHOLE JOB BY ITSELF (read before running) ---
 *
 * Unlike `media-host`'s AWS smoke test (a real, standalone AWS SDK/CLI call this script can make on its
 * own), there is no standalone client library for the `magnific` MCP server in this repository — the
 * live `spaces_*`/`creations_*` tools are only reachable from INSIDE an attended agent session that has
 * them bound (ADR-0008, "Producer drives the Space attended"; the `developer` build agent deliberately
 * does NOT have them, CLAUDE.md). A spawned `tsx` process has no bridge into that tool-calling channel.
 *
 * So this script does the part that genuinely IS runnable standalone, with zero live calls and zero
 * credits — proving the write-limit refusal actually runs at the `LiveSpaceAdapter` boundary, not just in
 * a unit test double — and then PRINTS the exact runbook for the live-only remainder, which the Operator
 * performs by hand, tool call by tool call, inside their own attended session.
 *
 * Run:   npx tsx src/space-driver/live/smoke.ts   (or: npm run space-driver-smoke)
 * Requires: nothing for Part A (no credentials, no network). Part B requires an attended session with the
 * `magnific` MCP tools and a real Space id.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LiveSpaceAdapter } from "./adapter.ts";
import type { LiveMcpTransport } from "./transport.ts";
import { SPACES_EDIT_WRITE_LIMIT_CHARS, WriteLimitExceededError } from "./write-limit.ts";

const SPACE_ID_PLACEHOLDER = "<a real Space id — see the runbook below>";

/**
 * A transport that throws if ANY method is ever called — used to prove the oversized-goal case makes
 * genuinely ZERO live calls, not merely "we didn't happen to call one this run".
 */
function poisonedTransport(): LiveMcpTransport {
  const poison = (method: string) => () => {
    throw new Error(`SMOKE TEST FAILURE: ${method} was called — the write limit must be checked FIRST`);
  };
  return {
    spacesState: poison("spacesState"),
    spacesGetNodes: poison("spacesGetNodes"),
    spacesRun: poison("spacesRun"),
    spacesRunStatus: poison("spacesRunStatus"),
    spacesEdit: poison("spacesEdit"),
    spacesEditStatus: poison("spacesEditStatus"),
    creationsGet: poison("creationsGet"),
  };
}

/** A transport that RECORDS every `spacesEdit` call and returns a well-formed (but fake) response. */
function recordingTransport(calls: { goal: string; threadId: string }[]): LiveMcpTransport {
  return {
    ...poisonedTransport(),
    async spacesEdit(_spaceId: string, goal: string, threadId: string) {
      calls.push({ goal, threadId });
      return JSON.stringify({ operationId: "smoke-local-noop" });
    },
  };
}

async function partA_writeLimitRefusesBeforeAnyLiveCall(): Promise<void> {
  console.log("[Part A 1/2] a within-limit goal DOES reach the transport, with a real generated threadId");
  const calls: { goal: string; threadId: string }[] = [];
  const withinLimitAdapter = new LiveSpaceAdapter(recordingTransport(calls), SPACE_ID_PLACEHOLDER);
  const withinLimitGoal = "x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS);
  await withinLimitAdapter.edit(withinLimitGoal);
  if (calls.length !== 1 || calls[0]!.goal !== withinLimitGoal || calls[0]!.threadId.length === 0) {
    throw new Error("SMOKE TEST FAILURE: a within-limit goal was not forwarded with a real threadId");
  }
  console.log(`      forwarded correctly: ${withinLimitGoal.length} chars, threadId=${calls[0]!.threadId}`);

  console.log(`[Part A 2/2] an oversized goal (${SPACES_EDIT_WRITE_LIMIT_CHARS + 1} chars) must be ` +
    "refused locally, before the transport is ever touched");
  const adapter = new LiveSpaceAdapter(poisonedTransport(), SPACE_ID_PLACEHOLDER);
  const oversized = "x".repeat(SPACES_EDIT_WRITE_LIMIT_CHARS + 1);
  try {
    await adapter.edit(oversized);
    throw new Error("SMOKE TEST FAILURE: an oversized edit() did not throw at all");
  } catch (error) {
    if (!(error instanceof WriteLimitExceededError)) {
      throw new Error(`SMOKE TEST FAILURE: expected WriteLimitExceededError, got: ${String(error)}`);
    }
    console.log(
      `      refused correctly: ${error.length} chars > ${error.limit}-char cap, zero live calls made`,
    );
  }
}

function printPartBRunbook(): void {
  console.log("\n[Part B — the Operator's own attended-session runbook, NOT run by this script]");
  console.log("Run these steps yourself, inside a Claude Code session with the `magnific` MCP tools");
  console.log("bound, against a real (ideally scratch/disposable) Space:\n");
  console.log("  1. Call `spaces_state` on the real Space id and note the JSON Master node's CURRENT text.");
  console.log(`  2. Call \`spaces_edit\` with a SMALL goal (well under ${SPACES_EDIT_WRITE_LIMIT_CHARS} chars)`);
  console.log('     replacing the JSON Master node with a scratch marker, e.g. `{"smoke":"issue-207-A"}`.');
  console.log("     Note the returned `operationId`/`thread_id`.");
  console.log("  3. Poll `spaces_edit_status` with that `operationId` until `allTerminal:true` and");
  console.log('     `workflowStatus:"success"`.');
  console.log("  4. Call `spaces_state` again and confirm the JSON Master text now reads the scratch");
  console.log("     marker from step 2 — a genuine readback-confirmed write.");
  console.log('  5. Repeat step 2 with a SECOND small goal, e.g. `{"smoke":"issue-207-B"}`, and confirm');
  console.log("     the second call's `thread_id`/`operationId` DIFFERS from the first's — proving no");
  console.log("     shared thread is reused across the two edits (issue #207's ~40-edit truncation risk).");
  console.log("  6. Check Magnific's own credit ledger: an edit-only smoke (no `spaces_run`) should show");
  console.log("     no unexpected credit line — per the sanctioned live capture, only a RUN spends");
  console.log("     credits (the cast run was 375; the one captured edit showed none).");
  console.log("  7. Restore the JSON Master node to whatever it held before step 1 (or leave the scratch");
  console.log("     marker if this Space is a disposable scratch board) — leave no unexplained state.\n");
  console.log("PASS looks like: steps 1-5 all complete exactly as described, with two DIFFERENT thread");
  console.log("ids in step 5 and a confirmed-changed readback in step 4. Any step that does not match —");
  console.log("in particular a truncated node value in step 4, or a shared thread id in step 5 — is a");
  console.log("FAIL and should be filed back onto issue #207 with the exact raw tool responses.");
}

async function main(): Promise<void> {
  await partA_writeLimitRefusesBeforeAnyLiveCall();
  console.log("\nPart A PASSED — the write limit is checked first, with zero live calls.");
  printPartBRunbook();
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((error) => {
    console.error("SMOKE TEST FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
