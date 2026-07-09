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

  it("is honest that production past Spec composition is not yet wired (audit C2)", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    // The doc must flag its full role as the TARGET design, not what runs today.
    assert.match(
      text,
      /not yet (runnable|wired|operational|built)/i,
      "producer.md must state the unattended production flow is not yet wired",
    );
    // It must point at the audit finding so the honesty note is traceable.
    assert.match(text, /\bC2\b/, "producer.md must cite audit C2 for the wiring gap");
    // It must warn against claiming production ran unattended.
    assert.match(
      text,
      /(do not claim|never claim|not).{0,40}unattended/i,
      "producer.md must not let the agent claim unattended production works today",
    );
    // Spec composition is the one step that IS wired — it must still own that.
    assert.match(text, /Spec composition/i, "producer.md must state Spec composition is what works today");
  });
});
