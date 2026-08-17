# docs-conformance Specification

## Purpose
TBD - created by archiving change issue-59-docs-present-tense. Update Purpose after archive.
## Requirements
### Requirement: The engineering documentation set describes the built attended, multi-format flow in present tense

The engineering documentation set SHALL describe capabilities that are actually built and green on
`main` in present tense — `CLAUDE.md`, the content-agent definitions (`.claude/agents/*.md`), and the
command definitions (`.claude/commands/*.md`) — never marked `Target (…)`, "not yet wired", "not built
yet", or "being migrated onto that model" once the capability is shipped. Conversely, a capability that
is genuinely NOT built (e.g. a
second wired Recipe beyond the one *Character Explainer with Cast* entry) SHALL NOT be described as if it
already exists. Concretely: `CLAUDE.md`'s pipeline steps SHALL document `/run-trends <brand> <format>`
(Format-scoped Runs, ADR-0013), Review picking Recipes (ADR-0009), the Production Queue keyed
`(brand, idea, recipe)`, the generic `/pick` command alongside its `/pick-cast` alias (ADR-0010), and
`/log-post <brand> <idea-id> <recipe> <post-url>` (Recipe-explicit attribution, ADR-0011) — none of these
behind a `Target`/`not built yet` marker.

#### Scenario: CLAUDE.md carries no future-tense scaffolding for shipped capabilities

- **GIVEN** `CLAUDE.md` as shipped in this repository
- **WHEN** it is searched for `Target (`, `not yet`, `not built`, `being migrated`, or `single-recipe`
- **THEN** no match describes the multi-format model, the per-Recipe Production Queue, or the per-Asset
  ledger grain as future/unbuilt — those capabilities are described as they run today

#### Scenario: CLAUDE.md documents the ADR-0011 split lifecycle, not the retired flat one

- **GIVEN** `CLAUDE.md`'s `## State` section
- **WHEN** it is read
- **THEN** it states the Idea's own lifecycle is `suggested / accepted / rejected`
- **AND** it states each chosen Recipe's Asset separately moves through
  `queued → in_production → produced → posted → tracking → scored`
- **AND** it does NOT claim the Idea itself carries a flat `casting`/`produced`/`posted` status (that
  status moved onto the Asset in ADR-0011)

#### Scenario: producer.md's queue-job schema description matches the live schema, not the retired one

- **GIVEN** `.claude/agents/producer.md`'s "Queue jobs follow the store schema" guardrail
- **WHEN** it is compared against `src/production-queue/queue.ts`'s exported `QueueJob`/`JobStatus` types
- **THEN** it names the CURRENT fields (`recipe`, `gate`, `status` including `awaiting_pick`, and the
  optional `pick`)
- **AND** it does NOT name the retired `phase: cast|render` field or the retired `awaiting_cast` status

#### Scenario: pick-cast.md documents the Asset-grain Cast-gate lifecycle, not the retired flat Idea status

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** it is read
- **THEN** it states the Idea's own status is untouched by a pick (stays `accepted` throughout)
- **AND** it states it is the Asset that pauses `in_production` (with `pending_gate: "cast"`) at the Cast
  gate and, after the pick, moves `in_production → produced`
- **AND** it does NOT claim the Idea's own status chain runs `casting → produced`, and does NOT claim "a
  `casting` Idea is paused at the Cast gate" (both are the retired flat Idea-status model ADR-0011
  replaced — QA Round-1 defect QA-1 found this exact regression)

#### Scenario: A doc never claims a second Recipe is wired

- **GIVEN** any of `CLAUDE.md`, `.claude/agents/producer.md`, `.claude/commands/run-pipeline.md`
- **WHEN** they describe the Recipe registry
- **THEN** they state exactly one Recipe is wired today (*Character Explainer with Cast*) and that the
  registry is multi-Recipe-ready — never implying a second Recipe already exists (that is issue #60,
  explicitly future work)

### Requirement: Docs-conformance tests pin the CURRENT reality, never a superseded honesty disclaimer

