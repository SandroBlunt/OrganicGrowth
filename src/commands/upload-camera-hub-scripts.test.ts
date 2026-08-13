import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { uploadCameraHubScriptsCommand, defaultCameraHubRoot } from "./upload-camera-hub-scripts.ts";
import { loadIdeaAssets } from "../asset/store.ts";
import { FakeCameraHubAppLifecycle } from "../camera-hub/fixtures/fake-app-lifecycle.ts";
import { LIBRARY_LIST_KEY } from "../camera-hub/library.ts";

const BRAND = "straw-motion";

describe("defaultCameraHubRoot — shape only, NEVER used by any test's actual fixture (issue #189)", () => {
  it("points at the real macOS Camera Hub content-library directory", () => {
    const path = defaultCameraHubRoot();
    assert.match(path, /Library[\\/]Application Support[\\/]Elgato[\\/]Camera Hub$/);
  });
});

interface Fixture {
  readonly ledgerPath: string;
  readonly ideasRoot: string;
  readonly cameraHubRoot: string;
}

/** Every test roots the ledger AND Camera Hub at fresh temp directories — NEVER the real Brand data
 *  directory and NEVER the real `~/Library/Application Support/Elgato/Camera Hub/` (issue #189). */
async function withFixture(fn: (fx: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-camera-hub-cmd-"));
  try {
    const ledgerPath = join(root, "ledger.json");
    const ideasRoot = join(root, "ideas");
    const cameraHubRoot = join(root, "camera-hub-root");
    await mkdir(ideasRoot, { recursive: true });
    await fn({ ledgerPath, ideasRoot, cameraHubRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeLedger(path: string, ideas: readonly unknown[]): Promise<void> {
  await writeFile(path, `${JSON.stringify({ ideas }, null, 2)}\n`, "utf8");
}

/** Write `script.txt` into a `news-short-script` Asset's output bundle, and return the (non-existent —
 *  never read) sibling `spec_path` the command derives that directory FROM. */
async function writeScriptTxt(ideasRoot: string, ideaShortName: string, text: string): Promise<string> {
  const dir = join(ideasRoot, `${ideaShortName}.news-short-script.output`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "script.txt"), text, "utf8");
  return join(ideasRoot, `${ideaShortName}.news-short-script.spec.json`);
}

describe("uploadCameraHubScriptsCommand — nothing to do (issue #189)", () => {
  it("an empty ledger reports nothing to upload, never checks the app-lifecycle", async () => {
    await withFixture(async (fx) => {
      await writeLedger(fx.ledgerPath, []);
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const output = await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
      });
      assert.match(output, /Nothing to upload/);
      assert.equal(lifecycle.isRunningCalls, 0);
    });
  });

  it("every news-short-script Asset already carrying camera_hub_uploaded_at -> nothing to upload", async () => {
    await withFixture(async (fx) => {
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-01",
          status: "accepted",
          assets: [
            {
              recipe: "news-short-script",
              status: "produced",
              spec_path: "irrelevant.spec.json",
              camera_hub_uploaded_at: "2026-08-12T09:00:00.000Z",
            },
          ],
        },
      ]);
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const output = await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
      });
      assert.match(output, /Nothing to upload/);
    });
  });
});

