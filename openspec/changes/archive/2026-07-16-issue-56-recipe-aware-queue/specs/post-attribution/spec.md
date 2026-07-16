## ADDED Requirements

### Requirement: /log-post attributes a Post to exactly one (Idea, Recipe) Asset, never inferred

`/log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]` SHALL require `<recipe>` as an
explicit, non-optional argument naming WHICH of the Idea's Assets (one per chosen Recipe — ADR-0009,
ADR-0011) the Post belongs to. The command SHALL match `<recipe>` EXACTLY against the Idea's recorded
Assets (`findAsset`) and SHALL REFUSE — never guessing, never defaulting to "the only Asset" even when
the Idea has exactly one — when no Asset's `recipe` equals `<recipe>`. On refusal it SHALL list every
one of the Idea's actual Assets (`recipe` + `status`) so the Operator can correct the call. This is the
`(Idea, Recipe)`-keyed attribution ADR-0011 anticipates (always-rules #5: explicit attribution).

#### Scenario: A recipe matching no Asset refuses and lists the Idea's actual Assets

- **GIVEN** an Idea with two Assets — `character-explainer-with-cast` and `carousel`
- **WHEN** `/log-post <brand> <idea-id> not-a-real-recipe <url>` is run
- **THEN** the command refuses, writes nothing to the ledger, and its message lists both
  `character-explainer-with-cast` and `carousel` with their statuses

#### Scenario: Even with exactly one Asset, a mismatched recipe still refuses

- **GIVEN** an Idea with exactly ONE recorded Asset (`character-explainer-with-cast`)
- **WHEN** `/log-post <brand> <idea-id> wrong-recipe <url>` is run
- **THEN** the command refuses rather than assuming the Operator meant the one existing Asset

#### Scenario: With two Assets, the Post lands on exactly the named Recipe's Asset

- **GIVEN** an Idea with Assets for `character-explainer-with-cast` (produced) and `carousel`
  (produced)
- **WHEN** `/log-post <brand> <idea-id> character-explainer-with-cast <url>` is run
- **THEN** `post_url`/`posted_at` are written onto the `character-explainer-with-cast` Asset only
- **AND** the `carousel` Asset's `post_url` remains unset

### Requirement: A logged Post advances a produced Asset to posted, and never regresses it

`/log-post` SHALL refuse when the named Recipe's Asset is not yet `produced` (still `queued` or
`in_production` — there is nothing to publish yet). On success it SHALL write `post_url` and
`posted_at` (the given `[posted-at]` argument, or the current time) onto that Asset, advancing a
`produced` Asset to `posted`. An Asset already `posted`, `tracking`, or `scored` SHALL keep its own
status on a re-log (correcting the URL/timestamp never regresses production/tracking progress). The
URL SHALL be validated as a `facebook.com` (or `*.facebook.com`) permalink; anything else SHALL be
refused.

#### Scenario: A produced Asset advances to posted

- **GIVEN** an Idea's Asset with `status: "produced"`
- **WHEN** `/log-post` is run with a valid `facebook.com` URL and that Asset's Recipe
- **THEN** the Asset's status becomes `"posted"` and carries the given `post_url`/`posted_at`

#### Scenario: An Asset that is not yet produced refuses

- **GIVEN** an Idea's Asset with `status: "queued"` or `"in_production"`
- **WHEN** `/log-post` is run naming that Asset's Recipe
- **THEN** the command refuses — there is nothing to publish yet — and writes nothing

#### Scenario: A non-facebook.com URL is refused

- **GIVEN** a produced Asset and a URL whose host is not `facebook.com`/`*.facebook.com`
- **WHEN** `/log-post` is run with that URL
- **THEN** the command refuses and writes nothing

#### Scenario: Re-logging an already-posted Asset updates fields without regressing status

- **GIVEN** an Idea's Asset already `status: "scored"` with a logged Post
- **WHEN** `/log-post` is run again for the same `(Idea, Recipe)` with a corrected URL
- **THEN** the Asset's `post_url` updates but its status remains `"scored"`

### Requirement: /log-post is Brand-explicit and writes only through AssetStore

`<brand>` SHALL be a required first argument (never a silent default Brand, issue #20). All writes
SHALL go through `AssetStore.writeAsset`, scoped to the named Brand's `data/brands/<slug>/ledger.json`
and to exactly the one targeted `(idea, recipe)` Asset — every sibling Idea and every sibling Asset of
the same Idea SHALL be left byte-for-byte untouched. A refused attempt SHALL leave the ledger file
byte-for-byte unchanged.

#### Scenario: A refusal never touches the ledger file

- **GIVEN** a ledger file and a `/log-post` call that will be refused (unknown recipe, bad URL, or
  not-yet-produced)
- **WHEN** the command runs
- **THEN** the ledger file's bytes on disk are unchanged before and after the call

#### Scenario: A write for one Brand never touches another Brand's ledger

- **GIVEN** two Brands, each with their own ledger, sharing an identical Idea id
- **WHEN** `/log-post` is run for one Brand naming that shared Idea id
- **THEN** only that Brand's ledger file is written; the other Brand's ledger is untouched
