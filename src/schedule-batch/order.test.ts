import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ideaSortKey, sortEligible } from "./order.ts";
import type { EligibleAsset } from "./eligibility.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";

const RUN = "2026-W32";

function asset(): LedgerAssetRecord {
  return { recipe: "news-carousel", status: "produced" };
}

function eligible(ideaId: string): EligibleAsset {
  return { ideaId, title: ideaId, asset: asset() };
}

describe("ideaSortKey (issue #160 — extracted from export-schedule.ts, unchanged behavior)", () => {
  it("parses the idea-NN suffix via briefShortName", () => {
    assert.equal(ideaSortKey(`idea-${RUN}-03`, RUN), 3);
    assert.equal(ideaSortKey(`idea-${RUN}-10`, RUN), 10);
  });

  it("sends an unparseable id to the end (MAX_SAFE_INTEGER) rather than crashing", () => {
    assert.equal(ideaSortKey("not-an-idea-id-at-all", RUN), Number.MAX_SAFE_INTEGER);
  });

  it("still parses a bare -NN suffix even without the idea-<run>- prefix", () => {
    assert.equal(ideaSortKey("legacy-run-idea-07", RUN), 7);
  });
});

describe("sortEligible (issue #160 — extracted from export-schedule.ts, unchanged behavior)", () => {
  it("sorts eligible Assets into ascending idea-number order", () => {
    const input = [
      eligible(`idea-${RUN}-03`),
      eligible(`idea-${RUN}-01`),
      eligible(`idea-${RUN}-02`),
    ];
    const sorted = sortEligible(input, RUN);
    assert.deepEqual(
      sorted.map((e) => e.ideaId),
      [`idea-${RUN}-01`, `idea-${RUN}-02`, `idea-${RUN}-03`],
    );
  });

  it("pushes unparseable ids to the end, stably, never crashing", () => {
    const input = [
      eligible("mystery-id"),
      eligible(`idea-${RUN}-01`),
      eligible("another-mystery-id"),
    ];
    const sorted = sortEligible(input, RUN);
    assert.equal(sorted[0]!.ideaId, `idea-${RUN}-01`);
    assert.deepEqual(
      sorted.slice(1).map((e) => e.ideaId),
      ["mystery-id", "another-mystery-id"],
    );
  });

  it("never mutates its input array", () => {
    const input = [eligible(`idea-${RUN}-02`), eligible(`idea-${RUN}-01`)];
    const before = input.map((e) => e.ideaId);
    sortEligible(input, RUN);
    assert.deepEqual(
      input.map((e) => e.ideaId),
      before,
    );
  });

  it("is pure — same input yields deep-equal output", () => {
    const input = [eligible(`idea-${RUN}-02`), eligible(`idea-${RUN}-01`)];
    assert.deepEqual(sortEligible(input, RUN), sortEligible(input, RUN));
  });
});
