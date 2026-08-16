# Slice Handoff — issue #198: schedule media locked down (private bucket, signed expiring links)

## Build Report (developer)

### What changed

The Schedule Batch export's hosted media (Zoho's own source of the JPGs it bulk-uploads/schedules) is
no longer public-read under fully-guessable keys. Three things changed together, all behind
`MediaHostPort`:

1. **Unguessable keys.** `src/media-host/token.ts`'s `randomMediaKeyToken` mints a fresh, 128-bit,
   base64url token per slide. `scheduleMediaKey` (`src/schedule-batch/media-key.ts`) now REQUIRES that
   token and folds it into the key: `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg`.
   Knowing the Brand, week, Idea number, and slide name alone is no longer enough to construct a key.
2. **Signed, expiring links, not a permanent public URL.** `MediaHostPort.upload` gained a REQUIRED
   `options.expiresInSeconds` (no silent default). The live adapter (`src/media-host/live/s3.ts`)
   uploads via `aws s3 cp` (unchanged — still never an object ACL) then mints a temporary GET URL via
   `aws s3 presign ... --expires-in <seconds>`.
3. **The expiry is derived from the Asset's own `scheduled_at`, never invented.**
   `src/schedule-batch/media-expiry.ts`'s new `computeMediaExpiry(scheduledAt, uploadedAt)` targets
   `scheduledAt + EXPIRY_BUFFER_AFTER_SCHEDULED_MS` (1 hour — "access ends when the schedule does"),
   capped at AWS's own SigV4 presign ceiling (`MAX_PRESIGN_SECONDS`,
   `src/media-host/aws-presign-limit.ts`, 604,800s / 7 days). The 1-hour buffer is proven, by a
   dedicated regression test, to sit strictly under `CLEANUP_AFTER_MS` (24h) — so a link is ALWAYS
   already expired for many hours before the cleanup routine could even become eligible to delete the
   object it points at. Expiry and deletion can never race.

Both orchestration shells — `src/commands/export-schedule.ts` (CSV/S3 fallback) and
`src/commands/schedule-via-zoho-mcp.ts` (MCP-primary, ADR-0020) — mint a fresh token and derive the
expiry per Asset/slide, from the SAME `scheduled_at` each already stamps onto the manifest/ledger. The
existing cleanup routine (`runScheduleCleanup`) needed **zero code change** — it deletes by the exact
keys recorded in each manifest, never reconstructing one, so every pre-existing cleanup test still
passes unmodified (proves AC5).

`docs/schedule-batch-s3-setup.md` is rewritten: the bucket is private (Block Public Access ON, NO bucket
policy), the exact IAM permissions the running credentials need
(`s3:GetObject`/`s3:PutObject`/`s3:DeleteObject`, never `ListBucket`/wildcard), the concrete one-time
migration steps for straw-motion's already-live (previously public) bucket, and a dedicated section
naming the chosen expiry lifetime, why, and what happens when a link expires before Zoho fetches (the
fetch fails with an expired-signature error — the object itself is untouched, only that one link goes
stale). `src/media-host/live/smoke.ts` now also proves the bucket refuses a direct, unsigned request
(AC1) in addition to the signed link working end to end.

### Files touched

New:
- `src/media-host/token.ts` (+`.test.ts`)
- `src/media-host/aws-presign-limit.ts` (+`.test.ts`)
- `src/schedule-batch/media-expiry.ts` (+`.test.ts`)
- `openspec/changes/issue-198-schedule-media-private-bucket/` (this change: `proposal.md`, `tasks.md`,
  `specs/media-host/spec.md`, `specs/schedule-batch-media-expiry/spec.md`,
  `specs/docs-conformance/spec.md`, `handoff.md`)

Modified:
- `src/media-host/port.ts` — `UploadOptions.expiresInSeconds` (required), `upload` gains a third param.
- `src/media-host/fixtures/fake-media-host.ts` (+`.test.ts`) — records/validates `expiresInSeconds`.
- `src/media-host/live/adapter.ts` (+`.test.ts`) — `upload` passes `expiresInSeconds` through.
- `src/media-host/live/s3.ts` (+`.test.ts`) — private `cp` then `presign`; `publicJpgUrl` renamed
  `directJpgUrl` (now used only to prove refusal).
- `src/media-host/live/smoke.ts` — mints an unguessable key, proves the signed link AND the direct-URL
  refusal.
