import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyQueue, enqueue } from "./queue.ts";
import { loadQueue } from "./store.ts";
import { planEnqueue, enqueueOnAccept } from "./enqueue-on-accept.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";

const NOW = "2026-06-05T13:00:00.000Z";
const BRAND = "mundotip";
const BRAND_B = "otherbrand";

const IDEAS: LedgerIdea[] = [
  { id: "idea-accepted", status: "accepted" },
  { id: "idea-rejected", status: "rejected" },
  { id: "idea-suggested", status: "suggested" },
];

describe("planEnqueue (pure policy: accepted-only + no-duplicate + brand stamp)", () => {
  it("enqueues an accepted Idea as one queued cast job", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND);
    assert.equal(r.enqueued, true);
    assert.equal(r.state.jobs.length, 1);
    assert.equal(r.state.jobs[0]!.idea_id, "idea-accepted");
    assert.equal(r.state.jobs[0]!.phase, "cast");
    assert.equal(r.state.jobs[0]!.status, "queued");
  });

  it("stamps the correct brand on the enqueued job (AC2)", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-accepted", NOW, BRAND_B);
    assert.equal(r.enqueued, true);
    assert.equal(r.state.jobs[0]!.brand, BRAND_B);
  });

  it("refuses a rejected Idea — no job is produced", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-rejected", NOW, BRAND);
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, "not-accepted");
    assert.equal(r.state.jobs.length, 0);
  });

  it("refuses a still-suggested Idea", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-suggested", NOW, BRAND);
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, "not-accepted");
    assert.equal(r.state.jobs.length, 0);
  });

  it("refuses an unknown Idea", () => {
    const r = planEnqueue(IDEAS, emptyQueue(), "idea-ghost", NOW, BRAND);
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, "unknown-idea");
  });

  it("does not duplicate when the accepted Idea already has a job", () => {
    const existing = enqueue(emptyQueue(), "idea-accepted", "2026-06-05T10:00:00.000Z", BRAND);
    const r = planEnqueue(IDEAS, existing, "idea-accepted", NOW, BRAND);
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, "already-queued");
    assert.equal(r.state.jobs.length, 1);
  });
});

async function withTempFiles<T>(
  fn: (ledgerPath: string, queuePath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-accept-"));
  const ledgerPath = join(dir, "ledger.json");
  const queuePath = join(dir, "queue.json");
  await writeFile(ledgerPath, JSON.stringify({ ideas: IDEAS }), "utf8");
  try {
    return await fn(ledgerPath, queuePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("enqueueOnAccept (orchestration shell, real files)", () => {
  it("persists exactly one job with the brand when an accepted Idea is enqueued (AC2)", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      const r = await enqueueOnAccept("idea-accepted", BRAND, {
        ledgerPath,
        queuePath,
        now: () => NOW,
      });
      assert.equal(r.enqueued, true);
      const onDisk = await loadQueue(queuePath);
      assert.equal(onDisk.jobs.length, 1);
      assert.equal(onDisk.jobs[0]!.idea_id, "idea-accepted");
      assert.equal(onDisk.jobs[0]!.brand, BRAND);
      assert.equal(onDisk.jobs[0]!.enqueued_at, NOW);
    });
  });

  it("is idempotent on re-accept: a second call adds no job", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      await enqueueOnAccept("idea-accepted", BRAND, { ledgerPath, queuePath, now: () => NOW });
      const second = await enqueueOnAccept("idea-accepted", BRAND, {
        ledgerPath,
        queuePath,
        now: () => "2026-06-05T14:00:00.000Z",
      });
      assert.equal(second.enqueued, false);
      assert.equal(second.reason, "already-queued");
      const onDisk = await loadQueue(queuePath);
      assert.equal(onDisk.jobs.length, 1);
    });
  });

  it("never writes a queue file for a rejected Idea", async () => {
    await withTempFiles(async (ledgerPath, queuePath) => {
      const r = await enqueueOnAccept("idea-rejected", BRAND, { ledgerPath, queuePath, now: () => NOW });
      assert.equal(r.enqueued, false);
      // queue file was never created because nothing was enqueued
      const onDisk = await loadQueue(queuePath);
      assert.deepEqual(onDisk, emptyQueue());
    });
  });
});
