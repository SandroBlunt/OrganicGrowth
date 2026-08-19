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

/**
 * The Material Design 3 page chrome's own module loading — an import map (so the `lit`/`@material/web`
 * family's bare `import` specifiers resolve against `/vendor/...`, `server.ts`'s static route into
 * `node_modules`) followed by the one module script that actually registers the custom elements this
 * shell uses. No bundler: every path here is a real file under `node_modules`, served byte-for-byte
 * (`vendor-assets.ts`) — the import map is what lets a browser resolve `lit`'s own bare imports (e.g.
 * `import {html} from 'lit'`) without one. The trailing-slash entries are prefix mappings (part of the
 * import-map spec, not this codebase's own invention): one entry covers every subpath a package exports
 * (`lit/decorators.js`, `@lit/reactive-element/decorators/property.js`, etc.) rather than enumerating
 * each file by hand.
 */
export const MATERIAL_WEB_IMPORT_MAP: Readonly<Record<string, string>> = {
  "@material/web/": "/vendor/@material/web/",
  "lit": "/vendor/lit/index.js",
  "lit/": "/vendor/lit/",
  "lit-html": "/vendor/lit-html/lit-html.js",
  "lit-html/": "/vendor/lit-html/",
  "lit-element": "/vendor/lit-element/lit-element.js",
  "lit-element/": "/vendor/lit-element/",
  "@lit/reactive-element": "/vendor/@lit/reactive-element/reactive-element.js",
  "@lit/reactive-element/": "/vendor/@lit/reactive-element/",
  "@lit/context": "/vendor/@lit/context/index.js",
  "@lit/context/": "/vendor/@lit/context/",
  "@lit-labs/ssr-dom-shim": "/vendor/@lit-labs/ssr-dom-shim/index.js",
  "tslib": "/vendor/tslib/tslib.es6.js",
};

/** Every `@material/web` component module this shell (or the admin module, which duplicates this list
 *  in its own page shell) actually registers. Deliberately individual imports, never a barrel import
 *  (`material-3` skill's own anti-pattern list) — each line is one real, used component. */
export const MATERIAL_WEB_COMPONENT_MODULES: readonly string[] = [
  "/vendor/@material/web/button/filled-button.js",
  "/vendor/@material/web/button/outlined-button.js",
  "/vendor/@material/web/button/text-button.js",
  "/vendor/@material/web/checkbox/checkbox.js",
  "/vendor/@material/web/chips/chip-set.js",
  "/vendor/@material/web/chips/assist-chip.js",
  "/vendor/@material/web/divider/divider.js",
  "/vendor/@material/web/elevation/elevation.js",
  "/vendor/@material/web/list/list.js",
  "/vendor/@material/web/list/list-item.js",
  "/vendor/@material/web/textfield/outlined-text-field.js",
];

const MATERIAL_WEB_SCRIPTS = `<script type="importmap">${JSON.stringify({ imports: MATERIAL_WEB_IMPORT_MAP })}</script>
<script type="module">
${MATERIAL_WEB_COMPONENT_MODULES.map((m) => `  import "${m}";`).join("\n")}
</script>`;

/** The full MD3 token system (color, typography, shape, spacing) as a `<style>` block — shared verbatim
 *  by the read-only viewer's `page()` below AND the admin module's own page shell
 *  (`src/library/admin/render.ts`), which cannot literally share `page()` (different server/port,
 *  relative nav would break) but must look like the same product. Every value here is the OFFICIAL MD3
 *  baseline scheme (Material Theme Builder's `#6750A4` seed, and the documented baseline type scale) —
 *  the `material-3` skill's own reference tables — never an invented hex value or a guessed font size. */
