import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { escapeHtml, formatScore, formatDate, page } from "./html.ts";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    assert.equal(escapeHtml(`<script>alert("x") & 'y'</script>`), "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;");
  });

  it("leaves plain text untouched", () => {
    assert.equal(escapeHtml("Plain title, no markup"), "Plain title, no markup");
  });
});

describe("formatScore — never fabricates a missing score as 0", () => {
  it("formats a 0-1 score as a rounded percentage", () => {
    assert.equal(formatScore(0.5), "50%");
    assert.equal(formatScore(0.999), "100%");
    assert.equal(formatScore(0), "0%");
  });

  it("says 'not yet tracked' for undefined, never '0%'", () => {
    assert.equal(formatScore(undefined), "not yet tracked");
  });
});

describe("formatDate", () => {
  it("formats an ISO timestamp readably", () => {
    assert.equal(formatDate("2026-08-14T10:00:00.000Z"), "2026-08-14 10:00 UTC");
  });

  it("returns '—' for undefined", () => {
    assert.equal(formatDate(undefined), "—");
  });

  it("falls back to the raw string for a malformed date, never throws", () => {
    assert.equal(formatDate("not-a-date"), "not-a-date");
  });
});

describe("page — the shared page shell", () => {
  it("includes the title, the given body, and the nav links, and never a <form method=\"post\">", () => {
    const html = page("My Title", "<p>hello</p>");
    assert.match(html, /My Title/);
    assert.match(html, /<p>hello<\/p>/);
    assert.match(html, /Library/);
    assert.match(html, /Run &amp; Queue|Run & Queue/);
    assert.doesNotMatch(html.toLowerCase(), /method="post"/);
    assert.doesNotMatch(html.toLowerCase(), /method='post'/);
  });

  it("escapes the title", () => {
    const html = page("<img src=x onerror=alert(1)>", "");
    assert.doesNotMatch(html, /<img src=x/);
  });

  it("ships an import map for the Material Design 3 components, before the module script that uses it", () => {
    const html = page("My Title", "");
    const importMapIndex = html.indexOf('<script type="importmap">');
    const moduleScriptIndex = html.indexOf('<script type="module">');
    assert.ok(importMapIndex !== -1, "expected an importmap script");
    assert.ok(moduleScriptIndex !== -1, "expected a module script");
    assert.ok(importMapIndex < moduleScriptIndex, "the importmap must appear before the module script that relies on it");

    const importMapJson = html.slice(importMapIndex, html.indexOf("</script>", importMapIndex));
    assert.match(importMapJson, /"lit\/":"\/vendor\/lit\//);
    assert.match(importMapJson, /"@material\/web\/":"\/vendor\/@material\/web\//);
  });

  it("loads the two Material Design button components every page needs", () => {
    const html = page("My Title", "");
    assert.match(html, /\/vendor\/@material\/web\/button\/filled-button\.js/);
    assert.match(html, /\/vendor\/@material\/web\/button\/text-button\.js/);
  });

  it("ships a .table-scroll rule so a wide table can scroll on its own, not the whole page (Task 4, audit 2026-08-18)", () => {
    const html = page("My Title", "");
    assert.match(html, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("defines a real MD3 color-token palette on :root, that the MD3 buttons pick up automatically (Task 5, audit 2026-08-18)", () => {
    const html = page("My Title", "");
    assert.match(html, /:root\s*\{[\s\S]*--md-sys-color-primary:\s*#[0-9a-fA-F]{6}[\s\S]*\}/);
    assert.match(html, /--md-sys-color-on-primary:\s*#[0-9a-fA-F]{6}/);
    assert.match(html, /--md-sys-color-secondary-container:\s*#[0-9a-fA-F]{6}/);
    assert.match(html, /--md-sys-color-error-container:\s*#[0-9a-fA-F]{6}/);
    assert.match(html, /--md-sys-color-on-error-container:\s*#[0-9a-fA-F]{6}/);
  });

  it("redefines .badge and .bucket-* to draw from the MD3 color tokens, in proper container/on-container pairs, instead of standalone hex (Task 5, audit 2026-08-18)", () => {
    const html = page("My Title", "");
    assert.match(html, /\.badge\s*\{[^}]*var\(--md-sys-color-[^)]+\)[^}]*var\(--md-sys-color-[^)]+\)[^}]*\}/);
    assert.match(html, /\.bucket-produced\s*\{[^}]*var\(--md-sys-color-tertiary-container\)[^}]*var\(--md-sys-color-on-tertiary-container\)[^}]*\}/);
    assert.match(html, /\.bucket-failed\s*\{[^}]*var\(--md-sys-color-error-container\)[^}]*var\(--md-sys-color-on-error-container\)[^}]*\}/);
    assert.doesNotMatch(html, /\.badge\s*\{[^}]*#eee/);
    assert.doesNotMatch(html, /\.bucket-produced\s*\{[^}]*#d4f4dd/);
  });

  it("marks the current page's nav link active (aria-current + .active class), leaving the others unmarked (Task 7, audit 2026-08-18)", () => {
    const html = page("Run & Queue", "", "/queue");
    assert.match(html, /<a href="\/queue" class="active" aria-current="page">Run &amp; Queue<\/a>/);
    assert.doesNotMatch(html, /<a href="\/"[^>]*class="active"/);
    assert.doesNotMatch(html, /<a href="\/chart"[^>]*aria-current/);
    assert.doesNotMatch(html, /<a href="\/top"[^>]*aria-current/);
    // exactly one nav link marked active
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  });

  it("marks no nav link active when activePath is omitted, so every existing two-argument call site keeps compiling unchanged (Task 7, audit 2026-08-18)", () => {
    const html = page("My Title", "");
    assert.doesNotMatch(html, /aria-current="page"/);
    assert.doesNotMatch(html, /class="active"/);
  });

  it("leaves every nav link unmarked when activePath matches no nav link, e.g. an Asset detail page (Task 7, audit 2026-08-18)", () => {
    const html = page("Some Asset Title", "", "/assets/abc-123");
    assert.doesNotMatch(html, /aria-current="page"/);
    assert.doesNotMatch(html, /class="active"/);
  });

  it("caps the Idea-title link's width with an ellipsis, so one long title can't force every other column into a sliver (Task 8, audit 2026-08-18)", () => {
    const html = page("My Title", "");
    assert.match(html, /\.idea-title-link\s*\{[^}]*max-width:[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*\}/);
  });
});
