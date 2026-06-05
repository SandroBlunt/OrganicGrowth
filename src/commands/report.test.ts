import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderReport, reportCommand } from "./report.ts";
import type { ReportData } from "../ledger/ledger.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

/** Run `fn` against a temp ledger file so the command never touches real state. */
async function withLedger(seed: unknown, fn: (ledgerPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-report-"));
  const ledgerPath = join(dir, "ledger.json");
  try {
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(ledgerPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A representative report projection spanning every lifecycle state the renderer must surface. */
function sampleData(): ReportData {
  return {
    ideas: [
      { id: "idea-01", title: "Suggested one", status: "suggested", fit_score: 0.7, performance_score: null, post_url: null },
      { id: "idea-02", title: "Casting one", status: "casting", fit_score: 0.82, performance_score: null, post_url: null },
      { id: "idea-03", title: "Produced one", status: "produced", fit_score: 0.61, performance_score: null, post_url: null },
      { id: "idea-04", title: "Scored one", status: "scored", fit_score: 0.55, performance_score: 1.4, post_url: "https://facebook.com/post/4" },
      { id: "idea-05", title: "Posted one", status: "posted", fit_score: 0.9, performance_score: null, post_url: "https://facebook.com/post/5" },
    ],
    baseline: { updated_at: "2026-06-04T09:00:00.000Z" },
  };
}

// === renderReport — surfaces production, keeps predicted vs measured distinct ========================

describe("renderReport — surfaces production (casting + produced) at a glance", () => {
  it("lists each casting Idea and each produced Idea in a Production section, identified by id/title", () => {
    const out = renderReport(sampleData());

    // A Production section exists.
    assert.match(out, /Production/i);

    // Both production-state Ideas appear by id AND title.
    assert.match(out, /idea-02/);
    assert.match(out, /Casting one/);
    assert.match(out, /casting/i);
    assert.match(out, /idea-03/);
    assert.match(out, /Produced one/);
    assert.match(out, /produced/i);
  });
});

describe("renderReport — keeps Fit Score (predicted) and Performance Score (measured) distinct", () => {
  it("renders Fit Score and Performance Score under separate, clearly-labelled columns/headers", () => {
    const out = renderReport(sampleData());
    assert.match(out, /Fit Score/i);
    assert.match(out, /Performance Score/i);
    // The labels make the prediction/measurement distinction explicit.
    assert.match(out, /predicted/i);
    assert.match(out, /measured/i);
  });

  it("never shows a Fit Score in the Performance column: an untracked Idea's Performance cell is a placeholder, not 0 and not the Fit Score", () => {
    const data: ReportData = {
      ideas: [
        // Fit Score present, Performance Score null (not yet measured).
        { id: "idea-77", title: "Untracked", status: "produced", fit_score: 0.42, performance_score: null, post_url: null },
      ],
      baseline: { updated_at: null },
    };
    const out = renderReport(data);

    // Find the Idea's row and isolate it.
    const row = out.split("\n").find((l) => l.includes("idea-77"));
    assert.ok(row, "expected a row for idea-77");

    // The Fit Score value is present somewhere on the row.
    assert.match(row, /0\.42/);

    // The placeholder is present (the em dash / dash placeholder), and the Performance cell is NOT "0"
    // and NOT a duplicate of the Fit Score value.
    assert.match(row, /—|--/);
    // Fit Score 0.42 must appear exactly once on the row (not borrowed into the Performance column).
    const occurrences = (row.match(/0\.42/g) ?? []).length;
    assert.equal(occurrences, 1, "Fit Score must not be duplicated into the Performance column");
    // The Performance cell must not read as a literal 0 score.
    assert.doesNotMatch(row, /\b0\.00\b/);
  });
});

describe("renderReport — a measured score is shown relative to the Channel baseline", () => {
  it("shows the baseline and its updated_at so a measured score is read relative to it", () => {
    const out = renderReport(sampleData());
    assert.match(out, /baseline/i);
    assert.match(out, /2026-06-04T09:00:00\.000Z/);
  });

  it("notes 'not yet measured' when the baseline has never been updated", () => {
    const data: ReportData = { ideas: sampleData().ideas, baseline: { updated_at: null } };
    const out = renderReport(data);
    assert.match(out, /baseline/i);
    assert.match(out, /not yet measured/i);
  });
});

// === renderReport — explicit attribution + empty handling + purity ===================================

describe("renderReport — explicit attribution (Post linked only via the logged URL)", () => {
  it("shows a posted Idea linked to its Post via the logged post_url, and shows no link when post_url is null", () => {
    const out = renderReport(sampleData());
    // idea-04 has a logged URL → shown.
    assert.match(out, /https:\/\/facebook\.com\/post\/4/);
    // idea-01 has no post_url → its row must not invent a link.
    const row = out.split("\n").find((l) => l.includes("idea-01"));
    assert.ok(row);
    assert.doesNotMatch(row, /https?:\/\//);
  });
});

describe("renderReport — empty ledger renders a note, not a crash", () => {
  it("returns a clear empty note for a ledger with no Ideas, without throwing", () => {
    const out = renderReport({ ideas: [], baseline: { updated_at: null } });
    assert.match(out, /empty|no ideas|run-trends/i);
  });
});

describe("renderReport — pure", () => {
  it("is deterministic and does not mutate its input", () => {
    const data = sampleData();
    const snapshot = JSON.stringify(data);
    const a = renderReport(data);
    const b = renderReport(data);
    assert.equal(a, b);
    assert.equal(JSON.stringify(data), snapshot, "input must not be mutated");
  });
});

// === reportCommand — orchestration shell, read-only over the ledger ==================================

describe("reportCommand — reads the ledger via loadReport and renders it", () => {
  it("returns the rendered report for a fixture ledger", async () => {
    await withLedger(
      {
        ideas: [
          { id: "idea-02", title: "Casting one", status: "casting", fit_score: 0.82 },
          { id: "idea-03", title: "Produced one", status: "produced", fit_score: 0.61 },
        ],
        baseline: { updated_at: "2026-06-04T09:00:00.000Z" },
      },
      async (ledgerPath) => {
        const out = await reportCommand(ledgerPath);
        assert.match(out, /Casting one/);
        assert.match(out, /Produced one/);
        assert.match(out, /Production/i);
      },
    );
  });

  it("leaves the ledger file byte-for-byte unchanged (read-only; never mutates the ledger)", async () => {
    await withLedger(
      {
        ideas: [{ id: "idea-04", title: "Scored one", status: "scored", fit_score: 0.55, performance_score: 1.4, post_url: "https://facebook.com/post/4" }],
        baseline: { updated_at: "2026-06-04T09:00:00.000Z" },
      },
      async (ledgerPath) => {
        const before = await readFile(ledgerPath, "utf8");
        await reportCommand(ledgerPath);
        const after = await readFile(ledgerPath, "utf8");
        assert.equal(after, before, "/report must not write the ledger");
      },
    );
  });
});

// === Docs surface — the final Operator command surface + lifecycle match the shipped feature =========

describe("command surface — final and matches the shipped Producer feature", () => {
  it("ships /queue, /pick-cast, /log-post and NO /produce command", async () => {
    const cmds = join(REPO_ROOT, ".claude", "commands");
    await readFile(join(cmds, "queue.md"), "utf8");
    await readFile(join(cmds, "pick-cast.md"), "utf8");
    await readFile(join(cmds, "log-post.md"), "utf8");
    await assert.rejects(
      readFile(join(cmds, "produce.md"), "utf8"),
      "there must be no /produce command file (auto-enqueue on accept replaced it)",
    );
  });

  it("CLAUDE.md documents the final lifecycle and carries no stale '/produce' wiring", async () => {
    const claude = await readFile(join(REPO_ROOT, "CLAUDE.md"), "utf8");
    assert.match(
      claude,
      /suggested → accepted → casting → produced → posted → tracking → scored/,
      "CLAUDE.md must document the final lifecycle",
    );
    assert.doesNotMatch(
      claude,
      /written by `\/produce`/,
      "CLAUDE.md must not say the Production Spec is written by /produce",
    );
  });

  it("report.md describes the production states (casting/produced) and keeps Fit vs Performance distinct", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "report.md"), "utf8");
    assert.match(doc, /casting/i);
    assert.match(doc, /produced/i);
    assert.match(doc, /Fit Score/i);
    assert.match(doc, /Performance Score/i);
  });
});
