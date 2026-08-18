/**
 * Tests for the `/vendor/...` static route's own path resolution (`resolveVendorFile`, pure) and file
 * read (`readVendorFile`), against the REAL `node_modules` this repo installs — never a fixture tree —
 * since the whole point is "does the real @material/web + lit install actually resolve this way."
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";

import { resolveVendorFile, readVendorFile } from "./vendor-assets.ts";

describe("resolveVendorFile — pure path resolution, no disk touched", () => {
  it("resolves an allow-listed package's subpath to its real node_modules location", () => {
    const resolved = resolveVendorFile("/vendor/@material/web/button/filled-button.js");
    assert.equal(resolved, join(process.cwd(), "node_modules", "@material/web", "button/filled-button.js"));
  });

  it("resolves an unscoped allow-listed package the same way", () => {
    const resolved = resolveVendorFile("/vendor/tslib/tslib.es6.js");
    assert.equal(resolved, join(process.cwd(), "node_modules", "tslib", "tslib.es6.js"));
  });

  it("rejects a package outside the allow-list, even one genuinely installed", () => {
    assert.equal(resolveVendorFile("/vendor/typescript/lib/typescript.js"), null);
  });

  it("rejects anything that is not a .js file", () => {
    assert.equal(resolveVendorFile("/vendor/@material/web/package.json"), null);
  });

  it("rejects a path with no subpath at all", () => {
    assert.equal(resolveVendorFile("/vendor/lit"), null);
    assert.equal(resolveVendorFile("/vendor/@material/web"), null);
  });

  it("rejects a literal .. path segment — no escaping the package's own directory", () => {
    assert.equal(resolveVendorFile("/vendor/lit/../../../etc/passwd.js"), null);
    assert.equal(resolveVendorFile("/vendor/@material/web/../../../../etc/passwd.js"), null);
  });

  it("treats a percent-encoded .. as a literal, nonexistent segment, never decoding it", () => {
    const resolved = resolveVendorFile("/vendor/lit/%2e%2e/%2e%2e/secret.js");
    // Not rejected by the literal ".." check (there is none, undecoded) — but resolves INSIDE lit's own
    // directory, to a path that will not exist on disk. readVendorFile below proves this 404s.
    assert.ok(resolved !== null);
    assert.ok(resolved!.startsWith(join(process.cwd(), "node_modules", "lit") + sep));
  });

  it("rejects an empty vendor path", () => {
    assert.equal(resolveVendorFile("/vendor/"), null);
  });

  it("rejects a path that is not under /vendor/ at all", () => {
    assert.equal(resolveVendorFile("/lit/index.js"), null);
  });
});

describe("readVendorFile — reads the real installed package", () => {
  it("returns the real bytes of an allow-listed, genuinely installed file", async () => {
    const bytes = await readVendorFile("/vendor/@material/web/button/filled-button.js");
    assert.ok(bytes !== null);
    assert.ok(bytes!.length > 0);
    assert.match(bytes!.toString("utf-8"), /FilledButton/);
  });

  it("returns null for a rejected path, never throwing", async () => {
    assert.equal(await readVendorFile("/vendor/typescript/lib/typescript.js"), null);
  });

  it("returns null for an allow-listed package's subpath that does not exist on disk, never throwing", async () => {
    assert.equal(await readVendorFile("/vendor/lit/does-not-exist.js"), null);
  });

  it("returns null for the percent-encoded traversal attempt — the literal segment never exists on disk", async () => {
    assert.equal(await readVendorFile("/vendor/lit/%2e%2e/%2e%2e/secret.js"), null);
  });
});
