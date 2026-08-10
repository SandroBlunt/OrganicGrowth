/**
 * A zero-gate, Space-less Recipe runs end-to-end with ZERO Magnific calls (issue #170, ADR-0021).
 *
 * ADR-0021 makes a Recipe's Space target OPTIONAL: a Recipe whose Asset is written words (a script)
 * plus collected media drives no Magnific Space at all. This test proves the GENERIC support that
 * makes such a Recipe representable and drivable through the SAME six-phase shape every wired Recipe
 * already uses — author -> bind-media -> gate -> render -> copy -> save — using a throwaway, NOT-wired
 * fixture Recipe (`src/recipe/fixtures/space-less-recipe.ts`'s `SPACE_LESS_TEST_RECIPE`; the actual
 * News Short Script Recipe is a follow-up slice, per ADR-0021's own text).
 *
 * THIS IS THE MAGNIFIC FAKE FOR THIS TEST: there isn't one. Nothing in this file imports a
 * `SpaceMcpPort`, `FakeSpace`, or `FakeCarouselSpace` — that absence IS the proof of "zero Magnific
 * calls": there is no Space-interaction code path for a Space-less Recipe's job to exercise at all.
 * `usesSpace` (`src/producer/uses-space.ts`) is the single, pure predicate the thin Producer checks
 * before doing ANY canvas work; it is asserted `false` for this fixture up front.
 *
 * Copy composition reads the REAL, committed Straw Motion `brand-profile.yaml` (read-only; never
 * mutated), exactly like `two-recipes-end-to-end.test.ts` already does for both wired Recipes. All
 * writes land in a TEMP ledger + TEMP ideas root; the real committed `data/brands/straw-motion/` tree
 * is never touched.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SPACE_LESS_TEST_RECIPE, validSpaceLessTestSpec } from "../recipe/fixtures/space-less-recipe.ts";
import { auditAuthorPhase, auditBindMediaPhase, auditCopyPhase } from "../recipe/phase-contract.ts";
import { bindMediaSlots } from "./bind-media.ts";
import { usesSpace } from "./uses-space.ts";
import { specPathFor, saveSpec } from "../production-spec/store.ts";
import { composeCopy } from "../copy/compose.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";

const STRAW_MOTION_BRAND_PROFILE = "data/brands/straw-motion/brand-profile.yaml";
const IDEA_ID = "idea-2026-W33-01";
const IDEA_TITLE = "A Space-less script Idea (issue #170 generic-support fixture only)";
const RUN = "2026-W33";

describe("A zero-gate, Space-less Recipe runs author -> bind-media -> gate -> copy -> save, with ZERO Magnific calls (issue #170 AC2)", () => {
  let ledgerPath: string;
  let ideasRoot: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-space-less-e2e-"));
    ledgerPath = join(dir, "ledger.json");
    ideasRoot = join(dir, "ideas");
    const seed = {
      ideas: [{ id: IDEA_ID, title: IDEA_TITLE, status: "accepted", fit_score: 0.6, format: "unhypped-news" }],
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });

  after(async () => {
    await cleanup();
  });

  it("usesSpace(SPACE_LESS_TEST_RECIPE) is false — this whole test never needs a Space port", () => {
    assert.equal(usesSpace(SPACE_LESS_TEST_RECIPE), false);
  });

  it("author -> bind-media (no-op) -> gate (no-op) -> copy -> save, producing a valid ledger Asset with no rendered media", async () => {
    const recipe = SPACE_LESS_TEST_RECIPE;

    // --- author: authored + saved, self-audited against THIS Recipe's own spec shape ---
    const spec = validSpaceLessTestSpec();
    const authorAudit = auditAuthorPhase(recipe, { candidateSpec: spec, bannedWords: [] });
    assert.equal(authorAudit.ok, true, JSON.stringify(authorAudit.items));
    const specPath = specPathFor(IDEA_ID, RUN, ideasRoot, recipe.slug);
    await saveSpec(spec, specPath);

    // --- bind-media: no canvas at all -> bindMediaSlots resolves with NOTHING to bind, ok:true ---
    const bindResult = bindMediaSlots(recipe, {});
    assert.equal(bindResult.ok, true);
    if (!bindResult.ok) return;
    assert.deepEqual(bindResult.bound, []);
    assert.equal(bindResult.boundSlotNames.size, 0);
    const bindAudit = auditBindMediaPhase(recipe, { boundSlotNames: bindResult.boundSlotNames });
    assert.equal(bindAudit.ok, true);
    assert.deepEqual(bindAudit.items, []);

    // --- gate: zero declared gates, nothing pauses, ever ---
    assert.deepEqual(recipe.gates, []);

    // --- render: this Recipe has no Space to drive — deliberately skipped (ADR-0021; the actual
    //     Shot-List download step is this Recipe's own future build slice, not this one) ---

    // --- copy: composed out-of-Space, exactly like both wired Recipes ---
    const copyResult = await composeCopy(
      {
        title: IDEA_TITLE,
        mediaContext: "the collected Shot List (fixture only, no real media exists)",
        hashtags: ["#TestFixture"],
      },
      recipe.copyShape,
      { brandProfilePath: STRAW_MOTION_BRAND_PROFILE },
    );
    assert.equal(copyResult.ok, true, JSON.stringify(copyResult.errors));
    if (!copyResult.ok || copyResult.copy === undefined) return;
    const copyAudit = auditCopyPhase(recipe, {
      candidateCopy: copyResult.copy,
      rules: { requiredCta: null, requiredHashtags: [], bannedWords: [] },
    });
    assert.equal(copyAudit.ok, true, JSON.stringify(copyAudit.items));

    // --- save: the Asset carries spec_path + copy — NO asset_url/asset_paths, since no Space ever
    //     rendered any media (generate-never-publish holds trivially: nothing was even generated by a
    //     Space) ---
    await writeAsset(
      IDEA_ID,
      recipe.slug,
      {
        status: "produced",
        spec_path: specPath,
        produced_at: "2026-08-11T09:00:00.000Z",
        copy: copyResult.copy,
      },
      { ledgerPath },
    );

    const assets = await loadIdeaAssets(IDEA_ID, ledgerPath);
    const asset = assets!.find((a) => a.recipe === recipe.slug)!;
    assert.equal(asset.status, "produced");
    assert.equal(asset.spec_path, specPath);
    assert.equal(asset.copy!.caption, copyResult.copy.caption);
    assert.ok(asset.copy!.caption.length <= recipe.copyShape.maxChars);
    assert.equal(asset.asset_url, undefined, "no Space ever rendered media for this Recipe");
    assert.equal(asset.asset_paths, undefined, "no Space ever rendered media for this Recipe");
    assert.equal(asset.pending_gate, undefined, "a zero-gate Recipe's Asset never carries a pending_gate");
  });
});
