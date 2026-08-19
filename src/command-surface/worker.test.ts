/**
 * Tests for the worker's job orchestration (`runOneJob`, issue #208) — driven entirely against THE
 * Magnific fakes (`space-driver/fixtures/fake-space.ts`'s `FakeSpace`,
 * `producer/fixtures/fake-carousel-space.ts`'s `FakeCarouselSpace`) and an injected fake `fetch`. No
 * live `spaces_*`/`creations_*` call, no credits, no board mutation, no network.
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset, seedAssetAndChannel } from "../db/fixtures/seed-chain.ts";
import { updateBrand } from "../brand/store.ts";
import { createBrandAsset } from "../brand-asset/store.ts";
import { writeAsset, loadIdeaAssets, getAssetById, listAssetMedia, type DbAssetRecord } from "../asset/store.ts";
import { getJob, claimJob } from "../production-queue/job-store.ts";
import { listGateRequestsForAsset } from "../production-queue/gate-request-store.ts";
import { enqueueJob } from "./jobs.ts";
import { resolveGate } from "./gates.ts";
import { getCopyVariantForChannel } from "../copy/store.ts";

import { FakeSpace, FAKE_POLL } from "../space-driver/fixtures/fake-space.ts";
import { FakeCarouselSpace, CAROUSEL_ASSET_URL } from "../producer/fixtures/fake-carousel-space.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";
import { strawMotionIdeaOneCarouselSpec } from "../production-spec/fixtures/news-carousel-straw-motion-specs.ts";
import { allSlidesSameCardStyle } from "../production-spec/fixtures/news-carousel-author-checklist-specs.ts";

import { runOneJob, type RunOneJobOptions } from "./worker.ts";

const NEWS_CAROUSEL_RECIPE = "news-carousel";
const CHARACTER_RECIPE = "character-explainer-with-cast";

/** A fake `fetch` standing in for the download of a rendered creation's media (issue #208 — hermetic,
 *  never a real network call). */
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

const OPTIONS: RunOneJobOptions = { poll: FAKE_POLL, maxAttempts: 3 };

/** Points the Brand's `mediaRoot` at the SAME throwaway directory `withTempDb`'s own SQLite file lives
 *  in, so a test that reaches the "finished" branch (and downloads a rendered creation) never writes
 *  into the real, committed `data/` tree. */
function isolateMediaRoot(db: DatabaseSync, brandId: string, dbPath: string): void {
  updateBrand(db, brandId, { mediaRoot: dirname(dbPath) });
}

describe("runOneJob — claiming (AC1)", () => {
  it("a job already claimed by a live lease is reported not-claimed, no side effect", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, assetId } = await seedAsset(db);
      const jobId = enqueueJob(db, { assetId, brandId });
      claimJob(db, jobId, "someone-else", 60_000);

      const outcome = await runOneJob(db, new FakeSpace(), jobId, OPTIONS);
      assert.deepEqual(outcome, { status: "not-claimed" });
      assert.equal(getJob(db, jobId)!.lockedBy, "someone-else");
    });
  });
});

describe("runOneJob — the author phase stops a bad Spec before any Space call (AC3)", () => {
  it("a banned word in the Production Spec fails the job, with ZERO Space calls", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAssetAndChannel(db);
      await writeAsset(ideaId, NEWS_CAROUSEL_RECIPE, { status: "queued", spec: strawMotionIdeaOneCarouselSpec() as unknown as Record<string, unknown> }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: carouselAssetId, brandId });

      // Give the Brand a banned word certain to appear in any real prompt text.
      db.prepare(`UPDATE brand SET banned_words_json = '["the"]' WHERE id = ?`).run(brandId);

      const space = new FakeCarouselSpace();
      const outcome = await runOneJob(db, space, jobId, OPTIONS);

      assert.equal(outcome.status, "failed");
      assert.equal(space.editGoals.length, 0);
      assert.equal(space.runs.length, 0);
    });
  });

  it("issue #273: a filler Spec (one card_style repeated on every slide) fails the job on the SAME widened check accept-idea now runs, with ZERO Space calls — defense-in-depth", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAssetAndChannel(db);
      await writeAsset(
        ideaId,
        NEWS_CAROUSEL_RECIPE,
        { status: "queued", spec: allSlidesSameCardStyle() as unknown as Record<string, unknown> },
        { db },
      );
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: carouselAssetId, brandId });

      const space = new FakeCarouselSpace();
      const outcome = await runOneJob(db, space, jobId, OPTIONS);

      assert.equal(outcome.status, "failed");
      assert.equal(space.editGoals.length, 0);
      assert.equal(space.runs.length, 0);
    });
  });
});

