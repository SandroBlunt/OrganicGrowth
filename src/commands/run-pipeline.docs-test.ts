import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Source-text conformance suite. These assertions grep the SOURCE TEXT of run-pipeline.ts and the
// granular command files for specific import statements — a behaviour-preserving refactor (e.g.
// renaming an import path) would break them. They are kept OUT of the unit suite: the `npm test`
// glob is "src/**/*.test.ts", which does NOT match "*.docs-test.ts". Run with `npm run test:docs`.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

// ===========================================================================
// AC7: Readiness gate only in conductor — granular commands are unguarded
// ===========================================================================

describe("AC7: Readiness gate exists only in the conductor", () => {
  it("run-pipeline-readiness.ts is NOT imported by any granular command file", async () => {
    const granularCommands = ["pick-cast.ts", "queue.ts", "report.ts"];
    for (const cmd of granularCommands) {
      const src = await readFile(join(HERE, cmd), "utf8").catch(() => "");
      assert.doesNotMatch(
        src,
        /run-pipeline-readiness/,
        `${cmd} must NOT import run-pipeline-readiness (readiness is only for /run-pipeline)`,
      );
    }
  });
});

// ===========================================================================
// AC8: Conductor reuses existing modules (no duplicated pipeline logic)
// ===========================================================================

describe("AC8: Conductor reuses existing modules — no duplicated pipeline logic", () => {
  it("run-pipeline.ts imports resolveBrand (not a re-implementation)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*brand\/resolver/, "run-pipeline.ts must import resolveBrand from brand/resolver");
  });

  it("run-pipeline.ts imports resolvePhase (not a re-implementation)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*phase-resolver\/resolve/, "run-pipeline.ts must import resolvePhase");
  });

  it("run-pipeline.ts imports enqueueOnAccept (not a re-implementation)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*production-queue\/enqueue-on-accept/, "run-pipeline.ts must import enqueueOnAccept");
  });

  it("run-pipeline.ts imports classify and checkConfig indirectly via runReadiness (not inline)", async () => {
    const src = await readFile(join(HERE, "run-pipeline.ts"), "utf8");
    assert.match(src, /from.*run-pipeline-readiness/, "run-pipeline.ts must delegate readiness to run-pipeline-readiness");
    // Must NOT re-implement classify or checkConfig inline
    assert.doesNotMatch(src, /from.*readiness\/classify/, "run-pipeline.ts must not import classify directly");
  });
});

// ===========================================================================
// The conductor doc is honest that production runs through TWO real paths — attended (ADR-0008) and,
// since issue #208, unattended (ADR-0030, partially superseding ADR-0008) — it must not promise an
// unattended flow that was never built, AND (as of ADR-0030) must not deny one that now IS built.
//
// Before the attended producer was restored (PR #46), this suite required run-pipeline.md to flag
// production as "not yet wired" (audit finding C2). That gap is closed — production genuinely runs
// today, in the Operator's own session — so pinning the OLD disclaimer would now itself be dishonest.
// Then, up to issue #208, this suite pinned "deliberately no headless worker host / no
// unattended-permission wiring" as the CURRENT, true claim (ADR-0008 supersedes ADR-0004). issue #208
// built exactly that headless worker host (`src/commands/run-worker.ts`), and ADR-0030 records the
// decision to partially supersede ADR-0008 — so THAT claim is now itself the stale one. This suite pins
// the CURRENT reality instead: BOTH paths exist, named, each citing its own ADR; a revert to the old
// unqualified "no headless worker host" claim is a regression this suite catches (the doesNotMatch guard
// below), not a silently-accepted rewording.
// ===========================================================================

describe("run-pipeline.md is honest that production runs through two real paths (ADR-0008 attended, ADR-0030 unattended)", () => {
  it("run-pipeline.md documents BOTH the attended and the unattended production paths", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "run-pipeline.md"), "utf8");
    assert.match(doc, /attended/i, "run-pipeline.md must name the attended production runtime");
    assert.match(doc, /unattended/i, "run-pipeline.md must name the unattended production runtime");
    assert.match(doc, /ADR-0008/, "run-pipeline.md must cite ADR-0008 for the attended-runtime decision");
    assert.match(doc, /ADR-0030/, "run-pipeline.md must cite ADR-0030 for the unattended-worker decision");
    assert.match(
      doc,
      /in your session/i,
      "run-pipeline.md must state the attended path runs in the Operator's own session",
    );
    assert.match(
      doc,
      /no human present/i,
      "run-pipeline.md must state the unattended worker runs with no human present",
    );
    assert.match(
      doc,
      /run-worker/i,
      "run-pipeline.md must name the worker module (src/commands/run-worker.ts)",
    );
    // It must never re-introduce the stale "not yet wired" disclaimer now that the flow is built.
    assert.doesNotMatch(
      doc,
      /not yet (wired|operational|runnable|built)/i,
      "run-pipeline.md must not claim production is not yet wired — it is attended and wired today",
    );
    // It must never re-introduce the OLD, now-false, unqualified "no headless worker host" claim —
    // ADR-0030 means a headless worker host genuinely exists now. Gap-tolerant ([\s\S]{0,10}, not a bare
    // space) on purpose: the OLD text this guards against wraps mid-phrase AND crosses a markdown
    // blockquote continuation marker ("deliberately **no\n> headless worker host..."), so a bare
    // `/no headless worker host/i` (or even a plain whitespace-collapse) does not match it — verified by
    // testing this exact pattern against that exact old text (qa Round-3 repro). Mirrors the ORIGINAL
    // (pre-Round-2) positive-match pattern's own gap-tolerance for the identical reason.
    assert.doesNotMatch(
      doc,
      /deliberately \*{0,2}no\b[\s\S]{0,10}headless worker host/i,
      "run-pipeline.md must not claim there is no headless worker host — the unattended worker now exists (ADR-0030)",
    );
  });

  it("run-pipeline.md describes gates as per-Recipe (ADR-0009/0010) without calling the model unbuilt", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "run-pipeline.md"), "utf8");
    assert.match(doc, /per-Recipe/, "run-pipeline.md must describe gates as per-Recipe");
    assert.match(doc, /ADR-0009/, "run-pipeline.md must cite ADR-0009 for the per-Recipe gate model");
    assert.doesNotMatch(
      doc,
      /being migrated onto that\s*model|single-recipe build/i,
      "run-pipeline.md must not describe the multi-format model as future/unbuilt — it is built",
    );
  });
});
