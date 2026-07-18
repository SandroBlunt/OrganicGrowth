/**
 * The tracer bullet (issue #89 — Recipe build 9, delivering #60's original finish line on the locked
 * architecture, map #70, ADRs 0015-0018): ONE accepted Idea, run through BOTH wired Recipes —
 * *Character Explainer with Cast* (one gate) and *News Carousel* (zero gates) — yields TWO independent
 * Assets with DISTINCT composed Copy, each independently attributable via `/log-post`, each shown at
 * its OWN stage by `/queue` and `/report`, and scored independently by `/track-performance`.
 *
 * Hermetic throughout — THIS IS THE MAGNIFIC FAKE for both Spaces: the wired leg drives `FakeSpace`
 * (`space-driver/fixtures/fake-space.ts`); the carousel leg drives the REBUILT `FakeCarouselSpace`
 * (`producer/fixtures/fake-carousel-space.ts`, matching the live capture — issue #86/#89, proven by
 * `fake-carousel-space.test.ts`). No live `spaces_*`/`creations_*` call, no credits, no board mutation.
 * `/track-performance`'s Apify call is a fake port (mirrors `commands/track-performance.test.ts`) — no
 * live Apify call either. Copy composition reads the REAL, committed Straw Motion `brand-profile.yaml`
 * (read-only; never mutated) so the two Recipes' distinct copy shapes are exercised against real rules.
 *
 * The seeded Idea (`idea-2026-W29-01`, "AI just got a job...") is Straw Motion's REAL idea-01 brief
 * subject (`data/brands/straw-motion/ideas/2026-W29/idea-01.md`) — the same Idea
 * `strawMotionIdeaOneCarouselSpec()` already authors a real, graduated carousel Spec for (issue #87).
 * All writes land in a TEMP ledger + TEMP queue file; the real committed `data/brands/straw-motion/`
 * tree and `data/queue.json` are never touched.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getRecipe } from "../recipe/registry.ts";
import { auditAuthorPhase, auditBindMediaPhase, auditCopyPhase } from "../recipe/phase-contract.ts";
import {
  driveToNextGate,
  bindMediaAsset,
  CHARACTER_NODE_NAME,
  type DriveLegInput,
  type PollOptions,
} from "../space-driver/driver.ts";
import { FakeSpace } from "../space-driver/fixtures/fake-space.ts";
import { fakeSpaceState } from "../execution-protocol/fixtures/space-state.ts";
import { FakeCarouselSpace } from "./fixtures/fake-carousel-space.ts";
import { bindMediaSlots } from "./bind-media.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";
import {
  STRAW_MOTION_BASELINE,
  strawMotionIdeaOneCarouselSpec,
} from "../production-spec/fixtures/news-carousel-straw-motion-specs.ts";
import { auditNewsCarouselAuthorPhase } from "../production-spec/news-carousel-author-checklist.ts";
import { specPathFor, saveSpec } from "../production-spec/store.ts";
import { composeCopy } from "../copy/compose.ts";
import { getBrandAsset } from "../brand-asset/store.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";
import { enqueueNextLeg } from "../production-queue/queue.ts";
import { markRunning, markAwaitingPick, markDone, markPickConsumed } from "../production-queue/scheduler.ts";
import { loadQueue, saveQueue } from "../production-queue/store.ts";
import { enqueueOnAccept } from "../production-queue/enqueue-on-accept.ts";
import { queueCommand } from "../commands/queue.ts";
import { reportCommand } from "../commands/report.ts";
import { logPostCommand } from "../commands/log-post.ts";
import { trackPerformanceCommand } from "../commands/track-performance.ts";
import type { PerformanceScrapePort } from "../commands/track-performance-port.ts";

const FAST: PollOptions = { sleep: async () => {} };

const BRAND = "straw-motion";
const WIRED_RECIPE = "character-explainer-with-cast";
const CAROUSEL_RECIPE = "news-carousel";
const IDEA_ID = "idea-2026-W29-01";
const IDEA_TITLE = "AI just got a job: the three assistants that now do the work for you";
const RUN = "2026-W29";

// The REAL, committed Straw Motion Brand Profile — read-only (never written to). Its default shape
// (no required CTA/hashtags/banned words) means the two Recipes' copy shapes alone drive divergence.
const STRAW_MOTION_BRAND_PROFILE = "data/brands/straw-motion/brand-profile.yaml";

describe("One Idea -> two Recipes -> two Assets, end-to-end against the FAKE (issue #89)", () => {
  let ledgerPath: string;
  let queuePath: string;
  let ideasRoot: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-two-recipes-"));
    ledgerPath = join(dir, "ledger.json");
    queuePath = join(dir, "queue.json");
    ideasRoot = join(dir, "ideas");
    const seed = {
      ideas: [
        {
          id: IDEA_ID,
          title: IDEA_TITLE,
          status: "accepted",
          fit_score: 0.73,
          format: "unhypped-news",
        },
      ],
      // A pre-established Channel baseline (mirrors `commands/track-performance.test.ts`'s "two Assets"
      // scenario): against a NULL baseline every metric scores the neutral 0.5 regardless of the actual
      // reading (`performance/score.ts`), which would make the two Recipes' genuinely different
      // engagement collapse to the SAME score on their first-ever tracking pull. Seeding a real baseline
      // up front lets Step 5 prove the two Posts' DIFFERENT engagement yields DIFFERENT scores.
      baseline: { shares: 5, comments: 10, reactions: 40, views: 900, updated_at: "2026-07-01T00:00:00.000Z" },
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });

  after(async () => {
    await cleanup();
  });

  // === Step 1 — Review: accepting the Idea with BOTH chosen Recipes enqueues ONE job each ============

  it("enqueueOnAccept enqueues ONE job per chosen Recipe for the SAME Idea — the second Recipe is never dropped as a duplicate (ADR-0009)", async () => {
    const result = await enqueueOnAccept(IDEA_ID, BRAND, [WIRED_RECIPE, CAROUSEL_RECIPE], {
      ledgerPath,
      queuePath,
      now: () => "2026-07-18T09:00:00.000Z",
    });
    assert.equal(result.enqueued, true);
    assert.deepEqual(result.outcomes, [
      { recipe: WIRED_RECIPE, enqueued: true },
      { recipe: CAROUSEL_RECIPE, enqueued: true },
    ]);

    const queue = await loadQueue(queuePath);
    assert.equal(queue.jobs.length, 2);
    const wiredJob = queue.jobs.find((j) => j.recipe === WIRED_RECIPE)!;
    const carouselJob = queue.jobs.find((j) => j.recipe === CAROUSEL_RECIPE)!;
    assert.equal(wiredJob.idea_id, IDEA_ID);
    assert.equal(wiredJob.brand, BRAND);
    // The wired Recipe's FIRST gate is "cast"; the News Carousel Recipe declares ZERO gates, so its
    // first (and only) leg targets `null` — a DIFFERENT gate-count exercised end-to-end (AC3).
    assert.equal(wiredJob.gate, "cast");
    assert.equal(carouselJob.gate, null);
    assert.equal(wiredJob.status, "queued");
    assert.equal(carouselJob.status, "queued");
  });

  // === Step 2 — the ZERO-gate News Carousel job runs straight through, no pause (AC3) =================

  let carouselAssetUrl: string;
  let carouselCopyCaption: string;

  it("the News Carousel job (zero gates) drives straight to a produced Asset — no pause, ever", async () => {
    const recipe = getRecipe(CAROUSEL_RECIPE)!;

    // markRunning: the Space is free (the wired job is still `queued`, not `running`) — FIFO order
    // does not force one Recipe's job to block the other's from starting.
    const running = markRunning(await loadQueue(queuePath), BRAND, IDEA_ID, CAROUSEL_RECIPE);
    assert.equal(running.ok, true);
    await saveQueue(running.state, queuePath);

    // Author (already-authored, real Straw Motion Spec — the Skill's own graduated output, issue #87)
    // self-audits against BOTH the generic and the graduated checklist before it is saved.
    const spec = strawMotionIdeaOneCarouselSpec();
    assert.equal(auditAuthorPhase(recipe, { candidateSpec: spec, bannedWords: [] }).ok, true);
    assert.equal(auditNewsCarouselAuthorPhase(spec, [], STRAW_MOTION_BASELINE).ok, true);
    const specPath = specPathFor(IDEA_ID, RUN, ideasRoot, CAROUSEL_RECIPE);
    await saveSpec(spec, specPath);

    // Bind phase: the REAL committed Straw Motion Brand Asset "brand-logo" resolves (read-only lookup
    // against the real `data/brands/straw-motion/assets/` tree — never mutated).
    const logoLookup = await getBrandAsset(BRAND, "brand-logo");
    assert.equal(logoLookup.found, true);
    if (!logoLookup.found) return;

    const logoSlotName = Object.keys(recipe.canvasInputs.mediaSlots)[0]!;
    const bindResult = bindMediaSlots(recipe, {
      [logoSlotName]: { kind: "brand-asset", found: true, path: logoLookup.asset.path },
    });
    assert.equal(bindResult.ok, true);
    if (!bindResult.ok) return;
    assert.equal(auditBindMediaPhase(recipe, { boundSlotNames: bindResult.boundSlotNames }).ok, true);

    const space = new FakeCarouselSpace();
    for (const b of bindResult.bound) {
      if (b.resolution.kind !== "brand-asset") continue;
      const bound = await bindMediaAsset(space, b.resolution.path, b.slot.media, b.name, FAST);
      assert.equal(bound.ok, true);
    }

    // Render: ONE leg, targetGate: null — this Recipe's FIRST leg is ALSO its FINAL leg.
    const input: DriveLegInput = {
      kind: "first",
      targetGate: null,
      spec,
      promptNode: recipe.canvasInputs.promptNode,
    };
    const rendered = await driveToNextGate(space, await space.readState(), input, FAST);
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.equal(rendered.outcome.kind, "finished", "zero gates — runs straight through, never pauses");
    if (rendered.outcome.kind !== "finished") return;

    // Copy — composed OUT of the Space, in THIS Recipe's own shape (2200 chars / 0-2 emoji).
    const copyResult = await composeCopy(
      { title: IDEA_TITLE, mediaContext: "the 7-slide news carousel", hashtags: ["#AInews"] },
      recipe.copyShape,
      { brandProfilePath: STRAW_MOTION_BRAND_PROFILE },
    );
    assert.equal(copyResult.ok, true, JSON.stringify(copyResult.errors));
    if (!copyResult.ok || copyResult.copy === undefined) return;
    assert.equal(auditCopyPhase(recipe, { candidateCopy: copyResult.copy, rules: { requiredCta: null, requiredHashtags: [], bannedWords: [] } }).ok, true);

    carouselAssetUrl = rendered.outcome.asset.assetUrl;
    carouselCopyCaption = copyResult.copy.caption;

    await writeAsset(
      IDEA_ID,
      CAROUSEL_RECIPE,
      {
        status: "produced",
        spec_path: specPath,
        asset_url: rendered.outcome.asset.assetUrl,
        produced_at: "2026-07-18T09:10:00.000Z",
        copy: copyResult.copy,
      },
      { ledgerPath },
    );

    // markDone in ONE step — no `awaiting_pick` ever visited for a zero-gate Recipe.
    const done = markDone(await loadQueue(queuePath), BRAND, IDEA_ID, CAROUSEL_RECIPE);
    assert.equal(done.ok, true);
    await saveQueue(done.state, queuePath);

    const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
    const asset = assets!.find((a) => a.recipe === CAROUSEL_RECIPE)!;
    assert.equal(asset.status, "produced");
    assert.equal(asset.pending_gate, undefined, "a zero-gate Recipe's Asset never carries a pending_gate");
  });

  // === Step 3 — the ONE-gate Cast job independently pauses; /queue shows the two jobs at INDEPENDENT
  //     stages (AC3, AC4) =============================================================================

  let castCandidates: readonly { identifier: string; url: string }[];

  it("the Cast job pauses at its gate WHILE the carousel job has already finished — /queue shows both at their OWN, independent stage", async () => {
    const running = markRunning(await loadQueue(queuePath), BRAND, IDEA_ID, WIRED_RECIPE);
    assert.equal(running.ok, true);
    await saveQueue(running.state, queuePath);

    const recipe = getRecipe(WIRED_RECIPE)!;
    const spec = validSpec();
    assert.equal(auditAuthorPhase(recipe, { candidateSpec: spec, bannedWords: [] }).ok, true);
    const specPath = specPathFor(IDEA_ID, RUN, ideasRoot, WIRED_RECIPE);
    await saveSpec(spec, specPath);

    const space = new FakeSpace();
    const input: DriveLegInput = {
      kind: "first",
      targetGate: "cast",
      spec,
      promptNode: recipe.canvasInputs.promptNode,
    };
    const paused = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(paused.ok, true);
    if (!paused.ok) return;
    assert.equal(paused.outcome.kind, "paused");
    if (paused.outcome.kind !== "paused") return;
    assert.equal(paused.outcome.gate, "cast");
    castCandidates = paused.outcome.candidates;

    await writeAsset(
      IDEA_ID,
      WIRED_RECIPE,
      {
        status: "in_production",
        pending_gate: "cast",
        spec_path: specPath,
        cast: [...castCandidates],
      },
      { ledgerPath },
    );

    const awaitingPick = markAwaitingPick(await loadQueue(queuePath), BRAND, IDEA_ID, WIRED_RECIPE);
    assert.equal(awaitingPick.ok, true);
    await saveQueue(awaitingPick.state, queuePath);

    // /queue shows the SAME Idea's two Recipes at genuinely DIFFERENT stages — the wired job paused
    // at its gate, the carousel job already done (AC3/AC4).
    const queueOutput = await queueCommand(BRAND, queuePath);
    assert.match(queueOutput, new RegExp(`\\[${WIRED_RECIPE}\\]\\s+gate=cast\\s+awaiting_pick`));
    assert.match(queueOutput, new RegExp(`\\[${CAROUSEL_RECIPE}\\]\\s+gate=final\\s+done`));

    // The ledger's own roll-up agrees: the Idea's derived status is the EARLIEST Asset stage
    // (ADR-0011) — `in_production` (the wired Asset), even though the carousel sibling is `produced`.
    const report = await reportCommand(BRAND, ledgerPath);
    assert.match(report, new RegExp(`${IDEA_ID}\\s+\\|\\s+${IDEA_TITLE}\\s+\\|\\s+in_production`));
  });

  // === Step 4 — the Operator's pick resumes the Cast leg; TWO Assets, DISTINCT copy, both logged =====

  let wiredAssetUrl: string;
  let wiredCopyCaption: string;
  let wiredPostUrl: string;
  let carouselPostUrl: string;

  it("resolving the Cast pick renders the SECOND Asset; both Assets carry DISTINCT copy in their OWN Recipe's shape, each independently attributable via /log-post", async () => {
    const recipe = getRecipe(WIRED_RECIPE)!;
    const pick = castCandidates[1]!.identifier; // the Operator's chosen Character

    // /pick's own mechanics (`commands/pick.ts`'s `resumeGate`): enqueue the next leg carrying the
    // pick, then clear the gate.
    const withNextLeg = enqueueNextLeg(await loadQueue(queuePath), IDEA_ID, "2026-07-18T09:20:00.000Z", BRAND, WIRED_RECIPE, null, pick);
    const cleared = markPickConsumed(withNextLeg, BRAND, IDEA_ID, WIRED_RECIPE);
    assert.equal(cleared.ok, true);
    await saveQueue(cleared.ok ? cleared.state : withNextLeg, queuePath);

    const running = markRunning(await loadQueue(queuePath), BRAND, IDEA_ID, WIRED_RECIPE);
    assert.equal(running.ok, true);
    await saveQueue(running.state, queuePath);

    const space = new FakeSpace();
    const input: DriveLegInput = {
      kind: "resumed",
      targetGate: null,
      pick,
      pinnedReferenceNodeName: recipe.space.nodes.pinnedReference ?? CHARACTER_NODE_NAME,
    };
    const rendered = await driveToNextGate(space, fakeSpaceState(), input, FAST);
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.equal(rendered.outcome.kind, "finished");
    if (rendered.outcome.kind !== "finished") return;

    const copyResult = await composeCopy(
      { title: IDEA_TITLE, mediaContext: `Character ${pick}`, hashtags: ["#AIagents"] },
      recipe.copyShape,
      { brandProfilePath: STRAW_MOTION_BRAND_PROFILE },
    );
    assert.equal(copyResult.ok, true, JSON.stringify(copyResult.errors));
    if (!copyResult.ok || copyResult.copy === undefined) return;

    wiredAssetUrl = rendered.outcome.asset.assetUrl;
    wiredCopyCaption = copyResult.copy.caption;

    await writeAsset(
      IDEA_ID,
      WIRED_RECIPE,
      {
        status: "produced",
        character: pick,
        asset_url: rendered.outcome.asset.assetUrl,
        produced_at: "2026-07-18T09:25:00.000Z",
        copy: copyResult.copy,
      },
      { ledgerPath },
    );

    const done = markDone(await loadQueue(queuePath), BRAND, IDEA_ID, WIRED_RECIPE);
    assert.equal(done.ok, true);
    await saveQueue(done.state, queuePath);

    // --- Both Assets exist now, each media-distinct and copy-distinct (AC2) ---
    const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
    assert.equal(assets!.length, 2);
    const wired = assets!.find((a) => a.recipe === WIRED_RECIPE)!;
    const carousel = assets!.find((a) => a.recipe === CAROUSEL_RECIPE)!;
    assert.equal(wired.status, "produced");
    assert.equal(carousel.status, "produced");
    assert.notEqual(wired.asset_url, carousel.asset_url);
    assert.equal(wired.asset_url, wiredAssetUrl);
    assert.equal(carousel.asset_url, carouselAssetUrl);
    assert.notEqual(wired.copy!.caption, carousel.copy!.caption);
    assert.equal(wired.copy!.caption, wiredCopyCaption);
    assert.equal(carousel.copy!.caption, carouselCopyCaption);
    // Distinct copy SHAPES: the wired Recipe caps at 180 chars, the carousel Recipe at 2200.
    assert.ok(wired.copy!.caption.length <= recipe.copyShape.maxChars);
    assert.ok(carousel.copy!.caption.length <= getRecipe(CAROUSEL_RECIPE)!.copyShape.maxChars);

    // --- Publish + explicit attribution: each Asset logged with its OWN URL, via its OWN Recipe slug ---
    wiredPostUrl = "https://facebook.com/permalink/111";
    carouselPostUrl = "https://facebook.com/permalink/222";

    const wiredLogOut = await logPostCommand(BRAND, IDEA_ID, WIRED_RECIPE, wiredPostUrl, "2026-07-18T10:00:00.000Z", {
      ledgerPath,
    });
    assert.match(wiredLogOut, new RegExp(WIRED_RECIPE));

    const carouselLogOut = await logPostCommand(BRAND, IDEA_ID, CAROUSEL_RECIPE, carouselPostUrl, "2026-07-18T10:05:00.000Z", {
      ledgerPath,
    });
    assert.match(carouselLogOut, new RegExp(CAROUSEL_RECIPE));

    const afterLog = await loadIdeaAssets(IDEA_ID, ledgerPath);
    const wiredAfter = afterLog!.find((a) => a.recipe === WIRED_RECIPE)!;
    const carouselAfter = afterLog!.find((a) => a.recipe === CAROUSEL_RECIPE)!;
    assert.equal(wiredAfter.post_url, wiredPostUrl);
    assert.equal(wiredAfter.status, "posted");
    assert.equal(carouselAfter.post_url, carouselPostUrl);
    assert.equal(carouselAfter.status, "posted");
    // Explicit attribution — never inferred, never collapsed: each Asset carries ONLY its own Post.
    assert.notEqual(wiredAfter.post_url, carouselAfter.post_url);
  });

  // === Step 5 — /track-performance scores the two posted Assets INDEPENDENTLY (issue #84, AC4) =======

  it("/track-performance scores the two posted Assets independently, relative to the ONE Channel baseline", async () => {
    const wiredItem = { likes: 40, comments: 10, shares: 5, viewsCount: 900, url: wiredPostUrl, time: "2026-07-18T12:00:00.000Z" };
    const carouselItem = { likes: 400, comments: 100, shares: 50, viewsCount: 9000, url: carouselPostUrl, time: "2026-07-18T12:00:00.000Z" };
    const fakeApify: PerformanceScrapePort = {
      async scrapePost(url: string) {
        if (url === wiredPostUrl) return wiredItem;
        if (url === carouselPostUrl) return carouselItem;
        return null;
      },
    };

    const out = await trackPerformanceCommand(BRAND, undefined, {
      ledgerPath,
      seedsPath: "data/brands/straw-motion/seeds.yaml", // real, committed, Facebook-wired seeds (read-only)
      now: () => "2026-07-18T12:05:00.000Z",
      apify: fakeApify,
    });
    assert.match(out, new RegExp(WIRED_RECIPE));
    assert.match(out, new RegExp(CAROUSEL_RECIPE));

    const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
    const wired = assets!.find((a) => a.recipe === WIRED_RECIPE)!;
    const carousel = assets!.find((a) => a.recipe === CAROUSEL_RECIPE)!;

    assert.ok(typeof wired.performance_score === "number");
    assert.ok(typeof carousel.performance_score === "number");
    assert.notEqual(
      wired.performance_score,
      carousel.performance_score,
      "the two Recipes' Posts had genuinely different engagement — their scores must diverge, never collapse",
    );
    assert.ok(
      carousel.performance_score! > wired.performance_score!,
      "the higher-engagement Post (carousel) must score higher",
    );
    assert.deepEqual(wired.metrics, { shares: 5, comments: 10, reactions: 40, views: 900 });
    assert.deepEqual(carousel.metrics, { shares: 50, comments: 100, reactions: 400, views: 9000 });

    // /report surfaces the BEST of the Idea's two measured scores as an explicit 1:N summary against
    // the single, predicted Fit Score (ADR-0011) — never presenting either Post's score AS the Fit Score.
    const report = await reportCommand(BRAND, ledgerPath);
    assert.match(report, /Fit Score is PREDICTED.*Performance Score is MEASURED/s);
    assert.match(report, new RegExp(`${wiredPostUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(report, new RegExp(`${carouselPostUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });
});
