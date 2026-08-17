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

  it("enables PRAGMA busy_timeout = 5000 — a concurrent writer waits, not an immediate SQLITE_BUSY (issue #203)", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-connection-"));
    try {
      const db = await openDatabase(join(root, "db.sqlite"));
      try {
        const row = db.prepare("PRAGMA busy_timeout").get() as { readonly timeout: number };
        assert.equal(row.timeout, 5000);
      } finally {
        db.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  describe("{ readOnly: true } (issue #210)", () => {
    it("throws for a database file that does not exist yet — never silently creates one", async () => {
      const root = await mkdtemp(join(tmpdir(), "og-connection-"));
      try {
        const path = join(root, "does-not-exist.sqlite");
        await assert.rejects(() => openDatabase(path, { readOnly: true }));
        assert.equal(existsSync(path), false, "a read-only open must never create the file");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("opens an EXISTING database and can read it", async () => {
      const root = await mkdtemp(join(tmpdir(), "og-connection-"));
      try {
        const path = join(root, "db.sqlite");
        const writer = await openDatabase(path);
        writer.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
        writer.prepare("INSERT INTO t (id) VALUES (?)").run("row-1");
        writer.close();

        const reader = await openDatabase(path, { readOnly: true });
        try {
          const row = reader.prepare("SELECT id FROM t WHERE id = ?").get("row-1") as { readonly id: string } | undefined;
          assert.equal(row?.id, "row-1");
        } finally {
          reader.close();
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("a write through the read-only handle THROWS, at the connection level — not by convention", async () => {
      const root = await mkdtemp(join(tmpdir(), "og-connection-"));
      try {
        const path = join(root, "db.sqlite");
        const writer = await openDatabase(path);
        writer.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
        writer.close();

        const reader = await openDatabase(path, { readOnly: true });
        try {
          assert.throws(() => {
            reader.prepare("INSERT INTO t (id) VALUES (?)").run("should-fail");
          }, /readonly/i);
          assert.throws(() => {
            reader.exec("CREATE TABLE another (id TEXT)");
          }, /readonly/i);
        } finally {
          reader.close();
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});
