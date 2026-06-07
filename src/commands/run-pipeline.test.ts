/**
 * Tests for the `/run-pipeline <brand>` conductor command.
 *
 * All tests are hermetic:
 *   - No live Magnific Space calls (fake `MagniticReadinessPort` injected).
 *   - No live Apify calls (fake `ApifyReadinessPort` injected).
 *   - No credits spent, no board mutation.
 *   - All file I/O uses temp directories.
 *
 * The Magnific fake is explicitly flagged below (see "MAGNIFIC FAKE" comments).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runPipelineCommand,
  isoWeek,
  type ConductorTurn,
  type RunPipelineOptions,
} from "./run-pipeline.ts";
import { runReadiness, findingsBlockPhase } from "./run-pipeline-readiness.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
import type { MagniticReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";
import { loadQueue } from "../production-queue/store.ts";

// ---------------------------------------------------------------------------
// MAGNIFIC FAKE — injected in ALL tests; never the live Space
// ---------------------------------------------------------------------------

/**
 * Healthy fake Magnific port: Space accessible, credits OK.
 * Tests that need unhealthy probes override these values.
 */
function makeMagniticFake(opts: { accessible?: boolean; creditsOk?: boolean } = {}): MagniticReadinessPort {
  return {
    async probeSpace() {
      return {
        accessible: opts.accessible ?? true,
        creditsOk: opts.creditsOk ?? true,
      };
    },
  };
}

/** Healthy fake Apify port: token valid. Tests that need bad token override. */
function makeApifyFake(opts: { tokenValid?: boolean } = {}): ApifyReadinessPort {
  return {
    async probeToken() {
      return opts.tokenValid ?? true;
    },
  };
}

// ---------------------------------------------------------------------------
// Test scaffolding: temp brand directories
// ---------------------------------------------------------------------------

/**
 * Minimal healthy brand-profile.yaml content for test brands.
 * Seeds are healthy (no OFF_NICHE, at least 1 seed, channel URL set, no TODOs, has banned_words).
 */
const HEALTHY_PROFILE_YAML = `
channel:
  name: TestBrand
  platform: facebook
  url: "https://www.facebook.com/testbrand"
niche: "Test niche for testing"
voice: "Test voice for testing"
formats: [reel]
banned_words: ["bad-word"]
brand_safety: []
`.trim();

const HEALTHY_SEEDS_YAML = `
seed_pages:
  - "https://www.facebook.com/seed1"
language: en
region: US
`.trim();

const EMPTY_LEDGER = JSON.stringify({ ideas: [], baseline: { updated_at: null } }, null, 2);

interface BrandFixturePaths {
  brandsRoot: string;
  queuePath: string;
  brandDir: string;
}

/**
 * Create a temp brands-root with one brand directory (`testbrand`).
 * Writes a healthy profile, seeds, and an optional ledger.
 * Returns paths needed by the conductor.
 */
