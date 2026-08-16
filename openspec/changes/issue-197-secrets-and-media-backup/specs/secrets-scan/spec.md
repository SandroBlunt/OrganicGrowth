## ADDED Requirements

### Requirement: findCredentialShapedStrings catches a long hex run standing alone as a URL path segment

`findCredentialShapedStrings(files)` (`src/secrets-scan/scanner.ts`) SHALL, for each given
`{ path, content }` file, report a `"url-path-token"` finding for every occurrence of a run of at
least `MIN_HEX_TOKEN_LENGTH` (28) consecutive hex characters (`0-9a-fA-F`) that stands alone as a URL
PATH segment — preceded by `/` immediately after a `http://`/`https://` scheme-and-host portion
containing no whitespace, quote, angle bracket, or `?`, and followed by `/`, a quote, whitespace, or
the end of the string. A hex run appearing after a `?` (a query-string value, e.g. an `asset_url`
CDN signature's `hmac=<hex>`) SHALL NEVER match, because the URL-scanning character class excludes `?`
entirely. Each finding SHALL carry the file's `path`, the 1-based `line` the match starts on, the
matched `value` (the hex run itself, never redacted at this layer), and a SHA-256 `fingerprint` of
that value (`fingerprintValue`). This function SHALL be pure — no filesystem, no `git`, no clock — and
SHALL NEVER throw, including on an empty file or an empty file list.

#### Scenario: A hex run of the calibrated minimum length or longer, as a URL path segment, is caught

- **GIVEN** file content containing `https://social-000000000.zohomcp.com/mcp/<32-hex-chars>/message`
  (a synthetic value reproducing the shape of the real incident — issue #197)
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns exactly one finding with `kind: "url-path-token"` and `value` equal to the
  32-hex-character token

#### Scenario: A token shorter than MIN_HEX_TOKEN_LENGTH is not matched

- **GIVEN** a hex run of `MIN_HEX_TOKEN_LENGTH - 1` characters as a URL path segment
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding for that occurrence

#### Scenario: A query-string HMAC signature is never matched, regardless of length

- **GIVEN** `"asset_url": "https://pikaso.cdnpk.net/private/production/123/render.png?token=exp=...~hmac=<64-hex-chars>"`
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding — the hex run follows `?`/`=`, never `/`

#### Scenario: A bare hex identifier with no surrounding URL is never matched

- **GIVEN** `"identifier": "<32-hex-chars>"` with no `http(s)://` anywhere in the file
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding

#### Scenario: A git commit SHA quoted in prose, with no URL wrapping it, is never matched

- **GIVEN** a line of prose naming a 40-character hex git commit SHA with no surrounding URL
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding

#### Scenario: A shorter CDN-style path id below the calibrated threshold is a documented false-negative

- **GIVEN** `"media_url": "https://cdn.prod.website-files.com/<24-hex-chars>/asset_image4.png"` (the
  real shape of a Webflow CDN asset id found in a tracked news-story `media_url`, reproduced here with
  a synthetic id)
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding — `MIN_HEX_TOKEN_LENGTH` (28) is calibrated with margin above this
  24-character shape and below the real 32-character incident shape

#### Scenario: Each finding is labeled with its own file path and 1-based line number

- **GIVEN** two files, each containing one matching URL, the second file's match on its second line
- **WHEN** `findCredentialShapedStrings` is called with both files
- **THEN** it returns two findings, each carrying the correct `path` and `line` for its own file

### Requirement: findCredentialShapedStrings catches a secret-shaped JSON key with a plausible live value

`findCredentialShapedStrings` SHALL ALSO report a `"named-secret-field"` finding for every
`"<key>": "<value>"` pair (matched against raw text, not a strict JSON parse) whose `key` contains,
case-insensitively, one of `token`, `secret`, `password`, `passwd`, `api[-_]?key`, `access[-_]?key`, or
`authorization`, AND whose `value` is at least 16 characters, consists only of letters/digits/`_`/`-`
(no whitespace), and does not begin with a recognized placeholder word (`your`, `replace`, `example`,
`placeholder`, `todo`, `xxxx...`, `redacted`, `changeme`/`change_me`, `insert`, `fixture`, `fake`,
`dummy`, `sample`, `test`), case-insensitively.

#### Scenario: A secret-shaped key with a plausible live value is caught

- **GIVEN** a JSON `"<key>": "<value>"` pair whose key is `api_key` and whose value is a 20-character
  token-shaped string (letters and digits only, no spaces, not placeholder-shaped) — described here
  rather than given as a literal example, so this spec's own tracked text never carries a
  credential-shaped string itself (issue #197's own self-scan test would otherwise flag this file)
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns exactly one `"named-secret-field"` finding

#### Scenario: Key-name variants all match by substring, case-insensitively

- **GIVEN** each of `token`, `access_token`, `client_secret`, `password`, `authorization`, `apiKey` as
  a key, each paired with the same plausible live value
- **WHEN** `findCredentialShapedStrings` is called for each
- **THEN** every one returns exactly one finding

#### Scenario: A placeholder-shaped value is never flagged, even under a secret-shaped key

- **GIVEN** a secret-shaped key paired with `"your-api-key-here"`, `"REPLACE_ME_TOKEN_VALUE"`, or
  `"changeme_secret_value"`
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding for any of them

#### Scenario: A short value, or a value containing a space, is never flagged even under a secret-shaped key

- **GIVEN** `{"token": "short"}` and `{"password_hint": "your favourite pet plus a number"}`
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** neither yields a finding

#### Scenario: An unrelated key name is never flagged even with a token-shaped value

- **GIVEN** a JSON pair whose key is `identifier` and whose value is the same shape of 20-character
  token described above
- **WHEN** `findCredentialShapedStrings` is called
- **THEN** it returns no finding

### Requirement: The scanner exposes deterministic fingerprinting, safe redaction, and binary-content detection

`fingerprintValue(value)` SHALL return a deterministic SHA-256 hex digest of `value` — the same input
always yields the same output, and different inputs yield different outputs. `redactSecret(value)`
SHALL NEVER return the full input value: for a value longer than 10 characters it SHALL return the
first 4 and last 4 characters joined by an ellipsis; for a value of 10 characters or fewer it SHALL
return a fixed `"[redacted]"` placeholder. `isBinaryContent(buf)` SHALL return `true` when a NUL byte
(`0x00`) appears within the first 8000 bytes of `buf`, and `false` otherwise (including for an empty
buffer) — the same heuristic Git itself uses to classify a file as binary.

#### Scenario: fingerprintValue is deterministic and collision-sensitive

- **GIVEN** the same value fingerprinted twice, and two different values each fingerprinted once
- **WHEN** `fingerprintValue` is called
- **THEN** the two calls on the same value produce identical 64-character hex digests, and the two
  different values produce different digests

#### Scenario: redactSecret never leaks the full value

- **GIVEN** a 33-character token and a 5-character value
- **WHEN** `redactSecret` is called on each
- **THEN** neither result contains the full original value; the long token redacts to its first 4 and
  last 4 characters joined by an ellipsis, and the short value redacts to `"[redacted]"`

#### Scenario: isBinaryContent detects a NUL byte and treats plain text as non-binary

- **GIVEN** a buffer containing a NUL byte within its first 8000 bytes, and a buffer of plain UTF-8
  text with no NUL byte
- **WHEN** `isBinaryContent` is called on each
- **THEN** the first returns `true` and the second returns `false`

### Requirement: The scanner enumerates and reads ONLY git-tracked files, via git ls-files — never the raw working tree

`listTrackedFiles(repoRoot)` (`src/secrets-scan/tracked-files.ts`) SHALL list every file `git`
currently tracks at `repoRoot` via `git ls-files -z`, as repo-relative paths — NEVER a file that is
untracked or `.gitignore`d, even if such a file exists on disk at `repoRoot` and carries the exact
same credential-shaped content. It SHALL return `[]` (never throw) when `repoRoot` is not a git
working tree. `readScannableFiles(repoRoot, paths)` SHALL read each named tracked file into a
`{ path, content }` pair, silently skipping (never throwing for) a file that no longer exists on disk,
binary content (`isBinaryContent`), or content larger than 5 MB. `scanRepo(repoRoot)` SHALL compose
all three (`listTrackedFiles` -> `readScannableFiles` -> `findCredentialShapedStrings`) as the one
function a caller needs to answer "does this repository's tracked content carry a credential-shaped
string right now". No function in this module SHALL exclude any file by path or directory name — every
tracked file is scanned identically.

#### Scenario: A tracked file carrying a credential-shaped string is found

- **GIVEN** a git repository whose HEAD commit tracks a file containing a credential-shaped URL
- **WHEN** `scanRepo` is called against that repository's root
- **THEN** the returned findings include that file's path

#### Scenario: An untracked file carrying the identical credential-shaped string is NOT found

- **GIVEN** the same repository, plus a second file at its working-tree root containing the identical
  credential-shaped URL but never `git add`ed
- **WHEN** `scanRepo` is called
- **THEN** the returned findings do NOT include the untracked file's path — proving the scan is driven
  by the git index, not a directory walk

#### Scenario: A .gitignore'd file carrying the identical string is also NOT found

- **GIVEN** the same repository, plus a third file matched by a committed `.gitignore` rule, also
  containing the identical credential-shaped URL
- **WHEN** `scanRepo` is called
- **THEN** the returned findings do NOT include that file's path either

#### Scenario: A non-git directory yields no tracked files, never a throw

- **GIVEN** a plain directory that is not a git working tree
- **WHEN** `listTrackedFiles` is called against it
- **THEN** it returns `[]` without throwing

#### Scenario: Binary content and a since-deleted tracked file are both skipped without throwing

- **GIVEN** a list of tracked paths including one binary file and one path that no longer exists on
  disk
- **WHEN** `readScannableFiles` is called
- **THEN** neither appears in the returned scannable files, and no error is thrown

### Requirement: The scanner is proven against the real historical incident without a credential literal ever appearing in this repository's source

A test in this repository SHALL prove `findCredentialShapedStrings` catches the ACTUAL historical
secret from the real incident (issue #197: `.agents/mcp_config.json` as committed in `bb955eb` and
`8f7c8f6`) by reading that content from git history AT TEST RUN TIME (`git show <sha>:<path>`) rather
than embedding the value as a string literal anywhere in this repository's tracked source.

#### Scenario: The scanner catches the real secret exactly as committed, for both historical commits

- **GIVEN** the real content of `.agents/mcp_config.json` as committed at `bb955eb` and, separately,
  at `8f7c8f6`, each read via `git show <sha>:.agents/mcp_config.json` at test run time
- **WHEN** `findCredentialShapedStrings` is called on each
- **THEN** each call returns at least one finding with `kind: "url-path-token"`

### Requirement: The scanner is actually WIRED as a guard against THIS repository's real, currently-tracked files, not only proven to work in isolation

A test in this repository's `npm test` suite SHALL call `scanRepo` against THIS repository's own real
root — resolved from the test file's own on-disk location (`fileURLToPath(new URL("../../",
import.meta.url))`), never from `process.cwd()` or any assumption pinned to one specific checkout path
— and SHALL assert the result is empty. This is DISTINCT from every other proof in this capability:
`scanner.test.ts` proves the pure detection logic is correct against fixtures; `tracked-files.test.ts`
proves the `git ls-files`-driven shell is correct against a disposable temp repo;
`historical-incident.test.ts` proves detection against the real incident's historical CONTENT read via
`git show`. None of those calls `scanRepo` against the CURRENT tree, so none of them alone proves the
guard is actually wired into `npm test` — this Requirement closes that gap. On a failure, the
assertion's own failure message SHALL NEVER print a caught finding's raw, un-redacted `value` — only a
`redactSecret`-redacted form — so that a real future incident is not additionally leaked into test
output/CI logs at the exact moment it is caught.

#### Scenario: The real repository's current tracked-file set has zero credential-shaped findings

- **GIVEN** this repository's own root, resolved from the test's own on-disk location
- **WHEN** `scanRepo` is called against it
- **THEN** the returned findings array is empty

#### Scenario: A credential-shaped string added to any real tracked file causes this test to fail

- **GIVEN** an already-tracked file in this repository temporarily carrying a credential-shaped string
  (e.g. a URL-path-token-shaped line appended to it)
- **WHEN** the same guard test is run against the real repository root
- **THEN** it fails, and the failure output names the file and line but shows only a REDACTED form of
  the matched value, never the value itself

#### Scenario: REPO_ROOT resolution does not depend on process.cwd() or a hardcoded checkout path

- **GIVEN** the guard test's `REPO_ROOT` constant, derived from `import.meta.url`
- **WHEN** the test suite is invoked from within a git worktree whose on-disk path differs from any
  other checkout of the same repository
- **THEN** `REPO_ROOT` resolves to THAT worktree's own root (the directory the test file's own bytes
  physically sit inside), and `scanRepo`'s underlying `git ls-files` call — run with that root as its
  working directory — resolves the worktree's tracked files correctly, exactly as it would for a
  primary checkout
