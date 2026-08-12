import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportScheduleCommand, main as exportScheduleMain, parsePostsPerDayArg } from "./export-schedule.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import { FakeMediaHost } from "../media-host/fixtures/fake-media-host.ts";
import { deriveScheduleSlots } from "../schedule-batch/schedule.ts";

const BRAND = "straw-motion";
const FORMAT = "unhypped-news";
const RUN = "2026-W32";
const NOW = "2026-08-01T00:00:00.000Z"; // safely > 1h before any derived start-date slot below
const START_DATE = "2026-08-04";

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

function fullCopy(ideaLabel: string, opts: { linkedInUnresolved?: readonly string[] } = {}) {
  return {
    caption: `${ideaLabel} primary caption`,
    hashtags: ["#AInews"],
    variants: [
      { platform: "facebook", caption: `${ideaLabel} Facebook body.`, hashtags: ["#AInews"] },
      { platform: "instagram", caption: `${ideaLabel} Instagram body.`, hashtags: ["#AInews"] },
      { platform: "tiktok", caption: `${ideaLabel} TikTok body.`, hashtags: ["#AInews"] },
      {
        platform: "linkedin",
        caption: `${ideaLabel} LinkedIn body.`,
        hashtags: ["#AInews"],
        ...(opts.linkedInUnresolved !== undefined && opts.linkedInUnresolved.length > 0
          ? { unresolvedMentions: opts.linkedInUnresolved }
          : {}),
      },
      { platform: "x", caption: `${ideaLabel} X body.`, hashtags: ["#AInews"] },
    ],
  };
}

interface Fixture {
  readonly root: string;
  readonly ledgerPath: string;
  readonly brandProfilePath: string;
  readonly ideasRoot: string; // format-namespaced (mirrors formatIdeasRoot's own output)
  readonly runFolder: string;
}

/** Write a fixture run folder's 7-slide output bundle for one Idea's news-carousel Asset, and return
 *  the durable local `asset_paths` the ledger fixture should record — mirroring the real pipeline's
 *  own `.output/` bundle layout exactly. */
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

