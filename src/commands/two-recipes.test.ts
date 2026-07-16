/**
 * Two-Recipes end-to-end proof (issue #60 — Multi-format 7).
 *
 * The tracer-bullet test the slice exists to prove: ONE accepted Idea, produced through BOTH wired
 * Recipes (*Character Explainer with Cast* + *News Carousel*), yields TWO independent Assets with
 * DISTINCT composed Copy, each independently publishable and attributable via
 * `/log-post <brand> <idea> <recipe> <url>` — never inferred, never collapsed. It also exercises a
 * gate-count DIFFERENT from the wired Recipe (zero, the carousel) end-to-end alongside the wired
 * Recipe's one-gate path, unchanged.
 *
 * Hermetic throughout: the wired leg drives `FakeSpace` (`space-driver/fixtures/fake-space.ts`); the
 * carousel leg drives `FakeCarouselSpace` (`space-driver/fixtures/fake-carousel-space.ts`) — THIS IS
 * THE MAGNIFIC FAKE for both Spaces. No live `spaces_*`/`creations_*` call, no credits, no board
 * mutation. Copy composition uses `composeCopy`'s DEFAULT deterministic drafter (never a live model).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { driveToNextGate, type DriveLegInput, CHARACTER_NODE_NAME } from "../space-driver/driver.ts";
import { driveSelectedRunPoints } from "../space-driver/driver.ts";
import { FakeSpace } from "../space-driver/fixtures/fake-space.ts";
import { FakeCarouselSpace } from "../space-driver/fixtures/fake-carousel-space.ts";
import { fakeSpaceState } from "../execution-protocol/fixtures/space-state.ts";
import { fakeCarouselSpaceState } from "../execution-protocol/fixtures/carousel-space-state.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";
import { validNewsCarouselSpec } from "../production-spec/fixtures/news-carousel-specs.ts";
import { slideRunPointNames } from "../production-spec/news-carousel-contract.ts";
import { composeCopy } from "../copy/compose.ts";
import { getRecipe } from "../recipe/registry.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";
import { assetMediaUrls, type LedgerAssetRecord } from "../asset/asset.ts";
import { logPostCommand } from "./log-post.ts";
import { loadReport, findIdea, loadIdeas } from "../ledger/ledger.ts";

const FAST = { sleep: async () => {} };

const WIRED_RECIPE = "character-explainer-with-cast";
const CAROUSEL_RECIPE = "news-carousel";
const BRAND = "acme";
const IDEA_ID = "idea-2026-W29-01";

const NO_RULES_PROFILE = join(
  new URL(".", import.meta.url).pathname,
  "..",
  "copy",
  "fixtures",
  "brand-profile.no-rules.yaml",
);

async function withLedger(run: (ledgerPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-two-recipes-"));
  const ledgerPath = join(dir, "ledger.json");
  const seed = {
    ideas: [
      {
        id: IDEA_ID,
        title: "Two Recipes, One Idea",
        status: "accepted",
        fit_score: 0.81,
        recipes: [WIRED_RECIPE, CAROUSEL_RECIPE],
      },
    ],
  };
  await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
  try {
    await run(ledgerPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Drive the WIRED Recipe's Cast → pick → render legs against `FakeSpace`, composing Copy at the end,
 *  and write the resulting Asset to the ledger. Returns the produced Asset for assertions. */