- `src/schedule-batch/media-key.ts` (+`.test.ts`) — `scheduleMediaKey` requires a `token`.
- `src/commands/export-schedule.ts` (+`.test.ts`) — mints token + derives expiry per slide/Asset.
- `src/commands/schedule-via-zoho-mcp.ts` (+`.test.ts`) — same, keyed off `scheduledAtUtc`.
- `docs/schedule-batch-s3-setup.md` — re-shaped for the private bucket + migration steps.
- `.claude/commands/export-schedule.md` — "public S3 URLs"/"public URLs" → signed, expiring links.
- `CLAUDE.md` — the S3 bullet under "Data sources" updated the same way.
- `src/schedule-batch/approval-gate.docs-test.ts` — the S3-setup `describe` block re-pinned against the
  new doc's real content (private-bucket statement, real function/module names, exact IAM actions, the
  AWS ceiling + `cappedByAwsLimit`, the migration commands).

### How to run

```
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-198-schedule-media-private-bucket
npm install                                   # first time only, per worktree
npx tsc -p tsconfig.json --noEmit             # strict typecheck — clean
npm test                                      # full suite
npm run test:docs                             # doc-conformance suite
npx openspec validate issue-198-schedule-media-private-bucket --strict
npx openspec validate --all --strict          # whole repo, confirms nothing else broke

# Isolated re-run of just this slice's new/touched tests:
node --import tsx --test \
  "src/media-host/token.test.ts" \
  "src/media-host/aws-presign-limit.test.ts" \
  "src/schedule-batch/media-expiry.test.ts" \
  "src/media-host/fixtures/fake-media-host.test.ts" \
  "src/media-host/live/s3.test.ts" \
  "src/media-host/live/adapter.test.ts" \
  "src/schedule-batch/media-key.test.ts" \
  "src/commands/export-schedule.test.ts" \
  "src/commands/schedule-via-zoho-mcp.test.ts" \
  "src/schedule-batch/cleanup-runner.test.ts" \
  "src/schedule-batch/cleanup.test.ts"
```

Baseline on `main` (`6a0b06b`, this branch's own cut point, already carrying issue #197):
`npm test` 2411 tests / 598 suites / 0 fail; `npm run test:docs` 259 tests / 66 suites / 0 fail.

**After this slice:**
- `npm test`: **2439 tests / 604 suites / 0 fail** (+28 tests / +6 suites).
- `npm run test:docs`: **263 tests / 66 suites / 0 fail** (+4 tests / +0 suites).
- `npx tsc -p tsconfig.json --noEmit`: clean, no output.
- `npx openspec validate issue-198-schedule-media-private-bucket --strict`: valid.
- `npx openspec validate --all --strict`: **44 passed, 0 failed** (43 pre-existing + this change).
- Isolated re-run of the 11 new/touched test files above: **104 tests / 22 suites / 0 fail** — includes
  the two UNTOUCHED cleanup test files (`cleanup-runner.test.ts`, `cleanup.test.ts`), re-run here
  specifically to prove AC5 (the existing cleanup routine needed no change and still passes).

All suite runs above were executed with every changed/new file **staged** (`git add -A`), so
`src/secrets-scan/self-scan.test.ts` (which drives `git ls-files`) genuinely scanned this slice's real
tracked content, not just pre-existing files — confirmed clean.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Test |
|---|---|---|
| 1 | The bucket is not public-read; an unauthenticated request to a known key is refused | **Hermetically:** `src/media-host/live/s3.test.ts`'s `uploadViaAwsCli` tests prove `aws s3 cp` never passes an object ACL (the object simply inherits the bucket's own, now-private, default access — no code path grants public read). **Live proof (Operator action, AC7):** `src/media-host/live/smoke.ts`'s new step 4 fetches the object's DIRECT, UNSIGNED URL (`directJpgUrl`) and asserts it is refused (never HTTP 200) — this is the concrete, real-bucket proof, deferred to the Operator's own run (see Known Limits) |
| 2 | Uploaded keys include an unguessable component | `src/media-host/token.test.ts` (4 tests: format, length, non-repetition, S3-key-safety); `src/schedule-batch/media-key.test.ts`'s "knowing only the Brand/run/Idea/slide-name is NOT enough" and "rejects an empty token" tests; `src/commands/export-schedule.test.ts`'s and `src/commands/schedule-via-zoho-mcp.test.ts`'s happy-path tests assert the real hosted key matches the token-bearing shape and that two sibling slides get two DIFFERENT tokens |
| 3 | Zoho receives a signed, expiring link rather than a public URL | `src/media-host/live/s3.test.ts`'s `uploadViaAwsCli`/`presignViaAwsCli` tests (cp then presign, in order, returning the presign call's stdout as the URL); `src/media-host/live/adapter.test.ts`'s "upload delegates to the AWS CLI (cp then presign)" test; `src/media-host/port.ts`'s `UploadOptions.expiresInSeconds` is now a REQUIRED field enforced at the type level everywhere `upload` is called |
| 4 | The link's expiry is derived from the scheduled time, and is covered by a test | `src/schedule-batch/media-expiry.test.ts` (9 tests: the natural-target derivation, purity, the AWS-ceiling cap and its `cappedByAwsLimit` flag, the exact 7-day boundary, invalid-input throws, ISO round-trip); `src/commands/export-schedule.test.ts`'s and `src/commands/schedule-via-zoho-mcp.test.ts`'s happy-path tests assert the REAL recorded `expiresInSeconds` on the fake equals `computeMediaExpiry(asset.scheduled_at, now).expiresInSeconds` |
| 5 | The existing cleanup routine still deletes hosted media after the hand-off | `src/schedule-batch/cleanup-runner.test.ts`/`cleanup.test.ts` — **zero code change**, every pre-existing test still green (isolated re-run above); `src/schedule-batch/media-expiry.test.ts`'s two "no race" tests additionally PROVE (not just assume) a link can never still read as valid once cleanup could delete its object |
| 6 | The change is entirely behind `MediaHostPort`; the port's fake is updated and no caller above it changes shape | `src/media-host/fixtures/fake-media-host.test.ts` (updated + one new test: rejects an out-of-range `expiresInSeconds` the SAME way the live adapter does); both orchestration shells' overall step list is byte-identical to before (resolve → cleanup → load Ideas → eligibility → Zoho config → preflight → derive schedule → **host media** → assemble plan → write → stamp → report) — only the hosting step's OWN two calls gained the two new explicit inputs the port's new contract requires, nothing else changed |
| 7 | The live media-host smoke script passes against the reconfigured bucket, and the result is posted on this issue | **Not run by this build — genuinely requires the real AWS bucket and cannot be hermetic** (see Known Limits and "What the Operator must do by hand" below). `src/media-host/live/smoke.ts` is updated and its own logic is exercised indirectly through `s3.test.ts`'s stubbed-runner tests (same argv/URL-handling code path, just never against a real AWS CLI) |

