/**
 * Credential-shaped string scanner — the pure deep module behind the automated check that fails
 * `npm test` when a tracked file carries something that looks like a live secret (issue #197).
 *
 * The concrete incident this exists to catch: a migration commit committed
 * `.agents/mcp_config.json` with the Zoho Social MCP server's URL, which embedded a 32-character hex
 * bearer token as its own PATH SEGMENT — `https://…zohomcp.com/mcp/<32-hex-chars>/message`. That
 * shape (a long hex run standing alone as a URL path segment) is `urlPathTokenPattern` below.
 *
 * This module is deliberately narrow rather than a generic secret-entropy scanner, because a naive
 * "any long hex run" rule is unusably noisy in THIS repository: `data/brands/<slug>/ledger.json`
 * already carries hundreds of legitimate long hex strings — Magnific creation identifiers, and `asset_url`
 * CDN query-string HMAC signatures (`...?token=exp=...~hmac=<64-hex>`) — and `openspec/` prose quotes
 * git commit SHAs. None of those are credentials, and a scanner that flagged them would be too noisy
 * to trust (and would train whoever runs it to ignore its output). Two calibration choices keep this
 * scanner sensitive to the real shape and quiet on those:
 *
 *   1. `urlPathTokenPattern` only matches a hex run that is itself a URL PATH segment (preceded by `/`,
 *      followed by `/`, a quote, whitespace, or end-of-string) — a query-string value after `?` never
 *      matches, because the character class the URL is scanned with excludes `?` entirely. This alone
 *      rules out every `asset_url` HMAC signature in the real ledgers (all query-string).
 *   2. The minimum hex-run length is `MIN_HEX_TOKEN_LENGTH` (28), calibrated between the real secret
 *      (32 hex chars) and the longest known-benign path-segment hex id actually found in this
 *      repository's tracked files: a Webflow CDN asset id (`cdn.prod.website-files.com/<24-hex>/...`,
 *      24 hex chars) embedded in a real news story's sourced `media_url`. 28 sits with 4 chars of
 *      margin on both sides. Documented, known false-negative: a bare 32-HEX-DIGIT UUID (dashes
 *      stripped) used as a CDN path id would still match at this length — none exist in this
 *      repository's tracked files today.
 *
 * A second, independent pattern (folded into `findCredentialShapedStrings` itself, not a separate
 * export) catches a differently-shaped leak: a JSON
 * `"<key>": "<value>"` pair whose key names something secret-shaped (`token`, `secret`, `password`,
 * `api_key`, `access_key`, `client_secret`, `authorization`, ...) and whose value is long enough and
 * un-placeholder-shaped enough to plausibly BE a live value rather than a blank/example. Verified
 * against every currently tracked file in this repository: zero matches (no tracked file uses any of
 * those key names today), so this pattern currently contributes no false positives.
 *
 * Pure: no filesystem, no `git`, no clock — operates only on the `{ path, content }` pairs it is
 * given. The I/O shell that lists `git ls-files` and reads their content lives in `tracked-files.ts`.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Tuning constants (see module docstring for the calibration rationale)
// ---------------------------------------------------------------------------

/** Minimum length of a bare hex run, used as a URL path segment, to be treated as credential-shaped. */
export const MIN_HEX_TOKEN_LENGTH = 28;

/** Minimum length of a named-secret-field VALUE to be treated as credential-shaped. */
const MIN_NAMED_SECRET_VALUE_LENGTH = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One file's content, ready to scan. `path` is used only to label findings — never re-read here. */
export interface ScannableFile {
  readonly path: string;
  readonly content: string;
}

export type FindingKind = "url-path-token" | "named-secret-field";

/** One credential-shaped match. `fingerprint` is a SHA-256 hex digest of the exact matched secret
 *  VALUE (never the whole line/URL) — safe to log/compare without ever printing the value itself. */
