## 1. The port + its shared invariant (test-first)

- [x] 1.1 Write failing tests (`media-host/key.test.ts`): `assertJpgKey` accepts a `.jpg`-ending key,
  rejects `.png`/no-extension/uppercase `.JPG`/empty, and names the offending key in its error.
- [x] 1.2 Implement `assertJpgKey` (`media-host/key.ts`) and the `MediaHostPort`/`UploadResult`
  interfaces (`media-host/port.ts`).

## 2. The in-memory FAKE (test-first, issue #144 AC1)

- [x] 2.1 Write failing tests (`media-host/fixtures/fake-media-host.test.ts`): every
  `convertToJpg`/`upload`/`delete` call is recorded in order with its exact arguments; `upload` returns
  a URL ending in the uploaded `.jpg` key under a configurable `baseUrl`; `upload` rejects a non-`.jpg`
  key and does not record it; `isHosted` reflects upload-then-delete; deleting an already-gone key is
  not an error; each `failConverts`/`failUploads`/`failDeletes` flag throws while still recording the
  attempted call.
- [x] 2.2 Implement `FakeMediaHost` (`media-host/fixtures/fake-media-host.ts`).

## 3. The tiny PNG fixture builder (test-first, zero new dependencies)

- [x] 3.1 Write failing tests (`media-host/fixtures/tiny-png.test.ts`): `buildTinyPngBuffer` starts with
  the PNG signature, ends with an `IEND` chunk, and is deterministic; `writeTinyPng` writes those exact
  bytes to disk.
- [x] 3.2 Implement `buildTinyPngBuffer`/`writeTinyPng` (`media-host/fixtures/tiny-png.ts`) using
  `node:zlib` only (a hand-rolled CRC-32, no new dependency, no binary fixture file).

## 4. The command-runner seam (test-first)

- [x] 4.1 Write failing tests (`media-host/live/command-runner.test.ts`) against the REAL
  `execFileRunner`, run against the Node binary itself (a local process, never the network): resolves
  with stdout/stderr on exit 0; rejects with a `MediaHostCommandError` carrying stdout/stderr on a
  non-zero exit and when the command does not exist; passes a given `env` through to the child process.
- [x] 4.2 Implement `CommandRunner`/`CommandResult`/`CommandOptions`/`MediaHostCommandError`/
  `execFileRunner` (`media-host/live/command-runner.ts`).

## 5. Credential redaction + the `.env` loader (test-first)

- [x] 5.1 Write failing tests (`media-host/live/redact.test.ts`): `redactSecrets` replaces every
  occurrence of one or several secret values with `[REDACTED]`, ignores `undefined`/short (<4 char)
  values, and is a no-op on text with no match.
- [x] 5.2 Implement `redactSecrets` (`media-host/live/redact.ts`).
- [x] 5.3 Write failing tests (`media-host/live/env.test.ts`): `parseDotEnv` handles `KEY=VALUE`,
  comments/blank lines, `export`, quoted values, whitespace, an `=` inside a value, and malformed lines;
  `loadDotEnvFile` reads a real temp file and returns `{}` (never throws) when missing;
  `loadEffectiveEnv` fills a gap from `.env`, never overrides an already-set base var, passes the base
  through unchanged when `.env` is missing, and defaults `base` to `process.env`.
- [x] 5.4 Implement `parseDotEnv`/`loadDotEnvFile`/`loadEffectiveEnv` (`media-host/live/env.ts`).

## 6. The `sips` adapter (test-first, issue #144 AC2 — one REAL invocation)

- [x] 6.1 Write failing tests (`media-host/live/sips.test.ts`) against a STUBBED runner: the exact
  `-s format jpeg <src> --out <dest>` argv; a custom `sipsCommand` override; refuses (WITHOUT invoking
  the runner) when `destPath` resolves to the same file as `sourcePath`, including a differently-spelled
  same path.
- [x] 6.2 Write ONE failing test that really invokes `sips` on the tiny PNG fixture in a temp dir: the
  output is a real JPG (magic bytes `FF D8 FF`), and the source PNG is confirmed byte-for-byte
  unchanged afterward. Skipped (not failed) on any non-macOS runner.
