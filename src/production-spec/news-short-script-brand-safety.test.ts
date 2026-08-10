import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scanNewsShortScriptForBannedWords } from "./news-short-script-brand-safety.ts";
import { validNewsShortScriptSpec } from "./fixtures/news-short-script-specs.ts";

describe("scanNewsShortScriptForBannedWords — covers EVERY beat text field (issue #174)", () => {
  it("passes a clean Spec when no words are banned", () => {
    const result = scanNewsShortScriptForBannedWords(validNewsShortScriptSpec(), []);
    assert.equal(result.ok, true);
    assert.deepEqual(result.hits, []);
  });

  it("catches a banned word in a beat's text", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    beats[0]!.text = "This is a miracle cure for everything.";
    const result = scanNewsShortScriptForBannedWords(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.field === "beats[0].text" && h.word === "miracle"));
  });

  it("catches a banned word in a beat's show_cue", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    beats[1]!.show_cue = "Show the miracle demo.";
    const result = scanNewsShortScriptForBannedWords(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.field === "beats[1].show_cue"));
  });

  it("catches a banned word in a beat's source_url", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    beats[0]!.source_url = "https://example.com/miracle-story";
    const result = scanNewsShortScriptForBannedWords(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.field === "beats[0].source_url"));
  });

  it("catches a banned word in a beat's media_url, when present", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    beats[0]!.media_url = "https://example.com/media/miracle-clip.mp4";
    const result = scanNewsShortScriptForBannedWords(spec, ["miracle"]);
    assert.equal(result.ok, false);
    assert.ok(result.hits.some((h) => h.field === "beats[0].media_url"));
  });

  it("always passes when bannedWords is empty, regardless of content", () => {
    const spec = validNewsShortScriptSpec();
    const beats = spec.beats as Record<string, unknown>[];
    beats[0]!.text = "A guaranteed miracle cure, 100% safe.";
    const result = scanNewsShortScriptForBannedWords(spec, []);
    assert.equal(result.ok, true);
  });

  it("never throws on a malformed Spec — simply finds nothing to scan", () => {
    assert.doesNotThrow(() => scanNewsShortScriptForBannedWords("not an object", ["miracle"]));
    assert.doesNotThrow(() => scanNewsShortScriptForBannedWords({ beats: "nope" }, ["miracle"]));
    assert.deepEqual(scanNewsShortScriptForBannedWords({ beats: [1, 2, 3] }, ["miracle"]).hits, []);
  });
});
