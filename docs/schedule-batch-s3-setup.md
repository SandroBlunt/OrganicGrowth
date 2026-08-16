# Schedule Batch S3 setup (one-time, per Brand)

This is **infrastructure setup**, not code (issue #140's own decision — the bucket's lifecycle rule is
"a documented one-time setup step", never reimplemented as a command). It documents the S3 bucket a
**Schedule Batch** export (`/export-schedule`) hosts a Brand's JPGs on.

**Since issue #198, the bucket is PRIVATE, not public-read.** Zoho never fetches a permanent public URL
— `LiveMediaHost.upload` (`src/media-host/live/s3.ts`) uploads the object with `aws s3 cp` (inheriting
the bucket's own, now-private, default access — never an object ACL), then mints a short-lived, SIGNED
GET URL for it with `aws s3 presign ... --expires-in <seconds>` (`presignViaAwsCli`). That expiry is
derived from the Asset's own `scheduled_at`, never a fixed default — see
`src/schedule-batch/media-expiry.ts`'s `computeMediaExpiry` and its own module doc for the full
derivation and the "expiry can never race the cleanup routine's deletion" argument. Every hosted key
also now folds in a fresh, random, unguessable token (`src/media-host/token.ts`'s
`randomMediaKeyToken`) before the slide's own base name, so knowing the Brand, run, Idea number, and
slide name alone is never enough to construct a working key.

Nothing here is read by any TypeScript module — `src/media-host/live/s3.ts` only needs a
`bucket`/`region` pair supplied by the caller (today: a Brand's own config, or `smoke.ts`'s hardcoded
constants); the bucket itself, its access policy (or lack of one), and its expiry rule are created by
hand, once, outside this repo.

## Already live for straw-motion (private since issue #198)

Straw Motion's bucket has existed since the 2026-08-04 smoke test (issue #144's Build Report, issue
#140's spec "Further Notes"), and was migrated from public-read to private for issue #198 (see the
migration steps below):

- **Bucket name:** `strawmotion-schedule-media`
- **Region:** `us-east-1`
- **Block Public Access:** ON (the AWS default) — unchanged since issue #144.
- **Bucket policy:** **NONE.** The public `GetObject`-only policy issue #144 originally attached has
  been REMOVED (`aws s3api delete-bucket-policy`) — there is no principal `"*"` grant of any kind
  anywhere on this bucket anymore. Every object defaults to private; the ONLY way to read one is a
  signed, temporary `aws s3 presign` URL scoped to that one object, minted per-upload.
- **Lifecycle rule:** unchanged since issue #144 — a bucket lifecycle rule expiring (deleting) every
  object **30 days** after creation is still attached, as the backstop for a batch that is exported but
  never uploaded/cleaned up. The everyday path is `runScheduleCleanup`
  (`src/schedule-batch/cleanup-runner.ts`), which deletes an Asset's hosted media once its
  `scheduled_at` is more than 1 day past, automatically at the start of every `/export-schedule` and on
  demand via `/cleanup-schedule-media <brand>`. This 30-day rule only ever matters for a batch that was,
  for some reason, never cleaned up the normal way.

## Migrating an already-public bucket to private (the Operator's one-time issue #198 step)

For a bucket set up under issue #144's original (public-read) instructions — straw-motion's own bucket,
before this migration — an Operator with the AWS account runs these steps by hand, once:

1. **Remove the public bucket policy entirely:**
   `aws s3api delete-bucket-policy --bucket strawmotion-schedule-media`.