### Fakes / fixtures used

- **The Magnific fake — N/A, none touched.** This slice touches no `src/space-driver/`, no
  `src/producer/`, no Magnific SDK/tool call anywhere — confirmed:
  `grep -rn "spaces_\|creations_\|magnific" src/media-host src/schedule-batch/media-expiry.ts src/schedule-batch/media-key.ts src/commands/export-schedule.ts src/commands/schedule-via-zoho-mcp.ts`
  returns no matches.
- **The Media Host fake (`FakeMediaHost`, `src/media-host/fixtures/fake-media-host.ts`) is THE fake this
  slice is entirely about** — every test in `export-schedule.test.ts`, `schedule-via-zoho-mcp.test.ts`,
  `cleanup-runner.test.ts` injects it; it now validates `expiresInSeconds` the SAME way
  (`assertValidExpiresInSeconds`) the live adapter does, so a test bug (a caller passing an invalid
  expiry) fails exactly like production would.
- **Stubbed `CommandRunner`** (`src/media-host/live/s3.test.ts`, `adapter.test.ts`) — every AWS CLI
  argv-construction test injects a stub that records the exact argv and returns a canned (obviously
  fake, non-credential-shaped) presign stdout value; never `execFileRunner` bound to the real `aws`
  binary. **No live AWS call, no bucket created, no object written, no credential read from the
  environment at test time — confirmed by the isolated 104-test re-run above and by the full 2439-test
  green run with everything staged.**
- `src/media-host/live/smoke.ts` remains a manual, non-`npm test` script — never run by this build.

### Self-review notes

- Kept `EXPIRY_BUFFER_AFTER_SCHEDULED_MS < CLEANUP_AFTER_MS` as a genuine, standalone regression TEST
  (importing both real constants) rather than a module-load-time `throw` I drafted first and then
  removed — a throw at import time is not this codebase's established pattern and would fail in a
  confusing place; a dedicated test that fails with a clear name is consistent with every other
  invariant this repo proves.
- Kept the port's `UploadResult` shape unchanged (`{ url }`) rather than also adding `expiresAt` to it —
  nothing downstream (the manifest, the CSV rows, the ledger stamp) needs the expiry recorded anywhere
  beyond the Media Host call itself, so adding a field nothing reads would just be surface area with no
  real use.
