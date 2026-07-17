import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  requiredCtaFrom,
  requiredHashtagsFrom,
  loadCopyRules,
  watermarkHandleFrom,
  loadWatermarkHandle,
} from "./brand-profile.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BANNED_PROFILE = join(HERE, "fixtures", "brand-profile.banned.yaml");

describe("requiredCtaFrom (defensive) — ADR-0012: bring the dead required_cta rule live", () => {
  it("reads a configured required_cta verbatim", () => {
    assert.equal(requiredCtaFrom({ required_cta: "Link in bio!" }), "Link in bio!");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(requiredCtaFrom({ required_cta: "  Link in bio!  " }), "Link in bio!");
  });

  it("returns null for the real profile's default shape (an empty string) — never an empty sentinel", () => {
    assert.equal(requiredCtaFrom({ required_cta: "" }), null);
    assert.equal(requiredCtaFrom({ required_cta: "   " }), null);
  });

  it("returns null when required_cta is absent, non-string, or the raw value isn't an object", () => {
    assert.equal(requiredCtaFrom({}), null);
    assert.equal(requiredCtaFrom({ required_cta: 7 }), null);
    assert.equal(requiredCtaFrom(null), null);
  });
});

describe("requiredHashtagsFrom (defensive) — ADR-0012: bring the dead required_hashtags rule live", () => {
  it("reads a configured required_hashtags list", () => {
    assert.deepEqual(requiredHashtagsFrom({ required_hashtags: ["#lifehacks", "#tips"] }), [
      "#lifehacks",
      "#tips",
    ]);
  });

  it("returns [] for the real profile's default shape (an empty list)", () => {
    assert.deepEqual(requiredHashtagsFrom({ required_hashtags: [] }), []);
  });

  it("drops non-string and blank entries defensively", () => {
    assert.deepEqual(requiredHashtagsFrom({ required_hashtags: ["#a", 7, "", "  ", "#b"] }), [
      "#a",
      "#b",
    ]);
  });

  it("returns [] when required_hashtags is absent or the raw value isn't an object", () => {
    assert.deepEqual(requiredHashtagsFrom({}), []);
    assert.deepEqual(requiredHashtagsFrom(null), []);
  });
});

describe("loadCopyRules — bundles required_cta/required_hashtags/banned_words in one read", () => {
  it("reads all three from a fixture Brand Profile", async () => {
    const rules = await loadCopyRules(BANNED_PROFILE);
    assert.deepEqual(rules, {
      requiredCta: "Link in bio!",
      requiredHashtags: ["#lifehacks"],
      bannedWords: ["cure", "miracle", "guaranteed"],
    });
  });

  it("a missing Brand Profile loads as no rules configured, never crashes", async () => {
    const rules = await loadCopyRules(join(HERE, "fixtures", "nope.yaml"));
    assert.deepEqual(rules, { requiredCta: null, requiredHashtags: [], bannedWords: [] });
  });
});

describe("watermarkHandleFrom (defensive) — QA-1 (issue #88): the @handle a Recipe's watermarkNode gets set to", () => {
  it("reads a configured production.watermark_handle, trimmed", () => {
    assert.equal(watermarkHandleFrom({ production: { watermark_handle: "  @strawmotion  " } }), "@strawmotion");
  });

  it("returns '' for the real profile's default shape (not yet configured) — never null/undefined", () => {
    assert.equal(watermarkHandleFrom({ production: { watermark_handle: "" } }), "");
    assert.equal(watermarkHandleFrom({}), "");
    assert.equal(watermarkHandleFrom({ production: {} }), "");
  });

  it("returns '' when production or watermark_handle is malformed — never throws", () => {
    assert.equal(watermarkHandleFrom({ production: "not an object" }), "");
    assert.equal(watermarkHandleFrom({ production: { watermark_handle: 7 } }), "");
    assert.equal(watermarkHandleFrom(null), "");
  });
});

describe("loadWatermarkHandle — reads production.watermark_handle from a Brand Profile file", () => {
  it("a missing Brand Profile loads as '' (not yet configured), never crashes", async () => {
    const handle = await loadWatermarkHandle(join(HERE, "fixtures", "nope.yaml"));
    assert.equal(handle, "");
  });

  it("the real fixture profile (no production block) loads as ''", async () => {
    const handle = await loadWatermarkHandle(BANNED_PROFILE);
    assert.equal(handle, "");
  });
});
