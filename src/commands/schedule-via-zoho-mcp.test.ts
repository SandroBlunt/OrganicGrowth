import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scheduleViaZohoMcpCommand } from "./schedule-via-zoho-mcp.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import { FakeMediaHost } from "../media-host/fixtures/fake-media-host.ts";
import { FakeZohoSchedulePort } from "../schedule-batch/fixtures/fake-zoho-schedule-port.ts";

const BRAND = "straw-motion";
const FORMAT = "unhypped-news";
const RUN = "2026-W32";
const NOW = "2026-08-01T00:00:00.000Z"; // safely > 1h before any derived start-date slot below
const START_DATE = "2026-08-04";
const IDEA = "idea-2026-W32-01";

const ZOHO_PROFILE_YAML = [
  "zoho:",
  "  brands:",
  '    - name: "Straw Motion"',
  '      timezone: "Europe/Berlin"',
  "      channels:",
  "        - platform: facebook",
  "          label: Facebook",
  "        - platform: instagram",
  "          label: Instagram",
  "        - platform: tiktok",
  "          label: TikTok",
  '    - name: "Straw Motion Personal"',
  '      timezone: "Europe/Berlin"',
  "      channels:",
  "        - platform: linkedin",
  "          label: LinkedInProfile",
  "        - platform: x",
  "          label: X",
  "",
].join("\n");

const NOT_CONFIGURED_PROFILE_YAML = "niche: test\n";

const SLIDE_ROLES = ["hook", "then", "shift", "proof", "different", "next", "cta"];

function fullCopy(ideaLabel: string) {
  return {
    caption: `${ideaLabel} primary caption`,
    hashtags: ["#AInews"],
    variants: [
      { platform: "facebook", caption: `${ideaLabel} Facebook body.`, hashtags: ["#AInews"] },
      { platform: "instagram", caption: `${ideaLabel} Instagram body.`, hashtags: ["#AInews"] },
      { platform: "tiktok", caption: `${ideaLabel} TikTok body.`, hashtags: ["#AInews"] },
      { platform: "linkedin", caption: `${ideaLabel} LinkedIn body.`, hashtags: ["#AInews"] },
      { platform: "x", caption: `${ideaLabel} X body.`, hashtags: ["#AInews"] },
    ],
  };
}

interface Fixture {
  readonly root: string;
  readonly ledgerPath: string;
  readonly brandProfilePath: string;
  readonly runFolder: string;
}

async function writeOutputBundleSlides(runFolder: string, ideaShortName: string): Promise<string[]> {
  const dir = join(runFolder, `${ideaShortName}.news-carousel.output`);
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < SLIDE_ROLES.length; i++) {
    const path = join(dir, `${i}-${SLIDE_ROLES[i]}.png`);
    await writeFile(path, Buffer.from(`fake-png-bytes-${ideaShortName}-${i}`));
    paths.push(path);
  }
  return paths;
}

async function withFixture(profileYaml: string, fn: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-schedule-via-mcp-"));
  try {
    const ledgerPath = join(root, "ledger.json");
    const brandProfilePath = join(root, "brand-profile.yaml");
    const runFolder = join(root, "ideas", FORMAT, RUN);
    await mkdir(runFolder, { recursive: true });
    await writeFile(brandProfilePath, profileYaml, "utf8");
    await fn({ root, ledgerPath, brandProfilePath, runFolder });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeLedger(path: string, ideas: readonly unknown[]): Promise<void> {
  await writeFile(path, JSON.stringify({ ideas }, null, 2) + "\n", "utf8");
}

async function seedOneEligibleIdea(fx: Fixture): Promise<void> {
  const slidePaths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
  await writeLedger(fx.ledgerPath, [
    {
      id: IDEA,
      title: "AI got cheaper this week",
      format: FORMAT,
      run: RUN,
      status: "accepted",
      assets: [
        { recipe: "news-carousel", status: "produced", asset_paths: slidePaths, copy: fullCopy("idea-01") },
      ],
    },
  ]);
}

describe("scheduleViaZohoMcpCommand — AC1: no Zoho write-tool before approval (issue #163)", () => {
  it("approved: false refuses immediately — zero port calls, zero Media Host calls, ledger untouched", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      await seedOneEligibleIdea(fx);
      const port = new FakeZohoSchedulePort();
      const mediaHost = new FakeMediaHost();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        mediaHost,
        port,
        approved: false,
      });

      assert.match(output, /not yet approved/i);
      assert.equal(port.calls.length, 0);
      assert.equal(mediaHost.convertCalls.length, 0);
      assert.equal(mediaHost.uploadCalls.length, 0);

      const assets = await loadIdeaAssets(IDEA, fx.ledgerPath);
      assert.equal(assets![0]!.scheduled_at, undefined);
    });
  });
});

describe("scheduleViaZohoMcpCommand — AC4: Zoho MCP unavailable offers the CSV fallback, nothing else runs (issue #163)", () => {
  it("no port injected -> the fallback message, before ANY ledger read or Media Host call", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      await seedOneEligibleIdea(fx);
      const mediaHost = new FakeMediaHost();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        mediaHost,
        approved: true, // even WITH approval, no port means MCP is unavailable
      });

      assert.match(output, /Zoho MCP is unavailable/);
      assert.match(output, /npm run export-schedule/);
      assert.match(output, /WHOLE remaining step is the Operator's own, by hand/);
      assert.equal(mediaHost.convertCalls.length, 0);
    });
  });
});