export const MD3_DESIGN_SYSTEM_CSS = `
  /* ---- Color (MD3 baseline scheme, light + dark) ------------------------------------------------ */
  :root {
    --md-sys-color-primary: #6750A4;
    --md-sys-color-on-primary: #FFFFFF;
    --md-sys-color-primary-container: #EADDFF;
    --md-sys-color-on-primary-container: #21005D;
    --md-sys-color-secondary: #625B71;
    --md-sys-color-on-secondary: #FFFFFF;
    --md-sys-color-secondary-container: #E8DEF8;
    --md-sys-color-on-secondary-container: #1D192B;
    --md-sys-color-tertiary: #7D5260;
    --md-sys-color-on-tertiary: #FFFFFF;
    --md-sys-color-tertiary-container: #FFD8E4;
    --md-sys-color-on-tertiary-container: #31111D;
    --md-sys-color-error: #B3261E;
    --md-sys-color-on-error: #FFFFFF;
    --md-sys-color-error-container: #F9DEDC;
    --md-sys-color-on-error-container: #410E0B;
    --md-sys-color-surface: #FEF7FF;
    --md-sys-color-on-surface: #1D1B20;
    --md-sys-color-on-surface-variant: #49454F;
    --md-sys-color-surface-container-lowest: #FFFFFF;
    --md-sys-color-surface-container-low: #F7F2FA;
    --md-sys-color-surface-container: #F3EDF7;
    --md-sys-color-surface-container-high: #ECE6F0;
    --md-sys-color-surface-container-highest: #E6E0E9;
    --md-sys-color-surface-dim: #DED8E1;
    --md-sys-color-surface-bright: #FEF7FF;
    --md-sys-color-outline: #79747E;
    --md-sys-color-outline-variant: #CAC4D0;
    --md-sys-color-inverse-surface: #322F35;
    --md-sys-color-inverse-on-surface: #F5EFF7;
    --md-sys-color-inverse-primary: #D0BCFF;

    /* ---- Typography (MD3 baseline type scale) -------------------------------------------------- */
    /* Roboto is MD3's correct web typeface (material-3 skill: "Roboto/Roboto Flex IS the correct
     * default"); this viewer has no font-vendoring route (only JS modules are served off
     * node_modules — see vendor-assets.ts's own allow-list) and is a fully offline, local-only tool
     * (no CDN calls anywhere else in it), so this stack falls back to the closest local system font
     * rather than reaching out to Google Fonts — a deliberate, stated trade-off, not an oversight. */
    --md-sys-typescale-font: Roboto, "Helvetica Neue", system-ui, -apple-system, sans-serif;
    --md-sys-typescale-display-large-size: 3.5625rem;   --md-sys-typescale-display-large-line-height: 4rem;    --md-sys-typescale-display-large-weight: 400;
    --md-sys-typescale-headline-large-size: 2rem;       --md-sys-typescale-headline-large-line-height: 2.5rem; --md-sys-typescale-headline-large-weight: 400;
    --md-sys-typescale-headline-medium-size: 1.75rem;   --md-sys-typescale-headline-medium-line-height: 2.25rem; --md-sys-typescale-headline-medium-weight: 400;
    --md-sys-typescale-title-large-size: 1.375rem;      --md-sys-typescale-title-large-line-height: 1.75rem;   --md-sys-typescale-title-large-weight: 400;
    --md-sys-typescale-title-medium-size: 1rem;         --md-sys-typescale-title-medium-line-height: 1.5rem;   --md-sys-typescale-title-medium-weight: 500;
    --md-sys-typescale-title-small-size: 0.875rem;      --md-sys-typescale-title-small-line-height: 1.25rem;   --md-sys-typescale-title-small-weight: 500;
    --md-sys-typescale-body-large-size: 1rem;           --md-sys-typescale-body-large-line-height: 1.5rem;     --md-sys-typescale-body-large-weight: 400;
    --md-sys-typescale-body-medium-size: 0.875rem;      --md-sys-typescale-body-medium-line-height: 1.25rem;   --md-sys-typescale-body-medium-weight: 400;
    --md-sys-typescale-body-small-size: 0.75rem;        --md-sys-typescale-body-small-line-height: 1rem;       --md-sys-typescale-body-small-weight: 400;
    --md-sys-typescale-label-large-size: 0.875rem;      --md-sys-typescale-label-large-line-height: 1.25rem;   --md-sys-typescale-label-large-weight: 500;
    --md-sys-typescale-label-medium-size: 0.75rem;      --md-sys-typescale-label-medium-line-height: 1rem;     --md-sys-typescale-label-medium-weight: 500;

    /* ---- Shape (MD3 corner tokens) -------------------------------------------------------------- */
    --md-sys-shape-corner-extra-small: 4px;
    --md-sys-shape-corner-small: 8px;
    --md-sys-shape-corner-medium: 12px;
    --md-sys-shape-corner-large: 16px;
    --md-sys-shape-corner-extra-large: 28px;
    --md-sys-shape-corner-full: 9999px;

    /* ---- Spacing (MD3's 8dp grid, plus the 4px half-step the spec itself uses for tight gaps) --- */
    --og-space-1: 4px;
    --og-space-2: 8px;
    --og-space-3: 12px;
    --og-space-4: 16px;
    --og-space-6: 24px;
    --og-space-8: 32px;

    /* ---- Elevation ------------------------------------------------------------------------------ */
    /* MD3 communicates elevation primarily through TONAL SURFACE COLOR, not shadow (material-3 skill's
     * own anti-pattern: "Use shadows for elevation by default"). Tonal steps live in the
     * surface-container-* roles above; this one shadow is level-1-equivalent, used sparingly, only
     * where a card needs extra separation from a busy background (per the same guidance). */
    --og-elevation-1-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.15), 0 1px 3px 1px rgba(0, 0, 0, 0.08);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --md-sys-color-primary: #D0BCFF;
      --md-sys-color-on-primary: #381E72;
      --md-sys-color-primary-container: #4F378B;
      --md-sys-color-on-primary-container: #EADDFF;
      --md-sys-color-secondary: #CCC2DC;
      --md-sys-color-on-secondary: #332D41;
      --md-sys-color-secondary-container: #4A4458;
      --md-sys-color-on-secondary-container: #E8DEF8;
      --md-sys-color-tertiary: #EFB8C8;
      --md-sys-color-on-tertiary: #492532;
      --md-sys-color-tertiary-container: #633B48;
      --md-sys-color-on-tertiary-container: #FFD8E4;
      --md-sys-color-error: #F2B8B5;
      --md-sys-color-on-error: #601410;
      --md-sys-color-error-container: #8C1D18;
      --md-sys-color-on-error-container: #F9DEDC;
      --md-sys-color-surface: #141218;
      --md-sys-color-on-surface: #E6E0E9;
      --md-sys-color-on-surface-variant: #CAC4D0;
      --md-sys-color-surface-container-lowest: #0F0D13;
      --md-sys-color-surface-container-low: #1D1B20;
      --md-sys-color-surface-container: #211F26;
      --md-sys-color-surface-container-high: #2B2930;
      --md-sys-color-surface-container-highest: #36343B;
      --md-sys-color-surface-dim: #141218;
      --md-sys-color-surface-bright: #3B383E;
      --md-sys-color-outline: #938F99;
      --md-sys-color-outline-variant: #49454F;
      --md-sys-color-inverse-surface: #E6E0E9;
      --md-sys-color-inverse-on-surface: #322F35;
      --md-sys-color-inverse-primary: #6750A4;
    }
  }

  /* ---- Base + typographic elements, tokenized (material-3 skill: apply the type scale to REAL
   *      selectors, not just define it and never use it — that was this shell's exact prior mistake) */
  * { box-sizing: border-box; }
  body {
    font-family: var(--md-sys-typescale-font);
    font-size: var(--md-sys-typescale-body-large-size);
    line-height: var(--md-sys-typescale-body-large-line-height);
    margin: 0;
    color: var(--md-sys-color-on-surface);
    background: var(--md-sys-color-surface);
  }
  h1 {
    font-size: var(--md-sys-typescale-headline-large-size);
    line-height: var(--md-sys-typescale-headline-large-line-height);
    font-weight: var(--md-sys-typescale-headline-large-weight);
    margin: 0 0 var(--og-space-2);
  }
  h2 {
    font-size: var(--md-sys-typescale-title-large-size);
    line-height: var(--md-sys-typescale-title-large-line-height);
    font-weight: var(--md-sys-typescale-title-large-weight);
    margin: var(--og-space-8) 0 var(--og-space-3);
  }
  h3, h4 {
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    margin: var(--og-space-6) 0 var(--og-space-2);
  }
  p { margin: 0 0 var(--og-space-3); }
  a { color: var(--md-sys-color-primary); }
  small, .muted, .og-label {
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ---- Layout shell ------------------------------------------------------------------------------ */
  header {
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface);
    padding: var(--og-space-3) var(--og-space-6);
    display: flex;
    align-items: center;
    gap: var(--og-space-4);
    flex-wrap: wrap;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  header .og-wordmark {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
    margin-right: var(--og-space-2);
  }
  header a {
    color: var(--md-sys-color-on-surface-variant);
    text-decoration: none;
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    padding: var(--og-space-2) 0;
  }
  header a:hover { color: var(--md-sys-color-on-surface); }
  header a.active { color: var(--md-sys-color-primary); border-bottom: 2px solid var(--md-sys-color-primary); }
  main { padding: var(--og-space-6); max-width: 1200px; margin: 0 auto; }
  .read-only-banner {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    padding: var(--og-space-2) var(--og-space-6);
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
  }

  /* ---- Tables (MD3's own guidance has no native "data table" component on web; a tonal, calmly
   *      bordered table using the SAME container/outline tokens as everything else is the sanctioned
   *      CSS-only path — material-3 skill's own decision tree: "Web (CSS-only) -> MD3 token values as
   *      CSS custom properties (no <md-*> elements)".) ---------------------------------------------- */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: var(--og-space-4) 0;
    background: var(--md-sys-color-surface-container-lowest);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium);
    overflow: hidden;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
  }
  caption {
    text-align: left;
    font-size: var(--md-sys-typescale-label-medium-size);
    color: var(--md-sys-color-on-surface-variant);
    padding: var(--og-space-2) var(--og-space-3);
    background: var(--md-sys-color-surface-container-low);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  th, td { padding: var(--og-space-2) var(--og-space-3); text-align: left; vertical-align: top; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
  th {
    background: var(--md-sys-color-surface-container-low);
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    color: var(--md-sys-color-on-surface-variant);
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--md-sys-color-surface-container-low); }

  /* ---- Forms (the filter/sort controls) ----------------------------------------------------------- */
  form.filters { margin: var(--og-space-3) 0; display: flex; gap: var(--og-space-4); flex-wrap: wrap; align-items: end; }
  form.filters label { display: block; font-size: var(--md-sys-typescale-label-medium-size); color: var(--md-sys-color-on-surface-variant); margin-bottom: var(--og-space-1); }
  form.filters select {
    font: inherit;
    padding: var(--og-space-2) var(--og-space-3);
    border-radius: var(--md-sys-shape-corner-small);
    border: 1px solid var(--md-sys-color-outline);
    background: var(--md-sys-color-surface-container-lowest);
    color: var(--md-sys-color-on-surface);
  }

  /* ---- Chip-style badges (real <md-assist-chip> would need a JS-registered custom element in every
   *      render module; these plain spans instead take on the SAME shape/typography/tonal-color rules
   *      a real chip uses, per the CSS-only MD3 path — always a proper container/on-container pair,
   *      never an arbitrary color.) ------------------------------------------------------------------ */
  .badge {
    display: inline-flex; align-items: center;
    padding: var(--og-space-1) var(--og-space-3);
    border-radius: var(--md-sys-shape-corner-full);
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface-variant);
  }
  .bucket-produced { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
  .bucket-parked { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
  .bucket-failed { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
  .bucket-running, .bucket-queued, .bucket-done { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }

  /* ---- Cards (Media/Copy/Post columns, Kanban cards, admin cards) — one shape everywhere: a low-tone
   *      tonal surface, medium corner radius, elevation-1 shadow reserved for content that floats over
   *      other content (a card in a horizontally-scrolling row) rather than every static block. ---- */
  pre {
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface);
    padding: var(--og-space-3);
    border-radius: var(--md-sys-shape-corner-small);
    overflow-x: auto;
    font-size: var(--md-sys-typescale-body-small-size);
  }
  .table-scroll { overflow-x: auto; }
  .spec-grid { display: flex; gap: var(--og-space-4); overflow-x: auto; padding-bottom: var(--og-space-2); }
  .spec-col {
    flex: 0 0 320px;
    background: var(--md-sys-color-surface-container-lowest);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium);
    box-shadow: var(--og-elevation-1-shadow);
    padding: var(--og-space-4);
  }
  .view-toggle { display: flex; gap: var(--og-space-3); font-size: var(--md-sys-typescale-label-large-size); margin: var(--og-space-2) 0; }
  .view-toggle a { color: var(--md-sys-color-primary); text-decoration: none; }
  .view-toggle a:hover { text-decoration: underline; }
  .view-toggle a.active { font-weight: 700; color: var(--md-sys-color-on-surface); }

  /* ---- Kanban board -------------------------------------------------------------------------------- */
  .kanban-board { display: flex; gap: var(--og-space-4); align-items: flex-start; }
  .kanban-column { flex: 0 0 260px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-medium); padding: var(--og-space-3); }
  .kanban-column h3 { margin-top: 0; }
  .kanban-card {
    background: var(--md-sys-color-surface-container-lowest);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium);
    box-shadow: var(--og-elevation-1-shadow);
    padding: var(--og-space-3);
    margin-bottom: var(--og-space-3);
  }
  .kanban-card:last-child { margin-bottom: 0; }
  .kanban-card-title { margin: 0 0 var(--og-space-1); font-size: var(--md-sys-typescale-title-small-size); font-weight: var(--md-sys-typescale-title-small-weight); }
  .kanban-card-meta { margin: 0 0 var(--og-space-1); font-size: var(--md-sys-typescale-label-medium-size); color: var(--md-sys-color-on-surface-variant); }
  .kanban-card-link { margin: 0; font-size: var(--md-sys-typescale-label-large-size); }

  .idea-title-link { display: inline-block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }

  /* ---- @material/web component-level token overrides (material-3 skill's own documented pattern) -- */
  md-filled-button, md-outlined-button, md-text-button { --md-sys-color-primary: var(--md-sys-color-primary); }
  md-checkbox { --md-checkbox-selected-container-color: var(--md-sys-color-primary); }
`;

