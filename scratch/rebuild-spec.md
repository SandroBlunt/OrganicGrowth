> **Source:** synthesised from the *OrganicGrowth Rebuild* review artifact (`claude.ai/code/artifact/cdc2ba8a-bdd6-4a77-85f0-5632cf5e2f81`) plus a verification pass over this repo on 2026-08-16. This is the **epic** — the tracking issue for the whole rebuild. Slices come out of it via `/to-issues` → `/build-issue`, the same way `#120`, `#140` and `#176` worked.

> **Operator decisions already taken** (2026-08-16, do not re-litigate):
> 1. Scope = the whole rebuild, phases 00–06, as one epic.
> 2. **Local SQL first, not a hosted service.** SQLite living in `data/`, driven in-process by Node. No API server, no cloud Postgres, no multi-tenant tables.
> 3. **The UI is a local HTML viewer**, not a web app.
> 4. **Post becomes its own entity** — reverses ADR-0011's declined split. Needs a superseding ADR.
> 5. **Import everything, both Brands**, including MundoTip's pre-Format Idea shape.

---

## Problem Statement

The Operator cannot answer the three questions the whole system exists to serve:

1. *"What were my top 5 Assets by Performance Score, and what did their Production Specs have in common?"*
2. *"Show me every Idea that used hook-type X."*
3. *"How well did Fit Score predict Performance?"*

None of the three is answerable today, and two are unanswerable **by construction**:

- **Nothing has ever been measured.** Across both Brands there are 54 Assets, 7 with a `post_url`, and **0 with a Performance Score**. Both Brands' Channel baselines are still `updated_at: null`. Verified in both ledgers.
- **The Fit Score's Relevance term is dead.** Relevance is worth ~50% of the score and is defined as "how much does this resemble what worked before". With no measured history it falls back to a neutral `0.5` on every single Idea — 31 Ideas record exactly that in their own `fit_basis`. So ranking runs on novelty and voice-fit alone, with **no memory of what worked**.
- **Hook type does not exist as data.** It lives as free prose inside 61 Brief markdown files under two different heading spellings. Answering question 2 means an agent re-reading 61 files and inventing a category scheme on the spot — a different answer every time it is asked.
- **`/report` takes one Brand and prints fixed text.** There is no query surface. Joining a ledger Asset to its Production Spec today requires parsing filenames, because spec files carry no `id`, `brand` or `recipe` field.

Underneath that sit five structural faults that make the situation worse every week:

- **The engine is built, tested, and never called.** `src/space-driver/driver.ts`, `src/production-queue/scheduler.ts`, the Phase Contract auditors and the Zoho scheduling functions are all real, typed and covered. `driver.ts` has **no production caller** — the only non-test import is a type import in `recipe/registry.ts`. What actually runs the pipeline is ~6,600 lines of English instruction telling a model to perform the same sequence by hand. Proof it has never run: `data/queue.json` holds 66 jobs whose statuses are only `queued` (3) and `done` (63) — never `running`, never `awaiting_pick`, including for the gated *Character Explainer with Cast* Recipe, which is not a path the scheduler can produce.
- **Concurrent sessions silently destroy each other's work.** Every ledger write is read-whole-file → mutate-in-memory → write-whole-file. Two sessions on this folder (which is the Operator's documented working style) means the later save silently discards the earlier one. The `lock` field that was supposed to guard this is stored *inside the file being raced on*, and has additionally gone missing from `data/queue.json` entirely — a commit removed it and the tolerant parser has been silently inventing a replacement on every read ever since.
- **Canonical records are welded to one laptop.** The ledgers hold **191 absolute paths** beginning `/Users/CaxtonTaylor/Developer/OrganicGrowth/...`, mixed with relative ones — two conventions inside the same records. Eight point at files that no longer exist.
- **Shapes have drifted with nothing to stop them.** Two Brands, two ledger shapes; within Straw Motion alone, three Idea shapes, three ID schemes and four folder layouts. TypeScript types vanish at runtime, so loaders quietly drop malformed records with a warning and coerce missing fields to null. No file carries a version stamp, `updated_at`, or an etag — and none can be backfilled.
- **Nothing runs the tests.** There is no `.github` directory and no hooks. The 30 currently-failing doc-conformance checks — the mechanism that has actually caught documentation drift — are excluded from `npm test` and have been red for days without anyone seeing.

