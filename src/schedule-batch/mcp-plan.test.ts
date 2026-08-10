import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildMcpSchedulePlan } from "./mcp-plan.ts";
import type { EligibleAsset } from "./eligibility.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";
import type { ZohoConfigLookup, ZohoSocialBrand } from "../production-spec/brand-profile.ts";
import { deriveScheduleSlots } from "./schedule.ts";
import { formatZohoScheduleTime } from "./timezone.ts";
import { sortEligible } from "./order.ts";

const RUN = "2026-W32";
const START_DATE = "2026-08-11";
const NOW_MS = Date.parse("2026-08-01T00:00:00.000Z"); // safely > 1h before any derived slot below

function asset(recipe = "news-carousel"): LedgerAssetRecord {
  return { recipe, status: "produced" };
}

function eligible(ideaId: string, recipe = "news-carousel"): EligibleAsset {
  return { ideaId, title: `Title for ${ideaId}`, asset: asset(recipe) };
}

const TWO_BRANDS: readonly ZohoSocialBrand[] = [
  {
    name: "Straw Motion",
    timezone: "Europe/Berlin",
    channels: [
      { platform: "facebook", label: "Facebook" },
      { platform: "instagram", label: "Instagram" },
      { platform: "tiktok", label: "TikTok" },
    ],
  },
  {
    name: "Straw Motion Personal",
    timezone: "Europe/Berlin",
    channels: [
      { platform: "linkedin", label: "LinkedInProfile" },
      { platform: "x", label: "X" },
    ],
  },
];

const CONFIGURED: ZohoConfigLookup = { configured: true, brand: "straw-motion", zohoBrands: TWO_BRANDS };

const NOT_CONFIGURED: ZohoConfigLookup = {
  configured: false,
  brand: "straw-motion",
  reason: "not_configured",
  message: 'Brand "straw-motion" has no "zoho" config in its brand-profile.yaml — not configured for Schedule Batch.',
  errors: [],
};

const MALFORMED: ZohoConfigLookup = {
  configured: false,
  brand: "straw-motion",
  reason: "malformed",
  message: 'Brand "straw-motion"\'s "zoho" config in brand-profile.yaml is malformed: bad timezone.',
  errors: ["bad timezone"],
};

