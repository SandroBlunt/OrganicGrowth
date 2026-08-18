## ADDED Requirements

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