describe("runOneJob — the bind-media phase stops a missing required Brand Asset before any Space call", () => {
  it("a News Carousel job with no committed brand-logo fails, with ZERO Space calls", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAssetAndChannel(db);
      await writeAsset(ideaId, NEWS_CAROUSEL_RECIPE, { status: "queued", spec: strawMotionIdeaOneCarouselSpec() as unknown as Record<string, unknown> }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: carouselAssetId, brandId });

      const space = new FakeCarouselSpace();
      const outcome = await runOneJob(db, space, jobId, OPTIONS);

      assert.equal(outcome.status, "failed");
      assert.equal(space.editGoals.length, 0);
      assert.equal(space.runs.length, 0);
    });
  });
});

describe("runOneJob — a News Carousel job runs queued -> running -> done, no human present (AC2)", () => {
  it("reaches a produced Asset with its media and Copy Variant saved", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, ideaId, channelId } = await seedAssetAndChannel(db);
      isolateMediaRoot(db, brandId, dbPath);
      await writeAsset(ideaId, NEWS_CAROUSEL_RECIPE, { status: "queued", spec: strawMotionIdeaOneCarouselSpec() as unknown as Record<string, unknown> }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: carouselAssetId, brandId });

      createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "brands/straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 10,
        checksum: "abc",
      });

      const fetchImpl = fakeFetch({ [CAROUSEL_ASSET_URL]: { body: "rendered-bytes", contentType: "image/png" } });
      const outcome = await runOneJob(db, new FakeCarouselSpace(), jobId, { ...OPTIONS, fetchImpl });

      assert.equal(outcome.status, "done");
      assert.equal(getJob(db, jobId)!.status, "done");

      const saved = getAssetById(db, carouselAssetId)!;
      assert.equal(saved.status, "produced");
      assert.ok(saved.produced_at);

      const media = listAssetMedia(db, carouselAssetId);
      assert.equal(media.length, 1);
      assert.equal(media[0]!.kind, "image");
      assert.equal(media[0]!.mime, "image/png");

      const copy = getCopyVariantForChannel(db, carouselAssetId, channelId);
      assert.ok(copy);
      assert.ok(copy.caption.length > 0);
    });
  });
});

describe("runOneJob — the copy phase stops an invalid drafted Copy before the Asset is saved produced (AC3)", () => {
  it("an empty caption from the drafter fails validateCopy — no Asset/media/copy is ever saved", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAssetAndChannel(db);
      isolateMediaRoot(db, brandId, dbPath);
      await writeAsset(ideaId, NEWS_CAROUSEL_RECIPE, { status: "queued", spec: strawMotionIdeaOneCarouselSpec() as unknown as Record<string, unknown> }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: carouselAssetId, brandId });
      createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "brands/straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 10,
        checksum: "abc",
      });

      const fetchImpl = fakeFetch({ [CAROUSEL_ASSET_URL]: { body: "rendered-bytes", contentType: "image/png" } });
      const brokenDrafter = () => ({ caption: "", hashtags: [] });
      const outcome = await runOneJob(db, new FakeCarouselSpace(), jobId, { ...OPTIONS, fetchImpl, drafter: brokenDrafter });

      assert.equal(outcome.status, "failed");
      // The render DID happen (this is a render-then-copy failure, not an author/bind-media STOP) —
      // but the Asset is never left "produced" and carries no media/copy from this failed attempt.
      const saved = getAssetById(db, carouselAssetId)!;
      assert.notEqual(saved.status, "produced");
      assert.deepEqual(listAssetMedia(db, carouselAssetId), []);
    });
  });
});

describe("runOneJob — a gated Recipe parks at awaiting_pick (AC4)", () => {
  it("a Character Explainer job pauses at its cast gate, offering candidates undecided", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAsset(db);
      await writeAsset(ideaId, CHARACTER_RECIPE, { status: "queued", spec: validSpec() }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const characterAssetId = assets.find((a) => a.recipe === CHARACTER_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: characterAssetId, brandId, gate: "cast" });

      const outcome = await runOneJob(db, new FakeSpace(), jobId, OPTIONS);

      assert.equal(outcome.status, "parked");
      if (outcome.status !== "parked") return;
      assert.equal(outcome.gate, "cast");
      assert.equal(getJob(db, jobId)!.status, "awaiting_pick");

      const gateRequests = listGateRequestsForAsset(db, characterAssetId);
      assert.equal(gateRequests.length, 1);
      assert.equal(gateRequests[0]!.gateName, "cast");
      assert.ok(gateRequests[0]!.candidates.length > 0);
      assert.equal("decidedBy" in gateRequests[0]!, false);
    });
  });
});

