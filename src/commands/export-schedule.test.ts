import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportScheduleCommand, main as exportScheduleMain } from "./export-schedule.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import { FakeMediaHost } from "../media-host/fixtures/fake-media-host.ts";

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
