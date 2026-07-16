import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite. Proves the content `producer` agent definition exists, is model
 * Opus, and describes its role per CLAUDE.md / CONTEXT.md (acceptance criterion: "A producer agent
 * definition exists (Opus)").
 *
 * These assertions read the `producer.md` agent doc and pin its current front-matter/wording, so they
 * are kept OUT of the unit suite: the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts". Run with `npm run test:docs`. Editing the agent doc must never break `npm test`.
 *
 * The repo root is two levels up from src/production-spec/.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRODUCER_AGENT = join(REPO_ROOT, ".claude", "agents", "producer.md");

describe("producer agent definition", () => {
  it("exists and is readable", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares model opus in the front-matter", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /^model:\s*opus\s*$/m);
    assert.match(text, /^name:\s*producer\s*$/m);
  });

  it("describes generating a Production Spec and generate-never-publish", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /Production Spec/);
    assert.match(text, /never publish/i);
    // It must describe driving the Magnific Space and the Cast gate (its role per CONTEXT.md).
    assert.match(text, /Magnific/);
    assert.match(text, /Cast/);
  });

  it("is honest that production is attended and wired end-to-end today (ADR-0008), not just Spec composition", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    // Before the attended producer was restored (PR #46), this doc had to flag full production as the
    // TARGET design, not what ran today (audit finding C2, "not yet wired"). That gap is closed: the
    // whole flow — Spec, Cast, pick, render, Copy — runs attended in the Operator's own session. Pinning
    // the OLD "not yet wired" disclaimer here would now itself be a false claim — assert its ABSENCE.
    assert.doesNotMatch(
      text,
      /not yet (runnable|wired|operational|built)/i,
      "producer.md must NOT claim production is not yet wired — it is attended and wired today (ADR-0008)",
    );
    // It must name the attended runtime explicitly (ADR-0008) rather than staying silent about it.
    assert.match(text, /ADR-0008/, "producer.md must cite ADR-0008 for the attended-runtime decision");
    assert.match(
      text,
      /attended|Operator's session/i,
      "producer.md must state it runs attended, in the Operator's own session",
    );
    // The queue-job schema it documents must match the CURRENT generic gate/Recipe cursor (issue #56/57)
    // — not the retired fixed cast/render phase split. A real, checkable pin against production code.
    assert.match(text, /`recipe`/, "producer.md must describe the queue job's `recipe` field");
    assert.match(
      text,
      /awaiting_pick/,
      "producer.md must describe the CURRENT `awaiting_pick` queue status",
    );
    assert.doesNotMatch(
      text,
      /awaiting_cast/,
      "producer.md must not describe the retired `awaiting_cast` queue status",
    );
  });
});
