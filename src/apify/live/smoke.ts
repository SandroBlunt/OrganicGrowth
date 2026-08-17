/**
 * Manual, one-off SMOKE test for the live Apify client (issue #200), mirroring
 * `src/media-host/live/smoke.ts`'s shape: NEVER run by `npm test` or `npm run test:docs` — this is not
 * a `*.test.ts` file and nothing else imports it.
 *
 * WHY THIS EXISTS: `mapFacebookItem` (`src/apify/normalize-metrics.ts`) is tested only against a
 * SYNTHETIC fixture built from Apify's documented schema — unlike Instagram/YouTube (issue #48), its
 * field mapping has never been checked against a real scrape. Straw Motion's Channel (the ONLY Brand
 * with posted Assets today) is Facebook, so this is the one platform mapping that actually matters and
 * was never verified. This script makes exactly ONE real Apify call — against ONE post URL you give it
 * — and prints the RAW dataset item next to what `mapFacebookItem` makes of it, so you can eyeball
 * whether the field names line up before trusting a full batch run.
 *
 * This is a REAL network call and spends a REAL Apify credit when you run it — the `developer` build
 * agent never runs this itself (CLAUDE.md: hermetic build, no live calls, no credits). Run it yourself,
 * by hand, as the Operator.
 *
 * Run:   npx tsx src/apify/live/smoke.ts <facebook-post-url>
 *   e.g. npx tsx src/apify/live/smoke.ts \
 *          "https://www.facebook.com/permalink.php?story_fbid=pfbid0VMYBWhDbQHhQfyckAVFPwutpKJEM38fNySUqpNFXU4WZbWnENWHMjfdw1wACunR6l&id=61591885769033"
 * Requires: `APIFY_API_TOKEN` in `.env` (copy `.env.example`) or already exported in the shell.
 *
 * What to do with the result — see the printed "NEXT STEPS" block, and the Build Report's runbook
 * (`openspec/changes/issue-200-apify-client-scores-baselines/handoff.md`).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LiveApifyClient } from "./client.ts";
import { mapFacebookItem } from "../normalize-metrics.ts";

async function main(): Promise<void> {
  const postUrl = process.argv[2];
  if (postUrl === undefined) {
    console.error("usage: npx tsx src/apify/live/smoke.ts <facebook-post-url>");
    process.exitCode = 1;
    return;
  }

  console.log(`[1/3] scraping ${postUrl} via apify/facebook-post-scraper (ONE real Apify credit)`);
  const client = new LiveApifyClient();
  const raw = await client.scrapePost(postUrl, "facebook", "apify/facebook-post-scraper");

  if (raw === null) {
    console.log("Apify returned NO data for this URL — nothing to verify. Check the post is still");
    console.log("public and the URL is correct, then try again.");
    return;
  }

  console.log("[2/3] RAW dataset item (verify field names against this before trusting the mapping):");
  console.log(JSON.stringify(raw, null, 2));

  const normalized = mapFacebookItem(raw);
  console.log("[3/3] what mapFacebookItem makes of it:");
  console.log(JSON.stringify(normalized, null, 2));

  console.log("");
  console.log("NEXT STEPS:");
  console.log("  1. Compare the RAW item's field names above against mapFacebookItem's assumptions");
  console.log("     (likes/comments/shares/viewsCount/time — src/apify/normalize-metrics.ts). If any");
  console.log("     of `normalized.notes` above flags a defaulted-to-0 field that the RAW item clearly");
  console.log("     DOES carry under a different name, that is a real mapping bug — fix");
  console.log("     mapFacebookItem before running a full batch, then re-run this script to confirm.");
  console.log("  2. If the mapping is correct as-is, post this RAW/normalized pair as a comment on");
  console.log("     issue #200 — that IS the required Facebook-mapping verification.");
  console.log("  3. Then run the full batch for real: npm run track-performance straw-motion");
  console.log("  4. Then: npm run report straw-motion — quote one Idea's Fit Score next to its");
  console.log("     Performance Score (the required prediction/outcome pair) as a comment on issue #200.");
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((error) => {
    console.error("SMOKE TEST FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
