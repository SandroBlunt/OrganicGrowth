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
});
