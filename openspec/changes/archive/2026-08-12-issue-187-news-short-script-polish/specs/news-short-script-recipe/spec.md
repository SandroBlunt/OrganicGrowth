## MODIFIED Requirements

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
