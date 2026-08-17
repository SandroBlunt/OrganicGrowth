/**
 * Tests for `importCommand` (`src/importer/cli.ts`) — issue #204.
 *
 * The orchestration shell tying `planImport` -> `executeImport` -> `buildReconciliation` into the
 * single command AC10/AC11 describe: "the real run is a single command with no remaining unknowns."
 * Tested here exactly like the rehearsal will run it — against a temp checkout copy and a temp,
 * throwaway SQLite database file (never `:memory:`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigrations } from "../db/migrate.ts";
import { openDatabase } from "../db/connection.ts";
import { listBrands } from "../brand/store.ts";

import { importCommand } from "./cli.ts";

const LEGACY_PREFIX = "/Users/CaxtonTaylor/Developer/OrganicGrowth";

interface MiniRepoFile {
  readonly path: string;
  readonly content: string;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

async function withMiniRepo(files: readonly MiniRepoFile[], fn: (checkoutRoot: string, dbPath: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "og-importer-cli-"));
  try {
    for (const file of files) {
      await mkdir(join(root, file.path, ".."), { recursive: true });
      await writeFile(join(root, file.path), file.content, "utf8");
    }
    await fn(root, join(root, "organicgrowth.db"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const HAPPY_PATH_FILES: MiniRepoFile[] = [
  { path: "data/brands/acme/brand-profile.yaml", content: "niche: test\n" },
  { path: "data/brands/acme/formats/news.yaml", content: 'name: "News"\nvoice: "plain"\ncadence: weekly\n' },
  {
    path: "data/brands/acme/ledger.json",
    content: json({
      ideas: [
        {
          id: "idea-01",
          run: "2026-W01",
          title: "A real story",
          format: "news",
          status: "accepted",
          recipes: ["news-carousel"],
          created_at: "2026-01-01T00:00:00Z",
          assets: [{ recipe: "news-carousel", status: "queued" }],
        },
      ],
    }),
  },
  { path: "data/brands/acme/ideas/news/2026-W01/idea-01.md", content: "# A real story\n" },
  { path: "data/queue.json", content: json({ jobs: [{ idea_id: "idea-01", brand: "acme", recipe: "news-carousel", gate: null, status: "queued", enqueued_at: "2026-01-01T00:00:00Z" }] }) },
];

describe("importCommand — plan, execute, reconcile, in one call", () => {
  it("succeeds, writes the database, and returns a reconciliation report", async () => {
    await withMiniRepo(HAPPY_PATH_FILES, async (checkoutRoot, dbPath) => {
      const result = await importCommand(
        ["--brands", "acme", "--checkout-root", checkoutRoot, "--legacy-prefix", LEGACY_PREFIX, "--db", dbPath],
        { now: () => "2026-01-01T00:00:00Z" },
      );
      assert.equal(result.ok, true);
      assert.match(result.report, /acme/);
      assert.match(result.report, /\*\*1\*\*/); // totals row shows 1 Idea

      const db = await openDatabase(dbPath);
      try {
        assert.equal(listBrands(db).length, 1);
      } finally {
        db.close();
      }
    });
  });

  it("writes the reconciliation to --reconciliation-out when given", async () => {
    await withMiniRepo(HAPPY_PATH_FILES, async (checkoutRoot, dbPath) => {
      const outPath = join(checkoutRoot, "reconciliation.md");
      const result = await importCommand(
        ["--brands", "acme", "--checkout-root", checkoutRoot, "--legacy-prefix", LEGACY_PREFIX, "--db", dbPath, "--reconciliation-out", outPath],
        { now: () => "2026-01-01T00:00:00Z" },
      );
      assert.equal(result.ok, true);
      const written = await readFile(outPath, "utf8");
      assert.equal(written, result.report);
    });
  });

  it("refuses (writes nothing) when the plan has a problem, and reports why", async () => {
    const files: MiniRepoFile[] = [
      { path: "data/brands/acme/brand-profile.yaml", content: "niche: test\n" },
      { path: "data/brands/acme/formats/news.yaml", content: 'name: "News"\nvoice: "plain"\n' },
      { path: "data/brands/acme/ledger.json", content: json({ ideas: [{ id: "idea-01", run: "2026-W01", format: "news", status: "suggested" }] }) },
      { path: "data/queue.json", content: json({ jobs: [] }) },
      // Deliberately no idea-01.md — a missing Brief.
    ];
    await withMiniRepo(files, async (checkoutRoot, dbPath) => {
      const result = await importCommand(["--brands", "acme", "--checkout-root", checkoutRoot, "--legacy-prefix", LEGACY_PREFIX, "--db", dbPath]);
      assert.equal(result.ok, false);
      assert.match(result.report, /no Brief found/);

      const db = await openDatabase(dbPath);
      try {
        assert.equal(listBrands(db).length, 0, "nothing written on a refusal");
      } finally {
        db.close();
      }
    });
  });

  it("refuses to run against a non-empty database, naming why (one-shot, not incremental)", async () => {
    await withMiniRepo(HAPPY_PATH_FILES, async (checkoutRoot, dbPath) => {
      const db = await openDatabase(dbPath);
      runMigrations(db);
      db.close();

      // First run populates it.
      await importCommand(["--brands", "acme", "--checkout-root", checkoutRoot, "--legacy-prefix", LEGACY_PREFIX, "--db", dbPath], { now: () => "2026-01-01T00:00:00Z" });

      // A second run against the SAME (now non-empty) database must refuse, not partially double-write.
      await assert.rejects(
        importCommand(["--brands", "acme", "--checkout-root", checkoutRoot, "--legacy-prefix", LEGACY_PREFIX, "--db", dbPath]),
        /non-empty database/,
      );
    });
  });
});