async function produceWiredAsset(ledgerPath: string): Promise<LedgerAssetRecord> {
  const recipe = getRecipe(WIRED_RECIPE)!;
  const space = new FakeSpace();

  const firstLeg: DriveLegInput = { kind: "first", targetGate: "cast", spec: validSpec() };
  const cast = await driveToNextGate(space, fakeSpaceState(), firstLeg, FAST);
  assert.equal(cast.ok, true);
  if (!cast.ok || cast.outcome.kind !== "paused") throw new Error("expected a paused Cast leg");

  const pick = cast.outcome.candidates[2]!.identifier; // "cast-3"
  await writeAsset(
    IDEA_ID,
    WIRED_RECIPE,
    { status: "in_production", pending_gate: "cast", cast: [...cast.outcome.candidates] },
    { ledgerPath },
  );

  const resumedLeg: DriveLegInput = {
    kind: "resumed",
    targetGate: null,
    pick,
    pinnedReferenceNodeName: CHARACTER_NODE_NAME,
  };
  const rendered = await driveToNextGate(space, fakeSpaceState(), resumedLeg, FAST);
  assert.equal(rendered.ok, true);
  if (!rendered.ok || rendered.outcome.kind !== "finished") throw new Error("expected a finished render leg");

  const copyResult = await composeCopy(
    { title: "Two Recipes, One Idea", mediaContext: `Character ${pick}` },
    recipe.copyShape,
    { brandProfilePath: NO_RULES_PROFILE },
  );
  assert.equal(copyResult.ok, true, JSON.stringify(copyResult.errors));
  if (!copyResult.ok || copyResult.copy === undefined) throw new Error("expected a composed Copy");

  await writeAsset(
    IDEA_ID,
    WIRED_RECIPE,
    {
      status: "produced",
      character: pick,
      asset_url: rendered.outcome.asset.assetUrl,
      produced_at: "2026-07-16T12:00:00.000Z",
      copy: copyResult.copy,
    },
    { ledgerPath },
  );

  const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
  return assets!.find((a) => a.recipe === WIRED_RECIPE)!;
}

/** Drive the News Carousel Recipe's single zero-gate leg against `FakeCarouselSpace`, composing Copy,
 *  and write the resulting Asset to the ledger. Returns the produced Asset for assertions. */
async function produceCarouselAsset(ledgerPath: string): Promise<LedgerAssetRecord> {
  const recipe = getRecipe(CAROUSEL_RECIPE)!;
  const space = new FakeCarouselSpace();
  const spec = validNewsCarouselSpec(5);

  const result = await driveSelectedRunPoints(space, fakeCarouselSpaceState(), spec, slideRunPointNames(spec), FAST);
  assert.equal(result.ok, true);
  if (!result.ok || result.outcome.kind !== "finished") throw new Error("expected a finished carousel leg");

  const copyResult = await composeCopy(
    { title: "Two Recipes, One Idea", mediaContext: "the 5-slide carousel" },
    recipe.copyShape,
    { brandProfilePath: NO_RULES_PROFILE },
  );
  assert.equal(copyResult.ok, true, JSON.stringify(copyResult.errors));
  if (!copyResult.ok || copyResult.copy === undefined) throw new Error("expected a composed Copy");

  await writeAsset(
    IDEA_ID,
    CAROUSEL_RECIPE,
    {
      status: "produced",
      asset_urls: result.outcome.asset.media.map((m) => m.url),
      produced_at: "2026-07-16T12:05:00.000Z",
      copy: copyResult.copy,
    },
    { ledgerPath },
  );

  const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
  return assets!.find((a) => a.recipe === CAROUSEL_RECIPE)!;
}

