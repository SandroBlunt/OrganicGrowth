## ADDED Requirements

### Requirement: Each of the six agent definitions names a typed accessor instead of a raw filesystem path for a pipeline read or write

Every stateful read or write described in `.claude/agents/{developer,idea-strategist,performance-tracker,producer,qa,trend-scout}.md` SHALL name the specific typed function that performs it (a `src/command-surface/` export where that surface covers the exact operation; the matching file-backed typed store/resolver otherwise — `FormatStore`'s `loadFormat`, `src/apify/platform.ts`'s `resolveApifyActor`/`detectPlatformFromUrl`, `src/production-spec/brand-profile.ts`'s loaders, `src/ledger/ledger.ts`'s reads, `AssetStore.writeAsset`, `runIdeasDirFor`) rather than instructing the agent to read or write a bare `data/brands/<slug>/...` path directly. A bare path MAY still appear as an illustrative example of what an already-named resolver function returns, but SHALL NOT stand alone as the interface.

#### Scenario: idea-strategist reads the Format's voice through loadFormat, not a raw YAML path

- **GIVEN** `.claude/agents/idea-strategist.md`'s Inputs section
- **WHEN** it describes reading the Format's `voice`/`niche`/`ideas_per_run`/`default_recipes`
- **THEN** it names `FormatStore`'s `loadFormat(brand, format)` (`src/format/store.ts`) as the accessor
- **AND** it does not instruct a direct read of `data/brands/<slug>/formats/<format>.yaml` as the interface

#### Scenario: trend-scout resolves an Apify actor through resolveApifyActor, not a bare seeds.yaml mention

- **GIVEN** `.claude/agents/trend-scout.md`'s peer-scrape Process section
- **WHEN** it describes resolving which Apify actor to call for a seed Page's platform
- **THEN** it names `src/apify/platform.ts`'s `resolveApifyActor(apifyConfig, platform, purpose)`
- **AND** the accompanying `data/brands/<slug>/seeds.yaml` mention is qualified as the config that function reads, never presented as something to read by hand

#### Scenario: performance-tracker's primary documented action is the sanctioned command, not a hand-rolled curl pipeline

- **GIVEN** `.claude/agents/performance-tracker.md`'s `## Process` section
- **WHEN** it is read top to bottom
- **THEN** the first substantive action step is running `npm run track-performance <brand>` and reporting its output
- **AND** the manual `curl` mechanics are presented as a debug-only fallback for verifying one post's raw Apify response, not as the primary flow

#### Scenario: an agent's stateful write, when no typed file-backed accessor exists at all, names the sanctioned command-surface function as the future target while stating today's operative write plainly

