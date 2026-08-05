import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { redactSecrets } from "./redact.ts";

describe("redactSecrets (issue #144 — credentials are never printed)", () => {
  it("replaces every occurrence of a secret with [REDACTED]", () => {
    const text = "error: bad key AKIAABCDEFGHIJKLMNOP, retry with AKIAABCDEFGHIJKLMNOP";
    const redacted = redactSecrets(text, ["AKIAABCDEFGHIJKLMNOP"]);
    assert.equal(redacted, "error: bad key [REDACTED], retry with [REDACTED]");
    assert.ok(!redacted.includes("AKIAABCDEFGHIJKLMNOP"));
  });

  it("redacts several distinct secrets in the same text", () => {
    const text = "id=AKIA1234567890ABCDEF secret=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const redacted = redactSecrets(text, [
      "AKIA1234567890ABCDEF",
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    ]);
    assert.equal(redacted, "id=[REDACTED] secret=[REDACTED]");
  });

  it("ignores undefined secrets (unset env vars)", () => {
    const text = "no secrets here";
    assert.equal(redactSecrets(text, [undefined, undefined]), "no secrets here");
  });

  it("ignores secrets shorter than 4 characters (never mangles ordinary short text)", () => {
    const text = "ok, retry";
    assert.equal(redactSecrets(text, ["ok"]), "ok, retry");
  });

  it("leaves text with no matching secret untouched", () => {
    const text = "AccessDenied: not authorized";
    assert.equal(redactSecrets(text, ["some-other-secret-value"]), text);
  });

  it("returns the original text when given an empty secrets list", () => {
    assert.equal(redactSecrets("hello", []), "hello");
  });
});