async function withFixture(
  profileYaml: string,
  fn: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-export-schedule-"));
  try {
    const ledgerPath = join(root, "ledger.json");
    const brandProfilePath = join(root, "brand-profile.yaml");
    const ideasRoot = join(root, "ideas", FORMAT);
    const runFolder = join(ideasRoot, RUN);
    await mkdir(runFolder, { recursive: true });
    await writeFile(brandProfilePath, profileYaml, "utf8");
    await fn({ root, ledgerPath, brandProfilePath, ideasRoot, runFolder });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeLedger(path: string, ideas: readonly unknown[]): Promise<void> {
  await writeFile(path, JSON.stringify({ ideas }, null, 2) + "\n", "utf8");
}

describe("/export-schedule — run-scoped Zoho bulk export (issue #145)", () => {
  it("exports a happy-path run: two CSVs (byte-exact dialect), a manifest, readable scheduled_at, and the expected Media Host calls — original PNGs untouched", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      const idea01Bytes = await Promise.all(idea01Paths.map((p) => readFile(p)));

      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "AI got cheaper this week",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            {
              recipe: "news-carousel",
              status: "produced",
              asset_paths: idea01Paths,
              copy: fullCopy("idea-01", { linkedInUnresolved: ["OpenAI", "Anthropic"] }),
            },
          ],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      // --- Report mentions both files + the manifest, and the stripped LinkedIn note ---
      assert.match(output, /zoho-main\.csv/);
      assert.match(output, /zoho-linkedin-x\.csv/);
      assert.match(output, /zoho-manifest\.json/);
      assert.match(output, /Unresolved linkedin mentions/);

      // --- The two CSVs exist, in the run folder, with the live-verified dialect ---
      const mainCsv = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      const linkedinXCsv = await readFile(join(fx.runFolder, "zoho-linkedin-x.csv"), "utf8");

      const mainRows = mainCsv.split("\n").filter((l) => l.length > 0);
      assert.equal(mainRows.length, 3); // Facebook, Instagram, TikTok
      // deriveScheduleSlots' first rotation slot is 09:06 America/New_York (EDT, -4h) on the start
      // date, which is 15:06 in Europe/Berlin (CEST, +2h) — this Zoho Social Brand's own clock.
      assert.ok(mainRows[0]!.startsWith("08/04/2026 15:06,"));
      assert.ok(mainRows[0]!.includes('"Facebook"'));
      assert.ok(mainRows[0]!.includes("6-cta.jpg")); // full 7 slides, converted to .jpg
      assert.ok(!mainRows[0]!.includes(".png"));
      assert.ok(mainCsv.endsWith("\n")); // trailing newline, no header row anywhere
      assert.ok(!mainCsv.includes("Schedule Time")); // no header row

      const linkedinRow = linkedinXCsv.split("\n").find((l) => l.includes("LinkedInProfile"))!;
      const xRow = linkedinXCsv.split("\n").find((l) => l.includes('"X"'))!;
      assert.ok(linkedinRow.includes("6-cta.jpg")); // LinkedIn carries all 7
      assert.ok(!linkedinRow.includes("Unresolved")); // the note never leaks into the caption
      assert.ok(!xRow.includes("4-different.jpg")); // X carries only the first 4
      assert.ok(xRow.includes("3-proof.jpg"));

      // --- The manifest exists and carries the cleanup contract ---
      const manifestRaw = await readFile(join(fx.runFolder, "zoho-manifest.json"), "utf8");
      const manifest = JSON.parse(manifestRaw) as {
        readonly ideas: readonly { readonly idea: string; readonly s3_keys: readonly string[]; readonly urls: readonly string[] }[];
        readonly stripped_notes: readonly string[];
      };
      assert.equal(manifest.ideas.length, 1);
      assert.equal(manifest.ideas[0]!.idea, "idea-2026-W32-01");
      assert.equal(manifest.ideas[0]!.s3_keys.length, 7);
      assert.equal(manifest.ideas[0]!.urls.length, 7);
      assert.match(manifest.stripped_notes[0]!, /OpenAI, Anthropic/);

      // --- scheduled_at is readable back through the store; status is unchanged (still "produced") ---
      const assets = await loadIdeaAssets("idea-2026-W32-01", fx.ledgerPath);
      assert.equal(assets!.length, 1);
      assert.equal(assets![0]!.status, "produced");
      assert.ok(assets![0]!.scheduled_at !== undefined);
      assert.equal(new Date(assets![0]!.scheduled_at!).toISOString(), assets![0]!.scheduled_at);
      // --- This is the CSV/S3 FALLBACK path (ADR-0020, issue #163) — it never writes the MCP-only
      //     zoho_schedule_reference field; a CSV-exported Asset is confirmed live via /log-post, never
      //     auto-logged by src/schedule-batch/confirmed-live.ts (which requires that stored reference). ---
      assert.equal(assets![0]!.zoho_schedule_reference, undefined);

      // --- The Media Host recorded exactly the expected calls: 7 converts + 7 uploads, one per slide ---
      assert.equal(mediaHost.convertCalls.length, 7);
      assert.equal(mediaHost.uploadCalls.length, 7);
      assert.equal(mediaHost.convertCalls[0]!.sourcePath, idea01Paths[0]);
      assert.ok(mediaHost.uploadCalls[0]!.key.startsWith("straw-motion/2026-W32/idea-01/"));
      assert.ok(mediaHost.uploadCalls[0]!.key.endsWith(".jpg"));

      // --- The original PNGs are byte-for-byte untouched ---
      const afterBytes = await Promise.all(idea01Paths.map((p) => readFile(p)));
      for (let i = 0; i < idea01Bytes.length; i++) {
        assert.deepEqual(afterBytes[i], idea01Bytes[i]);
      }
    });
  });

  it("skips a video (non-news-carousel) Asset with a note, and only exports the eligible news-carousel one", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "Has both a Reel and a carousel",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            { recipe: "news-carousel", status: "produced", asset_paths: idea01Paths, copy: fullCopy("idea-01") },
            { recipe: "character-explainer-with-cast", status: "produced" },
          ],
        },
      ]);

      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost: new FakeMediaHost(),
      });

      assert.match(output, /character-explainer-with-cast/);
      assert.match(output, /images-only/);
      const mainCsv = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      assert.equal(mainCsv.split("\n").filter((l) => l.length > 0).length, 3);
    });
  });

  it("stops with a clear message and writes nothing for an empty run (no eligible Assets at all)", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      await writeLedger(fx.ledgerPath, []);
      const mediaHost = new FakeMediaHost();

      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      assert.match(output, /No eligible Assets/);
      const entries = await readdir(fx.runFolder).catch(() => []);
      assert.deepEqual(entries, []);
      assert.equal(mediaHost.convertCalls.length, 0);
      assert.equal(mediaHost.uploadCalls.length, 0);
    });
  });

  it("rejects a path-traversal Run id BEFORE any path join or I/O (issue #172)", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "AI got cheaper this week",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            { recipe: "news-carousel", status: "produced", asset_paths: idea01Paths, copy: fullCopy("idea-01") },
          ],
        },
      ]);
      const mediaHost = new FakeMediaHost();

      await assert.rejects(
        exportScheduleCommand(BRAND, FORMAT, "../../evil", START_DATE, {
          ledgerPath: fx.ledgerPath,
          brandProfilePath: fx.brandProfilePath,
          ideasRoot: fx.ideasRoot,
          now: () => NOW,
          mediaHost,
        }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("../../evil"), "error must name the offending Run id");
          return true;
        },
      );
      assert.equal(mediaHost.convertCalls.length, 0, "no media may be hosted before the Run id is validated");
      assert.equal(mediaHost.uploadCalls.length, 0);
    });
  });

  it("refuses loudly and writes nothing when the Brand has no Zoho Social Brand config", async () => {
    await withFixture(NOT_CONFIGURED_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "T",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: idea01Paths, copy: fullCopy("idea-01") }],
        },
      ]);

      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost: new FakeMediaHost(),
      });

      assert.match(output, /not configured/);
      // Only the PRE-EXISTING output bundle directory — the command wrote no new file.
      const entries = await readdir(fx.runFolder).catch(() => []);
      assert.deepEqual(entries, ["idea-01.news-carousel.output"]);
    });
  });

  it("refuses the WHOLE export loudly, writing nothing, hosting nothing, stamping nothing, when eligible Assets fail preflight — a missing slide, no composed Copy, a missing platform variant, and an over-280 X variant (issue #146)", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01"); // missing slide
      const idea02Paths = await writeOutputBundleSlides(fx.runFolder, "idea-02"); // no composed Copy
      const idea03Paths = await writeOutputBundleSlides(fx.runFolder, "idea-03"); // missing platform variant
      const idea04Paths = await writeOutputBundleSlides(fx.runFolder, "idea-04"); // over-280 X variant

      const missingVariantCopy = fullCopy("idea-03");
      const idea03Copy = {
        ...missingVariantCopy,
        variants: missingVariantCopy.variants.filter((v) => v.platform !== "tiktok"),
      };

      const overCapCopy = fullCopy("idea-04");
      const idea04Copy = {
        ...overCapCopy,
        variants: overCapCopy.variants.map((v) =>
          v.platform === "x" ? { ...v, caption: "A".repeat(290) } : v,
        ),
      };

      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "Missing a slide",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            {
              recipe: "news-carousel",
              status: "produced",
              asset_paths: idea01Paths.slice(0, 3),
              copy: fullCopy("idea-01"),
            },
          ],
        },
        {
          id: "idea-2026-W32-02",
          title: "No composed Copy",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: idea02Paths }],
        },
        {
          id: "idea-2026-W32-03",
          title: "Missing a platform variant",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            { recipe: "news-carousel", status: "produced", asset_paths: idea03Paths, copy: idea03Copy },
          ],
        },
        {
          id: "idea-2026-W32-04",
          title: "Over-280 X variant",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            { recipe: "news-carousel", status: "produced", asset_paths: idea04Paths, copy: idea04Copy },
          ],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      // --- Every failure mode is named, against the RIGHT Asset ---
      assert.match(output, /EXPORT REFUSED/);
      assert.match(output, /idea-2026-W32-01/);
      assert.match(output, /expected exactly 7 downloaded slides, found 3/);
      assert.match(output, /idea-2026-W32-02/);
      assert.match(output, /no composed Copy/);
      assert.match(output, /idea-2026-W32-03/);
      assert.match(output, /"tiktok"/);
      assert.match(output, /idea-2026-W32-04/);
      assert.match(output, /280/);

      // --- No partial state: only the pre-existing output-bundle dirs, nothing new written ---
      const entries = (await readdir(fx.runFolder)).sort();
      assert.deepEqual(entries, [
        "idea-01.news-carousel.output",
        "idea-02.news-carousel.output",
        "idea-03.news-carousel.output",
        "idea-04.news-carousel.output",
      ]);

      // --- No media hosted ---
      assert.equal(mediaHost.convertCalls.length, 0);
      assert.equal(mediaHost.uploadCalls.length, 0);

      // --- No scheduled_at stamped on any Asset ---
      for (const ideaId of [
        "idea-2026-W32-01",
        "idea-2026-W32-02",
        "idea-2026-W32-03",
        "idea-2026-W32-04",
      ]) {
        const assets = await loadIdeaAssets(ideaId, fx.ledgerPath);
        assert.equal(assets![0]!.scheduled_at, undefined);
      }
    });
  });

  it("refuses the WHOLE export loudly, writing nothing, when a schedule time is less than 1 hour away", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "T",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: idea01Paths, copy: fullCopy("idea-01") }],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      // "now" is set to exactly 5 minutes before the FIRST slot deriveScheduleSlots(START_DATE, 1)
      // would produce (the same fixed instant proven in schedule.test.ts) — well within the 1-hour
      // lead requirement's violation range, regardless of the host machine's real wall-clock time.
      const firstSlotUtcMs = Date.UTC(2026, 7, 4, 13, 6, 0); // 09:06 America/New_York on 2026-08-04
      const almostNow = () => new Date(firstSlotUtcMs - 5 * 60 * 1000).toISOString();

      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: almostNow,
        mediaHost,
      });

      assert.match(output, /EXPORT REFUSED/);
      assert.match(output, /at least 1 hour/);
      const entries = await readdir(fx.runFolder).catch(() => []);
      assert.deepEqual(entries, ["idea-01.news-carousel.output"]); // only the pre-existing bundle dir
      assert.equal(mediaHost.uploadCalls.length, 0);
      const assets = await loadIdeaAssets("idea-2026-W32-01", fx.ledgerPath);
      assert.equal(assets![0]!.scheduled_at, undefined);
    });
  });

  it("re-running the export after a successful one schedules nothing twice", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "T",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: idea01Paths, copy: fullCopy("idea-01") }],
        },
      ]);

      const mediaHost = new FakeMediaHost();
      const first = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });
      assert.match(first, /Wrote/);

      const mainCsvAfterFirst = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      const assetsAfterFirst = await loadIdeaAssets("idea-2026-W32-01", fx.ledgerPath);
      const scheduledAtAfterFirst = assetsAfterFirst![0]!.scheduled_at;

      const second = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      assert.match(second, /No eligible Assets/);
      const mainCsvAfterSecond = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      assert.equal(mainCsvAfterSecond, mainCsvAfterFirst); // untouched by the no-op second run
      const assetsAfterSecond = await loadIdeaAssets("idea-2026-W32-01", fx.ledgerPath);
      assert.equal(assetsAfterSecond![0]!.scheduled_at, scheduledAtAfterFirst); // unchanged
      // No new Media Host calls on the second, no-op run.
      assert.equal(mediaHost.convertCalls.length, 7);
      assert.equal(mediaHost.uploadCalls.length, 7);
    });
  });

  it("runs cleanup FIRST, automatically: a stale prior run's hosted media is removed before this export does anything (issue #147)", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      // A PRIOR run's manifest, sitting elsewhere under this Brand's ideas tree, scheduled more than 1
      // day before NOW — due for cleanup.
      const staleRunFolder = join(fx.ideasRoot, "2026-W30");
      await mkdir(staleRunFolder, { recursive: true });
      const staleManifest = {
        batch: "unhypped-news-2026-W30",
        brand: BRAND,
        format: FORMAT,
        run: "2026-W30",
        created_at: "2026-07-18T00:00:00.000Z",
        csv_files: ["zoho-main.csv"],
        stripped_notes: [],
        ideas: [
          {
            idea: "idea-2026-W30-01",
            recipe: "news-carousel",
            scheduled_at: "2026-07-20T00:00:00.000Z", // days before NOW — well past the 1-day cutoff
            s3_keys: ["straw-motion/2026-W30/idea-01/0-hook.jpg"],
            urls: ["https://fake-media-host.example/straw-motion/2026-W30/idea-01/0-hook.jpg"],
            rows: {},
            stripped_notes: [],
          },
        ],
      };
      await writeFile(
        join(staleRunFolder, "zoho-manifest.json"),
        JSON.stringify(staleManifest, null, 2) + "\n",
        "utf8",
      );

      await writeLedger(fx.ledgerPath, []); // this run itself has no eligible Assets — isolates the assertion

      const mediaHost = new FakeMediaHost();
      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      assert.match(output, /No eligible Assets/); // this run's own export still ran as normal
      assert.deepEqual(mediaHost.deleteCalls, ["straw-motion/2026-W30/idea-01/0-hook.jpg"]);

      const reread = JSON.parse(
        await readFile(join(staleRunFolder, "zoho-manifest.json"), "utf8"),
      ) as { readonly ideas: readonly { readonly cleaned_at?: string }[] };
      assert.equal(reread.ideas[0]!.cleaned_at, NOW);
    });
  });

  it("auto-cleanup never touches a prior run's manifest entry scheduled less than or exactly 1 day ago, or in the future", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const otherRunFolder = join(fx.ideasRoot, "2026-W31");
      await mkdir(otherRunFolder, { recursive: true });
      const notDueManifest = {
        batch: "unhypped-news-2026-W31",
        brand: BRAND,
        format: FORMAT,
        run: "2026-W31",
        created_at: "2026-07-28T00:00:00.000Z",
        csv_files: ["zoho-main.csv"],
        stripped_notes: [],
        ideas: [
          {
            idea: "idea-2026-W31-01",
            recipe: "news-carousel",
            scheduled_at: "2026-07-31T12:00:00.000Z", // less than 1 day before NOW (2026-08-01T00:00Z)
            s3_keys: ["straw-motion/2026-W31/idea-01/0-hook.jpg"],
            urls: ["https://fake-media-host.example/straw-motion/2026-W31/idea-01/0-hook.jpg"],
            rows: {},
            stripped_notes: [],
          },
        ],
      };
      await writeFile(
        join(otherRunFolder, "zoho-manifest.json"),
        JSON.stringify(notDueManifest, null, 2) + "\n",
        "utf8",
      );

      await writeLedger(fx.ledgerPath, []);

      const mediaHost = new FakeMediaHost();
      await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
      });

      assert.equal(mediaHost.deleteCalls.length, 0);
      const reread = JSON.parse(
        await readFile(join(otherRunFolder, "zoho-manifest.json"), "utf8"),
      ) as { readonly ideas: readonly { readonly cleaned_at?: string }[] };
      assert.equal(reread.ideas[0]!.cleaned_at, undefined);
    });
  });

  it("posts-per-day (issue #171): 7 eligible Assets at postsPerDay=6 schedule across ceil(7/6)=2 days, rotation order preserved", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const ideaLabels = ["01", "02", "03", "04", "05", "06", "07"];
      const ideasWithPaths: { readonly ideaId: string; readonly paths: readonly string[] }[] = [];
      for (const label of ideaLabels) {
        const paths = await writeOutputBundleSlides(fx.runFolder, `idea-${label}`);
        ideasWithPaths.push({ ideaId: `idea-${RUN}-${label}`, paths });
      }

      await writeLedger(
        fx.ledgerPath,
        ideasWithPaths.map(({ ideaId, paths }, i) => ({
          id: ideaId,
          title: `Story ${ideaLabels[i]}`,
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [
            { recipe: "news-carousel", status: "produced", asset_paths: paths, copy: fullCopy(`idea-${ideaLabels[i]}`) },
          ],
        })),
      );

      const mediaHost = new FakeMediaHost();
      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost,
        postsPerDay: 6,
      });
      assert.match(output, /Wrote/);

      // --- Every Asset's scheduled_at matches EXACTLY what deriveScheduleSlots(startDate, 7, 6) would
      //     produce, in Idea-number order — the shared derivation, not a per-mechanism reimplementation.
      const expectedSlots = deriveScheduleSlots(START_DATE, 7, 6);
      for (let i = 0; i < ideasWithPaths.length; i++) {
        const assets = await loadIdeaAssets(ideasWithPaths[i]!.ideaId, fx.ledgerPath);
        assert.equal(assets![0]!.scheduled_at, new Date(expectedSlots[i]!.utcMs).toISOString());
      }

      // --- ceil(7/6) = 2 distinct calendar days across the 7 stamped Assets ---
      const allScheduledAt: string[] = [];
      for (const { ideaId } of ideasWithPaths) {
        const assets = await loadIdeaAssets(ideaId, fx.ledgerPath);
        allScheduledAt.push(assets![0]!.scheduled_at!);
      }
      const distinctDays = new Set(allScheduledAt.map((iso) => iso.slice(0, 10)));
      assert.equal(distinctDays.size, 2);
    });
  });

  it("omitting postsPerDay is byte-identical to the pre-#171 default (one Asset per calendar day)", async () => {
    await withFixture(ZOHO_PROFILE_YAML, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-2026-W32-01",
          title: "T",
          format: FORMAT,
          run: RUN,
          status: "accepted",
          assets: [{ recipe: "news-carousel", status: "produced", asset_paths: idea01Paths, copy: fullCopy("idea-01") }],
        },
      ]);

      const output = await exportScheduleCommand(BRAND, FORMAT, RUN, START_DATE, {
        ledgerPath: fx.ledgerPath,
        brandProfilePath: fx.brandProfilePath,
        ideasRoot: fx.ideasRoot,
        now: () => NOW,
        mediaHost: new FakeMediaHost(),
      });
      assert.match(output, /Wrote/);

      const mainCsv = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      // Same byte-exact schedule time this suite's very first happy-path test asserts (default 1/day).
      assert.ok(mainCsv.startsWith("08/04/2026 15:06,"));
    });
  });

  it("parsePostsPerDayArg (issue #171): omitted defaults to 1, a valid digit string parses, an invalid one is rejected", () => {
    assert.equal(parsePostsPerDayArg(undefined), 1);
    assert.equal(parsePostsPerDayArg("1"), 1);
    assert.equal(parsePostsPerDayArg("6"), 6);
    assert.equal(parsePostsPerDayArg("0"), null);
    assert.equal(parsePostsPerDayArg("-1"), null);
    assert.equal(parsePostsPerDayArg("1.5"), null);
    assert.equal(parsePostsPerDayArg("not-a-number"), null);
  });

  it("main() prints a usage error and exits non-zero for a malformed 5th (posts-per-day) argument", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      process.exitCode = 0;
      process.argv = ["node", "export-schedule.ts", BRAND, FORMAT, RUN, START_DATE, "not-a-number"];
      await exportScheduleMain();
      assert.notEqual(process.exitCode, 0);
      assert.match(stderrChunks.join(""), /posts-per-day must be a positive integer/);
    } finally {
      process.stderr.write = originalWrite;
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });

  it("main() prints a usage error and exits non-zero when any of the 4 arguments is missing", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      process.exitCode = 0;
      process.argv = ["node", "export-schedule.ts", BRAND, FORMAT];
      await exportScheduleMain();
      assert.notEqual(process.exitCode, 0);
      assert.match(stderrChunks.join(""), /usage: npm run export-schedule/);
    } finally {
      process.stderr.write = originalWrite;
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});

