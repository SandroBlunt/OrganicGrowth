import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Documentation-conformance suite. These assertions read markdown docs (CLAUDE.md and
// .claude/**/*.md) and pin their current prose. They are deliberately kept OUT of the unit
// suite: the `npm test` glob is "src/**/*.test.ts", which does NOT match "*.docs-test.ts".
// Run these with `npm run test:docs`. Editing a doc must never break `npm test`.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

// === Docs surface — the final Operator command surface + lifecycle match the shipped feature =========

describe("command surface — final and matches the shipped Producer feature", () => {
  it("ships /queue, /pick-cast, /log-post and NO /produce command", async () => {
    const cmds = join(REPO_ROOT, ".claude", "commands");
    await readFile(join(cmds, "queue.md"), "utf8");
    await readFile(join(cmds, "pick-cast.md"), "utf8");
    await readFile(join(cmds, "log-post.md"), "utf8");
    await assert.rejects(
      readFile(join(cmds, "produce.md"), "utf8"),
      "there must be no /produce command file (auto-enqueue on accept replaced it)",
    );
  });

  it("CLAUDE.md documents the final lifecycle and carries no stale '/produce' wiring", async () => {
    const claude = await readFile(join(REPO_ROOT, "CLAUDE.md"), "utf8");
    assert.match(
      claude,
      /suggested → accepted → casting → produced → posted → tracking → scored/,
      "CLAUDE.md must document the final lifecycle",
    );
    assert.doesNotMatch(
      claude,
      /written by `\/produce`/,
      "CLAUDE.md must not say the Production Spec is written by /produce",
    );
  });

  it("report.md describes the production states (casting/produced) and keeps Fit vs Performance distinct", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "report.md"), "utf8");
    assert.match(doc, /casting/i);
    assert.match(doc, /produced/i);
    assert.match(doc, /Fit Score/i);
    assert.match(doc, /Performance Score/i);
  });

  it("report.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "report.md"), "utf8");
    assert.match(doc, /<brand>/i, "report.md must document the <brand> argument");
  });

  it("pick-cast.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "pick-cast.md"), "utf8");
    assert.match(doc, /<brand>/i, "pick-cast.md must document the <brand> argument");
  });

  it("run-trends.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "run-trends.md"), "utf8");
    assert.match(doc, /<brand>/i, "run-trends.md must document the <brand> argument");
  });

  it("review-ideas.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "review-ideas.md"), "utf8");
    assert.match(doc, /<brand>/i, "review-ideas.md must document the <brand> argument");
  });

  it("queue.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "queue.md"), "utf8");
    assert.match(doc, /<brand>/i, "queue.md must document the <brand> argument");
  });

  it("log-post.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "log-post.md"), "utf8");
    assert.match(doc, /<brand>/i, "log-post.md must document the <brand> argument");
  });

  it("track-performance.md documents the <brand> argument as required", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "track-performance.md"), "utf8");
    assert.match(doc, /<brand>/i, "track-performance.md must document the <brand> argument");
  });

  it("all content agent files thread the Brand through their prompts", async () => {
    const agents = join(REPO_ROOT, ".claude", "agents");
    for (const agentFile of ["trend-scout.md", "idea-strategist.md", "producer.md", "performance-tracker.md"]) {
      const doc = await readFile(join(agents, agentFile), "utf8");
      assert.match(
        doc,
        /brand/i,
        `${agentFile} must thread the Brand through its prompt`,
      );
    }
  });

  it("producer.md restates the Brand at Gate 2 (Cast pick)", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "agents", "producer.md"), "utf8");
    assert.match(doc, /Brand.*Gate 2|Gate 2.*Brand|Gate 2.*Cast.*Brand|Brand.*Cast.*gate/i,
      "producer.md must restate the Brand at Gate 2 (Cast pick)");
  });

  it("pick-cast.md is honest that the unattended render runtime is not yet wired (audit C2)", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "pick-cast.md"), "utf8");
    // It must flag the unattended render as not-yet-wired, not something that runs on pick today.
    assert.match(
      doc,
      /not yet (wired|built|operational|runnable)|not built yet/i,
      "pick-cast.md must state the unattended render runtime is not yet wired",
    );
    // The honesty note must be traceable to the audit finding.
    assert.match(doc, /\bC2\b/, "pick-cast.md must cite audit C2 for the wiring gap");
    // It must still promise the command records the Character correctly (the part that does work).
    assert.match(
      doc,
      /records the Character/i,
      "pick-cast.md must state it still records the Character correctly today",
    );
  });
});
