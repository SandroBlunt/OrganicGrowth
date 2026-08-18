# accept-idea-command Specification

## Purpose
TBD - created by archiving change issue-254-accept-writes-sql-queue. Update Purpose after archive.
## Requirements
### Requirement: acceptIdeaCommand performs the WHOLE Gate-1 accept mutation through compiled code, never freeform prose

`src/commands/accept-idea.ts`'s `acceptIdeaCommand(brand, ideaId, chosen, declined, options)` SHALL, given the Operator's already-made Recipe decision, write the Recipe selection onto the Brand's ledger (`writeIdeaRecipeSelection`), set that Idea's `status` to `"accepted"` (`markIdeaAccepted` — a new `src/ledger/ledger.ts` function; the FIRST compiled writer of this field), and — when `chosen` is non-empty — enqueue the chosen Recipes for production via `enqueueOnAccept`. `.claude/commands/review-ideas.md`'s Gate-1 accept step SHALL instruct running this compiled command (`npm run accept-idea -- <brand> <ideaId> "<chosen-csv>" '<declined-json>'`) rather than calling `writeIdeaRecipeSelection`/`enqueueOnAccept` directly — closing the gap where the ordinary, everyday accept path had no compiled backing at all, unlike `/pick`, `/pick-cast`, and `/log-post`.

#### Scenario: An ordinary accept writes the Recipe selection and sets the Idea accepted

- **GIVEN** a `suggested` ledger Idea with a resolvable Format/Run/Brief, and the Operator's chosen Recipe `news-carousel` with no declined Recipes
- **WHEN** `acceptIdeaCommand(brand, ideaId, ["news-carousel"], [], options)` is called
- **THEN** the ledger Idea's `status` becomes `"accepted"`, its `recipes` field is `["news-carousel"]`, and `data/queue.json` gains exactly one `queued` job for `(brand, ideaId, "news-carousel")`

#### Scenario: An empty chosen-Recipe list accepts the Idea but enqueues nothing

- **GIVEN** a `suggested` ledger Idea and an empty chosen-Recipe list (the Operator declined every offered Recipe and named none to add)
- **WHEN** `acceptIdeaCommand` is called
- **THEN** the Idea's `status` becomes `"accepted"`, no job is enqueued into `data/queue.json`, and the returned message states plainly that nothing was queued yet

### Requirement: acceptIdeaCommand opens and migrates the SQL database BY DEFAULT, never depending on a caller passing one

`acceptIdeaCommand` SHALL, when at least one Recipe is chosen and no `options.db` is given, open and migrate `data/organicgrowth.db` (or `options.dbPath` when given, for testing) itself before calling `enqueueOnAccept`, so the SQL `job` table the unattended worker's `findNextQueuedJob` reads is populated through compiled code alone — never a documentation instruction an agent might skip. A database open/migrate failure SHALL degrade to file-queue-only production (surfaced plainly in the returned message, never thrown) rather than blocking the accept. A SQL SYNC failure (the database opened, but e.g. the Brand/Format row is missing) SHALL be surfaced plainly in the returned message, AFTER the file queue has already landed — never silently swallowed, never retried automatically.

#### Scenario: Accepting with only options.dbPath given (never options.db) still lands a real SQL job row

- **GIVEN** a `suggested` ledger Idea with a resolvable Format/Run/Brief, a chosen Recipe, and `options.dbPath` pointing at a throwaway SQLite file already seeded with that Brand/Format
- **WHEN** `acceptIdeaCommand` is called with `options.db` OMITTED
- **THEN** the command opens and migrates the database at `options.dbPath` itself, and the SQL `job` table at that path gains exactly one `queued` job for the chosen Recipe — provable by re-opening that SAME file independently and querying it

#### Scenario: A SQL sync failure is surfaced plainly while the ledger accept and file queue still land

- **GIVEN** a database with no Brand row for the accepting Brand
- **WHEN** `acceptIdeaCommand` is called with a chosen Recipe
- **THEN** the returned message names the SQL failure plainly, while the ledger Idea's `status` is still `"accepted"` and `data/queue.json` still gained the job

### Requirement: acceptIdeaCommand authors and self-checks each chosen Recipe's Production Spec before either queue is written (ADR-0031)

For each Recipe in `chosen`, `acceptIdeaCommand` SHALL, BEFORE calling `enqueueOnAccept` (and therefore
before anything is written to `data/queue.json` or the SQL `job` table), build a minimal Brief from the
ledger Idea's own `run`/`title`, load the Brand's banned words, and call
`src/production-spec/author-at-review.ts`'s `authorSpecForRecipe`. A Recipe whose authorship self-check
fails SHALL be reported plainly in the command's returned message (naming the Recipe and the failing
check) and SHALL be dropped from the set passed to `enqueueOnAccept` — no job SHALL ever be enqueued for
it, in either queue. The Idea's full chosen-Recipe set, as the Operator actually decided it, is still
recorded on the ledger via the unchanged `writeIdeaRecipeSelection` call regardless of any Recipe's
authorship outcome — an authorship failure is a production-readiness problem, not a change to what the
Operator chose.

#### Scenario: A well-formed News Carousel accept authors its Spec and enqueues normally

- **GIVEN** a `suggested` ledger Idea with a resolvable Format/Run/Brief, and the Operator's chosen
  Recipe `news-carousel`, with a Brand configuring no banned words
- **WHEN** `acceptIdeaCommand(brand, ideaId, ["news-carousel"], [], options)` is called
- **THEN** the returned message never mentions an authorship failure, `data/queue.json` gains exactly one
  `queued` job for `(brand, ideaId, "news-carousel")`, and (when a SQL sync succeeds) the SQL `job` table
  gains the matching row

#### Scenario: A forced banned-word violation blocks that Recipe's accept, loudly, before any queue write

- **GIVEN** a `suggested` ledger Idea whose `title` contains a word the Brand Profile configures as
  banned, and the Operator's chosen Recipe `news-carousel`
- **WHEN** `acceptIdeaCommand` is called
- **THEN** the returned message names the Recipe and the authorship failure plainly, `data/queue.json`
  gains no job for that Recipe, no SQL `job` row is created for it, and the ledger Idea's `status` is
  still `"accepted"` with `recipes` still recording the Operator's original chosen set

### Requirement: A Recipe's authored Spec is persisted through the SQL-backed writer and regenerated as the human-readable file view

Once `enqueueOnAccept` reports a successful SQL sync (`result.sql` present) for a newly-enqueued, successfully-authored Recipe, `acceptIdeaCommand` SHALL persist that Recipe's authored Spec onto its SQL
Asset row via `saveAssetSpec` (`src/command-surface/production-spec.ts`), then regenerate the on-disk
per-Idea Spec file (`ideas/<format>/<run>/idea-NN.<recipe>.spec.json`) via `refreshSpecFile` — reading the
Spec back FROM the SQL row it just wrote, never from a value only held in memory. The file's cadence
segment is resolved best-effort from the Idea's own Format (defaulting to `"weekly"` on any Format-read
problem) — a Format-file read failure degrades the FILE PATH computed, never blocks the SQL persistence
or the accept itself.

#### Scenario: The regenerated file view matches the SQL-authored Spec exactly

- **GIVEN** a successful accept of a News Carousel Recipe, with a working SQL sync
- **WHEN** `acceptIdeaCommand` finishes
- **THEN** the SQL Asset's `spec_json` and the content of the on-disk
  `ideas/<format>/<run>/idea-NN.news-carousel.spec.json` file are deep-equal — the file is a GENERATED
  VIEW of the SQL row, never a second, independently-authored copy

