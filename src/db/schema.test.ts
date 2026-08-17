import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "./migrate.ts";
import { withTempDb } from "./test-support.ts";
import { seedAsset } from "./fixtures/seed-chain.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { listWiredRecipeSlugs } from "../recipe/registry.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0].value;
const VALID_THEME = THEMES[0].value;

/** Inserts a minimal valid Brand row and returns its id — the common setup nearly every FK test needs. */
function insertBrand(db: DatabaseSync): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `brand-${id}`, "Test Brand", "UTC", `data/brands/brand-${id}`, now, now);
  return id;
}

describe("Foreign-key constraints are ENFORCED (PRAGMA foreign_keys = ON), not merely declared", () => {
  it("inserting a channel with a non-existent brand_id fails", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const now = new Date().toISOString();
      assert.throws(() => {
        db.prepare(
          `INSERT INTO channel (id, brand_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(randomUUID(), "does-not-exist", "facebook", now, now);
      }, /FOREIGN KEY/);
    });
  });

  it("inserting a channel with a real brand_id succeeds", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = insertBrand(db);
      const now = new Date().toISOString();
      assert.doesNotThrow(() => {
        db.prepare(
          `INSERT INTO channel (id, brand_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(randomUUID(), brandId, "facebook", now, now);
      });
    });
  });
});

