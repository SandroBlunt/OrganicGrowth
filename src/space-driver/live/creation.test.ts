import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseCreationBlock } from "./creation.ts";

const CAPTURES_DIR = fileURLToPath(new URL("../fixtures/live-captures/", import.meta.url));

function readCapture(filename: string): string {
  return readFileSync(`${CAPTURES_DIR}${filename}`, "utf8");
}

describe("parseCreationBlock — real creations_get captures", () => {
  it("parses the real image creation (07): identifier + url, no kind", () => {
    const parsed = parseCreationBlock(readCapture("07-creations_get.image.txt"));
    assert.ok(parsed);
    assert.equal(parsed!.identifier, "9RwKMfINYZ");
    assert.equal(
      parsed!.url,
      "https://pikaso.cdnpk.net/private/production/4843244738/render.png?token=REDACTED",
    );
    assert.equal(parsed!.kind, undefined);
  });

  it("parses the real video creation (08): identifier + url + kind, ignoring the nested metadata block", () => {
    const parsed = parseCreationBlock(readCapture("08-creations_get.video.txt"));
    assert.ok(parsed);
    assert.equal(parsed!.identifier, "IaAOyRntvE");
    assert.equal(
      parsed!.url,
      "https://pikaso.cdnpk.net/private/production/4522929259/9ad7737c-ca82-4dae-a5af-acf6cc9f494b-0.mp4?token=REDACTED",
    );
    assert.equal(parsed!.kind, "video");
  });

  it("returns null when identifier or url is missing", () => {
    assert.equal(parseCreationBlock("identifier: only-id\n"), null);
    assert.equal(parseCreationBlock("url: \"https://example.com\"\n"), null);
    assert.equal(parseCreationBlock(""), null);
  });
});