describe("Two Recipes, one Idea — two Assets, distinct copy, independent stages (issue #60)", () => {
  it("produces two Assets, one per Recipe, each with its OWN media shape and DISTINCT composed copy", async () => {
    await withLedger(async (ledgerPath) => {
      const wired = await produceWiredAsset(ledgerPath);
      const carousel = await produceCarouselAsset(ledgerPath);

      const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
      assert.equal(assets!.length, 2);

      // Single-media vs multi-media shape, never both on one Asset (ADR-0011/issue #60).
      assert.equal(typeof wired.asset_url, "string");
      assert.equal(wired.asset_urls, undefined);
      assert.equal(carousel.asset_url, undefined);
      assert.equal(Array.isArray(carousel.asset_urls), true);
      assert.equal(carousel.asset_urls!.length, 5);

      assert.deepEqual(assetMediaUrls(wired), [wired.asset_url]);
      assert.deepEqual(assetMediaUrls(carousel), carousel.asset_urls);

      // Distinct composed Copy — proving the two Recipes' own copy shapes (180/1-3 vs 2200/0-2 emoji)
      // and different mediaContext produce genuinely DIFFERENT captions, never coincidentally equal.
      assert.ok(wired.copy);
      assert.ok(carousel.copy);
      assert.notEqual(wired.copy!.caption, carousel.copy!.caption);
    });
  });

  it("each Asset is independently attributable via /log-post <brand> <idea> <recipe> <url>", async () => {
    await withLedger(async (ledgerPath) => {
      await produceWiredAsset(ledgerPath);
      await produceCarouselAsset(ledgerPath);

      const wiredUrl = "https://facebook.com/permalink/111";
      const carouselUrl = "https://facebook.com/permalink/222";

      const wiredOut = await logPostCommand(BRAND, IDEA_ID, WIRED_RECIPE, wiredUrl, "2026-07-17T09:00:00.000Z", {
        ledgerPath,
      });
      assert.match(wiredOut, new RegExp(WIRED_RECIPE));

      const carouselOut = await logPostCommand(
        BRAND,
        IDEA_ID,
        CAROUSEL_RECIPE,
        carouselUrl,
        "2026-07-17T09:05:00.000Z",
        { ledgerPath },
      );
      assert.match(carouselOut, new RegExp(CAROUSEL_RECIPE));

      const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
      const wired = assets!.find((a) => a.recipe === WIRED_RECIPE)!;
      const carousel = assets!.find((a) => a.recipe === CAROUSEL_RECIPE)!;

      // Each Asset carries ONLY its own Post — never the other's URL (explicit attribution, rule #5).
      assert.equal(wired.post_url, wiredUrl);
      assert.equal(wired.status, "posted");
      assert.equal(carousel.post_url, carouselUrl);
      assert.equal(carousel.status, "posted");
      assert.notEqual(wired.post_url, carousel.post_url);
    });
  });

  it("/report shows both Assets at independent stages when only ONE of the two has been posted", async () => {
    await withLedger(async (ledgerPath) => {
      await produceWiredAsset(ledgerPath); // stays "produced" — not yet posted
      await produceCarouselAsset(ledgerPath);
      await logPostCommand(BRAND, IDEA_ID, CAROUSEL_RECIPE, "https://facebook.com/permalink/333", "2026-07-17T09:00:00.000Z", {
        ledgerPath,
      });

      const report = await loadReport(ledgerPath, BRAND);
      assert.equal(report.ideas.length, 1);
      const idea = report.ideas[0]!;
      // The Idea's derived roll-up is the EARLIEST Asset stage (ADR-0011) — the wired Asset is still
      // `produced` while the carousel Asset has advanced to `posted`.
      assert.equal(idea.status, "produced");
      assert.equal(idea.assets.length, 2);

      const wiredRow = idea.assets.find((a) => a.recipe === WIRED_RECIPE)!;
      const carouselRow = idea.assets.find((a) => a.recipe === CAROUSEL_RECIPE)!;
      assert.equal(wiredRow.status, "produced");
      assert.equal(wiredRow.post_url, null);
      assert.equal(carouselRow.status, "posted");
      assert.equal(carouselRow.post_url, "https://facebook.com/permalink/333");
    });
  });

  it("writing performance to ONE Recipe's Asset never touches the other Recipe's Asset (feeds /track-performance)", async () => {
    await withLedger(async (ledgerPath) => {
      await produceWiredAsset(ledgerPath);
      await produceCarouselAsset(ledgerPath);
      await logPostCommand(BRAND, IDEA_ID, WIRED_RECIPE, "https://facebook.com/permalink/111", "2026-07-10T09:00:00.000Z", {
        ledgerPath,
      });
      await logPostCommand(BRAND, IDEA_ID, CAROUSEL_RECIPE, "https://facebook.com/permalink/222", "2026-07-10T09:05:00.000Z", {
        ledgerPath,
      });

      // Mirrors what /track-performance does per (Idea, Recipe) Asset — write ONLY the wired Asset's
      // measured score, never the carousel sibling's.
      await writeAsset(
        IDEA_ID,
        WIRED_RECIPE,
        { status: "scored", performance_score: 0.64 },
        { ledgerPath },
      );

      const ideas = await loadIdeas(ledgerPath, BRAND);
      const idea = findIdea(ideas, IDEA_ID)!;
      const wired = idea.assets!.find((a) => a.recipe === WIRED_RECIPE)!;
      const carousel = idea.assets!.find((a) => a.recipe === CAROUSEL_RECIPE)!;

      assert.equal(wired.status, "scored");
      assert.equal(wired.performance_score, 0.64);
      // The carousel sibling is UNTOUCHED — still posted, no score yet.
      assert.equal(carousel.status, "posted");
      assert.equal(carousel.performance_score, undefined);
    });
  });
});
