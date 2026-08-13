import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LIBRARY_LIST_KEY,
  isValidTeleprompterGuid,
  newScriptGuid,
  buildScriptRecord,
  existingLibraryGuids,
  appendLibraryGuids,
} from "./library.ts";

describe("isValidTeleprompterGuid / newScriptGuid (issue #189)", () => {
  it("newScriptGuid always returns an uppercase, hyphenated 8-4-4-4-12 GUID", () => {
    for (let i = 0; i < 20; i++) {
      const guid = newScriptGuid();
      assert.ok(isValidTeleprompterGuid(guid), `${guid} must match the expected shape`);
      assert.equal(guid, guid.toUpperCase(), "must be uppercase");
    }
  });

  it("newScriptGuid returns a fresh value every call", () => {
    const a = newScriptGuid();
    const b = newScriptGuid();
    assert.notEqual(a, b);
  });

  it("isValidTeleprompterGuid rejects lowercase, wrong-length, and non-UUID strings", () => {
    assert.equal(isValidTeleprompterGuid("3740484d-13b9-4ec5-8135-96e647077771"), false); // lowercase
    assert.equal(isValidTeleprompterGuid("not-a-guid"), false);
    assert.equal(isValidTeleprompterGuid("3740484D-13B9-4EC5-8135"), false); // too short
  });

  it("isValidTeleprompterGuid accepts the smoke test's own example GUID", () => {
    assert.equal(isValidTeleprompterGuid("3740484D-13B9-4EC5-8135-96E647077771"), true);
  });
});

describe("buildScriptRecord (issue #189)", () => {
  it("builds the exact Texts/<GUID>.json shape, chapters derived via splitChapters", () => {
    const record = buildScriptRecord(
      "3740484D-13B9-4EC5-8135-96E647077771",
      "Title shown in the library",
      "First paragraph.\n\nSecond paragraph.",
      1,
    );
    assert.deepEqual(record, {
      GUID: "3740484D-13B9-4EC5-8135-96E647077771",
      chapters: ["First paragraph.", "Second paragraph."],
      friendlyName: "Title shown in the library",
      index: 1,
    });
  });
});

describe("existingLibraryGuids (issue #189)", () => {
  it("reads the flat GUID array off a well-formed AppSettings.json value", () => {
    const raw = { [LIBRARY_LIST_KEY]: ["AAA", "BBB"], "other.key": 1 };
    assert.deepEqual(existingLibraryGuids(raw), ["AAA", "BBB"]);
  });

  it("returns [] when the key is absent, non-array, or raw is not an object", () => {
    assert.deepEqual(existingLibraryGuids({}), []);
    assert.deepEqual(existingLibraryGuids({ [LIBRARY_LIST_KEY]: "not-an-array" }), []);
    assert.deepEqual(existingLibraryGuids(null), []);
    assert.deepEqual(existingLibraryGuids("a string"), []);
    assert.deepEqual(existingLibraryGuids(["an", "array"]), []);
    assert.deepEqual(existingLibraryGuids(undefined), []);
  });

  it("drops non-string entries rather than throwing", () => {
    assert.deepEqual(existingLibraryGuids({ [LIBRARY_LIST_KEY]: ["AAA", 42, null, "BBB"] }), ["AAA", "BBB"]);
  });
});

describe("appendLibraryGuids (issue #189)", () => {
  it("appends new GUIDs to an existing pointer list, preserving every other key", () => {
    const raw = { [LIBRARY_LIST_KEY]: ["AAA"], "unrelated.setting": "keep-me" };
    const next = appendLibraryGuids(raw, ["BBB", "CCC"]);
    assert.deepEqual(next, {
      [LIBRARY_LIST_KEY]: ["AAA", "BBB", "CCC"],
      "unrelated.setting": "keep-me",
    });
  });

  it("creates the pointer-list key fresh when raw carries none yet", () => {
    const next = appendLibraryGuids({ "unrelated.setting": "keep-me" }, ["AAA"]);
    assert.deepEqual(next, { [LIBRARY_LIST_KEY]: ["AAA"], "unrelated.setting": "keep-me" });
  });

  it("degrades a non-object raw to a fresh object rather than throwing", () => {
    assert.deepEqual(appendLibraryGuids(undefined, ["AAA"]), { [LIBRARY_LIST_KEY]: ["AAA"] });
    assert.deepEqual(appendLibraryGuids(null, ["AAA"]), { [LIBRARY_LIST_KEY]: ["AAA"] });
  });

  it("never mutates the input object", () => {
    const raw = { [LIBRARY_LIST_KEY]: ["AAA"] };
    const before = JSON.stringify(raw);
    appendLibraryGuids(raw, ["BBB"]);
    assert.equal(JSON.stringify(raw), before);
  });
});
