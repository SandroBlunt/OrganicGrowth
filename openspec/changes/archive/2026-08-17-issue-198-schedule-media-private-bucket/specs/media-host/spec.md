## MODIFIED Requirements

### Requirement: The Media Host port models convert, upload, and delete — nothing more

`MediaHostPort` (`src/media-host/port.ts`) SHALL expose exactly three operations:
`convertToJpg(sourcePath, destPath)`, `upload(localPath, key, options)` (resolving to `{ url }`), and
`delete(key)`. `upload`'s `options` SHALL be a REQUIRED `UploadOptions` carrying a REQUIRED
`expiresInSeconds: number` — there is no silent default, mirroring every other explicit,
no-silent-default seam in this codebase. `upload`'s resolved `url` SHALL be a SIGNED, TEMPORARY direct
link, valid only until `expiresInSeconds` has elapsed — NEVER a permanent public link (issue #198: the
bucket is private). A FAKE implementation (`FakeMediaHost`) and a live implementation (`LiveMediaHost`)
SHALL both satisfy this same interface, so a caller can be written once against the port and injected
with either at the composition root. The port itself SHALL NOT judge whether a given `key` string is
"guessable" — that responsibility belongs to the caller (`src/schedule-batch/media-key.ts`'s
`scheduleMediaKey`, which requires an unguessable token — see the ADDED Requirement below).

#### Scenario: LiveMediaHost satisfies the MediaHostPort interface

- **GIVEN** a `LiveMediaHost` constructed with a stubbed command runner
- **WHEN** it is assigned to a variable typed `MediaHostPort`
- **THEN** the assignment type-checks and every one of `convertToJpg`/`upload`/`delete` can be called,
  `upload` requiring `{ expiresInSeconds }`

### Requirement: The in-memory fake records every call for downstream assertion

`FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`) SHALL record every `convertToJpg`,
`upload`, and `delete` call it receives, in call order, with that call's exact arguments — including
`upload`'s `expiresInSeconds` — on public arrays (`convertCalls`, `uploadCalls`, `deleteCalls`) a
downstream test can assert on directly — no hidden state, no real file I/O, no network. `upload` SHALL
validate `expiresInSeconds` via the SAME `assertValidExpiresInSeconds`
(`src/media-host/aws-presign-limit.ts`) the live adapter uses, throwing BEFORE recording the call on an
out-of-range value — so a test that passes an invalid expiry fails exactly like production would. It
SHALL also expose `isHosted(key)` reflecting the net effect of every `upload`/`delete` call so far, and
SHALL support independent failure-injection flags (`failConverts`, `failUploads`, `failDeletes`) that
each throw on their respective operation — AFTER recording the attempted call — so a downstream test can
prove both the happy path and a failure path without touching a real command.

#### Scenario: A downstream test asserts on the fake's recorded calls directly

- **GIVEN** a `FakeMediaHost`
- **WHEN** `convertToJpg`, then `upload` (with `{ expiresInSeconds: 3600 }`), then `delete` are each
  called once
- **THEN** `convertCalls`, `uploadCalls`, and `deleteCalls` each contain exactly one entry with the
  exact arguments passed, including the given `expiresInSeconds` on the `uploadCalls` entry

#### Scenario: The fake rejects an expiresInSeconds outside AWS's own ceiling, before recording the call

- **GIVEN** a `FakeMediaHost`
- **WHEN** `upload` is called with `expiresInSeconds: 0` or one second more than
  `MAX_PRESIGN_SECONDS`
- **THEN** the call rejects
- **AND** no entry is added to `uploadCalls`

#### Scenario: A failure-injection flag throws after recording the attempted call

- **GIVEN** a `FakeMediaHost` constructed with `failUploads: true`
- **WHEN** `upload` is called with a valid `expiresInSeconds`
- **THEN** the call rejects
- **AND** the attempted call still appears in `uploadCalls`
- **AND** `isHosted` for that key remains `false`

#### Scenario: Deleting an already-gone key is not an error

- **GIVEN** a `FakeMediaHost` with a key that was never uploaded (or already deleted)
- **WHEN** `delete` is called for that key
- **THEN** the call resolves without throwing

### Requirement: The live adapter converts via sips and uploads/deletes via the AWS CLI, never printing a credential

