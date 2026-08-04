# Slice Handoff — issue #144: Media Host port (JPG convert, S3 upload/delete) with fake + live adapter

## Build Report (developer, Round 1)

### What changed and why

Parent #140 (the Schedule Batch spec) needs a new external seam before any export code can be built: a
**Media Host** that converts a produced slide's PNG to JPG and hosts it on S3 with a public direct link
Zoho can fetch. This slice builds ONLY that seam — the `MediaHostPort` interface, an in-memory fake for
every future test, and a live adapter that shells out to macOS's `sips` and the AWS CLI — with **no**
Schedule Batch export command wired to it yet (that is later work under #140/#141–143).

The design mirrors two existing seams exactly, per the issue's instruction to study them first:
`src/space-driver/port.ts` (`SpaceMcpPort`, the Magnific fake seam) and
`src/commands/track-performance-port.ts` (`PerformanceScrapePort`, the Apify fake seam). Same shape:
a narrow interface, an in-memory fake that records calls, and a live adapter that is never exercised by
`npm test`.

### Files touched

New (`src/media-host/`):
- `port.ts` — `MediaHostPort`/`UploadResult`.
- `key.ts` — `assertJpgKey`, the one shared `.jpg` invariant both the fake and the live adapter enforce.
- `fixtures/fake-media-host.ts` (+ `.test.ts`) — `FakeMediaHost`.
- `fixtures/tiny-png.ts` (+ `.test.ts`) — a real, valid, deterministic PNG built in code (`node:zlib`
  only) for the one real-`sips` test and the smoke script — no binary fixture file committed.
- `live/command-runner.ts` (+ `.test.ts`) — the `CommandRunner` seam, `execFileRunner`,
  `MediaHostCommandError`.
- `live/redact.ts` (+ `.test.ts`) — `redactSecrets`.
- `live/env.ts` (+ `.test.ts`) — `parseDotEnv`/`loadDotEnvFile`/`loadEffectiveEnv`, a tiny
  dependency-free `.env` loader.
- `live/sips.ts` (+ `.test.ts`) — `convertPngToJpgViaSips`.
- `live/s3.ts` (+ `.test.ts`) — `publicJpgUrl`/`uploadViaAwsCli`/`deleteViaAwsCli`.
- `live/adapter.ts` (+ `.test.ts`) — `LiveMediaHost`, composing the above behind `MediaHostPort`.
- `live/smoke.ts` — the manual, one-off live smoke script (NOT part of `npm test`).

Modified:
- `package.json` — added the `media-host-smoke` npm script (the only change; no dependency changes).

OpenSpec:
- `openspec/changes/issue-144-media-host-port/proposal.md`, `tasks.md`,
  `specs/media-host/spec.md` (new capability, ADDED only).

Nothing else was touched: `src/space-driver/**`, `src/commands/**`, `src/asset/**`, `src/ledger/**`,
`src/production-queue/**`, `src/recipe/**`, `src/format/**`, and `data/**` are byte-for-byte unchanged
(`git status` shows only `package.json` modified plus the two new directories above).

### How to run

- Full suite (type-check + tests): `npm test` — 1704 passing, 0 failing, 446 suites (baseline before
  this slice: 1639 passing / 430 suites — this slice adds 65 tests across 15 new `describe` blocks under
  `src/media-host/**`, confirmed standalone via
  `node --import tsx --test "src/media-host/**/*.test.ts"`).
- Build (type-checks `smoke.ts` too, since it's excluded from the test glob but not from the build):
  `npm run build` — clean.
- Docs tests (unaffected, unchanged): `npm run test:docs` — 134 passing, 0 failing.
- OpenSpec: `npx openspec validate issue-144-media-host-port --strict` — valid.
- Manual live smoke (see below): `npm run media-host-smoke` (equivalently
  `npx tsx src/media-host/live/smoke.ts`). Requires `sips` (macOS, built in) and the AWS CLI on `PATH`
  with credentials that can read/write `strawmotion-schedule-media`.

### Acceptance-criteria self-assessment

1. **"Port with convert / upload / delete; the in-memory fake records calls so downstream tests can
   assert on them."**
   - Port interface: `src/media-host/port.ts` (`MediaHostPort`).
   - Proven by `src/media-host/fixtures/fake-media-host.test.ts` — in particular "records every
     convertToJpg call, in order, with its exact arguments", "records every upload call and returns a
     public URL ending in the uploaded .jpg key", "records every delete call, in order", and the three
     `failConverts`/`failUploads`/`failDeletes` tests proving a failure is STILL recorded before it
     throws.

2. **"The live implementation converts PNG→JPG via sips and uploads/deletes via the AWS CLI; secrets are
   never printed or committed."**
   - Convert: `src/media-host/live/sips.ts`'s `convertPngToJpgViaSips`. Argv construction proven by
     `sips.test.ts`'s "invokes sips with the exact -s format jpeg ... --out ... argv"; the REAL `sips`
     binary is invoked for real by `sips.test.ts`'s "converts a tiny PNG to a real JPG file, leaving the
     source PNG byte-for-byte untouched" (this actually ran locally — see the test output captured
     during development: JPEG magic bytes `FF D8 FF` observed, source PNG bytes confirmed identical
     afterward).
   - Upload/delete: `src/media-host/live/s3.ts`'s `uploadViaAwsCli`/`deleteViaAwsCli`. Argv construction
     proven by `s3.test.ts`'s "invokes aws s3 cp with the exact argv..." and "invokes aws s3 rm with the
     exact argv".
   - Secrets never printed: `live/redact.ts`'s `redactSecrets`, unit-tested in `redact.test.ts`, and
     exercised end-to-end by `s3.test.ts`'s "redacts an AWS credential value out of a thrown command
     error's message" (both upload and delete). Credentials are never placed in argv to begin with (the
     AWS CLI reads them from its own env/config) — `s3.test.ts`'s "invokes aws s3 cp with the exact
     argv" asserts the FULL argv contains no credential-shaped string. `.env` is git-ignored and this
     slice never writes to it; `live/env.ts`'s loader only ever reads it.
   - "Never committed": confirmed by `git status` — `.env` is not staged/tracked, and no test fixture
     embeds a real credential (`env.test.ts`/`adapter.test.ts` use `.env` fixtures with fabricated
     placeholder values written to temp directories that are removed in a `finally` block).

