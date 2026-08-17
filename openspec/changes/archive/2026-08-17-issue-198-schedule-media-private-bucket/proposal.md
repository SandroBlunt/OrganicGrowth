## Why

Media uploaded for Zoho scheduling is public-read under fully guessable keys — public Brand slug, ISO
week, sequential Idea number, fixed slide-name vocabulary
(`straw-motion/2026-W32/idea-01/0-hook.jpg`). Listing is already blocked (issue #144's bucket policy
grants ONLY `s3:GetObject`, never `s3:ListBucket`), but with keys this predictable, listing was never
the real gap: an unauthenticated request to a KNOWN or GUESSED key is served directly, with no signature
and no expiry, for the object's entire lifetime on the bucket — export time through a day after the
scheduled time (`CLEANUP_AFTER_MS`, `src/schedule-batch/cleanup.ts`). Every unpublished Idea's title,
angle, and imagery is readable, for its whole lead time, by anyone who can guess a URL.

## What Changes

- **The bucket is no longer public-read.** `docs/schedule-batch-s3-setup.md` documents removing the
  public `GetObject`-only bucket policy issue #144 originally attached (`aws s3api
  delete-bucket-policy`), keeping Block Public Access ON (unchanged), and granting the running AWS CLI
  credentials `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject` on the bucket's own objects instead — the
  narrowest permission set `LiveMediaHost` actually needs. This is infrastructure setup, not code (the
  same posture issue #140/#148 already established for the bucket's lifecycle rule) — the Operator runs
  it by hand, once, per bucket.
- **Every hosted key gains an unguessable component.** `src/media-host/token.ts`'s
  `randomMediaKeyToken` mints a fresh, 128-bit-entropy, base64url token per slide; `scheduleMediaKey`
  (`src/schedule-batch/media-key.ts`) now REQUIRES that token as an explicit argument and folds it into
  the key layout: `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg`. Knowing the Brand,
  week, Idea number, and slide name is no longer enough to construct a working key.
- **`MediaHostPort.upload` returns a SIGNED, EXPIRING link, never a permanent public one.**
  `LiveMediaHost.upload` (`src/media-host/live/s3.ts`) now uploads via `aws s3 cp` (unchanged — still no
  object ACL, the object simply inherits the bucket's own, now-private, default access) and then mints a
  short-lived GET URL via `aws s3 presign ... --expires-in <seconds>` (`presignViaAwsCli`). `upload` gains
  a REQUIRED `options.expiresInSeconds` — no silent default, mirroring every other explicit,
  no-silent-default seam in this codebase.
- **The expiry is derived from the Asset's own scheduled time, not invented.**
  `src/schedule-batch/media-expiry.ts`'s new `computeMediaExpiry(scheduledAt, uploadedAt)` targets
  `scheduledAt + EXPIRY_BUFFER_AFTER_SCHEDULED_MS` (1 hour) — comfortably past the moment Zoho is
  expected to actually fetch the media (PRD #140's own "assume posting time" note) — capped at AWS's own
  SigV4 presign ceiling (`MAX_PRESIGN_SECONDS`, `src/media-host/aws-presign-limit.ts`, 604,800 seconds /
  7 days; `cappedByAwsLimit` reports when the cap bites). The 1-hour buffer is deliberately well UNDER
  `CLEANUP_AFTER_MS` (24 hours, `src/schedule-batch/cleanup.ts`) — proven by a dedicated regression test
  — so a signed link is ALWAYS already expired for many hours before the cleanup routine
  (`runScheduleCleanup`) could even become eligible to delete the object it points at. Expiry and
  deletion can never race into a state where Zoho holds a link that still reads as "valid" against an
  object that has already been deleted.
- **Both orchestration shells wire the token + derived expiry through**, per Asset, per slide:
  `src/commands/export-schedule.ts` (the CSV/S3 fallback path) and
  `src/commands/schedule-via-zoho-mcp.ts` (the MCP-primary path, ADR-0020) — the SAME `scheduled_at`
  each already derives for its own manifest/ledger stamp is what `computeMediaExpiry` consumes; no new
  clock read, no new source of truth.
- **The existing cleanup routine is untouched and still correct.** `runScheduleCleanup`
  (`src/schedule-batch/cleanup-runner.ts`) deletes by the exact keys recorded in each manifest — it
  never reconstructs a key from its components, so the added token segment requires no cleanup-side
  change at all; every existing cleanup test still passes unmodified.
- **The whole change sits behind `MediaHostPort`.** `FakeMediaHost` (the ONLY Media Host any test ever
  drives) is updated to require and record `expiresInSeconds`, validating it the SAME way the live
  adapter does (`assertValidExpiresInSeconds`) — so a test that passes an invalid expiry fails exactly
  like production would. No caller's overall step structure changes — the two orchestration shells'
  hosting step still does "convertToJpg then upload, per slide"; it now additionally computes a token
  and a derived expiry inline before that same call, per the port's new, more explicit contract.
- **Documentation is re-shaped, not just described.** `docs/schedule-batch-s3-setup.md` documents the
  exact one-time migration steps for straw-motion's already-live bucket (remove the public policy,
  confirm Block Public Access, confirm no policy remains, grant the three needed IAM actions, verify
  with the re-shaped smoke script) and the "what happens when a link expires before Zoho fetches"
  question the issue calls for explicitly. `src/media-host/live/smoke.ts` now ALSO proves the bucket
  genuinely refuses an unauthenticated direct request (issue #198 AC1) in addition to the signed link
  working end to end.

## Non-Goals (explicitly out of scope for this slice)

- **Actually running the live migration or the live smoke script against the real AWS bucket.** No
  live AWS call is made by this build or by `npm test` (hard constraint) — the migration and the smoke
  run are the Operator's own, by hand, against the real `strawmotion-schedule-media` bucket, documented
  step by step in `docs/schedule-batch-s3-setup.md` and this change's `handoff.md`.
- **Re-presigning a link closer to post time for a batch whose tail sits beyond the 7-day AWS ceiling.**
  A genuine, documented limitation (`cappedByAwsLimit`) — today's mitigation is exporting/re-hosting
  closer to the event; a future slice could add re-presigning if a batch that long-tailed becomes
  routine.
- **Changing what the cleanup routine deletes or when.** `CLEANUP_AFTER_MS`/`isDueForCleanup`/
  `planManifestCleanup`/`runScheduleCleanup` are all untouched — this slice only makes sure a link's
  expiry can never outlive the object's own guaranteed lifetime.
- **MundoTip's own bucket.** Its one-time setup (whenever it happens) follows this same doc's
  now-private instructions from the start — no separate migration needed for a Brand that never had a
  public bucket policy.

## Capabilities

### Modified Capabilities

- `media-host`: `MediaHostPort.upload` gains a required `UploadOptions.expiresInSeconds`; the live
  adapter uploads privately then presigns; the fake validates/records the same option; a new
  `directJpgUrl` (renamed from `publicJpgUrl`) exists only to prove the bucket refuses an unsigned
  request; a new `assertValidExpiresInSeconds`/`MAX_PRESIGN_SECONDS` guard AWS's own ceiling; a new
  `randomMediaKeyToken` mints the unguessable key component.
- `docs-conformance`: the one-time S3 setup Requirement is re-shaped from "documents a public
  GetObject-only policy" to "documents a private bucket, its IAM permissions, the signed-link
  mechanism, the AWS 7-day ceiling, and the migration steps for an already-public bucket."

### Added Capabilities

- `schedule-batch-media-expiry`: `computeMediaExpiry` (the pure expiry derivation, its AWS-ceiling
  capping behavior, and its proven no-race relationship with `CLEANUP_AFTER_MS`), `scheduleMediaKey`'s
  now-required unguessable token, and both orchestration shells' wiring of token + derived expiry into
  every hosted slide.

## Impact

- **New code:** `src/media-host/token.ts` (+`.test.ts`), `src/media-host/aws-presign-limit.ts`
  (+`.test.ts`), `src/schedule-batch/media-expiry.ts` (+`.test.ts`).
- **Modified code:** `src/media-host/port.ts`, `src/media-host/fixtures/fake-media-host.ts`
  (+`.test.ts`), `src/media-host/live/adapter.ts` (+`.test.ts`), `src/media-host/live/s3.ts`
  (+`.test.ts`), `src/media-host/live/smoke.ts`, `src/schedule-batch/media-key.ts` (+`.test.ts`),
  `src/commands/export-schedule.ts` (+`.test.ts`), `src/commands/schedule-via-zoho-mcp.ts`
  (+`.test.ts`), `docs/schedule-batch-s3-setup.md`, `.claude/commands/export-schedule.md`,
  `src/schedule-batch/approval-gate.docs-test.ts`.
- **Hermetic, no live AWS call anywhere.** Every test drives `FakeMediaHost` or a stubbed
  `CommandRunner`; the one exception (`sips.test.ts`'s single real-`sips` call) is unchanged and
  pre-existing. `live/smoke.ts` remains a manual, non-`npm test` script.
- **Always-rules upheld:** generate-never-publish/public-metrics-only/relative-not-absolute/explicit-
  attribution are untouched (this slice touches no content-generation, metrics, scoring, or attribution
  code); ledger-as-source-of-truth is upheld by construction — this slice never writes a ledger field
  that didn't already exist (`scheduled_at`/`zoho_schedule_reference` are unchanged, issue #145/#161).
