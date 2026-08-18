/**
 * Tests for the typed command surface's Production Spec operations (`saveAssetSpec`, `refreshSpecFile`
 * — ADR-0031, issue #264).
 *
 * In-process against a real, throwaway SQLite file (`withTempDb`, never `:memory:`) plus a real,
 * throwaway temp directory for the file-view assertion.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { seedAsset } from "../db/fixtures/seed-chain.ts";
import { loadProductionSpec } from "../production-spec/store.ts";

import { saveAssetSpec, refreshSpecFile } from "./production-spec.ts";

describe("saveAssetSpec — the command surface's write over the SQL-backed Production Spec (ADR-0031, issue #264)", () => {
  it("persists a Spec onto the Asset's SQL row, readable back via loadProductionSpec", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const spec = { slides: [{ role: "hook" }] };

      saveAssetSpec(db, assetId, spec);

      assert.deepEqual(loadProductionSpec(db, assetId), spec);
    });
  });

  it("a second call for the SAME assetId overwrites in place, never a second row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);

      saveAssetSpec(db, assetId, { version: 1 });
      saveAssetSpec(db, assetId, { version: 2 });

      assert.deepEqual(loadProductionSpec(db, assetId), { version: 2 });
    });
  });
});

describe("refreshSpecFile — regenerates the on-disk Spec view FROM the SQL row (ADR-0031, issue #264)", () => {
  it("writes the file with the SAME Spec loadProductionSpec returns at that moment", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      const spec = { slides: [{ role: "hook", text: "Hello." }] };
      saveAssetSpec(db, assetId, spec);

      const dir = await mkdtemp(join(tmpdir(), "og-spec-view-"));
      try {
        const path = join(dir, "idea-01.news-carousel.spec.json");
        const wrote = await refreshSpecFile(db, assetId, path);
        assert.equal(wrote, true);

        const onDisk = JSON.parse(await readFile(path, "utf8")) as unknown;
        assert.deepEqual(onDisk, spec);
        assert.deepEqual(onDisk, loadProductionSpec(db, assetId));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("returns false and writes nothing when the Asset has no Spec yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);

      const dir = await mkdtemp(join(tmpdir(), "og-spec-view-"));
      try {
        const path = join(dir, "idea-01.news-carousel.spec.json");
        const wrote = await refreshSpecFile(db, assetId, path);
        assert.equal(wrote, false);
        await assert.rejects(readFile(path, "utf8"));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