- [x] 6.3 Implement `convertPngToJpgViaSips` (`media-host/live/sips.ts`).

## 7. The S3 (AWS CLI) adapter (test-first, issue #144 AC2/AC3)

- [x] 7.1 Write failing tests (`media-host/live/s3.test.ts`) against a STUBBED runner:
  `publicJpgUrl` builds the exact virtual-hosted-style URL and rejects a non-`.jpg` key;
  `uploadViaAwsCli` builds the exact `aws s3 cp ... --region ... --content-type image/jpeg` argv (never
  an `--acl` flag), rejects a non-`.jpg` key WITHOUT invoking the runner, honors an `awsCommand`
  override, passes the given `env` through untouched, and REDACTS an AWS credential value out of a
  thrown command error's message; `deleteViaAwsCli` builds the exact `aws s3 rm ... --region ...` argv
  and redacts too.
- [x] 7.2 Implement `publicJpgUrl`/`uploadViaAwsCli`/`deleteViaAwsCli` (`media-host/live/s3.ts`),
  consulting Amazon's official agent skills for AWS (github.com/aws/agent-toolkit-for-aws) first —
  confirming no object ACL is needed against a bucket whose OWN policy already grants public
  `GetObject`.

## 8. The composed live adapter (test-first)

- [x] 8.1 Write failing tests (`media-host/live/adapter.test.ts`) against a stubbed runner:
  `LiveMediaHost` satisfies `MediaHostPort`; `convertToJpg`/`upload`/`delete` each delegate with the
  exact argv proven in tasks 6–7; a PRESET `env` is used verbatim (no `.env` load); without a preset,
  `.env` is lazily loaded (merged under `process.env`) on first use, via a temp `.env` fixture; when
  `.env` is missing, the resolved env still carries `process.env` through unchanged; the env is resolved
  ONCE and reused across `upload` + `delete`.
- [x] 8.2 Implement `LiveMediaHost` (`media-host/live/adapter.ts`), composing `sips.ts` + `s3.ts` +
  `env.ts` behind `MediaHostPort`.

## 9. The manual live smoke (issue #144 AC3 — run once for real, not part of `npm test`)

- [x] 9.1 Write `media-host/live/smoke.ts` (+ `npm run media-host-smoke`): convert the tiny fixture PNG
  via `sips`, upload under a namespaced `straw-motion/smoke-test/<timestamp>.jpg` key, fetch the
  returned URL with `redirect: "manual"` and assert HTTP 200 + `Content-Type: image/jpeg`, delete the
  object, confirm a subsequent fetch is no longer 200, and best-effort-clean-up on any failure between
  upload and delete. Never logs a credential value.
- [x] 9.2 RUN it for real against the live `strawmotion-schedule-media` bucket; record the actual result
  (status codes, the fetched URL, bucket-empty confirmation) in the Build Report.

## 10. OpenSpec

- [x] 10.1 Author `proposal.md`, this `tasks.md`, and the spec delta: ADDED `media-host`.
- [x] 10.2 `npx openspec validate issue-144-media-host-port --strict` green.

## 11. Self-review

- [x] 11.1 `npm test` green (type-check + full suite, every pre-slice test still passing plus every new
  one this slice adds); `npm run build` green (`tsconfig.build.json` type-checks `smoke.ts` too, since
  it is excluded only from the test glob, not from the build); `npm run test:docs` green (unchanged).
- [x] 11.2 Simplify / dead-code pass; confirm every issue #144 acceptance criterion maps to a named
  test; confirm `src/space-driver/**`/`src/commands/**`/`src/asset/**`/`src/ledger/**`/`data/**` are
  byte-for-byte untouched.
- [x] 11.3 Write the Build Report into `handoff.md`, explicitly flagging that NO test uses the Magnific
  fake or any live Magnific call (this slice has nothing to do with Magnific), and recording the manual
  smoke's actual live result.
