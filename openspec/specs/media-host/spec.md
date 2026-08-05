# media-host Specification

## Purpose
TBD - created by archiving change issue-144-media-host-port. Update Purpose after archive.
## Requirements
### Requirement: The Media Host port models convert, upload, and delete — nothing more

`MediaHostPort` (`src/media-host/port.ts`) SHALL expose exactly three operations:
`convertToJpg(sourcePath, destPath)`, `upload(localPath, key)` (resolving to `{ url }`), and
`delete(key)`. A FAKE implementation (`FakeMediaHost`) and a live implementation (`LiveMediaHost`) SHALL
both satisfy this same interface, so a caller can be written once against the port and injected with
either at the composition root.

#### Scenario: LiveMediaHost satisfies the MediaHostPort interface

- **GIVEN** a `LiveMediaHost` constructed with a stubbed command runner
- **WHEN** it is assigned to a variable typed `MediaHostPort`
- **THEN** the assignment type-checks and every one of `convertToJpg`/`upload`/`delete` can be called

### Requirement: Every hosted key — and therefore every returned URL — ends in a lowercase .jpg

Both `FakeMediaHost.upload` and the live `uploadViaAwsCli` SHALL reject (throwing, without performing
any I/O or running any command) a `key` that does not end in `.jpg`, via the ONE shared
`assertJpgKey` function (`src/media-host/key.ts`) — so the two implementations can never drift on this
rule. A successful `upload`'s returned `url` SHALL therefore always end `.jpg` too.

#### Scenario: The fake rejects a non-.jpg upload key and does not record it

- **GIVEN** a `FakeMediaHost`
- **WHEN** `upload` is called with a key ending `.png`
- **THEN** the call rejects, naming `.jpg` in the error
- **AND** the rejected call does NOT appear in `uploadCalls`

#### Scenario: The live adapter rejects a non-.jpg upload key without invoking the AWS CLI

- **GIVEN** `uploadViaAwsCli` with a stubbed command runner
- **WHEN** called with a key ending `.png`
- **THEN** the call rejects, naming `.jpg` in the error
- **AND** the stubbed runner was never invoked

### Requirement: convertToJpg never rewrites the source PNG in place

The live `convertPngToJpgViaSips` SHALL throw — WITHOUT running `sips` — whenever `destPath` resolves to
the same file as `sourcePath` (comparing resolved absolute paths, so a differently-spelled same path is
still caught). On success, the source file at `sourcePath` SHALL be left byte-for-byte unchanged; only a
brand-new file is written at `destPath`.

#### Scenario: An in-place conversion attempt is refused without touching sips

- **GIVEN** `convertPngToJpgViaSips` with a stubbed command runner
- **WHEN** called with `destPath` equal to `sourcePath`
- **THEN** the call rejects, mentioning that the original must stay untouched
- **AND** the stubbed runner was never invoked

#### Scenario: A real sips conversion leaves the source PNG byte-for-byte unchanged

- **GIVEN** a real, tiny, valid PNG fixture on disk in a temp directory
- **WHEN** `convertPngToJpgViaSips` converts it to a new JPG path via the REAL `sips` binary (skipped,
  not failed, on a non-macOS runner)
- **THEN** the new file's bytes start with the JPEG magic bytes `FF D8 FF`
- **AND** the source PNG's bytes on disk afterward are identical to what was written before conversion

### Requirement: The in-memory fake records every call for downstream assertion

`FakeMediaHost` (`src/media-host/fixtures/fake-media-host.ts`) SHALL record every `convertToJpg`,
`upload`, and `delete` call it receives, in call order, with that call's exact arguments, on public
arrays (`convertCalls`, `uploadCalls`, `deleteCalls`) a downstream test can assert on directly — no
hidden state, no real file I/O, no network. It SHALL also expose `isHosted(key)` reflecting the net
effect of every `upload`/`delete` call so far, and SHALL support independent failure-injection flags
(`failConverts`, `failUploads`, `failDeletes`) that each throw on their respective operation — AFTER
recording the attempted call — so a downstream test can prove both the happy path and a failure path
without touching a real command.

#### Scenario: A downstream test asserts on the fake's recorded calls directly

