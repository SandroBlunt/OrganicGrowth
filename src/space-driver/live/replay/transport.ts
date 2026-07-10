/**
 * `ReplayMcpTransport` — a `LiveMcpTransport` that replays the sanctioned live capture's fixture files
 * verbatim (never mutating them, never making a live call). THIS IS THE RECORD/REPLAY TEST HARNESS
 * (issue #40): it lets the live adapter's parsing/mapping/polling logic run against real captured
 * response shapes in a hermetic test — no `spaces_*`/`creations_*` call, no credits, no board mutation,
 * no network.
 *
 * Behavior modelled directly on what was actually captured:
 *   - `spacesRunStatus` returns the real `05` (running) response on its first call, then the real `06`
 *     (terminal) response thereafter — the genuine two-poll sequence the live capture recorded.
 *   - `spacesGetNodes` returns the real `02` (pre-inject) scoped read UNTIL an inject edit targeting
 *     `JSON Master` has been issued and its status polled to terminal, after which it returns the real
 *     `11` (post-inject) capture instead — both are real captures of the SAME board at two points in
 *     time; nothing here is invented.
 *   - `creationsGet` serves the two really-captured ids (`9RwKMfINYZ` from `07`, `IaAOyRntvE` from `08`)
 *     verbatim; any other id (e.g. the cast run's other 5 real ids, which were not individually
 *     `creations_get`-captured to save credits) is served a TEMPLATE reusing `07`'s exact real schema
 *     with only the identifier substituted — clearly not an independent capture for that id.
 *   - When `fallbackCreationIds` is configured, an agent-run-by-goal edit (any edit whose goal is
 *     neither the `JSON Master` inject nor a Character pin) reports those ids on its terminal
 *     `editStatus` via the labelled synthetic `syntheticEditStatusWithCreationIds` builder (see
 *     `synthetic.ts`) — the one real edit capture happened to be a plain inject, which produces no
 *     creations, so the recovery-with-creations shape cannot be served from a real capture alone.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { LiveMcpTransport } from "../transport.ts";
import { syntheticEditStatusWithCreationIds } from "./synthetic.ts";

const CAPTURES_DIR = fileURLToPath(new URL("../../fixtures/live-captures/", import.meta.url));

function readCapture(filename: string): string {
  return readFileSync(`${CAPTURES_DIR}${filename}`, "utf8");
}

/** The real live Space's id (README: "Organic Character Explainer"). */
export const LIVE_SPACE_ID = "a1f05d67-1b98-4d10-9251-6603bea3b578";

/** The real captured cast run's 6 terminal creation ids (fixture `06`). */
export const REAL_CAST_CREATION_IDS: readonly string[] = [
  "9RwKMfINYZ",
  "swKvZXPl8e",
  "NZ7kDum6D9",
  "jSbm3XOLD0",
  "l7ka2IEgv9",
  "xgqtiBnjfW",
];

/** The two creation ids `creations_get` was really captured for (07 image, 08 video/Asset). */
const REALLY_CAPTURED_CREATIONS: ReadonlyMap<string, string> = new Map([
  ["9RwKMfINYZ", "07-creations_get.image.txt"],
  ["IaAOyRntvE", "08-creations_get.video.txt"],
]);

/**
 * Reuses `07`'s exact real key/value schema for a cast creation id that was not individually captured —
 * templated, not captured. Every field but `identifier`/`url` is copied verbatim from the real `07` text.
 */
function templatedImageCreation(identifier: string): string {
  const real = readCapture("07-creations_get.image.txt");
  return real
    .replace(/^identifier: .*$/m, `identifier: ${identifier}`)
    .replace(
      /^url: .*$/m,
      `url: "https://pikaso.cdnpk.net/private/production/0000000000/${identifier}.png?token=REDACTED"`,
    )
    .replace(
      /^webUrl: .*$/m,
      `webUrl: "https://www.magnific.com/app/creation/${identifier}?utm_source=mcp&utm_medium=ai_connector"`,
    );
}

export interface ReplayMcpTransportOptions {
  /**
   * When set, an agent-run-by-goal edit (any `spacesEdit` goal that is neither the `JSON Master` inject
   * nor a Character-pin goal) reports these creation ids on its terminal `editStatus` — the labelled
   * synthetic Fallback-Protocol recovery shape (see the module docstring).
   */
  readonly fallbackCreationIds?: readonly string[];
}

export class ReplayMcpTransport implements LiveMcpTransport {
  private runStatusCalls = 0;
  private jsonMasterInjected = false;
  private lastEditGoal: string | undefined;
  private readonly options: ReplayMcpTransportOptions;

  constructor(options: ReplayMcpTransportOptions = {}) {
    this.options = options;
  }

  async spacesState(): Promise<string> {
    return readCapture("01-spaces_state.board.txt");
  }

  async spacesGetNodes(): Promise<string> {
    return this.jsonMasterInjected
      ? readCapture("11-spaces_get_nodes.jsonmaster-after-inject.txt")
      : readCapture("02-spaces_get_nodes.keynodes.txt");
  }

  async spacesRun(): Promise<string> {
    return readCapture("04-spaces_run.start.json");
  }

  async spacesRunStatus(): Promise<string> {
    this.runStatusCalls++;
    return this.runStatusCalls === 1
      ? readCapture("05-spaces_run_status.running.json")
      : readCapture("06-spaces_run_status.terminal.json");
  }

  async spacesEdit(_spaceId: string, goal: string): Promise<string> {
    this.lastEditGoal = goal;
    return readCapture("09-spaces_edit.start.json");
  }

  async spacesEditStatus(): Promise<string> {
    const goal = this.lastEditGoal ?? "";
    const isInject = goal.includes("JSON Master");
    const isPin = goal.includes("Selected Character") || goal.includes("Character #2");

    if (isInject) {
      this.jsonMasterInjected = true;
      return readCapture("10-spaces_edit_status.terminal.json");
    }
    if (!isPin && this.options.fallbackCreationIds !== undefined) {
      return syntheticEditStatusWithCreationIds(this.options.fallbackCreationIds);
    }
    return readCapture("10-spaces_edit_status.terminal.json");
  }

  async creationsGet(identifier: string): Promise<string> {
    const captured = REALLY_CAPTURED_CREATIONS.get(identifier);
    if (captured !== undefined) return readCapture(captured);
    return templatedImageCreation(identifier);
  }
}
