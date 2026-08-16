import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseWorkflow,
  triggersOnPushAndPullRequest,
  checkoutFetchDepth,
  setupNodeVersion,
  runsExactNpmTest,
  referencesLiveCredentials,
} from "./workflow.ts";

/**
 * Issue #199 — proves `.github/workflows/ci.yml`'s own shape, both against synthetic fixtures (the
 * pure logic in `workflow.ts`) and against this repository's REAL committed workflow file (the last
 * `describe` block below), the same "prove it against the real file" pattern
 * `src/secrets-scan/self-scan.test.ts` and `historical-incident.test.ts` already use. A future edit
 * that narrows the trigger, drops `fetch-depth: 0`, changes the run command away from exactly
 * `npm test`, or introduces a live-credential reference fails right here.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "ci.yml");

const MAPPING_ON = `
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

const LIST_ON = `
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

const BARE_STRING_ON_MISSING_PR = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

describe("triggersOnPushAndPullRequest — reads every on: shape GitHub Actions accepts", () => {
  it("returns true for a mapping with both push: and pull_request: keys", () => {
    assert.equal(triggersOnPushAndPullRequest(parseWorkflow(MAPPING_ON)), true);
  });

  it("returns true for a bare list containing both events", () => {
    assert.equal(triggersOnPushAndPullRequest(parseWorkflow(LIST_ON)), true);
  });

  it("returns false for a bare string missing pull_request", () => {
    assert.equal(triggersOnPushAndPullRequest(parseWorkflow(BARE_STRING_ON_MISSING_PR)), false);
  });

  it("returns false when on: is absent entirely", () => {
    assert.equal(triggersOnPushAndPullRequest(parseWorkflow("jobs: {}")), false);
  });
});

describe("checkoutFetchDepth — reads fetch-depth off the first actions/checkout step", () => {
  it("reads fetch-depth: 0 from a checkout step's with: block", () => {
    const yamlText = `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
`;
    assert.equal(checkoutFetchDepth(parseWorkflow(yamlText)), 0);
  });

  it("returns undefined when no actions/checkout step exists", () => {
    const yamlText = `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;
    assert.equal(checkoutFetchDepth(parseWorkflow(yamlText)), undefined);
  });

  it("returns undefined when the checkout step declares no fetch-depth (the shallow-clone default)", () => {
    const yamlText = `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
    assert.equal(checkoutFetchDepth(parseWorkflow(yamlText)), undefined);
  });
});

describe("setupNodeVersion — reads node-version off the first actions/setup-node step", () => {
  it("reads the declared node-version", () => {
    const yamlText = `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
`;
    assert.equal(setupNodeVersion(parseWorkflow(yamlText)), "22");
  });

  it("returns undefined when no actions/setup-node step exists", () => {
    assert.equal(setupNodeVersion(parseWorkflow("on: [push]\njobs: {}")), undefined);
  });
});

describe("runsExactNpmTest — rejects a narrower or different command", () => {
  const fixtureFor = (command: string) => `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: ${command}
`;

  it("returns true only for the literal 'npm test' step", () => {
    assert.equal(runsExactNpmTest(parseWorkflow(fixtureFor("npm test"))), true);
  });

  it("returns false for 'npm run test:docs'", () => {
    assert.equal(runsExactNpmTest(parseWorkflow(fixtureFor("npm run test:docs"))), false);
  });

  it("returns false for 'npm run test'", () => {
    assert.equal(runsExactNpmTest(parseWorkflow(fixtureFor("npm run test"))), false);
  });

  it("returns false for 'npm test -- --extra'", () => {
    assert.equal(runsExactNpmTest(parseWorkflow(fixtureFor("npm test -- --extra"))), false);
  });

  it("returns false when there are no run: steps at all", () => {
    const yamlText = `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
    assert.equal(runsExactNpmTest(parseWorkflow(yamlText)), false);
  });
});

describe("referencesLiveCredentials — catches a secrets. reference or a live-service-shaped name", () => {
  it("returns true for a ${{ secrets.* }} reference", () => {
    assert.equal(referencesLiveCredentials("env:\n  TOKEN: ${{ secrets.SOME_TOKEN }}\n"), true);
  });

  it("returns true for a Magnific-shaped env var name, even with no secrets. reference", () => {
    assert.equal(referencesLiveCredentials("env:\n  MAGNIFIC_API_KEY: abc\n"), true);
  });

  it("returns true for a Zoho-shaped, an Apify-shaped, and an AWS-shaped name", () => {
    assert.equal(referencesLiveCredentials("env:\n  ZOHO_TOKEN: x\n"), true);
    assert.equal(referencesLiveCredentials("env:\n  APIFY_TOKEN: x\n"), true);
    assert.equal(referencesLiveCredentials("env:\n  AWS_ACCESS_KEY_ID: x\n"), true);
  });

  it("is case-insensitive", () => {
    assert.equal(referencesLiveCredentials("env:\n  zoho_token: x\n"), true);
  });

  it("returns false for ordinary hermetic workflow text", () => {
    const yamlText = `
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: npm test
`;
    assert.equal(referencesLiveCredentials(yamlText), false);
  });
});

describe("This repository's real .github/workflows/ci.yml satisfies every check (issue #199)", () => {
  it("triggers on both push and pull_request", async () => {
    const raw = await readFile(WORKFLOW_PATH, "utf8");
    assert.equal(triggersOnPushAndPullRequest(parseWorkflow(raw)), true);
  });

  it("checks out with fetch-depth: 0 (full history, not the shallow-clone default)", async () => {
    const raw = await readFile(WORKFLOW_PATH, "utf8");
    assert.equal(checkoutFetchDepth(parseWorkflow(raw)), 0);
  });

  it("sets up Node 22 or newer, matching package.json's engines.node", async () => {
    const raw = await readFile(WORKFLOW_PATH, "utf8");
    const version = setupNodeVersion(parseWorkflow(raw));
    assert.ok(version !== undefined, "expected a node-version to be declared");
    assert.ok(parseInt(version, 10) >= 22, `expected Node >= 22, got ${version}`);
  });

  it("runs exactly npm test", async () => {
    const raw = await readFile(WORKFLOW_PATH, "utf8");
    assert.equal(runsExactNpmTest(parseWorkflow(raw)), true);
  });

  it("references no live credential of any kind", async () => {
    const raw = await readFile(WORKFLOW_PATH, "utf8");
    assert.equal(referencesLiveCredentials(raw), false);
  });
});