// ---------------------------------------------------------------------------
// Real (non-override) path against a daily-cadence Format — ADR-0023, issue #185.
//
// Every test above passes `options.ideasRoot` (a fixture-directory testing seam that bypasses the
// Format lookup entirely and stays flat). These tests instead exercise the REAL path: no `ideasRoot`
// override, so `exportScheduleCommand` loads the Format file itself (`loadFormat`) and derives
// `runFolder` via `runIdeasDirFor` — proving a daily-cadence Format's Run folder actually nests under
// its ISO week + weekday-DD-month leaf, and that a weekly-cadence Format's real path stays flat.
// ---------------------------------------------------------------------------

const DAILY_BRAND = "og-daily-export-test-brand";
const DAILY_FORMAT = "unhypped-daily-test";
const DAILY_RUN = "2026-08-12"; // Wednesday, ISO week 2026-W33 (ADR-0023's own worked example)

const DAILY_FORMAT_YAML = [
  'name: "Unhypped Daily Test"',
  'niche: "test"',
  'voice: "test voice"',
  "cadence: daily",
  "",
].join("\n");

const WEEKLY_FORMAT_YAML = [
  'name: "Unhypped Weekly Test"',
  'niche: "test"',
  'voice: "test voice"',
  "cadence: weekly",
  "",
].join("\n");