Three of those faults are one-way doors and get more expensive daily:

- `.agents/mcp_config.json` is **tracked in git** and its Zoho Social MCP URL carries a 32-character credential in the path. It is on local `main` and not yet pushed. **Pushing publishes it.**
- `data/` is 813 MB, of which only ~71 MB is in git — and **not one of the 267 media paths recorded in the ledger is among the tracked bytes**. Every finished carousel and rendered clip exists in exactly one place, with no backup and no history. The S3 copies are not a backup either: the cleanup routine deletes them by design after the Zoho handoff.
- Media uploaded for Zoho scheduling is public-read under fully guessable keys (`straw-motion/2026-W32/idea-01/0-hook.jpg` — public Brand slug, ISO week, sequential Idea number, fixed slide-name vocabulary). Listing is blocked, but with keys this predictable listing is unnecessary. Files stay up from export until a day after the scheduled time, so the entire unpublished content calendar is readable for its whole lead time.

## Solution

Finish ADR-0014 rather than design a migration from scratch. ADR-0014 already says: put every entity behind a typed store, give everything a stable id, so that swapping the backing storage later is "one new adapter behind the same stores". That is precisely this work. Four of its five named stores exist in substance; the one genuinely never built is **Idea** — which is exactly where agents hand-edit JSON today and exactly the entity all three questions are about.

Build, in this order:

1. **Stop the bleeding.** Rotate the Zoho credential, back up the 742 MB, close the public S3 bucket, stand up CI over the tests that already exist, and delete one of the two duplicated agent trees.
2. **Close the measurement loop on what already exists**, before any schema work. Write the Apify client, track the 7 posted Assets, and get real numbers into the system for the first time in its life. A database full of empty scores solves nothing.
3. **One local SQLite database** shaped from `CONTEXT.md`, which is already a real domain document — the schema below is largely a transcription of it. Every entity gets a surrogate id, an `updated_at` and a version stamp. Media stays on local disk; the database holds a **root-relative storage key**, never an absolute path.
4. **The store layer swaps its backing from files to SQL in place.** Each store keeps its name and its operations and swaps the one option it already takes — `{ ledgerPath }` becomes `{ db }`. Callers above the stores do not change shape.
5. **The worker** — the missing engine. A local process that drains the Production Queue by calling the `driver.ts` and `scheduler.ts` that already exist, behind the `SpaceMcpPort` that already exists. This is where the pipeline stops being a model performing a sequence by hand.
6. **A local HTML viewer** over the database — the Library screen that does not exist today and is the entire point. Filter by hook type, sort by Performance Score, compare prediction against outcome.
7. **The agents stop touching storage** and call the typed command surface instead. This is simultaneously what makes them safe to run unattended and what makes them shippable to someone else, because an agent that calls `listTrends` and `createIdea` works identically against any installation.
8. **Publish the agent catalogue** — 11 model-prompting Skills are near-shippable today; 5 pipeline agents follow once the command surface is stable.

Two changes make the three questions answerable, and neither is a schema detail:

- **Hook type and theme become real fields on `idea`**, filled in when the Brief is written. Without this, question 2 stays impossible in the new system too.
- **Performance becomes a time series** (`post` → `metric_snapshot` → `performance_score`), not a single field. `CONTEXT.md` already says Performance is "a moving number, not a snapshot" — the file model only ever had one slot for it.

## User Stories

**Safety and recovery (phase 00)**

