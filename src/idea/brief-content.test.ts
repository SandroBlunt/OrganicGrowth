import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractAngle, extractTalkingPoints, parseBriefContent } from "./brief-content.ts";

// A realistic Brief, mirroring the real shape every straw-motion idea-NN.md carries (see this ticket's
// own handoff.md for the grep proving all 51 real Briefs have a Talking Points heading, either
// capitalization) — used across every test below so the module is proven against REAL Brief shape, not
// a synthetic shortcut.
const REALISTIC_BRIEF = `# ByteDance's Seedance 2.5 makes 3-minute videos, up from 15 seconds

## Angle
ByteDance's Seedance 2.5 generates video up to 3 minutes with synced audio and accepts 50+ references.
Its predecessor topped out at 15 seconds, and that version already drew cease-and-desist letters from
Hollywood studios.

## Hook concept
Open on the jump in scale against the legal backdrop.

## Talking points
- Seedance 2.5 generates video up to 3 minutes with synced audio, up from a 15-second predecessor
  (ByteDance's own announcement).
- It accepts 50+ references, including 3D models, which is how you hold the same character steady
  across shots (ByteDance).
- Hollywood studios sent cease-and-desist letters over the 15-second version.
- The un-hyped part: what you feed the reference slots decides whether the output is your work.

## Source(s)
- ByteDance Seed official: https://seed.bytedance.com/en/seedance2_5
- Ars Technica coverage: https://arstechnica.com/ai/2026/seedance-25

## Fit basis
momentum 0.80. brand_fit 0.92.
`;

describe("extractTalkingPoints — the ## Talking Points section's own bullets (issue #273 round 2)", () => {
  it("extracts every bullet, trimmed, in document order", () => {
    const points = extractTalkingPoints(REALISTIC_BRIEF);
    assert.equal(points.length, 4);
    assert.match(points[0]!, /Seedance 2\.5 generates video up to 3 minutes/);
    assert.match(points[2]!, /Hollywood studios sent cease-and-desist letters/);
  });

  it("folds a wrapped continuation line into the previous bullet", () => {
    const points = extractTalkingPoints(REALISTIC_BRIEF);
    // The first bullet wraps onto a second physical line ("(ByteDance's own announcement).") — must be
    // folded into ONE logical point, not split into two.
    assert.match(points[0]!, /ByteDance's own announcement\)\.$/);
  });

  it("recognizes BOTH heading capitalizations real Briefs use", () => {
    const upper = "## Talking Points\n- one point\n";
    const lower = "## Talking points\n- one point\n";
    assert.deepEqual(extractTalkingPoints(upper), ["one point"]);
    assert.deepEqual(extractTalkingPoints(lower), ["one point"]);
  });

  it("stops at the next heading — never bleeds into Source(s)", () => {
    const points = extractTalkingPoints(REALISTIC_BRIEF);
    assert.ok(points.every((p) => !p.includes("bytedance.com")), "must not capture Source(s) content");
  });

  it("returns [] when the Brief has no Talking Points section at all", () => {
    assert.deepEqual(extractTalkingPoints("# A bare headline\n\n## Source(s)\n- https://example.com/a\n"), []);
  });

  it("dedupes an accidental repeated bullet, keeping first-seen order", () => {
    const md = "## Talking Points\n- same point\n- a different point\n- same point\n";
    assert.deepEqual(extractTalkingPoints(md), ["same point", "a different point"]);
  });

  it("supports * bullets too, and drops blank bullet lines", () => {
    const md = "## Talking Points\n* first\n\n* second\n";
    assert.deepEqual(extractTalkingPoints(md), ["first", "second"]);
  });

  it("never throws on a malformed or empty string", () => {
    assert.doesNotThrow(() => extractTalkingPoints(""));
    assert.deepEqual(extractTalkingPoints(""), []);
  });
});

describe("extractAngle — the ## Angle section's own paragraph (issue #273 round 2)", () => {
  it("extracts and whitespace-collapses the Angle paragraph", () => {
    const angle = extractAngle(REALISTIC_BRIEF);
    assert.ok(angle !== undefined);
    assert.doesNotMatch(angle!, /\n/, "must be collapsed onto one line");
    assert.match(angle!, /ByteDance's Seedance 2\.5 generates video up to 3 minutes with synced audio/);
    assert.match(angle!, /cease-and-desist letters from\s+Hollywood studios\./);
  });

  it("returns undefined when the Brief has no Angle section", () => {
    assert.equal(extractAngle("# A bare headline\n\n## Source(s)\n- https://example.com/a\n"), undefined);
  });

  it("returns undefined for a present-but-blank Angle section", () => {
    assert.equal(extractAngle("## Angle\n\n## Hook concept\nSomething.\n"), undefined);
  });
});

describe("parseBriefContent — the combined angle/talkingPoints/sourceUrls extraction", () => {
  it("returns all three fields from a realistic Brief", () => {
    const parsed = parseBriefContent(REALISTIC_BRIEF);
    assert.ok(parsed.angle !== undefined);
    assert.equal(parsed.talkingPoints.length, 4);
    assert.deepEqual(parsed.sourceUrls, [
      "https://seed.bytedance.com/en/seedance2_5",
      "https://arstechnica.com/ai/2026/seedance-25",
    ]);
  });

  it("reuses extractSourceUrls unchanged — never re-implements URL extraction", () => {
    const parsed = parseBriefContent("## Source(s)\n- (No official source found for this one.)\n");
    assert.deepEqual(parsed.sourceUrls, []);
  });

  it("a minimal, title-only Brief yields no angle, empty talkingPoints/sourceUrls — never fabricated", () => {
    const parsed = parseBriefContent("# A brand new headline\n");
    assert.equal(parsed.angle, undefined);
    assert.deepEqual(parsed.talkingPoints, []);
    assert.deepEqual(parsed.sourceUrls, []);
  });
});
