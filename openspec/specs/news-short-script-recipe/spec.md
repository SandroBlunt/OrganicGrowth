# news-short-script-recipe Specification

## Purpose
TBD - created by archiving change issue-174-news-short-script-recipe. Update Purpose after archive.
## Requirements
### Requirement: The News Short Script Production Spec is an ordered beats array (issue #174)

`NewsShortScriptSpec` (`src/production-spec/news-short-script-contract.ts`) SHALL be `{ beats:
NewsShortScriptBeat[] }`, where each beat is `{ role: "hook" | "story" | "cta", text, source_url,
media_url?, show_cue }`. `role` values SHALL follow the fixed narrative shape: exactly one `"hook"`
first, exactly one `"cta"` last, at least `MIN_STORY_BEATS` `"story"` beats between them. The Spec is
media instructions only (no `post_copy` — ADR-0012; Copy is composed separately, as a title +
description).

#### Scenario: countWords counts whitespace-separated tokens, ignoring extra whitespace

- **GIVEN** a string with multiple consecutive spaces between words
- **WHEN** `countWords` is called
- **THEN** it returns the number of non-empty tokens, unaffected by the extra whitespace

### Requirement: Shot List media collection is best-effort — video preferred, a failed download never fails the job (ADR-0021, issue #174)

`collectShotListMedia` (`src/asset/shot-list-media.ts`) SHALL, for each beat in a
`NewsShortScriptSpec`, resolve its media outcome as follows, NEVER throwing:

- a beat with NO `media_url` resolves to `{ kind: "link", reason: "no_media_url" }`, referencing its
  `source_url` — no download is attempted;
- a beat WITH a `media_url` is attempted via an injectable `download` function (defaulting to
  `defaultShotListDownload`, a real `fetch`-based implementation never exercised by this Recipe's own
  tests); on success, the bytes are written to the destination directory and the beat resolves to
  `{ kind: "downloaded", filename, path }`; on ANY failure — the downloader returning `{ ok: false }` OR
  throwing — the beat resolves to `{ kind: "link", reason: "download_failed", error }`, referencing the
  `media_url` itself.

Results preserve `spec.beats`' own order. `downloadedMediaPaths` SHALL return the ordered local file
paths of every `"downloaded"` beat only, ready to feed `LedgerAssetRecord.asset_paths`.

#### Scenario: A beat with no media_url resolves to a link, referencing source_url, with no download attempted

- **GIVEN** a beat with no `media_url`
- **WHEN** `collectShotListMedia` is called
- **THEN** that beat's result is `{ kind: "link", reason: "no_media_url", url: <the beat's source_url> }`
  and the injected `download` function is never called for it

#### Scenario: A successful download is written to disk and marked downloaded

- **GIVEN** a beat with a `media_url` and a `download` function that resolves `{ ok: true, bytes, ... }`
- **WHEN** `collectShotListMedia` is called
- **THEN** that beat's result is `{ kind: "downloaded", filename, path }`, and a file exists at `path`
  containing the downloaded bytes

#### Scenario: A failed download (ok:false or a thrown error) falls back to a marked link — never fails the job

- **GIVEN** a beat with a `media_url` and a `download` function that either returns `{ ok: false, error
  }` or throws
- **WHEN** `collectShotListMedia` is called
- **THEN** the whole call resolves successfully (never rejects), and that beat's result is `{ kind:
  "link", reason: "download_failed", error, url: <the beat's media_url> }`

#### Scenario: downloadedMediaPaths returns only the downloaded beats' local paths, in beat order

- **GIVEN** a mixed set of `collectShotListMedia` results (some downloaded, some link-only)
- **WHEN** `downloadedMediaPaths` is called
- **THEN** it returns only the `"downloaded"` beats' `path` values, in the same order as `spec.beats`

### Requirement: The teleprompter script renders as a single, copy-paste-ready file; the Shot List renders as a separate manifest (issue #174)

`scriptText` (`src/asset/news-short-script-output.ts`) SHALL render a Spec's beats as ONE clean text:
each beat's `text`, in order, separated by the `NEXT_SHOT_MARKER` (`"[Next shot]"`, issue #187) — one
marker between every pair of consecutive beats, never before the first or after the last — no beat-role
labels, show cues, or URLs. The marker is a document annotation only, computed at RENDER time: it is
NEVER part of any beat's own `text` field (still only speakable words — no stage directions read aloud),
making the underlying data's already-existing 1:1 beat-to-Shot-List-entry pairing visible when reading
the file. `scriptText` SHALL skip a beat whose `text` is blank/whitespace-only, never leaving an empty
paragraph or a stray marker in its place. `shotListText` SHALL render a SEPARATE, human-readable
manifest: for each beat, its role, `show_cue`, `source_url`, its `curiosity_queries` (CONTEXT.md
"Curiosity Queries", issue #187) as a `queries: ...` line, and its collected-media outcome (a downloaded
filename, or a marked link naming why) — accepting an OPTIONAL `results` array (defaulting to `[]`,
rendering `"media: not collected"` for a beat with no matching result, never crashing).
`writeScriptText`/`writeShotListText` write these into the Asset's `.output/` bundle as `script.txt`/
`shot-list.txt` respectively, alongside the bundle's existing `caption.txt`/`post.json` (issue #112).

#### Scenario: scriptText joins every beat's text as clean paragraphs, separated by the [Next shot] marker, with no cues or URLs

- **GIVEN** a well-formed Spec of N beats
- **WHEN** `scriptText` is called
- **THEN** the result is every beat's `text`, joined by `"\n\n[Next shot]\n\n"`, containing exactly N-1
  occurrences of the marker, no beat-role labels, no `show_cue` text, no URL, and no `curiosity_queries`
  text

#### Scenario: The [Next shot] marker never appears inside any beat's own text field

- **GIVEN** a well-formed Spec
- **WHEN** each beat's own `text` field is inspected directly (not `scriptText`'s rendered output)
- **THEN** none of them contains `"[Next shot]"` — the marker is added only at render time

#### Scenario: scriptText skips a beat whose text is blank/whitespace-only, never leaving an empty paragraph or a stray marker

- **GIVEN** a Spec whose middle beat's `text` is blank/whitespace-only
- **WHEN** `scriptText` is called
- **THEN** the result contains only the non-blank beats' text, joined by exactly one marker between
  them — never two markers in a row and never a marker for the skipped beat

#### Scenario: shotListText renders each beat's role, show cue, source, Curiosity Queries, and media outcome

- **GIVEN** a Spec and its `collectShotListMedia` results
- **WHEN** `shotListText` is called
- **THEN** each beat's block names its role, `show_cue`, `source_url`, a `queries: ...` line listing its
  `curiosity_queries`, and either its downloaded filename or its link (with the reason) — a downloaded
  outcome is textually distinguishable from a link-only one

#### Scenario: shotListText never crashes when results are omitted or incomplete

- **GIVEN** a Spec and either no `results` argument or a `results` array missing an entry for some beat
- **WHEN** `shotListText` is called
- **THEN** it returns a rendered manifest whose unmatched beat(s) read `"media: not collected"` — never
  throws