2. **Confirm Block Public Access is still fully ON** (it should already be, unchanged since issue #144):
   `aws s3api get-public-access-block --bucket strawmotion-schedule-media` — every one of
   `BlockPublicAcls`/`IgnorePublicAcls`/`BlockPublicPolicy`/`RestrictPublicBuckets` must read `true`.
3. **Confirm no bucket policy remains:**
   `aws s3api get-bucket-policy --bucket strawmotion-schedule-media` — a `NoSuchBucketPolicy` error IS
   the desired, successful outcome here (an empty response, or a policy still present, means step 1
   didn't take).
4. **Confirm the running AWS CLI credentials carry the three permissions `LiveMediaHost` needs on this
   bucket** — `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` (the same credentials `aws s3 cp`/`aws s3
   presign`/`aws s3 rm` already run under — `src/media-host/live/env.ts`'s default chain, or `.env`).
   `s3:GetObject` matters even though presigning itself never makes a network call: a presigned URL is
   only a locally-computed signature, and the resulting request still needs the SIGNING principal to
   actually hold `s3:GetObject` on that key — an under-permissioned credential mints a URL that returns
   `AccessDenied` when fetched. If a dedicated IAM user/role backs this bucket, attach a policy scoped to
   exactly those three actions on the bucket's own objects (never `s3:ListBucket`, never a wildcard):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ScheduleBatchMediaHostAccess",
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::strawmotion-schedule-media/*"
       }
     ]
   }
   ```

5. **Verify with the smoke script:** `npx tsx src/media-host/live/smoke.ts` (`npm run media-host-smoke`)
   — proves, once, for real: `sips` converts a fixture PNG to JPG, the AWS CLI uploads it under an
   unguessable, namespaced `straw-motion/smoke-test/<random-token>/...` key, the SIGNED URL `upload()`
   returns is fetchable (HTTP 200, `Content-Type: image/jpeg`, no redirect), the SAME object's DIRECT,
   UNSIGNED URL is REFUSED (proving the bucket is genuinely private — issue #198 AC1), and the AWS CLI
   deletes the object again — nothing left behind in the bucket. Never run automatically by `npm test`
   (it mutates a live bucket); run it by hand once per bucket, and post the result on the issue whose
   acceptance criteria call for it.

## Setting up a NEW Brand's bucket (e.g. MundoTip, later)

These are the one-time steps an Operator (or whoever holds the AWS account) performs by hand, mirroring
straw-motion's own private bucket exactly — never automated by this repo:

1. **Create the bucket** (e.g. `aws s3api create-bucket --bucket <brand>-schedule-media --region
   us-east-1`), in the same region the Brand's Zoho config will name.
2. **Leave Block Public Access ON.** Do not disable it and do not rely on object ACLs.
3. **Attach NO bucket policy at all.** Since issue #198 this bucket is private by default — there is no
   public-read grant to attach, unlike issue #144's original instructions.
4. **Attach a lifecycle rule expiring every object after 30 days** — the same backstop straw-motion's
   bucket already carries. This is what makes an abandoned batch's media expire on its own even if the
   Operator never runs cleanup.
5. **Grant the running AWS CLI credentials `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on this
   bucket's objects** — see the migration section's step 4 above for the exact IAM policy shape (swap in
   the new bucket's ARN).
6. **Verify with the smoke script** — see the migration section's step 5 above (point it at the new
   bucket by editing its `BUCKET`/`REGION` constants, or extending it to take arguments).
7. **Point the Brand's Zoho config at the bucket's region** (and configure its Zoho Social Brand
   groupings/channel labels/clock — `src/production-spec/brand-profile.ts`'s `loadZohoConfig`, issue
   #143) so `/export-schedule` can host that Brand's media there.

## Signed link expiry — the chosen lifetime, and what happens if it expires before Zoho fetches

`computeMediaExpiry` (`src/schedule-batch/media-expiry.ts`) targets `scheduled_at +
EXPIRY_BUFFER_AFTER_SCHEDULED_MS` (1 hour) — comfortably past the moment Zoho is expected to actually
fetch the media (PRD #140's own "assume posting time" note), without leaving the link valid for long
after ("access ends when the schedule does" — the issue's own framing). That 1-hour buffer is
deliberately well under the 24-hour grace window `runScheduleCleanup` waits before it will even consider
deleting the underlying object (`CLEANUP_AFTER_MS`, `src/schedule-batch/cleanup.ts`) — so a link is
ALWAYS already expired for many hours before cleanup could become eligible to delete the object it
points at. Expiry and deletion can never race into a state where Zoho holds a link that still reads as
valid against an object that is already gone.

AWS's own SigV4 presign ceiling (`MAX_PRESIGN_SECONDS`, `src/media-host/aws-presign-limit.ts` — 604,800
seconds, 7 days) is a hard limit no code here can lift: a single presigned URL can never stay valid
longer than 7 days from the moment it is minted, full stop, regardless of credential type. For a
schedule sitting within that window from export time (every Format built so far), the 1-hour-past-
scheduled-time target above is reached exactly. For a batch whose last Asset is scheduled MORE than
roughly 7 days past its own export/upload time, the returned expiry is CAPPED at that 7-day ceiling
instead — `computeMediaExpiry`'s own `cappedByAwsLimit` flag reports this — and the resulting link
expires BEFORE that Asset's own scheduled time. If Zoho then tries to fetch the media after that point,
the fetch fails (an expired-signature error, not a "file not found" — the object itself is still
present, only the one link pointing at it has gone stale). This is a genuine, documented limitation:
today's mitigation is exporting (or re-hosting) closer to the event so no Asset in a batch sits more
than ~7 days out at upload time; a future slice could add re-presigning closer to post time if a batch
that long-tailed ever becomes routine.

## Credentials

`LiveMediaHost` never hardcodes or prints an AWS credential — the AWS CLI resolves credentials from its
own default chain (`~/.aws`, or `.env`-supplied keys read defensively via `src/media-host/live/env.ts`,
never logged — see `src/media-host/live/redact.ts`). No AWS key lives in this repo or in `data/`.