describe("Exactly one primary Channel per Brand (partial unique index, ADR-0019)", () => {
  it("a second primary Channel for the SAME brand is rejected", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = insertBrand(db);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
      ).run(randomUUID(), brandId, "facebook", now, now);
      assert.throws(() => {
        db.prepare(
          `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
        ).run(randomUUID(), brandId, "instagram", now, now);
      }, /UNIQUE/);
    });
  });

  it("a second NON-primary Channel for the same brand is fine, as is a primary Channel on a DIFFERENT brand", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = insertBrand(db);
      const otherBrandId = insertBrand(db);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
      ).run(randomUUID(), brandId, "facebook", now, now);
      assert.doesNotThrow(() => {
        db.prepare(
          `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
        ).run(randomUUID(), brandId, "instagram", now, now);
        db.prepare(
          `INSERT INTO channel (id, brand_id, platform, is_primary, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
        ).run(randomUUID(), otherBrandId, "facebook", now, now);
      });
    });
  });
});

/** Minimal fixture chain (brand -> format -> run) an `idea` row needs, since `idea` has NOT NULL FKs
 *  to all three. Returns the ids a test needs to insert its own `idea` row. */
function insertRunFixture(db: DatabaseSync): { readonly brandId: string; readonly runId: string } {
  const brandId = insertBrand(db);
  const formatId = randomUUID();
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO format (id, brand_id, slug, name, voice, cadence, ideas_per_run, source_mode, created_at, updated_at)
     VALUES (?, ?, 'unhypped-news', 'Unhypped News', 'plain, curious', 'weekly', 10, 'peer', ?, ?)`,
  ).run(formatId, brandId, now, now);
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W32', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  return { brandId, runId };
}

function insertIdea(
  db: DatabaseSync,
  overrides: { readonly hookType?: string; readonly theme?: string } = {},
): void {
  const { brandId, runId } = insertRunFixture(db);
  const now = new Date().toISOString();
  const formatRow = db.prepare(`SELECT format_id FROM run WHERE id = ?`).get(runId);
  db.prepare(
    `INSERT INTO idea (id, run_id, brand_id, format_id, title, brief, status, hook_type, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Test Idea', 'A brief.', 'suggested', ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    runId,
    brandId,
    formatRow?.format_id,
    overrides.hookType ?? VALID_HOOK_TYPE,
    overrides.theme ?? VALID_THEME,
    now,
    now,
  );
}

describe("idea.hook_type and idea.theme are FOREIGN KEYS into the seeded closed-vocabulary tables", () => {
  it("a valid hook_type and theme (from HOOK_TYPES / THEMES) is accepted", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.doesNotThrow(() => insertIdea(db));
    });
  });

  it("a hook_type outside the closed set is rejected", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => insertIdea(db, { hookType: "not_a_real_hook_type" }), /FOREIGN KEY/);
    });
  });

  it("a theme outside the closed set is rejected", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => insertIdea(db, { theme: "not_a_real_theme" }), /FOREIGN KEY/);
    });
  });
});

describe("idea.hook_type and idea.theme accept the explicit 'unclassified' member, against a real migrated database (issue #219)", () => {
  it("an Idea row can be inserted with 'unclassified' for BOTH hook_type and theme", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.doesNotThrow(() => insertIdea(db, { hookType: "unclassified", theme: "unclassified" }));
    });
  });

  it("'unclassified' is distinguishable, in a query, from every real classified value", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      insertIdea(db, { hookType: "unclassified", theme: "unclassified" });
      insertIdea(db, { hookType: VALID_HOOK_TYPE, theme: VALID_THEME });
      const rows = db.prepare(`SELECT hook_type, theme FROM idea WHERE hook_type != 'unclassified'`).all();
      assert.equal(rows.length, 1, "an 'unclassified' Idea must not be indistinguishable from a classified one");
      assert.equal(rows[0]?.hook_type, VALID_HOOK_TYPE);
    });
  });
});

describe("asset.recipe_slug trusts the registry (AC7): all THREE wired Recipe slugs are accepted, an unwired one is not", () => {
  it("accepts each of the registry's real wired slugs, including news-short-script", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const { runId } = insertRunFixture(db);
      const formatRow = db.prepare(`SELECT format_id, brand_id FROM run WHERE id = ?`).get(runId);
      const now = new Date().toISOString();
      const ideaId = randomUUID();
      db.prepare(
        `INSERT INTO idea (id, run_id, brand_id, format_id, title, brief, status, hook_type, theme, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Test Idea', 'A brief.', 'suggested', ?, ?, ?, ?)`,
      ).run(ideaId, runId, formatRow?.brand_id, formatRow?.format_id, VALID_HOOK_TYPE, VALID_THEME, now, now);

      for (const slug of listWiredRecipeSlugs()) {
        assert.doesNotThrow(() => {
          db.prepare(
            `INSERT INTO idea_recipe (id, idea_id, recipe_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          ).run(randomUUID(), ideaId, slug, now, now);
        }, `recipe_slug "${slug}" must be accepted`);
      }
    });
  });

  it("rejects a recipe slug the registry does not wire", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const { runId } = insertRunFixture(db);
      const formatRow = db.prepare(`SELECT format_id, brand_id FROM run WHERE id = ?`).get(runId);
      const now = new Date().toISOString();
      const ideaId = randomUUID();
      db.prepare(
        `INSERT INTO idea (id, run_id, brand_id, format_id, title, brief, status, hook_type, theme, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Test Idea', 'A brief.', 'suggested', ?, ?, ?, ?)`,
      ).run(ideaId, runId, formatRow?.brand_id, formatRow?.format_id, VALID_HOOK_TYPE, VALID_THEME, now, now);
      assert.throws(() => {
        db.prepare(
          `INSERT INTO idea_recipe (id, idea_id, recipe_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(randomUUID(), ideaId, "some-unwired-recipe", now, now);
      }, /FOREIGN KEY/);
    });
  });
});

describe("channel.platform / trend.platform are checked against KNOWN_PLATFORMS", () => {
  it("an unknown platform on channel is rejected", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const brandId = insertBrand(db);
      const now = new Date().toISOString();
      assert.throws(() => {
        db.prepare(
          `INSERT INTO channel (id, brand_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(randomUUID(), brandId, "myspace", now, now);
      }, /CHECK/);
    });
  });
});

describe("schedule_outbox (migration 3, issue #209) — additive; carries id/created_at/updated_at/schema_version despite NOT being in ENTITY_TABLES", () => {
  function insertOutboxRow(db: DatabaseSync, assetId: string, overrides: { readonly idempotencyKey?: string; readonly status?: string; readonly platform?: string } = {}): void {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO schedule_outbox (id, idempotency_key, asset_id, platform, request_json, status, reserved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)`,
    ).run(randomUUID(), overrides.idempotencyKey ?? `key-${randomUUID()}`, assetId, overrides.platform ?? "facebook", overrides.status ?? "reserved", now, now, now);
  }

  it("exists after migration and carries id/created_at/updated_at/schema_version", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const columns = db.prepare(`PRAGMA table_info(schedule_outbox)`).all().map((c) => c.name);
      for (const required of ["id", "created_at", "updated_at", "schema_version"]) {
        assert.ok(columns.includes(required), `schedule_outbox must carry a "${required}" column`);
      }
    });
  });

  it("rejects an unknown asset_id (FOREIGN KEY)", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(() => insertOutboxRow(db, "does-not-exist"), /FOREIGN KEY/);
    });
  });

  it("rejects a duplicate idempotency_key (UNIQUE)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      insertOutboxRow(db, assetId, { idempotencyKey: "dup-key" });
      assert.throws(() => insertOutboxRow(db, assetId, { idempotencyKey: "dup-key" }), /UNIQUE/);
    });
  });

  it("rejects a status outside 'reserved'/'confirmed' (CHECK)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      assert.throws(() => insertOutboxRow(db, assetId, { status: "failed" }), /CHECK/);
    });
  });

  it("rejects a platform outside KNOWN_PLATFORMS (CHECK)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const { assetId } = await seedAsset(db);
      assert.throws(() => insertOutboxRow(db, assetId, { platform: "myspace" }), /CHECK/);
    });
  });
});
