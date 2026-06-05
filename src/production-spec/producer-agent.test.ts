import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Proves the content `producer` agent definition exists, is model Opus, and describes its role per
 * CLAUDE.md / CONTEXT.md (acceptance criterion: "A producer agent definition exists (Opus)").
 *
 * The repo root is two levels up from src/production-spec/.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRODUCER_AGENT = join(REPO_ROOT, ".claude", "agents", "producer.md");

describe("producer agent definition", () => {
  it("exists and is readable", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.ok(text.length > 0);
  });

  it("declares model opus in the front-matter", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /^model:\s*opus\s*$/m);
    assert.match(text, /^name:\s*producer\s*$/m);
  });

  it("describes generating a Production Spec and generate-never-publish", async () => {
    const text = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(text, /Production Spec/);
    assert.match(text, /never publish/i);
    // It must describe driving the Magnific Space and the Cast gate (its role per CONTEXT.md).
    assert.match(text, /Magnific/);
    assert.match(text, /Cast/);
  });
});
