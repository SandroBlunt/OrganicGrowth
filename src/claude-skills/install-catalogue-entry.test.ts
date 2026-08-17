/**
 * Tests for the pure `planInstall` (`src/claude-skills/install-catalogue-entry.ts`, issue #212).
 *
 * Pure, in-memory fixtures only — no disk I/O in this file (the disk-touching install itself is proven
 * end to end in `install-catalogue-entry.docs-test.ts`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planInstall } from "./install-catalogue-entry.ts";

describe("planInstall", () => {
  it("copy-alongside: plans to copy both the entry and the shared references folder", () => {
    const metadata = { shared_references: { mode: "relative-link", path: "../../references/", install: "copy-alongside" } };
    const plan = planInstall(metadata, "fixture-model");
    assert.deepEqual(plan, { installable: true, strategy: "copy-alongside", copySharedReferences: true });
  });

  it("vendored: plans to copy only the entry (its own references/ folder already carries what it needs)", () => {
    const metadata = { shared_references: { mode: "relative-link", path: "references/", install: "vendored" } };
    const plan = planInstall(metadata, "fixture-model");
    assert.deepEqual(plan, { installable: true, strategy: "vendored", copySharedReferences: false });
  });

  it("refuse-without: plans no copy and signals the entry cannot be installed without the dependency being separately supplied", () => {
    const metadata = { shared_references: { mode: "relative-link", path: "../../references/", install: "refuse-without" } };
    const plan = planInstall(metadata, "fixture-model");
    assert.equal(plan.installable, false);
    if (!plan.installable) {
      assert.equal(plan.strategy, "refuse-without");
      assert.match(plan.reason, /fixture-model/);
      assert.match(plan.reason, /cannot be.*installed/);
    }
  });

  it("an unrecognized install strategy is not installable, and names the bad value in its reason (never throws)", () => {
    const metadata = { shared_references: { install: "teleport" } };
    const plan = planInstall(metadata, "fixture-model");
    assert.equal(plan.installable, false);
    if (!plan.installable) {
      assert.match(plan.reason, /teleport/);
    }
  });

  it("missing shared_references entirely is not installable, and does not throw", () => {
    const plan = planInstall({}, "fixture-model");
    assert.equal(plan.installable, false);
  });

  it("malformed (non-object) metadata is not installable, and does not throw", () => {
    const plan = planInstall(null, "fixture-model");
    assert.equal(plan.installable, false);
    const plan2 = planInstall("not an object", "fixture-model");
    assert.equal(plan2.installable, false);
  });
});
