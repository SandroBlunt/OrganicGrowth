/**
 * Shared HTML rendering primitives for the local read-only Library (issue #210) — pure, no database, no
 * socket, no `node:fs`. Every `render/*.ts` module in this directory builds on `escapeHtml`/`page` so
 * one escaping discipline and one page shell (nav, minimal styling) is shared everywhere, rather than
 * five independent, slightly-different implementations.
 */

/** Escapes the five HTML-significant characters. Applied to EVERY piece of stored data this Library
 *  renders (an Idea title, a caption, a Brief) before it reaches a template string — none of this data
 *  is trusted, since it ultimately comes from an Operator-edited Brief or a scraped Trend. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formats a 0–1 score as a percentage string, or the literal `"not yet tracked"` for `undefined` —
 *  the one place this codebase decides how to WORD a missing score, so every render module says the
 *  same honest thing rather than five different guesses at "empty". */
export function formatScore(score: number | undefined): string {
  return score === undefined ? "not yet tracked" : `${Math.round(score * 100)}%`;
}

/** Formats an ISO timestamp for display, or `"—"` for `undefined`. Never throws on a malformed
 *  timestamp — falls back to the raw string rather than crashing the whole page over one bad date
 *  (data-handling rule 4: never let one malformed record crash a Run). */
export function formatDate(iso: string | undefined): string {
  if (iso === undefined) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const NAV_LINKS: readonly { readonly href: string; readonly label: string }[] = [
  { href: "/", label: "Library" },
  { href: "/queue", label: "Run & Queue" },
  { href: "/chart", label: "Fit vs Performance" },
  { href: "/top", label: "Top 5" },
];

/** Wraps `bodyHtml` in the shared page shell: a `<!doctype html>` document, one `<title>`, one shared
 *  nav bar, and minimal inline CSS (this repo's one runtime dependency is `yaml` — a CSS/JS bundler is
 *  not proportionate to a local, single-Operator, read-only viewer). */
export function page(title: string, bodyHtml: string): string {
  const nav = NAV_LINKS.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join(" &middot; ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — OrganicGrowth Library</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0; color: #1a1a1a; background: #fafafa; }
  header { background: #1a1a1a; color: #fff; padding: 12px 20px; }
  header a { color: #fff; text-decoration: none; margin-right: 4px; }
  header a:hover { text-decoration: underline; }
  main { padding: 20px; max-width: 1200px; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; background: #fff; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 14px; vertical-align: top; }
  th { background: #f0f0f0; }
  h1, h2, h3 { margin-top: 1.4em; }
  form.filters { margin: 10px 0; display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
  form.filters label { display: block; font-size: 12px; color: #555; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; background: #eee; }
  .bucket-produced { background: #d4f4dd; }
  .bucket-parked { background: #fff3cd; }
  .bucket-failed { background: #f8d7da; }
  .bucket-running, .bucket-queued, .bucket-done { background: #e2e3e5; }
  pre { background: #f5f5f5; padding: 10px; overflow-x: auto; font-size: 12px; }
  .spec-grid { display: flex; gap: 12px; overflow-x: auto; }
  .spec-col { flex: 0 0 320px; border: 1px solid #ddd; background: #fff; padding: 10px; }
  .muted { color: #777; }
  .read-only-banner { background: #eef; padding: 6px 20px; font-size: 12px; color: #334; }
</style>
</head>
<body>
<header>${nav}</header>
<div class="read-only-banner">Read-only viewer — no write path exists here. Review, gates, and Publish happen in chat.</div>
<main>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</main>
</body>
</html>
`;
}
