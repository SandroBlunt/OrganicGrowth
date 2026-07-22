/**
 * Anti-drift guard: the checklist item COUNT stated in prose in
 * `openspec/specs/production-spec/spec.md` must match the REAL count `auditNewsCarouselAuthorPhase`
 * returns. Those numbers ("exactly N entries; M with one", "a Mth item, `baseline-doc-verified`", and
 * the scenarios' "`items.length` is `N`") are typed by hand and have silently drifted every time a
 * checklist item was added (issues #102/#108/#110/#106 each shifted the true count while the prose
 * lagged). This test fails the moment the code and the spec disagree, so the drift can't recur —
 * whoever adds the next checklist item is forced to update the spec in the same change.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { auditNewsCarouselAuthorPhase } from "./news-carousel-author-checklist.ts";
import {
  STRAW_MOTION_BASELINE,
  strawMotionIdeaOneCarouselSpec,
} from "./fixtures/news-carousel-straw-motion-specs.ts";

const SPEC_PATH = fileURLToPath(
  new URL("../../openspec/specs/production-spec/spec.md", import.meta.url),
);

describe("production-spec/spec.md's stated checklist item count stays in sync with the real audit", () => {
  it("the spec's 'N entries / M with one', 'Mth item', and every 'items.length is N' number matches auditNewsCarouselAuthorPhase", async () => {
    // The real counts, straight from the code (never hand-copied).
    const base = auditNewsCarouselAuthorPhase(strawMotionIdeaOneCarouselSpec(), [], STRAW_MOTION_BASELINE)
      .items.length;
    // Supplying ANY baselineDocumentText adds the conditional `baseline-doc-verified` item; we assert
    // the COUNT only, so the dummy text's pass/fail is irrelevant.
    const withOne = auditNewsCarouselAuthorPhase(
      strawMotionIdeaOneCarouselSpec(),
      [],
      STRAW_MOTION_BASELINE,
      "baseline document text (count-only)",
    ).items.length;
    assert.equal(
      withOne,
      base + 1,
      "supplying baselineDocumentText should add exactly one item (baseline-doc-verified)",
    );

    // Collapse whitespace so the prose regexes don't depend on where lines happen to wrap.
    const spec = (await readFile(SPEC_PATH, "utf8")).replace(/\s+/g, " ");

    const entries = spec.match(/exactly (\d+) entries \(without a supplied[^;]*; (\d+) with one\)/);
    assert.ok(entries, "spec must state 'exactly N entries (without a supplied ...; M with one)'");
    assert.equal(Number(entries[1]), base, `spec says ${entries[1]} base entries; the audit returns ${base}`);
    assert.equal(Number(entries[2]), withOne, `spec says ${entries[2]} with-doc entries; the audit returns ${withOne}`);

    const nth = spec.match(/a (\d+)th item, \*\*`baseline-doc-verified`\*\*/);
    assert.ok(nth, "spec must state 'a Mth item, `baseline-doc-verified`'");
    assert.equal(
      Number(nth[1]),
      withOne,
      `spec calls baseline-doc-verified the ${nth[1]}th item; the with-doc count is ${withOne}`,
    );

    // Every Scenario's "items.length is N" must be a count the audit can actually return.
    const scenarioCounts = [...spec.matchAll(/`items\.length` is `(\d+)`/g)].map((m) => Number(m[1]));
    assert.ok(scenarioCounts.length >= 1, "spec should assert items.length in at least one Scenario");
    for (const n of scenarioCounts) {
      assert.ok(
        n === base || n === withOne,
        `a Scenario asserts items.length ${n}, which is neither the no-doc count (${base}) nor the with-doc count (${withOne})`,
      );
    }
  });
});
