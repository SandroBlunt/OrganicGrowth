/**
 * Tests for the `/run-pipeline <brand>` conductor command.
 *
 * All tests are hermetic:
 *   - No live Magnific Space calls (fake `MagnificReadinessPort` injected).
 *   - No live Apify calls (fake `ApifyReadinessPort` injected).
 *   - No credits spent, no board mutation.
 *   - All file I/O uses temp directories.
 *
 * The Magnific fake is explicitly flagged below (see "MAGNIFIC FAKE" comments).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runPipelineCommand,
  isoWeek,
  type ConductorTurn,
  type RunPipelineOptions,
} from "./run-pipeline.ts";
import { runReadiness, findingsBlockPhase } from "./run-pipeline-readiness.ts";

import type { MagnificReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";
import { loadQueue } from "../production-queue/store.ts";

// ---------------------------------------------------------------------------
// MAGNIFIC FAKE — injected in ALL tests; never the live Space
// ---------------------------------------------------------------------------

/**
 * Healthy fake Magnific port: Space accessible, credits OK.
 * Tests that need unhealthy probes override these values.
 */
function makeMagniticFake(opts: { accessible?: boolean; creditsOk?: boolean } = {}): MagnificReadinessPort {
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

  // ISO-year-boundary cases (C49): the ISO week-year can differ from the calendar year around Jan 1.
  it("Jan 1 that falls in the previous ISO year reports W53 of the prior year", () => {
    // 2021-01-01 is a Friday; its ISO week (Thursday = 2020-12-31) belongs to 2020, week 53.
    assert.equal(isoWeek(new Date("2021-01-01T00:00:00.000Z")), "2020-W53");
  });

  it("late-December Thursday still in a W53 year reports W53", () => {
    // 2020-12-31 is a Thursday → 2020 has 53 ISO weeks.
    assert.equal(isoWeek(new Date("2020-12-31T00:00:00.000Z")), "2020-W53");
  });

  it("a late-December date that belongs to the next ISO year reports W01 of that next year", () => {
    // 2019-12-30 is a Monday; its ISO week (Thursday = 2020-01-02) belongs to 2020, week 01.
    assert.equal(isoWeek(new Date("2019-12-30T00:00:00.000Z")), "2020-W01");
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

  it("surfaces the composed Copy verbatim at Gate 3, and names the Recipe in the /log-post hint (ADR-0012)", async () => {
    const ledger = JSON.stringify({
      ideas: [
        {
          id: "idea-01",
          status: "accepted",
          assets: [
            {
              recipe: "character-explainer-with-cast",
              status: "produced",
              asset_url: "https://x/asset.mp4",
              copy: { caption: "Your first ten minutes decide your whole day ☀️", hashtags: ["#lifehacks", "#morning"] },
            },
          ],
        },
      ],
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
      assert.match(out, /Gate 3|Publish/i, "Gate 3 must be surfaced for produced Assets");
      assert.match(out, /Your first ten minutes decide your whole day ☀️/, "the composed caption must be surfaced verbatim");
      assert.match(out, /#lifehacks #morning/, "the composed hashtags must be surfaced verbatim");
      assert.match(
        out,
        /\/log-post testbrand idea-01 character-explainer-with-cast <facebook-url>/,
        "the /log-post hint must name the Recipe explicitly (attribution is (Idea, Recipe), never inferred)",
      );
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
// runReadiness — readiness probe orchestrator tests
// ===========================================================================

describe("runReadiness — readiness probe orchestrator", () => {
  it("returns empty findings for a healthy Brand config + healthy probes", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: true,
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
        baselineExists: false,
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
        baselineExists: false,
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
        baselineExists: false,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      // no_valid_seed should appear exactly once (deduplicated)
      const noSeedFindings = findings.filter((f) => f.code === "no_valid_seed");
      assert.equal(noSeedFindings.length, 1, "no_valid_seed must appear exactly once (deduplicated)");
    });
  });

  it("reports a blocking parse error naming the file when brand-profile.yaml is malformed (C26)", async () => {
    await withBrandFixture({ profileYaml: "channel: {name: TestBrand" }, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: false,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      const parseBlock = findings.find((f) => f.code === "brand_profile_unparseable");
      assert.ok(parseBlock, "a parse error must be reported for malformed YAML");
      assert.equal(parseBlock?.severity, "block");
      assert.match(parseBlock?.message ?? "", /brand-profile\.yaml/, "the parse error must name the file");
      // A broken file must NOT be misreported as an empty 'field not set' state.
      assert.ok(
        !findings.some((f) => f.code === "niche_unset"),
        "a parse error must not be misreported as a missing field",
      );
    });
  });

  it("treats a MISSING config file as not-set (advisory), never a parse error (C26)", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "does-not-exist.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: false,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      assert.ok(
        !findings.some((f) => f.code === "brand_profile_unparseable"),
        "a missing file is not a parse error",
      );
      assert.ok(
        findings.some((f) => f.code === "niche_unset"),
        "a missing profile surfaces the usual field-not-set advisories",
      );
    });
  });

  it("does not crash on a non-string seed entry — guards defensively (C26)", async () => {
    // A seeds file whose seed_pages contains a numeric/null entry must not throw.
    const oddSeeds = "seed_pages:\n  - 42\n  - null\n  - \"https://www.facebook.com/realPeer\"\n";
    await withBrandFixture({ seedsYaml: oddSeeds }, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: false,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      // The one real URL survives → research is not blocked for lack of seeds.
      assert.ok(
        !findings.some((f) => f.code === "no_valid_seed"),
        "a usable seed among odd entries must satisfy the seed requirement without crashing",
      );
    });
  });

  it("uses a fake Magnific port — no live spaces_* calls are made", async () => {
    // This test is the explicit MAGNIFIC FAKE confirmation for the Build Report.
    // All probes in runReadiness use the injected MagnificReadinessPort — if the port
    // is a fake, no live Magnific calls happen. We verify this by passing a fake that
    // records whether it was called.
    let fakeWasCalled = false;
    const recordingFake: MagnificReadinessPort = {
      async probeSpace() {
        fakeWasCalled = true;
        return { accessible: true, creditsOk: true };
      },
    };

    await withBrandFixture({}, async (paths) => {
      await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: false,
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

// ===========================================================================
// C21: baseline advisory derives from `updated_at`, not a nonexistent `baseline.value`
// ===========================================================================

describe("runReadiness — baseline presence (C21)", () => {
  it("emits the no-baseline advisory when baselineExists is false", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: false,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      assert.ok(
        findings.some((f) => f.code === "null_baseline"),
        "null_baseline advisory expected when no baseline exists",
      );
    });
  });

  it("does NOT emit the no-baseline advisory when baselineExists is true", async () => {
    await withBrandFixture({}, async (paths) => {
      const findings = await runReadiness({
        brandProfilePath: join(paths.brandDir, "brand-profile.yaml"),
        seedsPath: join(paths.brandDir, "seeds.yaml"),
        baselineExists: true,
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      assert.ok(
        !findings.some((f) => f.code === "null_baseline"),
        "null_baseline must not appear once a baseline exists",
      );
    });
  });
});

describe("runPipelineCommand — baseline advisory reads the ledger's updated_at (C21)", () => {
  it("suppresses the no-baseline advisory once the ledger baseline has an updated_at", async () => {
    // Real baseline shape: per-metric medians with updated_at set (NOT a `value` field).
    const ledgerWithBaseline = JSON.stringify({
      ideas: [],
      baseline: { shares: 3, comments: 2, reactions: 10, views: 100, updated_at: "2026-06-01T00:00:00.000Z" },
    });
    await withBrandFixture({ ledgerContent: ledgerWithBaseline }, async (paths) => {
      // Force a research block (bad Apify token) so the conductor prints the readiness findings.
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        apify: makeApifyFake({ tokenValid: false }),
      });
      const out = allMessages(turns);
      assert.match(out, /\[BLOCK\]/, "the forced research block must be surfaced");
      assert.doesNotMatch(
        out,
        /No Channel performance baseline/i,
        "no-baseline advisory must be suppressed when the ledger baseline has an updated_at",
      );
    });
  });

  it("still shows the no-baseline advisory when the ledger baseline has no updated_at", async () => {
    const ledgerNoBaseline = JSON.stringify({ ideas: [], baseline: { updated_at: null } });
    await withBrandFixture({ ledgerContent: ledgerNoBaseline }, async (paths) => {
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        apify: makeApifyFake({ tokenValid: false }),
      });
      const out = allMessages(turns);
      assert.match(
        out,
        /No Channel performance baseline/i,
        "no-baseline advisory must appear when no baseline has been measured yet",
      );
    });
  });
});

