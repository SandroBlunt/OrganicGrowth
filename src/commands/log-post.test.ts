import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isFacebookPermalink,
  planLogPost,
  logPostCommand,
  main as logPostMain,
} from "./log-post.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";

const RECIPE = "character-explainer-with-cast";
const RECIPE_2 = "carousel";
const FB_URL = "https://facebook.com/permalink/123";
const POSTED_AT = "2026-06-06T12:00:00.000Z";

// === isFacebookPermalink — pure URL predicate =========================================================

describe("isFacebookPermalink — accepts only facebook.com permalinks", () => {
  it("accepts bare facebook.com and www.facebook.com https URLs", () => {
    assert.equal(isFacebookPermalink("https://facebook.com/permalink/123"), true);
    assert.equal(isFacebookPermalink("https://www.facebook.com/testbrand/posts/1"), true);
  });

  it("accepts http (not just https)", () => {
    assert.equal(isFacebookPermalink("http://facebook.com/permalink/123"), true);
  });

  it("rejects a non-Facebook host", () => {
    assert.equal(isFacebookPermalink("https://instagram.com/p/abc"), false);
    assert.equal(isFacebookPermalink("https://not-facebook.com/permalink/123"), false);
  });

  it("rejects an unparseable string", () => {
    assert.equal(isFacebookPermalink("not-a-url"), false);
    assert.equal(isFacebookPermalink(""), false);
  });

  it("rejects a non-http(s) scheme", () => {
    assert.equal(isFacebookPermalink("ftp://facebook.com/permalink/123"), false);
  });
});

// === planLogPost — pure decision, never infers ========================================================

describe("planLogPost — never infers which Asset a Post belongs to", () => {
  it("refuses an unknown Idea", () => {
    const plan = planLogPost(null, RECIPE, FB_URL);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "unknown-idea");
  });

  it("refuses a non-facebook.com URL", () => {
    const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] };
    const plan = planLogPost(idea, RECIPE, "https://instagram.com/p/1");
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "invalid-url");
  });

  it("REFUSES when the recipe does not name one of the Idea's Assets — lists what IS available (never infers)", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced" }, { recipe: RECIPE_2, status: "queued" }],
    };
    const plan = planLogPost(idea, "not-a-real-recipe", FB_URL);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "unknown-recipe");
    assert.equal(plan.assets.length, 2);
    assert.deepEqual(plan.assets.map((a) => a.recipe).sort(), [RECIPE, RECIPE_2].sort());
  });

  it("even with EXACTLY ONE Asset, an unnamed/mismatched recipe still refuses — never defaults to 'the only one'", () => {
    const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] };
    const plan = planLogPost(idea, "wrong-recipe", FB_URL);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "unknown-recipe");
  });

  it("refuses when the named Recipe's Asset is not yet produced (queued)", () => {
    const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "queued" }] };
    const plan = planLogPost(idea, RECIPE, FB_URL);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "not-yet-produced");
    assert.equal(plan.asset.status, "queued");
  });

  it("refuses when the named Recipe's Asset is still in_production", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "in_production", pending_gate: "cast" }],
    };
    const plan = planLogPost(idea, RECIPE, FB_URL);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "not-yet-produced");
  });

  it("a produced Asset advances to posted", () => {
    const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] };
    const plan = planLogPost(idea, RECIPE, FB_URL);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.nextStatus, "posted");
  });

  it("an already-posted/tracking/scored Asset keeps its own status (re-logging never regresses it)", () => {
    for (const status of ["posted", "tracking", "scored"] as const) {
      const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status }] };
      const plan = planLogPost(idea, RECIPE, FB_URL);
      assert.equal(plan.ok, true);
      if (!plan.ok) return;
      assert.equal(plan.nextStatus, status, `status ${status} must not regress`);
    }
  });

  it("with TWO Assets, picks EXACTLY the named Recipe's Asset — never the other one", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [
        { recipe: RECIPE, status: "produced" },
        { recipe: RECIPE_2, status: "posted", post_url: "https://facebook.com/other" },
      ],
    };
    const plan = planLogPost(idea, RECIPE, FB_URL);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.asset.recipe, RECIPE);
  });
});

// === logPostCommand — orchestration shell, writes onto the NAMED Recipe's Asset =======================

