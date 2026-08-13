/**
 * Tests for the Asset pure deep module (`src/asset/asset.ts`) — issue #55 / ADR-0011.
 *
 * All tests are pure — literal in-memory objects only. No disk, no Magnific Space, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAssetStatus,
  earlierAssetStatus,
  parseCastCandidate,
  parseCastArray,
  parseCopy,
  parseCopyVariant,
  parseCopyVariants,
  parseAssetMetrics,
  parseAssetMetricsSnapshot,
  parseAssetMetricsHistory,
  parseAssetPaths,
  parseZohoScheduleReference,
  parseAssetRecord,
  parseAssetsArray,
  findAsset,
  upsertAsset,
  rollupAssetStatus,
  deriveIdeaRollup,
  ideaAtGate,
  ideaHasAssetStatus,
  pendingGateNames,
  type LedgerAssetRecord,
} from "./asset.ts";

// ---------------------------------------------------------------------------
// isAssetStatus / earlierAssetStatus
// ---------------------------------------------------------------------------

describe("isAssetStatus — recognizes exactly the six Asset stages", () => {
  it("accepts every canonical stage", () => {
    for (const s of ["queued", "in_production", "produced", "posted", "tracking", "scored"]) {
      assert.ok(isAssetStatus(s), `${s} must be a valid AssetStatus`);
    }
  });

  it("rejects the retired Idea-level 'casting' and other garbage", () => {
    assert.equal(isAssetStatus("casting"), false);
    assert.equal(isAssetStatus("accepted"), false);
    assert.equal(isAssetStatus(""), false);
    assert.equal(isAssetStatus(42), false);
    assert.equal(isAssetStatus(null), false);
    assert.equal(isAssetStatus(undefined), false);
  });
});

describe("earlierAssetStatus — orders queued < in_production < produced < posted < tracking < scored", () => {
  it("returns the earlier of two stages regardless of argument order", () => {
    assert.equal(earlierAssetStatus("queued", "scored"), "queued");
    assert.equal(earlierAssetStatus("scored", "queued"), "queued");
    assert.equal(earlierAssetStatus("in_production", "produced"), "in_production");
    assert.equal(earlierAssetStatus("posted", "tracking"), "posted");
  });

  it("returns the same stage when both are equal", () => {
    assert.equal(earlierAssetStatus("produced", "produced"), "produced");
  });
});

// ---------------------------------------------------------------------------
// parseCastCandidate / parseCastArray
// ---------------------------------------------------------------------------

describe("parseCastCandidate — defensive parse of one Cast candidate", () => {
  it("parses a well-formed candidate", () => {
    const c = parseCastCandidate({ identifier: "cast-1", url: "https://x/1.png" });
    assert.deepEqual(c, { identifier: "cast-1", url: "https://x/1.png" });
  });

  it("returns null for garbled input (never throws)", () => {
    assert.equal(parseCastCandidate(null), null);
    assert.equal(parseCastCandidate("cast-1"), null);
    assert.equal(parseCastCandidate({ identifier: "cast-1" }), null);
    assert.equal(parseCastCandidate({ url: "https://x/1.png" }), null);
    assert.equal(parseCastCandidate({ identifier: "", url: "https://x/1.png" }), null);
  });

  // --- issue #119: the optional local `path` field ---

  it("parses a candidate carrying a local download path alongside identifier/url", () => {
    const c = parseCastCandidate({
      identifier: "cast-1",
      url: "https://x/1.png",
      path: "data/brands/mundotip/ideas/2026-W22/idea-01.character-explainer-with-cast.cast/1-cast-1.png",
    });
    assert.deepEqual(c, {
      identifier: "cast-1",
      url: "https://x/1.png",
      path: "data/brands/mundotip/ideas/2026-W22/idea-01.character-explainer-with-cast.cast/1-cast-1.png",
    });
  });

  it("a candidate with NO path parses fine and carries no path key at all (AC5, legacy/un-downloaded)", () => {
    const c = parseCastCandidate({ identifier: "cast-1", url: "https://x/1.png" });
    assert.ok(c !== null);
    assert.equal("path" in c!, false, "path must be OMITTED, never present as undefined");
  });

  it("a malformed path (empty string / non-string) is dropped, never the whole candidate", () => {
    const withEmptyPath = parseCastCandidate({ identifier: "cast-1", url: "https://x/1.png", path: "" });
    assert.deepEqual(withEmptyPath, { identifier: "cast-1", url: "https://x/1.png" });

    const withNumericPath = parseCastCandidate({ identifier: "cast-1", url: "https://x/1.png", path: 42 });
    assert.deepEqual(withNumericPath, { identifier: "cast-1", url: "https://x/1.png" });
  });
});

describe("parseCastArray — drops malformed entries, never throws", () => {
  it("keeps only well-formed candidates, in order", () => {
    const raw = [
      { identifier: "cast-1", url: "https://x/1.png" },
      { identifier: "cast-2" }, // malformed — dropped
      { identifier: "cast-3", url: "https://x/3.png" },
    ];
    assert.deepEqual(parseCastArray(raw), [
      { identifier: "cast-1", url: "https://x/1.png" },
      { identifier: "cast-3", url: "https://x/3.png" },
    ]);
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(parseCastArray(undefined), []);
    assert.deepEqual(parseCastArray("nope"), []);
  });

  it("preserves each candidate's own local path (present or absent), independently, in order (issue #119)", () => {
    const raw = [
      { identifier: "cast-1", url: "https://x/1.png", path: "/tmp/x/1-cast-1.png" },
      { identifier: "cast-2", url: "https://x/2.png" }, // no local path yet — still valid
      { identifier: "cast-3", url: "https://x/3.png", path: "/tmp/x/3-cast-3.png" },
    ];
    assert.deepEqual(parseCastArray(raw), [
      { identifier: "cast-1", url: "https://x/1.png", path: "/tmp/x/1-cast-1.png" },
      { identifier: "cast-2", url: "https://x/2.png" },
      { identifier: "cast-3", url: "https://x/3.png", path: "/tmp/x/3-cast-3.png" },
    ]);
  });
});

describe("parseCopy — structured Copy, defensive (ADR-0012, issue #58)", () => {
  it("parses a well-formed Copy", () => {
    const raw = { caption: "Check this out! 🎉", hashtags: ["#tip", "#morning"] };
    assert.deepEqual(parseCopy(raw), raw);
  });

  it("defaults hashtags to [] when missing or non-array", () => {
    assert.deepEqual(parseCopy({ caption: "x" }), { caption: "x", hashtags: [] });
    assert.deepEqual(parseCopy({ caption: "x", hashtags: "nope" }), { caption: "x", hashtags: [] });
  });

  it("drops non-string hashtag entries defensively", () => {
    assert.deepEqual(parseCopy({ caption: "x", hashtags: ["#a", 7, "#b"] }), {
      caption: "x",
      hashtags: ["#a", "#b"],
    });
  });

  it("returns null when caption is missing, blank, or the value isn't an object", () => {
    assert.equal(parseCopy({ hashtags: [] }), null);
    assert.equal(parseCopy({ caption: "" }), null);
    assert.equal(parseCopy(null), null);
    assert.equal(parseCopy("nope"), null);
  });

  // -------------------------------------------------------------------------
  // variants (issue #129) — additive; absent/malformed never breaks the base Copy
  // -------------------------------------------------------------------------

  it("carries NO `variants` key at all when the raw Copy doesn't have one — AC1/AC5, the pre-#129 shape unchanged", () => {
    const parsed = parseCopy({ caption: "x", hashtags: ["#a"] });
    assert.deepEqual(parsed, { caption: "x", hashtags: ["#a"] });
    assert.equal("variants" in parsed!, false);
  });

  it("parses well-formed variants, labeled by platform", () => {
    const raw = {
      caption: "Facebook body",
      hashtags: ["#a"],
      variants: [
        { platform: "facebook", caption: "Facebook body", hashtags: ["#a"] },
        { platform: "linkedin", caption: "LinkedIn body", hashtags: ["#a"] },
      ],
    };
    assert.deepEqual(parseCopy(raw), raw);
  });

  it("drops a malformed variant entry (missing platform/caption) but keeps the well-formed ones", () => {
    const raw = {
      caption: "Facebook body",
      hashtags: [],
      variants: [
        { platform: "facebook", caption: "Facebook body", hashtags: [] },
        { platform: "", caption: "no platform" },
        { caption: "no platform key" },
        { platform: "x" }, // missing caption
        "nope",
      ],
    };
    assert.deepEqual(parseCopy(raw), {
      caption: "Facebook body",
      hashtags: [],
      variants: [{ platform: "facebook", caption: "Facebook body", hashtags: [] }],
    });
  });

  it("degrades to the plain shape (no `variants` key) when `variants` is present but every entry is malformed", () => {
    const parsed = parseCopy({ caption: "x", hashtags: [], variants: ["nope", null, 7] });
    assert.deepEqual(parsed, { caption: "x", hashtags: [] });
    assert.equal("variants" in parsed!, false);
  });

  it("degrades to the plain shape when `variants` is present but not an array", () => {
    assert.deepEqual(parseCopy({ caption: "x", hashtags: [], variants: "nope" }), { caption: "x", hashtags: [] });
  });

  // -------------------------------------------------------------------------
  // title (issue #174) — additive; absent/malformed never breaks the base Copy
  // -------------------------------------------------------------------------

  it("carries NO `title` key at all when the raw Copy doesn't have one — the pre-#174 shape unchanged", () => {
    const parsed = parseCopy({ caption: "x", hashtags: ["#a"] });
    assert.equal("title" in parsed!, false);
  });

  it("parses a well-formed title through, surviving a load -> write -> load round trip", () => {
    const raw = { caption: "A YouTube description body.", hashtags: [], title: "A punchy title" };
    assert.deepEqual(parseCopy(raw), raw);
  });

  it("drops a blank or non-string title defensively, degrading to the plain shape", () => {
    assert.deepEqual(parseCopy({ caption: "x", hashtags: [], title: "" }), { caption: "x", hashtags: [] });
    assert.deepEqual(parseCopy({ caption: "x", hashtags: [], title: 7 }), { caption: "x", hashtags: [] });
  });

  it("carries title AND variants together when both are present", () => {
    const raw = {
      caption: "Body",
      hashtags: [],
      title: "Title here",
      variants: [{ platform: "facebook", caption: "Body", hashtags: [] }],
    };
    assert.deepEqual(parseCopy(raw), raw);
  });
});

describe("parseCopyVariant / parseCopyVariants — one platform-labeled Copy variant (issue #129)", () => {
  it("parses a well-formed variant", () => {
    const raw = { platform: "linkedin", caption: "Hi there.", hashtags: ["#a", "#b"] };
    assert.deepEqual(parseCopyVariant(raw), raw);
  });

  it("defaults hashtags to [] when missing or non-array", () => {
    assert.deepEqual(parseCopyVariant({ platform: "x", caption: "Hi" }), { platform: "x", caption: "Hi", hashtags: [] });
    assert.deepEqual(parseCopyVariant({ platform: "x", caption: "Hi", hashtags: "nope" }), {
      platform: "x",
      caption: "Hi",
      hashtags: [],
    });
  });

  it("returns null when platform or caption is missing/blank/malformed", () => {
    assert.equal(parseCopyVariant({ caption: "Hi", hashtags: [] }), null);
    assert.equal(parseCopyVariant({ platform: "", caption: "Hi" }), null);
    assert.equal(parseCopyVariant({ platform: "x", caption: "" }), null);
    assert.equal(parseCopyVariant({ platform: "x" }), null);
    assert.equal(parseCopyVariant(null), null);
    assert.equal(parseCopyVariant("nope"), null);
  });

  it("parseCopyVariants drops malformed entries and yields [] for non-array/absent input", () => {
    assert.deepEqual(
      parseCopyVariants([
        { platform: "facebook", caption: "A", hashtags: [] },
        { platform: "", caption: "bad" },
        { platform: "x", caption: "B" },
      ]),
      [
        { platform: "facebook", caption: "A", hashtags: [] },
        { platform: "x", caption: "B", hashtags: [] },
      ],
    );
    assert.deepEqual(parseCopyVariants(undefined), []);
    assert.deepEqual(parseCopyVariants("nope"), []);
  });

  // issue #141: a variant's unresolved-LinkedIn-mentions note list must survive the ledger round-trip.
  it("parses a non-empty unresolvedMentions list (issue #141)", () => {
    const raw = {
      platform: "linkedin",
      caption: "Hi there @OpenAI.",
      hashtags: ["#ai"],
      unresolvedMentions: ["Unknown Startup", "Ghost Co"],
    };
    assert.deepEqual(parseCopyVariant(raw), raw);
  });

  it("omits unresolvedMentions entirely when absent, empty, or malformed (never a stray [] key)", () => {
    assert.deepEqual(parseCopyVariant({ platform: "x", caption: "Hi", hashtags: [] }), {
      platform: "x",
      caption: "Hi",
      hashtags: [],
    });
    assert.deepEqual(
      parseCopyVariant({ platform: "x", caption: "Hi", hashtags: [], unresolvedMentions: [] }),
      { platform: "x", caption: "Hi", hashtags: [] },
    );
    assert.deepEqual(
      parseCopyVariant({ platform: "x", caption: "Hi", hashtags: [], unresolvedMentions: "nope" }),
      { platform: "x", caption: "Hi", hashtags: [] },
    );
  });

  it("drops non-string entries from unresolvedMentions rather than throwing", () => {
    assert.deepEqual(
      parseCopyVariant({
        platform: "linkedin",
        caption: "Hi",
        hashtags: [],
        unresolvedMentions: ["Real Co", 42, null, "Other Co"],
      }),
      { platform: "linkedin", caption: "Hi", hashtags: [], unresolvedMentions: ["Real Co", "Other Co"] },
    );
  });
});

// ---------------------------------------------------------------------------
// parseAssetMetrics / parseAssetMetricsSnapshot / parseAssetMetricsHistory (issue #84)
// ---------------------------------------------------------------------------

describe("parseAssetMetrics — the four public metrics behind a performance_score", () => {
  it("parses a well-formed reading", () => {
    const raw = { shares: 10, comments: 5, reactions: 40, views: 900 };
    assert.deepEqual(parseAssetMetrics(raw), raw);
  });

  it("accepts zero for every field (a genuinely quiet post, not fabricated)", () => {
    const raw = { shares: 0, comments: 0, reactions: 0, views: 0 };
    assert.deepEqual(parseAssetMetrics(raw), raw);
  });

  it("returns null when ANY field is missing, negative, or non-numeric — never half-fabricates", () => {
    assert.equal(parseAssetMetrics({ shares: 1, comments: 1, reactions: 1 }), null);
    assert.equal(parseAssetMetrics({ shares: -1, comments: 1, reactions: 1, views: 1 }), null);
    assert.equal(parseAssetMetrics({ shares: "1", comments: 1, reactions: 1, views: 1 }), null);
    assert.equal(parseAssetMetrics(null), null);
    assert.equal(parseAssetMetrics("nope"), null);
  });
});

describe("parseAssetMetricsSnapshot — one history entry", () => {
  it("parses a well-formed snapshot", () => {
    const raw = {
      tracked_at: "2026-06-10T00:00:00.000Z",
      performance_score: 0.4,
      metrics: { shares: 1, comments: 2, reactions: 3, views: 4 },
    };
    assert.deepEqual(parseAssetMetricsSnapshot(raw), raw);
  });

  it("returns null when tracked_at, performance_score, or metrics is missing/malformed", () => {
    const metrics = { shares: 1, comments: 2, reactions: 3, views: 4 };
    assert.equal(parseAssetMetricsSnapshot({ performance_score: 0.4, metrics }), null);
    assert.equal(parseAssetMetricsSnapshot({ tracked_at: "2026-06-10T00:00:00.000Z", metrics }), null);
    assert.equal(
      parseAssetMetricsSnapshot({ tracked_at: "2026-06-10T00:00:00.000Z", performance_score: 0.4 }),
      null,
    );
    assert.equal(parseAssetMetricsSnapshot(null), null);
  });
});

describe("parseAssetMetricsHistory — drops malformed entries, never throws", () => {
  it("keeps only well-formed snapshots, in order", () => {
    const good = {
      tracked_at: "2026-06-10T00:00:00.000Z",
      performance_score: 0.4,
      metrics: { shares: 1, comments: 2, reactions: 3, views: 4 },
    };
    const raw = [good, { tracked_at: "bad-entry" }, good];
    assert.deepEqual(parseAssetMetricsHistory(raw), [good, good]);
  });

  it("returns [] for non-array/absent input", () => {
    assert.deepEqual(parseAssetMetricsHistory(undefined), []);
    assert.deepEqual(parseAssetMetricsHistory("nope"), []);
  });
});

// ---------------------------------------------------------------------------
// parseAssetRecord / parseAssetsArray
// ---------------------------------------------------------------------------

describe("parseAssetPaths — defensive parse of local downloaded-asset file paths", () => {
  it("keeps every non-empty string entry, in order", () => {
    assert.deepEqual(parseAssetPaths(["a.png", "b.png"]), ["a.png", "b.png"]);
  });

  it("drops non-string and empty-string entries rather than throwing", () => {
    assert.deepEqual(parseAssetPaths(["a.png", 42, "", null, "b.png"]), ["a.png", "b.png"]);
  });

  it("yields [] for non-array input", () => {
    assert.deepEqual(parseAssetPaths(undefined), []);
    assert.deepEqual(parseAssetPaths("not-an-array"), []);
    assert.deepEqual(parseAssetPaths(null), []);
  });
});

describe("parseAssetRecord — defensive parse of one raw Asset record", () => {
  it("requires a non-empty recipe and a valid AssetStatus", () => {
    assert.equal(parseAssetRecord({ recipe: "", status: "queued" }), null);
    assert.equal(parseAssetRecord({ recipe: "r", status: "casting" }), null);
    assert.equal(parseAssetRecord({ status: "queued" }), null);
    assert.equal(parseAssetRecord(null), null);
    assert.equal(parseAssetRecord("nope"), null);
  });

  it("parses the minimal shape (recipe + status only)", () => {
    const a = parseAssetRecord({ recipe: "character-explainer-with-cast", status: "queued" });
    assert.deepEqual(a, { recipe: "character-explainer-with-cast", status: "queued" });
  });

  it("parses every optional field when present and well-typed", () => {
    const raw = {
      recipe: "character-explainer-with-cast",
      status: "in_production",
      pending_gate: "cast",
      spec_path: "ideas/2026-W22/idea-01.character-explainer-with-cast.spec.json",
      copy: { caption: "Check this out! 🎉", hashtags: ["#tip"] },
      cast: [{ identifier: "cast-1", url: "https://x/1.png" }],
      character: "cast-1",
      asset_url: "https://x/asset.mp4",
      asset_paths: ["data/brands/mundotip/ideas/2026-W22/idea-01.character-explainer-with-cast.output/asset.mp4"],
      produced_at: "2026-06-05T12:00:00.000Z",
      scheduled_at: "2026-06-06T09:06:00.000Z",
      post_url: "https://facebook.com/post/1",
      posted_at: "2026-06-06T12:00:00.000Z",
      performance_score: 0.72,
      metrics: { shares: 4, comments: 10, reactions: 55, views: 1200 },
      tracked_at: "2026-06-13T12:00:00.000Z",
      history: [
        {
          tracked_at: "2026-06-07T12:00:00.000Z",
          performance_score: 0.5,
          metrics: { shares: 1, comments: 2, reactions: 3, views: 4 },
        },
      ],
      has_video_slide: true,
    };
    const a = parseAssetRecord(raw);
    assert.deepEqual(a, raw);
  });

  // ADR-0024, issue #188: the News Carousel Recipe's own flag — Schedule Batch eligibility's ONE
  // needed fact for keeping a video-slide carousel Asset out of the images-only bulk-export path.
  describe("has_video_slide (ADR-0024, issue #188)", () => {
    it("parses has_video_slide: true", () => {
      const a = parseAssetRecord({ recipe: "news-carousel", status: "produced", has_video_slide: true });
      assert.deepEqual(a, { recipe: "news-carousel", status: "produced", has_video_slide: true });
    });

    it("omits has_video_slide entirely when false — never a stray false key", () => {
      const a = parseAssetRecord({ recipe: "news-carousel", status: "produced", has_video_slide: false });
      assert.deepEqual(a, { recipe: "news-carousel", status: "produced" });
    });

    it("omits has_video_slide when absent or malformed, never throws", () => {
      const absent = parseAssetRecord({ recipe: "news-carousel", status: "produced" });
      assert.equal(absent?.has_video_slide, undefined);
      const malformed = parseAssetRecord({
        recipe: "news-carousel",
        status: "produced",
        has_video_slide: "yes",
      });
      assert.equal(malformed?.has_video_slide, undefined);
    });
  });

  it("silently drops malformed optional fields rather than crashing", () => {
    const a = parseAssetRecord({
      recipe: "r",
      status: "produced",
      performance_score: "not-a-number",
      cast: "not-an-array",
      character: 42,
      metrics: { shares: -1, comments: 1, reactions: 1, views: 1 },
      history: "not-an-array",
      asset_paths: "not-an-array",
      scheduled_at: 42,
    });
    assert.deepEqual(a, { recipe: "r", status: "produced" });
  });

  // issue #141: `scheduled_at` (the Schedule Batch export's stamp, issue #140) is an optional,
  // ISO-8601 Asset field carrying NO lifecycle meaning of its own (ADR-0011 unchanged — no new status).
  describe("scheduled_at (issue #141)", () => {
    it("parses a well-formed ISO-8601 scheduled_at", () => {
      const a = parseAssetRecord({
        recipe: "carousel",
        status: "produced",
        scheduled_at: "2026-08-05T13:23:00.000Z",
      });
      assert.deepEqual(a, { recipe: "carousel", status: "produced", scheduled_at: "2026-08-05T13:23:00.000Z" });
    });

    it("omits scheduled_at when absent", () => {
      const a = parseAssetRecord({ recipe: "carousel", status: "produced" });
      assert.deepEqual(a, { recipe: "carousel", status: "produced" });
      assert.equal(Object.hasOwn(a as object, "scheduled_at"), false);
    });

    it("drops a malformed scheduled_at (non-string/blank) rather than crashing", () => {
      assert.deepEqual(
        parseAssetRecord({ recipe: "carousel", status: "produced", scheduled_at: "" }),
        { recipe: "carousel", status: "produced" },
      );
      assert.deepEqual(
        parseAssetRecord({ recipe: "carousel", status: "produced", scheduled_at: 12345 }),
        { recipe: "carousel", status: "produced" },
      );
    });

    it("adding scheduled_at does not add a new AssetStatus — the six-stage vocabulary is unchanged", () => {
      const a = parseAssetRecord({
        recipe: "carousel",
        status: "produced",
        scheduled_at: "2026-08-05T13:23:00.000Z",
      });
      assert.equal(a?.status, "produced");
    });
  });

  // issue #189, ADR-0027: `camera_hub_uploaded_at` is the News Short Script Recipe's own extension
  // field, carrying NO lifecycle meaning of its own — mirrors `scheduled_at` exactly.
  describe("camera_hub_uploaded_at (issue #189, ADR-0027)", () => {
    it("parses a well-formed ISO-8601 camera_hub_uploaded_at", () => {
      const a = parseAssetRecord({
        recipe: "news-short-script",
        status: "produced",
        camera_hub_uploaded_at: "2026-08-13T09:00:00.000Z",
      });
      assert.deepEqual(a, {
        recipe: "news-short-script",
        status: "produced",
        camera_hub_uploaded_at: "2026-08-13T09:00:00.000Z",
      });
    });

    it("omits camera_hub_uploaded_at when absent", () => {
      const a = parseAssetRecord({ recipe: "news-short-script", status: "produced" });
      assert.deepEqual(a, { recipe: "news-short-script", status: "produced" });
      assert.equal(Object.hasOwn(a as object, "camera_hub_uploaded_at"), false);
    });

    it("drops a malformed camera_hub_uploaded_at (non-string/blank) rather than crashing", () => {
      assert.deepEqual(
        parseAssetRecord({ recipe: "news-short-script", status: "produced", camera_hub_uploaded_at: "" }),
        { recipe: "news-short-script", status: "produced" },
      );
      assert.deepEqual(
        parseAssetRecord({ recipe: "news-short-script", status: "produced", camera_hub_uploaded_at: 42 }),
        { recipe: "news-short-script", status: "produced" },
      );
    });

    it("adding camera_hub_uploaded_at does not add a new AssetStatus — the six-stage vocabulary is unchanged", () => {
      const a = parseAssetRecord({
        recipe: "news-short-script",
        status: "posted",
        camera_hub_uploaded_at: "2026-08-13T09:00:00.000Z",
      });
      assert.equal(a?.status, "posted");
    });

    it("a write to one Asset does not erase a sibling Asset's camera_hub_uploaded_at", () => {
      const assets = [
        { recipe: "news-short-script", status: "produced" as const, camera_hub_uploaded_at: "2026-08-13T09:00:00.000Z" },
        { recipe: "news-carousel", status: "produced" as const },
      ];
      const next = upsertAsset(assets, "news-carousel", { status: "posted", post_url: "https://example.com/x" });
      assert.equal(next[0]!.camera_hub_uploaded_at, "2026-08-13T09:00:00.000Z");
    });
  });

  // issue #161 / ADR-0020: an Asset scheduled via Zoho's MCP path records the EXACT reference (or
  // references) Zoho returned at schedule-time, alongside `scheduled_at` — never re-derived, never
  // normalized. `status` stays `produced`; no new AssetStatus.
  describe("zoho_schedule_reference (issue #161, ADR-0020)", () => {
    it("parseZohoScheduleReference keeps a well-formed single string verbatim", () => {
      assert.equal(parseZohoScheduleReference("post_abc123"), "post_abc123");
    });

    it("parseZohoScheduleReference keeps a well-formed array of strings verbatim, in order", () => {
      const raw = ["fb_post_1", "ig_post_1"];
      assert.deepEqual(parseZohoScheduleReference(raw), raw);
    });

    it("parseZohoScheduleReference rejects a blank string, empty array, or non-string entries", () => {
      assert.equal(parseZohoScheduleReference(""), null);
      assert.equal(parseZohoScheduleReference([]), null);
      assert.equal(parseZohoScheduleReference(["ok", ""]), null);
      assert.equal(parseZohoScheduleReference(["ok", 42]), null);
      assert.equal(parseZohoScheduleReference(42), null);
      assert.equal(parseZohoScheduleReference(null), null);
      assert.equal(parseZohoScheduleReference(undefined), null);
    });

    it("parses a well-formed single-string reference onto the Asset, verbatim", () => {
      const a = parseAssetRecord({
        recipe: "news-carousel",
        status: "produced",
        scheduled_at: "2026-08-10T09:00:00.000Z",
        zoho_schedule_reference: "post_abc123",
      });
      assert.deepEqual(a, {
        recipe: "news-carousel",
        status: "produced",
        scheduled_at: "2026-08-10T09:00:00.000Z",
        zoho_schedule_reference: "post_abc123",
      });
    });

    it("parses a well-formed array of references onto the Asset, verbatim and in order", () => {
      const a = parseAssetRecord({
        recipe: "news-carousel",
        status: "produced",
        zoho_schedule_reference: ["fb_post_1", "ig_post_1", "li_post_1"],
      });
      assert.deepEqual(a?.zoho_schedule_reference, ["fb_post_1", "ig_post_1", "li_post_1"]);
    });

    it("omits zoho_schedule_reference when absent", () => {
      const a = parseAssetRecord({ recipe: "news-carousel", status: "produced" });
      assert.equal(Object.hasOwn(a as object, "zoho_schedule_reference"), false);
    });

    it("drops a malformed zoho_schedule_reference (blank/empty/mixed-type) rather than crashing", () => {
      for (const bad of ["", [], ["ok", ""], ["ok", 42], 42, { post: "x" }]) {
        const a = parseAssetRecord({ recipe: "news-carousel", status: "produced", zoho_schedule_reference: bad });
        assert.equal(Object.hasOwn(a as object, "zoho_schedule_reference"), false);
      }
    });

    it("does not add a new AssetStatus — status stays produced", () => {
      const a = parseAssetRecord({
        recipe: "news-carousel",
        status: "produced",
        zoho_schedule_reference: "post_abc123",
      });
      assert.equal(a?.status, "produced");
      assert.equal(isAssetStatus("scheduled"), false);
    });
  });

  it("parses metrics/tracked_at/history independently of each other (issue #84)", () => {
    const a = parseAssetRecord({
      recipe: "r",
      status: "tracking",
      metrics: { shares: 1, comments: 2, reactions: 3, views: 4 },
      tracked_at: "2026-06-13T12:00:00.000Z",
    });
    assert.deepEqual(a, {
      recipe: "r",
      status: "tracking",
      metrics: { shares: 1, comments: 2, reactions: 3, views: 4 },
      tracked_at: "2026-06-13T12:00:00.000Z",
    });
  });
});

describe("parseAssetsArray — drops malformed entries, never throws", () => {
  it("keeps only well-formed Asset records, in order", () => {
    const raw = [
      { recipe: "r1", status: "queued" },
      { recipe: "r2" }, // malformed — dropped
      { recipe: "r3", status: "produced" },
    ];
    assert.deepEqual(parseAssetsArray(raw), [
      { recipe: "r1", status: "queued" },
      { recipe: "r3", status: "produced" },
    ]);
  });

  it("returns [] for non-array/absent input", () => {
    assert.deepEqual(parseAssetsArray(undefined), []);
    assert.deepEqual(parseAssetsArray(null), []);
  });
});

// ---------------------------------------------------------------------------
// findAsset / upsertAsset
// ---------------------------------------------------------------------------

describe("findAsset — looks up an Asset by recipe", () => {
  const assets: LedgerAssetRecord[] = [
    { recipe: "r1", status: "queued" },
    { recipe: "r2", status: "produced" },
  ];

  it("returns the matching Asset", () => {
    assert.deepEqual(findAsset(assets, "r2"), { recipe: "r2", status: "produced" });
  });

  it("returns null when no Asset matches", () => {
    assert.equal(findAsset(assets, "r3"), null);
  });
});

describe("upsertAsset — pure insert-or-update keyed by recipe", () => {
  it("appends a NEW Asset when the recipe is not yet present", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "queued" }];
    const after = upsertAsset(assets, "r2", { status: "queued" });
    assert.equal(after.length, 2);
    assert.deepEqual(findAsset(after, "r2"), { recipe: "r2", status: "queued" });
  });

  it("updates an EXISTING Asset in place (same array length), merging the patch", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "queued" }];
    const after = upsertAsset(assets, "r1", { status: "in_production", pending_gate: "cast" });
    assert.equal(after.length, 1);
    assert.deepEqual(after[0], { recipe: "r1", status: "in_production", pending_gate: "cast" });
  });

  it("is pure: never mutates the input array or its records", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "queued" }];
    const snapshot = JSON.stringify(assets);
    upsertAsset(assets, "r1", { status: "produced" });
    assert.equal(JSON.stringify(assets), snapshot);
  });

  it("preserves other Assets untouched when updating one", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "queued" },
      { recipe: "r2", status: "produced" },
    ];
    const after = upsertAsset(assets, "r1", { status: "in_production" });
    assert.deepEqual(findAsset(after, "r2"), { recipe: "r2", status: "produced" });
  });
});

// ---------------------------------------------------------------------------
// rollupAssetStatus / deriveIdeaRollup
// ---------------------------------------------------------------------------

describe("rollupAssetStatus — the EARLIEST stage across an Idea's Assets wins", () => {
  it("returns null for an empty Assets list", () => {
    assert.equal(rollupAssetStatus([]), null);
  });

  it("returns the single Asset's status when there is only one", () => {
    assert.equal(rollupAssetStatus([{ recipe: "r1", status: "produced" }]), "produced");
  });

  it("returns the EARLIEST stage when Assets are at different stages (mirrors resolvePhase's earlierPhase)", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "posted" },
      { recipe: "r2", status: "in_production", pending_gate: "cast" },
    ];
    assert.equal(rollupAssetStatus(assets), "in_production");
  });

  it("returns scored only when EVERY Asset is scored", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "scored" },
      { recipe: "r2", status: "scored" },
    ];
    assert.equal(rollupAssetStatus(assets), "scored");
  });
});

describe("deriveIdeaRollup — the Idea's derived roll-up status", () => {
  it("passes through 'suggested' and 'rejected' unchanged (no Assets involved)", () => {
    assert.equal(deriveIdeaRollup("suggested", []), "suggested");
    assert.equal(deriveIdeaRollup("rejected", [{ recipe: "r1", status: "produced" }]), "rejected");
  });

  it("returns 'accepted' when accepted but no Assets exist yet (today's real-ledger case)", () => {
    assert.equal(deriveIdeaRollup("accepted", []), "accepted");
  });

  it("returns the rolled-up Asset stage when accepted WITH Assets", () => {
    assert.equal(
      deriveIdeaRollup("accepted", [{ recipe: "r1", status: "in_production", pending_gate: "cast" }]),
      "in_production",
    );
  });

  it("is pure and does not mutate its input", () => {
    const assets: LedgerAssetRecord[] = [{ recipe: "r1", status: "produced" }];
    const snapshot = JSON.stringify(assets);
    deriveIdeaRollup("accepted", assets);
    assert.equal(JSON.stringify(assets), snapshot);
  });
});

// ---------------------------------------------------------------------------
// ideaAtGate / ideaHasAssetStatus / pendingGateNames
// ---------------------------------------------------------------------------

describe("ideaAtGate — true only when an Asset is in_production AND paused at the named gate", () => {
  it("true when an Asset is paused at the named gate", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "in_production", pending_gate: "cast" }] }, "cast"), true);
  });

  it("false when the Asset is in_production but paused at a DIFFERENT gate", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "in_production", pending_gate: "other" }] }, "cast"), false);
  });

  it("false when the Asset is in_production with no pending_gate (not paused)", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "in_production" }] }, "cast"), false);
  });

  it("false when the Asset has moved past in_production", () => {
    assert.equal(ideaAtGate({ assets: [{ recipe: "r1", status: "produced" }] }, "cast"), false);
  });

  it("false when assets is absent (undefined) — never throws", () => {
    assert.equal(ideaAtGate({}, "cast"), false);
  });
});

describe("ideaHasAssetStatus — true when ANY Asset is at the given stage", () => {
  it("true when one of several Assets matches", () => {
    const idea = {
      assets: [
        { recipe: "r1", status: "in_production" as const, pending_gate: "cast" },
        { recipe: "r2", status: "produced" as const },
      ],
    };
    assert.equal(ideaHasAssetStatus(idea, "produced"), true);
    assert.equal(ideaHasAssetStatus(idea, "posted"), false);
  });

  it("false when assets is absent — never throws", () => {
    assert.equal(ideaHasAssetStatus({}, "produced"), false);
  });
});

describe("pendingGateNames — the set of gate names currently paused across an Idea's Assets", () => {
  it("returns the gate names for every in_production Asset paused at a gate, deduplicated", () => {
    const assets: LedgerAssetRecord[] = [
      { recipe: "r1", status: "in_production", pending_gate: "cast" },
      { recipe: "r2", status: "in_production", pending_gate: "cast" },
      { recipe: "r3", status: "produced" },
    ];
    assert.deepEqual(pendingGateNames(assets), ["cast"]);
  });

  it("returns [] when nothing is paused", () => {
    assert.deepEqual(pendingGateNames([{ recipe: "r1", status: "queued" }]), []);
    assert.deepEqual(pendingGateNames([]), []);
  });
});
