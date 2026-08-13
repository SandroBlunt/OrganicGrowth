import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { uploadTeleprompterScripts } from "./upload.ts";
import { LIBRARY_LIST_KEY, isValidTeleprompterGuid } from "./library.ts";
import { FakeCameraHubAppLifecycle } from "./fixtures/fake-app-lifecycle.ts";

/** Every test roots Camera Hub at a fresh temp directory — NEVER the real
 *  `~/Library/Application Support/Elgato/Camera Hub/` — and drives a `FakeCameraHubAppLifecycle` —
 *  NEVER a real process (issue #189's own hard requirement). */
async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-camera-hub-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function sequentialGuid(seed: string) {
  let n = 0;
  return () => {
    n += 1;
    return `${seed}${String(n).padStart(4, "0")}-0000-0000-0000-000000000000`;
  };
}

describe("uploadTeleprompterScripts — empty batch (issue #189)", () => {
  it("an empty scripts array is a no-op success, never checks isRunning", async () => {
    await withRoot(async (root) => {
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const result = await uploadTeleprompterScripts(root, lifecycle, []);
      assert.deepEqual(result, { ok: true, uploaded: [] });
      assert.equal(lifecycle.isRunningCalls, 0);
      assert.equal(lifecycle.launchCalls, 0);
    });
  });
});

describe("uploadTeleprompterScripts — quit verification (issue #189, ADR-0027)", () => {
  it("Camera Hub still running: refuses, touches NO file, never relaunches", async () => {
    await withRoot(async (root) => {
      const lifecycle = new FakeCameraHubAppLifecycle(true);
      const result = await uploadTeleprompterScripts(root, lifecycle, [
        { title: "Story one", bodyText: "Hello world." },
      ]);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "camera_hub_still_running");
      assert.equal(result.uploaded.length, 0);
      assert.equal(lifecycle.launchCalls, 0);

      // no Texts dir, no AppSettings.json — nothing was touched
      await assert.rejects(readdir(join(root, "Texts")));
      await assert.rejects(readFile(join(root, "AppSettings.json"), "utf8"));
    });
  });

  it("the running check itself failing degrades to a reported failure, never throws", async () => {
    await withRoot(async (root) => {
      const lifecycle = {
        isRunning: () => Promise.reject(new Error("pgrep not found")),
        launch: () => Promise.reject(new Error("should never be called")),
      };
      const result = await uploadTeleprompterScripts(root, lifecycle, [
        { title: "Story one", bodyText: "Hello world." },
      ]);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, /pgrep not found/);
    });
  });
});

describe("uploadTeleprompterScripts — happy path, fresh Camera Hub root (issue #189)", () => {
  it("writes one Texts/<GUID>.json per script, the pointer list, and relaunches exactly once", async () => {
    await withRoot(async (root) => {
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const result = await uploadTeleprompterScripts(
        root,
        lifecycle,
        [
          { title: "Story one", bodyText: "Beat one.\n\nBeat two." },
          { title: "Story two", bodyText: "Beat A.\n\nBeat B.\n\nBeat C." },
        ],
        { newGuid: sequentialGuid("AAAAAAAA") },
      );

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.uploaded.length, 2);
      assert.equal(result.uploaded[0]!.guid, "AAAAAAAA0001-0000-0000-0000-000000000000");
      assert.equal(result.uploaded[1]!.guid, "AAAAAAAA0002-0000-0000-0000-000000000000");

      // batching: exactly one isRunning check, one relaunch, for the whole batch
      assert.equal(lifecycle.isRunningCalls, 1);
      assert.equal(lifecycle.launchCalls, 1);

      // Texts/<GUID>.json — one file per script, correct shape
      const record1 = JSON.parse(await readFile(result.uploaded[0]!.path, "utf8"));
      assert.deepEqual(record1, {
        GUID: "AAAAAAAA0001-0000-0000-0000-000000000000",
        chapters: ["Beat one.", "Beat two."],
        friendlyName: "Story one",
        index: 0,
      });
      const record2 = JSON.parse(await readFile(result.uploaded[1]!.path, "utf8"));
      assert.deepEqual(record2, {
        GUID: "AAAAAAAA0002-0000-0000-0000-000000000000",
        chapters: ["Beat A.", "Beat B.", "Beat C."],
        friendlyName: "Story two",
        index: 1,
      });

      // AppSettings.json — the pointer list makes both GUIDs actually show up
      const settings = JSON.parse(await readFile(join(root, "AppSettings.json"), "utf8"));
      assert.deepEqual(settings[LIBRARY_LIST_KEY], [
        "AAAAAAAA0001-0000-0000-0000-000000000000",
        "AAAAAAAA0002-0000-0000-0000-000000000000",
      ]);

      // no backup — there was nothing to back up on a fresh root
      const rootEntries = await readdir(root);
      assert.equal(rootEntries.some((f) => f.includes(".bak-")), false);
    });
  });

  it("uses a fresh, valid GUID per script by default (no injected newGuid)", async () => {
    await withRoot(async (root) => {
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const result = await uploadTeleprompterScripts(root, lifecycle, [{ title: "Story", bodyText: "Text." }]);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.ok(isValidTeleprompterGuid(result.uploaded[0]!.guid));
    });
  });
});

