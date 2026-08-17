/**
 * The Fit Score vs Performance Score chart (issue #210, AC5, epic Question 3: "how well Fit Score
 * predicted Performance"). Pure — no database, no `node:fs`; a hand-rolled SVG scatter plot (this
 * repo's one runtime dependency is `yaml` — a charting library is not proportionate to one chart).
 *
 * Always-rule 3 ("predicted vs measured — never present one as the other"): the two axes are labeled
 * explicitly as "Fit Score (predicted)" and "Performance Score (measured)" everywhere they appear, and
 * an Idea with NO Performance Score yet is never plotted at (x, 0) — that would silently present
 * "unmeasured" as "measured zero," exactly the confusion rule 3 forbids. It is listed in a separate
 * table instead, with an honest count, so it is never simply dropped from the page either.
 */

import { escapeHtml, formatScore } from "./html.ts";
import type { FitPerformanceData, FitPerformancePoint } from "../types.ts";

const WIDTH = 480;
const HEIGHT = 480;
const MARGIN = 40;
const PLOT_SIZE = WIDTH - 2 * MARGIN;

function scaleX(fit: number): number {
  return MARGIN + fit * PLOT_SIZE;
}

function scaleY(performance: number): number {
  return MARGIN + (1 - performance) * PLOT_SIZE;
}

function svgFor(scored: readonly FitPerformancePoint[]): string {
  const axisLine = `<line x1="${MARGIN}" y1="${HEIGHT - MARGIN}" x2="${WIDTH - MARGIN}" y2="${HEIGHT - MARGIN}" stroke="#333" />` +
    `<line x1="${MARGIN}" y1="${MARGIN}" x2="${MARGIN}" y2="${HEIGHT - MARGIN}" stroke="#333" />`;
  const diagonal = `<line x1="${scaleX(0)}" y1="${scaleY(0)}" x2="${scaleX(1)}" y2="${scaleY(1)}" stroke="#bbb" stroke-dasharray="4 4" />`;
  const points = scored
    .map((p) => {
      const cx = scaleX(p.fitScore);
      const cy = scaleY(p.performanceScore!);
      const title = `${escapeHtml(p.ideaTitle)}: Fit ${formatScore(p.fitScore)} vs Performance ${formatScore(p.performanceScore)}`;
      return `<circle cx="${cx}" cy="${cy}" r="5" fill="#2b6cb0" fill-opacity="0.75"><title>${title}</title></circle>`;
    })
    .join("");
  const xLabel = `<text x="${WIDTH / 2}" y="${HEIGHT - 8}" text-anchor="middle" font-size="12">Fit Score (predicted) &rarr;</text>`;
  const yLabel = `<text x="12" y="${HEIGHT / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 12 ${HEIGHT / 2})">Performance Score (measured) &rarr;</text>`;

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Fit Score versus Performance Score scatter plot">
    <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#fff" />
    ${diagonal}
    ${axisLine}
    ${points}
    ${xLabel}
    ${yLabel}
  </svg>`;
}

function unscoredTable(unscored: readonly FitPerformancePoint[]): string {
  if (unscored.length === 0) return "";
  const rows = unscored
    .map((p) => `<tr><td>${escapeHtml(p.ideaTitle)}</td><td>${formatScore(p.fitScore)}</td><td>not yet tracked</td></tr>`)
    .join("");
  return `<h3>Awaiting a Performance Score (${unscored.length})</h3>
<p class="muted">Not plotted above — a Fit Score without a measured Performance Score would otherwise be shown as if it scored 0, which is not true.</p>
<table><thead><tr><th>Idea</th><th>Fit Score (predicted)</th><th>Performance Score (measured)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Renders the Fit-vs-Performance chart page body. */
export function renderChartBody(data: FitPerformanceData): string {
  const scored = data.points.filter((p) => p.performanceScore !== undefined);
  const unscored = data.points.filter((p) => p.performanceScore === undefined);

  if (data.points.length === 0) {
    return `<p class="muted">No Idea carries a Fit Score yet.</p>`;
  }

  const summary = `<p>${scored.length} Idea(s) plotted (both a Fit Score and a Performance Score). ${unscored.length} Idea(s) have a Fit Score but no Performance Score yet.</p>`;

  const chart =
    scored.length === 0
      ? `<p class="muted">Nothing plottable yet — no Idea has BOTH a Fit Score and a measured Performance Score. The dashed diagonal, when points exist, marks "predicted the actual result exactly"; a point above it means the Idea outperformed its prediction, below means it underperformed.</p>`
      : `<p class="muted">The dashed diagonal marks "Fit Score predicted the actual result exactly." A point above it outperformed its prediction; below, it underperformed.</p>${svgFor(scored)}`;

  return `${summary}${chart}${unscoredTable(unscored)}`;
}
