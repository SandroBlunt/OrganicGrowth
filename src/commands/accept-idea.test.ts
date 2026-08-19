/**
 * Tests for `acceptIdeaCommand` (issue #254 Round 3, Defect B) — the compiled Gate-1 "accept" mutation
 * `/review-ideas` now calls, closing the gap where NOTHING compiled wrote to SQL for the ordinary,
 * everyday accept path (only the rare stranded-idea resume branch did, after Round 2).
 *
 * Every test opens a real, throwaway SQLite file (`withTempDb`) or a throwaway `options.dbPath`, and a
 * throwaway temp `brandsRoot`/`ledger.json`/`queue.json` — never the committed `data/organicgrowth.db`
 * or `data/queue.json`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { acceptIdeaCommand, main as acceptIdeaMain } from "./accept-idea.ts";
import { loadIdeas, findIdea } from "../ledger/ledger.ts";
import { loadQueue } from "../production-queue/store.ts";
import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand, getBrandBySlug } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { getIdeaByLegacyRef } from "../idea/store.ts";
import { listJobsForComposite } from "../production-queue/job-store.ts";
import { openDatabase } from "../db/connection.ts";
import { loadIdeaAssets } from "../asset/store.ts";

const BRAND = "straw-motion";
const FORMAT = "unhypped-news";
const RUN = "2026-W33";
const RECIPE = "news-carousel"; // zero gates
const NOW = "2026-08-18T09:00:00.000Z";

/** A REALISTIC Brief markdown body — mirroring the real shape every straw-motion `idea-NN.md` carries
 *  (`## Talking Points` + `## Source(s)`, this ticket's own handoff.md) — issue #273 round 2: threading
 *  real Brief content through is the whole point of this round's fix, so the fixture accept-idea.test.ts
 *  authors against must be realistic, not title-only, or these tests would exercise a shape that no real
 *  accept ever actually authors from. */
const REALISTIC_BRIEF_BODY =
  "# A brand new headline\n\n" +
  "## Talking Points\n" +
  "- The company shipped a new capability three weeks after its last release.\n" +
  "- Pricing dropped for the introductory period, undercutting every rival offer.\n" +
  "- Independent benchmarks show a real jump in the underlying model's accuracy.\n" +
  "- Engineering teams now face integration fatigue from the pace of change.\n\n" +
  "## Source(s)\n- https://example.com/real-source\n";

/** Writes a throwaway `<brandsRoot>/<brand>/ledger.json` + a real Brief file, mirroring what
 *  `/review-ideas` sees at Gate 1 (one `suggested` Idea, run/format/title/brief_path all recorded, the
 *  shape the SQL sync needs) — entirely under a temp `brandsRoot`. Also returns a throwaway `queuePath`
 *  and `dbPath` (a SQLite file that does NOT exist yet) sitting alongside it, never inside `data/`. */
