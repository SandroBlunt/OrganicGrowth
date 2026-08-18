import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeActorRequestFailure } from "./smoke-diagnose.ts";
import { ApifyRequestError, ApifyTokenMissingError } from "./client.ts";

describe("describeActorRequestFailure — distinguishes 'the actor request itself failed' from 'no data' (issue #253)", () => {
  it("names the dead slug, status, and statusText for a 404 — the real, evidenced case from issue #253", () => {
    // apify/facebook-post-scraper (singular) is the REAL dead slug the #253 investigation found via
    // curl: it 404s. This is not a hypothetical — it is the exact slug that shipped, silently broken.
    const err = new ApifyRequestError(404, "Not Found");
    const message = describeActorRequestFailure(err, "apify/facebook-post-scraper");

    assert.ok(message !== null, "an ApifyRequestError must produce a diagnostic message, not null");
    assert.match(message!, /ACTOR REQUEST FAILED/);
    assert.match(message!, /404/);
    assert.match(message!, /Not Found/);
    assert.match(message!, /apify\/facebook-post-scraper/);
    assert.doesNotMatch(
      message!,
      /no data for this url/i,
      "an actor/request failure must NEVER read like the 'no data' message — that is exactly the #253 bug",
    );
  });

  it("converts the slug's slash to a tilde in the verification curl command", () => {
    const err = new ApifyRequestError(404, "Not Found");
    const message = describeActorRequestFailure(err, "apify/facebook-post-scraper");
    assert.match(message!, /apify~facebook-post-scraper/);
  });

  it("also fires for a non-404 rejection (e.g. a bad token, 401)", () => {
    const err = new ApifyRequestError(401, "Unauthorized");
    const message = describeActorRequestFailure(err, "apify/facebook-posts-scraper");
    assert.ok(message !== null);
    assert.match(message!, /401/);
    assert.match(message!, /Unauthorized/);
  });

  it("returns null for a non-ApifyRequestError — the caller falls back to generic handling", () => {
    assert.equal(describeActorRequestFailure(new ApifyTokenMissingError(), "apify/facebook-posts-scraper"), null);
    assert.equal(describeActorRequestFailure(new Error("boom"), "apify/facebook-posts-scraper"), null);
    assert.equal(describeActorRequestFailure("not even an Error", "apify/facebook-posts-scraper"), null);
  });
});