/** Wraps `bodyHtml` in the shared page shell: a `<!doctype html>` document, one `<title>`, one shared
 *  nav bar, the Material Design 3 component loading above, and minimal inline CSS (this repo's one
 *  runtime dependency used to be just `yaml` — `@material/web` is now a second, deliberately chosen one;
 *  a CSS/JS bundler still is not proportionate to a local, single-Operator, read-only viewer, so this
 *  page ships its module imports unbundled, straight off `node_modules`).
 *
 *  `activePath` (Task 7, audit 2026-08-18) is the current request's `url.pathname` — when it matches a
 *  nav link's own `href` exactly, that link is marked `aria-current="page"` (screen readers) and
 *  `class="active"` (sighted users, styled in the `<style>` block above). Optional and defaulting to no
 *  highlight so every existing two-argument call site keeps compiling unchanged; a path that matches no
 *  nav link (e.g. an Asset detail page) simply leaves every nav link unmarked. */
export function page(title: string, bodyHtml: string, activePath?: string): string {
  const nav = NAV_LINKS.map((link) => {
    const isActive = link.href === activePath;
    const activeAttrs = isActive ? ` class="active" aria-current="page"` : "";
    return `<a href="${link.href}"${activeAttrs}>${escapeHtml(link.label)}</a>`;
  }).join(" &middot; ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — OrganicGrowth Library</title>
${MATERIAL_WEB_SCRIPTS}
<style>${MD3_DESIGN_SYSTEM_CSS}</style>
</head>
<body>
<header><strong class="og-wordmark">OrganicGrowth Library</strong>${nav}</header>
<div class="read-only-banner">Read-only viewer — no write path exists here. Review, gates, and Publish happen in chat.</div>
<main>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</main>
</body>
</html>
`;
}