async function withBrandFixture<T>(
  fn: (paths: { readonly brandsRoot: string; readonly ledgerPath: string; readonly queuePath: string; readonly dbPath: string }) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "og-accept-idea-"));
  const brandDir = join(root, BRAND);
  await mkdir(brandDir, { recursive: true });
  const ledgerPath = join(brandDir, "ledger.json");
  const briefPath = join(brandDir, "idea-01.md");
  const queuePath = join(root, "queue.json");
  const dbPath = join(root, "organicgrowth.db");

  await writeFile(briefPath, REALISTIC_BRIEF_BODY, "utf8");
  const idea = {
    id: "idea-01",
    status: "suggested",
    run: RUN,
    format: FORMAT,
    title: "A brand new headline",
    brief_path: briefPath,
  };
  await writeFile(ledgerPath, JSON.stringify({ ideas: [idea] }), "utf8");

  try {
    return await fn({ brandsRoot: root, ledgerPath, queuePath, dbPath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("acceptIdeaCommand — writes the Recipe selection and sets the Idea accepted (issue #54/#254)", () => {
  it("writes chosen/declined Recipes and sets status: accepted on the ledger", async () => {
    await withBrandFixture(async ({ brandsRoot, ledgerPath, queuePath, dbPath }) => {
      await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [{ recipe: "character-explainer-with-cast", reason: "not this week" }], {
        brandsRoot,
        queuePath,
        dbPath, // ALWAYS an explicit throwaway path in every test — never the default data/organicgrowth.db
        now: () => NOW,
      });

      const ideas = await loadIdeas(ledgerPath, BRAND);
      const idea = findIdea(ideas, "idea-01");
      assert.equal(idea?.status, "accepted");

      const raw = JSON.parse(await readFile(ledgerPath, "utf8")) as { ideas: Array<Record<string, unknown>> };
      const rawIdea = raw.ideas.find((i) => i.id === "idea-01")!;
      assert.deepEqual(rawIdea.recipes, [RECIPE]);
      assert.deepEqual(rawIdea.declined_recipes, [{ recipe: "character-explainer-with-cast", reason: "not this week" }]);
    });
  });

  it("enqueues the chosen Recipe into the file queue (data/queue.json shape, unchanged)", async () => {
    await withBrandFixture(async ({ brandsRoot, queuePath, dbPath }) => {
      // Seed the throwaway dbPath's Brand/Format so the SQL sync (attempted by default) succeeds too —
      // this test then genuinely proves BOTH the file queue AND the default SQL-opening wiring.
      const seedDb = await openDatabase(dbPath);
      runMigrations(seedDb);
      createBrand(seedDb, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(seedDb, { brandId: getBrandBySlug(seedDb, BRAND)!.id, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });
      seedDb.close();

      const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot, queuePath, dbPath, now: () => NOW });
      assert.match(out, /Enqueued for production/i);
      assert.match(out, new RegExp(RECIPE));

      const onDisk = await loadQueue(queuePath);
      assert.equal(onDisk.jobs.length, 1);
      assert.equal(onDisk.jobs[0]!.idea_id, "idea-01");
      assert.equal(onDisk.jobs[0]!.brand, BRAND);
      assert.equal(onDisk.jobs[0]!.recipe, RECIPE);
    });
  });

  it("an empty chosen-Recipe list accepts the Idea but enqueues nothing — says so plainly", async () => {
    await withBrandFixture(async ({ brandsRoot, queuePath, dbPath }) => {
      const out = await acceptIdeaCommand(BRAND, "idea-01", [], [], { brandsRoot, queuePath, dbPath, now: () => NOW });
      assert.match(out, /accepted/i);
      assert.match(out, /No Recipe was chosen/i);

      const onDisk = await loadQueue(queuePath);
      assert.equal(onDisk.jobs.length, 0);
      // An empty chosen list returns BEFORE ever touching the database — proves the db is never even
      // opened when there is nothing to enqueue (no dangling connection, no wasted work).
      await assert.rejects(stat(dbPath), "the db file must never be created when nothing was enqueued");
    });
  });
});

describe("acceptIdeaCommand — SQL sync via an INJECTED already-open db (issue #254)", () => {
  it("with options.db, the SQL job table gains exactly the expected row, alongside the unchanged file queue", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(db, { brandId: getBrandBySlug(db, BRAND)!.id, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      await withBrandFixture(async ({ brandsRoot, queuePath }) => {
        const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot, queuePath, db, now: () => NOW });
        assert.match(out, /SQL sync: idea row created/i);

        const onDiskQueue = await loadQueue(queuePath);
        assert.equal(onDiskQueue.jobs.length, 1, "the file queue is written exactly as before this ticket");

        const brandId = getBrandBySlug(db, BRAND)!.id;
        const sqlIdea = getIdeaByLegacyRef(db, brandId, "idea-01");
        assert.ok(sqlIdea, "the SQL Idea row exists, correlated via legacy_ref");
        assert.equal(sqlIdea!.status, "accepted");
        const jobs = listJobsForComposite(db, brandId, sqlIdea!.id, RECIPE);
        assert.equal(jobs.length, 1, "the SQL job table gained exactly the expected row");
        assert.equal(jobs[0]!.status, "queued");
      });
    });
  });

  it("a SQL sync failure (missing Brand row) is surfaced loudly in the message — the ledger accept + file queue still landed", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      // Deliberately no createBrand/createFormat — the SQL sync WILL fail.

      await withBrandFixture(async ({ brandsRoot, ledgerPath, queuePath }) => {
        const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot, queuePath, db, now: () => NOW });

        assert.match(out, /SQL sync failed/i);
        assert.match(out, /no Brand row for slug "straw-motion"/);

        // The ledger accept and the file queue both still happened — a SQL problem never blocks them.
        const ideas = await loadIdeas(ledgerPath, BRAND);
        assert.equal(findIdea(ideas, "idea-01")?.status, "accepted");
        const onDiskQueue = await loadQueue(queuePath);
        assert.equal(onDiskQueue.jobs.length, 1);
      });
    });
  });
});

