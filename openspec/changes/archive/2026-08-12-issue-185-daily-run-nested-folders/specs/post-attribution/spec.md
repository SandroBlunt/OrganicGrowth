## MODIFIED Requirements

### Requirement: /log-post refreshes the named Asset's output-bundle post.json after logging the URL

`logPostCommand` SHALL call `refreshOutputBundle(brand, ideaId, recipe, { ledgerPath })`
(`src/asset/output-bundle.ts`) right after it writes `post_url`/`posted_at` (and the advanced status)
onto the named `(idea, recipe)` Asset via `AssetStore.writeAsset`, so that Asset's `post.json` — if it
has a known local bundle directory (`asset_paths` recorded) — reflects the just-logged `post_url`/
`posted_at` immediately. This call SHALL happen only on the SUCCESS path (never for a refused attempt,
which writes nothing at all) and SHALL never alter `logPostCommand`'s own returned message text — the
refresh is a side effect proven by reading the written file, not a new substring in the command's
output. An Asset with no known local bundle directory yet (e.g. only a legacy remote `asset_url`) SHALL
be skipped cleanly by `refreshOutputBundle` itself — `logPostCommand` never fails or reports an error
because of this.

**This requires NO cadence-awareness of its own (ADR-0023, issue #185).** `refreshOutputBundle`
resolves an Asset's bundle directory from the `dirname` of its OWN recorded `asset_paths` — never by
reconstructing a directory from `format`/`run`/`cadence` — so `/log-post` works IDENTICALLY whether
that Asset's bundle happens to sit at a flat weekly path or a nested daily one (ADR-0023's week +
weekday leaf); the shape of the directory the recorded `asset_paths` happen to point into is
irrelevant to this command.

#### Scenario: Logging a Post refreshes that Asset's post.json with the new URL and posted_at

- **GIVEN** a `produced` Asset whose `asset_paths` point into a known local bundle directory
- **WHEN** `logPostCommand(brand, ideaId, recipe, url, postedAt, options)` succeeds
- **THEN** that directory's `post.json` now carries the given `post_url` and `posted_at`

#### Scenario: With two Assets, only the NAMED Recipe's post.json is refreshed

- **GIVEN** an Idea with a `produced` Asset for `character-explainer-with-cast` and another `produced`
  Asset for `carousel`, each with its own bundle directory
- **WHEN** `/log-post` is run naming only `character-explainer-with-cast`
- **THEN** only that Recipe's `post.json` reflects the new `post_url` — the `carousel` Asset's
  `post.json` (if any) is untouched

#### Scenario: An Asset with no local bundle directory yet never fails the command

- **GIVEN** a `produced` Asset with no `asset_paths` recorded (only a legacy `asset_url`)
- **WHEN** `logPostCommand` succeeds in writing `post_url`/`posted_at` to the ledger
- **THEN** the command still returns its normal success message — the output-bundle refresh is skipped
  cleanly, never surfaced as an error

#### Scenario: /log-post works unchanged against an Asset whose bundle sits in a nested daily-Run directory (issue #185 AC4)

- **GIVEN** a `produced` Asset whose `asset_paths` point into a NESTED daily-Run bundle directory
  (`ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/idea-NN.<recipe>.output/`)
- **WHEN** `logPostCommand(brand, ideaId, recipe, url, postedAt, options)` succeeds
- **THEN** that Asset's status advances to `"posted"`
- **AND** the SAME nested directory's `post.json` now carries the given `post_url`/`posted_at`
