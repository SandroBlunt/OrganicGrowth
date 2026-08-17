import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MAX_PRESIGN_SECONDS, assertValidExpiresInSeconds } from "./aws-presign-limit.ts";

describe("MAX_PRESIGN_SECONDS (issue #198 — AWS's own SigV4 ceiling)", () => {
  it("is exactly 7 days in seconds", () => {
    assert.equal(MAX_PRESIGN_SECONDS, 604800);
  });
});

describe("assertValidExpiresInSeconds", () => {
  it("accepts 1", () => {
    assert.doesNotThrow(() => assertValidExpiresInSeconds(1));
  });

  it("accepts exactly MAX_PRESIGN_SECONDS", () => {
    assert.doesNotThrow(() => assertValidExpiresInSeconds(MAX_PRESIGN_SECONDS));
  });

  it("rejects 0", () => {
    assert.throws(() => assertValidExpiresInSeconds(0), /positive integer/);
  });

  it("rejects a negative value", () => {
    assert.throws(() => assertValidExpiresInSeconds(-10), /positive integer/);
  });

  it("rejects a non-integer value", () => {
    assert.throws(() => assertValidExpiresInSeconds(3600.5), /positive integer/);
  });

  it("rejects one second more than MAX_PRESIGN_SECONDS, naming the ceiling", () => {
    assert.throws(
      () => assertValidExpiresInSeconds(MAX_PRESIGN_SECONDS + 1),
      /604800/,
    );
  });
});