1. As the Operator, I want the Zoho credential out of tracked files and rotated, so that pushing `main` does not publish a working credential to GitHub.
2. As the Operator, I want every MCP credential read from an untracked local config or the environment, so that no future migration commit can re-commit one.
3. As the Operator, I want the 742 MB of produced media copied somewhere durable before any migration begins, so that a failed import cannot destroy the only copy of a year's output.
4. As the Operator, I want the Zoho media bucket off public-read and its keys unguessable, so that a competitor cannot read my unpublished content calendar during its lead time.
5. As the Operator, I want hosted schedule media served by signed, expiring links, so that access ends when the schedule does.
6. As a maintainer, I want CI to run `npm test` and `npm run test:docs` on every push, so that a red suite is visible without me typing the command.
7. As a maintainer, I want the 30 failing doc-conformance checks read as a recovery inventory before they are fixed, so that the ~7,300 words of command documentation deleted in the Antigravity commit are recovered rather than papered over.
8. As a maintainer, I want exactly one agent-definition tree, so that two copies cannot disagree about which model runs the Producer.
9. As a maintainer, I want the dangling `.claude/` pointers repaired, so that the Producer can load a Recipe Skill at all under Claude Code.

**Closing the measurement loop (phase 01)**

10. As the Operator, I want a real Apify client behind the existing `PerformanceScrapePort`, so that Performance tracking runs without an agent driving the scrape by hand.
11. As the Operator, I want the Facebook metric mapping verified against one live scrape before any score is trusted, so that my primary Channel is not the one platform whose mapping was never checked.
12. As the Operator, I want my 7 posted Assets scraped and scored, so that the system holds real Performance data for the first time.
13. As the Operator, I want each Channel's baseline computed from those results, so that Performance Score is relative to my own Channel rather than to a starter value.
14. As the Operator, I want to see that a Fit Score prediction and a Performance outcome now exist on the same Asset, so that I have proof the loop can close before I invest in the schema.

**The database and the import (phase 02)**

15. As the Operator, I want one local SQLite database holding every entity in `CONTEXT.md`, so that my history is queryable in one place instead of spread across four folder layouts.
16. As the Operator, I want every Idea, Asset, Post and job to carry a stable surrogate id, so that renaming a folder or a Recipe cannot orphan a record.
17. As the Operator, I want `hook_type` and `theme` as real fields on an Idea, so that "show me every Idea that used hook-type X" is one query instead of an agent's guess.
18. As the Operator, I want my 61 existing Briefs classified for hook type and theme as a one-off job, so that the Library is useful from day one rather than from the next Run onward.
19. As the Operator, I want an Idea to record its own `relevance`, `momentum` and `brand_fit` components alongside `fit_score`, so that I can see *why* a prediction was wrong, not just that it was.
20. As the Operator, I want Trends to record their source URLs and a `is_paywalled` flag, so that the openly-readable-source rule is enforced by data rather than by prose.
21. As the Operator, I want Performance stored as dated snapshots per Post, so that I can watch a post climb and re-score it later without losing history.
22. As the Operator, I want a Post to be its own record keyed to an Asset and a Channel, so that one Asset can be published to more than one Channel and each result measured separately.
23. As the Operator, I want media referenced by a root-relative storage key, so that moving the folder or handing the repo to someone else does not break 191 references.
24. As the Operator, I want every record to carry `created_at`, `updated_at` and a schema version, so that a future migration can tell what shape it is reading.
25. As the Operator, I want the importer to read through the existing loaders rather than raw JSON, so that the database agrees with what my own code believes the data means.
26. As the Operator, I want the importer to **refuse and report** on anything it cannot parse, never to drop it with a warning, so that a paid-for Asset cannot vanish silently during a one-shot migration.
27. As the Operator, I want the import rehearsable against a copy of `data/` and re-runnable from scratch, so that a bad run costs an afternoon rather than the archive.
28. As the Operator, I want both Brands imported — including MundoTip's pre-Format Idea shape and Straw Motion's three ID schemes and four folder layouts — so that no history is left behind.
29. As the Operator, I want the importer to report the 12 duplicate job identity keys and the 8 dead media paths explicitly, so that I decide what happens to each rather than the importer deciding for me.
30. As the Operator, I want a written reconciliation after the import — counts in versus counts out, per entity — so that I can prove nothing was lost before I trust the database.

