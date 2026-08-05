/**
 * Tests for the Mention Handle Registry's pure deep module (`src/mention-handle/lookup.ts`).
 *
 * All in-memory — no filesystem, no network, no Magnific Space (this slice has no Space/MCP code at
 * all, so the fake is not needed here; see `store.test.ts`'s module doc for the I/O-layer equivalent).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  emptyMentionHandleTable,
  normalizeCompanyName,
  parseMentionHandleTable,
  resolveHandle,
  type MentionHandleTable,
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
// parseMentionHandleTable — defensive parsing
// ---------------------------------------------------------------------------

describe("parseMentionHandleTable — parses a well-formed company->platform->handle mapping", () => {
  it("parses every well-formed entry, keyed by normalized company name, each carrying its per-platform handles", () => {
    const table = parseMentionHandleTable({
      Anthropic: { linkedin: "anthropic", x: "AnthropicAI" },
      "1Password": { linkedin: "1password" },
    });
    assert.equal(table.byNormalizedName.size, 2);
    const anthropic = table.byNormalizedName.get("anthropic");
    assert.equal(anthropic?.name, "Anthropic");
    assert.equal(anthropic?.handles.get("linkedin"), "anthropic");
    assert.equal(anthropic?.handles.get("x"), "AnthropicAI");
    const onePassword = table.byNormalizedName.get("1password");
    assert.equal(onePassword?.name, "1Password");
    assert.equal(onePassword?.handles.get("linkedin"), "1password");
    assert.equal(onePassword?.handles.get("x"), undefined);
  });

  it("trims a handle's surrounding whitespace", () => {
    const table = parseMentionHandleTable({ Anthropic: { linkedin: "  anthropic  " } });
    assert.equal(table.byNormalizedName.get("anthropic")?.handles.get("linkedin"), "anthropic");
  });

  it("matches a platform key case-insensitively and whitespace-trimmed", () => {
    const table = parseMentionHandleTable({ Anthropic: { " LinkedIn ": "anthropic" } });
    assert.equal(table.byNormalizedName.get("anthropic")?.handles.get("linkedin"), "anthropic");
  });

  it("recognizes every documented platform (linkedin / x / instagram / tiktok / facebook)", () => {
    const table = parseMentionHandleTable({
      Anthropic: {
        linkedin: "anthropic-li",
        x: "anthropic-x",
        instagram: "anthropic-ig",
        tiktok: "anthropic-tt",
        facebook: "anthropic-fb",
      },
    });
    const entry = table.byNormalizedName.get("anthropic");
    assert.equal(entry?.handles.size, 5);
  });
});

describe("parseMentionHandleTable — empty/absent input degrades to the empty table (AC3)", () => {
  it("returns the empty table for null (an empty or comments-only YAML file)", () => {
    const table = parseMentionHandleTable(null);
    assert.equal(table.byNormalizedName.size, 0);
  });

  it("returns the empty table for undefined", () => {
    const table = parseMentionHandleTable(undefined);
    assert.equal(table.byNormalizedName.size, 0);
  });

  it("returns the empty table for {}", () => {
    const table = parseMentionHandleTable({});
    assert.equal(table.byNormalizedName.size, 0);
  });

  it("never throws for a non-object value (e.g. a bare string), degrading to empty with a warning", () => {
    const { result, warnings } = captureWarn(() => parseMentionHandleTable("not an object"));
    assert.equal(result.byNormalizedName.size, 0);
    assert.ok(warnings.length > 0);
  });

  it("never throws for an array", () => {
    assert.doesNotThrow(() => parseMentionHandleTable(["Anthropic"]));
  });
});

describe("parseMentionHandleTable — a malformed entry is dropped, never crashes the whole table (data-handling rule 4)", () => {
  it("drops an entry with a blank company name, keeps the well-formed entry, and warns", () => {
    const { result, warnings } = captureWarn(() =>
      parseMentionHandleTable({ Anthropic: { linkedin: "anthropic" }, "   ": { linkedin: "ghost" } }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.ok(warnings.some((w) => w.includes("blank company name")));
  });

  it("drops an entry whose value isn't a platform->handle mapping (e.g. a bare string)", () => {
    const { result, warnings } = captureWarn(() =>
      parseMentionHandleTable({
        Anthropic: { linkedin: "anthropic" },
        "Broken Co": "not-an-object" as unknown as Record<string, string>,
      }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.equal(resolveHandle(result, "Broken Co", "linkedin"), null);
    assert.ok(warnings.some((w) => w.includes("Broken Co")));
  });

  it("drops an unrecognized platform key, but keeps that company's other, valid platform handles", () => {
    const { result, warnings } = captureWarn(() =>
      parseMentionHandleTable({ Anthropic: { linkedin: "anthropic", mastodon: "anthropic-mastodon" } }),
    );
    const entry = result.byNormalizedName.get("anthropic");
    assert.equal(entry?.handles.size, 1);
    assert.equal(entry?.handles.get("linkedin"), "anthropic");
    assert.ok(warnings.some((w) => w.includes("mastodon")));
  });

  it("drops a blank/non-string handle for one platform, keeps the company's other platform handles", () => {
    const { result, warnings } = captureWarn(() =>
      parseMentionHandleTable({ Anthropic: { linkedin: "anthropic", x: "   " } }),
    );
    const entry = result.byNormalizedName.get("anthropic");
    assert.equal(entry?.handles.size, 1);
    assert.equal(entry?.handles.get("x"), undefined);
    assert.ok(warnings.some((w) => w.includes("x handle")));
  });

  it("drops a non-string handle value", () => {
    const { result } = captureWarn(() =>
      parseMentionHandleTable({ Anthropic: { linkedin: 12345 as unknown as string } }),
    );
    assert.equal(result.byNormalizedName.size, 0);
  });

  it("drops the WHOLE company entry when it ends up with zero valid platform handles", () => {
    const { result, warnings } = captureWarn(() =>
      parseMentionHandleTable({ "Ghost Co": { mastodon: "ghost", x: "   " } }),
    );
    assert.equal(result.byNormalizedName.size, 0);
    assert.ok(warnings.some((w) => w.includes("Ghost Co") && w.includes("no valid platform handles")));
  });

  it("keeps the FIRST entry when two company names normalize to the same key, and warns about the second", () => {
    const { result, warnings } = captureWarn(() =>
      parseMentionHandleTable({
        Anthropic: { linkedin: "anthropic-first" },
        anthropic: { linkedin: "anthropic-second" },
      }),
    );
    assert.equal(result.byNormalizedName.size, 1);
    assert.equal(resolveHandle(result, "Anthropic", "linkedin"), "anthropic-first");
    assert.ok(warnings.some((w) => w.includes("duplicate")));
  });
});

// ---------------------------------------------------------------------------
// resolveHandle — typed, platform-keyed, never-fabricating lookup (AC2)
// ---------------------------------------------------------------------------

describe("resolveHandle — a found (company, platform) pair resolves to its handle (AC2)", () => {
  const table = parseMentionHandleTable({
    Anthropic: { linkedin: "anthropic", x: "AnthropicAI" },
    "1Password": { linkedin: "1password" },
  });

  it("resolves an exact, as-authored company name and platform", () => {
    assert.equal(resolveHandle(table, "Anthropic", "linkedin"), "anthropic");
  });

  it("resolves case-insensitively and whitespace-trimmed on the company name", () => {
    assert.equal(resolveHandle(table, "  anthropic  ", "linkedin"), "anthropic");
    assert.equal(resolveHandle(table, "ANTHROPIC", "x"), "AnthropicAI");
  });

  it("resolves a second, distinct company correctly", () => {
    assert.equal(resolveHandle(table, "1Password", "linkedin"), "1password");
  });
});

describe("resolveHandle — a missing platform key on an otherwise-known company resolves to null, never a guess (AC2)", () => {
  const table = parseMentionHandleTable({ Anthropic: { linkedin: "anthropic" } });

  it("returns null for a platform the company has no committed handle for", () => {
    assert.equal(resolveHandle(table, "Anthropic", "x"), null);
    assert.equal(resolveHandle(table, "Anthropic", "instagram"), null);
    assert.equal(resolveHandle(table, "Anthropic", "tiktok"), null);
    assert.equal(resolveHandle(table, "Anthropic", "facebook"), null);
  });
});

describe("resolveHandle — an unresolved company returns null, never fabricated (AC2)", () => {
  const table = parseMentionHandleTable({ Anthropic: { linkedin: "anthropic" } });

  it("returns null for a company with no committed entry at all", () => {
    assert.equal(resolveHandle(table, "Unknown Startup", "linkedin"), null);
  });

  it("returns null for a blank/whitespace-only query", () => {
    assert.equal(resolveHandle(table, "   ", "linkedin"), null);
  });

  it("never throws for any query string", () => {
    assert.doesNotThrow(() => resolveHandle(table, "", "linkedin"));
  });
});

describe("resolveHandle — against an empty table, every (company, platform) pair resolves to null (AC3)", () => {
  it("returns null against emptyMentionHandleTable()", () => {
    const table: MentionHandleTable = emptyMentionHandleTable();
    assert.equal(resolveHandle(table, "Anthropic", "linkedin"), null);
  });

  it("returns null against a table parsed from an empty file's content", () => {
    const table = parseMentionHandleTable(null);
    assert.equal(resolveHandle(table, "Anthropic", "linkedin"), null);
  });
});