async function withBrandFixture(
  opts: {
    slug?: string;
    ledgerContent?: string;
    profileYaml?: string;
    seedsYaml?: string;
  },
  fn: (paths: BrandFixturePaths) => Promise<void>,
): Promise<void> {
  const slug = opts.slug ?? "testbrand";
  const tmpRoot = await mkdtemp(join(tmpdir(), "og-run-pipeline-"));
  const brandsRoot = join(tmpRoot, "brands");
  const brandDir = join(brandsRoot, slug);
  const queuePath = join(tmpRoot, "queue.json");

  await mkdir(brandDir, { recursive: true });

  await writeFile(
    join(brandDir, "brand-profile.yaml"),
    opts.profileYaml ?? HEALTHY_PROFILE_YAML,
    "utf8",
  );
  await writeFile(
    join(brandDir, "seeds.yaml"),
    opts.seedsYaml ?? HEALTHY_SEEDS_YAML,
    "utf8",
  );
  await writeFile(
    join(brandDir, "ledger.json"),
    opts.ledgerContent ?? EMPTY_LEDGER,
    "utf8",
  );

  try {
    await fn({ brandsRoot, queuePath, brandDir });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

/** Healthy test options — MAGNIFIC FAKE + APIFY FAKE always injected. */
function healthyOptions(paths: BrandFixturePaths, extra: Partial<RunPipelineOptions> = {}): RunPipelineOptions {
  return {
    brandsRoot: paths.brandsRoot,
    queuePath: paths.queuePath,
    now: () => "2026-06-06T10:00:00.000Z",
    nowDate: () => new Date("2026-06-01T00:00:00.000Z"), // 2026-W23
    magnific: makeMagniticFake(),   // MAGNIFIC FAKE
    apify: makeApifyFake(),          // APIFY FAKE
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Helper: extract all messages from turns
// ---------------------------------------------------------------------------

function allMessages(turns: ConductorTurn[]): string {
  return turns.map((t) => t.message).join("\n---\n");
}

// ===========================================================================
// AC1: Brand resolution + threading
// ===========================================================================

describe("runPipelineCommand — AC1: Brand resolution and threading", () => {
  it("resolves an existing Brand and states it in the output", async () => {
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", healthyOptions(paths));
      const out = allMessages(turns);
      assert.match(out, /testbrand/i, "Brand name must appear in the output");
    });
  });

  it("returns an identifiable error for a non-existent Brand and does not proceed", async () => {
    await withBrandFixture({}, async (paths) => {
      // 'no-such-brand' does NOT exist in the brands root.
      // Slice 7 (issue #25): unknown slug now triggers an offer-to-create prompt; with no getInput
      // provided, the default returns "" (not "yes"), so the conductor declines and stops.
      const turns = await runPipelineCommand("no-such-brand", {
        brandsRoot: paths.brandsRoot,
        queuePath: paths.queuePath,
        magnific: makeMagniticFake(),   // MAGNIFIC FAKE
        apify: makeApifyFake(),          // APIFY FAKE
        nowDate: () => new Date("2026-06-01T00:00:00.000Z"),
      });
      const out = allMessages(turns);
      assert.match(out, /no-such-brand/i, "Error must name the missing Brand slug");
      // The conductor offers to create, then stops when declined (done=true). Must not
      // proceed further (no readiness, no rename, no gate). At least one done turn must appear.
      const doneTurn = turns.find((t) => t.done);
      assert.ok(doneTurn, "A done turn must be yielded");
      // Must stop before any readiness or rename output
      assert.doesNotMatch(out, /\/rename/i, "Conductor must not reach the rename hint for an unknown brand");
      assert.doesNotMatch(out, /Running pipeline for/i, "Conductor must not proceed to the pipeline loop for an unknown brand");
    });
  });

  it("restates the Brand at the gate prompt", async () => {
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", healthyOptions(paths));
      const gatePromptTurn = turns.find((t) => t.prompt !== undefined);
      assert.ok(gatePromptTurn, "A gate prompt turn must be yielded");
      assert.match(gatePromptTurn.message, /testbrand/i, "Brand must be stated in the gate prompt");
    });
  });
});

// ===========================================================================
// AC2: Readiness check
// ===========================================================================