async function withLedger(seed: unknown, fn: (ledgerPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-log-post-"));
  const ledgerPath = join(dir, "ledger.json");
  try {
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(ledgerPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("logPostCommand — writes post_url/posted_at/status onto the NAMED Recipe's Asset", () => {
  it("logs a Post against a produced Asset, advancing it to posted", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      const out = await logPostCommand("mundotip", "idea-A", RECIPE, FB_URL, POSTED_AT, { ledgerPath });
      assert.match(out, /idea-A/);
      assert.match(out, new RegExp(RECIPE));

      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const asset = assets!.find((a) => a.recipe === RECIPE)!;
      assert.equal(asset.status, "posted");
      assert.equal(asset.post_url, FB_URL);
      assert.equal(asset.posted_at, POSTED_AT);
    });
  });

  it("with TWO Assets, writes onto ONLY the named Recipe's Asset — the other is untouched", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [
            { recipe: RECIPE, status: "produced" },
            { recipe: RECIPE_2, status: "produced" },
          ],
        },
      ],
    };
    await withLedger(seed, async (ledgerPath) => {
      await logPostCommand("mundotip", "idea-A", RECIPE, FB_URL, POSTED_AT, { ledgerPath });

      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const named = assets!.find((a) => a.recipe === RECIPE)!;
      const other = assets!.find((a) => a.recipe === RECIPE_2)!;
      assert.equal(named.status, "posted");
      assert.equal(named.post_url, FB_URL);
      // The OTHER Recipe's Asset is completely untouched — explicit attribution, never inferred.
      assert.equal(other.status, "produced");
      assert.equal(other.post_url, undefined);
    });
  });

  it("REFUSES and lists the Idea's Assets when the recipe does not match any of them — writes nothing", async () => {
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [{ recipe: RECIPE, status: "produced" }, { recipe: RECIPE_2, status: "queued" }],
        },
      ],
    };
    await withLedger(seed, async (ledgerPath) => {
      const before = await readFile(ledgerPath, "utf8");
      const out = await logPostCommand("mundotip", "idea-A", "wrong-recipe", FB_URL, POSTED_AT, { ledgerPath });

      assert.match(out, /not one of this Idea's Assets/i);
      assert.match(out, new RegExp(RECIPE));
      assert.match(out, new RegExp(RECIPE_2));

      const after = await readFile(ledgerPath, "utf8");
      assert.equal(after, before, "a refused /log-post must never write the ledger");
    });
  });

  it("REFUSES a non-facebook.com URL and writes nothing", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      const before = await readFile(ledgerPath, "utf8");
      const out = await logPostCommand("mundotip", "idea-A", RECIPE, "https://instagram.com/p/1", POSTED_AT, { ledgerPath });
      assert.match(out, /not a facebook\.com/i);
      const after = await readFile(ledgerPath, "utf8");
      assert.equal(after, before);
    });
  });

  it("REFUSES an Asset that is not yet produced (queued) — nothing to publish", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "queued" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      const out = await logPostCommand("mundotip", "idea-A", RECIPE, FB_URL, POSTED_AT, { ledgerPath });
      assert.match(out, /not yet produced/i);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.post_url, undefined);
    });
  });

  it("REFUSES an unknown Idea without crashing", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      const out = await logPostCommand("mundotip", "idea-ZZZ", RECIPE, FB_URL, POSTED_AT, { ledgerPath });
      assert.match(out, /unknown Idea/i);
      assert.match(out, /idea-ZZZ/);
    });
  });

  it("defaults posted_at to the injected clock when omitted", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      await logPostCommand("mundotip", "idea-A", RECIPE, FB_URL, undefined, { ledgerPath, now: () => POSTED_AT });
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.posted_at, POSTED_AT);
    });
  });

  it("the output restates the Brand (issue #20 — never a silent default)", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      const out = await logPostCommand("mundotip", "idea-A", RECIPE, FB_URL, POSTED_AT, { ledgerPath });
      assert.match(out, /mundotip/i);
    });
  });
});

// === Brand-routing tests — logPostCommand resolves the correct Brand's ledger =========================

describe("logPostCommand — brand-routing: resolves the correct Brand's ledger via the resolver", () => {
  it("routes to the Brand's ledger via the resolver when no explicit ledgerPath is provided", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-log-post-resolver-"));
    const mundotipDir = join(tmpRoot, "mundotip");
    await mkdir(mundotipDir, { recursive: true });
    const ledgerPath = join(mundotipDir, "ledger.json");
    await writeFile(
      ledgerPath,
      JSON.stringify({ ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] }, null, 2) + "\n",
      "utf8",
    );
    try {
      const out = await logPostCommand("mundotip", "idea-A", RECIPE, FB_URL, POSTED_AT, { brandsRoot: tmpRoot });
      assert.match(out, /idea-A/);
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      assert.equal(assets![0]!.status, "posted");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("does not touch another Brand's ledger", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-log-post-brands-"));
    const mundotipDir = join(tmpRoot, "mundotip");
    const acmeDir = join(tmpRoot, "acme");
    await mkdir(mundotipDir, { recursive: true });
    await mkdir(acmeDir, { recursive: true });
    const mundotipLedger = join(mundotipDir, "ledger.json");
    const acmeLedger = join(acmeDir, "ledger.json");
    const acmeSeed = { ideas: [{ id: "shared-id", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await writeFile(mundotipLedger, JSON.stringify({ ideas: [] }, null, 2) + "\n", "utf8");
    await writeFile(acmeLedger, JSON.stringify(acmeSeed, null, 2) + "\n", "utf8");
    try {
      const before = await readFile(acmeLedger, "utf8");
      await logPostCommand("mundotip", "shared-id", RECIPE, FB_URL, POSTED_AT, { ledgerPath: mundotipLedger });
      const after = await readFile(acmeLedger, "utf8");
      assert.equal(after, before, "acme's ledger must be untouched by a mundotip /log-post call");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

// === CLI main() — usage-error path when required args are absent ======================================

describe("log-post CLI main() — exits with usage error when required args are absent", () => {
  it("writes a usage message to stderr and sets a non-zero exit code when no args are given", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };

    try {
      process.argv = ["node", "log-post.ts"];
      process.exitCode = 0;

      await logPostMain();

      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i, "stderr must contain a usage message when required args are absent");
      assert.notEqual(process.exitCode, 0, "process.exitCode must be non-zero when required args are absent");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });

  it("requires <recipe> specifically — omitting only the recipe arg is still a usage error", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };

    try {
      // brand + idea-id given, but <recipe> and <url> are missing
      process.argv = ["node", "log-post.ts", "mundotip", "idea-A"];
      process.exitCode = 0;

      await logPostMain();

      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i);
      assert.match(stderr, /recipe/i, "usage message must mention <recipe>");
      assert.notEqual(process.exitCode, 0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });
});
