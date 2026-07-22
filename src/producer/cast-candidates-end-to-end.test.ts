/**
 * Cast-candidate download, end-to-end against the FAKE Magnific Space (issue #119, AC1).
 *
 * Proves the full composition the real `producer` agent's Cast-gate step now follows: drive the wired
 * *Character Explainer with Cast* Recipe's first leg to its Cast gate (the SAME `driveToNextGate` +
 * `FakeSpace` `driver.test.ts` already exercises) -> download every paused candidate to a local folder
 * (`castCandidatesDirFor` + `downloadCastCandidates`) -> write the Idea's Asset to the ledger with the
 * downloaded candidates and the recorded gate pause, in the SAME step (AC1). No live `spaces_*`/
 * `creations_*` call anywhere — `FakeSpace` (`src/space-driver/fixtures/fake-space.ts`) IS the Magnific
 * fake this whole test drives against.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { driveToNextGate, type DriveLegInput } from "../space-driver/driver.ts";
import type { PollOptions } from "../space-driver/driver.ts";
import { FakeSpace, JSON_MASTER_NODE_NAME, expectedCastUrls } from "../space-driver/fixtures/fake-space.ts";
import { fakeSpaceState } from "../execution-protocol/fixtures/space-state.ts";
import { validSpec } from "../production-spec/fixtures/specs.ts";
import { getRecipe } from "../recipe/registry.ts";
import { castCandidatesDirFor, downloadCastCandidates } from "../asset/cast-candidates.ts";
import { writeAsset, loadIdeaAssets } from "../asset/store.ts";
import { findAsset } from "../asset/asset.ts";

const FAST: PollOptions = { sleep: async () => {} };
const RECIPE = getRecipe("character-explainer-with-cast")!;

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-cast-e2e-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A hand-rolled fetch stub keyed by the FakeSpace's own deterministic Cast candidate URLs. */
function stubFetchForCandidateUrls(urls: readonly string[]) {
  const byUrl = new Map(urls.map((url, i) => [url, `bytes-for-candidate-${i + 1}`]));
  return async (url: string | URL | Request): Promise<Response> => {
    const key = String(url);
    const body = byUrl.get(key);
    if (body === undefined) throw new Error(`stubFetchForCandidateUrls: no entry for ${key}`);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    } as Response;
  };
}

describe("Cast-gate download, end to end against the FakeSpace (issue #119, AC1)", () => {
  it("downloads every paused candidate to castCandidatesDirFor's folder and records local paths + the gate pause in the same ledger write", async () => {
    await withTempDir(async (dir) => {
      const ideasRoot = join(dir, "ideas");
      const ledgerPath = join(dir, "ledger.json");
      const ideaId = "idea-2026-W30-01";
      const run = "2026-W30";

      await writeFile(
        ledgerPath,
        JSON.stringify({ ideas: [{ id: ideaId, status: "accepted", format: "unhypped-news", assets: [] }] }, null, 2) + "\n",
        "utf8",
      );

      // 1. Drive the Recipe's first leg to its Cast gate against the FakeSpace — the SAME driver call
      //    the real Producer makes (mirrors driver.test.ts's own "pauses with the Cast candidates" case).
      const space = new FakeSpace();
      const input: DriveLegInput = {
        kind: "first",
        targetGate: "cast",
        spec: validSpec(),
        promptNode: RECIPE.canvasInputs.promptNode,
      };
      assert.equal(RECIPE.canvasInputs.promptNode, JSON_MASTER_NODE_NAME);

      const driven = await driveToNextGate(space, fakeSpaceState(), input, FAST);
      assert.equal(driven.ok, true);
      if (!driven.ok) return;
      assert.equal(driven.outcome.kind, "paused");
      if (driven.outcome.kind !== "paused") return;
      assert.equal(driven.outcome.gate, "cast");
      assert.equal(driven.outcome.candidates.length, 6);

      // 2. Download every paused candidate — the new issue #119 step — into the gate-scoped folder.
      const destDir = castCandidatesDirFor(ideaId, run, ideasRoot, RECIPE.slug);
      assert.equal(destDir, join(ideasRoot, run, "idea-01.character-explainer-with-cast.cast"));

      const fetchImpl = stubFetchForCandidateUrls(expectedCastUrls());
      const downloadedCast = await downloadCastCandidates(destDir, driven.outcome.candidates, fetchImpl);
      assert.equal(downloadedCast.length, 6);

      // 3. Write the Idea's Asset to the ledger with the downloaded candidates AND the recorded gate
      //    pause, in the SAME write (AC1: "before/at the same time the ledger records the gate pause").
      await writeAsset(
        ideaId,
        RECIPE.slug,
        { status: "in_production", pending_gate: "cast", cast: downloadedCast },
        { ledgerPath },
      );

      // --- Assertions ---

      // The folder exists and holds exactly the 6 downloaded candidate images.
      const entries = (await readdir(destDir)).sort();
      assert.deepEqual(
        entries,
        ["1-cast-1.png", "2-cast-2.png", "3-cast-3.png", "4-cast-4.png", "5-cast-5.png", "6-cast-6.png"],
      );
      assert.equal(await readFile(join(destDir, "1-cast-1.png"), "utf8"), "bytes-for-candidate-1");

      // The ledger's Asset carries the gate pause AND every candidate's local path alongside its
      // existing identifier/url (AC2) — never only the remote URL.
      const assets = await loadIdeaAssets(ideaId, ledgerPath);
      assert.ok(assets !== null);
      const asset = findAsset(assets!, RECIPE.slug);
      assert.ok(asset !== null);
      assert.equal(asset!.status, "in_production");
      assert.equal(asset!.pending_gate, "cast");
      assert.equal(asset!.cast?.length, 6);
      for (const [i, candidate] of asset!.cast!.entries()) {
        assert.equal(candidate.identifier, `cast-${i + 1}`);
        assert.equal(candidate.url, expectedCastUrls()[i]);
        assert.equal(candidate.path, join(destDir, `${i + 1}-cast-${i + 1}.png`));
      }

      // The gate-candidate folder is a DISTINCT sibling of the eventual produced-Asset `.output/`
      // bundle and the Spec (`.spec.json`) — never the same directory (AC3: same convention FAMILY,
      // distinctly named).
      assert.ok(destDir.endsWith(".cast"));
      assert.notEqual(destDir, join(ideasRoot, run, "idea-01.character-explainer-with-cast.output"));

      // No live Magnific call anywhere: every edit/run went through the in-memory FakeSpace.
      assert.equal(space.editGoals.length, 1);
      assert.equal(space.runs.length, 1);
    });
  });
});
