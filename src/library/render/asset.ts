/**
 * The Asset page (issue #210, AC4): the Production Spec, its media, its Copy variants, its Post URLs,
 * and its metric history all on ONE page — "so 'what did the winners have in common' is a readable
 * comparison." Pure — no database, no `node:fs`; media is shown via an `<img>`/`<video>` `src` pointing
 * at `/media/:id` (a separate, also read-only, byte-serving route — `server.ts`/`media.ts`), never
 * embedded as bytes here.
 */

import { escapeHtml, formatScore, formatDate } from "./html.ts";
import type { AssetDetailView } from "../types.ts";

function mediaHtml(media: AssetDetailView["media"]): string {
  if (media.length === 0) return `<p class="muted">No media recorded for this Asset.</p>`;
  const items = media
    .map((m) => {
      const src = `/media/${encodeURIComponent(m.id)}`;
      const tag =
        m.kind === "video"
          ? `<video src="${src}" controls style="max-width:280px;display:block;"></video>`
          : m.kind === "audio"
            ? `<audio src="${src}" controls></audio>`
            : `<img src="${src}" alt="slide ${m.ordinal}" style="max-width:280px;display:block;">`;
      return `<div class="spec-col"><p>#${m.ordinal} — ${escapeHtml(m.kind)} (${m.mime}, ${m.bytes} bytes)</p>${tag}</div>`;
    })
    .join("\n");
  return `<div class="spec-grid">${items}</div>`;
}

function copyVariantsHtml(variants: AssetDetailView["copyVariants"]): string {
  if (variants.length === 0) return `<p class="muted">No Copy composed yet.</p>`;
  return variants
    .map(
      (c) => `<div class="spec-col">
        <p><strong>${escapeHtml(c.channelPlatform)}</strong>${c.title !== undefined ? ` — ${escapeHtml(c.title)}` : ""}</p>
        <pre>${escapeHtml(c.caption)}</pre>
        ${c.hashtags.length > 0 ? `<p>${c.hashtags.map((h) => escapeHtml(h)).join(" ")}</p>` : ""}
      </div>`,
    )
    .join("\n");
}

function metricHistoryTable(history: AssetDetailView["posts"][number]["metricHistory"]): string {
  if (history.length === 0) return `<p class="muted">No metric snapshot recorded yet.</p>`;
  const rows = history
    .map(
      (m) =>
        `<tr><td>${formatDate(m.capturedAt)}</td><td>${m.reactions ?? "—"}</td><td>${m.comments ?? "—"}</td><td>${m.shares ?? "—"}</td><td>${m.views ?? "—"}</td><td>${escapeHtml(m.source)}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Captured</th><th>Reactions</th><th>Comments</th><th>Shares</th><th>Views</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function scoreHistoryTable(history: AssetDetailView["posts"][number]["scoreHistory"]): string {
  if (history.length === 0) return `<p class="muted">Not yet tracked — no Performance Score computed.</p>`;
  const rows = history.map((s) => `<tr><td>${formatDate(s.computedAt)}</td><td>${formatScore(s.score)}</td></tr>`).join("");
  return `<table><thead><tr><th>Computed</th><th>Performance Score (measured)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function postsHtml(posts: AssetDetailView["posts"]): string {
  if (posts.length === 0) return `<p class="muted">Not posted yet.</p>`;
  return posts
    .map(
      (p) => `<div>
        <p><strong>${escapeHtml(p.channelPlatform)}</strong> — <a href="${escapeHtml(p.postUrl)}" target="_blank" rel="noopener">${escapeHtml(p.postUrl)}</a> (posted ${formatDate(p.postedAt)}${p.trackingState !== undefined ? `, ${escapeHtml(p.trackingState)}` : ""})</p>
        <h4>Metric history</h4>
        ${metricHistoryTable(p.metricHistory)}
        <h4>Performance Score history (measured)</h4>
        ${scoreHistoryTable(p.scoreHistory)}
      </div>`,
    )
    .join("<hr>");
}

/** Renders the Asset page's body. */
export function renderAssetBody(detail: AssetDetailView): string {
  const idea = detail.idea;
  return `<p><a href="/">&larr; back to Library</a></p>
<h2>${escapeHtml(idea.title)}</h2>
<p>
  <span class="badge">${escapeHtml(idea.hookType)}</span>
  <span class="badge">${escapeHtml(idea.theme)}</span>
  &middot; ${escapeHtml(detail.recipeName)} &middot; ${escapeHtml(detail.formatName)} &middot; ${escapeHtml(detail.brandName)}
  &middot; status: ${escapeHtml(detail.status)}${detail.pendingGate !== undefined ? ` (paused at gate: ${escapeHtml(detail.pendingGate)})` : ""}
</p>
<p>Fit Score (predicted): ${idea.fitScore !== undefined ? formatScore(idea.fitScore) : "—"} &middot; Produced: ${formatDate(detail.producedAt)}</p>
<p>${escapeHtml(idea.brief)}</p>
${idea.sourceUrls.length > 0 ? `<p>Sources: ${idea.sourceUrls.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`).join(", ")}</p>` : ""}

<h3>Production Spec</h3>
${detail.spec === null ? `<p class="muted">No Production Spec saved yet.</p>` : `<pre>${escapeHtml(JSON.stringify(detail.spec, null, 2))}</pre>`}

<h3>Media</h3>
${mediaHtml(detail.media)}

<h3>Copy variants</h3>
${copyVariantsHtml(detail.copyVariants)}

<h3>Post URLs and metric history</h3>
${postsHtml(detail.posts)}
`;
}
