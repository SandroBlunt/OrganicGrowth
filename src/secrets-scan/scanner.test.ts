import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  findCredentialShapedStrings,
  fingerprintValue,
  redactSecret,
  isBinaryContent,
  MIN_HEX_TOKEN_LENGTH,
} from "./scanner.ts";
import type { ScannableFile } from "./scanner.ts";

/**
 * Every fixture below uses a SYNTHETIC, clearly-fake secret value — never the real historical value
 * (that would put a credential-shaped literal in tracked source; `historical-incident.test.ts` proves
 * detection against the real thing by reading it from git history at RUN time instead, so no such
 * literal is ever written to a file in this repository).
 */
const FAKE_TOKEN = "0123456789abcdef0123456789abcdef"; // 32 hex chars — same shape/length as the real one

function file(path: string, content: string): ScannableFile {
  return { path, content };
}

describe("findCredentialShapedStrings — url-path-token pattern (issue #197)", () => {
  it("catches the historical shape: a long hex run as its own URL path segment", () => {
    const content = JSON.stringify({
      mcpServers: {
        "zoho-social": {
          args: ["-y", "mcp-remote", `https://social-000000000.zohomcp.com/mcp/${FAKE_TOKEN}/message`],
        },
      },
    });
    const findings = findCredentialShapedStrings([file(".agents/mcp_config.json", content)]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.kind, "url-path-token");
    assert.equal(findings[0]?.value, FAKE_TOKEN);
    assert.equal(findings[0]?.path, ".agents/mcp_config.json");
  });

  it("does not match a token shorter than MIN_HEX_TOKEN_LENGTH", () => {
    const shortToken = "a".repeat(MIN_HEX_TOKEN_LENGTH - 1);
    const content = `"https://example.com/mcp/${shortToken}/message"`;
    assert.equal(findCredentialShapedStrings([file("f.json", content)]).length, 0);
  });

  it("does not match a query-string HMAC signature (asset_url shape — always after '?', never a path segment)", () => {
    const content =
      `"asset_url": "https://pikaso.cdnpk.net/private/production/123/render.png?token=exp=1785110400~hmac=${FAKE_TOKEN}"`;
    assert.equal(findCredentialShapedStrings([file("ledger.json", content)]).length, 0);
  });

  it("does not match a bare hex identifier that is not part of a URL at all", () => {
    const content = `"identifier": "${FAKE_TOKEN}"`;
    assert.equal(findCredentialShapedStrings([file("ledger.json", content)]).length, 0);
  });

  it("does not match a git commit SHA quoted in prose (no URL wrapping it)", () => {
    const sha40 = "d44c12aaee4fa459a0d0d48f2afb669ea2d55821603b1f49";
    const content = `see commit ${sha40} for details`;
    assert.equal(findCredentialShapedStrings([file("handoff.md", content)]).length, 0);
  });

  it("does not match a shorter CDN-style path id below the calibrated threshold (documented false-negative shape)", () => {
    // Calibration example: a real Webflow CDN asset id found in tracked story-source `media_url`
    // fields is 24 hex chars — below MIN_HEX_TOKEN_LENGTH (28). Reproduced here with a synthetic id.
    const cdnId = "1234567890abcdef12345678"; // 24 hex chars
    const content = `"media_url": "https://cdn.prod.website-files.com/${cdnId}/asset_image4.png"`;
    assert.equal(findCredentialShapedStrings([file("idea-11.spec.json", content)]).length, 0);
  });

  it("finds one entry per matching URL across multiple files, each labeled with its own path and line", () => {
    const a = file("a.json", `"url": "https://x.example.com/y/${FAKE_TOKEN}/z"`);
    const b = file("b/nested.json", `no secret here\n"url": "https://x.example.com/w/${FAKE_TOKEN}/end"`);
    const findings = findCredentialShapedStrings([a, b]);
    assert.equal(findings.length, 2);
    assert.equal(findings[0]?.path, "a.json");
    assert.equal(findings[0]?.line, 1);
    assert.equal(findings[1]?.path, "b/nested.json");
    assert.equal(findings[1]?.line, 2);
  });
});