The `*.docs-test.ts` suite (`npm run test:docs`) SHALL assert claims that are true of the code as it
stands on `main` today. A subtest SHALL NOT require a doc to carry a "not yet wired"/"not yet
operational"/audit-finding-citation disclaimer once the described capability is actually wired and
tested — doing so would force the doc to say something false to keep the test green. Where a prior
disclaimer is retired, the replacement assertion SHALL still pin a real, checkable claim (not merely
assert the disclaimer's absence with nothing to replace it) wherever a meaningful positive claim is
available.

#### Scenario: report.docs-test.ts asserts pick-cast.md names both production paths, not the retired single-path claim

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc states the attended path's render runs in the Operator's session,
  cites ADR-0008, cites ADR-0030, and names the unattended worker path
- **AND** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT
- **AND** the suite asserts the OLD, now-false, unqualified "no unattended background worker" claim is
  ABSENT (`docs/adr/0030` partially supersedes that decision — issue #208)
- **AND** the suite still asserts the doc promises the command records the Character correctly (the
  positive claim carried over unchanged)

#### Scenario: run-pipeline.docs-test.ts asserts both production paths and per-Recipe gates, not "not built yet"

- **GIVEN** `.claude/commands/run-pipeline.md` as shipped
- **WHEN** `src/commands/run-pipeline.docs-test.ts` reads it
- **THEN** the suite asserts the doc names BOTH the attended and the unattended production runtime,
  cites ADR-0008 and ADR-0030, states the attended path runs "in your session", states the unattended
  worker runs "with no human present", and names the worker module (`run-worker`)
- **AND** the suite asserts the doc describes gates as per-Recipe (ADR-0009) without calling the
  multi-format model unbuilt (no "being migrated"/"single-recipe build" wording)
- **AND** the suite asserts the OLD, now-false, unqualified "no headless worker host" claim is ABSENT
  (`docs/adr/0030` partially supersedes that decision — issue #208)

#### Scenario: producer-agent.docs-test.ts asserts the live queue schema and both production paths, instead of the retired "not yet wired" claim

- **GIVEN** `.claude/agents/producer.md` as shipped
- **WHEN** `src/production-spec/producer-agent.docs-test.ts` reads it
- **THEN** the suite asserts the OLD "not yet wired"/audit-C2 disclaimer is ABSENT, that the doc cites
  ADR-0008 and ADR-0030, and that it states it runs attended in the Operator's own session
- **AND** the suite asserts the doc's queue-job schema description names the CURRENT `recipe` field and
  `awaiting_pick` status, and does NOT name the retired `awaiting_cast` status — a real, checkable pin
  against production code that replaces the retired assertion, not a rubber stamp

#### Scenario: report.docs-test.ts pins pick-cast.md's Asset-grain status vocabulary (QA-1 regression guard)

- **GIVEN** `.claude/commands/pick-cast.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc names the Asset's `in_production` status and `pending_gate` field
- **AND** the suite asserts the doc does NOT claim the Idea's own status chain runs `casting → produced`
- **AND** the suite asserts the doc does NOT claim "a `casting` Idea is paused" at the Cast gate
- **AND** these two negative guards are verified (not merely asserted) to fail against the exact
  pre-fix doc text that caused QA Round-1's defect QA-1, so the guard is a genuine regression test, not
  a rubber stamp

#### Scenario: report.docs-test.ts asserts CLAUDE.md names both production paths, not the retired single-path claim

- **GIVEN** `CLAUDE.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc cites ADR-0008 and ADR-0030, names the unattended path, and states
  the unattended worker runs "with no human present"
- **AND** the suite asserts the OLD, now-false, unqualified "no headless worker host" claim is ABSENT

#### Scenario: report.docs-test.ts asserts README.md names both production paths, not the retired single-path claim

- **GIVEN** `README.md` as shipped
- **WHEN** `src/commands/report.docs-test.ts` reads it
- **THEN** the suite asserts the doc cites ADR-0008 and ADR-0030, and names the unattended path
- **AND** the suite asserts the OLD, now-false, unqualified "there is no unattended background worker"
  claim is ABSENT

### Requirement: The repository retains no dead ADR-0004 unattended-background-worker code

ADR-0008 superseded ADR-0004's unattended, background Production Queue worker; that code SHALL NOT be
present or referenced. `src/production-queue/scheduler.ts` is NOT part of that dead code — it is the
LIVE decision logic the generic gate-resume flow (`/pick`, `/pick-cast`) drives (issue #57) — and SHALL
be retained.

#### Scenario: worker.ts is absent and unreferenced

- **GIVEN** the repository as shipped
- **WHEN** it is searched for `src/production-queue/worker.ts` and any import of it
- **THEN** no such file and no such import exists

#### Scenario: scheduler.ts is retained because it is live, not dead

- **GIVEN** the repository as shipped
- **WHEN** `src/commands/pick.ts` is inspected
- **THEN** it imports `markPickConsumed` from `src/production-queue/scheduler.ts`
- **AND** `scheduler.ts` and its test file are present (not deleted)

### Requirement: producer.md is a thin, recipe-generic conductor with no recipe-specific procedure

`.claude/agents/producer.md` SHALL describe the Producer as a thin conductor that resolves every
Recipe-specific fact — gates, the Magnific Space it drives (and the on-canvas node NAMES it touches),
its Production-Spec shape, its copy shape, its typed canvas media slots, and its six ordered Phase
Contracts — from `src/recipe/registry.ts`'s `getRecipe(job.recipe)`, and that runs that Recipe's own
producer Skill BY SLUG (`.claude/skills/produce-*/`) for the author phase. It SHALL NOT hard-code any
one Recipe's own canvas node names (e.g. `"Character Variants Generator"`, `"Selected Character"`)
anywhere in its prose. It SHALL describe resolving the Idea's Format from the ledger record via
`resolveIdeaFormat` (STOPping, never guessing, when absent), binding media slots via `bindMediaSlots`
(STOPping on a missing required slot, ADR-0016), self-auditing each phase via
`auditAuthorPhase`/`auditBindMediaPhase`/`auditCopyPhase` (ADR-0017) before advancing, and driving the
canvas via the generic `driveToNextGate`, pausing ONLY at that Recipe's own declared `gates`. It SHALL
NOT read `production.space_id` (or any other Brand Profile field) to resolve a Space id — that field
is retired; the canvas id comes ONLY from the resolved Recipe's own `space.id`.

#### Scenario: producer.md resolves every Recipe-specific fact from the registry, never hard-coding one Recipe's shape

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `src/recipe/registry.ts`'s `getRecipe(job.recipe)` as the source of a job's gates/
  canvas/Spec-and-copy-shapes/phase contracts, and states it is a "thin, recipe-generic conductor"

#### Scenario: producer.md never reads production.space_id from a Brand Profile

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is searched for `production.space_id`
- **THEN** there is no match — the doc instead states the canvas id comes from the Recipe and that no
  Brand Profile field is ever read for it

#### Scenario: producer.md never hard-codes the wired Recipe's own canvas node names

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is searched for `"Character Variants Generator"` and `"Selected Character"`
- **THEN** there is no match — those node names are the wired Recipe's own data, living on the Recipe
  registry and its Skill, never in the generic conductor's own prose

#### Scenario: producer.md describes running a Recipe's producer Skill by slug

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names both `produce-character-explainer` and `produce-news-carousel` as the Skill slugs
  it invokes for the author phase, dispatched by the queue job's `recipe` field

### Requirement: producer.md restores the watermark-@handle step, as a generic Recipe-declared step (QA-1)

`.claude/agents/producer.md` SHALL describe setting the Brand's watermark `@handle`
(`src/production-spec/brand-profile.ts`'s `loadWatermarkHandle`) onto a Recipe-declared
`watermarkNode` (`Recipe.space.nodes.watermarkNode`) via `src/space-driver/driver.ts`'s
`setWatermarkHandle`, BEFORE that leg's render — as a GENERIC step that only runs at all for a Recipe
that declares a `watermarkNode`, skipping cleanly when the Brand's handle is blank (never failing the
run over an unset optional field). It SHALL state the watermark `@handle` is NOT part of the Asset's
Copy (ADR-0012). This restores, generically, the pre-#88 doc's `replace_text`/`"Watermark
instructions"`/`@handle` instruction that Round 1 of this slice silently dropped (QA-1).

#### Scenario: producer.md describes the watermark step, generically, naming the exact primitives

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it mentions `watermarkNode`, `Recipe.space.nodes.watermarkNode`, `setWatermarkHandle`
  (`src/space-driver/driver.ts`), and `loadWatermarkHandle` (`src/production-spec/brand-profile.ts`)

#### Scenario: producer.md states the watermark step is skipped cleanly when the Brand's handle is blank

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states a blank/unconfigured watermark handle is skipped cleanly, never failing the run

#### Scenario: producer.md states the watermark @handle is not part of the Asset's Copy

- **GIVEN** `.claude/agents/producer.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the watermark `@handle` is NOT part of the Asset's Copy, citing ADR-0012

### Requirement: CONTEXT.md defines Schedule Batch and Zoho Social Brand; the one-time S3 setup is documented, not code

`CONTEXT.md` SHALL define **Schedule Batch** and **Zoho Social Brand** as glossary terms, each with an
`_Avoid_` line. The **Schedule Batch** entry SHALL state the approval that precedes it is conversational
only and never written to the ledger, that `scheduled_at` is the field it stamps while `status` stays
`produced`, and that hosting/writing files is not publishing — the Publish gate (ADR-0002) is a second,
distinct human step. The **Zoho Social Brand** entry SHALL state it is distinct from an OrganicGrowth
Brand. The one-time S3 infrastructure setup SHALL be documented at `docs/schedule-batch-s3-setup.md` as
infrastructure setup, not code, stating it is already live for straw-motion.

Since issue #198, that setup doc SHALL describe a PRIVATE bucket (Block Public Access ON, NO bucket
policy — no public-principal grant of any kind) rather than a public-`GetObject`-only bucket policy. It
SHALL name the real mechanism by which media becomes readable — `presignViaAwsCli`
(`src/media-host/live/s3.ts`), `computeMediaExpiry` (`src/schedule-batch/media-expiry.ts`), and
`randomMediaKeyToken` (`src/media-host/token.ts`) — and SHALL document the exact IAM permissions the
running AWS CLI credentials need (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, never
`s3:ListBucket` or a wildcard). It SHALL document AWS's own SigV4 presign ceiling
(`MAX_PRESIGN_SECONDS`, 604,800 seconds / 7 days, `cappedByAwsLimit`) and — since issue #198's QA Round
1 Defect #1 — SHALL state that a schedule whose signed link cannot reach its own post time is REFUSED
LOUDLY, NEVER SHIPPED (`validateWithinPresignWindow`, `EXPORT REFUSED`, `buildMcpSchedulePlan`'s
`presign-window` reason), never merely documented as an after-the-fact failure mode. It SHALL document
the concrete, one-time migration steps for an already-public bucket (`aws s3api delete-bucket-policy`,
confirming `get-public-access-block` is still fully ON, confirming `get-bucket-policy` now returns
`NoSuchBucketPolicy`, and granting the three needed IAM actions).

#### Scenario: CONTEXT.md defines Schedule Batch, cross-referencing the conversational approval and ADR-0002

- **GIVEN** `CONTEXT.md` as shipped in this repository
- **WHEN** its **Schedule Batch** glossary entry is read
- **THEN** it states the preceding approval is conversational only and never written to the ledger
- **AND** it states `scheduled_at` is stamped while `status` stays `produced`
- **AND** it states hosting/writing files is not publishing and cites ADR-0002

#### Scenario: CONTEXT.md defines Zoho Social Brand as distinct from an OrganicGrowth Brand

- **GIVEN** `CONTEXT.md` as shipped in this repository
- **WHEN** its **Zoho Social Brand** glossary entry is read
- **THEN** it states a Zoho Social Brand is not an OrganicGrowth Brand
- **AND** it names an exact Zoho channel label (e.g. `LinkedInProfile`) as an example of what it owns

#### Scenario: The one-time S3 setup is documented as infrastructure, never as code, and describes a PRIVATE bucket

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the setup is one-time infrastructure, not code
- **AND** it documents the live straw-motion bucket (`strawmotion-schedule-media`) and a 30-day expiry
  lifecycle rule
- **AND** it states the bucket is PRIVATE (Block Public Access stays ON, bucket policy is NONE) — never
  a public-`GetObject`-only bucket policy
- **AND** it does NOT contain a `"Principal": "*"` grant anywhere

#### Scenario: The setup doc names the real signed-link mechanism and the exact IAM permissions needed

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `presignViaAwsCli`, `computeMediaExpiry`, and `randomMediaKeyToken` by their real
  module paths
- **AND** it documents `"s3:GetObject"`, `"s3:PutObject"`, and `"s3:DeleteObject"` as the credentials'
  needed permissions
- **AND** it does NOT document `"s3:ListBucket"` or a wildcard `"s3:*"` action anywhere

#### Scenario: The setup doc states AWS's own presign ceiling AND that a doomed link is refused loudly, never shipped (issue #198 QA Round 1 Defect #1)

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `MAX_PRESIGN_SECONDS`, states the ceiling is 604,800 seconds / 7 days, and names
  `cappedByAwsLimit`
- **AND** it names `validateWithinPresignWindow`, states the export is refused with `EXPORT REFUSED`,
  and names the MCP path's `presign-window` refusal reason — never merely a documented after-the-fact
  failure mode

#### Scenario: The setup doc documents the concrete migration steps for an already-public bucket

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `aws s3api delete-bucket-policy`, `aws s3api get-public-access-block`, and the
  expected `NoSuchBucketPolicy` outcome of confirming no policy remains

### Requirement: CONTEXT.md defines Hook Type and Theme as closed vocabularies, term-for-term matching their TypeScript source

`CONTEXT.md` SHALL define **Hook Type** and **Theme** as their own glossary headings, each explicitly
stated as a CLOSED vocabulary (not free text), and each SHALL list every value from
`src/vocabulary/hook-type.ts`'s `HOOK_TYPES` / `src/vocabulary/theme.ts`'s `THEMES` together with that
value's EXACT one-line meaning sentence — so the doc and the TypeScript source cannot silently drift
apart.

Both entries SHALL additionally explain the explicit `unclassified` member (issue #219, Operator
decision 2026-08-17) beyond just listing it in the closed set: naming the **importer** (issue #204) as
who assigns it, and stating it, in a query, is **distinguishable** from every real, classified value —
so the doc records WHY this value exists (an honest `NOT NULL`-compatible default, never a nullable
escape hatch that would conflate "not yet classified" with "has nothing to classify"), not merely THAT
it exists.

#### Scenario: CONTEXT.md's Hook Type entry lists every HOOK_TYPES value with its exact meaning

- **GIVEN** `CONTEXT.md` as shipped and `src/vocabulary/hook-type.ts`'s `HOOK_TYPES`
- **WHEN** the Hook Type glossary entry is read
- **THEN** it states the vocabulary is closed, and for every `HOOK_TYPES` entry it contains that exact
  `value` (as inline code) and that exact `meaning` sentence

#### Scenario: CONTEXT.md's Theme entry lists every THEMES value with its exact meaning

- **GIVEN** `CONTEXT.md` as shipped and `src/vocabulary/theme.ts`'s `THEMES`
- **WHEN** the Theme glossary entry is read
- **THEN** it states the vocabulary is closed, and for every `THEMES` entry it contains that exact
  `value` (as inline code) and that exact `meaning` sentence

#### Scenario: CONTEXT.md's Hook Type entry explains 'unclassified' beyond just listing it (issue #219)

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Hook Type glossary entry is read
- **THEN** it names the importer as who assigns `unclassified`, and states `unclassified` is
  distinguishable, in a query, from every real, classified value

#### Scenario: CONTEXT.md's Theme entry explains 'unclassified' beyond just listing it (issue #219)

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Theme glossary entry is read
- **THEN** it names the importer as who assigns `unclassified`, and states `unclassified` is
  distinguishable, in a query, from every real, classified value

### Requirement: CONTEXT.md's Recipe entry states the registry's real wired count, never a stale one

`CONTEXT.md`'s **Recipe** entry SHALL state the CURRENT number of wired Recipes in words, name every
one of them by its human name (including *News Short Script*), and SHALL NOT describe any currently-wired
Recipe as "build pending". It SHALL cite `src/recipe/registry.ts` as the source of truth for the wired
count, rather than asserting a count of its own that can go stale.

#### Scenario: CONTEXT.md states three Recipes are wired, naming all three

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Recipe glossary entry is read
- **THEN** it states "Today three Recipes are wired", names Character Explainer with Cast, News
  Carousel, and News Short Script, and does not call News Short Script "build pending"

#### Scenario: CONTEXT.md cites the registry as the source of truth for the wired count

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the sentence stating the wired count is read
- **THEN** it names `registry.ts`

### Requirement: The two superseding ADRs exist, record the Operator decision date, and cross-reference what they supersede

`docs/adr/0028-post-is-its-own-record.md` SHALL state it supersedes ADR-0011 (naming the reversal: Post
becomes its own record rather than scalar fields on the Asset), record the Operator decision date
`2026-08-16`, and state the new `post` table's key shape (`asset_id`, `channel_id`).
`docs/adr/0029-local-sqlite-behind-the-store-boundary.md` SHALL state it supersedes ADR-0014, record the
SAME Operator decision date, state local SQLite via `node:sqlite` explicitly as never hosted/never
Postgres/never multi-tenant, and state ADR-0014's store-boundary principle is KEPT and FULFILLED (not
abandoned).

#### Scenario: ADR-0028 cites ADR-0011, the decision date, and the new table's key shape

- **GIVEN** `docs/adr/0028-post-is-its-own-record.md` as shipped
- **WHEN** it is read
- **THEN** it states it supersedes ADR-0011, records `2026-08-16`, and names `asset_id`/`channel_id`

#### Scenario: ADR-0029 cites ADR-0014, the decision date, and states "never hosted/Postgres/multi-tenant"

- **GIVEN** `docs/adr/0029-local-sqlite-behind-the-store-boundary.md` as shipped
- **WHEN** it is read
- **THEN** it states it supersedes ADR-0014, records `2026-08-16`, states "never a hosted service, never
  Postgres, never multi-tenant", names `node:sqlite`, and states its store-boundary principle is "KEPT
  and FULFILLED"

### Requirement: ADR-0011 and ADR-0014 each carry a forward-pointer to their superseding ADR, never a silent contradiction

`docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` SHALL carry a blockquote stating it is
partially superseded by ADR-0028. `docs/adr/0014-canonical-state-in-files-behind-store-boundary.md` SHALL
carry a blockquote stating it is superseded by ADR-0029. Neither file's original decision text SHALL be
edited — only a forward-pointer is added, mirroring this repository's established pattern (ADRs
0015–0018 pointing back at 0010/0013/0014).

#### Scenario: ADR-0011 states it is partially superseded by ADR-0028

- **GIVEN** `docs/adr/0011-ledger-grain-per-recipe-assets-attribution.md` as shipped
- **WHEN** it is read
- **THEN** it contains the phrase "Partially superseded by ADR-0028"

#### Scenario: ADR-0014 states it is superseded by ADR-0029

- **GIVEN** `docs/adr/0014-canonical-state-in-files-behind-store-boundary.md` as shipped
- **WHEN** it is read
- **THEN** it contains the phrase "Superseded by ADR-0029"

### Requirement: Always-rule 7 cites the new SQLite foundation without overclaiming the store swap

`.claude/rules/always/organicgrowth-rules.md`'s rule 7 SHALL cite `docs/adr/0029` and SHALL state the
SQLite foundation is NOT YET the backing of any store — it SHALL NOT claim any store's backing has
already swapped to it (that swap is issue #202, not this ticket).

#### Scenario: Rule 7 cites ADR-0029 and states the store swap has not happened yet

- **GIVEN** `.claude/rules/always/organicgrowth-rules.md` as shipped
- **WHEN** rule 7 is read
- **THEN** it cites `docs/adr/0029` and states the SQLite foundation is "not yet the backing of any
  store"

### Requirement: CONTEXT.md's Post entry reflects the ADR-0028 reversal

`CONTEXT.md`'s **Post** entry SHALL cite `ADR-0028` and SHALL state a Post is keyed on `(Asset,
Channel)`, not a scalar field on the Asset.

#### Scenario: CONTEXT.md's Post entry cites ADR-0028 and the (Asset, Channel) key

- **GIVEN** `CONTEXT.md` as shipped
- **WHEN** the Post glossary entry is read
- **THEN** it cites ADR-0028 and states the key is `(Asset, Channel)`

