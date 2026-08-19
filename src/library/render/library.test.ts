import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderLibraryBody } from "./library.ts";
import { deriveFilterOptions } from "../filter-sort.ts";
import type { LibraryAssetRow, LibraryFilter } from "../types.ts";

function row(overrides: Partial<LibraryAssetRow> & { readonly assetId: string }): LibraryAssetRow {
  return {
    ideaId: `idea-${overrides.assetId}`,
    ideaTitle: overrides.assetId,
    hookType: "reframe",
    theme: "product_or_tool",
    recipeSlug: "news-carousel",
    recipeName: "News Carousel",
    formatSlug: "unhypped-news",
    formatName: "Unhypped News",
    brandSlug: "straw-motion",
    brandName: "Straw Motion",
    status: "produced",
    hasSpec: true,
    mediaCount: 7,
    posts: [],
    ...overrides,
  };
}

describe("renderLibraryBody", () => {
  it("renders one table row per Asset, with the Idea title, hook type, theme, and a link to the Asset page", () => {
    const rows = [row({ assetId: "a1", ideaTitle: "AI shakeup", hookType: "irony" })];
    const options = deriveFilterOptions(rows);
    const html = renderLibraryBody(rows, options, {}, "performance", rows.length);
    assert.match(html, /AI shakeup/);
    assert.match(html, /irony/);
    assert.match(html, /href="\/assets\/a1"/);
  });

  it("shows a Performance Score as 'not yet tracked', never '0%', when undefined", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /not yet tracked/);
  });

  it("shows a real Performance Score as a percentage", () => {
    const rows = [row({ assetId: "a1", bestPerformanceScore: 0.5 })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /50%/);
  });

  it("renders a friendly empty state when no rows match the filter, without throwing", () => {
    const html = renderLibraryBody([], { hookTypes: [], themes: [], recipes: [], formats: [], statuses: [] }, { hookType: "irony" } as LibraryFilter, "performance", 5);
    assert.match(html, /No Assets match this filter/);
  });

  it("states the filtered-vs-total count when a filter narrows the rows", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), { hookType: "reframe" }, "performance", 5);
    assert.match(html, /1 of 5 Asset/);
  });

  it("never emits a <form method=\"post\">", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.doesNotMatch(html.toLowerCase(), /method="post"/);
    assert.match(html, /method="get"/);
  });

  it("escapes an Idea title containing markup", () => {
    const rows = [row({ assetId: "a1", ideaTitle: `<script>alert(1)</script>` })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.doesNotMatch(html, /<script>alert/);
  });

  it("discloses the Asset-scoped limit plainly, always — a rejected/not-yet-produced Idea never appears, even filtered (AC8, issue #210 QA round 1, defect 3)", () => {
    const populatedRows = [row({ assetId: "a1" })];
    const populatedHtml = renderLibraryBody(populatedRows, deriveFilterOptions(populatedRows), {}, "performance", 1);
    assert.match(populatedHtml, /Asset-scoped/);

    const emptyHtml = renderLibraryBody([], { hookTypes: [], themes: [], recipes: [], formats: [], statuses: [] }, { hookType: "irony" } as LibraryFilter, "performance", 5);
    assert.match(emptyHtml, /Asset-scoped/);
  });

  it("opens the Idea link in a new tab, safely (target=_blank + rel=noopener)", () => {
    const rows = [row({ assetId: "a1", ideaTitle: "AI shakeup" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<a class="idea-title-link" href="\/assets\/a1" target="_blank" rel="noopener" title="AI shakeup">AI shakeup<\/a>/);
  });

  it("offers a status filter select, with the active status pre-selected", () => {
    const rows = [row({ assetId: "a1", status: "posted" }), row({ assetId: "a2", status: "produced" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), { status: "posted" }, "performance", 2);
    assert.match(html, /<select id="status" name="status">/);
    assert.match(html, /<option value="posted" selected>posted<\/option>/);
    assert.match(html, /<option value="produced">produced<\/option>/);
  });

  it("renders in_production's status option with a readable space, not a bare underscore", () => {
    const rows = [row({ assetId: "a1", status: "in_production" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<option value="in_production">in production<\/option>/);
  });

  it("renders the filter form's actions as Material Design buttons, Apply still a real submit control", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<md-filled-button type="submit">Apply<\/md-filled-button>/);
    assert.match(html, /<md-text-button href="\/">Reset<\/md-text-button>/);
  });

  it("wraps the Asset table in a .table-scroll container, so a narrow viewport scrolls the table, not the whole page (Task 4, audit 2026-08-18)", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<div class="table-scroll">\s*<table>/);
  });

  it("humanizes the hookType/theme filter option labels (spaces, not underscores), while keeping the option's value the raw enum (Task 6, audit 2026-08-18)", () => {
    const rows = [row({ assetId: "a1", hookType: "counter_intuitive", theme: "how_to_or_technique" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<option value="counter_intuitive">counter intuitive<\/option>/);
    assert.match(html, /<option value="how_to_or_technique">how to or technique<\/option>/);
  });

  it("humanizes the hookType/theme table badges (spaces, not underscores) (Task 6, audit 2026-08-18)", () => {
    const rows = [row({ assetId: "a1", hookType: "counter_intuitive", theme: "how_to_or_technique" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<span class="badge">counter intuitive<\/span>/);
    assert.match(html, /<span class="badge">how to or technique<\/span>/);
    assert.doesNotMatch(html, /<span class="badge">counter_intuitive<\/span>/);
    assert.doesNotMatch(html, /<span class="badge">how_to_or_technique<\/span>/);
  });

  it("carries a title attribute with the full Idea title, so a long title doesn't force every other column into a sliver (Task 8, audit 2026-08-18)", () => {
    const longTitle = "This is a genuinely very long Idea title that would otherwise force every other column in the row into a sliver of space";
    const rows = [row({ assetId: "a1", ideaTitle: longTitle })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, new RegExp(`<a class="idea-title-link" href="/assets/a1" target="_blank" rel="noopener" title="${longTitle}">${longTitle}</a>`));
  });

  it("gives the Asset table a <caption> and scope=\"col\" on every header cell (Task 12, audit 2026-08-18)", () => {
    const rows = [row({ assetId: "a1" })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /<table>\s*<caption>[^<]+<\/caption>/);
    const thCount = (html.match(/<th[ >]/g) ?? []).length;
    const scopedThCount = (html.match(/<th scope="col">/g) ?? []).length;
    assert.ok(thCount > 0, "expected at least one <th>");
    assert.equal(scopedThCount, thCount, "every <th> must carry scope=\"col\"");
  });

  it("escapes quotes inside the title attribute the same way it escapes the visible text", () => {
    const rows = [row({ assetId: "a1", ideaTitle: `A "quoted" title` })];
    const html = renderLibraryBody(rows, deriveFilterOptions(rows), {}, "performance", 1);
    assert.match(html, /title="A &quot;quoted&quot; title"/);
  });
});
