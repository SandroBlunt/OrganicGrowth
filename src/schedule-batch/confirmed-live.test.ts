import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { planConfirmedLiveLog, confirmZohoPostLive, type ZohoScheduleReport } from "./confirmed-live.ts";
import { logPostCommand } from "../commands/log-post.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import type { LedgerIdea } from "../ledger/ledger.ts";
import type { Channel } from "../production-spec/brand-profile.ts";

const RECIPE = "news-carousel";
const RECIPE_2 = "character-explainer-with-cast";
const REF = "zoho-post-abc123";
const LIVE_URL = "https://www.facebook.com/straw-motion/posts/999";
const LIVE_AT = "2026-08-10T13:00:00.000Z";

const FACEBOOK_PRIMARY: Channel = { platform: "facebook", url: "https://www.facebook.com/straw-motion", primary: true };

function liveReport(reference: string | readonly string[] = REF): ZohoScheduleReport {
  return {
    reference,
    statuses: [{ platform: "facebook", status: "live", liveUrl: LIVE_URL, liveAt: LIVE_AT }],
  };
}

// === planConfirmedLiveLog — pure decision, never infers =================================================

describe("planConfirmedLiveLog — keys ONLY on the stored reference, never timing/inference", () => {
  it("refuses an unknown Idea", () => {
    const plan = planConfirmedLiveLog(null, RECIPE, liveReport(), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "unknown-idea");
  });

  it("REFUSES when the recipe does not name one of the Idea's Assets — lists what IS available", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [
        { recipe: RECIPE, status: "produced", zoho_schedule_reference: REF },
        { recipe: RECIPE_2, status: "queued" },
      ],
    };
    const plan = planConfirmedLiveLog(idea, "not-a-real-recipe", liveReport(), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "unknown-recipe");
    assert.equal(plan.assets.length, 2);
  });

  it("refuses when the named Recipe's Asset is not yet produced (queued/in_production)", () => {
    for (const status of ["queued", "in_production"] as const) {
      const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status }] };
      const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(), FACEBOOK_PRIMARY);
      assert.equal(plan.ok, false);
      if (plan.ok) return;
      assert.equal(plan.reason, "not-yet-produced");
    }
  });

  // --- AC4: an Asset without a stored reference is NEVER auto-logged -----------------------------------

  it("AC4: an Asset with NO stored zoho_schedule_reference is never auto-logged, even with a live report in hand", () => {
    const idea: LedgerIdea = { id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "no-stored-reference");
  });

  it("refuses when the Brand has no configured primary Channel", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(), null);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "no-primary-channel");
  });

  // --- AC2: confirmation keys ONLY on the stored reference, never timing/inference ----------------------

  it("AC2: a report for a DIFFERENT reference than the stored one refuses, even though it says live", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport("a-totally-different-reference"), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "reference-mismatch");
  });

  it("AC2: a string reference never matches an array carrying the same single value (shape-sensitive)", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport([REF]), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "reference-mismatch");
  });

  it("AC2: an array reference in a DIFFERENT order never matches — never reordered, never resembled", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: ["ref-a", "ref-b"] }],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(["ref-b", "ref-a"]), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "reference-mismatch");
  });

  it("a matching array reference (same order) confirms live", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: ["ref-a", "ref-b"] }],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(["ref-a", "ref-b"]), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, true);
  });

  // --- AC3: a still-pending or missing report writes nothing, says so clearly ----------------------------

  it("AC3: no entry for the primary Channel's platform in the report -> 'no-report' (missing)", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const report: ZohoScheduleReport = { reference: REF, statuses: [] };
    const plan = planConfirmedLiveLog(idea, RECIPE, report, FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "no-report");
  });

  it("AC3: a still-pending Zoho status refuses, naming the status", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const report: ZohoScheduleReport = { reference: REF, statuses: [{ platform: "facebook", status: "pending" }] };
    const plan = planConfirmedLiveLog(idea, RECIPE, report, FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "pending");
    assert.equal(plan.status, "pending");
  });

  it("AC3: a failed Zoho status refuses, naming the status (never logged as live)", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const report: ZohoScheduleReport = { reference: REF, statuses: [{ platform: "facebook", status: "failed" }] };
    const plan = planConfirmedLiveLog(idea, RECIPE, report, FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "pending");
    assert.equal(plan.status, "failed");
  });

  it("AC3: status 'live' but missing liveUrl/liveAt never half-fabricates a Post — refuses as pending", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const report: ZohoScheduleReport = { reference: REF, statuses: [{ platform: "facebook", status: "live" }] };
    const plan = planConfirmedLiveLog(idea, RECIPE, report, FACEBOOK_PRIMARY);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "pending");
  });

  // --- AC1: a confirmed-live report logs the Post URL and advances produced -> posted --------------------

  it("AC1: a confirmed-live report for the stored reference logs the primary Channel's URL, advancing produced -> posted", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(), FACEBOOK_PRIMARY);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.nextStatus, "posted");
    assert.equal(plan.postUrl, LIVE_URL);
    assert.equal(plan.postedAt, LIVE_AT);
    assert.equal(plan.platform, "facebook");
  });

  it("only the PRIMARY Channel's status is used — a live secondary Channel entry is ignored for the write", () => {
    const idea: LedgerIdea = {
      id: "idea-A",
      status: "accepted",
      assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }],
    };
    const report: ZohoScheduleReport = {
      reference: REF,
      statuses: [
        { platform: "instagram", status: "live", liveUrl: "https://instagram.com/p/other", liveAt: LIVE_AT },
        { platform: "facebook", status: "live", liveUrl: LIVE_URL, liveAt: LIVE_AT },
      ],
    };
    const plan = planConfirmedLiveLog(idea, RECIPE, report, FACEBOOK_PRIMARY);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.postUrl, LIVE_URL);
  });

  it("an already-posted/tracking/scored Asset keeps its own status (re-confirming never regresses it)", () => {
    for (const status of ["posted", "tracking", "scored"] as const) {
      const idea: LedgerIdea = {
        id: "idea-A",
        status: "accepted",
        assets: [{ recipe: RECIPE, status, zoho_schedule_reference: REF }],
      };
      const plan = planConfirmedLiveLog(idea, RECIPE, liveReport(), FACEBOOK_PRIMARY);
      assert.equal(plan.ok, true);
      if (!plan.ok) return;
      assert.equal(plan.nextStatus, status);
    }
  });
});