describe("findCredentialShapedStrings — named-secret-field pattern", () => {
  it("catches a secret-shaped value under a key literally named like a secret", () => {
    const content = `{"api_key": "sK9v2LmQ7xR4nT8wYh3B"}`;
    const findings = findCredentialShapedStrings([file("config.json", content)]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.kind, "named-secret-field");
  });

  it("matches token/secret/password/client_secret/authorization key variants", () => {
    const keys = ["token", "access_token", "client_secret", "password", "authorization", "apiKey"];
    for (const key of keys) {
      const content = `{"${key}": "sK9v2LmQ7xR4nT8wYh3B"}`;
      const findings = findCredentialShapedStrings([file("f.json", content)]);
      assert.equal(findings.length, 1, `expected a match for key "${key}"`);
    }
  });

  it("does not flag a placeholder-shaped value (matches .env.example / template conventions)", () => {
    const placeholders = ["your-api-key-here", "REPLACE_ME_TOKEN_VALUE", "changeme_secret_value"];
    for (const value of placeholders) {
      const content = `{"api_key": "${value}"}`;
      assert.equal(findCredentialShapedStrings([file("f.json", content)]).length, 0, value);
    }
  });

  it("does not flag a short value even under a secret-shaped key", () => {
    const content = `{"token": "short"}`;
    assert.equal(findCredentialShapedStrings([file("f.json", content)]).length, 0);
  });

  it("does not flag a value containing spaces (prose, not a token)", () => {
    const content = `{"password_hint": "your favourite pet plus a number"}`;
    assert.equal(findCredentialShapedStrings([file("f.json", content)]).length, 0);
  });

  it("does not flag an unrelated key name even with a token-shaped value", () => {
    const content = `{"identifier": "sK9v2LmQ7xR4nT8wYh3B"}`;
    assert.equal(findCredentialShapedStrings([file("f.json", content)]).length, 0);
  });
});

describe("findCredentialShapedStrings — general behavior", () => {
  it("returns an empty array for a file with no matches, and for an empty file list", () => {
    assert.deepEqual(findCredentialShapedStrings([file("clean.md", "nothing to see here")]), []);
    assert.deepEqual(findCredentialShapedStrings([]), []);
  });

  it("never throws on an empty-string file", () => {
    assert.doesNotThrow(() => findCredentialShapedStrings([file("empty.txt", "")]));
  });
});

describe("fingerprintValue / redactSecret", () => {
  it("fingerprintValue is deterministic and differs for different values", () => {
    assert.equal(fingerprintValue(FAKE_TOKEN), fingerprintValue(FAKE_TOKEN));
    assert.notEqual(fingerprintValue(FAKE_TOKEN), fingerprintValue(FAKE_TOKEN + "x"));
    assert.equal(fingerprintValue(FAKE_TOKEN).length, 64); // sha256 hex digest length
  });

  it("redactSecret never returns the full value, but stays recognizable for a long token", () => {
    const redacted = redactSecret(FAKE_TOKEN);
    assert.ok(!redacted.includes(FAKE_TOKEN));
    assert.equal(redacted, "0123…cdef");
  });

  it("redactSecret fully hides a short value", () => {
    assert.equal(redactSecret("short"), "[redacted]");
  });
});

describe("isBinaryContent", () => {
  it("detects a NUL byte within the sniff window as binary", () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]); // PNG-ish header w/ NUL
    assert.equal(isBinaryContent(buf), true);
  });

  it("treats plain UTF-8 text (no NUL byte) as non-binary", () => {
    const buf = new TextEncoder().encode("hello world\n{}");
    assert.equal(isBinaryContent(buf), false);
  });

  it("treats an empty buffer as non-binary", () => {
    assert.equal(isBinaryContent(new Uint8Array(0)), false);
  });
});
