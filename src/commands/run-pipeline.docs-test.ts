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
// C2: The conductor doc is honest that the unattended production runtime is
// not yet wired — it must not promise a flow that cannot run today.
// ===========================================================================

describe("C2: run-pipeline.md is honest that unattended production is not yet wired", () => {
  it("run-pipeline.md flags the auto-drain / unattended-render flow as not yet operational", async () => {
    const doc = await readFile(join(REPO_ROOT, ".claude", "commands", "run-pipeline.md"), "utf8");
    // The doc still describes unattended production as the target...
    assert.match(doc, /unattended/i, "run-pipeline.md must still name the unattended production flow");
    // ...but must now flag it as not-yet-wired rather than promising it works today.
    assert.match(
      doc,
      /not yet (wired|operational|runnable|built)/i,
      "run-pipeline.md must state the unattended production runtime is not yet wired",
    );
    // The gap must be traceable to the audit finding.
    assert.match(doc, /\bC2\b/, "run-pipeline.md must cite audit C2 for the wiring gap");
    // It must tell the Operator the production phases are manual/blocked for now.
    assert.match(
      doc,
      /manual|blocked|pending/i,
      "run-pipeline.md must treat the production phases as manual/blocked until the runtime ships",
    );
  });
});
