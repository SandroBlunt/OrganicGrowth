import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StorageKeyError, assertRootRelativeStorageKey } from "./storage-key.ts";

describe("assertRootRelativeStorageKey — rejects an absolute path at the store boundary", () => {
  it("returns the key unchanged for a well-formed root-relative key", () => {
    assert.equal(
      assertRootRelativeStorageKey("straw-motion/2026-W32/idea-01/0-hook.jpg"),
      "straw-motion/2026-W32/idea-01/0-hook.jpg",
    );
  });

  it("throws StorageKeyError for a POSIX absolute path", () => {
    assert.throws(
      () => assertRootRelativeStorageKey("/Users/CaxtonTaylor/Developer/OrganicGrowth/data/x.jpg"),
      StorageKeyError,
    );
  });

  it("throws StorageKeyError for a Windows-style absolute path (drive letter)", () => {
    assert.throws(() => assertRootRelativeStorageKey("C:\\Users\\ops\\x.jpg"), StorageKeyError);
  });

  it("throws StorageKeyError for a home-directory shorthand path", () => {
    assert.throws(() => assertRootRelativeStorageKey("~/OrganicGrowth-Backups/x.jpg"), StorageKeyError);
  });

  it("throws StorageKeyError for an empty key", () => {
    assert.throws(() => assertRootRelativeStorageKey(""), StorageKeyError);
  });

  it("throws StorageKeyError for a key that escapes its root via a .. segment", () => {
    assert.throws(() => assertRootRelativeStorageKey("../../etc/passwd"), StorageKeyError);
    assert.throws(() => assertRootRelativeStorageKey("straw-motion/../../etc/passwd"), StorageKeyError);
  });

  it("the thrown error names the rejected key, so a caller can log/report it usefully", () => {
    try {
      assertRootRelativeStorageKey("/absolute/path.jpg");
      assert.fail("expected a throw");
    } catch (err: unknown) {
      assert.ok(err instanceof StorageKeyError);
      assert.match((err as Error).message, /\/absolute\/path\.jpg/);
    }
  });
});
