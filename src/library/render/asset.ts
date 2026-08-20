/**
 * The Asset page (issue #210, AC4): the Production Spec, its media, its Copy variants, its Post URLs,
 * and its metric history all on ONE page — "so 'what did the winners have in common' is a readable
 * comparison." Pure — no database, no `node:fs`; media is shown via an `<img>`/`<video>` `src` pointing
 * at `/media/:id` (a separate, also read-only, byte-serving route — `server.ts`/`media.ts`), never
 * embedded as bytes here.
 */

import { escapeHtml, formatScore, formatDate } from "./html.ts";
import type { AssetDetailView } from "../types.ts";

/**
 * Turns the Idea Brief's free text — blank-line-separated `##` headings, `- ` bulleted lists, and plain
 * paragraphs, plus the Operator's own production notes embedded in the same field — into real
 * block-level HTML instead of one flattened `<p>` (Task 3, audit 2026-08-18: HTML collapses newlines
 * inside a `<p>`, so the markdown-ish source's own structure never showed up on screen). This is
 * deliberately NOT a general markdown parser — the Brief format is fixed and known (`idea-strategist`
 * output, `docs/` briefs) — a minimal, purpose-built splitter is enough and keeps this module
 * dependency-free. Every leaf string still goes through `escapeHtml`; nothing is dropped, only
 * restructured into `<p>`/`<h4>`/`<ul><li>` blocks. A wrapped continuation line of a list item (no
 * leading `- `, immediately following one inside the same chunk) is appended to that item rather than
 * starting a new paragraph — real Briefs wrap long bullet text exactly this way.
 */
export function renderBriefHtml(text: string): string {
  const chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  return chunks.map(chunkToHtml).join("\n");
}

function chunkToHtml(chunk: string): string {
  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length > 0) {
      blocks.push(`<p>${escapeHtml(paragraphLines.join(" "))}</p>`);
      paragraphLines = [];
    }
  };
  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of chunk.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const listItem = /^[-*]\s+(.*)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      blocks.push(`<h4>${escapeHtml((heading[1] ?? "").trim())}</h4>`);
    } else if (listItem !== null) {
      flushParagraph();
      listItems.push((listItem[1] ?? "").trim());
    } else if (listItems.length > 0) {
      const lastIndex = listItems.length - 1;
      const last = listItems[lastIndex];
      if (last !== undefined) listItems[lastIndex] = `${last} ${line}`;
    } else {
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join("\n");
}

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
  return `<table><caption>Metric history</caption><thead><tr><th scope="col">Captured</th><th scope="col">Reactions</th><th scope="col">Comments</th><th scope="col">Shares</th><th scope="col">Views</th><th scope="col">Source</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function scoreHistoryTable(history: AssetDetailView["posts"][number]["scoreHistory"]): string {
  if (history.length === 0) return `<p class="muted">Not yet tracked — no Performance Score computed.</p>`;
  const rows = history.map((s) => `<tr><td>${formatDate(s.computedAt)}</td><td>${formatScore(s.score)}</td></tr>`).join("");
  return `<table><caption>Performance Score history (measured)</caption><thead><tr><th scope="col">Computed</th><th scope="col">Performance Score (measured)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function postsHtml(posts: AssetDetailView["posts"]): string {
  // Task 10, audit 2026-08-18: gives each Post entry the same `.spec-col` card treatment
  // `mediaHtml`/`copyVariantsHtml` already use, instead of bare <div>s separated by <hr> — the card's
  // own border does the visual separating, so no <hr> is needed between entries anymore.
  if (posts.length === 0) return `<p class="muted">Not posted yet.</p>`;
  return posts
    .map(
      (p) => `<div class="spec-col">
        <p><strong>${escapeHtml(p.channelPlatform)}</strong> — <a href="${escapeHtml(p.postUrl)}" target="_blank" rel="noopener">${escapeHtml(p.postUrl)}</a> (posted ${formatDate(p.postedAt)}${p.trackingState !== undefined ? `, ${escapeHtml(p.trackingState)}` : ""})</p>
        <h4>Metric history</h4>
        ${metricHistoryTable(p.metricHistory)}
        <h4>Performance Score history (measured)</h4>
        ${scoreHistoryTable(p.scoreHistory)}
      </div>`,
    )
    .join("\n");
}

/** Renders the Asset page's body. */
export function renderAssetBody(detail: AssetDetailView): string {
  const idea = detail.idea;
  return `<p><a href="/">&larr; back to Library</a></p>
<p>
  <span class="badge">${escapeHtml(idea.hookType)}</span>
  <span class="badge">${escapeHtml(idea.theme)}</span>
  &middot; ${escapeHtml(detail.recipeName)} &middot; ${escapeHtml(detail.formatName)} &middot; ${escapeHtml(detail.brandName)}
  &middot; status: ${escapeHtml(detail.status)}${detail.pendingGate !== undefined ? ` (paused at gate: ${escapeHtml(detail.pendingGate)})` : ""}
</p>
<p>Fit Score (predicted): ${idea.fitScore !== undefined ? formatScore(idea.fitScore) : "—"} &middot; Produced: ${formatDate(detail.producedAt)}</p>
${renderBriefHtml(idea.brief)}
${idea.sourceUrls.length > 0 ? `<p>Sources: ${idea.sourceUrls.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`).join(", ")}</p>` : ""}

<h3>Production Spec</h3>
${detail.spec === null ? `<p class="muted">No Production Spec saved yet.</p>` : `<details><summary>Production Spec (raw JSON)</summary><pre>${escapeHtml(JSON.stringify(detail.spec, null, 2))}</pre></details>`}

<h3>Media</h3>
${mediaHtml(detail.media)}

<h3>Copy variants</h3>
${copyVariantsHtml(detail.copyVariants)}

<h3>Post URLs and metric history</h3>
${postsHtml(detail.posts)}
`;
}
