import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateAssetsForExport, buildSchedulePlan, findCopyVariant } from "./plan.ts";
import type { EligibleAsset } from "./eligibility.ts";
import type { ZohoSocialBrand } from "../production-spec/brand-profile.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";
import type { Copy } from "../copy/contract.ts";
import { CAROUSEL_SLIDE_COUNT } from "../production-spec/news-carousel-contract.ts";

const SEVEN_PATHS = Array.from({ length: CAROUSEL_SLIDE_COUNT }, (_, i) => `/x/${i}-slide.png`);

const DEFAULT_COPY: Copy = {
  caption: "primary caption",
  hashtags: ["#tag"],
  variants: [
    { platform: "facebook", caption: "Facebook body.", hashtags: ["#AInews"] },
    { platform: "instagram", caption: "Instagram body.", hashtags: ["#AInews"] },
    { platform: "tiktok", caption: "TikTok body.", hashtags: ["#AInews"] },
    {
      platform: "linkedin",
      caption: "LinkedIn body.",
      hashtags: ["#AInews"],
      unresolvedMentions: ["OpenAI", "Anthropic"],
    },
    { platform: "x", caption: "X body.", hashtags: ["#AInews"] },
  ],
};

/** Test helper. `copy: null` means "no composed Copy at all" (an explicit sentinel — `undefined`
 *  can't be assigned to an optional field under `exactOptionalPropertyTypes`, so the key is omitted
 *  entirely instead when this is requested). */
function makeAsset(overrides: { readonly copy?: Copy | null; readonly asset_paths?: readonly string[] } = {}): LedgerAssetRecord {
  const base: LedgerAssetRecord = {
    recipe: "news-carousel",
    status: "produced",
    asset_paths: overrides.asset_paths ?? SEVEN_PATHS,
    copy: DEFAULT_COPY,
  };
  if (overrides.copy === null) {
    const { copy: _drop, ...withoutCopy } = base;
    return withoutCopy;
  }
  return overrides.copy !== undefined ? { ...base, copy: overrides.copy } : base;
}

const ZOHO_BRANDS: readonly ZohoSocialBrand[] = [
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

describe("findCopyVariant", () => {
  it("finds a variant by platform", () => {
    const asset = makeAsset();
    const v = findCopyVariant(asset.copy!, "facebook");
    assert.equal(v?.caption, "Facebook body.");
  });

  it("returns null when the platform has no variant", () => {
    const asset = makeAsset();
    assert.equal(findCopyVariant(asset.copy!, "youtube"), null);
  });

  it("returns null when copy has no variants at all", () => {
    assert.equal(findCopyVariant({ caption: "x", hashtags: [] }, "facebook"), null);
  });
});

describe("validateAssetsForExport — preflight, never fabricates (issue #145)", () => {
  it("returns no problems for a fully well-formed eligible Asset", () => {
    const eligible: EligibleAsset[] = [{ ideaId: "idea-01", title: "T", asset: makeAsset() }];
    assert.deepEqual(validateAssetsForExport(eligible, ZOHO_BRANDS), []);
  });

  it("flags an Asset with no composed Copy at all, naming the Idea", () => {
    const eligible: EligibleAsset[] = [
      { ideaId: "idea-01", title: "T", asset: makeAsset({ copy: null }) },
    ];
    const problems = validateAssetsForExport(eligible, ZOHO_BRANDS);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!.message, /idea-01/);
    assert.match(problems[0]!.message, /no composed Copy/);
  });

  it("flags a missing platform Copy variant, naming both the Idea and the platform", () => {
    const asset = makeAsset({
      copy: { caption: "x", hashtags: [], variants: [{ platform: "facebook", caption: "f", hashtags: [] }] },
    });
    const eligible: EligibleAsset[] = [{ ideaId: "idea-02", title: "T", asset }];
    const problems = validateAssetsForExport(eligible, ZOHO_BRANDS);
    const messages = problems.map((p) => p.message);
    assert.ok(messages.some((m) => m.includes("idea-02") && m.includes('"instagram"')));
    assert.ok(messages.some((m) => m.includes('"linkedin"')));
    assert.ok(messages.some((m) => m.includes('"x"')));
  });

  it("flags an Asset that doesn't have exactly 7 downloaded slides", () => {
    const asset = makeAsset({ asset_paths: SEVEN_PATHS.slice(0, 3) });
    const eligible: EligibleAsset[] = [{ ideaId: "idea-03", title: "T", asset }];
    const problems = validateAssetsForExport(eligible, ZOHO_BRANDS);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!.message, /idea-03/);
    assert.match(problems[0]!.message, /7/);
  });

  it("collects EVERY problem across every Asset, never stopping at the first", () => {
    const eligible: EligibleAsset[] = [
      { ideaId: "idea-01", title: "T", asset: makeAsset({ copy: null }) },
      { ideaId: "idea-02", title: "T", asset: makeAsset({ asset_paths: [] }) },
    ];
    const problems = validateAssetsForExport(eligible, ZOHO_BRANDS);
    assert.ok(problems.some((p) => p.ideaId === "idea-01"));
    assert.ok(problems.some((p) => p.ideaId === "idea-02"));
  });

  it("flags an X variant over the combined caption+hashtags 280-char cap, naming the Idea (issue #146 defense in depth)", () => {
    const overCapCopy: Copy = {
      ...DEFAULT_COPY,
      variants: DEFAULT_COPY.variants!.map((v) =>
        v.platform === "x" ? { ...v, caption: "A".repeat(290) } : v,
      ),
    };
    const eligible: EligibleAsset[] = [
      { ideaId: "idea-04", title: "T", asset: makeAsset({ copy: overCapCopy }) },
    ];
    const problems = validateAssetsForExport(eligible, ZOHO_BRANDS);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!.message, /idea-04/);
    assert.match(problems[0]!.message, /280/);
    assert.match(problems[0]!.message, /x/);
  });
});