describe("acceptIdeaCommand — opens + migrates data/organicgrowth.db BY DEFAULT, never depending on a caller passing db (issue #254 Round 3, Defect B)", () => {
  it("with ONLY options.dbPath given (never options.db), the database is created, migrated, and gains the expected job row — proves the real, everyday accept path writes to SQL through COMPILED code", async () => {
    await withBrandFixture(async ({ brandsRoot, ledgerPath, queuePath, dbPath }) => {
      // The db file does not exist yet — this call must create + migrate it itself, by default.
      await assert.rejects(stat(dbPath)); // sanity: genuinely absent before the call

      // Seed the Brand/Format the sync needs, through a SEPARATE connection to the SAME path, then close
      // it before the command opens its own (SQLite allows this — the file persists).
      const seedDb = await openDatabase(dbPath);
      runMigrations(seedDb);
      createBrand(seedDb, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(seedDb, { brandId: getBrandBySlug(seedDb, BRAND)!.id, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });
      seedDb.close();

      const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot, queuePath, dbPath, now: () => NOW });
      assert.match(out, /SQL sync: idea row created/i);

      // Re-open the SAME file independently and verify the job is really there — never trust the
      // returned message alone.
      const verifyDb: DatabaseSync = await openDatabase(dbPath);
      const brandId = getBrandBySlug(verifyDb, BRAND)!.id;
      const ideas = await loadIdeas(ledgerPath, BRAND);
      const idea = findIdea(ideas, "idea-01");
      assert.equal(idea?.status, "accepted");
      const sqlIdea = getIdeaByLegacyRef(verifyDb, brandId, "idea-01");
      assert.ok(sqlIdea, "the SQL Idea row exists in the database this call opened+migrated itself");
      const jobs = listJobsForComposite(verifyDb, brandId, sqlIdea!.id, RECIPE);
      assert.equal(jobs.length, 1, "exactly one job row exists");
      verifyDb.close();
    });
  });

  it("REGRESSION GUARD: if the default db-opening wiring were ever removed, this test fails — options.dbPath alone must be sufficient, no options.db needed", async () => {
    await withBrandFixture(async ({ brandsRoot, dbPath, queuePath }) => {
      const seedDb = await openDatabase(dbPath);
      runMigrations(seedDb);
      createBrand(seedDb, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(seedDb, { brandId: getBrandBySlug(seedDb, BRAND)!.id, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });
      seedDb.close();

      // The regression this guards against: a caller that (like the real /review-ideas CLI invocation)
      // NEVER constructs a DatabaseSync at all — only a path. If acceptIdeaCommand ever stopped opening
      // the database by default, `result.sql` would be silently absent and this assertion would fail.
      const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot, queuePath, dbPath, now: () => NOW });
      assert.match(out, /SQL sync:/, "a caller giving ONLY dbPath (no db) must still get a real SQL sync outcome");
    });
  });
});

