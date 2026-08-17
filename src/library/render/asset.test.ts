import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderAssetBody } from "./asset.ts";
import type { AssetDetailView } from "../types.ts";

function detail(overrides: Partial<AssetDetailView> = {}): AssetDetailView {
  return {
    assetId: "asset-1",
    recipeSlug: "news-carousel",
    recipeName: "News Carousel",
    status: "produced",
    idea: {
      id: "idea-1",
      title: "AI pricing shakeup",
      brief: "A brief about pricing.",
      hookType: "surprising_number",
      theme: "pricing_or_cost",
      sourceUrls: [],
    },
    formatSlug: "unhypped-news",
    formatName: "Unhypped News",
    brandSlug: "straw-motion",
    brandName: "Straw Motion",
    spec: null,
    media: [],
    copyVariants: [],
    posts: [],
    ...overrides,
  };
}

describe("renderAssetBody — spec, media, copy, posts, and metric history TOGETHER (AC4)", () => {
  it("renders the Idea title, hook type, theme, and the Production Spec as pretty JSON", () => {
    const html = renderAssetBody(detail({ spec: { slides: [{ role: "hook" }] } }));
    assert.match(html, /AI pricing shakeup/);
    assert.match(html, /surprising_number/);
    assert.match(html, /pricing_or_cost/);
    assert.match(html, /&quot;role&quot;: &quot;hook&quot;/);
  });

  it("says 'No Production Spec saved yet' rather than an empty object when spec is null", () => {
    const html = renderAssetBody(detail({ spec: null }));
    assert.match(html, /No Production Spec saved yet/);
  });

  it("renders each media item with an <img>/<video>/<audio> src pointing at /media/:id — never inline bytes", () => {
    const html = renderAssetBody(
      detail({
        media: [
          { id: "m1", ordinal: 0, kind: "image", mime: "image/jpeg", bytes: 100 },
          { id: "m2", ordinal: 1, kind: "video", mime: "video/mp4", bytes: 200 },
        ],
      }),
    );
    assert.match(html, /src="\/media\/m1"/);
    assert.match(html, /src="\/media\/m2"/);
    assert.match(html, /<img/);
    assert.match(html, /<video/);
  });

  it("renders Copy variants with caption and hashtags", () => {
    const html = renderAssetBody(
      detail({ copyVariants: [{ channelPlatform: "facebook", caption: "Here's the story.", hashtags: ["#ai", "#news"] }] }),
    );
    assert.match(html, /Here&#39;s the story\./);
    assert.match(html, /#ai/);
  });

  it("renders Post URLs together with metric and score history on the SAME page (never scattered)", () => {
    const html = renderAssetBody(
      detail({
        posts: [
          {
            channelPlatform: "facebook",
            postUrl: "https://facebook.com/p/1",
            postedAt: "2026-08-14T10:00:00.000Z",
            metricHistory: [{ capturedAt: "2026-08-15T10:00:00.000Z", reactions: 0, comments: 0, shares: 0, views: 0, source: "apify" }],
            scoreHistory: [{ computedAt: "2026-08-15T10:00:00.000Z", score: 0.5 }],
          },
        ],
      }),
    );
    assert.match(html, /facebook\.com\/p\/1/);
    assert.match(html, /50%/);
    assert.match(html, /apify/);
  });

  it("says 'not posted yet' when there are no Posts", () => {
    const html = renderAssetBody(detail({ posts: [] }));
    assert.match(html, /Not posted yet/);
  });

  it("says 'not yet tracked' for a Post logged but never scored, never fabricating 0%", () => {
    const html = renderAssetBody(
      detail({
        posts: [
          {
            channelPlatform: "facebook",
            postUrl: "https://facebook.com/p/1",
            postedAt: "2026-08-14T10:00:00.000Z",
            metricHistory: [],
            scoreHistory: [],
          },
        ],
      }),
    );
    assert.match(html, /Not yet tracked/);
  });
});
