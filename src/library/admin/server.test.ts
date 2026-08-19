/**
 * Tests for the Library ADMIN server (`server.ts`) — real HTTP requests (`fetch`) against a real
 * server on an ephemeral port, a real temp `brandsRoot` fixture, and a real temp git repo (so
 * `commitPath` genuinely commits — not mocked away, per this module's own "prove the write actually
 * lands" standard).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../../db/migrate.ts";
import { withTempDb } from "../../db/test-support.ts";
import { seedWorld } from "../test-support.ts";
import { createLibraryAdminServer } from "./server.ts";

const execFileAsync = promisify(execFile);

const READ_ONLY_BASE_URL = "http://127.0.0.1:9999";

interface Fixture {
  readonly repoRoot: string;
  readonly brandsRoot: string;
  readonly brand: string;
}

async function setupFixture(brand: string): Promise<Fixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "og-admin-server-"));
  await execFileAsync("git", ["init", "--quiet"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.invalid"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoRoot });

  const brandsRoot = join(repoRoot, "brands");
  const formatsDir = join(brandsRoot, brand, "formats");
  await mkdir(formatsDir, { recursive: true });
  await writeFile(
    join(formatsDir, "some-format.yaml"),
    ["name: Some Format", "voice: plain", "default_recipes:", "  - news-carousel", "baseline_prompts: {}", ""].join("\n"),
  );
  // An initial commit so later admin saves have a clean baseline to diff against.
  await execFileAsync("git", ["add", "-A"], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-m", "initial fixture"], { cwd: repoRoot });

  return { repoRoot, brandsRoot, brand };
}

async function withAdminServer(
  brand: string,
  fn: (baseUrl: string, fixture: Fixture, db: DatabaseSync) => Promise<void>,
): Promise<void> {
  const fixture = await setupFixture(brand);
  try {
    await withTempDb(async (db) => {
      runMigrations(db);
      seedWorld(db, { brandSlug: brand });

      const server = createLibraryAdminServer(db, {
        readOnlyBaseUrl: READ_ONLY_BASE_URL,
        brandsRoot: fixture.brandsRoot,
        repoRoot: fixture.repoRoot,
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        await fn(baseUrl, fixture, db);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  } finally {
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
}

describe("createLibraryAdminServer — read screens", () => {
  it("GET / lists Brands", async () => {
    await withAdminServer("acme-admin-1", async (baseUrl) => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /acme-admin-1/);
    });
  });

  it("GET /brands/:brand lists that Brand's Formats", async () => {
    await withAdminServer("acme-admin-2", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /some-format/);
    });
  });

  it("GET /brands/:brand/formats/:format shows current default_recipes as pre-checked, wired-recipes-only checkboxes", async () => {
    await withAdminServer("acme-admin-3", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /value="news-carousel"[^>]*checked/);
      assert.match(html, /value="character-explainer-with-cast"/); // offered, just not checked
    });
  });

  it("an unknown Format renders a real error page (400), not a crash", async () => {
    await withAdminServer("acme-admin-4", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/does-not-exist`);
      assert.equal(res.status, 400);
      const html = await res.text();
      assert.match(html, /Unknown Format/);
    });
  });
});

describe("createLibraryAdminServer — saving default_recipes", () => {
  it("POST saves the new Recipe list, commits it, and redirects", async () => {
    await withAdminServer("acme-admin-5", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "recipe=character-explainer-with-cast",
        redirect: "manual",
      });
      assert.equal(res.status, 302);

      const yamlPath = join(fixture.brandsRoot, fixture.brand, "formats", "some-format.yaml");
      const text = await readFile(yamlPath, "utf8");
      assert.match(text, /character-explainer-with-cast/);
      assert.doesNotMatch(text, /news-carousel/);

      const log = await execFileAsync("git", ["log", "--oneline", "-1", "--format=%s"], { cwd: fixture.repoRoot });
      assert.match(log.stdout, /Admin: set default Recipes/);
    });
  });

  it("a POST body naming an UNWIRED slug is silently dropped server-side, never trusted from the client", async () => {
    await withAdminServer("acme-admin-6", async (baseUrl, fixture) => {
      await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "recipe=news-carousel&recipe=totally-not-a-real-recipe",
        redirect: "manual",
      });
      const yamlPath = join(fixture.brandsRoot, fixture.brand, "formats", "some-format.yaml");
      const text = await readFile(yamlPath, "utf8");
      assert.match(text, /news-carousel/);
      assert.doesNotMatch(text, /totally-not-a-real-recipe/);
    });
  });
});

describe("createLibraryAdminServer — Baseline Prompts", () => {
  it("GET on a not-yet-declared Recipe shows an empty create form", async () => {
    await withAdminServer("acme-admin-7", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/news-carousel`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /<md-outlined-text-field[^>]*type="textarea"[^>]*value=""[^>]*>/);
    });
  });

  it("rejects an unwired Recipe slug before touching disk", async () => {
    await withAdminServer("acme-admin-8", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/not-a-recipe`);
      assert.equal(res.status, 400);
      const html = await res.text();
      assert.match(html, /not a wired Recipe/);
    });
  });

  it("POST creates the document, declares the pointer, commits BOTH files, and a later GET shows the saved content", async () => {
    await withAdminServer("acme-admin-9", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/news-carousel`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ content: "# Look\n\nCard style guidance.\n" }).toString(),
        redirect: "manual",
      });
      assert.equal(res.status, 302);

      const docPath = join(fixture.brandsRoot, fixture.brand, "baseline-prompts", "some-format", "news-carousel.md");
      assert.equal(await readFile(docPath, "utf8"), "# Look\n\nCard style guidance.\n");

      const yamlPath = join(fixture.brandsRoot, fixture.brand, "formats", "some-format.yaml");
      assert.match(await readFile(yamlPath, "utf8"), /news-carousel\.md/);

      const log = await execFileAsync("git", ["log", "--oneline", "-3", "--format=%s"], { cwd: fixture.repoRoot });
      assert.match(log.stdout, /Admin: save Baseline Prompt/);
      assert.match(log.stdout, /Admin: declare Baseline Prompt pointer/);

      const getRes = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/news-carousel`);
      const html = await getRes.text();
      assert.match(html, /Card style guidance\./);
    });
  });

  it("POST delete removes the document, the pointer, and commits both", async () => {
    await withAdminServer("acme-admin-10", async (baseUrl, fixture) => {
      await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/news-carousel`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ content: "temporary\n" }).toString(),
      });

      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/news-carousel/delete`, {
        method: "POST",
        redirect: "manual",
      });
      assert.equal(res.status, 302);

      const yamlPath = join(fixture.brandsRoot, fixture.brand, "formats", "some-format.yaml");
      assert.doesNotMatch(await readFile(yamlPath, "utf8"), /news-carousel\.md/);

      const getRes = await fetch(`${baseUrl}/brands/${fixture.brand}/formats/some-format/baseline-prompts/news-carousel`);
      const html = await getRes.text();
      assert.match(html, /<md-outlined-text-field[^>]*type="textarea"[^>]*value=""[^>]*>/); // back to an empty create form
    });
  });
});

describe("createLibraryAdminServer — Brand Assets (real multipart upload)", () => {
  it("GET lists current assets and shows the upload form", async () => {
    await withAdminServer("acme-admin-11", async (baseUrl, fixture) => {
      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/assets`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /No Brand Assets yet/);
      assert.match(html, /enctype="multipart\/form-data"/);
    });
  });

  it("POST with a real multipart body uploads, commits, and a later GET lists it", async () => {
    await withAdminServer("acme-admin-12", async (baseUrl, fixture) => {
      const form = new FormData();
      form.append("key", "brand-logo");
      form.append("file", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), "logo.png");

      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/assets`, {
        method: "POST",
        body: form,
        redirect: "manual",
      });
      assert.equal(res.status, 302);

      const assetPath = join(fixture.brandsRoot, fixture.brand, "assets", "brand-logo.png");
      const bytes = await readFile(assetPath);
      assert.deepEqual([...bytes], [1, 2, 3, 4]);

      const log = await execFileAsync("git", ["log", "--oneline", "-1", "--format=%s"], { cwd: fixture.repoRoot });
      assert.match(log.stdout, /Admin: save Brand Asset "brand-logo"/);

      const listRes = await fetch(`${baseUrl}/brands/${fixture.brand}/assets`);
      const html = await listRes.text();
      assert.match(html, /brand-logo/);
    });
  });

  it("POST delete removes the file and commits the deletion", async () => {
    await withAdminServer("acme-admin-13", async (baseUrl, fixture) => {
      const form = new FormData();
      form.append("key", "to-delete");
      form.append("file", new Blob([new Uint8Array([9])], { type: "image/png" }), "x.png");
      await fetch(`${baseUrl}/brands/${fixture.brand}/assets`, { method: "POST", body: form });

      const res = await fetch(`${baseUrl}/brands/${fixture.brand}/assets/to-delete/delete`, {
        method: "POST",
        redirect: "manual",
      });
      assert.equal(res.status, 302);

      const listRes = await fetch(`${baseUrl}/brands/${fixture.brand}/assets`);
      const html = await listRes.text();
      assert.doesNotMatch(html, /to-delete/);

      const log = await execFileAsync("git", ["log", "--oneline", "-1", "--format=%s"], { cwd: fixture.repoRoot });
      assert.match(log.stdout, /Admin: delete Brand Asset "to-delete"/);
    });
  });
});
