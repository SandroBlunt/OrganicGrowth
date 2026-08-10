/**
 * The REAL, wired News Short Script Recipe runs end-to-end with ZERO Magnific calls (issue #174,
 * ADR-0021).
 *
 * Mirrors `space-less-recipe-end-to-end.test.ts`'s own shape exactly — author -> bind-media (no-op) ->
 * gate (no-op) -> copy -> save — but against the REAL, registered `news-short-script` Recipe (not the
 * throwaway ADR-0021 fixture), and with two things that Recipe's own fixture deliberately left out:
 * a "render" step (Shot List media collection, best-effort, against a LOCAL FAKE downloader) and the
 * full `.output/` bundle write (media + script.txt + shot-list.txt + caption.txt + post.json).
 *
 * THIS IS THE MAGNIFIC FAKE FOR THIS TEST: there isn't one. Nothing in this file imports a
 * `SpaceMcpPort`, `FakeSpace`, or `FakeCarouselSpace` — that absence IS the proof of "zero Magnific
 * calls" for this Recipe's whole path (`usesSpace` is asserted `false` up front).
 *
 * Copy composition reads the REAL, committed Straw Motion `brand-profile.yaml` (read-only; never
 * mutated), mirroring every other end-to-end test's own precedent. All writes land in a TEMP ledger +
 * TEMP ideas root; the real committed `data/brands/straw-motion/` tree is never touched.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getRecipe } from "../recipe/registry.ts";
import { usesSpace } from "./uses-space.ts";
import { bindMediaSlots } from "./bind-media.ts";
import { auditAuthorPhase, auditBindMediaPhase, auditCopyPhase } from "../recipe/phase-contract.ts";
import { specPathFor, saveSpec } from "../production-spec/store.ts";
import { validNewsShortScriptSpec } from "../production-spec/fixtures/news-short-script-specs.ts";
import type { NewsShortScriptSpec } from "../production-spec/news-short-script-contract.ts";
import { collectShotListMedia, downloadedMediaPaths, type ShotListDownloader } from "../asset/shot-list-media.ts";
import { newsShortScriptDraftCopy } from "../copy/news-short-script-draft.ts";
import { composeCopy } from "../copy/compose.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";
import { outputDirFor, writeCaptionText, refreshPostJson } from "../asset/output-bundle.ts";
import { writeScriptText, writeShotListText } from "../asset/news-short-script-output.ts";

const STRAW_MOTION_BRAND_PROFILE = "data/brands/straw-motion/brand-profile.yaml";
const BRAND = "straw-motion";
const IDEA_ID = "idea-2026-W33-01";
const IDEA_TITLE = "This AI tool just replaced three job roles overnight";
const RUN = "2026-W33";
const RECIPE = "news-short-script";

describe("The wired News Short Script Recipe runs author -> bind-media -> gate -> render (Shot List) -> copy -> save, with ZERO Magnific calls (issue #174)", () => {
  let ledgerPath: string;
  let ideasRoot: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-news-short-script-e2e-"));
    ledgerPath = join(dir, "ledger.json");
    ideasRoot = join(dir, "ideas");
    const seed = {
      ideas: [{ id: IDEA_ID, title: IDEA_TITLE, status: "accepted", fit_score: 0.68, format: "unhypped-daily" }],
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });

  after(async () => {
    await cleanup();
  });

  it("is registered, zero gates, no Space — usesSpace is false", () => {
    const recipe = getRecipe(RECIPE);
    assert.ok(recipe !== null);
    assert.deepEqual(recipe!.gates, []);
    assert.equal(usesSpace(recipe!), false);
  });

  it("runs the whole path, producing a valid ledger Asset + a complete .output/ bundle", async () => {
    const recipe = getRecipe(RECIPE)!;

    // --- author: authored + saved, self-audited against THIS Recipe's own spec shape ---
    const spec = validNewsShortScriptSpec();
    const authorAudit = auditAuthorPhase(recipe, { candidateSpec: spec, bannedWords: [] });
    assert.equal(authorAudit.ok, true, JSON.stringify(authorAudit.items));
    const specPath = specPathFor(IDEA_ID, RUN, ideasRoot, recipe.slug);
    await saveSpec(spec, specPath);

    // --- bind-media: no canvas at all -> bindMediaSlots resolves with NOTHING to bind, ok:true ---
    const bindResult = bindMediaSlots(recipe, {});
    assert.equal(bindResult.ok, true);
    if (!bindResult.ok) return;
    assert.deepEqual(bindResult.bound, []);
    const bindAudit = auditBindMediaPhase(recipe, { boundSlotNames: bindResult.boundSlotNames });
    assert.equal(bindAudit.ok, true);

    // --- gate: zero declared gates, nothing pauses, ever ---
    assert.deepEqual(recipe.gates, []);

    // --- render: this Recipe's OWN render step — collect the Shot List's media, best-effort, against
    //     a LOCAL FAKE downloader (never a real network fetch). One beat downloads; one beat's download
    //     fails and falls back to a marked link; one beat has no media_url at all. ---
    const outputDir = outputDirFor(IDEA_ID, RUN, ideasRoot, recipe.slug);
    const download: ShotListDownloader = async (url) => {
      if (url.includes("interview")) return { ok: false, error: "403 Forbidden (streaming-only source)" };
      return { ok: true, bytes: new TextEncoder().encode(`fake bytes for ${url}`), contentType: "video/mp4" };
    };
    const typedSpec = spec as unknown as NewsShortScriptSpec;
    const shotListResults = await collectShotListMedia(typedSpec, outputDir, { download });
    assert.equal(shotListResults.length, typedSpec.beats.length);
    const outcomes = shotListResults.map((r) => r.media.kind);
    assert.ok(outcomes.includes("downloaded"), "at least one beat downloaded");
    assert.ok(outcomes.includes("link"), "at least one beat fell back to a link");

    // --- copy: composed out-of-Space, a title + description, exactly like every other Recipe's copy step ---
    const copyResult = await composeCopy(
      {
        title: IDEA_TITLE,
        angle: "A support-agent rollout with barely two weeks' notice for the team it replaced.",
        mediaContext: "the collected Shot List (announcement clip downloaded, interview clip link-only)",
        hashtags: ["#AI", "#news"],
      },
      recipe.copyShape,
      { brandProfilePath: STRAW_MOTION_BRAND_PROFILE, drafter: newsShortScriptDraftCopy },
    );
    assert.equal(copyResult.ok, true, JSON.stringify(copyResult.errors));
    if (!copyResult.ok || copyResult.copy === undefined) return;
    assert.ok(copyResult.copy.title !== undefined, "a title-carrying Recipe's Copy always has a title");
    assert.ok([...copyResult.copy.title!].length <= recipe.copyShape.titleMaxChars!);
    const copyAudit = auditCopyPhase(recipe, {
      candidateCopy: copyResult.copy,
      rules: { requiredCta: null, requiredHashtags: [], bannedWords: [] },
    });
    assert.equal(copyAudit.ok, true, JSON.stringify(copyAudit.items));

    // --- save: the Asset carries spec_path + asset_paths (the downloaded Shot List media) + copy ---
    const assetPaths = downloadedMediaPaths(shotListResults);
    assert.ok(assetPaths.length > 0);
    await writeAsset(
      IDEA_ID,
      recipe.slug,
      {
        status: "produced",
        spec_path: specPath,
        asset_paths: assetPaths,
        produced_at: "2026-08-11T09:00:00.000Z",
        copy: copyResult.copy,
      },
      { ledgerPath },
    );

    const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
    const asset = assets!.find((a) => a.recipe === recipe.slug)!;
    assert.equal(asset.status, "produced");
    assert.equal(asset.spec_path, specPath);
    assert.deepEqual(asset.asset_paths, assetPaths);
    assert.equal(asset.copy!.title, copyResult.copy.title);
    assert.equal(asset.pending_gate, undefined, "a zero-gate Recipe's Asset never carries a pending_gate");

    // --- the .output/ bundle: media (already written by collectShotListMedia above) + script.txt +
    //     shot-list.txt + caption.txt + post.json — issue #112 conventions, plus this Recipe's own two
    //     extra files (issue #174). ---
    await writeScriptText(outputDir, typedSpec);
    await writeShotListText(outputDir, typedSpec, shotListResults);
    await writeCaptionText(outputDir, copyResult.copy);
    const refreshed = await refreshPostJson(BRAND, IDEA_ID, recipe.slug, { ledgerPath });
    assert.equal(refreshed.ok, true);
    if (!refreshed.ok) return;
    assert.equal(refreshed.dir, outputDir);
    assert.equal(refreshed.postJson.copy!.title, copyResult.copy.title);

    // Every promised bundle file actually exists on disk.
    await assert.doesNotReject(() => access(join(outputDir, "script.txt")));
    await assert.doesNotReject(() => access(join(outputDir, "shot-list.txt")));
    await assert.doesNotReject(() => access(join(outputDir, "caption.txt")));
    await assert.doesNotReject(() => access(join(outputDir, "post.json")));

    // The teleprompter script is a single, clean, copy-paste-ready file — no cues/URLs in it.
    const scriptOnDisk = await readFile(join(outputDir, "script.txt"), "utf8");
    assert.doesNotMatch(scriptOnDisk, /https?:\/\//);
    assert.doesNotMatch(scriptOnDisk, /\[HOOK\]|\[STORY\]|\[CTA\]/);

    // caption.txt leads with the composed title.
    const captionOnDisk = await readFile(join(outputDir, "caption.txt"), "utf8");
    assert.match(captionOnDisk, /^Title: /);

    // post.json's copy round-trips the title (never silently dropped through the ledger).
    const postJsonOnDisk = JSON.parse(await readFile(join(outputDir, "post.json"), "utf8")) as {
      copy: { title?: string } | null;
    };
    assert.equal(postJsonOnDisk.copy?.title, copyResult.copy.title);
  });
});
