import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertJpgKey } from "./key.ts";

describe("assertJpgKey (issue #144 — Zoho's stated .jpg media rule)", () => {
  it("accepts a key ending in .jpg", () => {
    assert.doesNotThrow(() => assertJpgKey("straw-motion/2026-W32/idea-01/0-hook.jpg"));
  });

  it("rejects a key with no .jpg extension at all", () => {
    assert.throws(() => assertJpgKey("straw-motion/2026-W32/idea-01/0-hook"), /\.jpg/);
  });

  it("rejects a key ending in .png (the original slide format)", () => {
    assert.throws(() => assertJpgKey("straw-motion/2026-W32/idea-01/0-hook.png"), /\.jpg/);
  });

  it("rejects uppercase .JPG — this port's own convention is always lowercase", () => {
    assert.throws(() => assertJpgKey("straw-motion/2026-W32/idea-01/0-hook.JPG"), /\.jpg/);
  });

  it("rejects an empty key", () => {
    assert.throws(() => assertJpgKey(""), /\.jpg/);
  });

  it("names the offending key in the error message", () => {
    assert.throws(() => assertJpgKey("bad.gif"), /bad\.gif/);
  });
});