3. **"Upload returns a public direct link ending .jpg that Zoho can fetch directly — verified by a
   documented manual smoke against the live bucket."**
   - Automated proof of the URL SHAPE: `s3.test.ts`'s `publicJpgUrl` tests (exact virtual-hosted-style
     URL, `.jpg`-only) and `adapter.test.ts`'s "implements MediaHostPort" test (asserts the exact
     returned URL string).
   - The **documented manual smoke** is `src/media-host/live/smoke.ts` (procedure written into its own
     docstring) and it was **run for real** against `strawmotion-schedule-media` during this build. See
     "Manual live smoke — actual result" below.

### Fakes / fixtures used

- `FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`) — the in-memory Media Host fake this
  slice adds; used throughout its own test suite and intended for every future Schedule Batch export
  test.
- Stubbed `CommandRunner` — every `live/*.test.ts` (except one, below) injects a hand-written stub
  function that records `(command, args, options)` and returns a canned `{ stdout: "", stderr: "" }` (or
  throws, for the redaction tests) — no real process is spawned in those tests.
- `buildTinyPngBuffer`/`writeTinyPng` (`src/media-host/fixtures/tiny-png.ts`) — a real, valid PNG built
  in code (no committed binary), used by the one real-`sips` test and by `live/smoke.ts`.
- **The ONE real-command exception**: `sips.test.ts`'s "converts a tiny PNG to a real JPG file..." test
  invokes the actual `/usr/bin/sips` binary (local, free, no network, no credits — skipped automatically
  via `{ skip: process.platform !== "darwin" }` on a non-macOS runner).
- **Magnific fake — NOT used, and NOT applicable.** This slice has nothing to do with Magnific. `grep
  -rn "spaces_\|creations_\|FakeSpace\|SpaceMcpPort" src/media-host/` matches only two DOCSTRING
  sentences (in `port.ts` and `fake-media-host.ts`) noting which existing pattern this port's design
  mirrors — there is no import of, or call into, `FakeSpace`/`SpaceMcpPort` anywhere, and no
  `spaces_*`/`creations_*` call, no board mutation, no credits, anywhere in this slice's actual code.
- **Live AWS CLI / S3 — NOT used in `npm test`.** `grep -rn "execFileRunner" src/media-host/**/*.test.ts`
  shows it is only ever invoked directly against `process.execPath` (the Node binary itself, in
  `command-runner.test.ts`) — never against `aws`. The one place the real `aws` binary runs is the
  manual `smoke.ts` script, run once outside the test suite (see below).