`LiveMediaHost` (`src/media-host/live/adapter.ts`) SHALL implement `convertToJpg` by shelling out to
macOS's `sips` (`-s format jpeg <source> --out <dest>`), unchanged. `upload` SHALL shell out to the AWS
CLI TWICE, in order: `aws s3 cp ... --region <region> --content-type image/jpeg` (never passing an
object ACL — the object inherits the bucket's own, private-by-default access), THEN
`aws s3 presign s3://<bucket>/<key> --region <region> --expires-in <expiresInSeconds>`, returning that
second call's trimmed stdout as the resolved `url`. Both calls SHALL be validated (key ends `.jpg`,
`expiresInSeconds` within AWS's own SigV4 ceiling) BEFORE either command runs. `delete` SHALL shell out
to `aws s3 rm ... --region <region>`, unchanged. Credentials for the AWS CLI SHALL come from `.env` when
present (`loadEffectiveEnv`), merged so that `.env` fills a credential gap ONLY where the base
environment does not already define it — an already-exported shell/CI credential always wins, and when
`.env` defines nothing relevant, the AWS CLI's own default credential chain applies exactly as if `.env`
had never been read. No AWS credential VALUE SHALL ever appear in a command's argv, in this port's own
log output, or (via `redactSecrets`) in a thrown command error's message.

#### Scenario: upload shells cp then presign, in that order, and never passes an object ACL

- **GIVEN** `LiveMediaHost` with a stubbed command runner and a bucket/region config
- **WHEN** `upload(localPath, key, { expiresInSeconds })` is called
- **THEN** the runner is FIRST invoked with `aws`, `["s3","cp",localPath,"s3://<bucket>/<key>",
  "--region","<region>","--content-type","image/jpeg"]`
- **AND** no argument in that call contains the word "acl"
- **AND** the runner is THEN invoked with `aws`, `["s3","presign","s3://<bucket>/<key>","--region",
  "<region>","--expires-in","<expiresInSeconds>"]`
- **AND** the resolved `url` equals the presign call's trimmed stdout

#### Scenario: presignViaAwsCli rejects a bad key or an out-of-range expiry WITHOUT invoking the runner

- **GIVEN** `presignViaAwsCli` with a stubbed command runner
- **WHEN** called with a key not ending `.jpg`, or an `expiresInSeconds` beyond
  `MAX_PRESIGN_SECONDS`
- **THEN** the call rejects
- **AND** the stubbed runner was never invoked

#### Scenario: A presign call returning empty stdout is a clear, named error

- **GIVEN** `presignViaAwsCli` with a stubbed runner that resolves empty stdout
- **WHEN** it is called with a valid key and expiry
- **THEN** the call rejects, naming that no URL was returned

#### Scenario: delete shells the exact aws s3 rm argv

- **GIVEN** `LiveMediaHost` with a stubbed command runner
- **WHEN** `delete(key)` is called
- **THEN** the runner is invoked with `aws`, `["s3","rm","s3://<bucket>/<key>","--region","<region>"]`

#### Scenario: .env fills a credential gap without overriding an already-set var

- **GIVEN** a temp `.env` fixture setting `AWS_ACCESS_KEY_ID`, and a base env that does NOT already set it
- **WHEN** `LiveMediaHost.upload` resolves its env (no preset env given) and calls the stubbed runner
- **THEN** BOTH the `cp` and `presign` calls receive `AWS_ACCESS_KEY_ID` from that `.env` fixture, the
  SAME resolved env object reused for both

#### Scenario: An already-set credential is never overridden by .env

- **GIVEN** a temp `.env` fixture setting `AWS_ACCESS_KEY_ID` to one value, and a base env that already
  sets `AWS_ACCESS_KEY_ID` to a DIFFERENT value
- **WHEN** the effective env is resolved
- **THEN** the base env's value wins — the `.env` value is discarded

#### Scenario: A thrown AWS CLI error never leaks a credential value

- **GIVEN** a stubbed runner that throws an error whose message embeds the exact `AWS_SECRET_ACCESS_KEY`
  value in the given env
- **WHEN** `uploadViaAwsCli` (or `deleteViaAwsCli`) is called with that env
- **THEN** the rejection's error message does NOT contain the raw secret value
- **AND** it contains `[REDACTED]` in its place

### Requirement: The build is hermetic — no npm test run makes a live AWS CLI call or a network request

Every test in `src/media-host/**` SHALL exercise the port through either `FakeMediaHost` or a stubbed
`CommandRunner` — with exactly ONE documented exception: a single test in `sips.test.ts` that invokes the
REAL `sips` binary against a tiny, in-code PNG fixture (local, free, no network, skipped automatically on
a non-macOS runner). No test SHALL invoke the real AWS CLI, make an HTTP request, or depend on
`strawmotion-schedule-media` being reachable. The live AWS-CLI path (private upload, presign, delete
against the real bucket) SHALL be proven exactly once, manually, outside `npm test`, by
`src/media-host/live/smoke.ts` — never automatically.

#### Scenario: The full npm test run never invokes the real AWS CLI

- **GIVEN** the full `npm test` run
- **THEN** every `uploadViaAwsCli`/`presignViaAwsCli`/`deleteViaAwsCli` call anywhere in the suite is
  given a stubbed `CommandRunner` (never `execFileRunner` bound to the real `aws` binary)

#### Scenario: A manual smoke run against the live bucket proves a signed, direct, redirect-free .jpg fetch AND that an unsigned request is refused

- **GIVEN** the live `strawmotion-schedule-media` bucket (private, no public bucket policy) and working
  AWS CLI credentials carrying `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject`
- **WHEN** `src/media-host/live/smoke.ts` is run directly (`npm run media-host-smoke`)
- **THEN** it converts a fixture PNG to JPG, uploads it under an unguessable, namespaced
  `straw-motion/smoke-test/<random-token>/...` key, fetches the returned SIGNED url with
  `redirect: "manual"` and observes HTTP 200 with `Content-Type: image/jpeg`
- **AND** it fetches the SAME object's DIRECT, UNSIGNED url and observes it is REFUSED (never HTTP 200)
- **AND** it deletes the object, and observes the signed url is no longer fetchable afterward
- **AND** the bucket is left exactly as it was before the run (no test object remains)

## ADDED Requirements

### Requirement: Every hosted key folds in a fresh, unguessable token

`randomMediaKeyToken` (`src/media-host/token.ts`) SHALL return a fresh, cryptographically random,
URL-and-S3-key-safe token (base64url, no padding) on every call — reading system randomness, so it is
NEVER called from a pure deep module; only an orchestration shell mints one. `scheduleMediaKey`
(`src/schedule-batch/media-key.ts`) SHALL require a non-empty `token` argument and fold it into the
hosted key layout as `<brand>/<run>/<idea-short-name>/<token>/<slide-base-name>.jpg` — REJECTING an
empty token before building any key. Knowing the Brand, week, Idea number, and slide name alone SHALL
NOT be enough to construct a valid key: two calls with the SAME Brand/run/Idea/slide-name but a
DIFFERENT token SHALL produce two DIFFERENT keys.

#### Scenario: randomMediaKeyToken returns a non-empty, S3-key-safe, non-repeating string

- **GIVEN** `randomMediaKeyToken`
- **WHEN** it is called multiple times
- **THEN** every result matches `^[A-Za-z0-9_-]+$`, is a consistent 22 characters, and no two of 20
  consecutive calls are equal

#### Scenario: scheduleMediaKey rejects an empty token before building any key

- **GIVEN** `scheduleMediaKey`
- **WHEN** called with an empty-string `token`
- **THEN** it throws, naming the requirement for a non-empty unguessable token

#### Scenario: Knowing the Brand/run/Idea/slide-name alone is not enough to construct the key

- **GIVEN** `scheduleMediaKey` called twice with the IDENTICAL Brand, run, Idea short name, and slide
  base name, but two DIFFERENT tokens
- **WHEN** the two resulting keys are compared
- **THEN** they are different strings

### Requirement: An expiry is validated against AWS's own SigV4 ceiling before any command runs

`assertValidExpiresInSeconds` (`src/media-host/aws-presign-limit.ts`) SHALL throw unless
`expiresInSeconds` is a positive integer no greater than `MAX_PRESIGN_SECONDS` (604,800 — 7 days, AWS's
own hard SigV4 presigned-URL ceiling, the same regardless of credential type). BOTH `FakeMediaHost.upload`
and the live `uploadViaAwsCli`/`presignViaAwsCli` SHALL call this SAME function BEFORE performing any
I/O or running any command — so the two implementations can never drift on this rule, exactly like
`assertJpgKey`'s existing `.jpg`-suffix guarantee.

#### Scenario: A value within [1, MAX_PRESIGN_SECONDS] is accepted

- **GIVEN** `assertValidExpiresInSeconds`
- **WHEN** called with `1` or with exactly `MAX_PRESIGN_SECONDS`
- **THEN** it does not throw

#### Scenario: Zero, a negative value, a non-integer, or a value beyond the ceiling all throw

- **GIVEN** `assertValidExpiresInSeconds`
- **WHEN** called with `0`, a negative number, a non-integer, or `MAX_PRESIGN_SECONDS + 1`
- **THEN** it throws, naming `604800` in the ceiling-exceeded case
