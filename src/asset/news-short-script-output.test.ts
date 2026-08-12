import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  scriptText,
  shotListText,
  writeScriptText,
  writeShotListText,
  NEXT_SHOT_MARKER,
} from "./news-short-script-output.ts";
import { collectShotListMedia, type ShotListDownloader } from "./shot-list-media.ts";
import { validNewsShortScriptSpec } from "../production-spec/fixtures/news-short-script-specs.ts";
import type { NewsShortScriptSpec } from "../production-spec/news-short-script-contract.ts";

function specFixture(): NewsShortScriptSpec {
  return validNewsShortScriptSpec() as unknown as NewsShortScriptSpec;
}

describe("scriptText — a single, copy-paste-ready teleprompter file, with a [Next shot] marker between beats (issue #174, issue #187)", () => {
  it("joins every beat's text as clean paragraphs, in order, separated by the [Next shot] marker", () => {
    const spec = specFixture();
    const text = scriptText(spec);
    const expected = spec.beats.map((b) => b.text).join(`\n\n${NEXT_SHOT_MARKER}\n\n`) + "\n";
    assert.equal(text, expected);
  });

  it("shows exactly one [Next shot] marker between every pair of consecutive beats", () => {
    const spec = specFixture();
    const text = scriptText(spec);
    const markerCount = text.split(NEXT_SHOT_MARKER).length - 1;
    assert.equal(markerCount, spec.beats.length - 1);
  });

  it("never includes a beat-role label, show cue, source URL, or Curiosity Query — spoken words (plus the [Next shot] marker) only", () => {
    const text = scriptText(specFixture());
    assert.doesNotMatch(text, /\[HOOK\]|\[STORY\]|\[CTA\]/);
    assert.doesNotMatch(text, /https?:\/\//);
    assert.doesNotMatch(text, /show:|source:|media:|queries:/);
  });

  it("the [Next shot] marker is a document annotation only — no beat's own text field is ever touched by it", () => {
    const spec = specFixture();
    for (const beat of spec.beats) {
      assert.doesNotMatch(beat.text, new RegExp(NEXT_SHOT_MARKER.replace(/[[\]]/g, "\\$&")));
    }
  });

  it("skips a beat whose text is blank/whitespace-only, never leaving an empty paragraph or a stray marker", () => {
    const spec: NewsShortScriptSpec = {
      beats: [
        {
          role: "hook",
          text: "Real hook line.",
          source_url: "https://example.com",
          show_cue: "cue",
          curiosity_queries: ["q1", "q2", "q3"],
        },
        {
          role: "story",
          text: "   ",
          source_url: "https://example.com",
          show_cue: "cue",
          curiosity_queries: ["q1", "q2", "q3"],
        },
        {
          role: "cta",
          text: "Real cta line.",
          source_url: "https://example.com",
          show_cue: "cue",
          curiosity_queries: ["q1", "q2", "q3"],
        },
      ],
    };
    const text = scriptText(spec);
    assert.equal(text, `Real hook line.\n\n${NEXT_SHOT_MARKER}\n\nReal cta line.\n`);
  });
});

describe("shotListText — a human-readable Shot List manifest (issue #174, issue #187)", () => {
  it("renders each beat's role, show cue, source, Curiosity Queries, and 'not collected' when results are omitted", () => {
    const spec = specFixture();
    const text = shotListText(spec);
    assert.match(text, /\[HOOK\]/);
    assert.match(text, new RegExp(`show: ${spec.beats[0]!.show_cue}`));
    assert.match(text, new RegExp(`source: ${spec.beats[0]!.source_url.replace(/[/.]/g, "\\$&")}`));
    assert.match(text, new RegExp(`queries: ${spec.beats[0]!.curiosity_queries.join(" \\| ")}`));
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
      // Beat 0 carries a media_url -> the failed download is a "download failed" link, pointing at it.
      const beat0 = spec.beats[0]!;
      assert.match(
        text,
        new RegExp(`media: link only \\(download failed\\) -> ${beat0.media_url!.replace(/[/.]/g, "\\$&")}`),
      );
      // Beat 1 carries no media_url at all -> "no specific media identified", pointing at its source_url.
      const beat1 = spec.beats[1]!;
      assert.match(
        text,
        new RegExp(
          `media: link only \\(no specific media identified\\) -> ${beat1.source_url.replace(/[/.]/g, "\\$&")}`,
        ),
      );
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
