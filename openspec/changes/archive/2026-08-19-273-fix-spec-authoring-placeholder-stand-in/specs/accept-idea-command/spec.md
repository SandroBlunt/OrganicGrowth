## MODIFIED Requirements

### Requirement: acceptIdeaCommand authors and self-checks each chosen Recipe's Production Spec before either queue is written (ADR-0031)

For each Recipe in `chosen`, `acceptIdeaCommand` SHALL, BEFORE calling `enqueueOnAccept` (and therefore
before anything is written to `data/queue.json` or the SQL `job` table), build a Brief from the ledger
Idea's own `run`/`title` PLUS its REAL on-disk Brief markdown content — loaded via
`src/importer/load-brief.ts`'s `loadBrief` (trying the ledger's own `brief_path` first, when recorded)
and parsed via `src/idea/brief-content.ts`'s `parseBriefContent` (issue #273 round 2: a title-only Brief
can never yield anything but filler, however carefully checklisted, because no generator can vary its
output on content it was never given). The resulting `angle`/`talkingPoints`/`sourceUrls` SHALL be
threaded onto the `Brief`, alongside `id`/`run`/`title`. When no Brief markdown file can be found at all
(every candidate path exhausted), `acceptIdeaCommand` SHALL degrade to the title-only Brief — reporting
the missing file plainly in its returned message — rather than blocking the accept, mirroring this
command's existing "surface loudly, never block" contract for a SQL problem. `acceptIdeaCommand` SHALL
then load the Brand's banned words and call `src/production-spec/author-at-review.ts`'s
`authorSpecForRecipe`. A Recipe whose authorship self-check fails SHALL be reported plainly in the
command's returned message (naming the Recipe and the failing check) and SHALL be dropped from the set
passed to `enqueueOnAccept` — no job SHALL ever be enqueued for it, in either queue. The Idea's full
chosen-Recipe set, as the Operator actually decided it, is still recorded on the ledger via the unchanged
`writeIdeaRecipeSelection` call regardless of any Recipe's authorship outcome — an authorship failure is
a production-readiness problem, not a change to what the Operator chose.

#### Scenario: A well-formed News Carousel accept authors its Spec from the Idea's REAL Talking Points, and enqueues normally

- **GIVEN** a `suggested` ledger Idea whose real, on-disk Brief markdown carries a `## Talking Points`
  section with 4+ distinct bullets, the Operator's chosen Recipe `news-carousel`, and a Brand configuring
  no banned words
- **WHEN** `acceptIdeaCommand(brand, ideaId, ["news-carousel"], [], options)` is called
- **THEN** the returned message never mentions an authorship failure, the persisted Spec's non-"hook"
  slides draw their `text` from those real Talking Points (never the bare title repeated on every slide),
  `data/queue.json` gains exactly one `queued` job for `(brand, ideaId, "news-carousel")`, and (when a
  SQL sync succeeds) the SQL `job` table gains the matching row

#### Scenario: A forced banned-word violation blocks that Recipe's accept, loudly, before any queue write

- **GIVEN** a `suggested` ledger Idea whose `title` contains a word the Brand Profile configures as
  banned, and the Operator's chosen Recipe `news-carousel`
- **WHEN** `acceptIdeaCommand` is called
- **THEN** the returned message names the Recipe and the authorship failure plainly, `data/queue.json`
  gains no job for that Recipe, no SQL `job` row is created for it, and the ledger Idea's `status` is
  still `"accepted"` with `recipes` still recording the Operator's original chosen set

#### Scenario: A missing Brief markdown file degrades to the title-only Brief, reported plainly, never blocking the accept

- **GIVEN** a `suggested` ledger Idea whose `brief_path` (and every reconstructed candidate) points at a
  file that does not exist
- **WHEN** `acceptIdeaCommand` is called
- **THEN** the returned message names the missing Brief file plainly, and authorship proceeds from the
  title-only Brief — succeeding or failing on its own merits (the widened checklist's own rules); the
  missing file is never itself a block on the accept