**The store layer (phase 02)**

31. As a maintainer, I want each existing store to keep its name and operations and swap only its backing option, so that the change is a substitution rather than a rewrite of every caller.
32. As a maintainer, I want an `IdeaStore` — the one ADR-0014 store never built — so that Idea creation and Review stop being hand-edited JSON.
33. As a maintainer, I want all direct `node:fs` access in production code routed through a store or a port, so that the store boundary is real rather than nominal.
34. As a maintainer, I want writes to run in transactions with real row-level locking, so that two concurrent sessions cannot silently discard each other's work.
35. As a maintainer, I want jobs claimed by a real lock with an owner and an expiry rather than a field inside the contended file, so that a crashed worker's job becomes claimable again instead of stuck.

**The worker (phase 03)**

36. As the Operator, I want a live adapter behind the existing `SpaceMcpPort`, so that the tested Space driver finally drives the real Space.
37. As the Operator, I want a worker process that drains the Production Queue by calling the existing scheduler and driver, so that Assets are produced without me sitting in a session.
38. As the Operator, I want the worker to start with the *News Carousel* Recipe, so that the first thing to run unattended is the zero-gate Recipe I run most.
39. As the Operator, I want a job to move through `queued → running → done`, and to park at `awaiting_pick` when its Recipe declares a gate, so that queue state describes what actually happened.
40. As the Operator, I want a parked job never to hold the Space, so that the worker advances the next job while I decide a pick.
41. As the Operator, I want each phase self-audited against its Phase Contract before advancing, so that a broken shape or a banned word stops the job rather than reaching an Asset.
42. As the Operator, I want the Magnific write-size limit modelled explicitly in code and verified against the live API, so that a ~17 KB carousel Spec does not fail against an unmodelled 4,000-character cap.
43. As the Operator, I want failed jobs retried with a recorded attempt count and a terminal failure state, so that a transient Space error does not need me to notice it.
44. As the Operator, I want scheduling to reserve its key, call Zoho, then confirm, so that a crash mid-call cannot cause a re-run to double-post publicly.
45. As a maintainer, I want the macOS-only `sips` shell-out replaced behind the existing `MediaHostPort`, so that the worker is not pinned to this machine.

**The local viewer (phase 04)**

46. As the Operator, I want a local HTML Library over the database, so that I can browse everything I have made without a terminal.
47. As the Operator, I want to sort Assets by Performance Score and filter by hook type, theme, Recipe and Format, so that question 1 and question 2 are answered by clicking.
48. As the Operator, I want Fit Score plotted against Performance Score, so that question 3 is answered on sight and I can see when my predictions were wrong.
49. As the Operator, I want an Asset's page to show its Production Spec, its media, its Copy variants, its Post URLs and its metric history together, so that "what did the winners have in common" is a readable comparison.
50. As the Operator, I want Run and queue state visible, so that I can see what is produced, parked or failed without reading JSON.
51. As the Operator, I want the viewer to be read-only, so that it cannot become a second uncontrolled writer alongside the stores.

**The agents (phase 05)**

52. As the Operator, I want each agent given typed commands instead of file paths, so that its behaviour does not depend on my folder layout.
53. As the Operator, I want no agent holding a blanket `Bash` grant, so that its declared tool list is an actual boundary.
54. As the Operator, I want the ~129 prose citations of TypeScript module paths rewritten to name commands, so that the agent instructions stop drifting from the code.
55. As the Operator, I want the doc-conformance checks kept in lockstep during that rewrite, so that the rules I have accumulated over months are not quietly dropped.
56. As the Operator, I want my editorial rules — source verification, the primary-source discipline, brand-safety, the anti-rhetoric caption rules — preserved verbatim through the rewrite, because that judgement is the product.

**The catalogue (phase 06)**

