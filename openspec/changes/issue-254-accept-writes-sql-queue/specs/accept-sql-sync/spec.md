## ADDED Requirements

### Requirement: syncAcceptToSql creates the Idea row, per-Recipe Asset rows, and one queued job per Recipe in SQL

`src/production-queue/sql-sync.ts`'s `syncAcceptToSql(ideaId, recipes, { db, brand, ledgerPath, now })` SHALL, for the FILE LEDGER Idea named by `ideaId`, ensure a SQL `idea` row exists and is `accepted` (creating its Brand's Format/Run rows on demand when not already present), then for EACH entry in `recipes` upsert a `queued` Asset and enqueue one `job` row UNLESS a job already exists for that `(brand, idea, recipe)` composite — every write performed through `src/command-surface/` (`createIdea`, `recordReviewDecision`, `saveAsset`, `enqueueJob`, `createRun`), never a store directly.

#### Scenario: A brand-new accepted Idea gets an Idea row, one Asset per Recipe, and one queued job per Recipe

- **GIVEN** a ledger Idea `idea-01`, `accepted`, with a readable Brief, requesting Recipes `news-carousel` and `character-explainer-with-cast`, and its Brand/Format already committed in SQL
- **WHEN** `syncAcceptToSql("idea-01", ["news-carousel", "character-explainer-with-cast"], { db, brand, ledgerPath })` is called
- **THEN** a new `idea` row exists with `status: 'accepted'`, `hook_type`/`theme` both `'unclassified'`, and `source_urls_json` populated from the Brief's `## Source(s)` section; each Recipe has exactly one `asset` row at `status: 'queued'`; each Recipe has exactly one `job` row at `status: 'queued'`, the News Carousel job carrying no `gate` and the Character Explainer job carrying `gate: 'cast'`

#### Scenario: A brand-new Run is created on demand, never assumed to already exist

- **GIVEN** a ledger Idea whose `run` names a Run with no existing SQL `run` row for its Format
- **WHEN** `syncAcceptToSql` is called for that Idea
- **THEN** a new `run` row is created for that `(format_id, run_key)`, inheriting the Format's own `cadence`, and the new Idea row references it

### Requirement: Idea identity is resolved by (run, title) — a re-accept never duplicates the Idea or its jobs

`syncAcceptToSql` SHALL resolve whether a SQL `idea` row already represents the given ledger Idea by looking up `(run_id, title)` — the `idea` table carries no column correlating a row back to the file ledger's own id. A second call for the SAME ledger Idea, whether from a genuine re-accept or from an EARLIER write (this ticket's own, or the one-shot importer's, sharing the same title within the same Run) SHALL reuse that existing row rather than creating a duplicate, and SHALL NOT re-run `recordReviewDecision` against an Idea that is no longer `suggested`. Per-Recipe job idempotency SHALL be enforced by checking `job-claim-store`'s `listJobsForComposite(db, brandId, ideaId, recipe)` before every `enqueueJob` call — never relying on `job.idempotency_key`'s uniqueness, since that column carries no `UNIQUE` constraint; the idempotency key is still recorded (`"<brand>::<legacy-idea-id>::<recipe>"`) as provenance.

#### Scenario: Calling syncAcceptToSql twice for the same ledger Idea does not duplicate the Idea row or its job

- **GIVEN** `syncAcceptToSql` has already been called once for ledger Idea `idea-01` and Recipe `news-carousel`
- **WHEN** it is called again for the SAME `(ideaId, recipe)`
- **THEN** the returned `ideaId` is identical to the first call's, `ideaCreated` is `false`, the Recipe's job outcome is `synced: false`, and exactly one `idea` row and one `job` row exist for that composite

#### Scenario: A re-accept of an Idea the one-shot importer already carried reuses that row, never duplicating its job

- **GIVEN** an `idea`/`asset`/`job` row already committed (through the command surface, exactly as `src/importer/execute.ts` would) for a title matching a ledger Idea's own `(run, title)`
- **WHEN** `syncAcceptToSql` is called for that SAME ledger Idea and Recipe
- **THEN** it resolves to the pre-existing `idea` row (`ideaCreated: false`), and the Recipe's job outcome is `synced: false` — exactly one `idea` row and one `job` row exist for that composite, both unchanged

### Requirement: A failure to resolve the Brand, Format, or Brief a sync needs throws loudly, never silently

`syncAcceptToSql` SHALL throw a clear, named error — never swallow a failure or report success while doing nothing — when the Brand row is missing, when the Idea's Format row is missing, when the ledger Idea carries no `run`/`format`, or when its Brief cannot be read from any candidate path. No `idea`/`asset`/`job` row SHALL be written for a call that throws before completing.

#### Scenario: A missing Brand row fails loudly, naming the slug

- **GIVEN** a migrated, empty database with no `brand` row for the accept flow's Brand slug
- **WHEN** `syncAcceptToSql` is called
- **THEN** it throws an `Error` whose message names the missing Brand slug, and no `idea` row is created

#### Scenario: A missing Format row fails loudly, naming the Brand and Format

- **GIVEN** a Brand row exists in SQL, but no `format` row for the Idea's own Format slug
- **WHEN** `syncAcceptToSql` is called
- **THEN** it throws an `Error` naming both the Brand slug and the Format slug, and no `idea` row is created
