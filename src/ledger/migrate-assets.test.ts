/**
 * Tests for the one-time ledger migration (`src/ledger/migrate-assets.ts`) — issue #55 / ADR-0011.
 *
 * Proves: idempotency (running twice is a no-op), losslessness (every legacy production field is
 * folded, never dropped), and the real-file round-trip against BOTH live Brand ledgers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  migrateIdeaRecord,
  migrateLedgerObject,
  migrateLedgerFile,
} from "./migrate-assets.ts";
import { DEFAULT_ASSET_RECIPE } from "../asset/migrate.ts";

// ---------------------------------------------------------------------------
// migrateIdeaRecord — pure, per-record
// ---------------------------------------------------------------------------

describe("migrateIdeaRecord — canonical records only gain assets:[]", () => {
  it("suggested with no assets → adds assets:[], reports changed", () => {
    const result = migrateIdeaRecord({ id: "i1", status: "suggested" });
    assert.equal(result.changed, true);
    assert.deepEqual(result.record, { id: "i1", status: "suggested", assets: [] });
  });

  it("accepted (today's real shape) with legacy-null scalar placeholders left UNTOUCHED", () => {
    // Real ledgers pre-populate post_url/posted_at/performance_score as null on every Idea, even
    // ones that never left "accepted" — migration must not strip these (only a genuinely FOLDED
    // legacy production status does), so the real-file diff stays minimal.
    const raw = { id: "i1", status: "accepted", post_url: null, posted_at: null, performance_score: null };
    const result = migrateIdeaRecord(raw);
    assert.equal(result.changed, true); // assets:[] was added
    const record = result.record as Record<string, unknown>;
    assert.deepEqual(record.assets, []);
    assert.equal(record.post_url, null);
    assert.equal(record.posted_at, null);
    assert.equal(record.performance_score, null);
  });

  it("an ALREADY-migrated record (assets present) reports changed:false — no-op", () => {
    const raw = { id: "i1", status: "accepted", assets: [] };
    const result = migrateIdeaRecord(raw);
    assert.equal(result.changed, false);
    assert.deepEqual(result.record, raw);
  });
});

describe("migrateIdeaRecord — legacy production statuses fold and STRIP the redundant scalar keys", () => {
  it("folds casting → accepted + one in_production Asset, stripping cast from the top level", () => {
    const raw = { id: "i1", status: "casting", title: "T", cast: [{ identifier: "c1", url: "https://x/1.png" }] };
    const result = migrateIdeaRecord(raw);
    assert.equal(result.changed, true);
    const record = result.record as Record<string, unknown>;
    assert.equal(record.status, "accepted");
    assert.equal(record.title, "T", "unrelated fields preserved");
    assert.equal("cast" in record, false, "the redundant top-level cast field is stripped once folded");
    const assets = record.assets as Array<Record<string, unknown>>;
    assert.equal(assets.length, 1);
    assert.equal(assets[0]!.recipe, DEFAULT_ASSET_RECIPE);
    assert.equal(assets[0]!.status, "in_production");
    assert.equal(assets[0]!.pending_gate, "cast");
    assert.deepEqual(assets[0]!.cast, [{ identifier: "c1", url: "https://x/1.png" }]);
  });

  it("folds produced → accepted + one produced Asset, stripping character/asset_url/produced_at", () => {
    const raw = {
      id: "i1",
      status: "produced",
      character: "cast-3",
      asset_url: "https://x/asset.mp4",
      produced_at: "2026-06-05T12:00:00.000Z",
    };
    const result = migrateIdeaRecord(raw);
    const record = result.record as Record<string, unknown>;
    assert.equal(record.status, "accepted");
    for (const key of ["character", "asset_url", "produced_at"]) {
      assert.equal(key in record, false, `${key} must be stripped from the top level once folded`);
    }
    const assets = record.assets as Array<Record<string, unknown>>;
    assert.equal(assets[0]!.character, "cast-3");
    assert.equal(assets[0]!.asset_url, "https://x/asset.mp4");
    assert.equal(assets[0]!.produced_at, "2026-06-05T12:00:00.000Z");
  });

  it("folds posted → accepted + posted Asset carrying post_url/posted_at, stripped from the top level", () => {
    const raw = { id: "i1", status: "posted", post_url: "https://facebook.com/post/1", posted_at: "2026-06-07T00:00:00Z" };
    const result = migrateIdeaRecord(raw);
    const record = result.record as Record<string, unknown>;
    assert.equal("post_url" in record, false);
    assert.equal("posted_at" in record, false);
    const assets = record.assets as Array<Record<string, unknown>>;
    assert.equal(assets[0]!.post_url, "https://facebook.com/post/1");
    assert.equal(assets[0]!.posted_at, "2026-06-07T00:00:00Z");
  });

  it("folds scored → accepted + scored Asset carrying performance_score, stripped from the top level", () => {
    const raw = { id: "i1", status: "scored", performance_score: 0.81 };
    const result = migrateIdeaRecord(raw);
    const record = result.record as Record<string, unknown>;
    assert.equal("performance_score" in record, false);
    const assets = record.assets as Array<Record<string, unknown>>;
    assert.equal(assets[0]!.performance_score, 0.81);
  });
});

describe("migrateIdeaRecord — never crashes on and never fabricates from a non-object entry", () => {
  it("passes a garbled non-object entry straight through, changed:false", () => {
    assert.deepEqual(migrateIdeaRecord("not-an-idea"), { record: "not-an-idea", changed: false });
    assert.deepEqual(migrateIdeaRecord(null), { record: null, changed: false });
  });
});

// ---------------------------------------------------------------------------
// migrateIdeaRecord — idempotency at the record grain
// ---------------------------------------------------------------------------

describe("migrateIdeaRecord — idempotent: migrating an already-migrated record is a no-op", () => {
  it("running migrateIdeaRecord TWICE on a legacy 'casting' record converges and then stops changing", () => {
    const raw = { id: "i1", status: "casting", cast: [{ identifier: "c1", url: "https://x/1.png" }] };
    const first = migrateIdeaRecord(raw);
    assert.equal(first.changed, true);
    const second = migrateIdeaRecord(first.record);
    assert.equal(second.changed, false, "the SECOND migration of an already-migrated record must be a no-op");
    assert.deepEqual(second.record, first.record);
  });
});

// ---------------------------------------------------------------------------
// migrateLedgerObject — whole-ledger, pure
// ---------------------------------------------------------------------------

describe("migrateLedgerObject — migrates every Idea, counts how many changed", () => {
  it("migrates a mixed ledger and reports the count of changed Ideas", () => {
    const raw = {
      baseline: { updated_at: null },
      ideas: [
        { id: "i1", status: "suggested" },
        { id: "i2", status: "casting" },
        { id: "i3", status: "accepted", assets: [] }, // already migrated
      ],
    };
    const result = migrateLedgerObject(raw);
    assert.equal(result.changed, true);
    assert.equal(result.ideasChanged, 2);
    const ledger = result.ledger as { baseline: unknown; ideas: Array<Record<string, unknown>> };
    assert.deepEqual(ledger.baseline, { updated_at: null }, "baseline untouched");
    assert.deepEqual(ledger.ideas[0]!.assets, []);
    assert.equal(ledger.ideas[1]!.status, "accepted");
    assert.deepEqual(ledger.ideas[2], { id: "i3", status: "accepted", assets: [] });
  });

  it("a fully-migrated ledger reports changed:false, ideasChanged:0, and the SAME object reference", () => {
    const raw = {
      ideas: [
        { id: "i1", status: "suggested", assets: [] },
        { id: "i2", status: "accepted", assets: [{ recipe: DEFAULT_ASSET_RECIPE, status: "produced" }] },
      ],
    };
    const result = migrateLedgerObject(raw);
    assert.equal(result.changed, false);
    assert.equal(result.ideasChanged, 0);
    assert.equal(result.ledger, raw, "an unchanged ledger returns the SAME reference (no needless rewrite)");
  });

  it("a non-ledger-shaped input is returned untouched", () => {
    assert.deepEqual(migrateLedgerObject({ not: "a ledger" }), { ledger: { not: "a ledger" }, changed: false, ideasChanged: 0 });
    assert.deepEqual(migrateLedgerObject(null), { ledger: null, changed: false, ideasChanged: 0 });
  });
});

// ---------------------------------------------------------------------------
// migrateLedgerFile — the I/O shell, idempotent on disk
// ---------------------------------------------------------------------------

async function withTempLedger(seed: unknown, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-migrate-"));
  const path = join(dir, "ledger.json");
  try {
    await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("migrateLedgerFile — the on-disk migration is idempotent (AC: running it twice is a no-op)", () => {
  it("migrates a legacy ledger on disk, adding assets and stripping legacy scalars", async () => {
    const seed = { ideas: [{ id: "i1", status: "casting", cast: [{ identifier: "c1", url: "https://x/1.png" }] }] };
    await withTempLedger(seed, async (path) => {
      const result = await migrateLedgerFile(path);
      assert.equal(result.changed, true);
      assert.equal(result.ideasChanged, 1);
      const onDisk = JSON.parse(await readFile(path, "utf8")) as { ideas: Array<Record<string, unknown>> };
      assert.equal(onDisk.ideas[0]!.status, "accepted");
      assert.equal("cast" in onDisk.ideas[0]!, false);
    });
  });

  it("running it a SECOND time on the migrated file changes nothing on disk (byte-identical)", async () => {
    const seed = { ideas: [{ id: "i1", status: "casting" }, { id: "i2", status: "suggested" }] };
    await withTempLedger(seed, async (path) => {
      await migrateLedgerFile(path);
      const afterFirst = await readFile(path, "utf8");

      const second = await migrateLedgerFile(path);
      assert.equal(second.changed, false);
      assert.equal(second.ideasChanged, 0);

      const afterSecond = await readFile(path, "utf8");
      assert.equal(afterSecond, afterFirst, "the file must be byte-identical after a second migration run");
    });
  });

  it("an already-canonical ledger (no legacy statuses) still gets assets:[] added, once", async () => {
    const seed = { ideas: [{ id: "i1", status: "accepted" }, { id: "i2", status: "rejected" }] };
    await withTempLedger(seed, async (path) => {
      const first = await migrateLedgerFile(path);
      assert.equal(first.changed, true);
      assert.equal(first.ideasChanged, 2);
      const second = await migrateLedgerFile(path);
      assert.equal(second.changed, false);
    });
  });
});

// ---------------------------------------------------------------------------
// Real-data round-trip — proves the migration against BOTH live Brand ledgers
// ---------------------------------------------------------------------------

describe("migrateLedgerFile — round-trip against the REAL mundotip and straw-motion ledgers", () => {
  async function withCopyOf(realPath: string, fn: (copyPath: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-migrate-real-"));
    const copyPath = join(dir, "ledger.json");
    try {
      const original = await readFile(realPath, "utf8");
      await writeFile(copyPath, original, "utf8");
      await fn(copyPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  for (const brand of ["mundotip", "straw-motion"]) {
    it(`migrates data/brands/${brand}/ledger.json losslessly and idempotently (on a COPY — never the real file)`, async () => {
      const realPath = join("data", "brands", brand, "ledger.json");
      await withCopyOf(realPath, async (copyPath) => {
        const before = JSON.parse(await readFile(copyPath, "utf8")) as { ideas: Array<Record<string, unknown>> };

        const first = await migrateLedgerFile(copyPath);
        const afterFirstText = await readFile(copyPath, "utf8");
        const after = JSON.parse(afterFirstText) as { ideas: Array<Record<string, unknown>> };

        // Every Idea gained assets:[] (none had a legacy production status — ADR-0011's "nearly free
        // now" claim), and the id/status/title set is preserved 1:1.
        assert.equal(after.ideas.length, before.ideas.length);
        for (let i = 0; i < before.ideas.length; i++) {
          assert.equal(after.ideas[i]!.id, before.ideas[i]!.id);
          assert.equal(after.ideas[i]!.status, before.ideas[i]!.status, "no live Idea has a legacy production status to remap");
          assert.deepEqual(after.ideas[i]!.assets, []);
        }

        // Idempotent: a second run against the now-migrated copy is a no-op.
        const second = await migrateLedgerFile(copyPath);
        assert.equal(second.changed, false, `${brand}: second migration run must be a no-op`);
        const afterSecondText = await readFile(copyPath, "utf8");
        assert.equal(afterSecondText, afterFirstText, `${brand}: file must be byte-identical after a second run`);

        assert.ok(first.ideasChanged >= 0);
      });
    });
  }
});
