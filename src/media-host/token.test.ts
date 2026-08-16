import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { randomMediaKeyToken } from "./token.ts";

describe("randomMediaKeyToken (issue #198 AC2 — the unguessable key component)", () => {
  it("returns a non-empty, URL/S3-key-safe string (base64url charset only)", () => {
    const token = randomMediaKeyToken();
    assert.ok(token.length > 0);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  it("returns a consistent length across calls (128 bits of entropy, base64url-encoded)", () => {
    const a = randomMediaKeyToken();
    const b = randomMediaKeyToken();
    assert.equal(a.length, 22); // ceil(16 bytes * 8 / 6), no padding
    assert.equal(b.length, 22);
  });

  it("two calls are (overwhelmingly likely to be) different — never a fixed/constant token", () => {
    const seen = new Set(Array.from({ length: 20 }, () => randomMediaKeyToken()));
    assert.equal(seen.size, 20);
  });

  it("never contains a '/' or '+' — safe to fold directly into an S3 key path segment", () => {
    for (let i = 0; i < 20; i++) {
      const token = randomMediaKeyToken();
      assert.ok(!token.includes("/"));
      assert.ok(!token.includes("+"));
    }
  });
});
