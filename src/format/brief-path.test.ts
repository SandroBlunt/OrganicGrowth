/**
 * Tests for `resolveBriefPathCandidates` (`src/format/brief-path.ts`) — QA Round 1 D1 regression
 * coverage (issue #53). Proves `/review-ideas` can resolve a suggested Idea's Brief path for BOTH
 * pre-slice records (stale media-sense `format`, no Format-namespaced Brief) and post-slice records
 * (real editorial Format, Format-namespaced Brief) — critically including the REAL, currently
 * pending `data/brands/straw-motion/ledger.json` records that Round 1 broke on.
 *
 * No live Magnific Space, no Apify, no network — pure path computation plus real-file existence
 * checks against files already committed to the repo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

import { resolveBriefPathCandidates, type SuggestedIdeaRef } from "./brief-path.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The REAL straw-motion 2026-W29 Ideas (the exact QA Round 1 D1 repro)
// ---------------------------------------------------------------------------
// Scoped by RUN, never by lifecycle status: the W29 set is frozen history, while statuses keep
// moving as the pipeline runs (3 of the 7 were accepted+produced in the live smoke tests) — a
// status-scoped filter here rotted the moment the pipeline did its job.

describe("resolveBriefPathCandidates — the real straw-motion 2026-W29 Ideas resolve correctly (QA D1)", () => {
  it("every one of straw-motion's 7 real 2026-W29 Ideas resolves to a Brief that ACTUALLY EXISTS on disk, whatever its status today", async () => {
    const raw = JSON.parse(
      await readFile("data/brands/straw-motion/ledger.json", "utf8"),
    ) as { ideas: Array<Record<string, unknown>> };

    const w29 = raw.ideas.filter((i) => i["run"] === "2026-W29");
    assert.ok(w29.length >= 7, "expected the 7 real 2026-W29 Ideas");

    for (const record of w29) {
      const idea: SuggestedIdeaRef = {
        id: record["id"] as string,
        run: record["run"] as string,
        format: (record["format"] as string | undefined) ?? null,
        briefPath: (record["brief_path"] as string | undefined) ?? null,
      };
      // These records were migrated to the real Format slug "unhypped-news" as part of the Round-2
      // fix (they genuinely are Straw Motion's Unhypped News Ideas — AC2's data-level fix), but the
      // Brief itself still physically lives at the pre-namespacing path recorded in `brief_path`.
      // The regression this guards: `brief_path` must win regardless of what `format` says, since
      // the Brief file's real location predates Format-namespacing — reconstructing from `format`
      // (even a now-correct one) would still compute the WRONG, non-existent path.
      assert.ok(nonEmptyForTest(idea.briefPath), `sanity: ${idea.id} has a recorded brief_path`);

      const candidates = resolveBriefPathCandidates(idea, "straw-motion");
      assert.deepEqual(
        candidates,
        [record["brief_path"]],
        `${idea.id}: brief_path must be trusted exclusively, never reconstructed from format`,
      );
      assert.ok(
        await exists(candidates[0]!),
        `${idea.id}: resolved candidate ${candidates[0]} must actually exist on disk`,
      );
      // The exact QA Round-1 repro: reconstructing from format (even now that it's the real
      // "unhypped-news" slug) yields a Format-namespaced path that does NOT exist on disk.
      const reconstructedPath = `data/brands/straw-motion/ideas/${idea.format}/${idea.run}/${idea.id}.md`;
      assert.equal(
        await exists(reconstructedPath),
        false,
        "sanity: the Format-namespaced reconstruction really doesn't exist — brief_path is required",
      );
    }
  });
});

function nonEmptyForTest(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Pure unit behavior
// ---------------------------------------------------------------------------

describe("resolveBriefPathCandidates — priority order (pure)", () => {
  it("trusts a recorded brief_path exclusively, even when format is stale/wrong", () => {
    const idea: SuggestedIdeaRef = {
      id: "idea-01",
      run: "2026-W29",
      format: "reel",
      briefPath: "data/brands/straw-motion/ideas/2026-W29/idea-01.md",
    };
    assert.deepEqual(
      resolveBriefPathCandidates(idea, "straw-motion"),
      ["data/brands/straw-motion/ideas/2026-W29/idea-01.md"],
    );
  });

  it("falls back to [Format-namespaced, legacy] when brief_path is absent but format is a valid slug", () => {
    const idea: SuggestedIdeaRef = {
      id: "idea-2026-W30-01",
      run: "2026-W30",
      format: "life-hacks",
      briefPath: null,
    };
    assert.deepEqual(
      resolveBriefPathCandidates(idea, "mundotip", "data/brands"),
      [
        "data/brands/mundotip/ideas/life-hacks/2026-W30/idea-01.md",
        "data/brands/mundotip/ideas/2026-W30/idea-01.md",
      ],
    );
  });

  it("falls back to just the legacy path when neither brief_path nor format is present", () => {
    const idea: SuggestedIdeaRef = {
      id: "idea-2026-W22-01",
      run: "2026-W22",
      format: null,
      briefPath: null,
    };
    assert.deepEqual(
      resolveBriefPathCandidates(idea, "mundotip", "data/brands"),
      ["data/brands/mundotip/ideas/2026-W22/idea-01.md"],
    );
  });

  it("never throws on a garbled/invalid format value — degrades to the legacy path", () => {
    const idea: SuggestedIdeaRef = {
      id: "idea-01",
      run: "2026-W1",
      format: "../evil",
      briefPath: null,
    };
    assert.doesNotThrow(() => resolveBriefPathCandidates(idea, "mundotip", "data/brands"));
    assert.deepEqual(
      resolveBriefPathCandidates(idea, "mundotip", "data/brands"),
      ["data/brands/mundotip/ideas/2026-W1/idea-01.md"],
    );
  });

  it("treats a blank brief_path as absent (falls through to reconstruction)", () => {
    const idea: SuggestedIdeaRef = {
      id: "idea-01",
      run: "2026-W29",
      format: "unhypped-news",
      briefPath: "   ",
    };
    assert.deepEqual(
      resolveBriefPathCandidates(idea, "straw-motion", "data/brands"),
      [
        "data/brands/straw-motion/ideas/unhypped-news/2026-W29/idea-01.md",
        "data/brands/straw-motion/ideas/2026-W29/idea-01.md",
      ],
    );
  });

  it("derives the short brief filename the same way specPathFor does (idea-NN, run prefix stripped)", () => {
    const idea: SuggestedIdeaRef = {
      id: "idea-2026-W22-05",
      run: "2026-W22",
      format: null,
      briefPath: null,
    };
    assert.deepEqual(
      resolveBriefPathCandidates(idea, "mundotip", "data/brands"),
      ["data/brands/mundotip/ideas/2026-W22/idea-05.md"],
    );
  });
});
