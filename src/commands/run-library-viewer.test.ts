/**
 * Tests for `/run-library-viewer`'s `prepareLibraryViewer` (issue #210) — argument parsing and the
 * startup checks, without actually calling `main()` (which calls `process.exit`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { openDatabase } from "../db/connection.ts";
import { runMigrations } from "../db/migrate.ts";
import { prepareLibraryViewer, main } from "./run-library-viewer.ts";

describe("prepareLibraryViewer", () => {
  it("throws a clear, actionable error for a database file that does not exist — never creates one", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-run-library-viewer-"));
    try {
      const dbPath = join(root, "does-not-exist.db");
      await assert.rejects(() => prepareLibraryViewer(["--db", dbPath]), /never creates a database|run "npm run import-data"/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws a clear error for a database file that exists but has no migrated schema yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-run-library-viewer-"));
    try {
      const dbPath = join(root, "empty.db");
      const raw = await openDatabase(dbPath); // creates the file, but runs no migration
      raw.close();
      await assert.rejects(() => prepareLibraryViewer(["--db", dbPath]), /no migrated schema/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("opens a real, migrated database read-only and builds a working server against it", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-run-library-viewer-"));
    try {
      const dbPath = join(root, "organicgrowth.db");
      const writer = await openDatabase(dbPath);
      runMigrations(writer);
      writer.close();

      const prepared = await prepareLibraryViewer(["--db", dbPath, "--port", "0"]);
      try {
        await new Promise<void>((resolve) => prepared.server.listen(0, "127.0.0.1", resolve));
        const address = prepared.server.address() as AddressInfo;
        const res = await fetch(`http://127.0.0.1:${address.port}/`);
        assert.equal(res.status, 200);

        // And the connection is genuinely read-only — a write throws.
        assert.throws(() => {
          prepared.db.exec(`INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at)
                             VALUES ('x', 'sneaky', 'Sneaky', 'UTC', 'x', '2026-01-01', '2026-01-01')`);
        }, /readonly/i);
      } finally {
        await new Promise<void>((resolve, reject) => prepared.server.close((err) => (err ? reject(err) : resolve())));
        prepared.db.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("defaults to data/organicgrowth.db and port 4173 when no flags are given", async () => {
    // Proven indirectly: pointing --db at a real migrated file and omitting --port must still produce
    // a usable, listenable server (the default port itself is exercised by main(), not asserted here,
    // since binding the REAL default port in a test would collide with a concurrently running viewer).
    const root = await mkdtemp(join(tmpdir(), "og-run-library-viewer-"));
    try {
      const dbPath = join(root, "organicgrowth.db");
      const writer = await openDatabase(dbPath);
      runMigrations(writer);
      writer.close();

      const prepared = await prepareLibraryViewer(["--db", dbPath]);
      assert.equal(prepared.port, 4173);
      prepared.db.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("main() — the REAL CLI entry point, not a re-implementation of it — binds loopback-only, never every interface (issue #210 QA round 1, defect 1)", async () => {
    // This calls `main()` itself (the exact function the `npm run library` CLI invokes), with an
    // OS-assigned port ("--port 0") against a throwaway migrated database, and asserts what address it
    // actually bound — not a hand-built server with a hardcoded "127.0.0.1" passed by the test. A local
    // Library viewer must never be reachable from another device on the same network (epic #195's own
    // "a local HTML viewer, not a web app"): if a future edit ever drops the host argument from `main()`'s
    // own `server.listen()` call, Node defaults to the wildcard address and THIS test goes red.
    const root = await mkdtemp(join(tmpdir(), "og-run-library-viewer-"));
    try {
      const dbPath = join(root, "organicgrowth.db");
      const writer = await openDatabase(dbPath);
      runMigrations(writer);
      writer.close();

      const prepared = await main(["--db", dbPath, "--port", "0"]);
      try {
        const address = prepared.server.address() as AddressInfo;
        assert.equal(
          address.address,
          "127.0.0.1",
          `expected main() to bind loopback-only ("127.0.0.1"), got "${address.address}" — reachable from ` +
            "every network interface, not just this machine",
        );
        assert.equal(address.family, "IPv4");

        // And it still genuinely serves real requests on that loopback address.
        const res = await fetch(`http://127.0.0.1:${address.port}/`);
        assert.equal(res.status, 200);
      } finally {
        await new Promise<void>((resolve, reject) => prepared.server.close((err) => (err ? reject(err) : resolve())));
        prepared.db.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
