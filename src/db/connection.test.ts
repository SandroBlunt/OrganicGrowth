import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase } from "./connection.ts";

describe("openDatabase — creates a fresh file (and missing parent directories), enables FK enforcement", () => {
  it("creates the database file and any missing parent directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-connection-"));
    try {
      const path = join(root, "nested", "deeper", "db.sqlite");
      assert.equal(existsSync(path), false);
      const db = await openDatabase(path);
      try {
        assert.ok(existsSync(path), "the database file must exist after openDatabase");
      } finally {
        db.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enables PRAGMA foreign_keys = ON — a foreign-key violation throws", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-connection-"));
    try {
      const db = await openDatabase(join(root, "db.sqlite"));
      try {
        db.exec("CREATE TABLE parent (id TEXT PRIMARY KEY)");
        db.exec("CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))");
        assert.throws(() => {
          db.prepare("INSERT INTO child (id, parent_id) VALUES (?, ?)").run("c1", "does-not-exist");
        }, /FOREIGN KEY/);
      } finally {
        db.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
