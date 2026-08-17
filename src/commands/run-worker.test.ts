/**
 * Tests for the worker's outer drain loop (`drainQueue`, issue #208) — driven entirely against THE
 * Magnific fakes (`space-driver/fixtures/fake-space.ts`'s `FakeSpace`,
 * `producer/fixtures/fake-carousel-space.ts`'s `FakeCarouselSpace`). No live `spaces_*`/`creations_*`
 * call, no credits, no board mutation, no network.
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { updateBrand } from "../brand/store.ts";
import { createBrandAsset } from "../brand-asset/store.ts";
import { writeAsset, getAssetById, loadIdeaAssets, type DbAssetRecord } from "../asset/store.ts";
import { getJob, findNextQueuedJob } from "../production-queue/job-store.ts";
import { listGateRequestsForAsset } from "../production-queue/gate-request-store.ts";
import { enqueueJob } from "../command-surface/jobs.ts";
import { resolveGate } from "../command-surface/gates.ts";
import { runOneJob } from "../command-surface/worker.ts";

import { FakeSpace, FAKE_POLL, ASSET_URL as CHARACTER_ASSET_URL } from "../space-driver/fixtures/fake-space.ts";
import { FakeCarouselSpace, CAROUSEL_ASSET_URL } from "../producer/fixtures/fake-carousel-space.ts";
import { strawMotionIdeaOneCarouselSpec } from "../production-spec/fixtures/news-carousel-straw-motion-specs.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";

import { drainQueue } from "./run-worker.ts";

const NEWS_CAROUSEL_RECIPE = "news-carousel";
const CHARACTER_RECIPE = "character-explainer-with-cast";

function fakeFetch(byUrl: Record<string, { readonly body: string; readonly contentType: string }>): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    const entry = byUrl[url];
    if (entry === undefined) throw new Error(`fakeFetch: no entry for ${url}`);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? entry.contentType : null) },
      arrayBuffer: async () => new TextEncoder().encode(entry.body).buffer,
    } as unknown as Response;
  }) as typeof fetch;
}

/** Points a Brand's `mediaRoot` at the SAME throwaway directory `withTempDb`'s own SQLite file lives
 *  in, so a job that reaches "finished" never downloads into the real, committed `data/` tree. */
function isolateMediaRoot(db: DatabaseSync, brandId: string, dbPath: string): void {
  updateBrand(db, brandId, { mediaRoot: dirname(dbPath) });
}

describe("drainQueue — a parked job does not block a sibling job from draining (AC5)", () => {
  it("job A (a FIRST, gated leg) parks awaiting_pick; job B (a RESUMED, final leg) reaches done right after", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);

      // Job A: a brand-new Character Explainer job — its first leg targets the "cast" gate. Enqueued
      // FIRST (earlier enqueued_at), so drainQueue's FIFO loop attempts it FIRST.
      const { brandId: brandA, ideaId: ideaA, assetId: assetA } = await seedAsset(db);
      isolateMediaRoot(db, brandA, dbPath);
      await writeAsset(ideaA, CHARACTER_RECIPE, { status: "queued", spec: validSpec() }, { db });
      const jobA = enqueueJob(db, { assetId: assetA, brandId: brandA, gate: "cast" }, () => "2026-08-17T09:00:00.000Z");

      // Job B: a DIFFERENT Idea's Character Explainer Asset whose EARLIER job genuinely parked (driven
      // through runOneJob, as setup, against its OWN throwaway FakeSpace) and had its gate DECIDED —
      // resolveGate enqueues the resumed leg's job for us. Once claimed, job B is planned as a RESUMED,
      // final leg. Its resumed job is enqueued AFTER job A, so the drainQueue call under test below
      // processes exactly job A then job B — the setup job never re-enters the queue (it is
      // `awaiting_pick`, not `queued`, once resolveGate has run).
      const { brandId: brandB, ideaId: ideaB, assetId: assetB } = await seedAsset(db);
      isolateMediaRoot(db, brandB, dbPath);
      await writeAsset(ideaB, CHARACTER_RECIPE, { status: "queued", spec: validSpec() }, { db });
      const priorJobB = enqueueJob(db, { assetId: assetB, brandId: brandB, gate: "cast" }, () => "2026-08-17T07:00:00.000Z");
      const priorOutcome = await runOneJob(db, new FakeSpace(), priorJobB, { poll: FAKE_POLL });
      assert.equal(priorOutcome.status, "parked");
      const [gateRequestB] = listGateRequestsForAsset(db, assetB);
      const pick = (gateRequestB!.candidates[0] as { readonly identifier: string }).identifier;
      const resolved = resolveGate(
        db,
        gateRequestB!.id,
        { decidedBy: "operator", choice: pick },
        () => "2026-08-17T09:01:00.000Z",
      );
      const jobB = resolved.resumedJobId;

      const fetchImpl = fakeFetch({ [CHARACTER_ASSET_URL]: { body: "video-bytes", contentType: "video/mp4" } });
      const summary = await drainQueue(db, new FakeSpace(), { poll: FAKE_POLL, fetchImpl });

      assert.equal(summary.processed.length, 2);
      assert.equal(summary.processed[0]!.jobId, jobA, "job A (earlier enqueued_at) is attempted first");
      assert.equal(summary.processed[1]!.jobId, jobB);

      assert.equal(getJob(db, jobA)!.status, "awaiting_pick");
      assert.equal(getJob(db, jobB)!.status, "done");
      assert.equal(getAssetById(db, assetA)!.status, "in_production");
      assert.equal(getAssetById(db, assetB)!.status, "produced");

      assert.equal(findNextQueuedJob(db), null, "nothing left queued");
    });
  });
});

describe("drainQueue — stops once nothing is queued", () => {
  it("never re-selects an awaiting_pick/done/failed job", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAsset(db);
      isolateMediaRoot(db, brandId, dbPath);
      await writeAsset(ideaId, NEWS_CAROUSEL_RECIPE, { status: "queued", spec: strawMotionIdeaOneCarouselSpec() as unknown as Record<string, unknown> }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "brands/straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 10,
        checksum: "abc",
      });
      enqueueJob(db, { assetId: carouselAssetId, brandId });

      const fetchImpl = fakeFetch({ [CAROUSEL_ASSET_URL]: { body: "rendered-bytes", contentType: "image/png" } });
      const summary = await drainQueue(db, new FakeCarouselSpace(), { poll: FAKE_POLL, fetchImpl });
      assert.equal(summary.processed.length, 1);

      // A SECOND drainQueue call over the SAME (now-empty) queue processes nothing.
      const second = await drainQueue(db, new FakeCarouselSpace(), { poll: FAKE_POLL, fetchImpl });
      assert.equal(second.processed.length, 0);
    });
  });
});
