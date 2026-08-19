/**
 * Render helpers for the Library ADMIN module (deliberately separate from `../render/**`, which
 * renders the read-only viewer). See `server.ts`'s own doc comment for why this module exists as a
 * second server rather than a route on the read-only one.
 *
 * Shares the SAME MD3 design-system tokens and the SAME real `@material/web` component set as the
 * read-only viewer (`../render/html.ts`'s `MD3_DESIGN_SYSTEM_CSS`/`MATERIAL_WEB_IMPORT_MAP`/
 * `MATERIAL_WEB_COMPONENT_MODULES`) — imported, not re-typed, so the two servers can never drift into
 * two different palettes/type scales. It cannot literally reuse `page()` (different server/port —
 * a relative nav link would silently resolve against the wrong server) so it builds its own shell here,
 * from the same tokens, serving the SAME component modules off its own `/vendor/...` route
 * (`server.ts`).
 *
 * Pure — no I/O, no store calls. Every function here takes already-loaded data and returns an HTML
 * string, mirroring `../render/html.ts`'s own "pure render, I/O lives in server.ts" split.
 */

import { escapeHtml, MD3_DESIGN_SYSTEM_CSS, MATERIAL_WEB_IMPORT_MAP, MATERIAL_WEB_COMPONENT_MODULES } from "../render/html.ts";
import type { FormatFile } from "../../format/store.ts";
import type { BrandAsset } from "../../brand-asset/store.ts";
import type { Recipe } from "../../recipe/registry.ts";

const ADMIN_SCRIPTS = `<script type="importmap">${JSON.stringify({ imports: MATERIAL_WEB_IMPORT_MAP })}</script>
<script type="module">
${MATERIAL_WEB_COMPONENT_MODULES.map((m) => `  import "${m}";`).join("\n")}
</script>`;

const ADMIN_STYLE = `
  .admin-tag { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); padding: var(--og-space-1) var(--og-space-3); border-radius: var(--md-sys-shape-corner-full); font-size: var(--md-sys-typescale-label-medium-size); font-weight: var(--md-sys-typescale-label-medium-weight); }
  .card {
    background: var(--md-sys-color-surface-container-lowest);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium);
    box-shadow: var(--og-elevation-1-shadow);
    padding: var(--og-space-4);
    margin: var(--og-space-4) 0;
  }
  .card h2 { margin-top: 0; }
  .field-row { display: flex; flex-direction: column; gap: var(--og-space-1); margin: var(--og-space-3) 0; }
  .recipe-option { display: flex; align-items: flex-start; gap: var(--og-space-2); margin: var(--og-space-2) 0; }
  .recipe-option-copy p { margin: 0; font-size: var(--md-sys-typescale-title-small-size); font-weight: var(--md-sys-typescale-title-small-weight); }
  .recipe-option-copy span { font-size: var(--md-sys-typescale-body-small-size); color: var(--md-sys-color-on-surface-variant); }
  .form-actions { display: flex; gap: var(--og-space-2); margin-top: var(--og-space-4); }
  .breadcrumb { margin-bottom: var(--og-space-3); font-size: var(--md-sys-typescale-body-small-size); color: var(--md-sys-color-on-surface-variant); }
  .breadcrumb a { color: var(--md-sys-color-primary); }
  md-outlined-text-field { width: 100%; }
  md-outlined-text-field[type="textarea"] { --md-outlined-text-field-container-shape: var(--md-sys-shape-corner-small); }
`;

/** The shared page shell for every admin screen. `activePath` marks the current nav link (mirrors the
 *  read-only viewer's own `page()`). `readOnlyBaseUrl` is the actual, running read-only server's own
 *  URL (e.g. `http://127.0.0.1:4173`) — an ABSOLUTE link, since these are two different servers/ports;
 *  a relative link here would silently try (and fail) to resolve against THIS server instead. */
