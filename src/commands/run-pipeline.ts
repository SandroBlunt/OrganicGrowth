/**
 * `/run-pipeline <brand>` conductor command — the weekly loop orchestration shell.
 *
 * This is the single entry point that starts and drives the whole weekly loop for an existing Brand,
 * pausing only at the three human gates (Review, Cast pick, Publish) and resuming across turns and
 * days. It owns the readiness gate — the granular commands stay unguarded power-tools.
 *
 * Design: the conductor is implemented as an async-iterable generator (`conductorTurns`) that yields
 * one `ConductorTurn` per Operator interaction. This makes it testable turn-by-turn without spawning
 * a subprocess or mocking stdin/stdout. The CLI entry point (`main`) iterates the generator and
 * reads readline responses from stdin.
 *
 * Orchestration rules (from the issue and CLAUDE.md):
 *   1. Resolve the Brand via `resolveBrand` — never a fallback Brand.
 *   2. Run readiness (never cached) via `runReadiness` — stop if research-blocking.
 *   3. Print the `/rename <brand> · <ISO-week>` hint; do NOT rename the session.
 *   4. Resolve the phase via `resolvePhase`; if in-flight, ask resume-vs-fresh (no default).
 *   5. Drive the loop, pausing only at Gates 1–3. Reuse existing modules — no duplicate logic.
 *
 * The conductor delegates ALL substantive computation:
 *   - Brand resolution    → `resolveBrand`     (src/brand/resolver.ts)
 *   - Phase resolution    → `resolvePhase`     (src/phase-resolver/resolve.ts)
 *   - Readiness           → `runReadiness`     (./run-pipeline-readiness.ts)
 *   - Re-enqueue          → `enqueueOnAccept`  (src/production-queue/enqueue-on-accept.ts)
 *   - Queue read          → `loadQueue` / filtered by brand
 *   - Ledger read         → `loadIdeas` / `loadReport`
 *   - Report              → `reportCommand`    (./report.ts)
 *
 * Always-rules honored:
 *   - generate-never-publish: the conductor never publishes; Gate 3 is a pause for the Operator.
 *   - ledger-as-source-of-truth: every resume/fresh decision reads the ledger.
 *   - explicit-attribution: Post URLs are logged via /log-post only.
 *   - relative-not-absolute, public-metrics-only: delegated to the underlying commands.
 */

import { readFile } from "node:fs/promises";
import * as readline from "node:readline";

