## ADDED Requirements

### Requirement: BRIEF_CLASSIFICATIONS is the single, hand-read source of the 51 readable Briefs' classifications, matched by content hash

`src/hook-theme-backfill/classifications.ts`'s `BRIEF_CLASSIFICATIONS` SHALL hold exactly one entry per
readable Brief — the 51 (of the 61 total) Briefs carrying a `## Hook concept`/`## Hook Concept` heading —
and SHALL NOT include an entry for any of the 10 headingless MundoTip Briefs (issue #219's own
`unclassified` default already correctly describes those; this module has nothing to add for them).
Each entry SHALL be one of two kinds: `"classified"` (carrying `hookType`, `theme`, `hookTypeSource`,
`themeSource`, and a plain-English `rationale` naming the hook text or Brief-wide reading that justifies
it) or `"reported"` (carrying only a `reason`, for a Brief whose hook text genuinely fits no closed
vocabulary member — never forced into the nearest term). Every `"classified"` entry's `hookType`/`theme`
SHALL be a real, closed-vocabulary member, and SHALL NEVER be `"unclassified"` — assigning that value is
the importer's job (issue #204/#219), not this classifier's.

Each entry SHALL carry `briefSha256`, the SHA-256 of the exact Brief content
`src/importer/load-brief.ts` reads (`sha256(Buffer.from(content, "utf8"))`) — the SAME string a
committed `idea.brief` holds verbatim. This is the ONE key `planBackfill` matches an existing Idea
against; a legacy folder path or title is never used for matching, since either can be reused or
reshaped across Runs/Brands in ways a Brief's actual content is not.

#### Scenario: BRIEF_CLASSIFICATIONS carries exactly 51 entries

- **GIVEN** `BRIEF_CLASSIFICATIONS`
- **WHEN** its length is read
- **THEN** it is exactly `51`

#### Scenario: every classified entry's briefSha256 matches the real Brief file on disk

- **GIVEN** every `"classified"` entry in `BRIEF_CLASSIFICATIONS`
- **WHEN** the real Brief file at its recorded `briefPath` is read and SHA-256 hashed
- **THEN** the computed hash equals the entry's own `briefSha256`, for every entry — proving this data
  has not drifted from the real, current content of the Briefs it classifies

#### Scenario: no entry classifies a headingless Brief

- **GIVEN** the 10 real MundoTip Briefs with neither a hook heading nor a `format` field
- **WHEN** each one's real content hash is checked against `BRIEF_CLASSIFICATIONS`
- **THEN** none of the 10 hashes appears in the list

### Requirement: planBackfill decides one of four outcomes per Idea, matched by brief content hash, and never forces a vocabulary mismatch

`src/hook-theme-backfill/backfill.ts`'s `planBackfill(existingIdeas, entries)` SHALL be pure (no disk,
network, clock, or database) and SHALL decide, for every Idea in `existingIdeas`, exactly one of four
outcomes, by hashing that Idea's `brief` and looking up the result in `entries`:

- **`toUpdate`**: the brief hash matches a `"classified"` entry, and the Idea's CURRENT `hookType`/
  `theme`/`hookTypeSource`/`themeSource` differ from what that entry specifies.
- **`alreadyCorrect`**: the brief hash matches a `"classified"` entry, and the Idea ALREADY carries
  exactly those values — a no-op, never re-planned as a write.
- **`reported`**: the brief hash matches a `"reported"` entry — a genuine vocabulary mismatch. This
  outcome SHALL NEVER appear in `toUpdate`; no write is ever planned for it.
- **`noEntry`**: the brief hash matches NOTHING in `entries` — the expected outcome for a headingless
  Brief, or any Idea this classification data does not (yet) cover.

#### Scenario: an unclassified Idea whose brief matches a classified entry is planned as an update

- **GIVEN** an Idea at `hookType: "unclassified"` whose `brief` hashes to a `"classified"` entry's
  `briefSha256`