interface RealPathFixture {
  readonly brandsRoot: string;
  readonly runFolder: string;
}

async function withRealFormatFixture(
  brand: string,
  format: string,
  formatYaml: string,
  runFolder: (brandsRoot: string) => string,
  fn: (fixture: RealPathFixture) => Promise<void>,
): Promise<void> {
  const brandsRoot = await mkdtemp(join(tmpdir(), "og-export-schedule-real-"));
  try {
    const base = join(brandsRoot, brand);
    await mkdir(join(base, "formats"), { recursive: true });
    await writeFile(join(base, "formats", `${format}.yaml`), formatYaml, "utf8");
    await writeFile(join(base, "brand-profile.yaml"), ZOHO_PROFILE_YAML, "utf8");
    const folder = runFolder(brandsRoot);
    await mkdir(folder, { recursive: true });
    await fn({ brandsRoot, runFolder: folder });
  } finally {
    await rm(brandsRoot, { recursive: true, force: true });
  }
}

describe("/export-schedule — real (non-override) path resolves the Format's OWN cadence (ADR-0023, issue #185)", () => {
  it("a daily-cadence Format's Run folder nests under its ISO week + weekday-DD-month leaf", async () => {
    const expectedRunFolder = (brandsRoot: string) =>
      join(brandsRoot, DAILY_BRAND, "ideas", DAILY_FORMAT, "2026-W33", "wednesday-12-august");

    await withRealFormatFixture(DAILY_BRAND, DAILY_FORMAT, DAILY_FORMAT_YAML, expectedRunFolder, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");

      await writeFile(
        join(fx.brandsRoot, DAILY_BRAND, "ledger.json"),
        JSON.stringify(
          {
            ideas: [
              {
                id: `idea-${DAILY_RUN}-01`,
                title: "A daily story",
                format: DAILY_FORMAT,
                run: DAILY_RUN,
                status: "accepted",
                assets: [
                  {
                    recipe: "news-carousel",
                    status: "produced",
                    asset_paths: idea01Paths,
                    copy: fullCopy("idea-01"),
                  },
                ],
              },
            ],
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const output = await exportScheduleCommand(DAILY_BRAND, DAILY_FORMAT, DAILY_RUN, START_DATE, {
        brandsRoot: fx.brandsRoot,
        now: () => NOW,
        mediaHost: new FakeMediaHost(),
      });

      assert.match(output, /Wrote/);
      assert.match(output, new RegExp(fx.runFolder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      // The CSVs + manifest actually landed under the NESTED folder — never the flat ideas/<format>/<run>/.
      const mainCsv = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      assert.ok(mainCsv.length > 0);
      const manifestRaw = await readFile(join(fx.runFolder, "zoho-manifest.json"), "utf8");
      assert.ok(JSON.parse(manifestRaw));

      const flatRunFolder = join(fx.brandsRoot, DAILY_BRAND, "ideas", DAILY_FORMAT, DAILY_RUN);
      const flatEntries = await readdir(flatRunFolder).catch(() => null);
      assert.equal(flatEntries, null, "nothing should ever be written to the OLD flat shape");

      // --- scheduled_at is stamped correctly through the ledger, at the nested-resolved Idea ---
      const assets = await loadIdeaAssets(
        `idea-${DAILY_RUN}-01`,
        join(fx.brandsRoot, DAILY_BRAND, "ledger.json"),
      );
      assert.equal(assets!.length, 1);
      assert.ok(assets![0]!.scheduled_at !== undefined);
    });
  });

  it("a weekly-cadence Format's real Run folder stays flat — byte-identical to before ADR-0023", async () => {
    const weeklyBrand = "og-weekly-export-test-brand";
    const weeklyFormat = "unhypped-weekly-test";
    const weeklyRun = "2026-W32";
    const expectedRunFolder = (brandsRoot: string) =>
      join(brandsRoot, weeklyBrand, "ideas", weeklyFormat, weeklyRun);

    await withRealFormatFixture(weeklyBrand, weeklyFormat, WEEKLY_FORMAT_YAML, expectedRunFolder, async (fx) => {
      const idea01Paths = await writeOutputBundleSlides(fx.runFolder, "idea-01");

      await writeFile(
        join(fx.brandsRoot, weeklyBrand, "ledger.json"),
        JSON.stringify(
          {
            ideas: [
              {
                id: `idea-${weeklyRun}-01`,
                title: "A weekly story",
                format: weeklyFormat,
                run: weeklyRun,
                status: "accepted",
                assets: [
                  {
                    recipe: "news-carousel",
                    status: "produced",
                    asset_paths: idea01Paths,
                    copy: fullCopy("idea-01"),
                  },
                ],
              },
            ],
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const output = await exportScheduleCommand(weeklyBrand, weeklyFormat, weeklyRun, START_DATE, {
        brandsRoot: fx.brandsRoot,
        now: () => NOW,
        mediaHost: new FakeMediaHost(),
      });

      assert.match(output, /Wrote/);
      const mainCsv = await readFile(join(fx.runFolder, "zoho-main.csv"), "utf8");
      assert.ok(mainCsv.length > 0);
    });
  });
});