- **GIVEN** `.claude/agents/idea-strategist.md`'s Process step that appends a new suggested Idea to the Brand's ledger — an operation with no existing file-backed typed write function
- **WHEN** it is read
- **THEN** it names `src/command-surface/ideas.ts`'s `createIdea` as the sanctioned command for this operation once the Brand's data is on the SQL-backed pipeline (issue #205)
- **AND** it states, citing `.claude/rules/always/organicgrowth-rules.md` rule 7, that the ledger append is the operative write until that cutover — never silently presenting the SQL write as already live

#### Scenario: a citation pinned by an existing docs-conformance Scenario against the live file-backed schema is left unchanged, not rewritten onto the SQL surface

- **GIVEN** `.claude/agents/producer.md`'s "Queue jobs follow the store schema" Guardrails bullet, pinned by `openspec/specs/docs-conformance/spec.md`'s "producer.md's queue-job schema description matches the live schema, not the retired one" Scenario against `src/production-queue/queue.ts`'s real, file-backed `QueueJob`/`JobStatus` types
- **WHEN** this change's citation rewrite is applied
- **THEN** that bullet still cites `src/production-queue/queue.ts` verbatim, unchanged
- **AND** it is never rewritten to cite `src/command-surface/jobs.ts`'s SQL-backed `JobRecord`/`ReleaseStatus` shape, which uses a different status vocabulary

### Requirement: No agent definition holds an unscoped Bash grant without an accompanying, documented rationale narrowing its use

Where an agent's `tools:` frontmatter grants `Bash`, its body SHALL state, in a Guardrails bullet or an equivalent prominent paragraph, the specific, enumerated set of commands or invocations that grant is for — never leaving a bare `Bash` entry unremarked. Where an agent's process performs no shell-out at all, `Bash` SHALL be removed from its `tools:` frontmatter entirely.

#### Scenario: idea-strategist's tool list carries no Bash entry

- **GIVEN** `.claude/agents/idea-strategist.md`'s `tools:` frontmatter
- **WHEN** it is read
- **THEN** it does not include `Bash`

#### Scenario: every other agent's retained Bash grant is accompanied by an enumerated, narrow rationale

- **GIVEN** `.claude/agents/{developer,performance-tracker,producer,qa,trend-scout}.md`, each of which retains `Bash` in its `tools:` frontmatter
- **WHEN** each file's body is read
- **THEN** each names the specific commands/invocations `Bash` is for (e.g. `git`/`gh`/`npm test`/`npx tsx`/`openspec` for developer; `npm run track-performance`/`npm run apify-smoke`/the manual-debug curl calls for performance-tracker; the Apify curl calls for trend-scout; `uploadCameraHubScriptsCommand`/`npm run export-schedule` for producer; `npm test`/`npm run test:docs`/`openspec validate --strict`/read-only `git`/`gh` for qa)
- **AND** none grants it as an unremarked blanket capability

#### Scenario: qa's file-write tool is narrowed from Write to Edit

- **GIVEN** `.claude/agents/qa.md`'s `tools:` frontmatter, and its own stated contract that it never edits product code
- **WHEN** it is read
- **THEN** `tools:` lists `Edit`, not `Write`
- **AND** the Output section instructs appending the QA Verdict via `Edit` against the Slice Handoff's existing trailing content

### Requirement: Agent descriptions carry no Operator brand name

No `.claude/agents/*.md` file's `description:` frontmatter field SHALL name the Operator's own Brand (e.g. `mundotip`/`MundoTip`, `Straw Motion`) — that field is what a catalogue indexes (issue #212). Brand-specific content elsewhere in an agent's body is out of scope for this Requirement.

#### Scenario: idea-strategist, producer, and trend-scout descriptions use generic placeholders

- **GIVEN** `.claude/agents/{idea-strategist,producer,trend-scout}.md`'s `description:` frontmatter fields, each of which previously named `mundotip`/`MundoTip` or `Straw Motion` in an example
- **WHEN** they are read
- **THEN** each example uses a generic `<brand>`/"a Brand" placeholder instead

#### Scenario: developer, performance-tracker, and qa descriptions carry no brand name, unchanged

- **GIVEN** `.claude/agents/{developer,performance-tracker,qa}.md`'s `description:` frontmatter fields, none of which named the Operator's Brand before this change
- **WHEN** they are read
- **THEN** none names it now either

### Requirement: The protected editorial rules move through the citation rewrite verbatim

The primary-source discipline, the paywalled-feeds-are-signal-only rule, brand safety, and the anti-rhetoric caption rules SHALL be preserved byte-for-byte across this change — never tidied, compressed, or paraphrased while their surrounding citations are rewritten. Where a protected sentence and a citation share one sentence, the citation half SHALL be rewritten and the rule half left untouched, rather than the whole sentence being paraphrased.

#### Scenario: idea-strategist's openly-readable-source paragraph is untouched

- **GIVEN** `.claude/agents/idea-strategist.md`'s Process step 6 (the primary-source and paywalled-feeds-are-signal-only paragraph)
- **WHEN** `src/idea/openly-readable-source-rule.docs-test.ts` is run against the edited file
- **THEN** every one of its assertions (the exact "Never suggest an Idea whose every source is paywalled" sentence, the `2026-08-11` and `idea-03` citations, the `createIdea`/`IdeaValidationError`/`src/idea/store.ts` code citations, and the "never merely because the linked Trend is paywalled" / "carrying its own openly readable `sourceUrls` is accepted" clauses) still passes

#### Scenario: idea-strategist's brief-richness rules are untouched

- **GIVEN** `.claude/agents/idea-strategist.md`'s Hard Boundary and Process sections
- **WHEN** `src/format/idea-strategist-brief-richness.test.ts` is run against the edited file
- **THEN** every one of its assertions (the concrete angle/hook/talking-point requirements, the "AT LEAST 4" talking points rule, the "never a generic theme" language, and the standing "Be concrete, never generic" Guardrails bullet) still passes

#### Scenario: producer's Zoho, Camera Hub, and Copy-skill sections are untouched

- **GIVEN** `.claude/agents/producer.md`'s Schedule Batch offer, Camera Hub teleprompter upload offer, and Copy-phase sections
- **WHEN** `src/schedule-batch/mcp-schedule.docs-test.ts`, `src/commands/upload-camera-hub-scripts.docs-test.ts`, and `src/production-spec/producer-agent-copy-skill.test.ts` are run against the edited file
- **THEN** every one of their assertions still passes

### Requirement: Doc-conformance checks stay in lockstep through the rewrite

Every pre-existing test or docs-test that pins content in one of the six agent files SHALL still pass after this change, with the SAME or a greater number of assertions — never fewer, and never weakened to pass by asserting less.

#### Scenario: the five pre-existing pinning suites are still fully green, at the same assertion count

- **GIVEN** the five pre-existing suites that pin content in these six files (`mcp-schedule.docs-test.ts`, `openly-readable-source-rule.docs-test.ts`, `producer-agent-copy-skill.test.ts`, `idea-strategist-brief-richness.test.ts`, `upload-camera-hub-scripts.docs-test.ts`), together carrying 43 assertions across 14 suites before this change
- **WHEN** they are run against the edited agent files
- **THEN** all 43 assertions across all 14 suites still pass, with none removed or rewritten to assert less
