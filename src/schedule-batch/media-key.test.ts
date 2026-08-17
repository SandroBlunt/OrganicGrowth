import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { slideBaseName, scheduleMediaKey } from "./media-key.ts";

describe("media-key — deterministic S3 object keys for a Schedule Batch export (issue #145)", () => {
  describe("slideBaseName", () => {
    it("strips a .png extension", () => {
      assert.equal(slideBaseName("/a/b/0-hook.png"), "0-hook");
    });

    it("strips a .jpg extension (a slide already downloaded as jpg)", () => {
      assert.equal(slideBaseName("/a/b/1-then.jpg"), "1-then");
    });

    it("is pure and works on a bare filename with no directory", () => {
      assert.equal(slideBaseName("6-cta.png"), "6-cta");
    });
  });

  describe("scheduleMediaKey", () => {
    it("builds <brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg (issue #198)", () => {
      const key = scheduleMediaKey("straw-motion", "2026-W32", "idea-01", "0-hook", "unguessable-token");
      assert.equal(key, "straw-motion/2026-W32/idea-01/unguessable-token/0-hook.jpg");
    });

    it("always ends .jpg regardless of the source slide's own extension", () => {
      const key = scheduleMediaKey("straw-motion", "2026-W32", "idea-02", "1-then", "unguessable-token");
      assert.ok(key.endsWith(".jpg"));
    });

    it("is pure — same inputs, same output", () => {
      const a = scheduleMediaKey("mundotip", "2026-W10", "idea-05", "3-proof", "unguessable-token");
      const b = scheduleMediaKey("mundotip", "2026-W10", "idea-05", "3-proof", "unguessable-token");
      assert.equal(a, b);
    });

    it("knowing only the Brand/run/Idea/slide-name is NOT enough to construct the key — a different token yields a different key (issue #198 AC2)", () => {
      const a = scheduleMediaKey("straw-motion", "2026-W32", "idea-01", "0-hook", "token-one");
      const b = scheduleMediaKey("straw-motion", "2026-W32", "idea-01", "0-hook", "token-two");
      assert.notEqual(a, b);
    });

    it("rejects an empty token, before building any key", () => {
      assert.throws(
        () => scheduleMediaKey("straw-motion", "2026-W32", "idea-01", "0-hook", ""),
        /non-empty unguessable token/,
      );
    });
  });
});
