import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pickCommand, resumeGate, nextGateAfter, main as pickMain } from "./pick.ts";
import { loadQueue, saveQueue } from "../production-queue/store.ts";
import type { QueueState } from "../production-queue/queue.ts";

const WIRED_RECIPE = "character-explainer-with-cast";
const PICK_NOW = "2026-06-05T12:00:00.000Z";

async function withQueue(fn: (queuePath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-pick-"));
  const queuePath = join(dir, "queue.json"); // a missing file loads as the empty queue
  try {
    await fn(queuePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// === nextGateAfter — resolves a Recipe's gate list, defensively, never crashing ======================

describe("nextGateAfter — the gate AFTER a given gate in a Recipe's own declared order", () => {
  it("resolves to null when `gate` is the wired Recipe's LAST (and only) declared gate", () => {
    assert.equal(nextGateAfter(WIRED_RECIPE, "cast"), null);
  });

  it("resolves to null for an unwired/unknown Recipe slug (defensive, never throws)", () => {
    assert.equal(nextGateAfter("not-a-real-recipe", "cast"), null);
  });

  it("resolves to null when `gate` is not one of the Recipe's own declared gates", () => {
    assert.equal(nextGateAfter(WIRED_RECIPE, "some-other-gate"), null);
  });
});

// === resumeGate — the generic queue-resume mechanics shared by /pick and /pick-cast ==================

describe("resumeGate — enqueues the generic next leg and clears the resolved gate", () => {
  it("enqueues a queued next-leg job carrying the resolved pick and the resolved next gate", async () => {
    await withQueue(async (queuePath) => {
      const { newlyQueued, nextGate } = await resumeGate(
        "mundotip",
        "idea-A",
        WIRED_RECIPE,
        "cast",
        "cast-2",
        queuePath,
        PICK_NOW,
      );
      assert.equal(newlyQueued, true);
      assert.equal(nextGate, null);

      const q = await loadQueue(queuePath);
      const job = q.jobs.find((j) => j.idea_id === "idea-A" && j.gate === null);
      assert.ok(job !== undefined);
      assert.equal(job!.brand, "mundotip");
      assert.equal(job!.recipe, WIRED_RECIPE);
      assert.equal(job!.pick, "cast-2");
      assert.equal(job!.status, "queued");
      assert.equal(job!.enqueued_at, PICK_NOW);
    });
  });

  it("is idempotent per (brand, idea, recipe, nextGate) — a second resume of the SAME gate adds no duplicate", async () => {
    await withQueue(async (queuePath) => {
      await resumeGate("mundotip", "idea-A", WIRED_RECIPE, "cast", "cast-2", queuePath, PICK_NOW);
      const second = await resumeGate(
        "mundotip",
        "idea-A",
        WIRED_RECIPE,
        "cast",
        "cast-3",
        queuePath,
        "2026-06-05T13:00:00.000Z",
      );
      assert.equal(second.newlyQueued, false);

      const q = await loadQueue(queuePath);
      const nextLegs = q.jobs.filter((j) => j.idea_id === "idea-A" && j.gate === null);
      assert.equal(nextLegs.length, 1);
      // The FIRST resolved pick stands — the second call changed nothing.
      assert.equal(nextLegs[0]!.pick, "cast-2");
    });
  });

  it("clears the gate: an awaiting_pick job at the resolved gate becomes done (C24, generalized)", async () => {
    await withQueue(async (queuePath) => {
      const atGate: QueueState = {
        jobs: [
          {
            idea_id: "idea-A",
            brand: "mundotip",
            recipe: WIRED_RECIPE,
            gate: "cast",
            status: "awaiting_pick",
            enqueued_at: "2026-06-05T10:00:00.000Z",
          },
        ],
        lock: { active_job: null },
      };
      await saveQueue(atGate, queuePath);

      await resumeGate("mundotip", "idea-A", WIRED_RECIPE, "cast", "cast-1", queuePath, PICK_NOW);

      const q = await loadQueue(queuePath);
      const gated = q.jobs.find((j) => j.idea_id === "idea-A" && j.gate === "cast")!;
      assert.equal(gated.status, "done");
    });
  });

  it("resolving a gate with NO matching Recipe defensively targets the final (gate: null) leg", async () => {
    await withQueue(async (queuePath) => {
      const { nextGate } = await resumeGate(
        "mundotip",
        "idea-B",
        "an-unwired-synthetic-recipe",
        "some-gate",
        "pick-value",
        queuePath,
        PICK_NOW,
      );
      assert.equal(nextGate, null);
      const q = await loadQueue(queuePath);
      assert.ok(q.jobs.some((j) => j.idea_id === "idea-B" && j.recipe === "an-unwired-synthetic-recipe" && j.gate === null));
    });
  });
});

// === pickCommand — the generic /pick <brand> <idea-id> <recipe> <gate> <pick> command ================

describe("pickCommand — submits a resolved pick for any Recipe's any gate and resumes production", () => {
  it("records the pick and reports resuming toward the final render for the wired Recipe's last gate", async () => {
    await withQueue(async (queuePath) => {
      const out = await pickCommand("mundotip", "idea-A", WIRED_RECIPE, "cast", "cast-2", {
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(out, /idea-A/);
      assert.match(out, /cast-2/);
      assert.match(out, /final render/i);
      assert.match(out, /Brand: mundotip/);
    });
  });

  it("works for a Recipe/gate pair not tied to the wired Cast Recipe (generic — never Cast-specific)", async () => {
    await withQueue(async (queuePath) => {
      const out = await pickCommand("acme", "idea-Z", "future-recipe", "review", "candidate-9", {
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(out, /idea-Z/);
      assert.match(out, /candidate-9/);
      assert.match(out, /"review"/);
      assert.match(out, /Brand: acme/);

      const q = await loadQueue(queuePath);
      const job = q.jobs.find((j) => j.idea_id === "idea-Z");
      assert.ok(job !== undefined);
      assert.equal(job!.brand, "acme");
      assert.equal(job!.recipe, "future-recipe");
      assert.equal(job!.pick, "candidate-9");
    });
  });

  it("reports honestly on a re-pick — the second call claims no new work and the first pick stands", async () => {
    await withQueue(async (queuePath) => {
      const first = await pickCommand("mundotip", "idea-A", WIRED_RECIPE, "cast", "cast-2", {
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(first, /resuming production/i);

      const second = await pickCommand("mundotip", "idea-A", WIRED_RECIPE, "cast", "cast-3", {
        queuePath,
        now: () => "2026-06-05T13:00:00.000Z",
      });
      assert.match(second, /no change/i);

      const q = await loadQueue(queuePath);
      const nextLegs = q.jobs.filter((j) => j.idea_id === "idea-A" && j.gate === null);
      assert.equal(nextLegs.length, 1);
      assert.equal(nextLegs[0]!.pick, "cast-2");
    });
  });

  it("refuses an empty pick value without touching the queue", async () => {
    await withQueue(async (queuePath) => {
      const out = await pickCommand("mundotip", "idea-A", WIRED_RECIPE, "cast", "   ", {
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(out, /pick value is required/i);
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.length, 0);
    });
  });
});

// === CLI main() — usage-error path when any positional argument is absent ============================

describe("pick CLI main() — exits with usage error when an argument is missing", () => {
  it("writes a usage message to stderr and sets a non-zero exit code when no args are given", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };

    try {
      process.argv = ["node", "pick.ts"];
      process.exitCode = 0;

      await pickMain();

      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i, "stderr must contain a usage message when arguments are absent");
      assert.notEqual(process.exitCode, 0, "process.exitCode must be non-zero when arguments are absent");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });
});
