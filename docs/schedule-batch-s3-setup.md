# Schedule Batch S3 setup (one-time, per Brand)

This is **infrastructure setup**, not code (issue #140's own decision — the bucket's lifecycle rule is
"a documented one-time setup step", never reimplemented as a command). It documents the S3 bucket a
**Schedule Batch** export (`/export-schedule`) hosts a Brand's JPGs on, so Zoho Social can fetch them by
public direct link. Nothing here is read by any TypeScript module — `src/media-host/live/s3.ts` only
needs a `bucket`/`region` pair supplied by the caller (today: a Brand's own config, or `smoke.ts`'s
hardcoded constants); the bucket itself, its public-read policy, and its expiry rule are created by hand,
once, outside this repo.

## Already live for straw-motion

Straw Motion's bucket has existed and been live-verified since the 2026-08-04 smoke test (issue #144's
Build Report, issue #140's spec "Further Notes"):

- **Bucket name:** `strawmotion-schedule-media`
- **Region:** `us-east-1`
- **Block Public Access:** left ON (the AWS default) — the bucket does **not** rely on object ACLs or a
  public bucket toggle for its public reads.
- **Bucket policy:** a public **`GetObject`**-only policy, scoped to the bucket's own objects, is
  attached instead. Every upload (`LiveMediaHost.upload`, `src/media-host/live/s3.ts`) inherits public
  read from this bucket policy alone — it never passes `--acl` on `aws s3 cp` (confirmed by a dedicated
  test asserting no upload argument contains the word "acl").
- **Lifecycle rule:** a bucket lifecycle rule expiring (deleting) every object **30 days** after
  creation is already attached — the backstop for a batch that is exported but never uploaded/cleaned
  up. The everyday path is `runScheduleCleanup` (`src/schedule-batch/cleanup-runner.ts`), which deletes
  an Asset's hosted media once its `scheduled_at` is more than 1 day past, automatically at the start of
  every `/export-schedule` and on demand via `/cleanup-schedule-media <brand>`. This 30-day rule only
  ever matters for a batch that was, for some reason, never cleaned up the normal way.

## Setting up a new Brand's bucket (e.g. MundoTip, later)

These are the one-time steps an Operator (or whoever holds the AWS account) performs by hand, mirroring
straw-motion's already-live bucket exactly — never automated by this repo:

1. **Create the bucket** (e.g. `aws s3api create-bucket --bucket <brand>-schedule-media --region
   us-east-1`), in the same region the Brand's Zoho config will name.
2. **Leave Block Public Access ON.** Do not disable it and do not rely on object ACLs.
3. **Attach a bucket policy granting ONLY public `GetObject`** on the bucket's objects, e.g.:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::<brand>-schedule-media/*"
       }
     ]
   }
   ```

   This is deliberately the narrowest possible grant: read-only, objects only (never `ListBucket`,
   never write/delete for the public principal).

4. **Attach a lifecycle rule expiring every object after 30 days** — the same backstop straw-motion's
   bucket already carries. This is what makes an abandoned batch's media expire on its own even if the
   Operator never runs cleanup.
5. **Verify with the smoke script.** `npx tsx src/media-host/live/smoke.ts` (pointed at the new bucket —
   edit its `BUCKET`/`REGION` constants, or extend it to take arguments) proves, once, for real: `sips`
   converts a fixture PNG to JPG, the AWS CLI uploads it and the returned URL is a public, direct,
   redirect-free `.jpg` link (HTTP 200, `Content-Type: image/jpeg`), and the AWS CLI deletes it again —
   nothing left behind in the bucket. Never run automatically by `npm test` (it mutates a live bucket);
   run it by hand once per new bucket.
6. **Point the Brand's Zoho config at the bucket's region** (and configure its Zoho Social Brand
   groupings/channel labels/clock — `src/production-spec/brand-profile.ts`'s `loadZohoConfig`, issue
   #143) so `/export-schedule` can host that Brand's media there.

## Credentials

`LiveMediaHost` never hardcodes or prints an AWS credential — the AWS CLI resolves credentials from its
own default chain (`~/.aws`, or `.env`-supplied keys read defensively via `src/media-host/live/env.ts`,
never logged — see `src/media-host/live/redact.ts`). No AWS key lives in this repo or in `data/`.