- **WHEN** `planBackfill` is called
- **THEN** that Idea appears in `toUpdate`, with `after` equal to the entry's `hookType`/`theme`/
  `hookTypeSource`/`themeSource`

#### Scenario: an Idea already carrying the desired values is alreadyCorrect, not toUpdate

- **GIVEN** an Idea already carrying exactly the `hookType`/`theme`/`hookTypeSource`/`themeSource` a
  matching `"classified"` entry specifies
- **WHEN** `planBackfill` is called
- **THEN** that Idea appears in `alreadyCorrect`, and does NOT appear in `toUpdate` — this is what makes
  a second run against an already-backfilled database report zero updates

#### Scenario: an Idea whose brief matches a reported entry is surfaced as reported, never forced into the nearest term

- **GIVEN** an Idea whose `brief` hashes to a `"reported"` entry's `briefSha256`
- **WHEN** `planBackfill` is called
- **THEN** that Idea appears in `reported` (carrying the entry's `reason`), and does NOT appear in
  `toUpdate` under any circumstance

#### Scenario: an Idea whose brief matches nothing is noEntry, and is left completely untouched

- **GIVEN** an Idea whose `brief` hashes to a value absent from `entries` (e.g. one of the 10 headingless
  Briefs)
- **WHEN** `planBackfill` is called
- **THEN** that Idea appears in `noEntry`, and does NOT appear in `toUpdate`, `alreadyCorrect`, or
  `reported`

### Requirement: the backfill orchestration shell writes only through IdeaStore's classifyIdea, is re-runnable, and its report states what changed plus final per-category counts

`src/commands/backfill-hook-theme.ts`'s `backfillHookTheme(db, options)` SHALL read every committed Idea
(`IdeaStore.listAllIdeas`), plan against `planBackfill`, and apply every `toUpdate` action by calling the
typed command surface's `classifyIdea` (`src/command-surface/index.ts`) — NEVER a store or raw SQL
directly. It SHALL return the full `BackfillPlan` plus a rendered Markdown report
(`formatBackfillReport`) stating: how many Ideas were updated, already correct, reported, or had no
matching entry; every updated Idea's before -> after values; every reported Idea's reason; and the FINAL
(post-run) count of every Idea currently at each `hook_type` and each `theme` — the concrete counts issue
#206's own acceptance criterion asks to be "posted on this issue."

Because `planBackfill` already treats an Idea at its desired state as `alreadyCorrect` rather than
`toUpdate`, calling `backfillHookTheme` a second time against an already-backfilled database SHALL apply
zero `classifyIdea` writes and report zero updated.

#### Scenario: a real backfill run classifies a matching Idea through classifyIdea, never a direct store write

- **GIVEN** a committed Idea whose `brief` matches a `"classified"` entry, and `hookType:
  "unclassified"`
- **WHEN** `backfillHookTheme(db)` is called
- **THEN** the Idea's `hookType`/`theme`/`hookTypeSource`/`themeSource` are updated to the entry's
  values, readable back by `getIdea`, and the returned report names that Idea as updated

#### Scenario: a second run against an already-backfilled database updates nothing

- **GIVEN** a database `backfillHookTheme` has already been run against once, with no Idea or
  classification data changed since
- **WHEN** `backfillHookTheme(db)` is called again
- **THEN** the returned plan's `toUpdate` is empty, and every previously-updated Idea's
  `alreadyCorrect` reflects the SAME values as before — no `classifyIdea` call is made

#### Scenario: the report states the final per-hook-type and per-theme counts across every Idea, not just the ones this run touched

- **GIVEN** a database with several Ideas already correctly classified from a PRIOR run, plus one new
  Idea this run updates
- **WHEN** `backfillHookTheme(db)` is called
- **THEN** the report's counts include every one of those Ideas' CURRENT `hook_type`/`theme` — the
  prior run's Ideas plus this run's newly-updated one — not merely the Ideas this particular call wrote
