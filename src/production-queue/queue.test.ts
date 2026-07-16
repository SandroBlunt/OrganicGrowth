import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emptyQueue,
  enqueue,
  enqueueNextLeg,
  hasJobFor,
  hasJobAtGate,
  type QueueState,
} from "./queue.ts";
import { formatQueue } from "./format.ts";

const BRAND_A = "alpha";
const BRAND_B = "beta";
const RECIPE = "character-explainer-with-cast";
const RECIPE_2 = "carousel";

/** A fixture queue state with one existing job, used to prove append + no-duplicate. */
function fixtureWithOneJob(): QueueState {
  return {
    jobs: [
      {
        idea_id: "idea-2026-W22-01",
        brand: BRAND_A,
        recipe: RECIPE,
        gate: "cast",
        status: "queued",
        enqueued_at: "2026-06-05T10:00:00.000Z",
      },
    ],
    lock: { active_job: null },
  };
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe("emptyQueue", () => {
  it("is well-formed: no jobs, lock free", () => {
    const q = emptyQueue();
    assert.deepEqual(q.jobs, []);
    assert.equal(q.lock.active_job, null);
  });
});

describe("enqueue (append + no-duplicate, keyed on (brand, idea, recipe))", () => {
  it("appends exactly one queued job targeting the given gate", () => {
    const before = emptyQueue();
    const after = enqueue(before, "idea-2026-W22-02", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE, "cast");

    assert.equal(after.jobs.length, 1);
    const job = after.jobs[0]!;
    assert.equal(job.idea_id, "idea-2026-W22-02");
    assert.equal(job.recipe, RECIPE);
    assert.equal(job.gate, "cast");
    assert.equal(job.status, "queued");
  });

  it("supports a gateless first leg (gate: null — an unattended end-to-end Recipe)", () => {
    const after = enqueue(emptyQueue(), "idea-X", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE, null);
    assert.equal(after.jobs[0]!.gate, null);
  });

  it("stamps brand + recipe on the enqueued job (AC1, AC2, issue #56)", () => {
    const after = enqueue(emptyQueue(), "idea-X", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE, "cast");
    assert.equal(after.jobs[0]!.brand, BRAND_A);
    assert.equal(after.jobs[0]!.recipe, RECIPE);
  });

  it("stamps enqueued_at as the injected ISO-8601 timestamp", () => {
    const after = enqueue(emptyQueue(), "idea-2026-W22-02", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE, "cast");
    const job = after.jobs[0]!;
    assert.equal(job.enqueued_at, "2026-06-05T11:00:00.000Z");
    assert.match(job.enqueued_at, ISO_8601);
  });

  it("appends to an existing fixture queue without dropping prior jobs", () => {
    const before = fixtureWithOneJob();
    const after = enqueue(before, "idea-2026-W22-02", "2026-06-05T11:00:00.000Z", BRAND_B, RECIPE, "cast");

    assert.equal(after.jobs.length, 2);
    assert.equal(after.jobs[0]!.idea_id, "idea-2026-W22-01");
    assert.equal(after.jobs[1]!.idea_id, "idea-2026-W22-02");
    assert.equal(after.jobs[1]!.brand, BRAND_B);
  });

  it("does NOT treat two Brands' identical Idea id as a duplicate — both enqueue (C6)", () => {
    // Idea ids are not Brand-unique; the second Brand's job must NOT be masked by the first.
    const before = fixtureWithOneJob(); // BRAND_A holds idea-2026-W22-01
    const after = enqueue(before, "idea-2026-W22-01", "2026-06-05T11:00:00.000Z", BRAND_B, RECIPE, "cast");

    assert.equal(after.jobs.length, 2, "the second Brand's colliding Idea id must still enqueue");
    assert.equal(after.jobs[1]!.brand, BRAND_B);
    assert.equal(after.jobs[1]!.idea_id, "idea-2026-W22-01");
  });

  it("a SECOND Recipe on the SAME (brand, idea) is NOT dropped as a duplicate (issue #56 AC1)", () => {
    const before = fixtureWithOneJob(); // BRAND_A holds idea-2026-W22-01 / RECIPE
    const after = enqueue(before, "idea-2026-W22-01", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE_2, "cast");

    assert.equal(after.jobs.length, 2, "the second Recipe's job must not be masked by the first Recipe's");
    const recipes = after.jobs.map((j) => j.recipe).sort();
    assert.deepEqual(recipes, [RECIPE, RECIPE_2].sort());
  });

  it("re-enqueues an Idea/Recipe whose only prior job FAILED — a failure is not a dead end (C4)", () => {
    const withFailed: QueueState = {
      jobs: [
        {
          idea_id: "idea-2026-W22-07",
          brand: BRAND_A,
          recipe: RECIPE,
          gate: "cast",
          status: "failed",
          enqueued_at: "2026-06-05T09:00:00.000Z",
        },
      ],
      lock: { active_job: null },
    };
    const after = enqueue(withFailed, "idea-2026-W22-07", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE, "cast");
    assert.equal(after.jobs.length, 2, "a fresh queued job is appended past the failed one");
    const fresh = after.jobs.find((j) => j.status === "queued")!;
    assert.equal(fresh.idea_id, "idea-2026-W22-07");
    assert.equal(fresh.brand, BRAND_A);
  });

  it("does NOT duplicate a job when the same (brand, idea, recipe) is enqueued again", () => {
    const before = fixtureWithOneJob();
    const after = enqueue(before, "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, "cast");

    assert.equal(after.jobs.length, 1);
    assert.equal(after.jobs[0]!.idea_id, "idea-2026-W22-01");
    // unchanged: still the original enqueued_at, no second job
    assert.equal(after.jobs[0]!.enqueued_at, "2026-06-05T10:00:00.000Z");
  });

  it("is idempotent: re-enqueue returns the same state reference (no work)", () => {
    const before = fixtureWithOneJob();
    const after = enqueue(before, "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, "cast");
    assert.equal(after, before);
  });

  it("is pure: it never mutates the input state", () => {
    const before = emptyQueue();
    const snapshot = JSON.stringify(before);
    enqueue(before, "idea-2026-W22-02", "2026-06-05T11:00:00.000Z", BRAND_A, RECIPE, "cast");
    assert.equal(JSON.stringify(before), snapshot);
    assert.equal(before.jobs.length, 0);
  });
});

describe("hasJobFor", () => {
  it("is true for an (idea, recipe) already in the queue and false otherwise", () => {
    const q = fixtureWithOneJob();
    assert.equal(hasJobFor(q, BRAND_A, "idea-2026-W22-01", RECIPE), true);
    assert.equal(hasJobFor(q, BRAND_A, "idea-2026-W22-99", RECIPE), false);
  });

  it("is keyed on (brand, idea_id, recipe) — a different Brand's same Idea id does not match (C6)", () => {
    const q = fixtureWithOneJob(); // BRAND_A holds idea-2026-W22-01
    assert.equal(hasJobFor(q, BRAND_B, "idea-2026-W22-01", RECIPE), false);
  });

  it("is keyed on recipe too — a different Recipe of the same Idea does not match (issue #56)", () => {
    const q = fixtureWithOneJob(); // BRAND_A/idea-2026-W22-01 holds RECIPE, not RECIPE_2
    assert.equal(hasJobFor(q, BRAND_A, "idea-2026-W22-01", RECIPE_2), false);
  });

  it("ignores a terminal (failed/done) job — the (Idea, Recipe) reads as re-enqueueable (C4)", () => {
    const q: QueueState = {
      jobs: [
        { idea_id: "idea-f", brand: BRAND_A, recipe: RECIPE, gate: "cast", status: "failed", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-d", brand: BRAND_A, recipe: RECIPE, gate: null, status: "done", enqueued_at: "2026-06-05T10:01:00.000Z" },
      ],
      lock: { active_job: null },
    };
    assert.equal(hasJobFor(q, BRAND_A, "idea-f", RECIPE), false, "a failed-only (Idea, Recipe) has no live job");
    assert.equal(hasJobFor(q, BRAND_A, "idea-d", RECIPE), false, "a done-only (Idea, Recipe) has no live job");
  });
});

describe("enqueueNextLeg (a resolved gate's pick enqueues the next leg)", () => {
  /** An Idea whose cast job has reached its gate, ready for the next leg to be enqueued. */
  function castAtGate(): QueueState {
    return {
      jobs: [
        {
          idea_id: "idea-2026-W22-01",
          brand: BRAND_A,
          recipe: RECIPE,
          gate: "cast",
          status: "awaiting_pick",
          enqueued_at: "2026-06-05T10:00:00.000Z",
        },
      ],
      lock: { active_job: null },
    };
  }

  it("appends exactly one queued job for the FINAL leg (gate: null)", () => {
    const after = enqueueNextLeg(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, null, "cast-2");
    const nextLegs = after.jobs.filter((j) => j.gate === null);
    assert.equal(nextLegs.length, 1);
    const job = nextLegs[0]!;
    assert.equal(job.idea_id, "idea-2026-W22-01");
    assert.equal(job.status, "queued");
    assert.equal(job.enqueued_at, "2026-06-05T12:00:00.000Z");
    assert.match(job.enqueued_at, ISO_8601);
  });

  it("stamps the chosen pick onto the next-leg job (C1, generalized)", () => {
    const after = enqueueNextLeg(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, null, "cast-4");
    const nextLeg = after.jobs.find((j) => j.gate === null)!;
    assert.equal(nextLeg.pick, "cast-4", "the Operator's pick must ride on the next-leg job");
    // The earlier (cast-targeting) job never carries a pick.
    const castJob = after.jobs.find((j) => j.gate === "cast")!;
    assert.equal(castJob.pick, undefined);
  });

  it("stamps brand + recipe on the next-leg job (AC1, AC6, issue #56)", () => {
    const after = enqueueNextLeg(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_B, RECIPE, null, "cast-1");
    const nextLeg = after.jobs.find((j) => j.gate === null)!;
    assert.equal(nextLeg.brand, BRAND_B);
    assert.equal(nextLeg.recipe, RECIPE);
  });

  it("preserves the (Idea, Recipe)'s prior gated job (a next leg is distinct from it)", () => {
    const after = enqueueNextLeg(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, null, "cast-1");
    assert.equal(after.jobs.filter((j) => j.gate === "cast").length, 1);
    assert.equal(after.jobs.length, 2);
  });

  it("does NOT duplicate the next-leg job when called again for the same (idea, recipe, gate)", () => {
    const once = enqueueNextLeg(castAtGate(), "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, null, "cast-1");
    const twice = enqueueNextLeg(once, "idea-2026-W22-01", "2026-06-05T13:00:00.000Z", BRAND_A, RECIPE, null, "cast-5");
    assert.equal(twice.jobs.filter((j) => j.gate === null).length, 1);
    assert.equal(twice, once); // idempotent: same reference, no work
    // the first pick stands — the second (different) pick does NOT overwrite it
    assert.equal(twice.jobs.find((j) => j.gate === null)!.pick, "cast-1");
  });

  it("is pure: it never mutates the input state", () => {
    const before = castAtGate();
    const snapshot = JSON.stringify(before);
    enqueueNextLeg(before, "idea-2026-W22-01", "2026-06-05T12:00:00.000Z", BRAND_A, RECIPE, null, "cast-1");
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("hasJobAtGate", () => {
  it("distinguishes a first-leg (gated) job from a next-leg (final) job for the same (Idea, Recipe)", () => {
    const q = enqueueNextLeg(
      {
        jobs: [
          {
            idea_id: "idea-X",
            brand: BRAND_A,
            recipe: RECIPE,
            gate: "cast",
            status: "awaiting_pick",
            enqueued_at: "2026-06-05T10:00:00.000Z",
          },
        ],
        lock: { active_job: null },
      },
      "idea-X",
      "2026-06-05T12:00:00.000Z",
      BRAND_A,
      RECIPE,
      null,
      "cast-1",
    );
    assert.equal(hasJobAtGate(q, BRAND_A, "idea-X", RECIPE, "cast"), true);
    assert.equal(hasJobAtGate(q, BRAND_A, "idea-X", RECIPE, null), true);
    assert.equal(hasJobAtGate(q, BRAND_A, "idea-Y", RECIPE, null), false);
    // Composite-keyed: a different Brand's same Idea id does not match (C6).
    assert.equal(hasJobAtGate(q, BRAND_B, "idea-X", RECIPE, null), false);
    // Composite-keyed: a different Recipe of the same Idea does not match (issue #56).
    assert.equal(hasJobAtGate(q, BRAND_A, "idea-X", RECIPE_2, null), false);
  });
});

describe("/queue renderer reflects all five worker statuses", () => {
  it("shows queued, running, awaiting_pick, done, and failed jobs", () => {
    const state: QueueState = {
      jobs: [
        { idea_id: "idea-q", brand: BRAND_A, recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-r", brand: BRAND_A, recipe: RECIPE, gate: "cast", status: "running", enqueued_at: "2026-06-05T10:01:00.000Z" },
        {
          idea_id: "idea-a",
          brand: BRAND_B,
          recipe: RECIPE,
          gate: "cast",
          status: "awaiting_pick",
          enqueued_at: "2026-06-05T10:02:00.000Z",
        },
        { idea_id: "idea-d", brand: BRAND_B, recipe: RECIPE, gate: null, status: "done", enqueued_at: "2026-06-05T10:03:00.000Z" },
        { idea_id: "idea-f", brand: BRAND_B, recipe: RECIPE, gate: null, status: "failed", enqueued_at: "2026-06-05T10:04:00.000Z" },
      ],
      lock: { active_job: { brand: BRAND_A, idea_id: "idea-r", recipe: RECIPE } },
    };
    const out = formatQueue(state);
    for (const status of ["queued", "running", "awaiting_pick", "done", "failed"]) {
      assert.ok(out.includes(status), `expected /queue output to include status "${status}"`);
    }
  });
});
