/**
 * Manual, one-off SMOKE test against the LIVE `strawmotion-schedule-media` S3 bucket (issue #144
 * acceptance criterion 3). NEVER run by `npm test` — this is not a `*.test.ts` file and nothing else
 * imports it.
 *
 * What it proves, for real, in order:
 *   1. `sips` converts a tiny fixture PNG to a JPG (the source PNG stays untouched).
 *   2. The AWS CLI uploads that JPG under a clearly-namespaced `straw-motion/smoke-test/...` key, and
 *      the returned URL is a public, DIRECT `.jpg` link: HTTP 200, `Content-Type: image/jpeg`, no
 *      redirect (checked with `redirect: "manual"`).
 *   3. The AWS CLI deletes that object, and the URL is confirmed gone afterward.
 *
 * Nothing is left behind in the bucket — the `finally` block always deletes the local temp dir, and
 * step 3 always deletes the uploaded object (even on an assertion failure, via the outer try/finally).
 * Credentials are never printed: this script only ever logs pass/fail lines and the object's PUBLIC
 * url, never an env value (see `live/env.ts`, `live/redact.ts`).
 *
 * Run:   npx tsx src/media-host/live/smoke.ts
 * Requires: `sips` (macOS, built in) and the AWS CLI on PATH with credentials that can read/write
 * `strawmotion-schedule-media` — ambient `~/.aws` credentials work with no `.env` AWS keys at all (see
 * the issue #144 Build Report for the actual run's result).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LiveMediaHost } from "./adapter.ts";
import { writeTinyPng } from "../fixtures/tiny-png.ts";

const BUCKET = "strawmotion-schedule-media";
const REGION = "us-east-1";

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "og-media-host-smoke-"));
  const pngPath = join(dir, "smoke.png");
  const jpgPath = join(dir, "smoke.jpg");
  const key = `straw-motion/smoke-test/${Date.now()}.jpg`;
  const host = new LiveMediaHost({ config: { bucket: BUCKET, region: REGION } });
  let uploaded = false;

  try {
    console.log(`[1/5] converting a tiny fixture PNG -> JPG via sips (${pngPath} -> ${jpgPath})`);
    await writeTinyPng(pngPath);
    await host.convertToJpg(pngPath, jpgPath);

    console.log(`[2/5] uploading to s3://${BUCKET}/${key}`);
    const { url } = await host.upload(jpgPath, key);
    uploaded = true;
    console.log(`      public url: ${url}`);
    if (!url.endsWith(".jpg")) throw new Error(`expected a .jpg url, got: ${url}`);

    console.log("[3/5] fetching the public url (expect 200, image/jpeg, no redirect)");
    const response = await fetch(url, { redirect: "manual" });
    console.log(`      status=${response.status} content-type=${response.headers.get("content-type")}`);
    if (response.status !== 200) throw new Error(`expected HTTP 200, got ${response.status}`);
    if (response.headers.get("content-type") !== "image/jpeg") {
      throw new Error(`expected Content-Type image/jpeg, got ${response.headers.get("content-type")}`);
    }

    console.log("[4/5] deleting the object");
    await host.delete(key);
    uploaded = false;

    console.log("[5/5] confirming the object is gone");
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
