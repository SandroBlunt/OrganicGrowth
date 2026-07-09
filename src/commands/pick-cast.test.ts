import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pickCastCommand, selectCharacter, main as pickCastMain } from "./pick-cast.ts";
import { loadQueue, saveQueue } from "../production-queue/store.ts";
import type { QueueState } from "../production-queue/queue.ts";

/** Run `fn` with a temp ledger AND a temp queue path, so the command never touches real state. */
async function withLedger(
  seed: unknown,
  fn: (paths: { ledgerPath: string; queuePath: string }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-pick-cast-"));
  const ledgerPath = join(dir, "ledger.json");
  const queuePath = join(dir, "queue.json"); // missing file loads as the empty queue
  try {
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn({ ledgerPath, queuePath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const PICK_NOW = "2026-06-05T12:00:00.000Z";

const cast = [
  { identifier: "cast-1", url: "https://magnific.example/cast/1.png" },
  { identifier: "cast-2", url: "https://magnific.example/cast/2.png" },
  { identifier: "cast-3", url: "https://magnific.example/cast/3.png" },
];

// === selectCharacter — pure 1-based selection from the Idea's ledger cast =============================

describe("selectCharacter — selects the nth (1-based) Cast member as the Character", () => {
  it("returns the nth Cast member's identifier as the chosen Character", () => {
    const result = selectCharacter(cast, 2);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.character, "cast-2");
  });

  it("selects the FIRST member for n=1 (the indexing is 1-based, per the issue's <n>)", () => {
    const result = selectCharacter(cast, 1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.character, "cast-1");
  });

  it("rejects an out-of-range n without crashing", () => {
    assert.equal(selectCharacter(cast, 0).ok, false);
    assert.equal(selectCharacter(cast, 4).ok, false);
    assert.equal(selectCharacter([], 1).ok, false);
  });
});

// === pickCastCommand — orchestration shell over the ledger ===========================================

describe("pickCastCommand — records the chosen Character from the Idea's ledger cast", () => {
  it("selects the nth Cast member as the Character and names it in the output", async () => {
    const seed = {
      ideas: [{ id: "idea-A", status: "casting", cast }],
    };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("mundotip", "idea-A", 3, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-A/);
      assert.match(out, /cast-3/);
    });
  });

  it("reports an unknown Idea without crashing and selects no Character", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("mundotip", "idea-ZZZ", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-ZZZ/);
      assert.doesNotMatch(out, /cast-1/);
    });
  });

  it("reports an out-of-range pick without crashing and selects no Character", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("mundotip", "idea-A", 9, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-A/);
      // Out of range: no specific Character was chosen.
      assert.doesNotMatch(out, /cast-3/);
    });
  });

  it("reports an Idea with no recorded Cast without crashing", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting" }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("mundotip", "idea-A", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-A/);
      assert.doesNotMatch(out, /cast-1/);
    });
  });
});

// === pickCastCommand — picking a Cast enqueues the render (AC3) ======================================

describe("pickCastCommand — picking a Cast enqueues the render", () => {
  it("enqueues exactly one queued render-phase job for the Idea on a valid pick", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      const renders = q.jobs.filter((j) => j.idea_id === "idea-A" && j.phase === "render");
      assert.equal(renders.length, 1);
      assert.equal(renders[0]!.status, "queued");
      assert.equal(renders[0]!.enqueued_at, PICK_NOW);
    });
  });

  it("does NOT enqueue a render for an out-of-range pick (no Character ⇒ no render)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-A", 9, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.filter((j) => j.phase === "render").length, 0);
    });
  });

  it("does NOT enqueue a render for an unknown Idea", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-ZZZ", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.length, 0);
    });
  });

  it("render job carries the Brand from the pickCastCommand brand argument (AC6)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-A", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      const render = q.jobs.find((j) => j.idea_id === "idea-A" && j.phase === "render");
      assert.ok(render !== undefined, "render job must exist");
      assert.equal(render!.brand, "mundotip", "render job must carry the brand from the command arg");
    });
  });

  it("does not duplicate the render job when the same Cast is picked twice", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
      await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => "2026-06-05T13:00:00.000Z" });
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.filter((j) => j.phase === "render").length, 1);
    });
  });
});

// === pickCastCommand — the pick reaches the render, the gate clears, re-picks are honest ============