describe("buildMcpSchedulePlan — MCP-first routing decision layer (issue #160)", () => {
  it("names each eligible Asset's target Channel groups (per Zoho Social Brand) and its scheduled time", () => {
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.assets.length, 1);
    const scheduled = result.assets[0]!;
    assert.equal(scheduled.ideaId, `idea-${RUN}-01`);
    assert.equal(scheduled.recipe, "news-carousel");
    assert.equal(scheduled.groups.length, 2);

    const main = scheduled.groups.find((g) => g.zohoBrandName === "Straw Motion")!;
    assert.deepEqual(
      main.channels.map((c) => c.platform),
      ["facebook", "instagram", "tiktok"],
    );

    const personal = scheduled.groups.find((g) => g.zohoBrandName === "Straw Motion Personal")!;
    assert.deepEqual(
      personal.channels.map((c) => c.platform),
      ["linkedin"], // x excluded
    );

    const expectedUtcMs = deriveScheduleSlots(START_DATE, 1)[0]!.utcMs;
    assert.equal(scheduled.scheduledAtUtc, new Date(expectedUtcMs).toISOString());
    assert.equal(main.scheduledAtLocal, formatZohoScheduleTime(expectedUtcMs, "Europe/Berlin"));
    assert.equal(personal.scheduledAtLocal, formatZohoScheduleTime(expectedUtcMs, "Europe/Berlin"));
  });

  it("derives the SAME slot, in the SAME idea order, that deriveScheduleSlots + sortEligible produce directly", () => {
    const input = [
      eligible(`idea-${RUN}-03`),
      eligible(`idea-${RUN}-01`),
      eligible(`idea-${RUN}-02`),
    ];
    const result = buildMcpSchedulePlan({
      eligible: input,
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const expectedOrder = sortEligible(input, RUN).map((e) => e.ideaId);
    assert.deepEqual(result.assets.map((a) => a.ideaId), expectedOrder);

    const expectedSlots = deriveScheduleSlots(START_DATE, 3);
    result.assets.forEach((a, i) => {
      assert.equal(a.scheduledAtUtc, new Date(expectedSlots[i]!.utcMs).toISOString());
    });
  });

  it("an X-only Zoho Social Brand grouping contributes no group at all", () => {
    const xOnly: readonly ZohoSocialBrand[] = [
      { name: "X Only", timezone: "Europe/Berlin", channels: [{ platform: "x", label: "X" }] },
    ];
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: { configured: true, brand: "straw-motion", zohoBrands: xOnly },
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.assets[0]!.groups, []);
  });

  it("never surfaces x in a mixed group's channels, regardless of Brand configuration", () => {
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const group of result.assets[0]!.groups) {
      assert.ok(!group.channels.some((c) => c.platform === "x"));
    }
  });

  it("excludes a non-news-carousel entry from the plan, defensively, never scheduling it", () => {
    const result = buildMcpSchedulePlan({
      eligible: [
        eligible(`idea-${RUN}-01`, "news-carousel"),
        eligible(`idea-${RUN}-02`, "character-explainer-with-cast"),
      ],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0]!.ideaId, `idea-${RUN}-01`);
  });

  it("refuses an empty run clearly, never throwing", () => {
    const result = buildMcpSchedulePlan({
      eligible: [],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "empty-run");
    assert.match(result.message, /no eligible/i);
  });

  it("refuses an effectively-empty run (only non-news-carousel entries) as empty-run too", () => {
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`, "character-explainer-with-cast")],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "empty-run");
  });

  it("refuses a Brand with no usable Zoho configuration (not_configured), carrying that message verbatim", () => {
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: NOT_CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "zoho-not-configured");
    assert.equal(result.message, NOT_CONFIGURED.message);
  });

  it("refuses a Brand with a malformed Zoho configuration, carrying that message verbatim", () => {
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: MALFORMED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "zoho-not-configured");
    assert.equal(result.message, MALFORMED.message);
  });

  it("refuses a slot inside the 1-hour lead window, naming the violating Idea, never throwing", () => {
    // Derive the actual slot first, then set "now" to 30 minutes before it.
    const { utcMs } = deriveScheduleSlots(START_DATE, 1)[0]!;
    const tooCloseNowMs = utcMs - 30 * 60 * 1000;
    const result = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: tooCloseNowMs,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "lead-window");
    assert.match(result.message, new RegExp(`idea-${RUN}-01`));
  });

  it("never reads the system clock — nowMs is always the caller's explicit argument", () => {
    const a = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    const b = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    assert.deepEqual(a, b);
  });

  it("honors postsPerDay from the shared derivation (issue #171) — several Assets scheduled to the SAME calendar day", () => {
    const input = [
      eligible(`idea-${RUN}-01`),
      eligible(`idea-${RUN}-02`),
      eligible(`idea-${RUN}-03`),
    ];
    const result = buildMcpSchedulePlan({
      eligible: input,
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
      postsPerDay: 6,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const expectedSlots = deriveScheduleSlots(START_DATE, 3, 6);
    result.assets.forEach((a, i) => {
      assert.equal(a.scheduledAtUtc, new Date(expectedSlots[i]!.utcMs).toISOString());
    });
    // All 3 land on the SAME calendar day (well under postsPerDay=6) — this is exactly what
    // distinguishes it from the default (1/day) behavior, which would spread them over 3 days.
    const distinctDays = new Set(result.assets.map((a) => a.scheduledAtUtc.slice(0, 10)));
    assert.equal(distinctDays.size, 1);
  });

  it("omitting postsPerDay defaults to 1 — byte-identical to the pre-#171 behavior", () => {
    const withDefault = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`), eligible(`idea-${RUN}-02`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    });
    const withExplicitOne = buildMcpSchedulePlan({
      eligible: [eligible(`idea-${RUN}-01`), eligible(`idea-${RUN}-02`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
      postsPerDay: 1,
    });
    assert.deepEqual(withDefault, withExplicitOne);
  });

  it("is pure — calling it twice with the same inputs returns deep-equal output", () => {
    const input = {
      eligible: [eligible(`idea-${RUN}-01`), eligible(`idea-${RUN}-02`)],
      run: RUN,
      zohoConfig: CONFIGURED,
      startDate: START_DATE,
      nowMs: NOW_MS,
    };
    assert.deepEqual(buildMcpSchedulePlan(input), buildMcpSchedulePlan(input));
  });
});
