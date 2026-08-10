import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scriptText, shotListText, writeScriptText, writeShotListText } from "./news-short-script-output.ts";
import { collectShotListMedia, type ShotListDownloader } from "./shot-list-media.ts";
import { validNewsShortScriptSpec } from "../production-spec/fixtures/news-short-script-specs.ts";
import type { NewsShortScriptSpec } from "../production-spec/news-short-script-contract.ts";

function specFixture(): NewsShortScriptSpec {
  return validNewsShortScriptSpec() as unknown as NewsShortScriptSpec;
}

describe("scriptText — a single, copy-paste-ready teleprompter file (issue #174)", () => {
  it("joins every beat's text as clean paragraphs, in order", () => {
    const spec = specFixture();
    const text = scriptText(spec);
    const expected = spec.beats.map((b) => b.text).join("\n\n") + "\n";
    assert.equal(text, expected);
  });

  it("never includes a beat label, show cue, or URL — spoken words only", () => {
    const text = scriptText(specFixture());
    assert.doesNotMatch(text, /\[HOOK\]|\[STORY\]|\[CTA\]/);
    assert.doesNotMatch(text, /https?:\/\//);
    assert.doesNotMatch(text, /show:|source:|media:/);
  });

  it("skips a beat whose text is blank/whitespace-only, never leaving an empty paragraph", () => {
    const spec: NewsShortScriptSpec = {
      beats: [
        { role: "hook", text: "Real hook line.", source_url: "https://example.com", show_cue: "cue" },
        { role: "story", text: "   ", source_url: "https://example.com", show_cue: "cue" },
        { role: "cta", text: "Real cta line.", source_url: "https://example.com", show_cue: "cue" },
      ],
    };
    const text = scriptText(spec);
    assert.equal(text, "Real hook line.\n\nReal cta line.\n");
  });
});

describe("shotListText — a human-readable Shot List manifest (issue #174)", () => {
  it("renders each beat's role, show cue, source, and 'not collected' when results are omitted", () => {
    const spec = specFixture();
    const text = shotListText(spec);
    assert.match(text, /\[HOOK\]/);
    assert.match(text, new RegExp(`show: ${spec.beats[0]!.show_cue}`));
    assert.match(text, new RegExp(`source: ${spec.beats[0]!.source_url.replace(/[/.]/g, "\\$&")}`));
    assert.match(text, /media: not collected/);
  });

  it("renders a downloaded beat's local filename", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async () => ({ ok: true, bytes: new Uint8Array([1]) });
    const dir = await mkdtemp(join(tmpdir(), "og-shot-list-text-"));
    try {
      const results = await collectShotListMedia(spec, dir, { download });
      const text = shotListText(spec, results);
      assert.match(text, /media: downloaded -> beat-01-media/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("renders a link-only beat with its reason and URL, distinguishing no-media from a failed download", async () => {
    const spec = specFixture();
    const download: ShotListDownloader = async () => ({ ok: false, error: "boom" });
    const dir = await mkdtemp(join(tmpdir(), "og-shot-list-text-"));
    try {
      const results = await collectShotListMedia(spec, dir, { download });
      const text = shotListText(spec, results);
      assert.match(text, /media: link only \(download failed\) -> https:\/\/example\.com\/media\/announcement-clip\.mp4/);
      assert.match(text, /media: link only \(no specific media identified\) -> https:\/\/example\.com\/news\/support-agent-rollout/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("writeScriptText / writeShotListText — disk writers (issue #174)", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "og-shot-list-write-"));
    cleanup = async () => rm(dir, { recursive: true, force: true });
  });
  after(async () => cleanup());

  it("writes script.txt, matching scriptText's own render", async () => {
    const spec = specFixture();
    const path = await writeScriptText(dir, spec);
    assert.equal(path, join(dir, "script.txt"));
    const written = await readFile(path, "utf8");
    assert.equal(written, scriptText(spec));
  });

  it("writes shot-list.txt, matching shotListText's own render", async () => {
    const spec = specFixture();
    const path = await writeShotListText(dir, spec, []);
    assert.equal(path, join(dir, "shot-list.txt"));
    const written = await readFile(path, "utf8");
    assert.equal(written, shotListText(spec, []));
  });

  it("creates the directory if it doesn't exist yet", async () => {
    const freshDir = join(dir, "not-yet-created");
    const spec = specFixture();
    await writeScriptText(freshDir, spec);
    const written = await readFile(join(freshDir, "script.txt"), "utf8");
    assert.equal(written, scriptText(spec));
  });
});