57. As a licensee, I want to install a model-prompting Skill and have it work without my own brand baked in, so that the catalogue entry is genuinely reusable.
58. As a licensee, I want each entry to declare name, version, licence, owner, purpose, the entities it reads and writes, its tools, its model and fallbacks, its config and its evals, so that I can judge and verify it before running it.
59. As the Operator, I want the 129 dangling links to the missing shared reference folder recovered before anything ships, so that a licensee does not install a half-imported Skill.
60. As the Operator, I want a licence file in the repo, so that publishing is legally coherent.

## Implementation Decisions

### Architecture and hosting

- **Local-first, single-process, no service.** SQLite in `data/`, opened in-process by Node. There is no HTTP API, no server, no container and no cloud database in this epic. The "API" the review artifact describes is realised here as a **typed in-process command surface** — plain exported TypeScript functions over the stores — which is the only thing permitted to write.
- **No multi-tenancy.** The review's `account`, `user` and `connection` tables are deliberately not built. The schema is shaped so they can be added later without reshaping `brand`, but a single-Operator local installation does not need them.
- **Media stays on local disk.** The database holds a root-relative `storage_key` plus `mime`, `bytes` and `checksum`. The media root is configuration. Absolute paths are rejected at the store boundary, not merely discouraged. This keeps the object-storage swap available later behind the same key without doing it now.
- **A superseding ADR is required for the Post split**, reversing ADR-0011's declined separate-Post decision. A second ADR records the move from files to local SQL, superseding ADR-0014's "canonical state in files" while keeping its store-boundary principle, which this work fulfils rather than abandons.
- **`CONTEXT.md` is the source for the schema, with one correction**: it states two Recipes are wired. The registry wires three — `character-explainer-with-cast`, `news-carousel`, `news-short-script`. Trust the registry.

### Schema

Tenancy and configuration: `brand` (slug, name, timezone, banned words, required CTA, required hashtags, watermark handle, media root), `channel` (brand, platform, url, handle, `is_primary`, `is_tracked`), `format` (brand, slug, name, voice, cadence, `ideas_per_run`, `source_mode`, sources, `default_recipes`), `baseline_prompt` (format, recipe slug, document reference), `brand_asset` (brand, key, storage key, mime, bytes).

The work: `run` (brand, format, `run_key`, cadence, started at), `trend` (run, label, momentum, source urls, platform, `is_paywalled`), `idea` (run, brand, format, trend, title, brief, status, rejection reason, `fit_score`, plus new `relevance` / `momentum` / `brand_fit` / `hook_type` / `theme` / `source_urls`), `idea_recipe` (idea, recipe slug, chosen, decline reason), `asset` (idea, recipe slug, status, spec JSON, produced at, scheduled at, `camera_hub_uploaded_at`, Zoho schedule ref), `asset_media` (asset, ordinal, kind, storage key, mime, bytes, checksum, Magnific creation id), `copy_variant` (asset, channel, caption, hashtags, title), `job` (asset, brand, gate, status, attempt, enqueued at, started at, idempotency key, locked by, locked until), `gate_request` (job, gate name, candidates, decided by, decided at, choice).

The feedback loop: `post` (asset, channel, post url, posted at, tracking state), `metric_snapshot` (post, captured at, reactions, comments, shares, views, source, raw), `performance_score` (post, baseline, score, computed at), `channel_baseline` (channel, median reactions/comments/shares/views, window, updated at).

Every table carries `id`, `created_at`, `updated_at` and a schema version.

- **`hook_type` and `theme` are required at Idea creation**, not nullable conveniences. The `idea-strategist` writes them; the Brief renders them. A closed vocabulary is defined once and enforced at the store boundary — an open text field reproduces today's problem in a new location.
- **Job identity is the surrogate `id`.** `(brand, idea, recipe)` becomes a non-unique lookup, because the live queue already holds 12 duplicate pairs, which today means a status change can land on the wrong, already-finished job.
- **Claiming a job uses `SELECT … FOR UPDATE SKIP LOCKED` semantics** (SQLite: an equivalent atomic claim-with-owner-and-expiry `UPDATE … RETURNING`). The `lock` field inside `queue.json` is deleted, not ported.
- **Scheduling uses an outbox**: reserve the idempotency key, call Zoho, then confirm. The current order — call, then write — double-posts publicly on a crash-and-retry.

