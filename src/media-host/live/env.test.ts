import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDotEnv, loadDotEnvFile, loadEffectiveEnv } from "./env.ts";

describe("parseDotEnv (issue #144 — a tiny, dependency-free .env parser)", () => {
  it("parses simple KEY=VALUE lines", () => {
    assert.deepEqual(parseDotEnv("FOO=bar\nBAZ=qux\n"), { FOO: "bar", BAZ: "qux" });
  });

  it("ignores blank lines and comment lines", () => {
    assert.deepEqual(parseDotEnv("\n# a comment\nFOO=bar\n\n#another\n"), { FOO: "bar" });
  });

  it("strips a leading export keyword", () => {
    assert.deepEqual(parseDotEnv("export FOO=bar\n"), { FOO: "bar" });
  });

  it("strips matching surrounding quotes (single or double)", () => {
    assert.deepEqual(parseDotEnv('FOO="bar baz"\nQUX=\'a b\'\n'), { FOO: "bar baz", QUX: "a b" });
  });

  it("trims surrounding whitespace around key and value", () => {
    assert.deepEqual(parseDotEnv("  FOO  =  bar  \n"), { FOO: "bar" });
  });

  it("ignores a line with no equals sign", () => {
    assert.deepEqual(parseDotEnv("not-a-valid-line\nFOO=bar\n"), { FOO: "bar" });
  });

  it("allows an equals sign inside the value", () => {
    assert.deepEqual(parseDotEnv("FOO=a=b=c\n"), { FOO: "a=b=c" });
  });

  it("returns {} for empty content", () => {
    assert.deepEqual(parseDotEnv(""), {});
  });
});

describe("loadDotEnvFile (issue #144)", () => {
  async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-media-host-env-"));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("reads and parses a real .env file", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, ".env");
      await writeFile(path, "AWS_ACCESS_KEY_ID=AKIA_TEST\n", "utf8");
      assert.deepEqual(await loadDotEnvFile(path), { AWS_ACCESS_KEY_ID: "AKIA_TEST" });
    });
  });

  it("returns {} (never throws) when the file is missing", async () => {
    await withTempDir(async (dir) => {
      assert.deepEqual(await loadDotEnvFile(join(dir, "does-not-exist.env")), {});
    });
  });
});

describe("loadEffectiveEnv (issue #144 — .env fills gaps, never overrides an already-set var)", () => {
  async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-media-host-env-"));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("fills a var from .env when the base env does not already have it", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, ".env");
      await writeFile(path, "AWS_ACCESS_KEY_ID=from-dotenv\n", "utf8");
      const merged = await loadEffectiveEnv({ envFilePath: path, base: { PATH: "/usr/bin" } });
      assert.equal(merged.AWS_ACCESS_KEY_ID, "from-dotenv");
      assert.equal(merged.PATH, "/usr/bin");
    });
  });

  it("an already-set base env var always wins over .env — never overridden", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, ".env");
      await writeFile(path, "AWS_ACCESS_KEY_ID=from-dotenv\n", "utf8");
      const merged = await loadEffectiveEnv({
        envFilePath: path,
        base: { AWS_ACCESS_KEY_ID: "from-shell" },
      });
      assert.equal(merged.AWS_ACCESS_KEY_ID, "from-shell");
    });
  });

  it("when .env is missing entirely, the base env passes through unchanged (falls through to the AWS CLI's own default chain)", async () => {
    await withTempDir(async (dir) => {
      const merged = await loadEffectiveEnv({
        envFilePath: join(dir, "does-not-exist.env"),
        base: { PATH: "/usr/bin", HOME: "/Users/test" },
      });
      assert.deepEqual(merged, { PATH: "/usr/bin", HOME: "/Users/test" });
    });
  });

  it("defaults base to process.env when not given", async () => {
    await withTempDir(async (dir) => {
      const merged = await loadEffectiveEnv({ envFilePath: join(dir, "does-not-exist.env") });
      assert.equal(merged.PATH, process.env.PATH);
    });
  });
});
