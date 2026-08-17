/**
 * Tests for `extractSourceUrls` (`src/importer/source-urls.ts`) — issue #204.
 *
 * Real-data-shaped fixtures, matching the survey recorded in issue #228's own doc comment and this
 * issue's comment thread: a `## Source(s)` section is mostly clean `https://` links, but a real
 * minority of bullets are editorial/verification notes carrying no URL at all.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractSourceUrls } from "./source-urls.ts";

describe("extractSourceUrls — pulls real links out of a Brief's ## Source(s) section, drops editorial notes", () => {
  it("returns [] when the Brief has no ## Source(s) section at all (MundoTip's pre-Format shape)", () => {
    const brief = `# idea-2026-W22-01\n\n**Angle:** something.\n\n**Hook concept:** something else.\n`;
    assert.deepEqual(extractSourceUrls(brief), []);
  });

  it("extracts one URL per clean bullet, in order", () => {
    const brief = `# idea-08\n\n## Talking points\n- a point\n\n## Source(s)\n- The Register (caught uploading repos): https://www.theregister.com/ai-and-ml/2026/07/14/example\n- 404 Media (Suno breach): https://www.404media.co/hack-reveals-suno-example\n\n## Fit basis\nsomething\n`;
    assert.deepEqual(extractSourceUrls(brief), [
      "https://www.theregister.com/ai-and-ml/2026/07/14/example",
      "https://www.404media.co/hack-reveals-suno-example",
    ]);
  });

  it("drops a bullet that is a pure editorial/verification note with no URL", () => {
    const brief = `## Source(s)\n- The Guardian (report): https://www.theguardian.com/technology/example\n- (No distinct official X corporate blog post was found for this specific feature.)\n`;
    assert.deepEqual(extractSourceUrls(brief), ["https://www.theguardian.com/technology/example"]);
  });

  it("follows a multi-line bullet to find its URL on a continuation line", () => {
    const brief =
      "## Source(s)\n" +
      "- **PRIMARY (original release artifact, verified 2026-08-11 — show this on screen):** Hugging\n" +
      "  Face, meta-models org: https://huggingface.co/meta-models/example\n";
    assert.deepEqual(extractSourceUrls(brief), ["https://huggingface.co/meta-models/example"]);
  });

  it("stops at the next ## heading and does not pull URLs from later sections", () => {
    const brief =
      "## Source(s)\n- https://example.com/a\n\n## Fit basis\nSee also https://example.com/should-not-appear\n";
    assert.deepEqual(extractSourceUrls(brief), ["https://example.com/a"]);
  });

  it("strips trailing punctuation from a URL", () => {
    const brief = "## Source(s)\n- see this (https://example.com/a/b).\n";
    assert.deepEqual(extractSourceUrls(brief), ["https://example.com/a/b"]);
  });

  it("dedupes a URL that appears twice in the same section", () => {
    const brief = "## Source(s)\n- https://example.com/a\n- again: https://example.com/a\n";
    assert.deepEqual(extractSourceUrls(brief), ["https://example.com/a"]);
  });

  it("handles a Source(s) section that is the last thing in the file (no trailing heading)", () => {
    const brief = "## Source(s)\n- https://example.com/a\n";
    assert.deepEqual(extractSourceUrls(brief), ["https://example.com/a"]);
  });
});
