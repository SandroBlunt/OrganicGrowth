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

