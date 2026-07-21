/**
 * Tests for the Baseline Prompt loader deep module (`src/format/baseline-prompt.ts`; ADR-0015,
 * issue #83). Most tests use in-memory `FormatFile` fixtures + temp-dir fixtures for the document
 * files; one describe block loads the REAL migrated `data/brands/straw-motion/` state to prove
 * issue #83 AC2 (the real pointer resolves to the real, substantial document). No live Magnific
 * Space, no Apify, no network — this slice never touches the Magnific Space (Baseline Prompt
 * documents are plain markdown files, resolved and read entirely on disk). The Magnific fake is NOT
 * needed here.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBaselinePromptPath, loadBaselinePrompt } from "./baseline-prompt.ts";
import { parseFormatFile, formatBaselinePromptsRoot, type FormatFile } from "./store.ts";

// ---------------------------------------------------------------------------
// resolveBaselinePromptPath — pure, no I/O
// ---------------------------------------------------------------------------

describe("resolveBaselinePromptPath — pure path resolution + traversal guard", () => {
  it("resolves a plain relative filename under the Format's baseline-prompts directory", () => {
    const result = resolveBaselinePromptPath("straw-motion", "unhypped-news", "news-carousel.md", "data/brands");
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.path, join("data/brands", "straw-motion", "baseline-prompts", "unhypped-news", "news-carousel.md"));
  });

  it("trims surrounding whitespace on the pointer", () => {
    const result = resolveBaselinePromptPath("straw-motion", "unhypped-news", "  news-carousel.md  ", "data/brands");
    assert.equal(result.ok, true);
  });

  it("rejects an empty pointer", () => {
    const result = resolveBaselinePromptPath("straw-motion", "unhypped-news", "", "data/brands");
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.message, /empty/);
  });

  it("rejects a whitespace-only pointer", () => {
    const result = resolveBaselinePromptPath("straw-motion", "unhypped-news", "   ", "data/brands");
    assert.equal(result.ok, false);
  });

  it("rejects an absolute-path pointer", () => {
    const result = resolveBaselinePromptPath("straw-motion", "unhypped-news", "/etc/passwd", "data/brands");
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.message, /absolute/);
  });

  it("rejects a path-traversal pointer that escapes the Format's own directory", () => {
    const result = resolveBaselinePromptPath(
      "straw-motion",
      "unhypped-news",
      "../../../../etc/passwd",
      "data/brands",
    );
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.message, /escapes/);
  });

  it("rejects a traversal pointer that stays a valid-looking relative path but still escapes", () => {
    const result = resolveBaselinePromptPath(
      "straw-motion",
      "unhypped-news",
      "../other-format/secret.md",
      "data/brands",
    );
    assert.equal(result.ok, false);
  });

  it("still throws for an invalid Format slug (the pre-existing tenancy boundary)", () => {
    assert.throws(
      () => resolveBaselinePromptPath("straw-motion", "../evil", "news-carousel.md", "data/brands"),
      /Invalid Format slug/,
    );
  });

  it("still throws for an invalid Brand slug (the pre-existing tenancy boundary)", () => {
    assert.throws(
      () => resolveBaselinePromptPath("../evil", "unhypped-news", "news-carousel.md", "data/brands"),
      /Invalid Brand slug/,
    );
  });
});

// ---------------------------------------------------------------------------
// loadBaselinePrompt — the async I/O shell, against temp-dir fixtures
// ---------------------------------------------------------------------------

describe("loadBaselinePrompt — typed lookup, never throws for an ordinary 'nothing to read' outcome", () => {
  let tmpBrandsRoot: string;

  before(async () => {
    tmpBrandsRoot = await mkdtemp(join(tmpdir(), "og-baseline-prompt-"));
    const dir = join(tmpBrandsRoot, "acme", "baseline-prompts", "some-format");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "news-carousel.md"), "# The baseline\n\nSome document body.\n");
  });

  after(async () => {
    await rm(tmpBrandsRoot, { recursive: true, force: true });
  });

  const declaredFormat: FormatFile = parseFormatFile(
    {
      name: "Some Format",
      baseline_prompts: {
        "news-carousel": "news-carousel.md",
        "dangling-recipe": "does-not-exist.md",
        "malformed-recipe": "../../../../etc/passwd",
      },
    },
    "some-format",
  );

  it("AC1: found — reads the declared document's real content", async () => {
    const result = await loadBaselinePrompt("acme", declaredFormat, "news-carousel", tmpBrandsRoot);
    assert.equal(result.found, true);
    assert.ok(result.found);
    assert.equal(result.recipe, "news-carousel");
    assert.equal(result.pointer, "news-carousel.md");
    assert.equal(result.content, "# The baseline\n\nSome document body.\n");
    assert.match(result.path, /news-carousel\.md$/);
  });

  it("AC1: 'none' result — a Recipe this Format never declares a pointer for yields a clear not-declared reason, not an error", async () => {
    const result = await loadBaselinePrompt("acme", declaredFormat, "totally-unknown-recipe", tmpBrandsRoot);
    assert.equal(result.found, false);
    assert.ok(!result.found);
    assert.equal(result.reason, "not-declared");
    assert.match(result.message, /declares no Baseline Prompt/);
    assert.match(result.message, /totally-unknown-recipe/);
  });

  it("AC1: a Format with baseline_prompts entirely absent also yields not-declared, not an error", async () => {
    const bare = parseFormatFile({ name: "Bare Format" }, "bare-format");
    const result = await loadBaselinePrompt("acme", bare, "news-carousel", tmpBrandsRoot);
    assert.equal(result.found, false);
    assert.ok(!result.found);
    assert.equal(result.reason, "not-declared");
  });

  it("AC3: dangling pointer — declared but no file on disk — never crashes, clear message", async () => {
    await assert.doesNotReject(async () => {
      const result = await loadBaselinePrompt("acme", declaredFormat, "dangling-recipe", tmpBrandsRoot);
      assert.equal(result.found, false);
      assert.ok(!result.found);
      assert.equal(result.reason, "dangling");
      assert.match(result.message, /does not resolve to a file on disk/);
      assert.match(result.message, /dangling-recipe/);
    });
  });

  it("AC3: malformed pointer (path traversal) — never crashes, clear message, never reads outside the directory", async () => {
    await assert.doesNotReject(async () => {
      const result = await loadBaselinePrompt("acme", declaredFormat, "malformed-recipe", tmpBrandsRoot);
      assert.equal(result.found, false);
      assert.ok(!result.found);
      assert.equal(result.reason, "malformed");
      assert.match(result.message, /malformed/);
      assert.match(result.message, /escapes/);
    });
  });

  it("never throws even when the Brand's baseline-prompts directory does not exist at all", async () => {
    const isolatedFormat = parseFormatFile(
      { name: "No Dir", baseline_prompts: { "news-carousel": "news-carousel.md" } },
      "no-dir-format",
    );
    await assert.doesNotReject(async () => {
      const result = await loadBaselinePrompt("brand-with-no-baseline-prompts-dir", isolatedFormat, "news-carousel", tmpBrandsRoot);
      assert.equal(result.found, false);
      assert.ok(!result.found);
      assert.equal(result.reason, "dangling");
    });
  });
});

// ---------------------------------------------------------------------------
// The REAL migrated straw-motion Baseline Prompt (issue #83 AC2) — default brandsRoot
// ---------------------------------------------------------------------------

describe("straw-motion's real unhypped-news Format carries a real, byte-faithful Baseline Prompt for news-carousel (issue #83 AC2)", () => {
  it("loadFormat + loadBaselinePrompt together resolve the real document", async () => {
    const { loadFormat } = await import("./store.ts");
    const format = await loadFormat("straw-motion", "unhypped-news");
    const result = await loadBaselinePrompt("straw-motion", format, "news-carousel");
    assert.equal(result.found, true);
    assert.ok(result.found);
    assert.equal(
      result.path,
      join(formatBaselinePromptsRoot("straw-motion", "unhypped-news"), "news-carousel.md"),
    );
    assert.ok(result.content.length > 1000, "the real document is a substantial multi-part document, not a stub");
  });

  // The former "byte-faithful to the locked import" test lived here (issue #83) — a one-time guard
  // against an ACCIDENTAL edit of the freshly-imported document. It pinned an exact byte count and
  // SHA-256 by design, so that the FIRST deliberate edit would break it. That edit has now happened
  // (2026-07-21 dry run: Subject rules, per-role narrative formulas, all 7 card styles confirmed) —
  // the document is a living, Operator-edited document now, not a frozen import, so a byte-for-byte
  // pin no longer makes sense to keep. `loadFormat + loadBaselinePrompt together resolve the real
  // document` above still guards the part that matters going forward: the document exists, resolves,
  // and is substantial.
});

// ---------------------------------------------------------------------------
// Architecture: only this loader (and the resolver/store that define the path) ever touch
// baselinePromptsRoot — "reads go through the store" (ADR-0014), proven by a repo-wide scan.
// ---------------------------------------------------------------------------

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC_ROOT = join(HERE, "..");

const ALLOWED_BASELINE_PROMPTS_ROOT_REFERENCES = new Set([
  join(SRC_ROOT, "brand", "resolver.ts"),
  join(SRC_ROOT, "brand", "resolver.test.ts"),
  join(SRC_ROOT, "format", "store.ts"),
  join(SRC_ROOT, "format", "store.test.ts"),
  join(SRC_ROOT, "format", "baseline-prompt.test.ts"), // this file's own message strings mention it
]);

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      files.push(full);
    }
  }
  return files;
}

describe("architecture: only formatBaselinePromptsRoot callers reach baselinePromptsRoot (ADR-0014 store boundary)", () => {
  it("no source file outside the resolver/store references `.baselinePromptsRoot` directly", async () => {
    const files = await collectTsFiles(SRC_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWED_BASELINE_PROMPTS_ROOT_REFERENCES.has(file)) continue;
      const text = await readFile(file, "utf8");
      if (text.includes(".baselinePromptsRoot")) offenders.push(file);
    }
    assert.deepEqual(
      offenders,
      [],
      `expected no direct .baselinePromptsRoot access outside the store/resolver, found: ${offenders.join(", ")}`,
    );
  });
});