describe("pickCastCommand — persists the pick, clears the gate, and reports honestly", () => {
  it("stamps the chosen Character onto the render job so it reaches the render (C1)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-A", 3, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      const render = q.jobs.find((j) => j.idea_id === "idea-A" && j.phase === "render");
      assert.ok(render !== undefined, "a render job must be enqueued");
      assert.equal(render!.character, "cast-3", "the render job must carry the Operator's picked Character");
    });
  });

  it("the persisted Character survives a disk round-trip (C1 persistence)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
      // Reload from disk (a fresh worker/session would do exactly this) — the pick must still be there.
      const reloaded = await loadQueue(queuePath);
      const render = reloaded.jobs.find((j) => j.phase === "render")!;
      assert.equal(render.character, "cast-2");
    });
  });

  it("clears the Cast gate — the awaiting_cast cast job becomes done (C24)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      // Seed the queue as it stands at Gate 2: the cast job sits at its gate awaiting the pick.
      const atGate: QueueState = {
        jobs: [
          { idea_id: "idea-A", brand: "mundotip", phase: "cast", status: "awaiting_cast", enqueued_at: "2026-06-05T10:00:00.000Z" },
        ],
        lock: { active_job: null },
      };
      await saveQueue(atGate, queuePath);

      await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });

      const q = await loadQueue(queuePath);
      const castJob = q.jobs.find((j) => j.idea_id === "idea-A" && j.phase === "cast")!;
      assert.equal(castJob.status, "done", "the Cast gate must not linger at awaiting_cast forever");
      // the render was still enqueued alongside the cleared gate
      assert.equal(q.jobs.filter((j) => j.phase === "render").length, 1);
    });
  });

  it("refuses a pick when the Idea is not at the Cast gate — no render enqueued (C23)", async () => {
    // The Idea already produced; its `cast` is still on the ledger, but a stale re-pick must do nothing.
    const seed = { ideas: [{ id: "idea-A", status: "produced", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /not at the Cast gate/i);
      assert.match(out, /produced/, "the refusal names the Idea's actual status");
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.filter((j) => j.phase === "render").length, 0, "no render for a non-casting Idea");
    });
  });

  it("reports honestly on a re-pick — the second pick claims no new work and the first pick stands (C23)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const first = await pickCastCommand("mundotip", "idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(first, /render queued/i);

      // Re-pick a DIFFERENT (still valid) member: the render already exists, so nothing changes.
      const second = await pickCastCommand("mundotip", "idea-A", 1, { ledgerPath, queuePath, now: () => "2026-06-05T13:00:00.000Z" });
      assert.match(second, /no change/i);
      assert.doesNotMatch(second, /render queued/i);

      // Exactly one render, still carrying the FIRST pick — the re-pick did not overwrite it.
      const q = await loadQueue(queuePath);
      const renders = q.jobs.filter((j) => j.phase === "render");
      assert.equal(renders.length, 1);
      assert.equal(renders[0]!.character, "cast-2", "the earlier pick governs; the re-pick did not overwrite it");
    });
  });
});

// === Brand-routing tests — pickCastCommand resolves the correct Brand's ledger =======================

/**
 * Create a temp brands-root with two Brand directories, each holding a ledger. Returns paths for
 * cleanup. Used to verify that pickCastCommand("mundotip", ...) reads mundotip's ledger, not acme's.
 */