describe("runOneJob — resolving a gate resumes the parked job (AC6)", () => {
  it("resolveGate enqueues the resumed leg, which pins the pick and reaches done", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAsset(db);
      isolateMediaRoot(db, brandId, dbPath);
      await writeAsset(ideaId, CHARACTER_RECIPE, { status: "queued", spec: validSpec() }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const characterAssetId = assets.find((a) => a.recipe === CHARACTER_RECIPE)!.id;
      const firstJobId = enqueueJob(db, { assetId: characterAssetId, brandId, gate: "cast" });

      const firstOutcome = await runOneJob(db, new FakeSpace(), firstJobId, OPTIONS);
      assert.equal(firstOutcome.status, "parked");
      if (firstOutcome.status !== "parked") return;

      const [gateRequest] = listGateRequestsForAsset(db, characterAssetId);
      const pick = (gateRequest!.candidates[0] as { readonly identifier: string }).identifier;
      const resolved = resolveGate(db, gateRequest!.id, { decidedBy: "operator", choice: pick });

      const space = new FakeSpace();
      const fetchImpl = fakeFetch({ "https://magnific.example/asset/1.mp4": { body: "video-bytes", contentType: "video/mp4" } });
      const secondOutcome = await runOneJob(db, space, resolved.resumedJobId, { ...OPTIONS, fetchImpl });

      assert.equal(secondOutcome.status, "done");
      assert.ok(space.editGoals.some((g) => g.includes("Pin") && g.includes(pick)), "the resumed leg pins the chosen Character");

      const saved = getAssetById(db, characterAssetId)!;
      assert.equal(saved.status, "produced");
    });
  });
});

describe("runOneJob — a failed job is retried with a recorded attempt count, then reaches terminal failure (AC7)", () => {
  it("requeues once, then reaches a terminal failed state — never a third attempt", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAssetAndChannel(db);
      await writeAsset(ideaId, NEWS_CAROUSEL_RECIPE, { status: "queued", spec: strawMotionIdeaOneCarouselSpec() as unknown as Record<string, unknown> }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const carouselAssetId = assets.find((a) => a.recipe === NEWS_CAROUSEL_RECIPE)!.id;
      const jobId = enqueueJob(db, { assetId: carouselAssetId, brandId });
      createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "brands/straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 10,
        checksum: "abc",
      });

      const opts: RunOneJobOptions = { poll: FAKE_POLL, maxAttempts: 2 };

      const first = await runOneJob(db, new FakeCarouselSpace({ injectNoOp: true }), jobId, opts);
      assert.equal(first.status, "failed");
      if (first.status === "failed") assert.equal(first.terminal, false);
      assert.equal(getJob(db, jobId)!.status, "queued", "requeued for a second attempt");
      assert.equal(getJob(db, jobId)!.attempt, 1);

      const second = await runOneJob(db, new FakeCarouselSpace({ injectNoOp: true }), jobId, opts);
      assert.equal(second.status, "failed");
      if (second.status === "failed") assert.equal(second.terminal, true);
      assert.equal(getJob(db, jobId)!.status, "failed", "terminal — never requeued a third time");
      assert.equal(getJob(db, jobId)!.attempt, 2);
    });
  });
});

describe("runOneJob — a Space-less Recipe is out of scope, refused cleanly", () => {
  it("fails without ever calling a SpaceMcpPort method", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { brandId, ideaId } = await seedAsset(db);
      await writeAsset(ideaId, "news-short-script", { status: "queued", spec: {} }, { db });
      const assets = (await loadIdeaAssets(ideaId, { db })) as readonly DbAssetRecord[];
      const scriptAssetId = assets.find((a) => a.recipe === "news-short-script")!.id;
      const jobId = enqueueJob(db, { assetId: scriptAssetId, brandId });

      const space = new FakeSpace();
      const outcome = await runOneJob(db, space, jobId, OPTIONS);

      assert.equal(outcome.status, "failed");
      assert.equal(space.editGoals.length, 0);
      assert.equal(space.runs.length, 0);
    });
  });
});