describe("acceptIdeaCommand — authors + self-checks each chosen Recipe's Production Spec BEFORE enqueueing (ADR-0031, issue #264)", () => {
  it("persists the authored Spec onto the SQL Asset row, and regenerates the on-disk file view FROM it", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(db, { brandId: getBrandBySlug(db, BRAND)!.id, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      await withBrandFixture(async ({ brandsRoot, ledgerPath, queuePath }) => {
        const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot, queuePath, db, now: () => NOW });
        assert.doesNotMatch(out, /AUTHORSHIP FAILED/);
        assert.match(out, /Spec persisted for "news-carousel" and regenerated at/);

        const brandId = getBrandBySlug(db, BRAND)!.id;
        const sqlIdea = getIdeaByLegacyRef(db, brandId, "idea-01")!;
        const assets = (await loadIdeaAssets(sqlIdea.id, { db })) as readonly { readonly recipe: string; readonly spec?: unknown }[];
        const asset = assets.find((a) => a.recipe === RECIPE)!;
        assert.ok(asset.spec, "the SQL Asset row carries the authored Spec");
        assert.ok((asset.spec as { slides: unknown[] }).slides.length > 0);

        // The regenerated file view lives beside the Brief, under ideasRoot — read it back and prove it
        // is deep-equal to what SQL holds (a GENERATED view, never a second, independently-authored copy).
        const specPath = join(brandsRoot, BRAND, "ideas", RUN, "idea-01.news-carousel.spec.json");
        const onDisk = JSON.parse(await readFile(specPath, "utf8")) as unknown;
        assert.deepEqual(onDisk, asset.spec);

        // The ledger accept + file queue land exactly as before this ticket.
        const ideas = await loadIdeas(ledgerPath, BRAND);
        assert.equal(findIdea(ideas, "idea-01")?.status, "accepted");
        const onDiskQueue = await loadQueue(queuePath);
        assert.equal(onDiskQueue.jobs.length, 1);
      });
    });
  });

  it("a forced banned-word violation in the Idea's title blocks that Recipe's accept, loudly — no job in either queue, no Spec anywhere", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      createBrand(db, { slug: BRAND, name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      createFormat(db, { brandId: getBrandBySlug(db, BRAND)!.id, slug: FORMAT, name: "Unhypped News", voice: "plain", cadence: "weekly" });

      const root = await mkdtemp(join(tmpdir(), "og-accept-idea-authorship-"));
      try {
        const brandDir = join(root, BRAND);
        await mkdir(brandDir, { recursive: true });
        const ledgerPath = join(brandDir, "ledger.json");
        const briefPath = join(brandDir, "idea-01.md");
        const queuePath = join(root, "queue.json");
        // The AUTHORING step reads banned words from the FILE-backed Brand Profile (loadBannedWords),
        // never from the SQL brand row — this is the config that actually blocks authorship below.
        await writeFile(join(brandDir, "brand-profile.yaml"), "banned_words:\n  - VERBOTEN\n", "utf8");
        await writeFile(briefPath, "# VERBOTEN word in the headline\n\n## Source(s)\n- https://example.com/real-source\n", "utf8");
        await writeFile(
          ledgerPath,
          JSON.stringify({
            ideas: [
              {
                id: "idea-01",
                status: "suggested",
                run: RUN,
                format: FORMAT,
                title: "VERBOTEN word in the headline",
                brief_path: briefPath,
              },
            ],
          }),
          "utf8",
        );

        const out = await acceptIdeaCommand(BRAND, "idea-01", [RECIPE], [], { brandsRoot: root, queuePath, db, now: () => NOW });

        assert.match(out, /AUTHORSHIP FAILED for Recipe "news-carousel"/);
        assert.match(out, /banned-words|VERBOTEN/i);
        assert.match(out, /nothing was enqueued|No Recipe's Spec was successfully authored/i);

        // The ledger still records the accept + the Operator's ORIGINAL chosen Recipe set.
        const ideas = await loadIdeas(ledgerPath, BRAND);
        assert.equal(findIdea(ideas, "idea-01")?.status, "accepted");
        const raw = JSON.parse(await readFile(ledgerPath, "utf8")) as { ideas: Array<Record<string, unknown>> };
        assert.deepEqual(raw.ideas[0]!.recipes, [RECIPE]);

        // Neither queue gained a job for this Recipe.
        const onDiskQueue = await loadQueue(queuePath);
        assert.equal(onDiskQueue.jobs.length, 0);
        const brandId = getBrandBySlug(db, BRAND)!.id;
        const sqlIdea = getIdeaByLegacyRef(db, brandId, "idea-01");
        if (sqlIdea !== null) {
          const jobs = listJobsForComposite(db, brandId, sqlIdea.id, RECIPE);
          assert.equal(jobs.length, 0);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});

describe("accept-idea CLI main() — argv parsing and usage-error path", () => {
  it("writes a usage message to stderr and sets a non-zero exit code when required args are absent", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };
    try {
      process.argv = ["node", "accept-idea.ts"];
      process.exitCode = 0;
      await acceptIdeaMain();
      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i);
      assert.notEqual(process.exitCode, 0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });

  it("requires <chosen-csv> specifically — omitting only it is still a usage error", async () => {
    // main() has no options-injection seam, by design (mirrors every other command's CLI entry, e.g.
    // log-post.ts's own main() tests) — so these tests only exercise the usage-error path, never a real
    // run, which would otherwise touch the real data/organicgrowth.db and data/queue.json.
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };
    try {
      process.argv = ["node", "accept-idea.ts", BRAND, "idea-01"]; // brand + idea-id given, chosen-csv missing
      process.exitCode = 0;
      await acceptIdeaMain();
      const stderr = stderrChunks.join("");
      assert.match(stderr, /usage/i);
      assert.match(stderr, /chosen-csv/i, "usage message must mention <chosen-csv>");
      assert.notEqual(process.exitCode, 0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      (process.stderr as NodeJS.WriteStream).write = originalStderrWrite as typeof process.stderr.write;
    }
  });
});