- **GIVEN** a `FakeMediaHost`
- **WHEN** `convertToJpg`, then `upload`, then `delete` are each called once
- **THEN** `convertCalls`, `uploadCalls`, and `deleteCalls` each contain exactly one entry with the
  exact arguments passed

#### Scenario: A failure-injection flag throws after recording the attempted call

- **GIVEN** a `FakeMediaHost` constructed with `failUploads: true`
- **WHEN** `upload` is called
- **THEN** the call rejects
- **AND** the attempted call still appears in `uploadCalls`
- **AND** `isHosted` for that key remains `false`

#### Scenario: Deleting an already-gone key is not an error

- **GIVEN** a `FakeMediaHost` with a key that was never uploaded (or already deleted)
- **WHEN** `delete` is called for that key
- **THEN** the call resolves without throwing

### Requirement: The live adapter converts via sips and uploads/deletes via the AWS CLI, never printing a credential

`LiveMediaHost` (`src/media-host/live/adapter.ts`) SHALL implement `convertToJpg` by shelling out to
macOS's `sips` (`-s format jpeg <source> --out <dest>`) and `upload`/`delete` by shelling out to the AWS
CLI (`aws s3 cp ... --region <region> --content-type image/jpeg` / `aws s3 rm ... --region <region>`),
via the injected `CommandRunner` seam — no new npm dependency is introduced to do this. Credentials for
the AWS CLI SHALL come from `.env` when present (`loadEffectiveEnv`), merged so that `.env` fills a
credential gap ONLY where the base environment does not already define it — an already-exported
shell/CI credential always wins, and when `.env` defines nothing relevant, the AWS CLI's own default
credential chain applies exactly as if `.env` had never been read. No AWS credential VALUE SHALL ever
appear in a command's argv, in this port's own log output, or (via `redactSecrets`) in a thrown command
error's message.

#### Scenario: upload shells the exact aws s3 cp argv and never passes an object ACL

- **GIVEN** `LiveMediaHost` with a stubbed command runner and a bucket/region config
- **WHEN** `upload(localPath, key)` is called
- **THEN** the runner is invoked with `aws`, `["s3","cp",localPath,"s3://<bucket>/<key>","--region",
  "<region>","--content-type","image/jpeg"]`
- **AND** no argument contains the word "acl"

#### Scenario: delete shells the exact aws s3 rm argv

- **GIVEN** `LiveMediaHost` with a stubbed command runner
- **WHEN** `delete(key)` is called
- **THEN** the runner is invoked with `aws`, `["s3","rm","s3://<bucket>/<key>","--region","<region>"]`

#### Scenario: .env fills a credential gap without overriding an already-set var

- **GIVEN** a temp `.env` fixture setting `AWS_ACCESS_KEY_ID`, and a base env that does NOT already set it
- **WHEN** `LiveMediaHost.upload` resolves its env (no preset env given) and calls the stubbed runner
- **THEN** the runner receives `AWS_ACCESS_KEY_ID` from that `.env` fixture

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
`strawmotion-schedule-media` being reachable. The live AWS-CLI path (upload + delete against the real
bucket) SHALL be proven exactly once, manually, outside `npm test`, by `src/media-host/live/smoke.ts` —
never automatically.

#### Scenario: The full npm test run never invokes the real AWS CLI

- **GIVEN** the full `npm test` run
- **THEN** every `uploadViaAwsCli`/`deleteViaAwsCli` call anywhere in the suite is given a stubbed
  `CommandRunner` (never `execFileRunner` bound to the real `aws` binary)

#### Scenario: A manual smoke run against the live bucket proves a public, direct, redirect-free .jpg fetch

- **GIVEN** the live `strawmotion-schedule-media` bucket and working AWS CLI credentials
- **WHEN** `src/media-host/live/smoke.ts` is run directly (`npm run media-host-smoke`)
- **THEN** it converts a fixture PNG to JPG, uploads it under a namespaced `straw-motion/smoke-test/...`
  key, fetches the returned URL with `redirect: "manual"` and observes HTTP 200 with
  `Content-Type: image/jpeg`, deletes the object, and observes the URL is no longer fetchable afterward
- **AND** the bucket is left exactly as it was before the run (no test object remains)