### The store layer

- **Reuse the existing store boundary rather than introducing a new one.** Every store today takes an explicit option (`{ ledgerPath }`) and owns its own I/O. That option becomes `{ db }`. Store names, operation names and return shapes stay. This keeps the migration a substitution rather than a rewrite, and it is what ADR-0014 anticipated.
- **`IdeaStore` is new** — the one ADR-0014 store never built. Idea creation, Review, acceptance and Recipe selection all route through it.
- **Roughly 40 non-test modules currently import `node:fs` directly**, bypassing the stores. Every one moves behind a store or an existing port. Until that is done the store boundary is nominal; the audit and the sweep are part of the phase, not cleanup afterwards.
- The four existing integration ports are **unchanged**: `SpaceMcpPort` (`src/space-driver/port.ts`), `PerformanceScrapePort` (`src/commands/track-performance-port.ts`), `MediaHostPort` (`src/media-host/port.ts`), and the Zoho MCP schedule port (`src/schedule-batch/mcp-schedule-port.ts`).

### The importer

- **Reads through the existing loaders, not raw JSON.** The on-disk shape and the in-memory shape genuinely differ — normalisers fold legacy `status: "casting"` Ideas into Assets at read time. Reading raw produces a database that disagrees with the repo's own code.
- **Refuses and reports; never repairs and never drops.** A laptop tool may drop a bad record with a warning; a one-shot migration doing that silently loses a paid-for Asset.
- **One shot, so it must be rehearsable.** No file carries `updated_at`, a version or an etag, and none can be backfilled, so the import cannot be incremental or resumable. It must run against a copy of `data/`, be re-runnable from empty, and end with a per-entity reconciliation of counts in versus counts out.
- **Both Brands are imported**, which means explicit parser branches for MundoTip's pre-Format Idea shape (10 Ideas, no `format` field — which current code treats as a hard stop), Straw Motion's three Idea shapes and three ID schemes, and four folder layouts, two of them under the same Format.
- **Absolute paths are converted to root-relative storage keys at import.** The 8 dead paths are reported for a decision, never silently nulled.

### The worker

- **The worker is a local process**, started by the Operator, draining the queue. It calls `production-queue/scheduler.ts` and `space-driver/driver.ts` as they stand — this phase writes the missing live adapter and the loop around them, not new production logic.
- **The live Magnific adapter is roughly seven methods** behind `SpaceMcpPort`, forwarding to the `spaces_*` / `creations_*` MCP tools. The adapter for the read side already exists with a contract test built against captured live responses.
- **Start with `news-carousel`**: zero gates, proven end-to-end against the fake, and the most-run Recipe.
- **The Magnific write cap must be verified against the live API before designing around it.** The record has flipped twice: one-shot injection works via the Magnific web UI, but the MCP `spaces_edit` query is capped at 4,000 characters while a carousel Spec is around 17 KB. The read-side cap is already handled properly and is the pattern to copy. A fresh `threadId` per injection is required — a shared thread truncates the JSON node after roughly 40 edits.
- **Attended mode is not a product requirement.** Two of the three wired Recipes declare zero gates; only *Character Explainer with Cast* pauses, once. The stated reason for running attended is the permission classifier re-blocking allow-listed Magnific calls, which a worker holding its own credentials does not face.

### The viewer

- **Read-only, and local.** A small local process renders HTML from the database; it never writes. Making it a second writer would recreate the uncontrolled-write problem the epic exists to remove.
- **The four human gates stay conversational in chat**, as they are today. Review in particular is a negotiation — which Recipes to run, why an Idea is rejected — and a form captures the decision while losing the reasoning. Chat is pointed at the command surface instead of at folders.
- The Library is the screen that does not exist today and is the reason for the epic.

### The agents

