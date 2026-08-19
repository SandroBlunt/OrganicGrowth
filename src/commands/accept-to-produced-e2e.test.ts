/**
 * End-to-end proof for issue #264 / ADR-0031: accepting an Idea authors its Recipe's Production Spec
 * synchronously, so the UNATTENDED worker (`drainQueue`, `src/commands/run-worker.ts`) can carry a job
 * all the way to `produced` — no attended session, no `runOneJob` called by hand, nothing but the REAL
 * `acceptIdeaCommand` followed by the REAL `drainQueue`.
 *
 * Driven entirely against THE Magnific fakes (`FakeCarouselSpace`, `FakeSpace`) — never the live Space.
 * No credits, no board mutation, no network (a fake `fetch` stands in for the rendered media download).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { acceptIdeaCommand } from "./accept-idea.ts";
import { drainQueue } from "./run-worker.ts";
import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand, updateBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createBrandAsset } from "../brand-asset/store.ts";
import { getIdeaByLegacyRef } from "../idea/store.ts";
import { loadIdeaAssets, listAssetMedia, type DbAssetRecord } from "../asset/store.ts";
import { getCopyVariantForChannel } from "../copy/store.ts";
import { createChannel } from "../channel/store.ts";

import { FakeCarouselSpace, CAROUSEL_ASSET_URL } from "../producer/fixtures/fake-carousel-space.ts";
import { FakeSpace, FAKE_POLL } from "../space-driver/fixtures/fake-space.ts";

const BRAND = "straw-motion";
const FORMAT = "unhypped-news";
const RUN = "2026-W33";
const NOW = "2026-08-18T09:00:00.000Z";

/** A fake `fetch` standing in for downloading a rendered creation's media — hermetic, never a real
 *  network call (mirrors `command-surface/worker.test.ts`'s own `fakeFetch`). */
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

/** Writes a throwaway `<root>/<BRAND>/ledger.json` + a real Brief, mirroring what `/review-ideas` sees
 *  at Gate 1 — entirely under a temp `brandsRoot`. */
