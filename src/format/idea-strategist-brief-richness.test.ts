/**
 * Proves issue #111 AC1 ("The idea-strategist produces richer briefs — stronger hooks/angles/talking
 * points — reflected in its output guidance/shape and covered by tests") + epic #106 item 4's upstream
 * half ("give the idea-strategist richer inputs so briefs carry more punch").
 *
 * `idea-strategist` is a prompt-driven agent (`.claude/agents/idea-strategist.md`) — there is no
 * compiled TS brief schema/parser anywhere in `src/` (confirmed: `production-spec/generate.ts`'s
 * `Brief` interface only mirrors a Brief's FRONT-MATTER, never its markdown body). So the richer-brief
 * requirement is proven the same way `src/format/format-docs.test.ts` proves issue #53's own
 * idea-strategist.md requirements: pinning the agent's documented guidance.
 *
 * Deliberately a REGULAR `.test.ts` (not `*.docs-test.ts`), mirroring `format-docs.test.ts`'s own
 * precedent: richer briefs is a HEADLINE acceptance criterion of this slice, not incidental
 * documentation conformance, so it runs under `npm test`'s always-on gate.
 *
 * No Magnific Space involved — a plain markdown-file read.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

async function readIdeaStrategistDoc(): Promise<string> {
  return readFile(join(REPO_ROOT, ".claude", "agents", "idea-strategist.md"), "utf8");
}

describe("idea-strategist's Hard Boundary requires a specific angle, a specific hook concept, and concrete talking points (issue #111 AC1)", () => {
  it("requires the angle to name a specific tension/contrast with real entities, never a generic theme", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /specific tension or contrast/i);
    assert.match(doc, /named with real entities from the Trend/i);
    assert.match(doc, /never a generic\s+theme/i);
  });

  it("requires the hook concept to name the exact surprise/reframe, while staying concept-level", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /naming the exact surprise or reframe/i);
    // The pre-existing "concept, not final line" boundary must still be stated.
    assert.match(doc, /NOT the final\s*\n?\s*line/i);
  });

  it("requires AT LEAST 4 talking points, each grounding one concrete, specific fact", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /AT LEAST 4/);
    assert.match(doc, /concrete, specific fact/i);
    assert.match(doc, /real name, a number, a date, or a direct claim/i);
    assert.match(doc, /never invented/i);
    assert.match(doc, /talking point with no specific is not acceptable/i);
  });

  it("never weakens the hard boundary that a brief stops at concept-level material", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /You do \*\*not\*\* write the caption, the script, or the/);
    assert.match(doc, /"just write it," decline and explain/);
  });
});

describe("idea-strategist's Process instructs concreteness explicitly; a standing Guardrail reinforces it (issue #111 AC1)", () => {
  it("instructs pulling specific names/numbers/dates/claims from the Trend's own evidence, never inventing one", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /Make every brief concrete, not generic/i);
    assert.match(doc, /pull the specific names, numbers,\s*\n?\s*dates, and claims straight out of the Trend's own evidence/i);
    assert.match(doc, /\(never invent one\)/);
  });

  it("states the consequence of a thin brief: it starts the downstream copy from nothing", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /starts the downstream copy from nothing/i);
    assert.match(doc, /richer briefs are how sharper copy gets made/i);
  });

  it("carries a standing 'Be concrete, never generic' Guardrails bullet, independent of the Process step", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.match(doc, /\*\*Be concrete, never generic\.\*\*/);
    assert.match(doc, /too thin/i);
  });
});

describe("idea-strategist.md is readable and non-empty (sanity)", () => {
  it("exists and has content", async () => {
    const doc = await readIdeaStrategistDoc();
    assert.ok(doc.length > 0);
  });
});
