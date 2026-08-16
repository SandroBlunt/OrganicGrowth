/**
 * Manual, one-off SMOKE test against the LIVE `strawmotion-schedule-media` S3 bucket (issue #144
 * acceptance criterion 3; re-shaped for the private bucket + signed links, issue #198 acceptance
 * criterion 7). NEVER run by `npm test` — this is not a `*.test.ts` file and nothing else imports it.
 *
 * What it proves, for real, in order:
 *   1. `sips` converts a tiny fixture PNG to a JPG (the source PNG stays untouched).
 *   2. The AWS CLI uploads that JPG under a clearly-namespaced, unguessable
 *      `straw-motion/smoke-test/<random-token>/...` key.
 *   3. The returned SIGNED link is a DIRECT `.jpg` link (before its query string): HTTP 200,
 *      `Content-Type: image/jpeg`, no redirect (checked with `redirect: "manual"`).
 *   4. The SAME object's DIRECT, UNSIGNED URL (`directJpgUrl`) is REFUSED — proves the bucket is no
 *      longer public-read (issue #198 AC1).
 *   5. The AWS CLI deletes the object, and the signed link is confirmed gone afterward.
 *
 * Nothing is left behind in the bucket — the `finally` block always deletes the local temp dir, and
 * the delete step always deletes the uploaded object (even on an assertion failure, via the outer
 * try/finally). Credentials are never printed: this script only ever logs pass/fail lines and the
 * object's SIGNED url (itself short-lived and scoped to this one key), never an env value (see
 * `live/env.ts`, `live/redact.ts`).
 *
 * Run:   npx tsx src/media-host/live/smoke.ts
 * Requires: `sips` (macOS, built in) and the AWS CLI on PATH with credentials that can read/write
 * `strawmotion-schedule-media` (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`) — see
 * `docs/schedule-batch-s3-setup.md` for the Operator's one-time bucket setup and the exact IAM
 * permissions the running credentials need.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LiveMediaHost } from "./adapter.ts";
import { directJpgUrl } from "./s3.ts";
import { writeTinyPng } from "../fixtures/tiny-png.ts";
import { randomMediaKeyToken } from "../token.ts";

const BUCKET = "strawmotion-schedule-media";
const REGION = "us-east-1";

/** Generous enough for this script's own fetch checks, short-lived enough that nothing lingers
 *  fetchable for long even if the final delete step is somehow skipped (the object itself is still
 *  always deleted — this is defense in depth, not the only guard). */
const SMOKE_EXPIRES_IN_SECONDS = 5 * 60;

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-media-host-smoke-"));
  const pngPath = join(dir, "smoke.png");
  const jpgPath = join(dir, "smoke.jpg");
  const key = `straw-motion/smoke-test/${randomMediaKeyToken()}/${Date.now()}.jpg`;
  const host = new LiveMediaHost({ config: { bucket: BUCKET, region: REGION } });
  let uploaded = false;

  try {
    console.log(`[1/6] converting a tiny fixture PNG -> JPG via sips (${pngPath} -> ${jpgPath})`);
    await writeTinyPng(pngPath);
    await host.convertToJpg(pngPath, jpgPath);

    console.log(`[2/6] uploading to s3://${BUCKET}/${key} (signed link expires in ${SMOKE_EXPIRES_IN_SECONDS}s)`);
    const { url } = await host.upload(jpgPath, key, { expiresInSeconds: SMOKE_EXPIRES_IN_SECONDS });
    uploaded = true;
    console.log(`      signed url: ${url}`);
    if (!new URL(url).pathname.endsWith(".jpg")) throw new Error(`expected a .jpg path, got: ${url}`);

    console.log("[3/6] fetching the SIGNED url (expect 200, image/jpeg, no redirect)");
    const response = await fetch(url, { redirect: "manual" });
    console.log(`      status=${response.status} content-type=${response.headers.get("content-type")}`);
    if (response.status !== 200) throw new Error(`expected HTTP 200, got ${response.status}`);
    if (response.headers.get("content-type") !== "image/jpeg") {
      throw new Error(`expected Content-Type image/jpeg, got ${response.headers.get("content-type")}`);
    }

    const directUrl = directJpgUrl({ bucket: BUCKET, region: REGION }, key);
    console.log("[4/6] fetching the DIRECT, UNSIGNED url (expect it to be REFUSED — issue #198 AC1)");
    const directResponse = await fetch(directUrl, { redirect: "manual" });
    console.log(`      status=${directResponse.status}`);
    if (directResponse.status === 200) {
      throw new Error(
        `the bucket is still public-read — an unauthenticated request to ${directUrl} returned 200`,
      );
    }

    console.log("[5/6] deleting the object");
    await host.delete(key);
    uploaded = false;

    console.log("[6/6] confirming the signed url is gone");
    const after = await fetch(url, { redirect: "manual" });
    console.log(`      status=${after.status}`);
    if (after.status === 200) throw new Error("object is still fetchable after delete");

    console.log("SMOKE TEST PASSED");
  } finally {
    if (uploaded) {
      // Best-effort cleanup on a failure between upload and delete — never leave the bucket dirty.
      await host.delete(key).catch(() => {});
    }
    await rm(dir, { recursive: true, force: true });
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((error) => {
    console.error("SMOKE TEST FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
