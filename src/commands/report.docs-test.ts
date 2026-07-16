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
    // ADR-0011: the Idea itself only ever carries suggested/accepted/rejected...
    assert.match(
      claude,
      /suggested \/ accepted \/ rejected/,
      "CLAUDE.md must document the Idea's own suggested/accepted/rejected lifecycle (ADR-0011)",
    );
    // ...production state (the retired flat casting/produced/posted/tracking/scored) now lives on each
    // chosen Recipe's own Asset instead.
    assert.match(
      claude,
      /queued → in_production → produced → posted → tracking → scored/,
      "CLAUDE.md must document the per-Asset production lifecycle (ADR-0011)",
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

  it("pick-cast.md is honest that production is attended — no unattended background worker (ADR-0008)", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "pick-cast.md"), "utf8");
    // Before the attended producer was restored (PR #46), this doc had to flag the render runtime as
    // not-yet-wired (audit finding C2). That gap is closed: the render genuinely runs today, in the
    // Operator's own session — pin the CURRENT, true claim instead of the old honesty disclaimer.
    assert.match(
      doc,
      /Operator's session/i,
      "pick-cast.md must state the render runs in the Operator's session",
    );
    assert.match(
      doc,
      /no unattended background worker/i,
      "pick-cast.md must state there is no unattended background worker",
    );
    assert.match(doc, /ADR-0008/, "pick-cast.md must cite ADR-0008 for the attended-runtime decision");
    // It must never re-introduce the stale "not yet wired" disclaimer now that the flow is built.
    assert.doesNotMatch(
      doc,
      /not yet (wired|built|operational|runnable)/i,
      "pick-cast.md must not claim the render runtime is not yet wired — it is attended and wired today",
    );
    // It must still promise the command records the Character correctly (the part that does work).
    assert.match(
      doc,
      /records the Character/i,
      "pick-cast.md must state it still records the Character correctly today",
    );
  });

  it("pick-cast.md describes the Asset-grain Cast-gate lifecycle, not the retired flat Idea status (QA-1 regression)", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "pick-cast.md"), "utf8");
    // ADR-0011 retired the flat Idea `casting` status: the Idea itself stays `accepted` throughout: it
    // is the ASSET that pauses `in_production` (with `pending_gate: "cast"`) and then moves `produced`.
    // A QA Round-1 defect (QA-1) found pick-cast.md still claiming the Idea's OWN status moved
    // `casting → produced` — these two guards target the EXACT phrasing of that regressed claim
    // (verified against the pre-fix doc text), not a broad ban on the word "casting" (which the doc is
    // still allowed to use historically, e.g. "the retired flat `casting` Idea-status is gone").
    assert.doesNotMatch(
      doc,
      /casting\s*→\s*produced/i,
      "pick-cast.md must not claim the Idea's status chain runs casting → produced — that flat Idea " +
        "status is retired (ADR-0011); it is the Asset that moves in_production → produced",
    );
    assert.doesNotMatch(
      doc,
      /`casting`\s+Idea\s+is\s+paused/i,
      "pick-cast.md must not claim a `casting` Idea is paused at the Cast gate — the Idea stays " +
        "`accepted`; it is the Asset that pauses in_production at pending_gate: \"cast\" (ADR-0011)",
    );
    // Positive, checkable claims: the doc must actually name the real Asset-grain vocabulary, not just
    // omit the retired one.
    assert.match(
      doc,
      /in_production/,
      "pick-cast.md must describe the Asset's `in_production` status (ADR-0011)",
    );
    assert.match(
      doc,
      /pending_gate/,
      "pick-cast.md must describe the Cast pause as the Asset's `pending_gate`, not an Idea status",
    );
  });
});
