import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { withTempDb } from "./test-support.ts";

describe("withTempDb — a real, file-backed database, cleaned up afterward", () => {
  it("hands the callback a real (non-:memory:) file-backed database that round-trips a write", async () => {
    let capturedPath = "";
    await withTempDb((db, path) => {
      capturedPath = path;
      assert.notEqual(path, ":memory:");
      assert.ok(existsSync(path), "the database file must exist while the callback runs");
      db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
      db.prepare("INSERT INTO t (id) VALUES (?)").run("x");
      const row = db.prepare("SELECT id FROM t WHERE id = ?").get("x");
      assert.equal(row?.id, "x");
    });
    assert.ok(capturedPath.length > 0);
  });

  it("removes the temp directory (and its database file) after the callback returns", async () => {
    let capturedDir = "";
    await withTempDb((_db, path) => {
      capturedDir = path.slice(0, path.lastIndexOf("/"));
      assert.ok(existsSync(capturedDir), "the temp directory must exist while the callback runs");
    });
    assert.equal(existsSync(capturedDir), false, "the temp directory must be removed once withTempDb returns");
  });

  it("still cleans up the temp directory when the callback throws", async () => {
    let capturedDir = "";
    await assert.rejects(
      withTempDb((_db, path) => {
        capturedDir = path.slice(0, path.lastIndexOf("/"));
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(existsSync(capturedDir), false, "cleanup must run even when the callback throws");
  });
});