- Deliberately did NOT add expiry-capping visibility (a warning line) to either orchestration shell's
  report text — the capping case (`cappedByAwsLimit: true`) does not occur for any Format built so far
  (every real schedule sits well within the 7-day window at export time), and surfacing it would be
  UX scope beyond "lock down the bucket." Documented instead, precisely, in
  `docs/schedule-batch-s3-setup.md`'s dedicated expiry section and flagged below as a Known Limit —
  reversible later without touching this slice's core logic if a long-tailed batch ever becomes routine.
- Renamed `publicJpgUrl` to `directJpgUrl` rather than deleting it — it is still genuinely useful (the
  smoke script's own proof that the bucket refuses an unsigned request depends on being able to build
  that exact unsigned URL), just re-purposed from "the returned upload URL" to "the URL used only to
  prove refusal."
- Caught and fixed, before it ever reached a green run, an OpenSpec parser quirk: `openspec validate
  --strict` only reads a Requirement's FIRST LINE (up to the first line-wrap in the markdown source) for
  its SHALL/MUST check — one of my Requirement paragraphs had "SHALL" wrapped onto its second line and
  failed validation until reworded so the first line carries its own SHALL clause.
- Caught and fixed a similar line-wrap trap in `CLAUDE.md`'s own prose: a docs-test regex
  (`/one-time infrastructure setup|one-time.{0,20}setup/i`) doesn't cross a markdown line-wrap (`.` never
  matches `\n`) — my first two edit attempts split "one-time"/"infrastructure"/"setup" across wrapped
  lines and failed `npm run test:docs`; fixed by keeping that exact phrase on one physical line.

### Known limits

- **AC7 (the live smoke script actually passing against the real bucket, and posting the result on
  issue #198) is NOT satisfied by this build, by design** — it genuinely requires a real AWS bucket and
  real credentials, which this build/`npm test` is expressly forbidden from touching. `src/media-host/
  live/smoke.ts` is updated and its logic is exercised via `s3.test.ts`'s stubbed-runner tests, but the
  real run — including the one-time migration steps below — is the Operator's own, by hand. See "What the
  Operator must do by hand" below for the exact commands.
- **A batch whose last Asset is scheduled more than ~7 days beyond its own export/upload time will have
  a media link that expires BEFORE that Asset's scheduled post time** (`cappedByAwsLimit: true`) — a
  real, unavoidable AWS SigV4 constraint (604,800-second presign ceiling), not a bug in this slice's own
  logic. Documented explicitly in `docs/schedule-batch-s3-setup.md`'s "Signed link expiry" section.
  Today's mitigation is exporting/re-hosting closer to the event; no current Format's schedule actually
  reaches this boundary. A future slice could add re-presigning closer to post time if that ever changes.
- **The already-live straw-motion bucket still carries its OLD public `GetObject` policy until the
  Operator runs the migration steps below** — this build cannot run them (no live AWS access). Until
  that migration runs, straw-motion's bucket remains public-read in reality even though every NEW upload
  this code performs already uploads privately and returns a signed link (the OLD public policy, if left
  in place, would still separately make any object readable via its plain direct URL too). The migration
  is not optional follow-up — it is the actual fix for AC1 on the one bucket that exists today.

### What the Operator must do by hand (real-bucket configuration — none of this ran in this build)

1. **Migrate straw-motion's existing bucket to private** (`docs/schedule-batch-s3-setup.md`'s "Migrating
   an already-public bucket to private" section has the full detail; summarized here):
   ```
   aws s3api delete-bucket-policy --bucket strawmotion-schedule-media
   aws s3api get-public-access-block --bucket strawmotion-schedule-media   # expect all four settings true
   aws s3api get-bucket-policy --bucket strawmotion-schedule-media          # expect NoSuchBucketPolicy
   ```
2. **Confirm the AWS CLI credentials already in use carry `s3:GetObject`, `s3:PutObject`, and
   `s3:DeleteObject`** on `strawmotion-schedule-media`'s objects — attach the IAM policy shown in the
   setup doc's step 4 if a dedicated IAM user/role backs this bucket and doesn't already have them.
3. **Run the smoke script for real:** `npm run media-host-smoke` (`npx tsx
   src/media-host/live/smoke.ts`). It now proves BOTH that the signed link works end to end AND that the
   bucket's direct, unsigned URL is refused. Confirm it prints `SMOKE TEST PASSED`.
4. **Post the smoke script's output on issue #198** (its own AC7) — the exact console output from step 3
   is the acceptance evidence GitHub asks for; this build cannot produce it.
5. **MundoTip's own bucket** (whenever it is set up) should follow the setup doc's "Setting up a NEW
   Brand's bucket" section from the start — it never needs the migration section at all, since it will
   never have had a public policy in the first place.
