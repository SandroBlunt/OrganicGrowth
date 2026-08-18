/**
 * Tests for the Library's HTTP server (issue #210) — a real server on an ephemeral port, real HTTP
 * requests (`fetch`), against a real temp SQLite database. Covers the routes AC2/AC4/AC5/AC6 ask for,
 * PLUS AC10's own requirement directly: every non-GET method is refused with 405, for every path, with
 * no exception.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { updateBrand } from "../brand/store.ts";
import { addAssetMedia } from "../asset/store.ts";
import { seedWorld, seedLibraryIdea, seedLibraryAsset, seedLibraryPost, seedLibraryJob } from "./test-support.ts";
import { createLibraryServer } from "./server.ts";

async function withServer(fn: (baseUrl: string, db: DatabaseSync) => Promise<void>): Promise<void> {
  const mediaRoot = await mkdtemp(join(tmpdir(), "og-library-server-"));
  try {
    await withTempDb(async (db) => {
      runMigrations(db);
      const world = seedWorld(db);
      updateBrand(db, world.brandId, { mediaRoot });

      const ideaId = seedLibraryIdea(world, { title: "Server test idea", hookType: "irony", theme: "safety_or_risk", fitScore: 0.6 });
      const assetId = await seedLibraryAsset(world, ideaId, "news-carousel", { status: "produced", spec: { slides: [] } });
      seedLibraryPost(world, assetId, { score: 0.5, postUrl: "https://facebook.com/p/server-test" });
      seedLibraryJob(world, assetId, "done");

      await mkdir(join(mediaRoot, "media"), { recursive: true });
      await writeFile(join(mediaRoot, "media", "pic.jpg"), Buffer.from("bytes-on-disk"));
      addAssetMedia(db, assetId, { ordinal: 0, kind: "image", storageKey: "media/pic.jpg", mime: "image/jpeg", bytes: 13, checksum: "x" });

      const server = createLibraryServer(db);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        await fn(baseUrl, db);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
}

describe("createLibraryServer — GET routes", () => {
  it("GET / renders the Library screen, including the seeded Asset", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.match(body, /Server test idea/);
      assert.match(body, /irony/);
    });
  });

  it("GET /?hookType=irony narrows to matching rows; a non-matching filter returns zero", async () => {
    await withServer(async (baseUrl) => {
      const matching = await (await fetch(`${baseUrl}/?hookType=irony`)).text();
      assert.match(matching, /Server test idea/);

      const nonMatching = await (await fetch(`${baseUrl}/?hookType=reframe`)).text();
      assert.doesNotMatch(nonMatching, /Server test idea/);
      assert.match(nonMatching, /No Assets match this filter/);
    });
  });

  it("GET /?status=produced narrows to matching rows; a non-matching status returns zero", async () => {
    await withServer(async (baseUrl) => {
      const matching = await (await fetch(`${baseUrl}/?status=produced`)).text();
      assert.match(matching, /Server test idea/);

      const nonMatching = await (await fetch(`${baseUrl}/?status=posted`)).text();
      assert.doesNotMatch(nonMatching, /Server test idea/);
      assert.match(nonMatching, /No Assets match this filter/);
    });
  });

  it("GET /vendor/@material/web/button/filled-button.js serves the real installed component as JS", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/vendor/@material/web/button/filled-button.js`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/javascript; charset=utf-8");
      const body = await res.text();
      assert.match(body, /FilledButton/);
    });
  });

  it("GET /vendor/... 404s for a package outside the allow-list", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/vendor/typescript/lib/typescript.js`);
      assert.equal(res.status, 404);
    });
  });

  it("GET /assets/:id renders the Asset page together with its Spec/media/copy/posts", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/`);
      const listHtml = await res.text();
      const match = /\/assets\/([a-zA-Z0-9-]+)/.exec(listHtml);
      assert.ok(match, "the Library page must link to at least one Asset");
      const detailRes = await fetch(`${baseUrl}${match![0]}`);
      assert.equal(detailRes.status, 200);
      const detailHtml = await detailRes.text();
      assert.match(detailHtml, /Server test idea/);
      assert.match(detailHtml, /facebook\.com\/p\/server-test/);
    });
  });

  it("GET /assets/:id 404s for an unknown id", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/assets/does-not-exist`);
      assert.equal(res.status, 404);
    });
  });

  it("GET /media/:id streams the real bytes back with the recorded mime type", async () => {
    await withServer(async (baseUrl) => {
      // Look the media id up the same way the Asset page would link to it.
      const assetsHtml = await (await fetch(`${baseUrl}/`)).text();
      const assetIdMatch = /\/assets\/([a-zA-Z0-9-]+)/.exec(assetsHtml)!;
      const detailHtml = await (await fetch(`${baseUrl}${assetIdMatch[0]}`)).text();
      const mediaMatch = /\/media\/([a-zA-Z0-9-]+)/.exec(detailHtml)!;
      const res = await fetch(`${baseUrl}${mediaMatch[0]}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/jpeg");
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.toString("utf8"), "bytes-on-disk");
    });
  });

  it("GET /media/:id 404s for an unknown media id", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/media/does-not-exist`);
      assert.equal(res.status, 404);
    });
  });

  it("GET /queue renders the seeded Job's status", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/queue`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.match(body, /Server test idea/);
    });
  });

  it("GET /chart renders the Fit-vs-Performance chart", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/chart`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.match(body, /Fit Score \(predicted\)/);
      assert.match(body, /Performance Score \(measured\)/);
    });
  });

  it("GET /top renders the top-scored Asset with its Spec", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/top`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.match(body, /Server test idea/);
    });
  });

  it("an unknown path 404s", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/nowhere`);
      assert.equal(res.status, 404);
    });
  });
});

describe("createLibraryServer — AC10: no write path at all, for ANY path", () => {
  const METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
  const PATHS = ["/", "/queue", "/chart", "/top", "/assets/anything", "/media/anything", "/vendor/@material/web/button/filled-button.js", "/nowhere"] as const;

  for (const method of METHODS) {
    for (const path of PATHS) {
      it(`${method} ${path} is refused with 405 — never accepted, never a disabled-but-wired endpoint`, async () => {
        await withServer(async (baseUrl) => {
          const res = await fetch(`${baseUrl}${path}`, { method });
          assert.equal(res.status, 405);
          assert.equal(res.headers.get("allow"), "GET");
        });
      });
    }
  }
});
