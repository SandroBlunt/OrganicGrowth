/**
 * Tests for the LinkedIn Handle Lookup's pure deep module (`src/linkedin-handle/lookup.ts`).
 *
 * All in-memory — no filesystem, no network, no Magnific Space (this slice has no Space/MCP code at
 * all, so the fake is not needed here; see `store.test.ts`'s module doc for the I/O-layer equivalent).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  emptyLinkedInHandleTable,
  normalizeCompanyName,
  parseLinkedInHandleTable,
  resolveHandle,
  type LinkedInHandleTable,
} from "./lookup.ts";

/** Run `fn` with console.warn captured, returning both the result and every warning string. */
function captureWarn<T>(fn: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

// ---------------------------------------------------------------------------
// normalizeCompanyName
// ---------------------------------------------------------------------------

describe("normalizeCompanyName — trim + case-fold", () => {
  it("trims surrounding whitespace and lowercases", () => {
    assert.equal(normalizeCompanyName("  1Password  "), "1password");
  });

  it("is idempotent", () => {
    const once = normalizeCompanyName("Anthropic");
    assert.equal(normalizeCompanyName(once), once);
  });
});

// ---------------------------------------------------------------------------
// parseLinkedInHandleTable — defensive parsing
// ---------------------------------------------------------------------------

describe("parseLinkedInHandleTable — parses a well-formed name->handle mapping", () => {
  it("parses every well-formed entry, keyed by normalized name", () => {
    const table = parseLinkedInHandleTable({ Anthropic: "anthropic", "1Password": "1password" });
    assert.equal(table.byNormalizedName.size, 2);
    assert.deepEqual(table.byNormalizedName.get("anthropic"), { name: "Anthropic", handle: "anthropic" });
    assert.deepEqual(table.byNormalizedName.get("1password"), { name: "1Password", handle: "1password" });
  });

  it("trims a handle's surrounding whitespace", () => {
    const table = parseLinkedInHandleTable({ Anthropic: "  anthropic  " });
    assert.equal(table.byNormalizedName.get("anthropic")?.handle, "anthropic");
  });
});

describe("parseLinkedInHandleTable — empty/absent input degrades to the empty table (AC3)", () => {
  it("returns the empty table for null (an empty or comments-only YAML file)", () => {
    const table = parseLinkedInHandleTable(null);
    assert.equal(table.byNormalizedName.size, 0);
  });

  it("returns the empty table for undefined", () => {
    const table = parseLinkedInHandleTable(undefined);
    assert.equal(table.byNormalizedName.size, 0);
  });

  it("returns the empty table for {}", () => {
    const table = parseLinkedInHandleTable({});
    assert.equal(table.byNormalizedName.size, 0);
  });

  it("never throws for a non-object value (e.g. a bare string or array), degrading to empty with a warning", () => {
    const { result, warnings } = captureWarn(() => parseLinkedInHandleTable("not an object"));
    assert.equal(result.byNormalizedName.size, 0);
    assert.ok(warnings.length > 0);
  });

  it("never throws for an array", () => {
    assert.doesNotThrow(() => parseLinkedInHandleTable(["Anthropic"]));
  });
});

describe("parseLinkedInHandleTable — a malformed entry is dropped, never crashes the whole table (data-handling rule 4)", () => {
  it("drops an entry with a blank handle, keeps the well-formed entry, and warns", () => {
    const { result, warnings } = captureWarn(() =>
      parseLinkedInHandleTable({ Anthropic: "anthropic", "Broken Co": "   " }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.equal(resolveHandle(result, "Anthropic"), "anthropic");
    assert.equal(resolveHandle(result, "Broken Co"), null);
    assert.ok(warnings.some((w) => w.includes("Broken Co")));
  });

  it("drops an entry whose handle is not a string, keeps the well-formed entry", () => {
    const { result } = captureWarn(() =>
      parseLinkedInHandleTable({ Anthropic: "anthropic", "Numeric Co": 12345 as unknown as string }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.equal(resolveHandle(result, "Numeric Co"), null);
  });

  it("drops an entry with a blank name", () => {
    const { result, warnings } = captureWarn(() =>
      parseLinkedInHandleTable({ Anthropic: "anthropic", "   ": "ghost" }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.ok(warnings.some((w) => w.includes("blank name")));
  });

  it("keeps the FIRST entry when two names normalize to the same key, and warns about the second", () => {
    const { result, warnings } = captureWarn(() =>
      parseLinkedInHandleTable({ Anthropic: "anthropic-first", anthropic: "anthropic-second" }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.equal(resolveHandle(result, "Anthropic"), "anthropic-first");
    assert.ok(warnings.some((w) => w.includes("duplicate")));
  });
});

// ---------------------------------------------------------------------------
// resolveHandle — typed, never-fabricating lookup (AC2)
// ---------------------------------------------------------------------------

describe("resolveHandle — a found name resolves to its handle (AC2)", () => {
  const table = parseLinkedInHandleTable({ Anthropic: "anthropic", "1Password": "1password" });

  it("resolves an exact, as-authored name", () => {
    assert.equal(resolveHandle(table, "Anthropic"), "anthropic");
  });

  it("resolves case-insensitively and whitespace-trimmed", () => {
    assert.equal(resolveHandle(table, "  anthropic  "), "anthropic");
    assert.equal(resolveHandle(table, "ANTHROPIC"), "anthropic");
  });

  it("resolves a second, distinct entry correctly", () => {
    assert.equal(resolveHandle(table, "1Password"), "1password");
  });
});

describe("resolveHandle — an unresolved name returns null, never fabricated (AC2)", () => {
  const table = parseLinkedInHandleTable({ Anthropic: "anthropic" });

  it("returns null for a name with no committed entry", () => {
    assert.equal(resolveHandle(table, "Unknown Startup"), null);
  });

  it("returns null for a blank/whitespace-only query", () => {
    assert.equal(resolveHandle(table, "   "), null);
  });

  it("never throws for any query string", () => {
    assert.doesNotThrow(() => resolveHandle(table, ""));
  });
});

describe("resolveHandle — against an empty table, every name resolves to null (AC3)", () => {
  it("returns null against emptyLinkedInHandleTable()", () => {
    const table: LinkedInHandleTable = emptyLinkedInHandleTable();
    assert.equal(resolveHandle(table, "Anthropic"), null);
  });

  it("returns null against a table parsed from an empty file's content", () => {
    const table = parseLinkedInHandleTable(null);
    assert.equal(resolveHandle(table, "Anthropic"), null);
  });
});
