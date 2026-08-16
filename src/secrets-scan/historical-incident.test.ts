import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

import { findCredentialShapedStrings } from "./scanner.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The two commits that carried `.agents/mcp_config.json` with the real Zoho MCP credential
 *  (issue #197). Both unpushed as of when this was written; the credential has since been rotated
 *  dead by the Operator. Reading the content at test RUN TIME (rather than typing the value into
 *  this file) keeps no credential-shaped literal in this repository's source. */
const HISTORICAL_COMMITS = ["bb955eb", "8f7c8f6"];
const HISTORICAL_PATH = ".agents/mcp_config.json";

function gitShow(ref: string, path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "git",
      ["show", `${ref}:${path}`],
      { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}

describe("findCredentialShapedStrings — proven against the REAL historical incident (issue #197)", () => {
  for (const commit of HISTORICAL_COMMITS) {
    it(`catches the real secret exactly as committed in ${commit}:${HISTORICAL_PATH}`, async () => {
      const content = await gitShow(commit, HISTORICAL_PATH);
      const findings = findCredentialShapedStrings([{ path: HISTORICAL_PATH, content }]);
      assert.ok(
        findings.length >= 1,
        `expected at least one credential-shaped finding in the real ${commit}:${HISTORICAL_PATH} ` +
          "content — the scanner would NOT have caught the actual historical incident",
      );
      assert.ok(findings.some((f) => f.kind === "url-path-token"));
    });
  }
});