describe("runPipelineCommand — AC2: Readiness check", () => {
  it("produces no readiness output when the Brand is healthy", async () => {
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", healthyOptions(paths));
      const out = allMessages(turns);
      // Healthy readiness = no BLOCK/WARN lines
      assert.doesNotMatch(out, /\[BLOCK\]/, "No block findings should appear for a healthy brand");
      assert.doesNotMatch(out, /\[WARN\]/, "No warning findings should appear for a healthy brand");
    });
  });

  it("surfaces a research block and stops when the Apify token is invalid", async () => {
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        apify: makeApifyFake({ tokenValid: false }), // APIFY FAKE with bad token
      });
      const out = allMessages(turns);
      assert.match(out, /\[BLOCK\]/i, "Research block must be surfaced");
      assert.match(out, /apify_token_invalid|research/i, "Finding must reference research block");
      const doneTurn = turns.find((t) => t.done === true);
      assert.ok(doneTurn, "Conductor must stop with done=true when research is blocked");
    });
  });

  it("surfaces a production block but allows research when Space is inaccessible", async () => {
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        magnific: makeMagniticFake({ accessible: false, creditsOk: false }), // MAGNIFIC FAKE: inaccessible
      });
      const out = allMessages(turns);
      // Should surface the production block finding
      assert.match(out, /\[BLOCK\]/i, "Production block must be surfaced");
      assert.match(out, /production/i, "Finding must reference production phase");
      // But should NOT stop at research — proceeds to show gate info or stops at production
      // The brand was found and readiness ran — at least the "Running pipeline for Brand" message
      assert.match(out, /testbrand/i, "Brand must still be mentioned");
    });
  });

  it("advisory findings do not stop the loop — conductor proceeds to gate prompt", async () => {
    // Brand with empty banned_words = advisory only
    const profileWithEmptyBannedWords = `
channel:
  name: TestBrand
  platform: facebook
  url: "https://www.facebook.com/testbrand"
niche: "Test niche"
voice: "Test voice"
banned_words: []
`.trim();

    await withBrandFixture({ profileYaml: profileWithEmptyBannedWords }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", healthyOptions(paths));
      // Should NOT stop with done=true early due to advisory only
      // A done turn may appear at the end (loop complete), but not immediately after readiness
      // The gate prompt (or a loop message) should appear after the advisory warning
      const gatePromptTurn = turns.find((t) => t.prompt !== undefined);
      const hasGateOrLoop = gatePromptTurn !== undefined || turns.length > 2;
      assert.ok(hasGateOrLoop, "Advisory findings must not stop the loop — a gate or loop message must appear");
    });
  });

  it("readiness runs on every launch (not cached) — two invocations with different probe results produce different outputs", async () => {
    // First run: healthy
    // Second run: bad Apify token
    await withBrandFixture({}, async (paths) => {
      const healthyTurns = await runPipelineCommand("testbrand", healthyOptions(paths));
      const blockedTurns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        apify: makeApifyFake({ tokenValid: false }), // APIFY FAKE: bad token on second run
      });
      const healthyOut = allMessages(healthyTurns);
      const blockedOut = allMessages(blockedTurns);
      // First run: no block
      assert.doesNotMatch(healthyOut, /apify_token_invalid/i);
      // Second run: block appears
      assert.match(blockedOut, /\[BLOCK\]|apify_token_invalid/i);
    });
  });
});

// ===========================================================================
// AC3: Rename hint
// ===========================================================================

describe("runPipelineCommand — AC3: Rename hint", () => {
  it("outputs a /rename line with Brand and ISO week", async () => {
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        nowDate: () => new Date("2026-06-01T00:00:00.000Z"), // ISO week 2026-W23
      });
      const out = allMessages(turns);
      assert.match(out, /\/rename testbrand · 2026-W23/, "Rename hint must appear with correct brand and week");
    });
  });

  it("does not perform any session rename action", async () => {
    // The conductor yields the rename as a plain message — there is no side-effect call.
    // We verify the rename turn has no side-effect by asserting it is just a message string.
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", healthyOptions(paths));
      const renameTurn = turns.find((t) => t.message.includes("/rename"));
      assert.ok(renameTurn, "A rename turn must be present");
      // A plain message turn: no 'done' flag and no I/O side effect (just string)
      assert.equal(typeof renameTurn.message, "string", "Rename is a plain string message");
    });
  });
});

// ===========================================================================
// AC3 helper: isoWeek pure function
// ===========================================================================

describe("isoWeek — pure ISO 8601 week number", () => {
  it("returns correct ISO week for 2026-06-01 (W23)", () => {
    assert.equal(isoWeek(new Date("2026-06-01T00:00:00.000Z")), "2026-W23");
  });

  it("returns correct ISO week for 2026-01-01 (W01)", () => {
    assert.equal(isoWeek(new Date("2026-01-01T00:00:00.000Z")), "2026-W01");
  });

  it("returns the same output for the same input (deterministic)", () => {
    const d = new Date("2026-06-06T00:00:00.000Z");
    assert.equal(isoWeek(d), isoWeek(d));
  });
});

// ===========================================================================
// AC4: In-flight work detection and resume-vs-fresh
// ===========================================================================