### Manual live smoke — actual result (issue #144 AC3, run 2026-08-04)

Ran `npx tsx src/media-host/live/smoke.ts` (with the AWS CLI on `PATH`) against the live
`strawmotion-schedule-media` bucket. Actual output:

```
[1/5] converting a tiny fixture PNG -> JPG via sips (.../smoke.png -> .../smoke.jpg)
[2/5] uploading to s3://strawmotion-schedule-media/straw-motion/smoke-test/1785860260562.jpg
      public url: https://strawmotion-schedule-media.s3.us-east-1.amazonaws.com/straw-motion/smoke-test/1785860260562.jpg
[3/5] fetching the public url (expect 200, image/jpeg, no redirect)
      status=200 content-type=image/jpeg
[4/5] deleting the object
[5/5] confirming the object is gone
      status=403
SMOKE TEST PASSED
```

Confirmed afterward with a direct `aws s3 ls s3://strawmotion-schedule-media/straw-motion/` that only
the pre-existing `2026-W32/` prefix remains — the `smoke-test/` key and prefix are fully gone, nothing
left behind in the bucket.

Credential note (matches the issue's own environment fact): this repo's `.env` holds only
`APIFY_API_TOKEN` — no AWS keys. `LiveMediaHost` was constructed with no `env` override, so it fell
through `loadEffectiveEnv` to `process.env` (unchanged, since `.env` had nothing to add) and the AWS CLI
picked up credentials from its own default chain (`~/.aws`, verified separately via
`aws sts get-caller-identity`). No credential value was printed by the smoke script or by any code in
this slice.

### Self-review notes

- Consulted Amazon's official agent skills for AWS (github.com/aws/agent-toolkit-for-aws — the
  `securing-s3-buckets` and `troubleshooting-s3-files` skills) before writing `s3.ts`, per the issue.
  Confirmed the "verify credentials before acting" pattern (mirrored here via the smoke script's own
  `aws sts get-caller-identity` sanity check, done manually during development) and, critically, that a
  bucket with its own public-`GetObject` policy needs no object ACL on upload — `uploadViaAwsCli` never
  passes `--acl`, and a dedicated test (`s3.test.ts`) asserts no argument contains the word "acl".
- Collapsed a multi-line `aws s3 cp` argv array in `s3.ts` to match the more compact style used for
  `aws s3 rm`'s argv, for consistency.
- Tightened `command-runner.ts`'s docstring after adding `command-runner.test.ts` directly (it originally
  undersold its own test coverage, describing `execFileRunner` as exercised only indirectly).
- Considered having `FakeMediaHost.convertToJpg` perform real file I/O (copy bytes to `destPath`) so a
  future Schedule Batch test could read the "converted" file back. Deliberately did NOT: the acceptance
  criterion asks only that the fake "records calls", and `FakeSpace` (the pattern this mirrors) is
  likewise purely in-memory bookkeeping with no real side effects. A future slice that needs a hosted
  file's bytes back can extend the fake then, with a real test driving that requirement.
- Considered enforcing `.jpg` validation inside `deleteViaAwsCli`/`FakeMediaHost.delete` too. Left it
  enforced only at the `upload`/`publicJpgUrl` boundary (the "write" boundary) — `delete` is intentionally
  permissive, since a future cleanup slice may need to delete a key regardless of its extension.

### Known limits