// === confirmZohoPostLive — orchestration shell, reuses /log-post's own write ============================

async function withLedger(seed: unknown, fn: (ledgerPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-confirmed-live-"));
  const ledgerPath = join(dir, "ledger.json");
  try {
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(ledgerPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("confirmZohoPostLive — the shell, writing through the SAME path /log-post uses", () => {
  it("AC1: has the SAME ledger effect as an equivalent /log-post call (byte-identical Asset write)", async () => {
    const seedA = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }] }] };
    const seedB = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };

    const dirA = await mkdtemp(join(tmpdir(), "og-confirmed-live-a-"));
    const dirB = await mkdtemp(join(tmpdir(), "og-confirmed-live-b-"));
    const ledgerA = join(dirA, "ledger.json");
    const ledgerB = join(dirB, "ledger.json");
    const profileA = join(dirA, "brand-profile.yaml");
    await writeFile(ledgerA, JSON.stringify(seedA, null, 2) + "\n", "utf8");
    await writeFile(ledgerB, JSON.stringify(seedB, null, 2) + "\n", "utf8");
    await writeFile(
      profileA,
      "channel:\n  - platform: facebook\n    url: https://www.facebook.com/straw-motion\n    primary: true\n",
      "utf8",
    );

    try {
      await confirmZohoPostLive("straw-motion", "idea-A", RECIPE, liveReport(), {
        ledgerPath: ledgerA,
        brandProfilePath: profileA,
      });
      await logPostCommand("straw-motion", "idea-A", RECIPE, LIVE_URL, LIVE_AT, { ledgerPath: ledgerB });

      const assetsA = await loadIdeaAssets("idea-A", ledgerA);
      const assetsB = await loadIdeaAssets("idea-A", ledgerB);
      const assetA = assetsA!.find((a) => a.recipe === RECIPE)!;
      const assetB = assetsB!.find((a) => a.recipe === RECIPE)!;

      assert.equal(assetA.status, assetB.status);
      assert.equal(assetA.post_url, assetB.post_url);
      assert.equal(assetA.posted_at, assetB.posted_at);
      assert.equal(assetA.status, "posted");
      assert.equal(assetA.post_url, LIVE_URL);
    } finally {
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it("with TWO Assets, writes onto ONLY the named Recipe's Asset — the sibling is untouched", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-confirmed-live-sibling-"));
    const ledgerPath = join(dir, "ledger.json");
    const profilePath = join(dir, "brand-profile.yaml");
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [
            { recipe: RECIPE, status: "produced", zoho_schedule_reference: REF },
            { recipe: RECIPE_2, status: "produced" },
          ],
        },
      ],
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await writeFile(
      profilePath,
      "channel:\n  - platform: facebook\n    url: https://www.facebook.com/straw-motion\n    primary: true\n",
      "utf8",
    );
    try {
      await confirmZohoPostLive("straw-motion", "idea-A", RECIPE, liveReport(), {
        ledgerPath,
        brandProfilePath: profilePath,
      });
      const assets = await loadIdeaAssets("idea-A", ledgerPath);
      const named = assets!.find((a) => a.recipe === RECIPE)!;
      const other = assets!.find((a) => a.recipe === RECIPE_2)!;
      assert.equal(named.status, "posted");
      assert.equal(named.post_url, LIVE_URL);
      assert.equal(other.status, "produced");
      assert.equal(other.post_url, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC4: an Asset with no stored reference is refused and writes nothing to the ledger", async () => {
    const seed = { ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await withLedger(seed, async (ledgerPath) => {
      const before = await readFile(ledgerPath, "utf8");
      const out = await confirmZohoPostLive("straw-motion", "idea-A", RECIPE, liveReport(), {
        ledgerPath,
        brandProfilePath: join(tmpdir(), "og-confirmed-live-missing-profile.yaml"),
      });
      assert.match(out, /no stored Zoho schedule reference/i);
      assert.match(out, /never auto-logged/i);
      const after = await readFile(ledgerPath, "utf8");
      assert.equal(after, before, "an Asset with no stored reference must never be auto-logged");
    });
  });

  it("AC3: a still-pending report writes nothing to the ledger and says so clearly", async () => {
    const seed = {
      ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }] }],
    };
    const dir = await mkdtemp(join(tmpdir(), "og-confirmed-live-pending-"));
    const ledgerPath = join(dir, "ledger.json");
    const profilePath = join(dir, "brand-profile.yaml");
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await writeFile(
      profilePath,
      "channel:\n  - platform: facebook\n    url: https://www.facebook.com/straw-motion\n    primary: true\n",
      "utf8",
    );
    try {
      const before = await readFile(ledgerPath, "utf8");
      const report: ZohoScheduleReport = { reference: REF, statuses: [{ platform: "facebook", status: "pending" }] };
      const out = await confirmZohoPostLive("straw-motion", "idea-A", RECIPE, report, { ledgerPath, brandProfilePath: profilePath });
      assert.match(out, /not yet live/i);
      assert.match(out, /pending/i);
      const after = await readFile(ledgerPath, "utf8");
      assert.equal(after, before, "a still-pending report must never write the ledger");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC2: a reference-mismatched report writes nothing and says so clearly", async () => {
    const seed = {
      ideas: [{ id: "idea-A", status: "accepted", assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }] }],
    };
    const dir = await mkdtemp(join(tmpdir(), "og-confirmed-live-mismatch-"));
    const ledgerPath = join(dir, "ledger.json");
    const profilePath = join(dir, "brand-profile.yaml");
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await writeFile(
      profilePath,
      "channel:\n  - platform: facebook\n    url: https://www.facebook.com/straw-motion\n    primary: true\n",
      "utf8",
    );
    try {
      const before = await readFile(ledgerPath, "utf8");
      const out = await confirmZohoPostLive("straw-motion", "idea-A", RECIPE, liveReport("wrong-ref"), {
        ledgerPath,
        brandProfilePath: profilePath,
      });
      assert.match(out, /different Zoho reference/i);
      const after = await readFile(ledgerPath, "utf8");
      assert.equal(after, before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes the named Asset's output-bundle post.json on success (issue #112, shared with /log-post)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "og-confirmed-live-bundle-"));
    const bundleDir = join(dir, "idea-01.news-carousel.output");
    await mkdir(bundleDir, { recursive: true });
    const ledgerPath = join(dir, "ledger.json");
    const profilePath = join(dir, "brand-profile.yaml");
    const seed = {
      ideas: [
        {
          id: "idea-A",
          status: "accepted",
          assets: [
            {
              recipe: RECIPE,
              status: "produced",
              zoho_schedule_reference: REF,
              asset_paths: [join(bundleDir, "1.jpg")],
            },
          ],
        },
      ],
    };
    await writeFile(ledgerPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await writeFile(
      profilePath,
      "channel:\n  - platform: facebook\n    url: https://www.facebook.com/straw-motion\n    primary: true\n",
      "utf8",
    );
    try {
      await confirmZohoPostLive("straw-motion", "idea-A", RECIPE, liveReport(), { ledgerPath, brandProfilePath: profilePath });
      const postJson = JSON.parse(await readFile(join(bundleDir, "post.json"), "utf8")) as { post_url: string | null };
      assert.equal(postJson.post_url, LIVE_URL);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not touch another Brand's ledger", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "og-confirmed-live-brands-"));
    const strawDir = join(tmpRoot, "straw-motion");
    const acmeDir = join(tmpRoot, "acme");
    await mkdir(strawDir, { recursive: true });
    await mkdir(acmeDir, { recursive: true });
    const strawLedger = join(strawDir, "ledger.json");
    const strawProfile = join(strawDir, "brand-profile.yaml");
    const acmeLedger = join(acmeDir, "ledger.json");
    const acmeSeed = { ideas: [{ id: "shared-id", status: "accepted", assets: [{ recipe: RECIPE, status: "produced" }] }] };
    await writeFile(strawLedger, JSON.stringify({ ideas: [{ id: "shared-id", status: "accepted", assets: [{ recipe: RECIPE, status: "produced", zoho_schedule_reference: REF }] }] }, null, 2) + "\n", "utf8");
    await writeFile(strawProfile, "channel:\n  - platform: facebook\n    url: https://www.facebook.com/straw-motion\n    primary: true\n", "utf8");
    await writeFile(acmeLedger, JSON.stringify(acmeSeed, null, 2) + "\n", "utf8");
    try {
      const before = await readFile(acmeLedger, "utf8");
      await confirmZohoPostLive("straw-motion", "shared-id", RECIPE, liveReport(), { brandsRoot: tmpRoot });
      const after = await readFile(acmeLedger, "utf8");
      assert.equal(after, before, "acme's ledger must be untouched by a straw-motion confirmed-live check");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