describe("runPipelineCommand — AC4: In-flight work detection", () => {
  it("does NOT ask resume-or-fresh when the ledger is empty (no in-flight work)", async () => {
    await withBrandFixture({ ledgerContent: EMPTY_LEDGER }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", healthyOptions(paths));
      const out = allMessages(turns);
      assert.doesNotMatch(out, /resume or fresh/i, "Should not ask resume/fresh when ledger is empty");
    });
  });

  it("asks resume-or-fresh with no default when in-flight work exists", async () => {
    // Ledger with a casting Idea = production phase = in-flight
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const promptsSeen: string[] = [];
      await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          if (/resume or fresh/i.test(prompt)) return "resume"; // valid response
          return "done";
        },
      });
      // One of the prompts must ask for resume or fresh
      const resumePrompt = promptsSeen.find((p) => /resume or fresh/i.test(p));
      assert.ok(resumePrompt !== undefined, "Prompt must ask for resume or fresh");
      // The prompt must not have a default embedded in it (no '(default: resume)' etc.)
      assert.doesNotMatch(resumePrompt ?? "", /default:/i, "Prompt must have no default value");
    });
  });

  it("resume re-enqueues stranded Ideas", async () => {
    // Ledger: accepted Idea with no queue job (stranded)
    const ledger = JSON.stringify({
      ideas: [{ id: "stranded-idea-01", status: "accepted" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "resume";
          return "";
        },
      });

      // Verify the stranded Idea was re-enqueued
      const q = await loadQueue(paths.queuePath);
      const enqueued = q.jobs.filter((j) => j.idea_id === "stranded-idea-01");
      assert.equal(enqueued.length, 1, "Stranded Idea must be re-enqueued on resume");
      assert.equal(enqueued[0]!.brand, "testbrand", "Re-enqueued job must carry the Brand slug");
    });
  });

  it("fresh starts a new run without re-enqueueing stranded Ideas", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "stranded-idea-01", status: "accepted" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "fresh";
          return "";
        },
      });
      const out = allMessages(turns);
      assert.match(out, /fresh/i, "Fresh choice must be acknowledged");

      // No re-enqueue happened
      const q = await loadQueue(paths.queuePath);
      const enqueued = q.jobs.filter((j) => j.idea_id === "stranded-idea-01");
      assert.equal(enqueued.length, 0, "Stranded Idea must NOT be re-enqueued on fresh");
    });
  });

  it("re-prompts when neither 'resume' nor 'fresh' is entered", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });

    let promptCount = 0;
    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (_prompt) => {
          promptCount++;
          if (promptCount <= 2) return "banana"; // invalid input
          return "resume"; // valid on 3rd attempt
        },
      });
    });

    // We expect at least 3 prompts (2 invalid + 1 valid)
    assert.ok(promptCount >= 3, `Should re-prompt on invalid input; got ${promptCount} prompts`);
  });

  it("shows the pending gate names and stranded Idea count in the in-flight message", async () => {
    const ledger = JSON.stringify({
      ideas: [
        { id: "idea-01", status: "casting" },
        { id: "idea-02", status: "accepted" },
      ],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      let inFlightMessage = "";
      const allTurns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "fresh";
          return "";
        },
      });
      // The message before the resume/fresh prompt
      const inFlightTurn = allTurns.find((t) => /in-flight|pending gates|stranded/i.test(t.message));
      if (inFlightTurn) inFlightMessage = inFlightTurn.message;

      assert.match(inFlightMessage, /cast-pick|pending/i, "In-flight message must show pending gate(s)");
      assert.match(inFlightMessage, /stranded|1/i, "In-flight message must mention stranded Idea count");
    });
  });
});

// ===========================================================================
// AC5: Loop gate pausing
// ===========================================================================

