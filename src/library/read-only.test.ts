/**
 * THE read-only proof (issue #210's own non-negotiable): "Prove the read-only claim, do not assert
 * it." A viewer that is read-only only because nobody happened to write the write path is exactly the
 * "green-and-blind guard" this epic has already been burned by six times (see this ticket's Build
 * Report). This file proves the STRONGER claim instead: a write attempted through the EXACT SAME
 * database handle the Library server is running against THROWS — enforced by SQLite itself at the
 * connection level (`src/db/connection.ts`'s `{ readOnly: true }`), not by this codebase's own
 * discipline.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { openDatabase } from "../db/connection.ts";
import { runMigrations } from "../db/migrate.ts";
import { createBrand } from "../brand/store.ts";
import { createLibraryServer } from "./server.ts";

describe("the Library's database connection is genuinely read-only, not merely by convention", () => {
  it("a raw SQL write through the SAME handle the server is running against THROWS", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-library-readonly-"));
    try {
      const path = join(root, "organicgrowth.db");

      // Set up: a normal read-write connection creates the schema and one real row, then closes.
      const writer = await openDatabase(path);
      runMigrations(writer);
      createBrand(writer, { slug: "straw-motion", name: "Straw Motion", timezone: "UTC", mediaRoot: "data/brands/straw-motion" });
      writer.close();

      // The Library's OWN connection — opened EXACTLY the way run-library-viewer.ts opens it.
      const reader = await openDatabase(path, { readOnly: true });
      try {
        // It can still be handed straight to the server and serve real GET requests...
        const server = createLibraryServer(reader);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address() as AddressInfo;
        try {
          const res = await fetch(`http://127.0.0.1:${address.port}/`);
          assert.equal(res.status, 200);
        } finally {
          await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
        }

        // ...but a write through the SAME handle throws — a raw SQL statement...
        assert.throws(() => {
          reader.exec(`INSERT INTO brand (id, slug, name, timezone, media_root, created_at, updated_at)
                       VALUES ('x', 'sneaky', 'Sneaky Brand', 'UTC', 'data/brands/sneaky', '2026-01-01', '2026-01-01')`);
        }, /readonly/i);

        // ...and the SAME typed store write function every production caller uses.
        assert.throws(() => {
          createBrand(reader, { slug: "sneaky-2", name: "Sneaky Brand 2", timezone: "UTC", mediaRoot: "data/brands/sneaky-2" });
        }, /readonly/i);

        // Prove it really didn't happen — reopen fresh, read-only again, and count.
      } finally {
        reader.close();
      }

      const verifier = await openDatabase(path, { readOnly: true });
      try {
        const row = verifier.prepare(`SELECT COUNT(*) as c FROM brand`).get() as { readonly c: number };
        assert.equal(row.c, 1, "only the ORIGINAL row must exist — neither write attempt may have landed");
      } finally {
        verifier.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("the CLI's own default open call (openDatabase(path, { readOnly: true })) refuses a database file that does not exist yet — never silently creates one to write into later", async () => {
    const root = await mkdtemp(join(tmpdir(), "og-library-readonly-"));
    try {
      await assert.rejects(() => openDatabase(join(root, "does-not-exist.db"), { readOnly: true }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