- Agents receive **typed commands, no filesystem access and no blanket `Bash`**. A tool list containing `Bash` is not a boundary — the `qa` agent's stated contract is "never edits product code" while holding both `Write` and `Bash`. Authorisation moves to the command surface.
- Agents stop citing `data/brands/<slug>/` (about 20 files) and stop citing 59 distinct TypeScript module paths across 129 mentions. Budget this as real work, not cleanup.
- The Operator's brand is removed from agent descriptions — the field a catalogue indexes.
- The **eleven model-prompting Skills carry no brand-specific content** and are already packaged correctly (namespaced name, semver, typed inputs and outputs, declared scripts and references, vendor doc URL and fetch date). They are blocked only by the missing shared reference folder (129 dangling links across five files), 6,578 lines of untested Python with a `python3` runtime dependency, and the absent licence.

### What cannot come along

- **Camera Hub teleprompter upload** drives a desktop app on this specific Mac and requires a human to quit it mid-flow. It stays a local companion step. Its file-format knowledge is valuable and must be preserved either way.
- **`sips`** is macOS-only. It sits behind `MediaHostPort` already, so replacing it is a one-file swap.

## Testing Decisions

**What a good test looks like here.** A test asserts externally observable behaviour — what a command returns, what a store round-trips, what a job's status becomes — and never the shape of a private helper or the text of a SQL statement. Tests that assert implementation detail are what made the current drift invisible: types vanished at runtime and nothing caught it.

**Seams.** Five total, four of them already in the repo and unchanged:

1. `SpaceMcpPort` — the Magnific seam. Fake at `src/space-driver/fixtures/fake-space.ts`. Unchanged.
2. `PerformanceScrapePort` — the Apify scrape seam. Unchanged.
3. `MediaHostPort` — conversion, hosting and delete. Fake at `src/media-host/fixtures/fake-media-host.ts`. Unchanged.
4. The Zoho MCP schedule port. Unchanged.
5. **The persistence seam** — the one thing that changes. It is not a new interface: it is the option every store already takes. `{ ledgerPath }` becomes `{ db }`, and tests inject a throwaway database file the same way they inject a temp path today.

**No fake database.** Tests open a real, empty SQLite file per test and drop it afterwards. There is no in-memory double, because the failure mode this epic exists to prevent is silent data loss, and an in-memory double would leave every constraint, transaction and lock — precisely the new machinery — untested. This is the same discipline the existing ports already follow: the fake models the *external* service, never our own storage.

**What gets tested, and where the prior art is:**

- **Stores** — round-trip and constraint tests against a real database, mirroring the existing store tests that use temp ledger paths (`src/asset/store.test.ts` and siblings). The store test suites should be reusable almost verbatim, which is the point of keeping their operations identical.
- **Concurrency** — two concurrent claims against one queued job yield exactly one winner; a lock that expires becomes claimable; a lost update is impossible. There is no prior art for this in the repo, because the current model cannot express it.
- **The importer** — golden-file tests over fixture copies of both Brands' real shapes, asserting the reconciliation report. Every legacy shape gets a fixture: MundoTip's pre-Format Ideas, Straw Motion's three ID schemes, all four folder layouts, the 12 duplicate job keys, the 8 dead media paths. Prior art: the fixture-plus-normaliser tests around `src/asset/migrate.ts` and `src/ledger/migrate-assets.ts`.
- **The command surface** — tested in-process against a real database, which is the highest seam available and where most behaviour should be pinned.
- **The worker** — driven against the existing `fake-space.ts`, asserting the full status path `queued → running → awaiting_pick → done`, retries, terminal failure, and that a parked job does not block the next one. Prior art: the existing driver and scheduler suites, which already exercise this logic and currently have no caller.
- **The live Magnific adapter** — a contract test against captured live responses, following `src/space-driver/fixtures/live-captures/`, plus a manual smoke script following `src/media-host/live/smoke.ts`. Never exercised by `npm test`; the build stays hermetic, with no credits spent and no board mutated.
- **Agent prose** — the existing `*.docs-test.ts` conformance checks, which read instruction files and assert the prose still says specific things. This is the only mechanism that has ever caught documentation drift. **They must be folded into `npm test` and CI**; being excluded is why 30 have been red unnoticed.