export function adminPage(title: string, bodyHtml: string, readOnlyBaseUrl: string, activePath?: string): string {
  const nav: readonly { readonly href: string; readonly label: string }[] = [
    { href: "/", label: "Brands" },
  ];
  const navHtml = nav
    .map((item) => {
      const active = item.href === activePath;
      return `<a href="${escapeHtml(item.href)}"${active ? ` class="active" aria-current="page"` : ""}>${escapeHtml(item.label)}</a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — OrganicGrowth Library admin</title>
${ADMIN_SCRIPTS}
<style>${MD3_DESIGN_SYSTEM_CSS}${ADMIN_STYLE}</style>
</head>
<body>
<header>
  <strong>OrganicGrowth Library</strong>
  <span class="admin-tag">admin</span>
  ${navHtml}
  <a href="${escapeHtml(readOnlyBaseUrl)}/">&larr; back to the read-only Library</a>
</header>
<div class="read-only-banner">Writes here are files, git-committed one file at a time — never SQL, never the read-only viewer's own database connection.</div>
<main>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</main>
</body>
</html>`;
}

export function renderErrorBody(message: string): string {
  return `<div class="error"><p>${escapeHtml(message)}</p></div>`;
}

export function renderBrandIndex(brands: readonly { readonly slug: string; readonly name: string }[]): string {
  if (brands.length === 0) {
    return `<p class="muted">No Brands found.</p>`;
  }
  const rows = brands
    .map(
      (b) =>
        `<tr><td><a href="/brands/${encodeURIComponent(b.slug)}">${escapeHtml(b.name)}</a></td><td>${escapeHtml(b.slug)}</td></tr>`,
    )
    .join("\n");
  return `<table>
  <caption>Every Brand this Library admin can edit configuration for</caption>
  <thead><tr><th scope="col">Name</th><th scope="col">Slug</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

export function renderBrandDetail(brand: string, formatSlugs: readonly string[]): string {
  const rows = formatSlugs
    .map(
      (slug) =>
        `<tr><td><a href="/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a></td></tr>`,
    )
    .join("\n");
  return `<div class="breadcrumb"><a href="/">Brands</a> &rsaquo; ${escapeHtml(brand)}</div>
<h2>Formats</h2>
${formatSlugs.length === 0
  ? `<p class="muted">No Format files for this Brand.</p>`
  : `<table>
  <caption>This Brand's Format files</caption>
  <thead><tr><th scope="col">Format</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`}
<h2>Brand Assets</h2>
<p><md-text-button href="/brands/${encodeURIComponent(brand)}/assets">Manage Brand Assets &rarr;</md-text-button></p>`;
}

export function renderFormatDetail(
  brand: string,
  formatSlug: string,
  format: FormatFile,
  wiredRecipes: readonly Recipe[],
): string {
  const base = `/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(formatSlug)}`;
  const checkboxes = wiredRecipes
    .map((r) => {
      const checked = format.defaultRecipes.includes(r.slug) ? " checked" : "";
      const id = `recipe-${r.slug}`;
      return `<div class="recipe-option">
  <md-checkbox id="${escapeHtml(id)}" name="recipe" value="${escapeHtml(r.slug)}"${checked} touch-target="wrapper"></md-checkbox>
  <label for="${escapeHtml(id)}" class="recipe-option-copy"><p>${escapeHtml(r.name)}</p><span>${escapeHtml(r.description)}</span></label>
</div>`;
    })
    .join("\n");

  const baselineRows = wiredRecipes
    .map((r) => {
      const declared = format.baselinePrompts[r.slug];
      const href = `${base}/baseline-prompts/${encodeURIComponent(r.slug)}`;
      const status = declared !== undefined ? `declared (${escapeHtml(declared)})` : `<span class="muted">none yet</span>`;
      return `<tr><td>${escapeHtml(r.name)}</td><td>${status}</td><td><md-text-button href="${href}">${declared !== undefined ? "View / edit" : "Create"}</md-text-button></td></tr>`;
    })
    .join("\n");

  return `<div class="breadcrumb"><a href="/">Brands</a> &rsaquo; <a href="/brands/${encodeURIComponent(brand)}">${escapeHtml(brand)}</a> &rsaquo; ${escapeHtml(formatSlug)}</div>
<p class="muted">${escapeHtml(format.name)} (${escapeHtml(formatSlug)})</p>

<div class="card">
  <h2>Chosen Recipes</h2>
  <p class="muted">Only wired Recipes can be chosen here — this list is sourced from the in-repo Recipe registry, never free text.</p>
  <form method="post" action="${base}">
    ${checkboxes}
    <div class="form-actions"><md-filled-button type="submit">Save Recipes</md-filled-button></div>
  </form>
</div>

<div class="card">
  <h2>Baseline Prompts</h2>
  <table>
    <caption>Per-Recipe Baseline Prompt documents for this Format</caption>
    <thead><tr><th scope="col">Recipe</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
    <tbody>${baselineRows}</tbody>
  </table>
</div>`;
}

export function renderBaselinePromptForm(
  brand: string,
  formatSlug: string,
  recipeSlug: string,
  content: string | null,
): string {
  const base = `/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(formatSlug)}/baseline-prompts/${encodeURIComponent(recipeSlug)}`;
  const formatBase = `/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(formatSlug)}`;
  return `<div class="breadcrumb"><a href="/">Brands</a> &rsaquo; <a href="/brands/${encodeURIComponent(brand)}">${escapeHtml(brand)}</a> &rsaquo; <a href="${formatBase}">${escapeHtml(formatSlug)}</a> &rsaquo; ${escapeHtml(recipeSlug)}</div>
<div class="card">
  <form method="post" action="${base}">
    <div class="field-row">
      <md-outlined-text-field type="textarea" rows="16" label="Document content (markdown)" name="content" value="${escapeHtml(content ?? "")}"></md-outlined-text-field>
    </div>
    <div class="form-actions"><md-filled-button type="submit">Save</md-filled-button></div>
  </form>
</div>
${content !== null
  ? `<form method="post" action="${base}/delete" onsubmit="return confirm('Delete this Baseline Prompt document?');">
  <md-outlined-button type="submit">Delete</md-outlined-button>
</form>`
  : ""}`;
}

export function renderAssetsList(brand: string, assets: readonly BrandAsset[]): string {
  const base = `/brands/${encodeURIComponent(brand)}/assets`;
  const rows = assets
    .map(
      (a) => `<tr>
  <td>${escapeHtml(a.key)}</td>
  <td>${escapeHtml(a.media)}</td>
  <td>${escapeHtml(a.path)}</td>
  <td>
    <form method="post" action="${base}/${encodeURIComponent(a.key)}/delete" onsubmit="return confirm('Delete Brand Asset &quot;${escapeHtml(a.key)}&quot;?');">
      <md-outlined-button type="submit">Delete</md-outlined-button>
    </form>
  </td>
</tr>`,
    )
    .join("\n");

  return `<div class="breadcrumb"><a href="/">Brands</a> &rsaquo; <a href="/brands/${encodeURIComponent(brand)}">${escapeHtml(brand)}</a> &rsaquo; Assets</div>
<table>
  <caption>This Brand's reusable media, keyed by filename basename</caption>
  <thead><tr><th scope="col">Key</th><th scope="col">Kind</th><th scope="col">Path</th><th scope="col">Action</th></tr></thead>
  <tbody>${assets.length === 0 ? `<tr><td colspan="4" class="muted">No Brand Assets yet.</td></tr>` : rows}</tbody>
</table>

<div class="card">
  <h2>Upload / replace a Brand Asset</h2>
  <form method="post" action="${base}" enctype="multipart/form-data">
    <div class="field-row">
      <md-outlined-text-field label="Key (lowercase letters, digits, hyphens — e.g. brand-logo)" name="key" pattern="[a-z0-9-]{1,64}" required></md-outlined-text-field>
    </div>
    <div class="field-row">
      <label for="file" class="og-label">File (image, video, or audio)</label>
      <input type="file" id="file" name="file" required>
    </div>
    <div class="form-actions"><md-filled-button type="submit">Save Brand Asset</md-filled-button></div>
  </form>
</div>`;
}