async function withBrandFixture<T>(
  title: string,
  fn: (paths: { readonly brandsRoot: string; readonly queuePath: string }) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "og-accept-to-produced-e2e-"));
  const brandDir = join(root, BRAND);
  await mkdir(brandDir, { recursive: true });
  const briefPath = join(brandDir, "idea-01.md");
  const queuePath = join(root, "queue.json");
  // A REALISTIC Brief body (`## Talking Points` + `## Source(s)`, mirroring every real straw-motion
  // Brief — issue #273 round 2): `acceptIdeaCommand` now reads this file and threads its real content
  // into the authored Spec, so a title-only Brief here would fail authorship on genericness, exercising
  // a shape no real accept ever actually authors from.
  await writeFile(
    briefPath,
    `# ${title}\n\n` +
      "## Talking Points\n" +
      "- The company shipped a new capability three weeks after its last release.\n" +
      "- Pricing dropped for the introductory period, undercutting every rival offer.\n" +
      "- Independent benchmarks show a real jump in the underlying model's accuracy.\n" +
      "- Engineering teams now face integration fatigue from the pace of change.\n\n" +
      "## Source(s)\n- https://example.com/real-source\n",
    "utf8",
  );
  await writeFile(
    join(brandDir, "ledger.json"),
    JSON.stringify({
      ideas: [{ id: "idea-01", status: "suggested", run: RUN, format: FORMAT, title, brief_path: briefPath }],
    }),
    "utf8",
  );
  try {
    return await fn({ brandsRoot: root, queuePath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Isolates the Brand's `mediaRoot` to the SAME throwaway directory `withTempDb`'s own SQLite file lives
 *  in, so a test that downloads rendered media never writes into the real, committed `data/` tree. */
function isolateMediaRoot(db: DatabaseSync, brandId: string, dbPath: string): void {
  updateBrand(db, brandId, { mediaRoot: dirname(dbPath) });
}

describe("accept -> drainQueue -> produced — a News Carousel job reaches produced with ZERO attended session (ADR-0031, issue #264)", () => {
  it("acceptIdeaCommand authors the Spec; drainQueue alone (never runOneJob called by hand) carries the job to done/produced", async () => {
    await withTempDb(async (db, dbPath) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      isolateMediaRoot(db, brandId, dbPath);
      createFormat(db, { brandId, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });
      const channelId = createChannel(db, { brandId, platform: "facebook", isPrimary: true });
      createBrandAsset(db, {
        brandId,
        key: "brand-logo",
        storageKey: "brands/straw-motion/assets/brand-logo.png",
        mime: "image/png",
        bytes: 10,
        checksum: "abc",
      });

      await withBrandFixture("A brand new headline about real AI news", async ({ brandsRoot, queuePath }) => {
        // --- Step 1: accept — the ONLY step with any human involvement, and even this is a single
        // compiled call (no Skill tool, no LLM, no attended agent session in this test). -------------
        const acceptOut = await acceptIdeaCommand(BRAND, "idea-01", ["news-carousel"], [], {
          brandsRoot,
          queuePath,
          db,
          now: () => NOW,
        });
        assert.doesNotMatch(acceptOut, /AUTHORSHIP FAILED/);
        assert.match(acceptOut, /Spec persisted for "news-carousel"/);

        const sqlIdea = getIdeaByLegacyRef(db, brandId, "idea-01")!;
        const assetsBefore = (await loadIdeaAssets(sqlIdea.id, { db })) as readonly DbAssetRecord[];
        const asset = assetsBefore.find((a) => a.recipe === "news-carousel")!;
        assert.ok(asset.spec, "the Spec is authored and persisted BEFORE the job is ever drained");
        assert.equal(asset.status, "queued");

        // --- Step 2: the UNATTENDED worker drains the SQL job queue — the SAME drainQueue /run-worker
        // runs. No attended Producer session, no Skill tool, no human pick — the Recipe declares ZERO
        // gates. This is the literal proof: `runOneJob` is never called directly by this test. ---------
        const fetchImpl = fakeFetch({ [CAROUSEL_ASSET_URL]: { body: "rendered-bytes", contentType: "image/png" } });
        const summary = await drainQueue(db, new FakeCarouselSpace(), { poll: FAKE_POLL, fetchImpl });

        assert.equal(summary.processed.length, 1, "drainQueue found and processed exactly the job acceptIdeaCommand enqueued");
        const { outcome } = summary.processed[0]!;
        assert.equal(outcome.status, "done", JSON.stringify(outcome));

        const assetsAfter = (await loadIdeaAssets(sqlIdea.id, { db })) as readonly DbAssetRecord[];
        const produced = assetsAfter.find((a) => a.recipe === "news-carousel")!;
        assert.equal(produced.status, "produced");
        assert.ok(produced.produced_at);

        const media = listAssetMedia(db, produced.id);
        assert.equal(media.length, 1);
        assert.equal(media[0]!.mime, "image/png");

        const copy = getCopyVariantForChannel(db, produced.id, channelId);
        assert.ok(copy, "the Copy Variant is composed and saved too, unattended");
        assert.ok(copy!.caption.length > 0);
      });
    });
  });
});

describe("accept -> drainQueue -> parked — a gated Recipe still parks at its Cast gate, never rendering past it (ADR-0031, issue #264)", () => {
  it("Character Explainer with Cast: drainQueue parks at awaiting_pick through the SAME accept-then-drain path", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const brandId = createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(db, { brandId, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      await withBrandFixture("A different real headline for the character Recipe", async ({ brandsRoot, queuePath }) => {
        const acceptOut = await acceptIdeaCommand(BRAND, "idea-01", ["character-explainer-with-cast"], [], {
          brandsRoot,
          queuePath,
          db,
          now: () => NOW,
        });
        assert.doesNotMatch(acceptOut, /AUTHORSHIP FAILED/);

        const summary = await drainQueue(db, new FakeSpace(), { poll: FAKE_POLL });

        assert.equal(summary.processed.length, 1);
        const { outcome } = summary.processed[0]!;
        assert.equal(outcome.status, "parked");
        if (outcome.status !== "parked") return;
        assert.equal(outcome.gate, "cast");

        const sqlIdea = getIdeaByLegacyRef(db, brandId, "idea-01")!;
        const assets = (await loadIdeaAssets(sqlIdea.id, { db })) as readonly DbAssetRecord[];
        const asset = assets.find((a) => a.recipe === "character-explainer-with-cast")!;
        assert.equal(asset.status, "in_production");
        assert.equal(asset.pending_gate, "cast");
      });
    });
  });
});