describe("uploadCameraHubScriptsCommand — happy path, batched (issue #189)", () => {
  it("uploads every swept Asset in ONE batch, stamps camera_hub_uploaded_at, preserves status", async () => {
    await withFixture(async (fx) => {
      const spec1 = await writeScriptTxt(fx.ideasRoot, "idea-01", "Hook line.\n\nStory line.\n\nCta line.");
      const spec2 = await writeScriptTxt(fx.ideasRoot, "idea-02", "Another hook.\n\nAnother cta.");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-01",
          status: "accepted",
          assets: [
            {
              recipe: "news-short-script",
              status: "produced",
              spec_path: spec1,
              copy: { caption: "cap", hashtags: [], title: "Custom Title One" },
            },
          ],
        },
        {
          id: "idea-02",
          status: "accepted",
          // status "posted" — proves the field is preserved, never regressed to "produced"
          assets: [{ recipe: "news-short-script", status: "posted", spec_path: spec2 }],
        },
      ]);

      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const instant = new Date("2026-08-13T09:00:00.000Z");
      const output = await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
        now: () => instant,
      });

      assert.match(output, /Uploaded 2 script\(s\)/);
      assert.match(output, /idea-01/);
      assert.match(output, /idea-02/);

      // batching: exactly one isRunning check, one relaunch, across BOTH ideas
      assert.equal(lifecycle.isRunningCalls, 1);
      assert.equal(lifecycle.launchCalls, 1);

      // Texts/*.json — 2 files, correct friendlyName (copy.title when present, else the Idea id)
      const textsDir = join(fx.cameraHubRoot, "Texts");
      const files = await readdir(textsDir);
      assert.equal(files.length, 2);
      const records = await Promise.all(files.map((f) => readFile(join(textsDir, f), "utf8").then(JSON.parse)));
      const byFriendlyName = new Map(records.map((r) => [r.friendlyName, r]));
      assert.ok(byFriendlyName.has("Custom Title One"), "idea-01 uses its Copy's title as friendlyName");
      assert.ok(byFriendlyName.has("idea-02"), "idea-02 falls back to its Idea id (no copy.title)");

      // AppSettings.json's pointer list carries both GUIDs
      const settings = JSON.parse(await readFile(join(fx.cameraHubRoot, "AppSettings.json"), "utf8"));
      assert.equal(settings[LIBRARY_LIST_KEY].length, 2);

      // ledger: both Assets stamped, status preserved exactly
      const assets1 = await loadIdeaAssets("idea-01", fx.ledgerPath);
      assert.equal(assets1![0]!.camera_hub_uploaded_at, "2026-08-13T09:00:00.000Z");
      assert.equal(assets1![0]!.status, "produced");

      const assets2 = await loadIdeaAssets("idea-02", fx.ledgerPath);
      assert.equal(assets2![0]!.camera_hub_uploaded_at, "2026-08-13T09:00:00.000Z");
      assert.equal(assets2![0]!.status, "posted", "status must be preserved, never regressed to produced");
    });
  });

  it("the [Next shot] marker never leaks into the uploaded chapters", async () => {
    await withFixture(async (fx) => {
      const spec = await writeScriptTxt(
        fx.ideasRoot,
        "idea-01",
        "Beat one line.\n\n[Next shot]\n\nBeat two line.",
      );
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-short-script", status: "produced", spec_path: spec }],
        },
      ]);
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
      });

      const textsDir = join(fx.cameraHubRoot, "Texts");
      const [file] = await readdir(textsDir);
      const record = JSON.parse(await readFile(join(textsDir, file!), "utf8"));
      assert.deepEqual(record.chapters, ["Beat one line.", "Beat two line."]);
    });
  });
});

describe("uploadCameraHubScriptsCommand — non-fatal skips (issue #189)", () => {
  it("an Asset with no spec_path is skipped and reported; a sibling Asset still uploads", async () => {
    await withFixture(async (fx) => {
      const spec2 = await writeScriptTxt(fx.ideasRoot, "idea-02", "Good script.");
      await writeLedger(fx.ledgerPath, [
        { id: "idea-01", status: "accepted", assets: [{ recipe: "news-short-script", status: "produced" }] },
        {
          id: "idea-02",
          status: "accepted",
          assets: [{ recipe: "news-short-script", status: "produced", spec_path: spec2 }],
        },
      ]);
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const output = await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
      });
      assert.match(output, /idea-01.*no spec_path/s);
      assert.match(output, /Uploaded 1 script\(s\)/);

      const assets1 = await loadIdeaAssets("idea-01", fx.ledgerPath);
      assert.equal(assets1![0]!.camera_hub_uploaded_at, undefined);
    });
  });

  it("an Asset whose script.txt is missing on disk is skipped and reported, never throws", async () => {
    await withFixture(async (fx) => {
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-01",
          status: "accepted",
          assets: [
            {
              recipe: "news-short-script",
              status: "produced",
              spec_path: join(fx.ideasRoot, "idea-01.news-short-script.spec.json"),
            },
          ],
        },
      ]);
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const output = await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
      });
      assert.match(output, /Nothing uploaded/);
      assert.match(output, /idea-01.*could not read script\.txt/s);
    });
  });
});

describe("uploadCameraHubScriptsCommand — Camera Hub still running (issue #189, ADR-0027)", () => {
  it("refuses, changes NOTHING on the ledger, script.txt stays untouched for manual copy-paste", async () => {
    await withFixture(async (fx) => {
      const spec = await writeScriptTxt(fx.ideasRoot, "idea-01", "Good script.");
      await writeLedger(fx.ledgerPath, [
        {
          id: "idea-01",
          status: "accepted",
          assets: [{ recipe: "news-short-script", status: "produced", spec_path: spec }],
        },
      ]);
      const lifecycle = new FakeCameraHubAppLifecycle(true); // still running
      const output = await uploadCameraHubScriptsCommand(BRAND, {
        ledgerPath: fx.ledgerPath,
        root: fx.cameraHubRoot,
        lifecycle,
      });
      assert.match(output, /Upload NOT completed/);
      assert.match(output, /camera_hub_still_running/);
      assert.match(output, /idea-01/);
      assert.equal(lifecycle.launchCalls, 0);

      const assets1 = await loadIdeaAssets("idea-01", fx.ledgerPath);
      assert.equal(assets1![0]!.camera_hub_uploaded_at, undefined);
      assert.equal(assets1![0]!.status, "produced");

      // script.txt is completely untouched — still readable for manual copy-paste
      const dir = join(fx.ideasRoot, "idea-01.news-short-script.output");
      const stillThere = await readFile(join(dir, "script.txt"), "utf8");
      assert.equal(stillThere, "Good script.");
    });
  });
});
