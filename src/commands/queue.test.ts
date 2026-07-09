/**
 * Tests for the `/queue` command shell (`queueCommand`) and its CLI arg parsing (`resolveBrandFilter`).
 *
 * `queueCommand` is the thin orchestration shell: load `data/queue.json` → format. These tests drive it
 * against a temp queue file (no real state touched) to prove the load→format wiring and the brand
 * filter both work end-to-end. `resolveBrandFilter` is the pure CLI positional → filter mapping (C49).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { queueCommand, resolveBrandFilter } from "./queue.ts";
import type { QueueState } from "../production-queue/queue.ts";

async function withQueueFile(state: QueueState, run: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-queue-"));
  const path = join(dir, "queue.json");
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
  try {
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const MULTI: QueueState = {
  jobs: [
    { idea_id: "idea-A1", brand: "alpha", phase: "cast", status: "queued", enqueued_at: "2026-06-05T10:00:00.000Z" },
    { idea_id: "idea-B1", brand: "beta", phase: "render", status: "running", enqueued_at: "2026-06-05T10:01:00.000Z", character: "cast-2" },
  ],
  lock: { active_job: { brand: "beta", idea_id: "idea-B1" } },
};

describe("queueCommand — load then format the queue file", () => {
  it("with no filter lists every Brand's jobs", async () => {
    await withQueueFile(MULTI, async (path) => {
      const out = await queueCommand(undefined, path);
      assert.match(out, /idea-A1/);
      assert.match(out, /idea-B1/);
      assert.match(out, /alpha/);
      assert.match(out, /beta/);
    });
  });

  it("with a brand filter shows only that Brand's jobs", async () => {
    await withQueueFile(MULTI, async (path) => {
      const out = await queueCommand("alpha", path);
      assert.match(out, /idea-A1/);
      assert.ok(!out.includes("idea-B1"), "Brand beta's jobs must not appear when filtered to alpha");
    });
  });

  it("reports a filter with no matching jobs distinctly from a globally empty queue", async () => {
    await withQueueFile(MULTI, async (path) => {
      const out = await queueCommand("gamma", path);
      assert.match(out, /no jobs for brand/i);
    });
  });

  it("a missing queue file loads as the empty queue (never crashes)", async () => {
    const out = await queueCommand(undefined, join(tmpdir(), "og-queue-does-not-exist-12345", "queue.json"));
    assert.match(out, /empty/i);
  });
});

describe("resolveBrandFilter — CLI positional → brand filter (C49)", () => {
  it("no argument means show all Brands (undefined)", () => {
    assert.equal(resolveBrandFilter(undefined), undefined);
  });

  it("the --all sentinel means show all Brands (undefined)", () => {
    assert.equal(resolveBrandFilter("--all"), undefined);
  });

  it("any other token is treated as a Brand slug to filter by", () => {
    assert.equal(resolveBrandFilter("mundotip"), "mundotip");
  });
});
