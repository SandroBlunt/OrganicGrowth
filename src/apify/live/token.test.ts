import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveApifyToken } from "./token.ts";

// A realistic-shaped but clearly-fake token, built by concatenation — see request.test.ts for why.
const FAKE_TOKEN = "test-fake-apify-token-" + "1a2b3c4d5e6f7089";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-apify-token-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("resolveApifyToken (issue #200) — never a network call, never throws", () => {
  it("returns null when the env has no APIFY_API_TOKEN at all", async () => {
    assert.equal(await resolveApifyToken({ env: { PATH: "/usr/bin" } }), null);
  });

  it("returns the token when present directly on the given env", async () => {
    assert.equal(await resolveApifyToken({ env: { APIFY_API_TOKEN: FAKE_TOKEN } }), FAKE_TOKEN);
  });

  it("trims surrounding whitespace", async () => {
    assert.equal(await resolveApifyToken({ env: { APIFY_API_TOKEN: `  ${FAKE_TOKEN}  ` } }), FAKE_TOKEN);
  });

  it("returns null for a blank/whitespace-only value — never an empty-string token", async () => {
    assert.equal(await resolveApifyToken({ env: { APIFY_API_TOKEN: "   " } }), null);
  });

  it("reads a real .env file when no env is given directly (hermetic — a local temp file, no network)", async () => {
    await withTempDir(async (dir) => {
      const envPath = join(dir, ".env");
      await writeFile(envPath, `APIFY_API_TOKEN=${FAKE_TOKEN}\n`, "utf8");
      // `base: {}` isolates this from the real shell's own process.env — proves the FILE-read path
      // deterministically, never depending on whatever happens to be exported in this machine's shell.
      const token = await resolveApifyToken({ envFilePath: envPath, base: {} });
      assert.equal(token, FAKE_TOKEN);
    });
  });

  it("an already-set base env value wins over .env — never overridden (mirrors loadEffectiveEnv)", async () => {
    await withTempDir(async (dir) => {
      const envPath = join(dir, ".env");
      await writeFile(envPath, "APIFY_API_TOKEN=from-dotenv-should-be-ignored\n", "utf8");
      const token = await resolveApifyToken({
        envFilePath: envPath,
        base: { APIFY_API_TOKEN: FAKE_TOKEN },
      });
      assert.equal(token, FAKE_TOKEN);
    });
  });

  it("returns null when the .env file is missing entirely and no base env value exists", async () => {
    await withTempDir(async (dir) => {
      const token = await resolveApifyToken({
        envFilePath: join(dir, "does-not-exist.env"),
        env: { PATH: "/usr/bin" },
      });
      assert.equal(token, null);
    });
  });
});