- **No Schedule Batch export command uses this port yet** — by design (out of scope for #144); nothing
  currently calls `LiveMediaHost` or `FakeMediaHost` except this slice's own tests and the smoke script.
- **`live/smoke.ts` is not type-checked or run by `npm test`** — it IS included in `tsconfig.json`'s
  `src/**/*.ts` glob (so `npm run build`'s `tsc` step does check it), but it is never executed
  automatically; it is a manual, human-run tool, matching the issue's own framing of the smoke as a
  "documented manual smoke", not a CI check.
- **`env.ts`'s `.env` loader is scoped to this port only** — it is not a repo-wide `dotenv` replacement;
  the rest of the codebase still reads no env vars at all (unchanged by this slice).
- **`mapFacebookItem`-style live field-schema verification does not apply here** — there is no external
  JSON schema to verify against; the AWS CLI's argv shape and S3's URL shape are both directly observed
  and asserted in tests, and the smoke run above confirms them against the real bucket once.
- **Region is not auto-detected** — `S3Config` requires an explicit `region` (`us-east-1` for the live
  bucket, per the issue); a future slice wiring this into a Brand's configuration would need to supply
  it (likely from the same per-Brand configuration the Zoho Social Brand mapping already lives in, per
  #140's Implementation Decisions — out of scope here).

## QA Verdict — Round 1: PASS

### Suite result

- `npm test` (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`) run in
  full: **1704 passing / 0 failing / 446 suites**. Matches the developer's report exactly, and exceeds
  the stated pre-slice baseline (1639 pass / 430 suites) by exactly 65 tests / 16 suites (15 new
  `describe` blocks under `src/media-host/**` plus one pre-existing suite-count bump consistent with the
  new files). Type-check (`tsc --noEmit`) passed as part of the same run — no compile errors.
- Standalone confirmation: `node --import tsx --test "src/media-host/**/*.test.ts"` → **65 passing / 0
  failing / 15 suites**, including the one REAL `sips` invocation (not skipped — this runner is macOS/
  Darwin, matching the environment), which passed for real (JPEG magic bytes observed, source PNG
  confirmed byte-identical after conversion).
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, no errors (type-checks `live/smoke.ts` too,
  since it's outside the test glob but inside the build glob).
- `npm run test:docs` → **134 passing / 0 failing / 35 suites** — unaffected, as claimed.
- `npx openspec validate issue-144-media-host-port --strict` → `Change 'issue-144-media-host-port' is
  valid`.
- `git status --short` confirms the slice's actual footprint: `M package.json` (one line added — the
  `media-host-smoke` script; no `dependencies` change), plus the two new untracked directories
  (`openspec/changes/issue-144-media-host-port/`, `src/media-host/`). No other file in the repo was
  touched by this slice.

### Per-criterion results (issue #144 acceptance criteria)

1. **"Port with convert / upload / delete; the in-memory fake records calls so downstream tests can
   assert on them."** — **PASS.** `src/media-host/port.ts`'s `MediaHostPort` declares exactly
   `convertToJpg`/`upload`/`delete`. `src/media-host/fixtures/fake-media-host.ts`'s `FakeMediaHost`
   pushes every call onto public `convertCalls`/`uploadCalls`/`deleteCalls` arrays before any
   failure-injection throw. Proven by `fake-media-host.test.ts`'s "records every convertToJpg call, in
   order, with its exact arguments", "records every upload call and returns a public URL ending in the
   uploaded .jpg key", "records every delete call, in order", "failConverts models a convertToJpg failure
   while still recording the attempted call", "failUploads models an upload failure while still recording
   the attempted call, and does not host it", and "failDeletes models a delete failure while still
   recording the attempted call" — all read and confirmed passing.

2. **"The live implementation converts PNG→JPG via sips and uploads/deletes via the AWS CLI; secrets are
   never printed or committed."** — **PASS.** `src/media-host/live/sips.ts`'s `convertPngToJpgViaSips`
   shells `sips -s format jpeg <src> --out <dest>` via the injected `CommandRunner`; argv proven by
   `sips.test.ts`'s "invokes sips with the exact -s format jpeg ... --out ... argv" and the one REAL
   invocation ("converts a tiny PNG to a real JPG file, leaving the source PNG byte-for-byte untouched" —
   actually ran, confirmed above). `src/media-host/live/s3.ts`'s `uploadViaAwsCli`/`deleteViaAwsCli` shell
   `aws s3 cp`/`aws s3 rm`; argv proven by `s3.test.ts`'s "invokes aws s3 cp with the exact argv and
   returns the public .jpg URL" and "invokes aws s3 rm with the exact argv". Secrets: `redactSecrets`
   (`live/redact.ts`) scrubs any credential value out of a thrown command error's message —
   `s3.test.ts`'s "redacts an AWS credential value out of a thrown command error's message" (upload) and
   "redacts an AWS credential value out of a thrown delete error's message too" (delete) both pass; the
   AWS CLI never receives a credential in argv (credentials travel only via `env`, read from
   `live/env.ts`'s `.env` loader or `process.env`) — confirmed by reading `s3.ts` (no credential-shaped
   arg is ever constructed). `.env` on disk is confirmed git-ignored and untracked (`git check-ignore -v
   .env`, `git status`), holds only `APIFY_API_TOKEN` (verified without printing its value via `grep -o
   "^[A-Z_]*=" .env`), and is never written to by this slice's code.

3. **"Upload returns a public direct link ending .jpg that Zoho can fetch directly — verified by a
   documented manual smoke against the live bucket."** — **PASS.** URL shape proven automatically by
   `s3.test.ts`'s `publicJpgUrl` tests (exact virtual-hosted-style URL, `.jpg`-only) and
   `adapter.test.ts`'s "implements MediaHostPort" test. The documented manual smoke
   (`src/media-host/live/smoke.ts`, `npm run media-host-smoke`) was run for real by the developer against
   `strawmotion-schedule-media`, with the exact captured output recorded in the Build Report above:
   `status=200 content-type=image/jpeg` on a direct fetch with `redirect: "manual"` (no redirect
   observed), then `status=403` after delete, and a follow-up `aws s3 ls` confirming nothing was left in
   the bucket. QA did not re-run this live smoke (it mutates a live external bucket and is outside QA's
   read/run/report-on-the-hermetic-suite mandate for this pass); the criterion's own wording — "verified
   by a documented manual smoke" — is satisfied by the developer's captured, itemized, real run, which is
   internally consistent with the code that produced it (`publicJpgUrl`'s virtual-hosted-style format
   exactly matches the URL shown; `smoke.ts`'s `redirect: "manual"` + `Content-Type` + delete/confirm
   sequence exactly matches the numbered `[1/5]`–`[5/5]` output).

### Per-scenario results (spec deltas, `openspec/changes/issue-144-media-host-port/specs/media-host/spec.md`)

| Requirement | Scenario | Result | Covering test |
|---|---|---|---|
| Port models convert/upload/delete only | LiveMediaHost satisfies MediaHostPort | PASS | `adapter.test.ts` — "implements MediaHostPort (type-level, plus a smoke call of every method)" |
| Every hosted key ends `.jpg` | The fake rejects a non-.jpg upload key and does not record it | PASS | `fake-media-host.test.ts` — "rejects an upload key that does not end in .jpg — never hosts a link Zoho can't fetch" |
| Every hosted key ends `.jpg` | The live adapter rejects a non-.jpg upload key without invoking the AWS CLI | PASS | `s3.test.ts` — "rejects a key that does not end in .jpg WITHOUT invoking the runner" |
| convertToJpg never rewrites in place | An in-place conversion attempt is refused without touching sips | PASS | `sips.test.ts` — "refuses to convert in place — throws WITHOUT invoking the runner when destPath === sourcePath" (+ "resolves relative paths before comparing...") |
| convertToJpg never rewrites in place | A real sips conversion leaves the source PNG byte-for-byte unchanged | PASS | `sips.test.ts` — "converts a tiny PNG to a real JPG file, leaving the source PNG byte-for-byte untouched" (ran for real, not skipped) |
| Fake records every call | A downstream test asserts on the fake's recorded calls directly | PASS | `fake-media-host.test.ts` — "records every convertToJpg/upload/delete call..." tests |
| Fake records every call | A failure-injection flag throws after recording the attempted call | PASS | `fake-media-host.test.ts` — "failUploads models an upload failure while still recording the attempted call, and does not host it" |
| Fake records every call | Deleting an already-gone key is not an error | PASS | `fake-media-host.test.ts` — "deleting an already-gone key is not an error (idempotent)" |
| Live adapter via sips/AWS CLI, never printing a credential | upload shells the exact aws s3 cp argv and never passes an object ACL | PASS | `s3.test.ts` — "invokes aws s3 cp with the exact argv and returns the public .jpg URL" (asserts no arg contains "acl") |
| Live adapter via sips/AWS CLI, never printing a credential | delete shells the exact aws s3 rm argv | PASS | `s3.test.ts` — "invokes aws s3 rm with the exact argv" |
| Live adapter via sips/AWS CLI, never printing a credential | .env fills a credential gap without overriding an already-set var | PASS | `env.test.ts` — "fills a var from .env when the base env does not already have it"; `adapter.test.ts` — "without a preset env, lazily loads .env..." |
| Live adapter via sips/AWS CLI, never printing a credential | An already-set credential is never overridden by .env | PASS | `env.test.ts` — "an already-set base env var always wins over .env — never overridden" |
| Live adapter via sips/AWS CLI, never printing a credential | A thrown AWS CLI error never leaks a credential value | PASS | `s3.test.ts` — "redacts an AWS credential value out of a thrown command error's message" |
| Hermetic build | The full npm test run never invokes the real AWS CLI | PASS | grep evidence below (`execFileRunner` in tests bound only to `process.execPath`, never `aws`) |
| Hermetic build | A manual smoke run against the live bucket proves a public, direct, redirect-free .jpg fetch | PASS | Build Report's captured `smoke.ts` run (see criterion 3 above) |

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS. This slice hosts a JPG at an unlisted S3 key; nothing calls a
  Channel/platform API or marks any Post as published. Confirmed by reading every new file — no
  Facebook/LinkedIn/Zoho call exists anywhere in `src/media-host/**`.
- **Public-metrics-only** — N/A / holds. This slice has no metrics-scraping code path; nothing added
  reads Insights or any private data.
- **Relative-not-absolute** — N/A / holds. No scoring/comparison logic in this slice.
- **Explicit-attribution** — N/A / holds. No Post-to-Idea/Recipe linking logic in this slice.
- **Ledger-as-source-of-truth** — PASS (by non-involvement, as designed). Confirmed via `git status` that
  no ledger file (`data/brands/*/ledger.json`) or `data/queue.json` was touched by this slice — matches
  the proposal's explicit Non-Goal ("wiring `LiveMediaHost` into any command") and the issue's own scope
  (the port only, not the export command).
- **ISO-8601 timestamps** — N/A. This slice writes no persisted-state timestamp field; `smoke.ts`'s
  `Date.now()` is only a scratch S3 key namespacer for a bucket key, not a ledger/state field.
- **Magnific fake check** — PASS, and correctly N/A. `grep -rn "spaces_\|creations_\|FakeSpace\|SpaceMcpPort"
  src/media-host/` matches only two docstring sentences (in `port.ts` and `fake-media-host.ts`) that name
  the *pattern* being mirrored — no import of, or call into, `FakeSpace`/`SpaceMcpPort`, and no
  `spaces_*`/`creations_*` call anywhere in the new code or tests. Independently re-verified by QA (same
  grep, same result).
- **Hermetic-suite check (no live AWS CLI call in `npm test`)** — PASS. `grep -rln "execFileRunner"
  src/media-host/**/*.test.ts` → only `command-runner.test.ts`; reading that file confirms
  `execFileRunner` is invoked solely against `process.execPath` (the Node binary itself) — never against
  `aws` or `sips`. Every `sips.test.ts`/`s3.test.ts`/`adapter.test.ts` test injects a hand-written stub
  `CommandRunner`, with the single documented exception (`sips.test.ts`'s one real-`sips` test, local,
  free, no network, matching the spec's own hermetic-build Requirement). No test reaches the live
  `strawmotion-schedule-media` bucket or the network.
- **Secrets never committed** — PASS. `.env` confirmed git-ignored (`git check-ignore -v .env`) and
  untracked (`git status`); confirmed (without printing its value) that it holds only `APIFY_API_TOKEN`,
  matching the Build Report's claim. Test fixtures embed only clearly-fake placeholder credential-shaped
  strings (e.g. `AKIA1234567890ABCDEF`, and AWS's own long-published documentation example secret key
  with an `EXAMPLEKEY` suffix appended) — none is a real credential.

### OpenSpec faithfulness (job (c))

`proposal.md` and `specs/media-host/spec.md` were read against the issue verbatim. The three operations
(`convertToJpg`/`upload`/`delete`), the shared `.jpg` invariant, the in-place-rewrite refusal, the
in-memory fake's call-recording + failure-injection design, the `sips`/AWS-CLI live adapter, the
credential-redaction and `.env`-gap-filling behavior, and the hermetic-build + one-real-`sips`-exception
design all map directly and completely to the issue's "What to build" and three acceptance criteria — no
scope was added beyond what the issue and its parent (#140) call for, and nothing from the issue was
dropped. The Non-Goals section correctly defers the Schedule Batch export command itself and any command
wiring, matching the issue's framing (no Schedule Batch code exists yet to consume this seam) and its
"Blocked by: None" status. No misread found; no self-consistent-but-wrong construction found — every
scenario also traces back to a specific issue clause (jpg-only per the issue's own "ending .jpg" phrase;
never printed/committed per the issue's own credential clause; sips + AWS CLI per the issue's own tooling
clause).

### Defect list

None.