describe("scheduleViaZohoMcpCommand — happy path (issue #163)", () => {
  it("schedules every eligible Asset's non-X Channels, hosts media once, and stamps scheduled_at + zoho_schedule_reference", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      await seedOneEligibleIdea(fx);
      const port = new FakeZohoSchedulePort();
      const mediaHost = new FakeMediaHost();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        mediaHost,
        port,
        approved: true,
      });

      assert.match(output, /Scheduled:/);
      assert.match(output, new RegExp(IDEA));

      // --- Media hosted once, 7 slides, never touching X's own 4-slide CSV limit (MCP has no such cap) ---
      assert.equal(mediaHost.convertCalls.length, 7);
      assert.equal(mediaHost.uploadCalls.length, 7);

      // --- The Zoho port never saw "x" — only facebook/instagram/tiktok/linkedin ---
      const platformsSeen = port.calls
        .filter((c) => c.kind !== "upload")
        .map((c) => (c.kind === "validate" || c.kind === "schedule" ? c.request.target.platform : ""));
      assert.ok(!platformsSeen.includes("x"));
      assert.deepEqual([...new Set(platformsSeen)].sort(), ["facebook", "instagram", "linkedin", "tiktok"]);

      // --- Sequence: every asset's uploads happen before its validate/schedule calls ---
      const kinds = port.calls.map((c) => c.kind);
      assert.equal(kinds.slice(0, 7).every((k) => k === "upload"), true);

      // --- Ledger: scheduled_at + zoho_schedule_reference recorded, status unchanged ---
      const assets = await loadIdeaAssets(IDEA, fx.ledgerPath);
      const asset = assets![0]!;
      assert.equal(asset.status, "produced");
      assert.ok(asset.scheduled_at !== undefined);
      assert.equal(new Date(asset.scheduled_at!).toISOString(), asset.scheduled_at);
      assert.ok(asset.zoho_schedule_reference !== undefined);
      assert.equal(Array.isArray(asset.zoho_schedule_reference), true);
      assert.equal((asset.zoho_schedule_reference as readonly string[]).length, 4); // fb/ig/tiktok/linkedin
    });
  });

  it("a Brand with no Zoho config refuses clearly, no Media Host or port calls", async () => {
    await withFixture(NOT_CONFIGURED_PROFILE_YAML, async (fx) => {
      await seedOneEligibleIdea(fx);
      const port = new FakeZohoSchedulePort();
      const mediaHost = new FakeMediaHost();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        mediaHost,
        port,
        approved: true,
      });

      assert.match(output, /not configured/i);
      assert.equal(port.calls.length, 0);
      assert.equal(mediaHost.convertCalls.length, 0);
    });
  });

  it("an empty run reports nothing eligible, no port calls", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      await writeLedger(fx.ledgerPath, []);
      const port = new FakeZohoSchedulePort();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        port,
        approved: true,
      });

      assert.match(output, /No eligible Assets/);
      assert.equal(port.calls.length, 0);
    });
  });

  it("a preflight problem (missing Copy variant) refuses the whole run, zero port/Media Host calls", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const slidePaths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: IDEA,
          title: "Missing variant",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            {
              recipe: "news-carousel",
              status: "produced",
              asset_paths: slidePaths,
              copy: { caption: "primary", hashtags: [] }, // no `variants` at all
            },
          ],
        },
      ]);
      const port = new FakeZohoSchedulePort();
      const mediaHost = new FakeMediaHost();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        mediaHost,
        port,
        approved: true,
      });

      assert.match(output, /SCHEDULING REFUSED/);
      assert.equal(port.calls.length, 0);
      assert.equal(mediaHost.convertCalls.length, 0);

      const assets = await loadIdeaAssets(IDEA, fx.ledgerPath);
      assert.equal(assets![0]!.scheduled_at, undefined);
    });
  });

  it("a schedule time inside the 1-hour lead window refuses, zero port calls", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      await seedOneEligibleIdea(fx);
      const port = new FakeZohoSchedulePort();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => "2026-08-04T14:59:00.000Z", // minutes before the derived 15:06 Berlin slot
        port,
        approved: true,
      });

      assert.match(output, /lead-window|1 hour/i);
      assert.equal(port.calls.length, 0);
    });
  });

  it("a re-run against an already-scheduled Asset finds nothing eligible — never double-schedules", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const slidePaths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: IDEA,
          title: "Already scheduled",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            {
              recipe: "news-carousel",
              status: "produced",
              asset_paths: slidePaths,
              copy: fullCopy("idea-01"),
              scheduled_at: "2026-08-03T09:00:00.000Z",
            },
          ],
        },
      ]);
      const port = new FakeZohoSchedulePort();

      const output = await scheduleViaZohoMcpCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        now: () => NOW,
        port,
        approved: true,
      });

      assert.match(output, /No eligible Assets/);
      assert.equal(port.calls.length, 0);
    });
  });
});
