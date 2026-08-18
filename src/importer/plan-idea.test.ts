/**
 * Tests for `planIdea` (`src/importer/plan-idea.ts`) — issue #204.
 *
 * Covers every legacy Idea shape named in this ticket: a canonical accepted Idea with Assets+media, a
 * suggested Idea with none yet, a rejected Idea with a reason, Straw Motion's third shape (Assets
 * already populated but a stale legacy top-level status), a missing Brief (refusal), and MundoTip's
 * pre-Format shape (no `format` on the record at all — this module does not care; Format resolution is
 * the orchestrator's job, one layer up).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planIdea, type PlanIdeaDeps } from "./plan-idea.ts";
import type { ChannelIdentity } from "./resolve-post-channel.ts";
import type { FullLedgerIdea } from "../ledger/ledger.ts";
import type { KnownPlatform } from "../copy/platform-shape.ts";

const REPO_ROOT = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

function fakeDeps(
  existingKeys: readonly string[] = [],
  specs: Readonly<Record<string, Record<string, unknown>>> = {},
  brandChannelPlatforms: readonly KnownPlatform[] = [],
): PlanIdeaDeps {
  // Test convenience: one blank-`url` Channel per named platform — sufficient for every existing test
  // here, none of which exercises the two-Channels-on-one-platform case (that lives in
  // `resolve-post-channel.test.ts` and `plan.test.ts`'s own dedicated coverage, issue #243).
  const brandChannels: ChannelIdentity[] = brandChannelPlatforms.map((platform) => ({ platform, url: "" }));
  return {
    legacyAbsolutePrefix: REPO_ROOT,
    checkoutRoot: REPO_ROOT,
    mediaFileOps: {
      exists: async (absPath) => existingKeys.some((k) => absPath.endsWith(k)),
      digest: async () => ({ sha256: "deadbeef", sizeBytes: 42 }),
    },
    loadSpec: async (specPath) => specs[specPath] ?? null,
    brandChannels,
  };
}

describe("planIdea — a canonical accepted Idea with one produced Asset + media", () => {
  it("plans title, status, sourceUrls (from the Brief), recipe selections, and the Asset's media", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      title: "AI just got a job",
      trendId: "trend-01",
      fitScore: 0.73,
      status: "accepted",
      recipes: ["news-carousel"],
      declinedRecipes: [],
      createdAt: "2026-07-13T16:15:56Z",
      assets: [
        {
          recipe: "news-carousel",
          status: "produced",
          spec_path: "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json",
          asset_paths: ["data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png"],
          produced_at: "2026-07-21T16:05:55.032Z",
        },
      ],
    };
    const brief = { ok: true as const, content: "## Source(s)\n- https://www.theregister.com/example\n" };
    const result = await planIdea(
      { idea, brief },
      fakeDeps(
        ["data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.assets/0-hook.png"],
        { "data/brands/straw-motion/ideas/2026-W29/idea-01.news-carousel.spec.json": { some: "spec" } },
      ),
    );
    assert.equal(result.problems.length, 0);
    const plan = result.idea!;
    assert.equal(plan.legacyId, "idea-01");
    assert.equal(plan.title, "AI just got a job");
    assert.equal(plan.status, "accepted");
    assert.equal(plan.trendLegacyId, "trend-01");
    assert.equal(plan.fitScore, 0.73);
    assert.equal(plan.createdAt, "2026-07-13T16:15:56Z");
    assert.deepEqual(plan.sourceUrls, ["https://www.theregister.com/example"]);
    assert.deepEqual(plan.recipeSelections, [{ recipe: "news-carousel", chosen: true }]);
    assert.equal(plan.assets.length, 1);
    const asset = plan.assets[0]!;
    assert.equal(asset.recipe, "news-carousel");
    assert.equal(asset.status, "produced");
    assert.equal(asset.producedAt, "2026-07-21T16:05:55.032Z");
    assert.deepEqual(asset.spec, { some: "spec" });
    assert.equal(asset.media.length, 1);
    assert.equal(asset.deadMedia.length, 0);
  });
});

describe("planIdea — a suggested Idea with no Assets yet", () => {
  it("plans with empty recipeSelections and empty assets, no Brief needed for sourceUrls if absent", async () => {
    const idea: FullLedgerIdea = { id: "idea-04", run: "2026-W29", title: "Something", status: "suggested", assets: [] };
    const brief = { ok: true as const, content: "no sources here" };
    const result = await planIdea({ idea, brief }, fakeDeps());
    assert.equal(result.problems.length, 0);
    const plan = result.idea!;
    assert.equal(plan.status, "suggested");
    assert.deepEqual(plan.recipeSelections, []);
    assert.deepEqual(plan.assets, []);
    assert.deepEqual(plan.sourceUrls, []);
  });
});

describe("planIdea — a rejected Idea carries its rejection reason", () => {
  it("plans rejectionReason verbatim", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-2026-W32-02",
      run: "2026-W32",
      status: "rejected",
      rejectionReason: "Too close to last week's Idea",
      assets: [],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps());
    assert.equal(result.idea!.rejectionReason, "Too close to last week's Idea");
  });

  it("refuses a rejected Idea with no rejection_reason (rejectIdea would otherwise throw mid-execution)", async () => {
    const idea: FullLedgerIdea = { id: "idea-99", run: "2026-W32", status: "rejected", assets: [] };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps());
    assert.equal(result.idea, undefined);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /idea-99/);
  });
});

describe("planIdea — Straw Motion's third shape: Assets populated but a stale legacy top-level status", () => {
  it("coerces status to accepted (idea-2026-08-11-12's real shape)", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-2026-08-11-12",
      run: "2026-08-11",
      status: "produced",
      recipes: ["news-carousel"],
      assets: [{ recipe: "news-carousel", status: "produced" }],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps());
    assert.equal(result.problems.length, 0);
    assert.equal(result.idea!.status, "accepted");
  });
});

describe("planIdea — a missing Brief is a refusal-worthy problem", () => {
  it("names every candidate path tried when the Brief cannot be found", async () => {
    const idea: FullLedgerIdea = { id: "idea-99", run: "2026-W29", status: "suggested", assets: [] };
    const result = await planIdea(
      { idea, brief: { ok: false, candidates: ["a/b/idea-99.md", "c/d/idea-99.md"] } },
      fakeDeps(),
    );
    assert.equal(result.idea, undefined);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /idea-99/);
    assert.match(result.problems[0]!, /a\/b\/idea-99\.md/);
  });
});

describe("planIdea — MundoTip's pre-Format shape (no format field at all)", () => {
  it("plans successfully; this module never looks at idea.format", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-2026-W22-01",
      run: "2026-W22",
      title: "El truco de los primeros 10 minutos",
      status: "accepted",
      trendId: "T01",
      fitScore: 0.66,
      assets: [],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps());
    assert.equal(result.problems.length, 0);
    assert.equal(result.idea!.status, "accepted");
    assert.equal(result.idea!.trendLegacyId, "T01");
  });
});

describe("planIdea — declined Recipes carry their reason; a dead media path is reported, not a problem", () => {
  it("carries chosen + declined recipe selections and a dead asset_paths entry", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-2026-08-14-01",
      run: "2026-08-14",
      status: "accepted",
      recipes: ["news-carousel"],
      declinedRecipes: [{ recipe: "news-short-script", reason: "Not enough footage this week" }],
      assets: [
        {
          recipe: "news-carousel",
          status: "produced",
          asset_paths: ["data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-short-script.output/script.txt"],
        },
      ],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps([]));
    assert.equal(result.problems.length, 0);
    assert.deepEqual(result.idea!.recipeSelections, [
      { recipe: "news-carousel", chosen: true },
      { recipe: "news-short-script", chosen: false, declineReason: "Not enough footage this week" },
    ]);
    assert.equal(result.idea!.assets[0]!.media.length, 0);
    assert.equal(result.idea!.assets[0]!.deadMedia.length, 1);
  });
});

describe("planIdea — a title-less record degrades its title to the Idea id (mirrors loadReport's own convention)", () => {
  it("uses the id when title is absent", async () => {
    const idea: FullLedgerIdea = { id: "idea-05", run: "2026-W29", status: "suggested", assets: [] };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps());
    assert.equal(result.idea!.title, "idea-05");
  });
});

// ---------------------------------------------------------------------------
// post_url resolution (issue #240)
// ---------------------------------------------------------------------------

describe("planIdea — an Asset's post_url resolves to a Channel the Brand actually has configured", () => {
  it("a real facebook.com permalink resolves against a Brand configured for facebook", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-2026-W32-01",
      run: "2026-W32",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [
        {
          recipe: "news-carousel",
          status: "posted",
          post_url: "https://www.facebook.com/permalink.php?story_fbid=pfbid0VMYBWh&id=61591885769033",
          posted_at: "2026-08-04T18:03:10.000Z",
        },
      ],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps([], {}, ["facebook"]));
    assert.equal(result.problems.length, 0);
    const asset = result.idea!.assets[0]!;
    assert.equal(asset.postUrl, "https://www.facebook.com/permalink.php?story_fbid=pfbid0VMYBWh&id=61591885769033");
    assert.equal(asset.postedAt, "2026-08-04T18:03:10.000Z");
    assert.equal(asset.postPlatform, "facebook");
    assert.equal(asset.postChannelIndex, 0);
  });

  it("an Asset with no post_url carries none of the four Post fields", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [{ recipe: "news-carousel", status: "produced" }],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps([], {}, ["facebook"]));
    assert.equal(result.problems.length, 0);
    const asset = result.idea!.assets[0]!;
    assert.equal(asset.postChannelIndex, undefined);
    assert.equal(asset.postUrl, undefined);
    assert.equal(asset.postedAt, undefined);
    assert.equal(asset.postPlatform, undefined);
  });

  it("refuses when post_url resolves to a platform the Brand has no configured Channel for", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [
        { recipe: "news-carousel", status: "posted", post_url: "https://www.instagram.com/p/abc123/", posted_at: "2026-08-04T18:03:10.000Z" },
      ],
    };
    // This Brand's Channel list only carries facebook — instagram is a real, known platform, just not
    // one this Brand is configured for.
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps([], {}, ["facebook"]));
    assert.equal(result.idea, undefined);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /idea-01/);
    assert.match(result.problems[0]!, /instagram/);
  });

  it("refuses when post_url does not resolve to any known platform at all", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [{ recipe: "news-carousel", status: "posted", post_url: "https://example.com/post/1", posted_at: "2026-08-04T18:03:10.000Z" }],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps([], {}, ["facebook"]));
    assert.equal(result.idea, undefined);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /example\.com/);
  });

  it("refuses when post_url is present but posted_at is missing — never a fabricated timestamp", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [{ recipe: "news-carousel", status: "posted", post_url: "https://www.facebook.com/permalink/1" }],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, fakeDeps([], {}, ["facebook"]));
    assert.equal(result.idea, undefined);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /posted_at/);
  });
});

// ---------------------------------------------------------------------------
// SPECIFIC Channel resolution — two Channels on the same platform (issue #243)
// ---------------------------------------------------------------------------

describe("planIdea — a Brand with TWO Channels on the same platform resolves specifically, or refuses", () => {
  it("resolves postChannelIndex to the Channel whose url identifier matches the post_url's own", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [
        {
          recipe: "news-carousel",
          status: "posted",
          post_url: "https://www.facebook.com/permalink.php?story_fbid=abc&id=99999999999999",
          posted_at: "2026-08-04T18:03:10.000Z",
        },
      ],
    };
    const deps: PlanIdeaDeps = {
      legacyAbsolutePrefix: REPO_ROOT,
      checkoutRoot: REPO_ROOT,
      mediaFileOps: { exists: async () => false, digest: async () => ({ sha256: "deadbeef", sizeBytes: 42 }) },
      loadSpec: async () => null,
      brandChannels: [
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" },
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=99999999999999" },
      ],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, deps);
    assert.equal(result.problems.length, 0);
    assert.equal(result.idea!.assets[0]!.postChannelIndex, 1);
  });

  it("reports (never blocks) when the post_url cannot be matched to a SPECIFIC Channel — issue #243 round 2's Defect 1 fix", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [
        {
          recipe: "news-carousel",
          status: "posted",
          // No id= query param and no numeric/vanity path segment for facebook.com/watch/ — carries no
          // extractable identifier at all, and this Brand has two facebook Channels.
          post_url: "https://www.facebook.com/watch/?v=123",
          posted_at: "2026-08-04T18:03:10.000Z",
        },
      ],
    };
    const deps: PlanIdeaDeps = {
      legacyAbsolutePrefix: REPO_ROOT,
      checkoutRoot: REPO_ROOT,
      mediaFileOps: { exists: async () => false, digest: async () => ({ sha256: "deadbeef", sizeBytes: 42 }) },
      loadSpec: async () => null,
      brandChannels: [
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" },
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=99999999999999" },
      ],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, deps);
    // NOT a refusal (issue #243 round 2): this Idea still plans successfully — one unresolvable Post
    // must never abort a whole Idea/Brand/plan (QA round 1's Defect 1 — see plan.ts's own doc comment).
    assert.equal(result.problems.length, 0);
    const asset = result.idea!.assets[0]!;
    assert.equal(asset.postUrl, undefined);
    assert.equal(asset.postChannelIndex, undefined);
    assert.ok(asset.unresolvedPost, "expected the unresolved Post to be reported, never silently dropped");
    assert.equal(asset.unresolvedPost!.postUrl, "https://www.facebook.com/watch/?v=123");
    assert.match(asset.unresolvedPost!.reason, /cannot disambiguate/);
  });

  it("still refuses (blocks) when post_url is present but posted_at is missing — a data-quality defect, not a Channel-configuration gap", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-01",
      run: "2026-W29",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [{ recipe: "news-carousel", status: "posted", post_url: "https://www.facebook.com/watch/?v=123" }],
    };
    const deps: PlanIdeaDeps = {
      legacyAbsolutePrefix: REPO_ROOT,
      checkoutRoot: REPO_ROOT,
      mediaFileOps: { exists: async () => false, digest: async () => ({ sha256: "deadbeef", sizeBytes: 42 }) },
      loadSpec: async () => null,
      brandChannels: [
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=61591885769033" },
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=99999999999999" },
      ],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, deps);
    assert.equal(result.idea, undefined);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0]!, /posted_at/);
  });

  it("resolves via a Channel's alternate_urls when the post_url's identifier matches only an ALTERNATE, not the Channel's own url", async () => {
    const idea: FullLedgerIdea = {
      id: "idea-2026-W32-10",
      run: "2026-W32",
      status: "accepted",
      recipes: ["news-carousel"],
      assets: [
        {
          recipe: "news-carousel",
          status: "posted",
          // The real idea-2026-W32-10 shape — a DIFFERENT numeric Facebook id than the Channel's own
          // configured url, only resolvable here because the FIRST Channel declares it as an alternate.
          post_url: "https://www.facebook.com/122096865609396192/posts/122114019723396192",
          posted_at: "2026-08-04T18:03:10.000Z",
        },
      ],
    };
    const deps: PlanIdeaDeps = {
      legacyAbsolutePrefix: REPO_ROOT,
      checkoutRoot: REPO_ROOT,
      mediaFileOps: { exists: async () => false, digest: async () => ({ sha256: "deadbeef", sizeBytes: 42 }) },
      loadSpec: async () => null,
      brandChannels: [
        {
          platform: "facebook",
          url: "https://www.facebook.com/profile.php?id=61591885769033",
          alternateUrls: ["https://www.facebook.com/122096865609396192"],
        },
        { platform: "facebook", url: "https://www.facebook.com/profile.php?id=88888888888888" },
      ],
    };
    const result = await planIdea({ idea, brief: { ok: true, content: "" } }, deps);
    assert.equal(result.problems.length, 0);
    const asset = result.idea!.assets[0]!;
    assert.equal(asset.unresolvedPost, undefined);
    assert.equal(asset.postChannelIndex, 0);
    assert.equal(asset.postUrl, "https://www.facebook.com/122096865609396192/posts/122114019723396192");
  });
});
