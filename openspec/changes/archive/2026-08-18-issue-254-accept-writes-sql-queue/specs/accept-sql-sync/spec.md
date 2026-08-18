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

### Requirement: Idea identity is resolved by idea.legacy_ref (migration 5), falling back to an ambiguity-refusing (run_id, title) lookup for a pre-migration-5 row — two Ideas sharing a title never collide, and a pre-migration-5 row is reconciled, never duplicated

`syncAcceptToSql` SHALL FIRST resolve whether a SQL `idea` row already represents the given ledger Idea by looking up `(brand_id, legacy_ref)` via `getIdeaByLegacyRef` (`src/idea/store.ts`), where `legacy_ref` is the file ledger's own Idea id (e.g. `"idea-05"`) — the real, stable, per-Brand-unique identifier already carried everywhere in this system (`/log-post`, `/pick`, the whole attribution chain). `createIdea` SHALL stamp `legacyRef: ideaId` on every Idea row this module creates. A SECOND call for the SAME ledger Idea that this lookup FINDS, whether from a genuine re-accept or from an EARLIER write sharing the same `legacy_ref` (this ticket's own, or the one-shot importer's — `src/importer/execute.ts` stamps its own `ideaPlan.legacyId` as `legacyRef`), SHALL reuse that existing row rather than creating a duplicate, and SHALL NOT re-run `recordReviewDecision` against an Idea that is no longer `suggested`. WHEN this lookup finds NOTHING (an Idea row created before migration 5, carrying `legacy_ref IS NULL` — every one of the real, committed database's 61 imported Ideas), `syncAcceptToSql` SHALL fall back to `listUnclaimedIdeasForRunByTitle(db, runId, title)` (the SAME `(run_id, title)` natural key this ticket's own Round 1 used as its primary lookup, scoped to rows where `legacy_ref IS NULL`): EXACTLY ONE match SHALL be ADOPTED (`claimLegacyRef` stamps `legacyRef: ideaId` onto that row, in place, reusing it rather than creating a duplicate); MORE THAN ONE match SHALL cause `syncAcceptToSql` to THROW, naming the ambiguity, rather than guessing which row is the given ledger Idea; NO match SHALL fall through to creating a brand-new row, exactly as when no legacy row exists at all. TWO DIFFERENT ledger Ideas that happen to share an identical `title` SHALL NEVER be treated as the same SQL Idea — each SHALL get its own Idea row, its own per-Recipe Asset row(s), and its own `job` row(s), because identity is resolved by `legacy_ref` (direct or fallback-adopted), never by `title` alone. The schema itself backstops the direct case: a partial `UNIQUE (brand_id, legacy_ref) WHERE legacy_ref IS NOT NULL` index means a genuine collision (the same `legacy_ref` written twice for the same Brand) throws a real `SQLITE_CONSTRAINT` error rather than silently succeeding twice. Per-Recipe job idempotency SHALL be enforced by checking `job-claim-store`'s `listJobsForComposite(db, brandId, ideaId, recipe)` before every `enqueueJob` call, backstopped by a partial `UNIQUE (job.idempotency_key) WHERE idempotency_key IS NOT NULL` schema index (migration 5) that closes the cross-process race a read-then-write application check alone cannot — the idempotency key itself is still recorded (`"<brand>::<legacy-idea-id>::<recipe>"`) as provenance. Each per-Recipe job outcome SHALL carry a `reason` of `"created"` (a brand-new job row was made this call) or `"already-queued"` (a job already existed for this EXACT composite — a legitimate dedupe, never a dropped write) alongside its `synced` boolean, so the two meanings `synced: false` could otherwise conflate are always distinguishable.

#### Scenario: Calling syncAcceptToSql twice for the same ledger Idea does not duplicate the Idea row or its job

- **GIVEN** `syncAcceptToSql` has already been called once for ledger Idea `idea-01` and Recipe `news-carousel`
- **WHEN** it is called again for the SAME `(ideaId, recipe)`
- **THEN** the returned `ideaId` is identical to the first call's, `ideaCreated` is `false`, the Recipe's job outcome is `{ synced: false, reason: "already-queued" }`, and exactly one `idea` row and one `job` row exist for that composite

#### Scenario: A re-accept of an Idea the one-shot importer already carried reuses that row, never duplicating its job

- **GIVEN** an `idea`/`asset`/`job` row already committed (through the command surface, exactly as `src/importer/execute.ts` would) carrying the SAME `legacy_ref` as a ledger Idea's own id
- **WHEN** `syncAcceptToSql` is called for that SAME ledger Idea and Recipe
- **THEN** it resolves to the pre-existing `idea` row (`ideaCreated: false`), and the Recipe's job outcome is `{ synced: false, reason: "already-queued" }` — exactly one `idea` row and one `job` row exist for that composite, both unchanged

#### Scenario: Two DIFFERENT accepted Ideas sharing an IDENTICAL title each get their own Idea/Asset/Job row — never silently merged

- **GIVEN** two genuinely distinct ledger Ideas, `idea-01` and `idea-02`, in the SAME Run, sharing the EXACT SAME `title`, but with different Briefs
- **WHEN** `syncAcceptToSql` is called for `idea-01`, then separately for `idea-02`, each for Recipe `news-carousel`
- **THEN** the two calls resolve to two DIFFERENT `ideaId`s, each with `ideaCreated: true`, each Recipe's job outcome is `{ synced: true, reason: "created" }`, and exactly TWO `idea` rows and TWO `job` rows exist — `idea-02` is never merged into `idea-01`'s SQL identity

#### Scenario: A pre-migration-5 row (legacy_ref IS NULL) sharing the ledger Idea's (run, title) is ADOPTED on re-sync, never duplicated

- **GIVEN** a SQL `idea` row created BEFORE migration 5 existed, carrying no `legacy_ref`, in the SAME Run and with the SAME `title` as a ledger Idea `idea-01`
- **WHEN** `syncAcceptToSql` is called for `idea-01`
- **THEN** `getIdeaByLegacyRef` finds nothing, `listUnclaimedIdeasForRunByTitle` finds exactly this one row, that row is stamped with `legacyRef: "idea-01"` and reused (`ideaCreated: false`) — exactly ONE `idea` row exists, both before and after the call
- **AND** a SECOND, later call for the SAME ledger Idea `idea-01` resolves via the fast `getIdeaByLegacyRef` path directly, without needing the fallback again

#### Scenario: Two or more unclaimed pre-migration-5 rows sharing the SAME (run, title) is genuine ambiguity — syncAcceptToSql refuses loudly rather than guessing

- **GIVEN** TWO SQL `idea` rows, both created BEFORE migration 5, both carrying no `legacy_ref`, in the SAME Run, sharing the EXACT SAME `title`
- **WHEN** `syncAcceptToSql` is called for a ledger Idea whose `title` matches both rows
- **THEN** it throws an `Error` naming the ambiguity (how many rows matched, the Run, and the title) — neither row is claimed, no third `idea` row is created, and both original rows are left exactly as they were

#### Scenario: A second createIdea call with the SAME (brand, legacy_ref) throws a real, loud SQLITE_CONSTRAINT error

- **GIVEN** an `idea` row already committed with `legacy_ref: "idea-01"` for a given Brand
- **WHEN** `createIdea` is called again for the SAME Brand with `legacyRef: "idea-01"` (bypassing `findExistingIdea`'s own lookup, e.g. a bug or a race)
- **THEN** the call throws a `SQLITE_CONSTRAINT` error and no second `idea` row is created — the schema itself is the backstop, not merely application discipline

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