async function withTwoBrandLedgers(
  fn: (opts: {
    mundotipLedger: string;
    acmeLedger: string;
    queuePath: string;
  }) => Promise<void>,
): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "og-pick-cast-brands-"));
  const mundotipDir = join(tmpRoot, "mundotip");
  const acmeDir = join(tmpRoot, "acme");
  await mkdir(mundotipDir, { recursive: true });
  await mkdir(acmeDir, { recursive: true });

  const mundotipLedger = join(mundotipDir, "ledger.json");
  const acmeLedger = join(acmeDir, "ledger.json");
  const queuePath = join(tmpRoot, "queue.json"); // shared global queue

  const mundotipSeed = { ideas: [{ id: "mt-idea", status: "casting", cast }] };
  const acmeSeed = { ideas: [{ id: "acme-idea", status: "casting", cast }] };

  await writeFile(mundotipLedger, JSON.stringify(mundotipSeed, null, 2) + "\n", "utf8");
  await writeFile(acmeLedger, JSON.stringify(acmeSeed, null, 2) + "\n", "utf8");

  try {
    await fn({ mundotipLedger, acmeLedger, queuePath });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

describe("pickCastCommand — brand-routing: resolves the correct Brand's ledger via the resolver", () => {
  it("pickCastCommand('mundotip', ...) reads the mundotip ledger and finds its Idea", async () => {
    await withTwoBrandLedgers(async ({ mundotipLedger, queuePath }) => {
      const out = await pickCastCommand("mundotip", "mt-idea", 1, {
        ledgerPath: mundotipLedger,
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(out, /mt-idea/);
      assert.match(out, /cast-1/);
    });
  });

  it("pickCastCommand('acme', ...) reads the acme ledger and finds its Idea", async () => {
    await withTwoBrandLedgers(async ({ acmeLedger, queuePath }) => {
      const out = await pickCastCommand("acme", "acme-idea", 2, {
        ledgerPath: acmeLedger,
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(out, /acme-idea/);
      assert.match(out, /cast-2/);
    });
  });

  it("pickCastCommand for Brand A does not find Ideas from Brand B's ledger", async () => {
    await withTwoBrandLedgers(async ({ mundotipLedger, queuePath }) => {
      // acme-idea only exists in the acme ledger; using mundotipLedger means it is not found
      const out = await pickCastCommand("mundotip", "acme-idea", 1, {
        ledgerPath: mundotipLedger,
        queuePath,
        now: () => PICK_NOW,
      });
      assert.match(out, /acme-idea/);
      assert.doesNotMatch(out, /cast-1\b/); // no character was selected
      assert.match(out, /no Cast recorded|Cast gate/i);
    });
  });

  it("both brands share the same global queue but have separate ledgers", async () => {
    await withTwoBrandLedgers(async ({ mundotipLedger, acmeLedger, queuePath }) => {
      // Pick for mundotip
      await pickCastCommand("mundotip", "mt-idea", 1, {
        ledgerPath: mundotipLedger,
        queuePath,
        now: () => PICK_NOW,
      });
      // Pick for acme
      await pickCastCommand("acme", "acme-idea", 2, {
        ledgerPath: acmeLedger,
        queuePath,
        now: () => "2026-06-06T12:00:00.000Z",
      });
      // Both renders should be queued in the shared global queue
      const q = await loadQueue(queuePath);
      const renders = q.jobs.filter((j) => j.phase === "render");
      assert.equal(renders.length, 2, "one render job per brand in the shared global queue");
      const ideaIds = renders.map((j) => j.idea_id).sort();
      assert.deepEqual(ideaIds, ["acme-idea", "mt-idea"]);
      // Each render job carries the correct brand (never cross-contaminated)
      const mtRender = renders.find((j) => j.idea_id === "mt-idea");
      const acmeRender = renders.find((j) => j.idea_id === "acme-idea");
      assert.equal(mtRender!.brand, "mundotip", "mundotip's render job must carry brand=mundotip");
      assert.equal(acmeRender!.brand, "acme", "acme's render job must carry brand=acme");
    });
  });

  it("pickCastCommand routes to the Brand's ledger via the resolver when no explicit ledgerPath is provided", async () => {
    // This test exercises the resolver fallback: `options.ledgerPath ?? resolveBrand(brand, brandsRoot).ledger`.
    // It calls pickCastCommand with options.brandsRoot but NO options.ledgerPath, so the ?? branch
    // is actually taken. The temp dir is structured as <tmpRoot>/<slug>/ledger.json exactly as
    // resolveBrand expects.
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-pc-resolver-"));
    const mundotipDir = join(tmpRoot, "mundotip");
    const queueDir = join(tmpRoot, "queue");
    await mkdir(mundotipDir, { recursive: true });
    await mkdir(queueDir, { recursive: true });

    const ledgerPath = join(mundotipDir, "ledger.json");
    const queuePath = join(queueDir, "queue.json");

    await writeFile(
      ledgerPath,
      JSON.stringify(
        { ideas: [{ id: "mt-resolver-idea", status: "casting", cast }] },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    try {
      // NO explicit ledgerPath in options — resolveBrand(brand, brandsRoot).ledger is the only path used
      const out = await pickCastCommand("mundotip", "mt-resolver-idea", 1, {
        brandsRoot: tmpRoot,
        queuePath,
        now: () => PICK_NOW,
      });
      // The resolver found the Idea and the Character was selected
      assert.match(out, /mt-resolver-idea/, "resolver fallback reads the correct Brand's ledger");
      assert.match(out, /cast-1/, "correct Cast member selected via resolver-derived path");
      // The render was enqueued
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.filter((j) => j.idea_id === "mt-resolver-idea" && j.phase === "render").length, 1);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

// === CLI main() — usage-error path when <brand> is absent =============================================

describe("pick-cast CLI main() — exits with usage error when <brand> is absent", () => {
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
      // Simulate: no arguments at all — brand, ideaId, and n all absent
      process.argv = ["node", "pick-cast.ts"];
      process.exitCode = 0;

      await pickCastMain();

      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i, "stderr must contain a usage message when <brand> is absent");
      assert.notEqual(process.exitCode, 0, "process.exitCode must be non-zero when <brand> is absent");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });
});
