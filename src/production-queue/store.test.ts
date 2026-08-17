import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyQueue, enqueue } from "./queue.ts";
import { loadQueue, saveQueue, parseQueueState } from "./store.ts";

const RECIPE = "character-explainer-with-cast";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-queue-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Run `fn` with console.warn captured, returning both the result and every warning string. */
function captureWarn<T>(fn: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

describe("loadQueue / saveQueue", () => {
  it("round-trips a queue state through disk", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      const state = enqueue(emptyQueue(), "idea-2026-W22-01", "2026-06-05T10:00:00.000Z", "mundotip", RECIPE, "cast");
      await saveQueue(state, path);
      const loaded = await loadQueue(path);
      assert.deepEqual(loaded, state);
    });
  });

  it("loads a missing file as the empty queue (fresh repo)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "does-not-exist.json");
      const loaded = await loadQueue(path);
      assert.deepEqual(loaded, emptyQueue());
    });
  });

  it("throws a path-naming error on a truncated queue file, not a bare SyntaxError (C13)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      // A crash mid-write can leave a truncated canonical file; loading it must fail loudly and name it.
      await writeFile(path, '{\n  "jobs": [', "utf8");
      await assert.rejects(loadQueue(path), (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot parse JSON/);
        assert.ok(err.message.includes(path), "error names the offending path");
        return true;
      });
    });
  });

  it("saves atomically, leaving no leftover temp file (C13)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      await saveQueue(enqueue(emptyQueue(), "idea-X", "2026-06-05T10:00:00.000Z", "alpha", RECIPE, "cast"), path);
      const entries = await readdir(dir);
      assert.deepEqual(entries, ["queue.json"], "no sibling .tmp file survives a successful write");
    });
  });

  it("writes valid JSON with the documented shape including brand + recipe + gate, and no lock field (issue #203)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      await saveQueue(enqueue(emptyQueue(), "idea-X", "2026-06-05T10:00:00.000Z", "alpha", RECIPE, "cast"), path);
      const reloaded = await loadQueue(path);
      assert.equal(reloaded.jobs.length, 1);
      assert.equal(reloaded.jobs[0]!.recipe, RECIPE);
      assert.equal(reloaded.jobs[0]!.gate, "cast");
      assert.equal(reloaded.jobs[0]!.status, "queued");
      assert.equal(reloaded.jobs[0]!.brand, "alpha");
      assert.equal("lock" in reloaded, false, "the lock field must be deleted, not ported (issue #203)");
    });
  });

  it("a hand-edited file carrying a stray legacy lock key is ignored, never re-written on save (issue #203)", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "queue.json");
      await writeFile(
        path,
        JSON.stringify({
          jobs: [
            { idea_id: "idea-A", brand: "alpha", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
          ],
          lock: { active_job: { brand: "alpha", idea_id: "idea-A", recipe: RECIPE } },
        }),
        "utf8",
      );
      const loaded = await loadQueue(path);
      assert.equal("lock" in loaded, false);
      await saveQueue(loaded, path);
      const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      assert.equal("lock" in raw, false, "saving must not reintroduce a lock field");
    });
  });
});

