/**
 * Tests for the phase resolver deep module (`src/phase-resolver/resolve.ts`).
 *
 * AC7: ALL tests are pure — they pass literal in-memory objects directly. No disk, no Magnific
 * Space, no Apify, no network. No fake is needed because the module has no I/O boundary.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePhase, type PhaseResult, type Phase, type PendingGate } from "./resolve.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";
import type { QueueJob } from "../production-queue/queue.ts";

// ---------------------------------------------------------------------------
// Helper builders — literal objects, no disk
// ---------------------------------------------------------------------------

function idea(id: string, status: string): LedgerIdea {
  return { id, status };
}

function job(ideaId: string, brand = "test-brand"): QueueJob {
  return {
    idea_id: ideaId,
    brand,
    phase: "cast",
    status: "queued",
    enqueued_at: "2026-06-06T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// AC1: resolvePhase returns the three required fields
// ---------------------------------------------------------------------------

describe("resolvePhase — return shape (AC1)", () => {
  it("returns a PhaseResult with phase, pendingGates, and strandedIdeas fields", () => {
    const result: PhaseResult = resolvePhase([idea("i1", "accepted")], [job("i1")]);
    assert.equal(typeof result.phase, "string");
    assert.ok(Array.isArray(result.pendingGates), "pendingGates must be an array");
    assert.ok(Array.isArray(result.strandedIdeas), "strandedIdeas must be an array");
  });

  it("phase value is one of the valid Phase strings", () => {
    const validPhases: Phase[] = ["research", "review", "production", "publish", "tracking", "done"];
    const result = resolvePhase([idea("i1", "accepted")], [job("i1")]);
    assert.ok(validPhases.includes(result.phase as Phase), `unexpected phase: ${result.phase}`);
  });

  it("pendingGates contains only valid PendingGate strings", () => {
    const validGates: PendingGate[] = ["review", "cast-pick", "publish", "track"];
    const result = resolvePhase([idea("i1", "casting")], []);
    for (const g of result.pendingGates) {
      assert.ok(validGates.includes(g as PendingGate), `unexpected gate: ${g}`);
    }
  });

  it("strandedIdeas is an array of strings", () => {
    const result = resolvePhase([idea("i1", "accepted")], []);
    for (const s of result.strandedIdeas) {
      assert.equal(typeof s, "string");
    }
  });
});

// ---------------------------------------------------------------------------
// AC2: Empty ledger resolves to research phase
// ---------------------------------------------------------------------------

describe("resolvePhase — empty ledger resolves to research (AC2)", () => {
  it("empty ideas array and empty queue → phase: research", () => {
    const result = resolvePhase([], []);
    assert.equal(result.phase, "research");
  });

  it("empty ledger → no pending gates", () => {
    const result = resolvePhase([], []);
    assert.deepEqual(result.pendingGates, []);
  });

  it("empty ledger → no stranded ideas", () => {
    const result = resolvePhase([], []);
    assert.deepEqual(result.strandedIdeas, []);
  });

  it("empty ideas array with non-empty queue → still research (no ideas = no work)", () => {
    // Queue jobs without any ledger ideas — unusual but defensive
    const result = resolvePhase([], [job("orphan-job")]);
    assert.equal(result.phase, "research");
    assert.deepEqual(result.strandedIdeas, []);
  });
});

// ---------------------------------------------------------------------------
// AC3: Fully-scored run resolves to done
// ---------------------------------------------------------------------------

describe("resolvePhase — fully-scored run resolves to done (AC3)", () => {
  it("all scored → phase: done", () => {
    const ideas = [idea("i1", "scored"), idea("i2", "scored"), idea("i3", "scored")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "done");
  });

  it("all scored → empty pendingGates", () => {
    const ideas = [idea("i1", "scored"), idea("i2", "scored")];
    const result = resolvePhase(ideas, []);
    assert.deepEqual(result.pendingGates, []);
  });

  it("all scored → empty strandedIdeas", () => {
    const ideas = [idea("i1", "scored"), idea("i2", "scored")];
    const result = resolvePhase(ideas, []);
    assert.deepEqual(result.strandedIdeas, []);
  });

  it("all rejected → phase: done (no active work)", () => {
    const ideas = [idea("i1", "rejected"), idea("i2", "rejected")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "done");
    assert.deepEqual(result.pendingGates, []);
    assert.deepEqual(result.strandedIdeas, []);
  });

  it("mix of scored and rejected → phase: done", () => {
    const ideas = [idea("i1", "scored"), idea("i2", "rejected"), idea("i3", "scored")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "done");
    assert.deepEqual(result.pendingGates, []);
    assert.deepEqual(result.strandedIdeas, []);
  });
});

// ---------------------------------------------------------------------------
// AC4: Stranded accepted Ideas surfaced
// ---------------------------------------------------------------------------

describe("resolvePhase — stranded accepted Ideas (AC4)", () => {
  it("accepted idea with no queue job → appears in strandedIdeas", () => {
    const result = resolvePhase([idea("i1", "accepted")], []);
    assert.ok(result.strandedIdeas.includes("i1"), "i1 must be stranded");
  });

  it("stranded accepted → phase is production", () => {
    const result = resolvePhase([idea("i1", "accepted")], []);
    assert.equal(result.phase, "production");
  });

  it("accepted idea WITH matching queue job → NOT stranded", () => {
    const result = resolvePhase([idea("i1", "accepted")], [job("i1")]);
    assert.deepEqual(result.strandedIdeas, []);
  });

  it("accepted idea with matching queue job → phase is production (in-queue work)", () => {
    const result = resolvePhase([idea("i1", "accepted")], [job("i1")]);
    assert.equal(result.phase, "production");
  });

  it("two accepted ideas — only the one without a queue job is stranded", () => {
    const ideas = [idea("idea-A", "accepted"), idea("idea-B", "accepted")];
    const queue = [job("idea-A")]; // only idea-A has a job
    const result = resolvePhase(ideas, queue);
    assert.ok(!result.strandedIdeas.includes("idea-A"), "idea-A should NOT be stranded");
    assert.ok(result.strandedIdeas.includes("idea-B"), "idea-B MUST be stranded");
  });

  it("three accepted ideas — two stranded, one in queue", () => {
    const ideas = [idea("i1", "accepted"), idea("i2", "accepted"), idea("i3", "accepted")];
    const queue = [job("i2")];
    const result = resolvePhase(ideas, queue);
    assert.ok(result.strandedIdeas.includes("i1"));
    assert.ok(!result.strandedIdeas.includes("i2"));
    assert.ok(result.strandedIdeas.includes("i3"));
    assert.equal(result.strandedIdeas.length, 2);
  });

  it("stranded accepted ideas do not add a gate to pendingGates", () => {
    // Stranded ideas need re-enqueue (by the conductor), not a human gate
    const result = resolvePhase([idea("i1", "accepted")], []);
    // "review" gate is for suggested; stranded accepted produces no human gate
    assert.ok(!result.pendingGates.includes("review" as PendingGate));
    assert.ok(!result.pendingGates.includes("cast-pick" as PendingGate));
    assert.ok(!result.pendingGates.includes("publish" as PendingGate));
    assert.ok(!result.pendingGates.includes("track" as PendingGate));
  });
});

// ---------------------------------------------------------------------------
// AC5: casting / produced / posted → correct gates
// ---------------------------------------------------------------------------

describe("resolvePhase — casting Ideas add cast-pick gate (AC5a)", () => {
  it("one casting idea → pendingGates contains cast-pick", () => {
    const result = resolvePhase([idea("i1", "casting")], []);
    assert.ok(result.pendingGates.includes("cast-pick"));
  });

  it("one casting idea → phase is production", () => {
    const result = resolvePhase([idea("i1", "casting")], []);
    assert.equal(result.phase, "production");
  });

  it("casting idea is not stranded (not accepted)", () => {
    const result = resolvePhase([idea("i1", "casting")], []);
    assert.deepEqual(result.strandedIdeas, []);
  });
});

describe("resolvePhase — produced Ideas add publish gate (AC5b)", () => {
  it("one produced idea → pendingGates contains publish", () => {
    const result = resolvePhase([idea("i1", "produced")], []);
    assert.ok(result.pendingGates.includes("publish"));
  });

  it("one produced idea → phase is publish", () => {
    const result = resolvePhase([idea("i1", "produced")], []);
    assert.equal(result.phase, "publish");
  });

  it("produced idea is not stranded", () => {
    const result = resolvePhase([idea("i1", "produced")], []);
    assert.deepEqual(result.strandedIdeas, []);
  });
});

describe("resolvePhase — posted Ideas add track gate (AC5c)", () => {
  it("one posted idea → pendingGates contains track", () => {
    const result = resolvePhase([idea("i1", "posted")], []);
    assert.ok(result.pendingGates.includes("track"));
  });

  it("one posted idea → phase is tracking", () => {
    const result = resolvePhase([idea("i1", "posted")], []);
    assert.equal(result.phase, "tracking");
  });

  it("posted idea is not stranded", () => {
    const result = resolvePhase([idea("i1", "posted")], []);
    assert.deepEqual(result.strandedIdeas, []);
  });
});

describe("resolvePhase — tracking Ideas resolve without a pending gate", () => {
  it("tracking idea → phase is tracking", () => {
    const result = resolvePhase([idea("i1", "tracking")], []);
    assert.equal(result.phase, "tracking");
  });

  it("tracking idea alone → no pending gates", () => {
    // 'tracking' is in-flight but not a human gate — the tracker runs automatically
    const result = resolvePhase([idea("i1", "tracking")], []);
    // No human gate required for tracking-in-progress; the Operator ran /track-performance.
    // posted → track gate; tracking → no additional gate (it's being tracked).
    assert.ok(!result.pendingGates.includes("track" as PendingGate));
  });
});

describe("resolvePhase — suggested Ideas add review gate", () => {
  it("one suggested idea → pendingGates contains review", () => {
    const result = resolvePhase([idea("i1", "suggested")], []);
    assert.ok(result.pendingGates.includes("review"));
  });

  it("one suggested idea → phase is review", () => {
    const result = resolvePhase([idea("i1", "suggested")], []);
    assert.equal(result.phase, "review");
  });
});

// ---------------------------------------------------------------------------
// AC6: Mixed-state ledger resolves deterministically
// ---------------------------------------------------------------------------

describe("resolvePhase — mixed-state ledger (AC6)", () => {
  it("suggested + casting → phase is review (earliest lifecycle position)", () => {
    const ideas = [idea("i1", "suggested"), idea("i2", "casting")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "review");
  });

  it("suggested + casting → pendingGates contains both review and cast-pick", () => {
    const ideas = [idea("i1", "suggested"), idea("i2", "casting")];
    const result = resolvePhase(ideas, []);
    assert.ok(result.pendingGates.includes("review"));
    assert.ok(result.pendingGates.includes("cast-pick"));
  });

  it("casting + produced → phase is production (earlier than publish)", () => {
    const ideas = [idea("i1", "casting"), idea("i2", "produced")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "production");
  });

  it("casting + produced → pendingGates contains both cast-pick and publish", () => {
    const ideas = [idea("i1", "casting"), idea("i2", "produced")];
    const result = resolvePhase(ideas, []);
    assert.ok(result.pendingGates.includes("cast-pick"));
    assert.ok(result.pendingGates.includes("publish"));
  });

  it("produced + posted → phase is publish (earlier than tracking)", () => {
    const ideas = [idea("i1", "produced"), idea("i2", "posted")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "publish");
  });

  it("produced + posted → pendingGates contains both publish and track", () => {
    const ideas = [idea("i1", "produced"), idea("i2", "posted")];
    const result = resolvePhase(ideas, []);
    assert.ok(result.pendingGates.includes("publish"));
    assert.ok(result.pendingGates.includes("track"));
  });

  it("accepted (stranded) + casting → strandedIdeas surfaced, phase production", () => {
    const ideas = [idea("i1", "accepted"), idea("i2", "casting")];
    // i1 has no queue job → stranded
    const result = resolvePhase(ideas, []);
    assert.ok(result.strandedIdeas.includes("i1"));
    assert.equal(result.phase, "production");
    assert.ok(result.pendingGates.includes("cast-pick"));
  });

  it("mixed with scored terminal Ideas — scored does not affect phase if earlier-lifecycle ideas exist", () => {
    const ideas = [idea("i1", "scored"), idea("i2", "posted"), idea("i3", "scored")];
    const result = resolvePhase(ideas, []);
    assert.equal(result.phase, "tracking");
    assert.ok(result.pendingGates.includes("track"));
  });

  it("pendingGates has no duplicates even when multiple ideas of same status exist", () => {
    const ideas = [idea("i1", "casting"), idea("i2", "casting"), idea("i3", "casting")];
    const result = resolvePhase(ideas, []);
    const castPickCount = result.pendingGates.filter((g) => g === "cast-pick").length;
    assert.equal(castPickCount, 1, "cast-pick must appear at most once in pendingGates");
  });

  it("same inputs always produce the same result (deterministic)", () => {
    const ideas = [
      idea("i1", "suggested"),
      idea("i2", "casting"),
      idea("i3", "produced"),
      idea("i4", "scored"),
    ];
    const queue = [job("i2")];
    const r1 = resolvePhase(ideas, queue);
    const r2 = resolvePhase(ideas, queue);
    assert.deepEqual(r1, r2);
  });
});

// ---------------------------------------------------------------------------
// AC7: Pure — no disk, no Magnific, no Apify (structural guarantee via literal inputs)
// ---------------------------------------------------------------------------

describe("resolvePhase — pure and isolation-tested (AC7)", () => {
  it("accepts plain literal LedgerIdea objects — no I/O needed", () => {
    const plainIdea: LedgerIdea = { id: "idea-1", status: "casting" };
    // If this compiles and runs, no I/O system was involved
    const result = resolvePhase([plainIdea], []);
    assert.ok(typeof result.phase === "string");
  });

  it("accepts plain literal QueueJob objects — no I/O needed", () => {
    const plainJob: QueueJob = {
      idea_id: "idea-1",
      brand: "mundotip",
      phase: "cast",
      status: "queued",
      enqueued_at: "2026-06-06T00:00:00Z",
    };
    const result = resolvePhase([idea("idea-1", "accepted")], [plainJob]);
    assert.deepEqual(result.strandedIdeas, []);
  });

  it("does not mutate the input ideas array", () => {
    const ideas: LedgerIdea[] = [idea("i1", "casting"), idea("i2", "produced")];
    const snapshot = JSON.stringify(ideas);
    resolvePhase(ideas, []);
    assert.equal(JSON.stringify(ideas), snapshot, "ideas array must not be mutated");
  });

  it("does not mutate the input queue array", () => {
    const queue: QueueJob[] = [job("i1")];
    const snapshot = JSON.stringify(queue);
    resolvePhase([idea("i1", "accepted")], queue);
    assert.equal(JSON.stringify(queue), snapshot, "queue array must not be mutated");
  });
});