describe("buildSchedulePlan — pure assembly of CSVs + manifest + summary + ledger stamps (issue #145)", () => {
  const eligible: EligibleAsset[] = [{ ideaId: "idea-2026-W32-01", title: "AI got cheaper", asset: makeAsset() }];
  const slots = [{ utcMs: Date.UTC(2026, 7, 4, 14, 23, 0) }]; // 16:23 Europe/Berlin (CEST +2)
  const hostedMedia = [
    {
      keys: SEVEN_PATHS.map((_, i) => `straw-motion/2026-W32/idea-01/${i}-slide.jpg`),
      urls: SEVEN_PATHS.map((_, i) => `https://cdn.example/straw-motion/2026-W32/idea-01/${i}-slide.jpg`),
    },
  ];

  function plan() {
    return buildSchedulePlan({
      brand: "straw-motion",
      format: "unhypped-news",
      run: "2026-W32",
      zohoBrands: ZOHO_BRANDS,
      eligible,
      slots,
      hostedMedia,
      createdAt: "2026-08-04T11:07:47.394Z",
    });
  }

  it("produces one CSV file per Zoho Social Brand, named by zohoCsvFileName", () => {
    const { csvFiles } = plan();
    assert.deepEqual(csvFiles.map((f) => f.fileName), ["zoho-main.csv", "zoho-linkedin-x.csv"]);
  });

  it("writes carousel-capable platforms with all 7 slide URLs, X with only the first 4", () => {
    const { csvFiles } = plan();
    const main = csvFiles[0]!.content;
    const linkedinX = csvFiles[1]!.content;
    assert.ok(main.includes("6-slide.jpg")); // Facebook/Instagram/TikTok rows carry slide index 6
    const xRow = linkedinX.split("\n").find((l) => l.includes('"X"'))!;
    assert.ok(!xRow.includes("4-slide.jpg"));
    assert.ok(xRow.includes("3-slide.jpg"));
  });

  it("writes the schedule time in EACH file's own Zoho Social Brand clock", () => {
    const { csvFiles } = plan();
    assert.ok(csvFiles[0]!.content.startsWith("08/04/2026 16:23,"));
    assert.ok(csvFiles[1]!.content.startsWith("08/04/2026 16:23,"));
  });

  it("never puts the LinkedIn unresolved-mentions note inside the exported caption", () => {
    const { csvFiles } = plan();
    const linkedinRow = csvFiles[1]!.content.split("\n").find((l) => l.includes("LinkedInProfile"))!;
    assert.ok(!linkedinRow.includes("Unresolved"));
    assert.ok(linkedinRow.includes("LinkedIn body."));
  });

  it("surfaces the stripped LinkedIn note in the manifest and the summary instead", () => {
    const { manifest, summary } = plan();
    assert.equal(manifest.stripped_notes.length, 1);
    assert.match(manifest.stripped_notes[0]!, /Unresolved linkedin mentions/);
    assert.match(manifest.ideas[0]!.stripped_notes[0]!, /OpenAI, Anthropic/);
    assert.match(summary, /Unresolved linkedin mentions/);
  });

  it("records this Asset's rows grouping in the manifest, keyed by CSV filename", () => {
    const { manifest } = plan();
    assert.deepEqual(manifest.ideas[0]!.rows["zoho-main.csv"], ["Facebook", "Instagram", "TikTok"]);
    assert.deepEqual(manifest.ideas[0]!.rows["zoho-linkedin-x.csv"], ["LinkedInProfile", "X"]);
  });

  it("records the manifest's s3_keys/urls in slide order, matching the hosted media given", () => {
    const { manifest } = plan();
    assert.deepEqual(manifest.ideas[0]!.s3_keys, hostedMedia[0]!.keys);
    assert.deepEqual(manifest.ideas[0]!.urls, hostedMedia[0]!.urls);
  });

  it("returns exactly one ledger stamp per eligible Asset, with an ISO-8601 scheduledAt", () => {
    const { ledgerStamps } = plan();
    assert.equal(ledgerStamps.length, 1);
    assert.equal(ledgerStamps[0]!.ideaId, "idea-2026-W32-01");
    assert.equal(ledgerStamps[0]!.recipe, "news-carousel");
    assert.equal(ledgerStamps[0]!.scheduledAt, "2026-08-04T14:23:00.000Z");
  });

  it("is pure — calling it twice with the same inputs returns deep-equal output", () => {
    const a = plan();
    const b = plan();
    assert.deepEqual(a, b);
  });
});
