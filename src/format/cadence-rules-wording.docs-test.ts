/**
 * Documentation-conformance suite for issue #172 AC4: always-rule 10's "one Run per week" wording
 * becomes "one Run per cadence period per Format" (ADR-0022).
 *
 * Kept as a `.docs-test.ts` (run only via `npm run test:docs`, not `npm test`'s default glob) — this
 * is incidental documentation-wording conformance, not a core behavioral acceptance criterion (that
 * one is `src/format/format-docs.test.ts`'s cadence describe block, which IS in the default suite).
 * Mirrors the existing pattern in `src/schedule-batch/approval-gate.docs-test.ts` /
 * `src/commands/report.docs-test.ts` (pinning exact `.agents/rules/*.md` / `GEMINI.md` prose).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

describe("always-rule 10 states cadence, not a flat weekly rule (ADR-0022, issue #172 AC4)", () => {
  it("organicgrowth-rules.md's rule 10 reads 'one Run per cadence period per Format'", async () => {
    const doc = await readFile(
      join(REPO_ROOT, ".agents", "rules", "organicgrowth-rules.md"),
      "utf8",
    );
    assert.match(
      doc,
      /one Run per cadence period per Format/i,
      "rule 10 must state cadence-period wording, not the old flat 'one Run per week'",
    );
    assert.match(
      doc,
      /ADR-0022|docs\/adr\/0022/,
      "rule 10 must cite ADR-0022 (by name or path) for the cadence decision",
    );
    // The old flat rule must not survive verbatim (it's fine for "weekly" to still appear as an
    // example of one of the two cadences — only the OLD standalone sentence is forbidden).
    assert.doesNotMatch(
      doc,
      /One Run per week unless the Operator/,
      "the old flat 'one Run per week' sentence must not survive verbatim",
    );
  });
});

describe("GEMINI.md's pipeline intro states cadence, not a flat weekly rule (ADR-0022, issue #172 AC4)", () => {
  it("GEMINI.md reads 'Run once per Format per cadence period'", async () => {
    const doc = await readFile(join(REPO_ROOT, "GEMINI.md"), "utf8");
    assert.match(
      doc,
      /Run once per \*\*Format\*\* per cadence period/,
      "GEMINI.md's pipeline intro must state cadence-period wording, not the old flat 'per week'",
    );
    assert.match(doc, /ADR-0022/, "GEMINI.md's pipeline intro must cite ADR-0022");
    assert.doesNotMatch(
      doc,
      /Run once per \*\*Format\*\* per week \(running/,
      "the old flat 'Run once per Format per week' sentence must not survive verbatim",
    );
  });
});