import { resolveBrand, brandExists } from "../brand/resolver.ts";
import { resolvePhase } from "../phase-resolver/resolve.ts";
import { loadIdeas } from "../ledger/ledger.ts";
import { loadQueue } from "../production-queue/store.ts";
import { enqueueOnAccept } from "../production-queue/enqueue-on-accept.ts";
import { runReadiness, findingsBlockPhase } from "./run-pipeline-readiness.ts";
import { reportCommand } from "./report.ts";
import type { Finding } from "../readiness/types.ts";
import type { MagniticReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";

// ---------------------------------------------------------------------------
// ISO week helper
// ---------------------------------------------------------------------------

/**
 * Return the ISO 8601 week string for a given Date (e.g. `"2026-W23"`).
 * Pure: deterministic for a given date input. Uses UTC date components to avoid timezone drift.
 */
export function isoWeek(date: Date): string {
  // Use UTC date components to avoid local-timezone drift when the caller passes a UTC midnight.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week: Thursday of the week determines the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// ConductorTurn — the unit of interaction the conductor yields
// ---------------------------------------------------------------------------

/**
 * One turn of the conductor loop:
 *   - `message`: text to show the Operator (always present).
 *   - `prompt`: if set, the conductor is waiting for a text response from the Operator.
 *   - `done`: if true, the loop has completed (no more turns will be yielded).
 */
export interface ConductorTurn {
  readonly message: string;
  readonly prompt?: string;
  readonly done?: boolean;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for the conductor (injected for testing; defaults to production values at runtime).
 *
 * The ports and path overrides let tests drive the conductor hermetically:
 *   - `magnific` / `apify` — fake probe ports (no live Magnific/Apify calls in tests).
 *   - `brandsRoot` — temp dir to avoid touching real state.
 *   - `queuePath` — temp queue file.
 *   - `now` — injected clock for deterministic timestamps.
 *   - `getInput` — injected stdin so tests can feed "resume"/"fresh" without subprocess.
 */
export interface RunPipelineOptions {
  readonly brandsRoot?: string;
  readonly queuePath?: string;
  readonly now?: () => string;
  /** Injected clock returning a Date (for the ISO-week computation). Default: new Date(). */
  readonly nowDate?: () => Date;
  /** Injected probe ports (fake in tests, live adapters at runtime). */
  readonly magnific?: MagniticReadinessPort;
  readonly apify?: ApifyReadinessPort;
  /**
   * Injected input function: the conductor calls `getInput(prompt)` when it needs an Operator
   * response. Returns the Operator's text. Defaults to reading a line from stdin.
   */
  readonly getInput?: (prompt: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Default probe ports (live MCP / live Apify at runtime)
// ---------------------------------------------------------------------------

/**
 * Default Magnific readiness port — wired to live Magnific at runtime. Tests ALWAYS inject a fake.
 * The live adapter is intentionally minimal (CLAUDE.md: tests use the fake; live probes deferred).
 */
const DEFAULT_MAGNIFIC_PORT: MagniticReadinessPort = {
  async probeSpace() {
    // Runtime placeholder: the live Magnific MCP adapter is wired by the Operator's agent runtime.
    // This path is NEVER exercised in tests (tests inject a fake). If called, assume not accessible.
    return { accessible: false, creditsOk: false };
  },
};

const DEFAULT_APIFY_PORT: ApifyReadinessPort = {
  async probeToken() {
    // Runtime placeholder: live Apify ping is deferred. If called, assume valid (permissive default).
    return true;
  },
};

// ---------------------------------------------------------------------------
// conductorTurns — the testable async generator
// ---------------------------------------------------------------------------

/**
 * The conductor's turn-based async generator. Yields one `ConductorTurn` per Operator interaction.
 *
 * Tests drive this by calling `.next(/* response *\/)` on the generator, passing the Operator's
 * text response for each `prompt` turn. The `getInput` option is an alternative: it is called
 * automatically by the generator when a prompt response is needed (used by the CLI main entry).
 *
 * Design: the generator yields a `ConductorTurn` with a `prompt` when user input is required.
 * The generator-based design allows turn-by-turn unit tests without mocking stdin.
 *
 * @param brand    The Brand slug (e.g. `"mundotip"`).
 * @param options  Injectable options for testing (paths, ports, clock, input).
 */
export async function* conductorTurns(
  brand: string,
  options: RunPipelineOptions = {},
): AsyncGenerator<ConductorTurn, void, string | undefined> {
  const brandsRoot = options.brandsRoot;
  const queuePath = options.queuePath;
  const nowFn = options.now ?? (() => new Date().toISOString());
  const nowDateFn = options.nowDate ?? (() => new Date());
  const magnific = options.magnific ?? DEFAULT_MAGNIFIC_PORT;
  const apify = options.apify ?? DEFAULT_APIFY_PORT;

  // --- Step 1: Brand resolution ---

  const exists = await brandExists(brand, brandsRoot);
  if (!exists) {
    yield {
      message: `/run-pipeline: Brand "${brand}" not found. Create the Brand directory at data/brands/${brand}/ before running the pipeline.`,
      done: true,
    };
    return;
  }

  const brandPaths = resolveBrand(brand, brandsRoot);
  const resolvedQueuePath = queuePath ?? brandPaths.queuePath;

  yield { message: `Running pipeline for Brand: ${brand}` };

  // --- Step 2: Readiness check (never cached) ---

  // Read the ledger baseline for the classify call
  let baseline: number | null = null;
  try {
    const raw: unknown = JSON.parse(await readFile(brandPaths.ledger, "utf8"));
    if (
      typeof raw === "object" && raw !== null &&
      "baseline" in raw &&
      typeof (raw as Record<string, unknown>).baseline === "object"
    ) {
      const b = (raw as Record<string, unknown>).baseline as Record<string, unknown> | null;
      if (b && typeof b.value === "number" && Number.isFinite(b.value)) {
        baseline = b.value;
      }
    }
  } catch {
    // Ledger not readable yet — baseline stays null
  }

  const findings: Finding[] = await runReadiness({
    brandProfilePath: brandPaths.brandProfile,
    seedsPath: brandPaths.seeds,
    baseline,
    magnific,
    apify,
  });

  // The conductor is SILENT when all findings are advisory-only or there are none.
  // It only surfaces output when blocking findings exist (phase-scoped gaps).
  const blockFindings = findings.filter((f) => f.severity === "block");

  if (blockFindings.length > 0) {
    const lines: string[] = ["Readiness check:"];
    for (const f of findings) {
      const icon = f.severity === "block" ? "[BLOCK]" : "[WARN]";
      lines.push(`  ${icon} (${f.phase}) ${f.message}`);
    }
    yield { message: lines.join("\n") };
  }

  // Phase-scoped blocking: a research block stops the launch
  if (findingsBlockPhase(findings, "research")) {
    yield {
      message: "Cannot proceed: one or more readiness blocks prevent research from starting. Resolve the issues above and re-run.",
      done: true,
    };
    return;
  }

  // --- Step 3: Rename hint ---

  const week = isoWeek(nowDateFn());
  yield { message: `/rename ${brand} · ${week}` };

  // --- Step 4: In-flight detection and resume-vs-fresh ---

  const ideas = await loadIdeas(brandPaths.ledger);
  const allJobs = await loadQueue(resolvedQueuePath);
  const brandJobs = allJobs.jobs.filter((j) => j.brand === brand);
  const phaseResult = resolvePhase(ideas, brandJobs);

  // In-flight means production is underway (accepted/casting/produced/posted Ideas exist).
  // A "review" phase (only suggested Ideas) is NOT in-flight: the Operator just hasn't started yet.
  // We only ask resume-vs-fresh when actual production work is in progress — not for un-reviewed Ideas.
  const isInFlight =
    phaseResult.phase === "production" ||
    phaseResult.phase === "publish" ||
    phaseResult.phase === "tracking";

  let startFresh = false;

  if (isInFlight) {
    const gateList = phaseResult.pendingGates.length > 0
      ? `Pending gates: ${phaseResult.pendingGates.join(", ")}.`
      : "No pending gates (queue is draining).";
    const strandedNote = phaseResult.strandedIdeas.length > 0
      ? ` ${phaseResult.strandedIdeas.length} stranded Idea(s) need re-enqueue.`
      : "";

    const inFlightMessage = [
      `In-flight work detected for Brand: ${brand}`,
      `Current phase: ${phaseResult.phase}. ${gateList}${strandedNote}`,
    ].join("\n");

    const resumeResponse: string | undefined = yield {
      message: inFlightMessage,
      prompt: "resume or fresh? (type 'resume' or 'fresh')",
    } as ConductorTurn;

    let response = (resumeResponse ?? "").trim().toLowerCase();

    // Re-prompt until we get an explicit choice (no default)
    while (response !== "resume" && response !== "fresh") {
      const retry: string | undefined = yield {
        message: `Please type 'resume' or 'fresh'. No other value is accepted.`,
        prompt: "resume or fresh? (type 'resume' or 'fresh')",
      } as ConductorTurn;
      response = (retry ?? "").trim().toLowerCase();
    }

    if (response === "resume") {
      // Re-enqueue stranded Ideas
      if (phaseResult.strandedIdeas.length > 0) {
        const lines: string[] = [`Resuming: re-enqueueing ${phaseResult.strandedIdeas.length} stranded Idea(s)...`];
        for (const ideaId of phaseResult.strandedIdeas) {
          await enqueueOnAccept(ideaId, brand, {
            ledgerPath: brandPaths.ledger,
            queuePath: resolvedQueuePath,
            now: nowFn,
          });
          lines.push(`  Enqueued: ${ideaId}`);
        }
        yield { message: lines.join("\n") };
      } else {
        yield { message: `Resuming from phase: ${phaseResult.phase}` };
      }
      startFresh = false;
    } else {
      yield { message: "Starting a fresh weekly Run." };
      startFresh = true;
    }
  }

  // --- Step 5: Loop execution ---

  // Determine the effective phase to drive from
  const effectivePhase = startFresh ? "research" : phaseResult.phase;
  const productionBlocked = findingsBlockPhase(findings, "production");
  const publishBlocked = findingsBlockPhase(findings, "publish");

  // --- Gate 1: Review (research or review phase) ---

  if (effectivePhase === "research" || effectivePhase === "review") {
    yield {
      message: [
        `Gate 1 — Review. Brand: ${brand}`,
        `Run /run-trends ${brand} to discover Trends and generate Ideas, then /review-ideas ${brand} to accept or reject them.`,
        `When you have accepted Ideas, run /run-pipeline ${brand} again to continue.`,
      ].join("\n"),
      prompt: "Press Enter when done with Review (or type 'done')",
    };
    // The conductor pauses here — after the Operator responds, it continues
    // Production auto-drain happens after Review in the resumed invocation
    yield {
      message: [
        `Gate 1 complete. Brand: ${brand}`,
        "Accepted Ideas have been enqueued for production.",
        `After production drains to the Cast gate, run /run-pipeline ${brand} again to continue.`,
      ].join("\n"),
      done: false,
    };
    return;
  }

  // --- Production phase: auto-drain to Cast gate ---

  if (effectivePhase === "production") {
    if (productionBlocked) {
      yield {
        message: [
          `Production is blocked for Brand: ${brand}`,
          "Resolve the readiness issues above before production can proceed.",
        ].join("\n"),
        done: true,
      };
      return;
    }

    // Check if any Ideas are at the cast-pick gate (casting status)
    const castingIdeas = ideas.filter((i) => i.status === "casting");
    const acceptedIdeas = ideas.filter((i) => i.status === "accepted");

    if (acceptedIdeas.length > 0) {
      yield {
        message: [
          `Auto-draining production queue for Brand: ${brand}`,
          `${acceptedIdeas.length} Idea(s) queued for cast generation.`,
          `The producer will drain the queue to the Cast gate. Run /queue ${brand} to see progress.`,
          `When Ideas reach 'casting' status, run /run-pipeline ${brand} again.`,
        ].join("\n"),
        done: false,
      };
      return;
    }

    if (castingIdeas.length > 0) {
      // Gate 2: Cast pick
      yield {
        message: [
          `Gate 2 — Cast pick. Brand: ${brand}`,
          `${castingIdeas.length} Idea(s) are at the Cast gate, waiting for a Character pick.`,
          ...castingIdeas.map((i) => `  Idea: ${i.id} — run /pick-cast ${brand} ${i.id} <n>`),
          `After picking, the Asset will render unattended. Run /run-pipeline ${brand} again when done.`,
        ].join("\n"),
        prompt: "Press Enter when you have picked a Character (or type 'done')",
      };
      yield {
        message: [
          `Gate 2 acknowledged. Brand: ${brand}`,
          `The producer will complete the Asset once your Character pick is processed. Run /run-pipeline ${brand} when production reaches 'produced' status.`,
        ].join("\n"),
        done: false,
      };
      return;
    }
  }

  // --- Publish phase ---

  if (effectivePhase === "publish") {
    if (publishBlocked) {
      yield {
        message: [
          `Publish is blocked for Brand: ${brand}`,
          "Resolve the readiness issues above before publishing.",
        ].join("\n"),
        done: true,
      };
      return;
    }

    const producedIdeas = ideas.filter((i) => i.status === "produced");

    if (producedIdeas.length > 0) {
      yield {
        message: [
          `Gate 3 — Publish. Brand: ${brand}`,
          `${producedIdeas.length} Asset(s) are ready for publication.`,
          ...producedIdeas.map((i) => `  Idea: ${i.id} — publish and run /log-post ${brand} ${i.id} <facebook-url>`),
        ].join("\n"),
        prompt: "Press Enter when you have published and logged the Post URL (or type 'done')",
      };

      // After post logged, offer /track-performance and /report
      yield {
        message: [
          `Gate 3 complete. Brand: ${brand}`,
          `When engagement has accrued (give it a few days), run:`,
          `  /track-performance ${brand}`,
          `  /report ${brand}`,
        ].join("\n"),
        done: true,
      };
      return;
    }
  }

  // --- Tracking / done phase ---

  if (effectivePhase === "tracking") {
    yield {
      message: [
        `Brand: ${brand} — Posts are ready for performance tracking.`,
        `Run /track-performance ${brand} to measure performance, then /report ${brand} to see results.`,
      ].join("\n"),
      done: true,
    };
    return;
  }

  if (effectivePhase === "done") {
    const report = await reportCommand(brand, brandPaths.ledger, brandsRoot);
    yield {
      message: [
        `Weekly loop complete for Brand: ${brand}`,
        "",
        report,
      ].join("\n"),
      done: true,
    };
    return;
  }

  // Fallback
  yield {
    message: `Brand: ${brand} — pipeline state unclear. Run /queue ${brand} and /report ${brand} to check.`,
    done: true,
  };
}

// ---------------------------------------------------------------------------
// runPipelineCommand — testable wrapper
// ---------------------------------------------------------------------------

/**
 * Run the conductor and collect all turn messages into an array (for testing without spawning a
 * subprocess). When a prompt is reached, `getInput(prompt)` is called to get the Operator's
 * response; if `getInput` is not provided, a default no-op response is used (empty string).
 *
 * @param brand    The Brand slug.
 * @param options  Injectable options including the `getInput` callback.
 * @returns        All `ConductorTurn` objects yielded by the generator.
 */
export async function runPipelineCommand(
  brand: string,
  options: RunPipelineOptions = {},
): Promise<ConductorTurn[]> {
  const getInput = options.getInput ?? (() => Promise.resolve(""));
  const turns: ConductorTurn[] = [];
  const gen = conductorTurns(brand, options);

  let result = await gen.next(undefined);
  while (!result.done) {
    const turn = result.value;
    turns.push(turn);
    if (turn.done) break;

    let response: string | undefined;
    if (turn.prompt !== undefined) {
      response = await getInput(turn.prompt);
    }
    result = await gen.next(response);
  }

  return turns;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print conductor output and read responses from stdin. Only runs when invoked directly.
 * Usage: `npx tsx src/commands/run-pipeline.ts <brand>`
 * Brand is required — omitting it is a usage error, never a silent default.
 */
export async function main(): Promise<void> {
  const brand = process.argv[2];
  if (brand === undefined) {
    process.stderr.write("usage: npx tsx src/commands/run-pipeline.ts <brand>\n  e.g. npx tsx src/commands/run-pipeline.ts mundotip\n");
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const getInput = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(`${prompt} `, resolve));

  try {
    await runPipelineCommand(brand, { getInput });
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`/run-pipeline failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