**Before anything else:** get the current suite green in CI (2,310 tests) and triage the 30 doc failures. A rebuild measured against an unknown baseline cannot prove it preserved behaviour.

## Out of Scope

- **Anything hosted.** No HTTP API, no server deployment, no cloud database, no container orchestration. Local SQLite and a local viewer only.
- **Multi-tenancy.** No `account`, `user` or `connection` tables; no auth, no roles, no per-tenant isolation. The schema stays shaped so these can be added later.
- **Object storage for produced media.** Media stays on local disk behind a root-relative key. The existing `MediaHostPort` S3 path stays exactly as it is — a temporary Zoho hand-off, not a store.
- **A writable web UI.** The viewer is read-only; the four human gates stay conversational.
- **Per-Channel Performance tracking.** ADR-0019 defers it; the `post` split makes it possible but this epic does not build it.
- **Rejection feedback influencing suggestions.** `CONTEXT.md` keeps this logged-only for v1.
- **New Recipes, new Formats, new Brands.** The epic ports what exists.
- **Changing the Fit Score formula.** Once Relevance has real data behind it the formula deserves revisiting — as its own spec, with evidence.
- **LinkedIn trend and Performance support.** Still the one roadmap platform (issue #48).
- **Hosting Camera Hub upload.** Stays local by nature.
- **Rewriting the eight workflow Skills** that restate npm scripts. They become `--help` output, not catalogue entries.

## Further Notes

**Open decisions that do not block the start.**

- *Does the Character Explainer Recipe survive?* It is the only Recipe with a human gate, the only one that needs the model-prompting Skills, and its ten produced Assets were never measured. Dropping it removes the gate machinery and simplifies the worker considerably. Phase 01 produces the evidence — decide after it, before phase 03.
- *Backfilling hook type and theme on the 61 existing Briefs.* Assumed in scope (story 18) because without it the Library is empty until the next Run, but it is a genuine classification job, not a schema detail. Drop it if phase 02 runs long.

**Assumptions made in writing this — correct them if wrong.**

- The local HTML viewer is **read-only**, and the Review, pick and publish gates stay in chat. "Viewer" was read literally, and it matches the artifact's own recommendation that Review is best kept conversational. If the intent was a local app that also captures gate decisions, phases 02 and 04 both change.
- **SQLite**, not local Postgres. It matches "local SQL" with the least machinery and needs no service to run tests. If a local Postgres is preferred, only the store implementations and the test harness change — the seam does not.

**Sequencing that is deliberate and should not be reordered.**

- Phase 00 comes first because two of its items are one-way doors.
- Phase 01 comes before the schema because a database of empty scores solves nothing, and because the Relevance term stays dead until real Performance exists.
- Media backup precedes the import because there is no second copy to recover from.

**Corrections carried forward from the review's own verification pass**, so they are not re-derived:

- The Magnific adapter is **largely built**, not absent — about 500 lines against real captured responses, with a contract test. What is missing is the roughly seven-method shim to the live MCP tools.
- **Most Recipes need no human present.** Two of three declare zero gates.
- The separate Post record was **deliberately declined** in a prior proposal, not overlooked. This epic reverses that on an explicit Operator decision and needs a superseding ADR.
- The leaked Zoho credential **probably cannot publish** — the OAuth grant named ten tools and deliberately excluded publish and approval, so the scope is likely baked into the credential. Confirm at rotation. It still grants full scheduling, schedule deletion, Channel enumeration and read access to published posts.
- Separately, the **Apify token is passed in URL query strings** on every scrape, leaking it into shell history and any proxy log in the path. Fix it in phase 01 while the client is being written.

**Good news worth keeping in view.** Of 141 modules, only 43 touch the filesystem or shell — roughly 8,400 lines of 23,700. About two-thirds of the TypeScript is pure logic that ports unchanged: validation, scoring, scheduling rules, timezone handling, eligibility, path derivation and brand-safety scanning. The domain thinking in `CONTEXT.md` is genuinely good, and the schema above is mostly a transcription of it. This epic is **finishing ADR-0014**, not starting over.
