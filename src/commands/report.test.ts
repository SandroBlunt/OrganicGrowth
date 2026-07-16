import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderReport, reportCommand, main as reportMain } from "./report.ts";
import type { ReportData } from "../ledger/ledger.ts";

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

const RECIPE = "character-explainer-with-cast";

/** A representative report projection spanning every lifecycle state the renderer must surface. */
function sampleData(): ReportData {
  return {
    ideas: [
      { id: "idea-01", title: "Suggested one", status: "suggested", fit_score: 0.7, assets: [], best_performance_score: null },
      { id: "idea-02", title: "Casting one", status: "casting", fit_score: 0.82, assets: [], best_performance_score: null },
      { id: "idea-03", title: "Produced one", status: "produced", fit_score: 0.61, assets: [], best_performance_score: null },
      {
        id: "idea-04",
        title: "Scored one",
        status: "scored",
        fit_score: 0.55,
        assets: [{ recipe: RECIPE, status: "scored", performance_score: 1.4, post_url: "https://facebook.com/post/4" }],
        best_performance_score: 1.4,
      },
      {
        id: "idea-05",
        title: "Posted one",
        status: "posted",
        fit_score: 0.9,
        assets: [{ recipe: RECIPE, status: "posted", performance_score: null, post_url: "https://facebook.com/post/5" }],
        best_performance_score: null,
      },
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
  it("renders Fit Score and (best) Performance Score under separate, clearly-labelled columns/headers", () => {
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
        // Fit Score present, no Assets measured yet.
        { id: "idea-77", title: "Untracked", status: "produced", fit_score: 0.42, assets: [], best_performance_score: null },
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

  it("labels the best-of-N Performance summary as an explicit 1:N relationship (ADR-0011)", () => {
    const out = renderReport(sampleData());
    // idea-04 has exactly one measured Post → "best of 1 Post".
    const row = out.split("\n").find((l) => l.includes("idea-04"))!;
    assert.match(row, /1\.40 \(best of 1 Post\)/);
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

  it("shows exactly ONE baseline line regardless of how many Recipes/Assets exist (never per-Recipe)", () => {
    const out = renderReport(sampleData());
    const baselineLines = out.split("\n").filter((l) => /Channel baseline/.test(l));
    assert.equal(baselineLines.length, 1, "there must be exactly one Channel baseline, shared across every Recipe");
  });
});

// === renderReport — explicit attribution + empty handling + purity ===================================

describe("renderReport — explicit attribution (a Post linked only via the logged URL, per Recipe)", () => {
  it("shows a posted Asset linked to its Idea × Recipe via the logged post_url in the Posts section", () => {
    const out = renderReport(sampleData());
    // idea-04's Asset has a logged URL → shown in the Posts section, alongside its Recipe.
    assert.match(out, /https:\/\/facebook\.com\/post\/4/);
    assert.match(out, /Posts \(explicit attribution/i);
    const postsSection = out.slice(out.indexOf("Posts (explicit attribution"));
    assert.match(postsSection, new RegExp(`idea-04.*${RECIPE}`));
  });

  it("an Idea with no Assets/Posts shows no link on its own summary row", () => {
    const out = renderReport(sampleData());
    // idea-01 has no post_url → its summary row must not invent a link.
    const row = out.split("\n").find((l) => l.includes("idea-01") && !l.includes("Posts"));
    assert.ok(row);
    assert.doesNotMatch(row, /https?:\/\//);
  });

  it("reports 'no Posts logged yet' when nothing has a post_url", () => {
    const data: ReportData = {
      ideas: [{ id: "idea-01", title: "Nothing posted", status: "accepted", fit_score: 0.5, assets: [], best_performance_score: null }],
      baseline: { updated_at: null },
    };
    const out = renderReport(data);
    assert.match(out, /no Posts logged yet/i);
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
        const out = await reportCommand("mundotip", ledgerPath);
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
        await reportCommand("mundotip", ledgerPath);
        const after = await readFile(ledgerPath, "utf8");
        assert.equal(after, before, "/report must not write the ledger");
      },
    );
  });
});

// === reportCommand — the Asset grain (issue #55, ADR-0011): status is the derived roll-up ============

describe("reportCommand — a MIGRATED ledger's rolled-up Asset status appears in the Production section", () => {
  it("an accepted Idea with an in_production Asset shows status in_production and appears under Production", async () => {
    await withLedger(
      {
        ideas: [
          {
            id: "idea-05",
            title: "Character Reel",
            status: "accepted",
            fit_score: 0.7,
            assets: [{ recipe: "character-explainer-with-cast", status: "in_production", pending_gate: "cast" }],
          },
        ],
        baseline: { updated_at: null },
      },
      async (ledgerPath) => {
        const out = await reportCommand("mundotip", ledgerPath);
        assert.match(out, /Character Reel/);
        assert.match(out, /in_production/);
        assert.match(out, /Production/i);
      },
    );
  });

  it("an accepted Idea with a produced Asset shows status produced and appears under Production", async () => {
    await withLedger(
      {
        ideas: [
          {
            id: "idea-06",
            title: "Carousel Ready",
            status: "accepted",
            fit_score: 0.65,
            assets: [{ recipe: "character-explainer-with-cast", status: "produced", asset_url: "https://x/asset.mp4" }],
          },
        ],
        baseline: { updated_at: null },
      },
      async (ledgerPath) => {
        const out = await reportCommand("mundotip", ledgerPath);
        assert.match(out, /Carousel Ready/);
        const row = out.split("\n").find((l) => l.includes("idea-06"));
        assert.ok(row);
        assert.match(row, /\bproduced\b/);
      },
    );
  });

  it("an accepted Idea with NO Assets yet still shows status accepted (today's real-ledger shape)", async () => {
    await withLedger(
      {
        ideas: [{ id: "idea-07", title: "Just Accepted", status: "accepted", fit_score: 0.6, assets: [] }],
        baseline: { updated_at: null },
      },
      async (ledgerPath) => {
        const out = await reportCommand("mundotip", ledgerPath);
        const row = out.split("\n").find((l) => l.includes("idea-07"));
        assert.ok(row);
        assert.match(row, /\baccepted\b/);
      },
    );
  });
});

// === reportCommand — two Recipes of one Idea both surface, each with its own Post (issue #56) ========

describe("reportCommand — a two-Recipe Idea surfaces both Assets, each with its own attribution", () => {
  it("shows both Recipes' rows and both Posts, never collapsing to one", async () => {
    await withLedger(
      {
        ideas: [
          {
            id: "idea-08",
            title: "Two Recipes",
            status: "accepted",
            fit_score: 0.75,
            assets: [
              { recipe: "character-explainer-with-cast", status: "scored", performance_score: 0.3, post_url: "https://facebook.com/post/8a" },
              { recipe: "carousel", status: "scored", performance_score: 0.9, post_url: "https://facebook.com/post/8b" },
            ],
          },
        ],
        baseline: { updated_at: null },
      },
      async (ledgerPath) => {
        const out = await reportCommand("mundotip", ledgerPath);
        // The best-of-2 summary picks the higher score.
        const summaryRow = out.split("\n").find((l) => l.includes("idea-08") && l.includes("0.90"));
        assert.ok(summaryRow, "the summary row must show the BEST of the two Performance Scores");
        // Both Posts appear, each attributed to its own Recipe.
        assert.match(out, /https:\/\/facebook\.com\/post\/8a/);
        assert.match(out, /https:\/\/facebook\.com\/post\/8b/);
        assert.match(out, /character-explainer-with-cast/);
        assert.match(out, /carousel/);
      },
    );
  });
});

// === Brand-routing tests — reportCommand resolves the correct Brand's ledger ==========================

/**
 * Create a temp brands-root with two Brand directories, each holding a ledger. Returns paths for
 * cleanup. Used to verify that reportCommand("mundotip") reads mundotip's ledger, not acme's.
 */
async function withTwoBrandLedgers(
  fn: (opts: {
    mundotipLedger: string;
    acmeLedger: string;
  }) => Promise<void>,
): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "og-report-brands-"));
  const mundotipDir = join(tmpRoot, "mundotip");
  const acmeDir = join(tmpRoot, "acme");
  await mkdir(mundotipDir, { recursive: true });
  await mkdir(acmeDir, { recursive: true });

  const mundotipLedger = join(mundotipDir, "ledger.json");
  const acmeLedger = join(acmeDir, "ledger.json");

  const mundotipSeed = {
    ideas: [{ id: "mt-01", title: "MundoTip Idea", status: "casting", fit_score: 0.8 }],
    baseline: { updated_at: null },
  };
  const acmeSeed = {
    ideas: [{ id: "acme-01", title: "Acme Idea", status: "suggested", fit_score: 0.6 }],
    baseline: { updated_at: null },
  };

  await writeFile(mundotipLedger, JSON.stringify(mundotipSeed, null, 2) + "\n", "utf8");
  await writeFile(acmeLedger, JSON.stringify(acmeSeed, null, 2) + "\n", "utf8");

  try {
    await fn({ mundotipLedger, acmeLedger });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

describe("reportCommand — brand-routing: resolves the correct Brand's ledger via the resolver", () => {
  it("reportCommand('mundotip', ledgerPath) reads the mundotip ledger and returns the mundotip report", async () => {
    await withTwoBrandLedgers(async ({ mundotipLedger }) => {
      const out = await reportCommand("mundotip", mundotipLedger);
      assert.match(out, /MundoTip Idea/);
      assert.match(out, /mt-01/);
      assert.doesNotMatch(out, /Acme Idea/);
      assert.doesNotMatch(out, /acme-01/);
    });
  });

  it("reportCommand('acme', ledgerPath) reads the acme ledger and returns the acme report", async () => {
    await withTwoBrandLedgers(async ({ acmeLedger }) => {
      const out = await reportCommand("acme", acmeLedger);
      assert.match(out, /Acme Idea/);
      assert.match(out, /acme-01/);
      assert.doesNotMatch(out, /MundoTip Idea/);
      assert.doesNotMatch(out, /mt-01/);
    });
  });

  it("Brand A's report does not show Brand B's data — each brand reads only its own ledger", async () => {
    await withTwoBrandLedgers(async ({ mundotipLedger, acmeLedger }) => {
      const mundotipOut = await reportCommand("mundotip", mundotipLedger);
      const acmeOut = await reportCommand("acme", acmeLedger);
      // Cross-contamination check
      assert.doesNotMatch(mundotipOut, /acme-01/, "mundotip report must not contain acme data");
      assert.doesNotMatch(acmeOut, /mt-01/, "acme report must not contain mundotip data");
    });
  });

  it("reportCommand resolves the correct ledger path from the brands-root when no explicit ledgerPath is provided", async () => {
    // This test exercises the resolver fallback: `ledgerPath ?? resolveBrand(brand, brandsRoot).ledger`.
    // It calls reportCommand with NO explicit ledgerPath — only brand + brandsRoot — so the ?? branch
    // is actually taken. The temp dir is structured as <tmpRoot>/<slug>/ledger.json exactly as
    // resolveBrand expects.

    // Fresh temp root structured exactly as resolveBrand expects: <tmpRoot>/mundotip/ledger.json
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-report-resolver-"));
    const mundotipDir = join(tmpRoot, "mundotip");
    await mkdir(mundotipDir, { recursive: true });
    const ledgerPath = join(mundotipDir, "ledger.json");
    await writeFile(
      ledgerPath,
      JSON.stringify(
        { ideas: [{ id: "mt-resolver-01", title: "Resolver Fallback Idea", status: "casting", fit_score: 0.75 }], baseline: { updated_at: null } },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    try {
      // NO explicit ledgerPath — resolveBrand(brand, brandsRoot).ledger is the only path used
      const out = await reportCommand("mundotip", undefined, tmpRoot);
      assert.match(out, /Resolver Fallback Idea/, "resolver fallback reads the correct Brand's ledger");
      assert.match(out, /mt-resolver-01/);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("reportCommand — the brand argument is threaded through the report header", () => {
  it("the report output identifies the Brand being reported on", async () => {
    await withLedger(
      {
        ideas: [{ id: "idea-01", title: "Test Idea", status: "suggested", fit_score: 0.5 }],
        baseline: { updated_at: null },
      },
      async (ledgerPath) => {
        const out = await reportCommand("mundotip", ledgerPath);
        assert.match(out, /mundotip/i, "report output must state the Brand being reported on");
      },
    );
  });
});

// === CLI main() — usage-error path when <brand> is absent =============================================

describe("report CLI main() — exits with usage error when <brand> is absent", () => {
  it("writes a usage message to stderr and sets a non-zero exit code when no brand arg is given", async () => {
    // Capture stderr output by replacing process.stderr.write temporarily.
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    // Intercept stderr
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };

    try {
      // Simulate: no <brand> argument — process.argv has only the node binary + script path
      process.argv = ["node", "report.ts"];
      process.exitCode = 0;

      await reportMain();

      // The usage message must appear on stderr
      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i, "stderr must contain a usage message when <brand> is absent");

      // Exit code must be non-zero
      assert.notEqual(process.exitCode, 0, "process.exitCode must be non-zero when <brand> is absent");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });
});
