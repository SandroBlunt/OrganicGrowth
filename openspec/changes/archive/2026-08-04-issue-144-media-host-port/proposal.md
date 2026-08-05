## Why

Parent #140 (the Schedule Batch spec) decided a **new seam** is needed for the export to prepare
Zoho-ready media: a Media Host that converts a produced slide's PNG to JPG and hosts it on S3 with a
public direct link. Nothing in the repo shells out to an external tool today, and no Schedule Batch code
exists yet to consume this seam — issue #144 is the narrow, self-contained slice that builds the port
itself: the fake (for every future Schedule Batch test) and the real adapter (for the one live bucket
that already exists), with no export command wired to it yet. #140's Testing Decisions are explicit that
this is a FAKE-backed hermetic seam, mirroring `SpaceMcpPort` (the Magnific fake) and
`PerformanceScrapePort` (the Apify fake) — this slice builds that same pattern for the Media Host.

## What Changes

- **Add the `MediaHostPort` interface** (`src/media-host/port.ts`): three operations —
  `convertToJpg(sourcePath, destPath)`, `upload(localPath, key) -> { url }`, `delete(key)` — mirroring
  `src/space-driver/port.ts` and `src/commands/track-performance-port.ts`'s narrow-seam pattern.
- **Add the shared `.jpg` invariant** (`src/media-host/key.ts`): `assertJpgKey(key)`, called by BOTH the
  fake and the live adapter before any upload, so a link that doesn't end `.jpg` can never be hosted by
  either implementation (PRD #140 story 5).
- **Add the in-memory FAKE** (`src/media-host/fixtures/fake-media-host.ts`): `FakeMediaHost` records
  every `convertToJpg`/`upload`/`delete` call, in order, exposes `isHosted(key)`, and supports
  failure-injection flags (`failConverts`/`failUploads`/`failDeletes`) for a future Schedule Batch
  export's failure-path tests — mirroring `FakeSpace`'s option-flag style
  (`src/space-driver/fixtures/fake-space.ts`).
- **Add the live adapter** (`src/media-host/live/`), composed from four small deep modules:
  - `command-runner.ts` — the `CommandRunner` seam (`execFileRunner`, the one real implementation
    shelling out via `node:child_process`) and `MediaHostCommandError`.
  - `sips.ts` — `convertPngToJpgViaSips`: shells `sips -s format jpeg <src> --out <dest>`; refuses
    in-place conversion (`destPath === sourcePath`) WITHOUT running any command, so a slide's original
    PNG can never be silently rewritten.
  - `s3.ts` — `uploadViaAwsCli`/`deleteViaAwsCli`/`publicJpgUrl`: shells `aws s3 cp`/`aws s3 rm` against
    the configured bucket/region; never passes an object ACL (the live bucket's own policy already
    grants public `GetObject` — verified against Amazon's official agent skills for AWS,
    github.com/aws/agent-toolkit-for-aws, before writing this); redacts any AWS credential VALUE out of
    a thrown command error's message (`redact.ts`) as defense in depth on top of never putting a
    credential in argv to begin with.
  - `env.ts` — a tiny, dependency-free `.env` loader (`parseDotEnv`/`loadDotEnvFile`/
    `loadEffectiveEnv`): `.env` fills a credential gap only when the base env does not already define
    it, so the AWS CLI's own default credential chain (`~/.aws`, an IAM role) is untouched when `.env`
    has nothing relevant — which is this repo's situation today (`.env` holds only `APIFY_API_TOKEN`).
  - `adapter.ts` — `LiveMediaHost`: composes the three into one `MediaHostPort` implementation.
- **Add a manual smoke script** (`src/media-host/live/smoke.ts`, `npm run media-host-smoke`): converts a
  tiny in-code PNG fixture, uploads it under a namespaced `straw-motion/smoke-test/...` key, fetches the
  returned URL with `redirect: "manual"` to prove a direct 200/`image/jpeg` fetch with no redirect,
  deletes it, and confirms it is gone. NOT part of `npm test` — run once for real against the live
  `strawmotion-schedule-media` bucket as this issue's acceptance criterion 3 (see the Build Report for
  the actual run's result).
- **Add the tiny PNG fixture builder** (`src/media-host/fixtures/tiny-png.ts`): builds a real, valid,
  deterministic PNG in code (`node:zlib` only — no new dependency, no binary fixture file) for the one
  real-`sips` test and the smoke script.

## Non-Goals (explicitly deferred)

- **The Schedule Batch export command itself** (the CSV writer, the manifest, the cleanup trigger,
  `scheduled_at` ledger writes) — a later slice under parent #140. This slice builds ONLY the seam it
  will inject `MediaHostPort` through.
- **Wiring `LiveMediaHost` into any command** — nothing calls it yet; it is proven directly by its own
  tests and the manual smoke script.
- **S3 bucket/lifecycle-rule provisioning** — the bucket, its public `GetObject` policy, and its 30-day
  expiry lifecycle rule already exist (per the issue); this slice only writes the client code that talks
  to it.
- **A general-purpose `.env` loader for the rest of the app** — `env.ts` is scoped to this port's own
  credential needs, not a repo-wide dotenv utility (the repo still has none, by design — no new
  dependency).

## Capabilities

### Added Capabilities

- `media-host`: the `MediaHostPort` seam, its in-memory fake, and the live `sips`/AWS-CLI adapter.

## Impact

- **New code:** `src/media-host/port.ts`, `src/media-host/key.ts`, `src/media-host/fixtures/
  fake-media-host.ts`, `src/media-host/fixtures/tiny-png.ts`, `src/media-host/live/{command-runner,
  env,redact,sips,s3,adapter,smoke}.ts` (+ a `.test.ts` for every non-`smoke.ts` module).
- **Modified code:** `package.json` (new `media-host-smoke` script only).
- **Not touched:** `src/space-driver/**`, `src/commands/**`, `src/asset/**`, `src/ledger/**`,
  `src/production-queue/**`, `src/recipe/**`, `src/format/**`, `data/**` — this slice adds ONE new,
  self-contained module tree and touches nothing that reads/writes the ledger or any Brand's data.
- **Hermetic:** no live `spaces_*`/`creations_*` calls anywhere (no Magnific involvement in this slice
  at all); no live network call and no live-bucket dependency in `npm test` — every `upload`/`delete` in
  every `*.test.ts` goes through either `FakeMediaHost` or a stubbed `CommandRunner`. The ONE exception,
  by design, is `sips.test.ts`'s single real-`sips` invocation on a local, free, macOS-built-in tool
  with a tiny in-code PNG fixture (no network, no credits) — skipped automatically on a non-macOS
  runner. The live AWS-CLI path is proven separately, once, by the manual `smoke.ts` script — never by
  `npm test`.
- **Always-rules upheld:** generate-never-publish (hosting a JPG on an unlisted S3 URL is not
  publishing — no Channel post happens here); secrets are never printed or committed (`redact.ts` scrubs
  credential values out of thrown errors; `smoke.ts` never logs an env value; `.env` stays git-ignored
  and untouched by this slice).