export interface CredentialFinding {
  readonly path: string;
  readonly line: number;
  readonly kind: FindingKind;
  /** The exact matched secret substring (the token, or the named field's value) — never redacted
   *  here; callers that print a finding to a human MUST redact via `redactSecret` first. */
  readonly value: string;
  readonly fingerprint: string;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** A hex run of `MIN_HEX_TOKEN_LENGTH`+ chars standing alone as a URL PATH segment (never a query
 *  string value — the URL's own character class excludes `?`). See module docstring. */
function urlPathTokenPattern(): RegExp {
  return new RegExp(
    `https?://[^\\s"'<>?]*/([0-9a-fA-F]{${MIN_HEX_TOKEN_LENGTH},})(?=[/"'\\s]|$)`,
    "g",
  );
}

/** A loose `"<key>": "<value>"` JSON-ish pair. Matched against raw text, not a JSON parse, so it also
 *  catches a malformed/partial file (e.g. one being hand-edited) — exactly the kind of file a strict
 *  parse would skip. */
const KV_PATTERN = /"([^"\n]{1,80})"\s*:\s*"([^"\n]*)"/g;

/** Key names that plausibly hold a secret. Matched by SUBSTRING, case-insensitively, against the key
 *  captured by `KV_PATTERN` — e.g. `"access_token"`, `"apiKey"`, `"client_secret"` all match. */
const SECRET_KEY_HINT_RE = /token|secret|password|passwd|api[-_]?key|access[-_]?key|authorization/i;

/** Value shapes that read as an obvious placeholder/example rather than a live secret — e.g.
 *  `"your-api-key"`, `"<REPLACE_ME>"`, `"REDACTED"`, `"changeme"`. Checked case-insensitively. */
const PLACEHOLDER_VALUE_RE =
  /^(your|replace|example|placeholder|todo|xxxx+|redacted|changeme|change_me|insert|fixture|fake|dummy|sample|test)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hex digest of a matched secret value — safe to log or compare without exposing the value
 *  itself. Exported for callers that want to compare/report findings without ever printing one. */
export function fingerprintValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Redact a secret value for safe display: first 4 + "…" + last 4 characters. Never returns the full
 *  value. Short values (<= 10 chars) redact to a fixed placeholder rather than leaking most of it. */
export function redactSecret(value: string): string {
  if (value.length <= 10) return "[redacted]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** True when `value` is long enough and un-placeholder-shaped enough to be treated as a plausible
 *  live secret VALUE for the named-secret-field pattern. Requires an unbroken run of URL-safe token
 *  characters (letters, digits, `_`, `-`) — a value containing a space, for example, reads as prose
 *  or a description, not a token. */
function looksLikeSecretValue(value: string): boolean {
  if (value.length < MIN_NAMED_SECRET_VALUE_LENGTH) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  if (PLACEHOLDER_VALUE_RE.test(value)) return false;
  return true;
}

/** 1-based line number of `index` within `content` (counts newlines up to `index`). */
function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// findCredentialShapedStrings — the ONE entry point
// ---------------------------------------------------------------------------

/**
 * Scan every given file's content for credential-shaped strings (both patterns above). Pure and
 * deterministic: the same `files` input always yields the same findings, in file order then match
 * order within a file. Never throws on odd input (an empty file, a file with no matches) — always
 * returns an array, possibly empty.
 */
export function findCredentialShapedStrings(
  files: readonly ScannableFile[],
): readonly CredentialFinding[] {
  const findings: CredentialFinding[] = [];

  for (const file of files) {
    const urlPattern = urlPathTokenPattern();
    for (const match of file.content.matchAll(urlPattern)) {
      const value = match[1];
      if (value === undefined) continue;
      findings.push({
        path: file.path,
        line: lineNumberAt(file.content, match.index),
        kind: "url-path-token",
        value,
        fingerprint: fingerprintValue(value),
      });
    }

    const kvPattern = new RegExp(KV_PATTERN.source, KV_PATTERN.flags);
    for (const match of file.content.matchAll(kvPattern)) {
      const key = match[1];
      const value = match[2];
      if (key === undefined || value === undefined) continue;
      if (!SECRET_KEY_HINT_RE.test(key)) continue;
      if (!looksLikeSecretValue(value)) continue;
      findings.push({
        path: file.path,
        line: lineNumberAt(file.content, match.index),
        kind: "named-secret-field",
        value,
        fingerprint: fingerprintValue(value),
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Binary detection — used by the tracked-files I/O shell to skip non-text content
// ---------------------------------------------------------------------------

/** How many leading bytes to sniff for a NUL byte when deciding whether a file is binary. */
const BINARY_SNIFF_BYTES = 8000;

/** True when `buf` looks like binary content (a NUL byte within the first `BINARY_SNIFF_BYTES`
 *  bytes) — the same heuristic Git itself uses. A tracked image/video/audio file must never be
 *  decoded as UTF-8 text and scanned; this is a pure, deterministic check on bytes already in hand. */
export function isBinaryContent(buf: Uint8Array): boolean {
  const limit = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
