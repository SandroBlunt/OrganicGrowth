import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { injectRequiredCta, injectRequiredHashtags, injectRequiredParts } from "./inject.ts";
import type { Copy } from "./contract.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";

describe("injectRequiredCta — deterministic, append if absent", () => {
  it("appends the required CTA when absent", () => {
    assert.equal(injectRequiredCta("Great morning tip", "Link in bio!"), "Great morning tip Link in bio!");
  });

  it("dedupes: leaves the caption unchanged when the CTA is already present", () => {
    assert.equal(
      injectRequiredCta("Great morning tip. Link in bio!", "Link in bio!"),
      "Great morning tip. Link in bio!",
    );
  });

  it("dedupes case-insensitively", () => {
    assert.equal(
      injectRequiredCta("Great tip — LINK IN BIO!", "Link in bio!"),
      "Great tip — LINK IN BIO!",
    );
  });

  it("is a no-op when requiredCta is null (no CTA enforced)", () => {
    assert.equal(injectRequiredCta("Great morning tip", null), "Great morning tip");
  });

  it("is a no-op when requiredCta is blank", () => {
    assert.equal(injectRequiredCta("Great morning tip", "   "), "Great morning tip");
  });

  it("returns just the CTA when the caption is empty", () => {
    assert.equal(injectRequiredCta("", "Link in bio!"), "Link in bio!");
  });
});

describe("injectRequiredHashtags — deterministic, append if absent, dedupe if present", () => {
  it("appends missing required hashtags, in configured order", () => {
    assert.deepEqual(injectRequiredHashtags(["#morning"], ["lifehacks", "tips"]), [
      "#morning",
      "#lifehacks",
      "#tips",
    ]);
  });

  it("dedupes a required hashtag already present WITH its #", () => {
    assert.deepEqual(injectRequiredHashtags(["#morning", "#lifehacks"], ["#lifehacks"]), [
      "#morning",
      "#lifehacks",
    ]);
  });

  it("dedupes a required hashtag already present WITHOUT a # and case-insensitively", () => {
    assert.deepEqual(injectRequiredHashtags(["#morning", "LifeHacks"], ["#lifehacks"]), [
      "#morning",
      "LifeHacks",
    ]);
  });

  it("preserves existing hashtags and their order untouched", () => {
    assert.deepEqual(injectRequiredHashtags(["#b", "#a"], []), ["#b", "#a"]);
  });

  it("normalizes an appended required hashtag to carry a leading #", () => {
    assert.deepEqual(injectRequiredHashtags([], ["lifehacks"]), ["#lifehacks"]);
  });

  it("ignores blank required-hashtag entries", () => {
    assert.deepEqual(injectRequiredHashtags(["#a"], ["  "]), ["#a"]);
  });
});

describe("injectRequiredParts — combines CTA + hashtag injection", () => {
  it("injects both the required CTA and required hashtags", () => {
    const copy: Copy = { caption: "Great morning tip", hashtags: ["#morning"] };
    const rules: BrandCopyRules = {
      requiredCta: "Link in bio!",
      requiredHashtags: ["#lifehacks"],
      bannedWords: [],
    };
    assert.deepEqual(injectRequiredParts(copy, rules), {
      caption: "Great morning tip Link in bio!",
      hashtags: ["#morning", "#lifehacks"],
    });
  });

  it("is a no-op when no rules are configured", () => {
    const copy: Copy = { caption: "Great morning tip", hashtags: ["#morning"] };
    const rules: BrandCopyRules = { requiredCta: null, requiredHashtags: [], bannedWords: [] };
    assert.deepEqual(injectRequiredParts(copy, rules), copy);
  });
});