describe("parseQueueState (defensive)", () => {
  it("returns the empty queue for non-object input", () => {
    assert.deepEqual(parseQueueState(null), emptyQueue());
    assert.deepEqual(parseQueueState("nope"), emptyQueue());
  });

  it("round-trips the chosen pick on a next-leg job (C1 persistence, generalized)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-A", brand: "mundotip", recipe: RECIPE, gate: null, status: "queued", enqueued_at: "2026-06-05T12:00:00.000Z", pick: "cast-3" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0]!.pick, "cast-3", "the Operator's pick must survive the disk round-trip");
  });

  it("a first-leg job carries no pick (the field is next-leg-only)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-A", brand: "mundotip", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T12:00:00.000Z" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs[0]!.pick, undefined);
  });

  it("round-trips a null gate (the final leg)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-A", brand: "mundotip", recipe: RECIPE, gate: null, status: "queued", enqueued_at: "2026-06-05T12:00:00.000Z" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs[0]!.gate, null);
  });

  it("drops a job with an invalid gate (not null and not a non-empty string)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-bad-gate", brand: "alpha", recipe: RECIPE, gate: 5, status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
    };
    const { result, warnings } = captureWarn(() => parseQueueState(raw));
    assert.equal(result.jobs.length, 0);
    assert.ok(warnings.some((w) => w.includes("idea-bad-gate") && w.includes("invalid gate")));
  });

  it("round-trips the brand + recipe fields for a well-formed job (AC1, issue #56)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-A", brand: "mundotip", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0]!.brand, "mundotip");
    assert.equal(state.jobs[0]!.recipe, RECIPE);
  });

  it("drops a job with a missing brand field — does not crash the drain (AC1)", () => {
    const raw = {
      jobs: [
        // brand field is absent
        { idea_id: "idea-no-brand", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        // valid job for comparison
        { idea_id: "idea-good", brand: "alpha", recipe: RECIPE, gate: null, status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z", pick: "cast-1" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1, "brandless job must be dropped");
    assert.equal(state.jobs[0]!.idea_id, "idea-good");
  });

  it("drops a job with a missing recipe field — does not crash the drain (issue #56)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-no-recipe", brand: "alpha", gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-good", brand: "alpha", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z" },
      ],
    };
    const { result, warnings } = captureWarn(() => parseQueueState(raw));
    assert.equal(result.jobs.length, 1, "recipeless job must be dropped");
    assert.equal(result.jobs[0]!.idea_id, "idea-good");
    assert.ok(warnings.some((w) => w.includes("idea-no-recipe") && w.includes("recipe")));
  });

  it("drops a job with an empty-string brand — does not crash the drain (AC1)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-empty-brand", brand: "", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-good", brand: "beta", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T11:00:00.000Z" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1, "empty-brand job must be dropped");
    assert.equal(state.jobs[0]!.brand, "beta");
  });

  it("drops malformed jobs but keeps well-formed ones", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-good", brand: "alpha", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { idea_id: "idea-bad-status", brand: "alpha", recipe: RECIPE, gate: "cast", status: "wat", enqueued_at: "2026-06-05T10:00:00.000Z" },
        { brand: "alpha", recipe: RECIPE, gate: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
    };
    const state = parseQueueState(raw);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0]!.idea_id, "idea-good");
  });

  it("WARNS (does not silently drop) an invalid status — a typo'd status leaves a trace (C38)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-typo", brand: "alpha", recipe: RECIPE, gate: "cast", status: "quued", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
    };
    const { result, warnings } = captureWarn(() => parseQueueState(raw));
    assert.equal(result.jobs.length, 0, "the typo'd-status job is dropped");
    assert.ok(
      warnings.some((w) => w.includes("idea-typo") && w.includes("invalid status")),
      "a warning must name the dropped job and cite the invalid status",
    );
  });

  it("WARNS on a missing enqueued_at (C38)", () => {
    const { warnings: tsWarn } = captureWarn(() =>
      parseQueueState({
        jobs: [{ idea_id: "idea-t", brand: "alpha", recipe: RECIPE, gate: "cast", status: "queued" }],
      }),
    );
    assert.ok(tsWarn.some((w) => w.includes("idea-t") && w.includes("enqueued_at")));
  });

  it("WARNS on a non-object top-level value (issue #204 QA round 1's Defect 2)", () => {
    const { result, warnings } = captureWarn(() => parseQueueState("not an object"));
    assert.deepEqual(result, emptyQueue());
    assert.ok(warnings.some((w) => w.includes("non-object")), "a warning must name the non-object shape it dropped");
  });

  it("WARNS when the top-level \"jobs\" key is not an array (issue #204 QA round 1's Defect 2)", () => {
    const { result, warnings } = captureWarn(() => parseQueueState({ jobs: "not an array" }));
    assert.deepEqual(result, emptyQueue());
    assert.ok(warnings.some((w) => w.includes("jobs") && w.includes("not an array")));
  });

  it("a raw lock field is ignored — parseQueueState never reads or reconstitutes it (issue #203)", () => {
    const raw = {
      jobs: [
        { idea_id: "idea-A", brand: "alpha", recipe: RECIPE, gate: "cast", status: "running", enqueued_at: "2026-06-05T10:00:00.000Z" },
      ],
      lock: { active_job: { brand: "alpha", idea_id: "idea-A", recipe: RECIPE } },
    };
    const state = parseQueueState(raw);
    assert.equal("lock" in state, false);
    assert.equal(state.jobs.length, 1);
  });
});