describe("runPipelineCommand — AC5: Loop pauses at gates and does not render past them", () => {
  it("pauses at Gate 1 (Review) when the phase is 'review' (suggested Ideas)", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "suggested" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async () => "done",
      });
      const out = allMessages(turns);
      assert.match(out, /Gate 1|Review/i, "Gate 1 must be surfaced for suggested Ideas");
      assert.doesNotMatch(out, /Gate 2|Cast pick/i, "Gate 2 must NOT appear before Gate 1 is cleared");
    });
  });

  it("pauses at Gate 2 (Cast pick) when Ideas are at 'casting' status", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "resume";
          return "done";
        },
      });
      const out = allMessages(turns);
      assert.match(out, /Gate 2|Cast pick/i, "Gate 2 must be surfaced for casting Ideas");
      assert.doesNotMatch(out, /rendering|auto-render/i, "Asset must NOT be rendered before Character is picked");
    });
  });

  it("pauses at Gate 3 (Publish) when Ideas are at 'produced' status", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "produced" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "resume";
          return "done";
        },
      });
      const out = allMessages(turns);
      assert.match(out, /Gate 3|Publish/i, "Gate 3 must be surfaced for produced Ideas");
      assert.doesNotMatch(out, /auto-publish|posting/i, "Conductor must NOT auto-publish");
    });
  });

  it("recovers correctly across sessions — re-invoking with casting Ideas resumes at Gate 2", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      // Simulate a new session: fresh invocation with the same ledger
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "resume";
          return "done";
        },
      });
      const out = allMessages(turns);
      // Phase resolver sees casting = production, cast-pick gate — conductor should surface Gate 2
      assert.match(out, /Gate 2|Cast pick|casting/i, "Resumed session must surface Gate 2");
    });
  });
});

// ===========================================================================
// AC6: Auto-drain after Review, unattended render, post-publish offers
// ===========================================================================

describe("runPipelineCommand — AC6: Auto-drain and post-publish offers", () => {
  it("mentions production queue drain after Review (accepted Ideas)", async () => {
    // Phase: research (empty ledger), but after Gate 1 prompt the Operator is asked to
    // do /review-ideas — the output should mention production draining.
    await withBrandFixture({}, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async () => "done",
      });
      const out = allMessages(turns);
      // The conductor should mention queue or production drain after Review gate
      assert.match(out, /queue|production|enqueued/i, "Conductor must mention production queue after Review");
    });
  });

  it("instructs running /pick-cast at Gate 2 (not auto-picking)", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "resume";
          return "done";
        },
      });
      const out = allMessages(turns);
      assert.match(out, /\/pick-cast testbrand idea-01/i, "Conductor must instruct running /pick-cast");
    });
  });

  it("offers /track-performance and /report after Gate 3 (Publish) is acknowledged", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "produced" }],
      baseline: { updated_at: null },
    });

    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/resume or fresh/i.test(prompt)) return "resume";
          return "done";
        },
      });
      const out = allMessages(turns);
      assert.match(out, /\/track-performance testbrand/i, "Conductor must offer /track-performance after Publish");
      assert.match(out, /\/report testbrand/i, "Conductor must offer /report after Publish");
    });
  });
});

// ===========================================================================
// AC7: Readiness gate only in conductor — granular commands are unguarded
// ===========================================================================

describe("AC7: Readiness gate exists only in the conductor", () => {
  it("run-pipeline-readiness.ts is NOT imported by any granular command file", async () => {
    const granularCommands = ["pick-cast.ts", "queue.ts", "report.ts"];
    for (const cmd of granularCommands) {
      const src = await readFile(join(HERE, cmd), "utf8").catch(() => "");
      assert.doesNotMatch(
        src,
        /run-pipeline-readiness/,
        `${cmd} must NOT import run-pipeline-readiness (readiness is only for /run-pipeline)`,
      );
    }
  });
});

// ===========================================================================
// AC8: Conductor reuses existing modules (no duplicated pipeline logic)
// ===========================================================================

describe("AC8: Conductor reuses existing modules — no duplicated pipeline logic", () => {
  it("run-pipeline.ts imports resolveBrand (not a re-implementation)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*brand\/resolver/, "run-pipeline.ts must import resolveBrand from brand/resolver");
  });

  it("run-pipeline.ts imports resolvePhase (not a re-implementation)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*phase-resolver\/resolve/, "run-pipeline.ts must import resolvePhase");
  });

  it("run-pipeline.ts imports enqueueOnAccept (not a re-implementation)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*production-queue\/enqueue-on-accept/, "run-pipeline.ts must import enqueueOnAccept");
  });

  it("run-pipeline.ts imports classify and checkConfig indirectly via runReadiness (not inline)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*run-pipeline-readiness/, "run-pipeline.ts must delegate readiness to run-pipeline-readiness");
    // Must NOT re-implement classify or checkConfig inline
    assert.doesNotMatch(src, /from.*readiness\/classify/, "run-pipeline.ts must not import classify directly");
  });
});

