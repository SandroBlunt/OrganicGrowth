/**
 * Tests for `src/copy/linkedin-mentions.ts` (issue #130, epic #120).
 *
 * All Space/network-independent — this slice has no Magnific Space or MCP code at all (pure Copy-
 * composition + a plain-file lookup), so the Magnific fake is not exercised here; nothing to fake for
 * it. `weaveLinkedInMentions`'s own async shell is tested against temp-dir `linkedin-handles.yaml`
 * fixtures, mirroring `src/linkedin-handle/store.test.ts`'s own isolation pattern.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  companiesFromCopyInput,
  buildLinkedInMentionResolutions,
  injectLinkedInMentions,
  unresolvedMentionNames,
  weaveLinkedInMentions,
  type LinkedInMentionResolution,
} from "./linkedin-mentions.ts";
import type { CopyInput } from "./draft.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "og-linkedin-mentions-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// companiesFromCopyInput
// ---------------------------------------------------------------------------

describe("companiesFromCopyInput — gathers ONLY the Spec's structured companies data, deduped, in order", () => {
  it("returns input.companies unchanged when there is no slideNarrative", () => {
    const input: CopyInput = { title: "AI news", companies: ["OpenAI", "Anthropic"] };
    assert.deepEqual(companiesFromCopyInput(input), ["OpenAI", "Anthropic"]);
  });

  it("merges every slideNarrative beat's companies, in beat order, after input.companies", () => {
    const input: CopyInput = {
      title: "AI news",
      companies: ["OpenAI"],
      slideNarrative: [
        { role: "hook", text: "hook text", companies: ["Anthropic"] },
        { role: "shift", text: "shift text", companies: ["Meta"] },
      ],
    };
    assert.deepEqual(companiesFromCopyInput(input), ["OpenAI", "Anthropic", "Meta"]);
  });

  it("dedupes case-insensitively, keeping the FIRST-seen casing", () => {
    const input: CopyInput = {
      title: "AI news",
      companies: ["OpenAI"],
      slideNarrative: [{ role: "hook", text: "hook text", companies: ["openai", "OPENAI"] }],
    };
    assert.deepEqual(companiesFromCopyInput(input), ["OpenAI"]);
  });

  it("never reads free-prose fields (title/angle/mediaContext) — only the structured companies data", () => {
    const input: CopyInput = {
      title: "Anthropic just shipped something huge",
      angle: "OpenAI is watching closely",
      mediaContext: "Meta reacted within hours",
    };
    assert.deepEqual(companiesFromCopyInput(input), []);
  });

  it("returns [] for a CopyInput with no companies data at all (absent fields)", () => {
    assert.deepEqual(companiesFromCopyInput({ title: "AI news" }), []);
  });

  it("returns [] for a CopyInput whose companies/slideNarrative are present but empty", () => {
    const input: CopyInput = { title: "AI news", companies: [], slideNarrative: [{ role: "hook", text: "t", companies: [] }] };
    assert.deepEqual(companiesFromCopyInput(input), []);
  });

  it("skips a blank/whitespace-only company name without throwing", () => {
    const input: CopyInput = { title: "AI news", companies: ["  ", "OpenAI"] };
    assert.deepEqual(companiesFromCopyInput(input), ["OpenAI"]);
  });
});

// ---------------------------------------------------------------------------
// buildLinkedInMentionResolutions
// ---------------------------------------------------------------------------

describe("buildLinkedInMentionResolutions — resolved handle -> @Name, unresolved -> plain name", () => {
  it("marks a resolved company as @Name (the plain name, never the raw handle slug), resolved: true", () => {
    const handles = new Map<string, string | null>([["OpenAI", "openai"]]);
    const result = buildLinkedInMentionResolutions(["OpenAI"], handles);
    assert.deepEqual(result, [{ name: "OpenAI", mention: "@OpenAI", resolved: true }]);
  });

  it("marks an unresolved company as its own plain name, resolved: false", () => {
    const handles = new Map<string, string | null>([["Unknown Startup", null]]);
    const result = buildLinkedInMentionResolutions(["Unknown Startup"], handles);
    assert.deepEqual(result, [{ name: "Unknown Startup", mention: "Unknown Startup", resolved: false }]);
  });

  it("treats a company missing from the handle map the same as an explicit null (never fabricates)", () => {
    const result = buildLinkedInMentionResolutions(["Ghost Co"], new Map());
    assert.deepEqual(result, [{ name: "Ghost Co", mention: "Ghost Co", resolved: false }]);
  });

  it("handles a mixed list, preserving order", () => {
    const handles = new Map<string, string | null>([["OpenAI", "openai"], ["Unknown", null]]);
    const result = buildLinkedInMentionResolutions(["OpenAI", "Unknown"], handles);
    assert.deepEqual(
      result.map((r) => r.resolved),
      [true, false],
    );
  });
});

// ---------------------------------------------------------------------------
// injectLinkedInMentions
// ---------------------------------------------------------------------------

describe("injectLinkedInMentions — deterministic weave: append if missing, dedupe if present, no-op for zero", () => {
  it("returns the caption completely unchanged for zero resolutions", () => {
    const caption = "AI just shipped three new agents this week.";
    assert.equal(injectLinkedInMentions(caption, []), caption);
  });

  it("appends a resolved mention (@Name) that isn't already in the caption", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "OpenAI", mention: "@OpenAI", resolved: true },
    ];
    const result = injectLinkedInMentions("AI just shipped three new agents this week.", resolutions);
    assert.ok(result.includes("@OpenAI"));
    assert.ok(result.startsWith("AI just shipped three new agents this week."));
  });

  it("appends an unresolved mention's plain name that isn't already in the caption", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "Unknown Startup", mention: "Unknown Startup", resolved: false },
    ];
    const result = injectLinkedInMentions("AI just shipped three new agents this week.", resolutions);
    assert.ok(result.includes("Unknown Startup"));
  });

  it("does NOT duplicate a mention already present in the caption (case-insensitive)", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "OpenAI", mention: "@OpenAI", resolved: true },
    ];
    const caption = "Congrats to @openai on the launch.";
    const result = injectLinkedInMentions(caption, resolutions);
    assert.equal(result, caption);
    assert.equal((result.match(/@openai/gi) ?? []).length, 1);
  });

  it("appends only the missing resolutions when some are already present", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "OpenAI", mention: "@OpenAI", resolved: true },
      { name: "Anthropic", mention: "@Anthropic", resolved: true },
    ];
    const caption = "Shoutout to @OpenAI for the launch.";
    const result = injectLinkedInMentions(caption, resolutions);
    assert.equal((result.match(/@OpenAI/gi) ?? []).length, 1);
    assert.ok(result.includes("@Anthropic"));
  });

  it("appends every missing mention when the caption is empty", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "OpenAI", mention: "@OpenAI", resolved: true },
    ];
    const result = injectLinkedInMentions("", resolutions);
    assert.ok(result.includes("@OpenAI"));
  });
});

// ---------------------------------------------------------------------------
// unresolvedMentionNames
// ---------------------------------------------------------------------------

describe("unresolvedMentionNames — exactly the unresolved plain names, in order", () => {
  it("extracts only the unresolved names", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "OpenAI", mention: "@OpenAI", resolved: true },
      { name: "Unknown Startup", mention: "Unknown Startup", resolved: false },
      { name: "Anthropic", mention: "@Anthropic", resolved: true },
      { name: "Ghost Co", mention: "Ghost Co", resolved: false },
    ];
    assert.deepEqual(unresolvedMentionNames(resolutions), ["Unknown Startup", "Ghost Co"]);
  });

  it("returns [] when every resolution resolved", () => {
    const resolutions: readonly LinkedInMentionResolution[] = [
      { name: "OpenAI", mention: "@OpenAI", resolved: true },
    ];
    assert.deepEqual(unresolvedMentionNames(resolutions), []);
  });

  it("returns [] for an empty resolutions list", () => {
    assert.deepEqual(unresolvedMentionNames([]), []);
  });
});

// ---------------------------------------------------------------------------
// weaveLinkedInMentions — the thin async shell
// ---------------------------------------------------------------------------

describe("weaveLinkedInMentions — resolves against the real committed lookup file, weaves, reports unresolved", () => {
  it("weaves @Name for a resolved company and plain text for an unresolved one, reporting the unresolved name", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "OpenAI: openai\n", "utf8");
      const input: CopyInput = { title: "AI news", companies: ["OpenAI", "Unknown Startup"] };
      const result = await weaveLinkedInMentions(
        "AI just shipped three new agents this week.",
        input,
        path,
      );
      assert.ok(result.caption.includes("@OpenAI"));
      assert.ok(result.caption.includes("Unknown Startup"));
      assert.ok(!result.caption.includes("@Unknown Startup"));
      assert.deepEqual(result.unresolvedMentions, ["Unknown Startup"]);
    });
  });

  it("weaves @Name for every company when all resolve, unresolvedMentions is empty", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "OpenAI: openai\nAnthropic: anthropic\n", "utf8");
      const input: CopyInput = { title: "AI news", companies: ["OpenAI", "Anthropic"] };
      const result = await weaveLinkedInMentions("AI just shipped three new agents this week.", input, path);
      assert.ok(result.caption.includes("@OpenAI"));
      assert.ok(result.caption.includes("@Anthropic"));
      assert.deepEqual(result.unresolvedMentions, []);
    });
  });

  it("short-circuits BEFORE any file read for zero companies — never throws against a nonexistent path", async () => {
    const input: CopyInput = { title: "AI news" };
    const caption = "AI just shipped three new agents this week.";
    const result = await weaveLinkedInMentions(caption, input, "/path/that/does/not/exist.yaml");
    assert.equal(result.caption, caption);
    assert.deepEqual(result.unresolvedMentions, []);
  });

  it("never mentions a company absent from the Spec's own companies data, even if the lookup would resolve it", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "linkedin-handles.yaml");
      await writeFile(path, "OpenAI: openai\nAnthropic: anthropic\n", "utf8");
      const input: CopyInput = { title: "AI news", companies: ["OpenAI"] };
      const caption = "AI just shipped three new agents this week.";
      const result = await weaveLinkedInMentions(caption, input, path);
      assert.ok(result.caption.includes("@OpenAI"));
      assert.ok(!result.caption.includes("Anthropic"));
    });
  });

  it("defaults to DEFAULT_LINKEDIN_HANDLES_PATH when no path is given and there are companies to resolve", async () => {
    // Just proves it never throws against the real committed file (mirrors store.test.ts's own guarantee).
    const input: CopyInput = { title: "AI news", companies: ["Some Company Nobody Has Committed"] };
    await assert.doesNotReject(() => weaveLinkedInMentions("A caption.", input));
  });
});