describe("uploadTeleprompterScripts — existing library (issue #189)", () => {
  it("backs up the ORIGINAL AppSettings.json verbatim before rewriting, and appends to (never replaces) the existing pointer list", async () => {
    await withRoot(async (root) => {
      const originalText = JSON.stringify(
        { [LIBRARY_LIST_KEY]: ["EXISTING0001-0000-0000-0000-000000000000"], "unrelated.setting": "keep-me" },
        null,
        2,
      );
      await writeFile(join(root, "AppSettings.json"), originalText, "utf8");

      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const now = new Date("2026-08-13T09:00:00.000Z");
      const result = await uploadTeleprompterScripts(
        root,
        lifecycle,
        [{ title: "New story", bodyText: "New text." }],
        { newGuid: sequentialGuid("BBBBBBBB"), now: () => now },
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;

      // index continues from the existing library's length (1), never restarts at 0
      const record = JSON.parse(await readFile(result.uploaded[0]!.path, "utf8"));
      assert.equal(record.index, 1);

      // the pointer list is APPENDED to, unrelated keys preserved
      const settings = JSON.parse(await readFile(join(root, "AppSettings.json"), "utf8"));
      assert.deepEqual(settings[LIBRARY_LIST_KEY], [
        "EXISTING0001-0000-0000-0000-000000000000",
        "BBBBBBBB0001-0000-0000-0000-000000000000",
      ]);
      assert.equal(settings["unrelated.setting"], "keep-me");

      // the backup is a byte-identical copy of the ORIGINAL file, timestamped
      const entries = await readdir(root);
      const backupName = entries.find((f) => f.startsWith("AppSettings.json.bak-"));
      assert.ok(backupName, "a timestamped .bak-<ts> sibling must exist");
      assert.match(backupName!, /^AppSettings\.json\.bak-2026-08-13T09-00-00-000Z$/);
      const backedUp = await readFile(join(root, backupName!), "utf8");
      assert.equal(backedUp, originalText);
    });
  });

  it("refuses (and touches nothing) when AppSettings.json is not valid JSON", async () => {
    await withRoot(async (root) => {
      await writeFile(join(root, "AppSettings.json"), "{ not valid json", "utf8");
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const result = await uploadTeleprompterScripts(root, lifecycle, [{ title: "Story", bodyText: "Text." }]);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, /not valid JSON/);
      assert.equal(lifecycle.launchCalls, 0);

      // no Texts files were written — the abort happens BEFORE any write
      await assert.rejects(readdir(join(root, "Texts")));
      // the original (bad) file is untouched, no backup created
      const stillThere = await readFile(join(root, "AppSettings.json"), "utf8");
      assert.equal(stillThere, "{ not valid json");
      const entries = await readdir(root);
      assert.equal(entries.some((f) => f.includes(".bak-")), false);
    });
  });

  it("refuses when AppSettings.json parses to a non-object (e.g. an array)", async () => {
    await withRoot(async (root) => {
      await writeFile(join(root, "AppSettings.json"), "[1, 2, 3]", "utf8");
      const lifecycle = new FakeCameraHubAppLifecycle(false);
      const result = await uploadTeleprompterScripts(root, lifecycle, [{ title: "Story", bodyText: "Text." }]);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, /JSON object/);
    });
  });
});
