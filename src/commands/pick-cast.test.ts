import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pickCastCommand, selectCharacter } from "./pick-cast.ts";
import { loadQueue } from "../production-queue/store.ts";

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
      const out = await pickCastCommand("idea-A", 3, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-A/);
      assert.match(out, /cast-3/);
    });
  });

  it("reports an unknown Idea without crashing and selects no Character", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("idea-ZZZ", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-ZZZ/);
      assert.doesNotMatch(out, /cast-1/);
    });
  });

  it("reports an out-of-range pick without crashing and selects no Character", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("idea-A", 9, { ledgerPath, queuePath, now: () => PICK_NOW });
      assert.match(out, /idea-A/);
      // Out of range: no specific Character was chosen.
      assert.doesNotMatch(out, /cast-3/);
    });
  });

  it("reports an Idea with no recorded Cast without crashing", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting" }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      const out = await pickCastCommand("idea-A", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
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
      await pickCastCommand("idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
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
      await pickCastCommand("idea-A", 9, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.filter((j) => j.phase === "render").length, 0);
    });
  });

  it("does NOT enqueue a render for an unknown Idea", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("idea-ZZZ", 1, { ledgerPath, queuePath, now: () => PICK_NOW });
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.length, 0);
    });
  });

  it("does not duplicate the render job when the same Cast is picked twice", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "casting", cast }] };
    await withLedger(seed, async ({ ledgerPath, queuePath }) => {
      await pickCastCommand("idea-A", 2, { ledgerPath, queuePath, now: () => PICK_NOW });
      await pickCastCommand("idea-A", 2, { ledgerPath, queuePath, now: () => "2026-06-05T13:00:00.000Z" });
      const q = await loadQueue(queuePath);
      assert.equal(q.jobs.filter((j) => j.phase === "render").length, 1);
    });
  });
});
