/**
 * Documentation-conformance suite for issue #201 AC1/AC2/AC4: the two superseding ADRs exist, carry
 * the Operator decision date, and are explicitly cross-referenced (never silently contradicted) from
 * the ADRs they partially/fully supersede, from `CONTEXT.md`, and from the always-rules.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

/** Collapses whitespace runs (including a markdown hard line-wrap mid-sentence) to a single space, so
 *  a literal multi-word substring check survives this repo's ~100-column prose wrapping. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Reads `relPath` (relative to the repo root) with whitespace collapsed — every check in this suite
 *  reads through this, so no assertion is fragile against markdown line-wrapping. */
async function read(relPath: string): Promise<string> {
  return collapseWhitespace(await readFile(join(REPO_ROOT, relPath), "utf8"));
}

describe("ADR-0028 records the Post-becomes-its-own-entity reversal (AC1)", () => {
  it("exists, supersedes ADR-0011, and records the Operator decision date", async () => {
    const doc = await read("docs/adr/0028-post-is-its-own-record.md");
    assert.match(doc, /supersedes.{0,80}ADR-0011/is);
    assert.match(doc, /2026-08-16/, "must record the Operator decision date");
    assert.match(doc, /post.{0,20}becomes its own/i);
  });

  it("states its own table shape, keyed on (asset_id, channel_id)", async () => {
    const doc = await read("docs/adr/0028-post-is-its-own-record.md");
    assert.match(doc, /asset_id.*channel_id|channel_id.*asset_id/s);
  });
});

describe("ADR-0029 records the local-SQLite decision (AC2)", () => {
  it("exists, supersedes ADR-0014, and records the Operator decision date", async () => {
    const doc = await read("docs/adr/0029-local-sqlite-behind-the-store-boundary.md");
    assert.match(doc, /supersedes.{0,80}ADR-0014/is);
    assert.match(doc, /2026-08-16/, "must record the Operator decision date");
  });

  it("states local SQLite explicitly — never hosted, never Postgres, never multi-tenant", async () => {
    const doc = await read("docs/adr/0029-local-sqlite-behind-the-store-boundary.md");
    assert.match(doc, /never a hosted service, never Postgres, never multi-tenant/);
    assert.match(doc, /node:sqlite/);
  });

  it("keeps ADR-0014's store-boundary principle explicitly, rather than dropping it", async () => {
    const doc = await read("docs/adr/0029-local-sqlite-behind-the-store-boundary.md");
    assert.match(doc, /KEPT and FULFILLED/);
  });
});

describe("ADR-0011 carries a forward-pointer to ADR-0028, not a silent contradiction", () => {
  it("its own file states it is partially superseded by ADR-0028", async () => {
    const doc = await read("docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md");
    assert.match(doc, /Partially superseded by ADR-0028/);
  });
});

describe("ADR-0014 carries a forward-pointer to ADR-0029, not a silent contradiction", () => {
  it("its own file states it is superseded by ADR-0029", async () => {
    const doc = await read("docs/adr/0014-canonical-state-in-files-behind-store-boundary.md");
    assert.match(doc, /Superseded by ADR-0029/);
  });
});

describe("Rule 7 (always-rules) cites the new SQLite foundation without overclaiming the store swap", () => {
  it("cites docs/adr/0029", async () => {
    const doc = await read(".claude/rules/always/organicgrowth-rules.md");
    assert.match(doc, /docs\/adr\/0029/);
    assert.match(doc, /not yet the backing of any store/);
  });
});

describe("CONTEXT.md's Post entry reflects the ADR-0028 reversal", () => {
  it("cites ADR-0028 and states Post is keyed on (Asset, Channel), not a scalar on the Asset", async () => {
    const doc = await read("CONTEXT.md");
    const start = doc.indexOf("**Post**:");
    assert.ok(start >= 0);
    const section = doc.slice(start, start + 600);
    assert.match(section, /ADR-0028/);
    assert.match(section, /Asset, Channel/);
  });
});