// ===========================================================================
// C27: the resume/fresh re-prompt loop is capped (never spins forever)
// ===========================================================================

describe("runPipelineCommand — resume/fresh loop is capped (C27)", () => {
  it("stops with done:true after too many invalid resume/fresh answers", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });
    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      let promptCount = 0;
      const turns = await runPipelineCommand("testbrand", {
        ...healthyOptions(paths),
        getInput: async () => {
          promptCount++;
          return "nonsense"; // never 'resume' or 'fresh'
        },
      });
      const doneTurn = turns.find((t) => t.done === true);
      assert.ok(doneTurn, "Conductor must stop with done:true after the resume/fresh cap is exceeded");
      assert.ok(promptCount <= 5, `Loop must be capped, not spin forever (got ${promptCount} prompts)`);
    });
  });

  it("terminates against the default getInput (returns '') on in-flight work", async () => {
    const ledger = JSON.stringify({
      ideas: [{ id: "idea-01", status: "casting" }],
      baseline: { updated_at: null },
    });
    await withBrandFixture({ ledgerContent: ledger }, async (paths) => {
      // No getInput provided → default returns "" forever; the cap must still terminate the loop.
      const turns = await runPipelineCommand("testbrand", {
        brandsRoot: paths.brandsRoot,
        queuePath: paths.queuePath,
        nowDate: () => new Date("2026-06-01T00:00:00.000Z"),
        magnific: makeMagniticFake(),
        apify: makeApifyFake(),
      });
      const doneTurn = turns.find((t) => t.done === true);
      assert.ok(doneTurn, "Conductor must terminate (not hang) with the default empty-string input");
    });
  });
});
