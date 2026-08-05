import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CLEANUP_AFTER_MS, isDueForCleanup, planManifestCleanup } from "./cleanup.ts";

const NOW_ISO = "2026-08-10T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isoAt(offsetMs: number): string {
  return new Date(NOW_MS + offsetMs).toISOString();
}

describe("isDueForCleanup — pure, delete late, never early (issue #147)", () => {
  it("is due when scheduled more than 1 day in the past", () => {
    assert.equal(isDueForCleanup(isoAt(-ONE_DAY_MS - 1), NOW_MS), true);
  });

  it("is NOT due when scheduled exactly 1 day in the past (boundary — never touched)", () => {
    assert.equal(isDueForCleanup(isoAt(-ONE_DAY_MS), NOW_MS), false);
  });

  it("is NOT due when scheduled less than 1 day in the past", () => {
    assert.equal(isDueForCleanup(isoAt(-ONE_DAY_MS + 60_000), NOW_MS), false);
  });

  it("is NOT due when scheduled in the future", () => {
    assert.equal(isDueForCleanup(isoAt(ONE_DAY_MS * 5), NOW_MS), false);
  });

  it("is NOT due for a garbled/unparseable scheduled_at — never fabricate, never crash", () => {
    assert.equal(isDueForCleanup("not-a-date", NOW_MS), false);
    assert.equal(isDueForCleanup("", NOW_MS), false);
  });

  it("CLEANUP_AFTER_MS is exactly 1 day", () => {
    assert.equal(CLEANUP_AFTER_MS, ONE_DAY_MS);
  });
});

describe("planManifestCleanup — pure, manifest-driven decision (issue #147)", () => {
  it("returns exactly the more-than-1-day-past, not-yet-cleaned entries", () => {
    const actions = planManifestCleanup(
      [
        {
          manifestPath: "/brand/ideas/format/run-A/zoho-manifest.json",
          entries: [
            {
              ideaId: "idea-01",
              recipe: "news-carousel",
              scheduledAt: isoAt(-ONE_DAY_MS - 1),
              keys: ["k1", "k2"],
              alreadyCleaned: false,
            },
            {
              ideaId: "idea-02",
              recipe: "news-carousel",
              scheduledAt: isoAt(-ONE_DAY_MS + 60_000), // less than 1 day ago
              keys: ["k3"],
              alreadyCleaned: false,
            },
            {
              ideaId: "idea-03",
              recipe: "news-carousel",
              scheduledAt: isoAt(ONE_DAY_MS), // future
              keys: ["k4"],
              alreadyCleaned: false,
            },
          ],
        },
      ],
      NOW_MS,
    );

    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.ideaId, "idea-01");
    assert.equal(actions[0]!.manifestPath, "/brand/ideas/format/run-A/zoho-manifest.json");
    assert.deepEqual(actions[0]!.keys, ["k1", "k2"]);
  });

  it("never touches an entry already recorded as cleaned, even if it is due", () => {
    const actions = planManifestCleanup(
      [
        {
          manifestPath: "/m.json",
          entries: [
            {
              ideaId: "idea-01",
              recipe: "news-carousel",
              scheduledAt: isoAt(-ONE_DAY_MS * 10),
              keys: ["k1"],
              alreadyCleaned: true,
            },
          ],
        },
      ],
      NOW_MS,
    );
    assert.deepEqual(actions, []);
  });

  it("judges every manifest independently, across multiple manifests", () => {
    const actions = planManifestCleanup(
      [
        {
          manifestPath: "/m1.json",
          entries: [
            {
              ideaId: "idea-01",
              recipe: "news-carousel",
              scheduledAt: isoAt(-ONE_DAY_MS - 1),
              keys: ["k1"],
              alreadyCleaned: false,
            },
          ],
        },
        {
          manifestPath: "/m2.json",
          entries: [
            {
              ideaId: "idea-02",
              recipe: "news-carousel",
              scheduledAt: isoAt(-ONE_DAY_MS - 1),
              keys: ["k2"],
              alreadyCleaned: false,
            },
          ],
        },
      ],
      NOW_MS,
    );
    assert.equal(actions.length, 2);
    assert.deepEqual(actions.map((a) => a.manifestPath).sort(), ["/m1.json", "/m2.json"]);
  });

  it("returns an empty list for empty input", () => {
    assert.deepEqual(planManifestCleanup([], NOW_MS), []);
  });

  it("is pure — no clock read inside; the same input+nowMs always returns the same output", () => {
    const targets = [
      {
        manifestPath: "/m.json",
        entries: [
          {
            ideaId: "idea-01",
            recipe: "news-carousel",
            scheduledAt: isoAt(-ONE_DAY_MS - 1),
            keys: ["k1"],
            alreadyCleaned: false,
          },
        ],
      },
    ];
    const first = planManifestCleanup(targets, NOW_MS);
    const second = planManifestCleanup(targets, NOW_MS);
    assert.deepEqual(first, second);
  });
});