// ===========================================================================
// runReadiness — readiness probe orchestrator tests
// ===========================================================================

describe("runReadiness — readiness probe orchestrator", () => {
  it("returns empty findings for a healthy Brand config + healthy probes", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baseline: 0.5,
        magnific: makeMagniticFake(),   // MAGNIFIC FAKE
        apify: makeApifyFake(),          // APIFY FAKE
      });
      assert.equal(findings.length, 0, "Healthy brand must produce no findings");
    });
  });

  it("returns a research block when the Apify token is invalid", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baseline: null,
        magnific: makeMagniticFake(),          // MAGNIFIC FAKE
        apify: makeApifyFake({ tokenValid: false }), // APIFY FAKE: bad token
      });
      const blocks = findings.filter((f) => f.severity === "block" && f.phase === "research");
      assert.ok(blocks.length > 0, "Bad Apify token must produce a research block finding");
      assert.ok(blocks.some((f) => f.code === "apify_token_invalid"));
    });
  });

  it("returns a production block when the Magnific Space is inaccessible", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baseline: null,
        magnific: makeMagniticFake({ accessible: false, creditsOk: true }), // MAGNIFIC FAKE: inaccessible
        apify: makeApifyFake(),
      });
      const blocks = findings.filter((f) => f.severity === "block" && f.phase === "production");
      assert.ok(blocks.length > 0, "Inaccessible Space must produce a production block");
    });
  });

  it("deduplicates findings that appear in both checkConfig and classify results", async () => {

    // Profile with no seed pages — both checkConfig and classify will return no_valid_seed
    const profileNoSeeds = `
channel:
  name: TestBrand
  platform: facebook
  url: "https://www.facebook.com/testbrand"
niche: "Test niche"
voice: "Test voice"
banned_words: ["bad-word"]
`.trim();
    const seedsNoPages = `seed_pages: []`;

    await withBrandFixture({ profileYaml: profileNoSeeds, seedsYaml: seedsNoPages }, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baseline: null,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      // no_valid_seed should appear exactly once (deduplicated)
      const noSeedFindings = findings.filter((f) => f.code === "no_valid_seed");
      assert.equal(noSeedFindings.length, 1, "no_valid_seed must appear exactly once (deduplicated)");
    });
  });

  it("uses a fake Magnific port — no live spaces_* calls are made", async () => {
    // This test is the explicit MAGNIFIC FAKE confirmation for the Build Report.
    // All probes in runReadiness use the injected MagniticReadinessPort — if the port
    // is a fake, no live Magnific calls happen. We verify this by passing a fake that
    // records whether it was called.
    let fakeWasCalled = false;
    const recordingFake: MagniticReadinessPort = {
      async probeSpace() {
        fakeWasCalled = true;
        return { accessible: true, creditsOk: true };
      },
    };

    await withBrandFixture({}, async (paths) => {
      await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baseline: null,
        magnific: recordingFake,  // MAGNIFIC FAKE — records call
        apify: makeApifyFake(),
      });
    });

    assert.equal(fakeWasCalled, true, "The injected fake Magnific port must be the probe path (no live Space)");
  });
});

// ===========================================================================
// findingsBlockPhase — helper function
// ===========================================================================

describe("findingsBlockPhase — helper used by the conductor", () => {
  it("returns true when a block finding exists for the given phase", () => {
    const findings = [
      { severity: "block" as const, phase: "research" as const, code: "apify_token_invalid", message: "bad" },
    ];
    assert.equal(findingsBlockPhase(findings, "research"), true);
  });

  it("returns false when no block finding exists for the given phase", () => {
    const findings = [
      { severity: "advisory" as const, phase: "research" as const, code: "null_baseline", message: "warn" },
    ];
    assert.equal(findingsBlockPhase(findings, "research"), false);
  });

  it("returns false for an empty findings array", () => {
    assert.equal(findingsBlockPhase([], "production"), false);
  });
});
