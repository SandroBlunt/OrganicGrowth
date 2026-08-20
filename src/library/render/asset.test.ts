import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderAssetBody, renderBriefHtml } from "./asset.ts";
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
  it("renders hook type, theme, and the Production Spec as pretty JSON (the Idea title itself is page()'s own <h1>, not repeated in the body — Task 2, audit 2026-08-18)", () => {
    const html = renderAssetBody(detail({ spec: { slides: [{ role: "hook" }] } }));
    assert.match(html, /surprising_number/);
    assert.match(html, /pricing_or_cost/);
    assert.match(html, /&quot;role&quot;: &quot;hook&quot;/);
  });

  it("does not repeat the Idea title as a second heading — page() already renders it as the <h1>, so the body itself must not contain the title text at all (Task 2, audit 2026-08-18)", () => {
    const html = renderAssetBody(detail({ idea: { ...detail().idea, title: "AI pricing shakeup" } }));
    assert.doesNotMatch(html, /<h2>AI pricing shakeup<\/h2>/);
    assert.equal((html.match(/AI pricing shakeup/g) ?? []).length, 0, "the body-only render must not repeat the <h1> title (server.test.ts covers the full page's single occurrence)");
  });

  it("says 'No Production Spec saved yet' rather than an empty object when spec is null", () => {
    const html = renderAssetBody(detail({ spec: null }));
    assert.match(html, /No Production Spec saved yet/);
  });

  it("collapses the Production Spec's raw JSON behind a closed-by-default <details> disclosure (Task 9, audit 2026-08-18)", () => {
    const html = renderAssetBody(detail({ spec: { slides: [{ role: "hook" }] } }));
    assert.match(html, /<details><summary>Production Spec \(raw JSON\)<\/summary><pre>/);
    assert.doesNotMatch(html, /<details open>/);
    assert.doesNotMatch(html, /<details[^>]* open[^>]*>/);
    // Nothing dropped — the full JSON is still present, just collapsed.
    assert.match(html, /&quot;role&quot;: &quot;hook&quot;/);
    assert.match(html, /<\/pre><\/details>/);
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

  it("wraps each Post entry in the same .spec-col card treatment Media and Copy variants already use (Task 10, audit 2026-08-18)", () => {
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
          {
            channelPlatform: "linkedin",
            postUrl: "https://linkedin.com/p/2",
            postedAt: "2026-08-15T10:00:00.000Z",
            metricHistory: [],
            scoreHistory: [],
          },
        ],
      }),
    );
    assert.equal((html.match(/<div class="spec-col">/g) ?? []).length, 2);
    assert.match(html, /<div class="spec-col">\s*<p><strong>facebook<\/strong>/);
  });

  it("gives the Metric history and Performance Score history tables a <caption> and scope=\"col\" on every header cell (Task 12, audit 2026-08-18)", () => {
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
    const tableCount = (html.match(/<table>/g) ?? []).length;
    assert.equal(tableCount, 2, "one table for metric history, one for score history");
    const captionCount = (html.match(/<caption>[^<]+<\/caption>/g) ?? []).length;
    assert.equal(captionCount, 2, "every table must have its own caption");
    const thCount = (html.match(/<th[ >]/g) ?? []).length;
    const scopedThCount = (html.match(/<th scope="col">/g) ?? []).length;
    assert.ok(thCount > 0, "expected at least one <th>");
    assert.equal(scopedThCount, thCount, "every <th> must carry scope=\"col\"");
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

  it("gives the Idea Brief real paragraph/list HTML structure, via renderAssetBody, instead of one flattened <p> (Task 3, audit 2026-08-18)", () => {
    const html = renderAssetBody(
      detail({ idea: { ...detail().idea, brief: "para one\n\n## Angle\npara two\n\n- item one\n- item two" } }),
    );
    assert.match(html, /<p>para one<\/p>/);
    assert.match(html, /<h4>Angle<\/h4>/);
    assert.match(html, /<p>para two<\/p>/);
    assert.match(html, /<ul><li>item one<\/li><li>item two<\/li><\/ul>/);
    // Never one <p> holding the whole flattened string.
    assert.doesNotMatch(html, /<p>para one\s*\n\s*## Angle/);
  });
});

describe("renderBriefHtml — the Brief/production-notes splitter (Task 3, audit 2026-08-18)", () => {
  it("turns a blank-line-separated fixture into distinct <p>/<h4>/<li> elements, exactly the audit's own acceptance-criteria example", () => {
    const html = renderBriefHtml("para one\n\n## Angle\npara two\n\n- item one\n- item two");
    assert.match(html, /<p>para one<\/p>/);
    assert.match(html, /<h4>Angle<\/h4>/);
    assert.match(html, /<p>para two<\/p>/);
    assert.match(html, /<ul><li>item one<\/li><li>item two<\/li><\/ul>/);
  });

  it("joins a wrapped multi-line paragraph into one clean <p>, not one <p> per raw line", () => {
    const html = renderBriefHtml("line one of the same paragraph\nline two of the same paragraph");
    assert.match(html, /<p>line one of the same paragraph line two of the same paragraph<\/p>/);
    assert.equal((html.match(/<p>/g) ?? []).length, 1);
  });

  it("appends a bullet's wrapped continuation line to that item, rather than starting a new paragraph — real Briefs wrap long bullets this way", () => {
    const html = renderBriefHtml("- Qwen3.8-Max scored 53.4 against GPT-5.6's 45.4 on JobBench, a\n  benchmark aimed at agentic tasks.");
    assert.match(html, /<li>Qwen3\.8-Max scored 53\.4 against GPT-5\.6&#39;s 45\.4 on JobBench, a benchmark aimed at agentic tasks\.<\/li>/);
    assert.equal((html.match(/<li>/g) ?? []).length, 1);
  });

  it("escapes markup inside every leaf block — heading, paragraph, and list item", () => {
    const html = renderBriefHtml("## <script>bad</script>\n\n<img onerror=alert(1)>\n\n- <b>bold</b> item");
    assert.doesNotMatch(html, /<script>bad<\/script>/);
    assert.doesNotMatch(html, /<img onerror/);
    assert.doesNotMatch(html, /<b>bold<\/b>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("drops nothing from a real, longer, multi-section Brief — every distinct piece of source text is still present, just restructured", () => {
    const brief = [
      '# idea-04 — "53.4 to 45.4: the free model is ahead"',
      "",
      "- **Brand:** straw-motion",
      "- **Run:** 2026-W32",
      "",
      "## Angle",
      "Skip the usual US-versus-China framing and look at what the benchmark measures. Alibaba's",
      "open-weights Qwen3.8-Max scored 53.4 to GPT-5.6's 45.4 on JobBench.",
      "",
      "## Talking points",
      "- Qwen3.8-Max, from Alibaba, is open-weights and scored 53.4 against GPT-5.6's 45.4 on",
      "  JobBench, a benchmark aimed at agentic tasks rather than conversation.",
      "- Open weights means downloadable: no per-token bill, no vendor lock-in.",
    ].join("\n");
    const html = renderBriefHtml(brief);
    for (const fragment of [
      "idea-04",
      "Brand:",
      "straw-motion",
      "Run:",
      "2026-W32",
      "Angle",
      "benchmark measures",
      "Qwen3.8-Max scored 53.4",
      "Talking points",
      "agentic tasks",
      "vendor lock-in",
    ]) {
      assert.ok(html.includes(fragment) || html.includes(fragment.replace(/'/g, "&#39;")), `expected the rendered HTML to still contain: ${fragment}`);
    }
    assert.ok(!html.includes("<p>#"), "the leading heading line must not end up flattened into a plain paragraph");
  });
});
