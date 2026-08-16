## 1. AWS's own presign ceiling — pure guard (test-first)

- [x] 1.1 Write failing tests (`aws-presign-limit.test.ts`) for `assertValidExpiresInSeconds`: accepts 1
  and exactly `MAX_PRESIGN_SECONDS`; rejects 0, a negative value, a non-integer, and one second over the
  ceiling (naming `604800` in the error).
- [x] 1.2 Implement `src/media-host/aws-presign-limit.ts` (`MAX_PRESIGN_SECONDS`,
  `assertValidExpiresInSeconds`) — pure, no I/O.

## 2. The unguessable key token (test-first)

- [x] 2.1 Write failing tests (`token.test.ts`) for `randomMediaKeyToken`: non-empty, URL/S3-key-safe
  (base64url charset only); a consistent 22-char length; two calls differ; never contains `/` or `+`.
- [x] 2.2 Implement `src/media-host/token.ts` — reads system randomness (the one impure step on this
  path), never called from a pure deep module.

## 3. Media link expiry derivation — pure deep module (test-first)

- [x] 3.1 Write failing tests (`media-expiry.test.ts`) for `computeMediaExpiry`: targets
  `scheduledAt + EXPIRY_BUFFER_AFTER_SCHEDULED_MS`; pure (same inputs, same output); caps at
  `MAX_PRESIGN_SECONDS` when the schedule sits further out (`cappedByAwsLimit: true`, expiry BEFORE the
  Asset's own scheduled time); is NOT capped exactly at the 7-day boundary; throws on an unparseable
  `scheduledAt`/`uploadedAt`; returns a round-tripping ISO-8601 `expiresAt`; a dedicated regression test
  proving `EXPIRY_BUFFER_AFTER_SCHEDULED_MS < CLEANUP_AFTER_MS` (imported from `cleanup.ts`, never
  duplicated) and that a link minted for a due-for-cleanup entry is always already expired by the
  earliest instant cleanup could touch it.
- [x] 3.2 Implement `src/schedule-batch/media-expiry.ts` — pure, no clock read, no randomness; imports
  `MAX_PRESIGN_SECONDS` from `media-host/aws-presign-limit.ts` (one source of truth, never duplicated).

## 4. scheduleMediaKey requires the unguessable token (test-first)

- [x] 4.1 Update failing tests (`media-key.test.ts`): the gold-fixture key now includes a token
  segment; a different token yields a different key for the SAME Brand/run/Idea/slide-name (AC2); an
  empty token is rejected before any key is built.
- [x] 4.2 Update `src/schedule-batch/media-key.ts`'s `scheduleMediaKey` to require `token` and fold it
  into the key layout: `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg`.

## 5. MediaHostPort — required expiresInSeconds (test-first)

- [x] 5.1 Update `src/media-host/port.ts`: `UploadOptions.expiresInSeconds` (required), `upload` gains a
  third, required parameter. Update the module doc: uploads return a signed, expiring link; the port
  does not judge key guessability.
- [x] 5.2 Update failing tests (`fake-media-host.test.ts`): every `upload` call now passes
  `{ expiresInSeconds }`; a new test proves the fake validates the SAME range the live adapter does
  (`assertValidExpiresInSeconds`) and records the exact value on `uploadCalls`.
- [x] 5.3 Update `src/media-host/fixtures/fake-media-host.ts` to require, validate, and record
  `expiresInSeconds`.

## 6. Live adapter — private upload + presign, never a public URL (test-first)

- [x] 6.1 Update failing tests (`s3.test.ts`): `uploadViaAwsCli` now invokes `aws s3 cp` THEN
  `aws s3 presign ... --expires-in <seconds>`, in that order, returning the presign call's trimmed
  stdout as the URL; a new `presignViaAwsCli` is tested directly (exact argv, rejects a bad key/expiry
  without invoking the runner, throws a clear error on empty stdout); `directJpgUrl` (renamed from
  `publicJpgUrl`) is tested as the UNSIGNED URL builder, used only to prove refusal; every credential-
  redaction test still passes.
- [x] 6.2 Implement the re-shaped `src/media-host/live/s3.ts`: `uploadViaAwsCli` takes
  `expiresInSeconds`, validates it and the key BEFORE any command runs, `cp` then `presign`;
  `presignViaAwsCli` is a new exported function; `directJpgUrl` replaces `publicJpgUrl`.
- [x] 6.3 Update failing tests (`adapter.test.ts`): `LiveMediaHost.upload` now requires
  `{ expiresInSeconds }` and results in TWO runner calls (`cp` then `presign`), both sharing the SAME
  resolved env.
- [x] 6.4 Update `src/media-host/live/adapter.ts`'s `upload` to pass `options.expiresInSeconds` through.

## 7. The smoke script proves the bucket is genuinely private (issue #198 AC1/AC7)

- [x] 7.1 Update `src/media-host/live/smoke.ts`: mint an unguessable, namespaced smoke key
  (`randomMediaKeyToken`); upload with a short, generous expiry; fetch the SIGNED url (expect 200,
  `image/jpeg`, no redirect); fetch the SAME object's DIRECT, UNSIGNED url via `directJpgUrl` and expect
  it REFUSED (never 200) — the concrete proof of AC1; delete; confirm the signed url is gone afterward.
  Never run by `npm test` (unchanged posture).

## 8. Both orchestration shells wire the token + derived expiry through (test-first)

- [x] 8.1 Write new failing tests in `export-schedule.test.ts`'s happy-path case: every hosted key
  matches the new token-bearing shape and differs from the pre-#198 deterministic shape; two sibling
  slides of the same Asset get two DIFFERENT tokens; every slide of the SAME Asset shares the SAME
  `expiresInSeconds`, equal to `computeMediaExpiry(asset.scheduled_at, NOW).expiresInSeconds`.
- [x] 8.2 Update `src/commands/export-schedule.ts`: mint a fresh `randomMediaKeyToken()` per slide,
  compute `computeMediaExpiry(scheduledAtIso, now)` per Asset (from the SAME `slots[i]` the manifest/
  ledger stamp already uses), pass both into `scheduleMediaKey`/`mediaHost.upload`.
- [x] 8.3 Write the matching new failing tests in `schedule-via-zoho-mcp.test.ts`'s happy-path case
  (same three assertions, keyed off `planned.scheduledAtUtc`).
- [x] 8.4 Update `src/commands/schedule-via-zoho-mcp.ts` the same way.
- [x] 8.5 Confirm (no code change needed — proven by the ALREADY-GREEN, untouched
  `cleanup-runner.test.ts`/`cleanup.test.ts`) that the existing cleanup routine still deletes hosted
  media by the exact keys recorded in each manifest, regardless of the new token segment (AC5).

## 9. Documentation — the private-bucket setup, the migration steps, and the expiry answer

- [x] 9.1 Rewrite `docs/schedule-batch-s3-setup.md`: bucket is private (no bucket policy, Block Public
  Access stays ON); the concrete IAM permissions the running credentials need
  (`GetObject`/`PutObject`/`DeleteObject`, never `ListBucket` or a wildcard); the exact migration steps
  for straw-motion's already-live bucket (`aws s3api delete-bucket-policy`, `get-public-access-block`,
  confirm `NoSuchBucketPolicy`); the NEW-Brand setup steps re-shaped the same way; a dedicated section
  naming the chosen expiry lifetime, why, and what happens when a link expires before Zoho fetches
  (`cappedByAwsLimit`, "the fetch fails").
- [x] 9.2 Update `.claude/commands/export-schedule.md`'s two "public S3 URLs"/"public URLs" mentions to
  describe signed, expiring links instead.
- [x] 9.3 Update `src/schedule-batch/approval-gate.docs-test.ts`'s S3-setup `describe` block to pin the
  new doc's real content (private-bucket statement, the real function/module names, the exact IAM
  actions with no `ListBucket`/wildcard, the AWS ceiling + `cappedByAwsLimit`, the migration commands) —
  registry-pinned, never free prose.

## 10. OpenSpec + full-suite green + self-review + Build Report

- [x] 10.1 Author spec deltas: `specs/media-host` (MODIFIED), `specs/schedule-batch-media-expiry`
  (ADDED), `specs/docs-conformance` (MODIFIED); run `openspec validate --strict` until green.
- [x] 10.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs` — all green, more
  tests than the stated baselines (2411/598 and 259/66).
- [x] 10.3 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #198
  acceptance criterion maps to a specific test (or is explicitly named as an Operator-only action for
  AC7).
- [x] 10.4 Write the Build Report into `handoff.md`, including the exact manual migration/verification
  steps the Operator must run against the real bucket.
