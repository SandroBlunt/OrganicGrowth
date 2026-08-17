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

### Requirement: No agent definition holds a bare, unscoped Bash grant — every retained Bash grant is a tool-enforced Bash(<pattern>) scope

Where an agent's `tools:` frontmatter grants shell access, it SHALL do so ONLY as one or more scoped `Bash(<pattern>)` entries (an exact-match form, e.g. `Bash(npm test)`, or a prefix-wildcard form, e.g. `Bash(git status *)`) — never a bare, unscoped `Bash` entry. This is a real, Claude-Code-enforced boundary (verified against the CLI's own `--allowedTools` help text and against live `Bash(...)`-scoped rules already active in the Operator's own settings), not merely a documented convention. Where an agent's process performs no shell-out at all, `Bash` SHALL be removed from its `tools:` frontmatter entirely. Each `Bash(<pattern>)` entry SHALL correspond to a specific, real command or invocation named in that agent's own body prose — no pattern SHALL be granted without a matching, stated purpose. Where the granted command anchors on a shell builtin that mutates environment/shell state (e.g. `set`), the grant SHALL be the exact, literal, full command with NO wildcard — Claude Code hard-blocks any wildcard grant anchored on such a builtin regardless of its suffix, so a prefix-wildcard form is not merely imprecise there, it is non-functional.

#### Scenario: idea-strategist's tool list carries no Bash entry, scoped or otherwise

- **GIVEN** `.claude/agents/idea-strategist.md`'s `tools:` frontmatter
- **WHEN** it is read
- **THEN** it does not include `Bash` or any `Bash(<pattern>)` entry

#### Scenario: every other agent's retained Bash grant is expressed as scoped Bash(<pattern>) entries in tools:, not a bare Bash plus prose

- **GIVEN** `.claude/agents/{developer,performance-tracker,producer,qa,trend-scout}.md`, each of which retains shell access
- **WHEN** each file's `tools:` frontmatter is read
- **THEN** none contains a bare `Bash` entry
- **AND** each contains one or more `Bash(<pattern>)` entries matching that agent's own documented need (e.g. `Bash(git status *)`/`Bash(git diff *)`/`Bash(git commit *)`/`Bash(npm test)`/`Bash(npx tsx *)`/`Bash(openspec validate *)` for developer; `Bash(npm run track-performance *)`/`Bash(npm run apify-smoke *)`/`Bash(curl *)` for performance-tracker; `Bash(curl *)`/`Bash(set -a; [ -f .env ] && . ./.env; set +a)` for trend-scout; `Bash(npx tsx src/commands/upload-camera-hub-scripts.ts *)`/`Bash(npm run export-schedule *)` for producer; `Bash(npm test)`/`Bash(npm run test:docs)`/`Bash(openspec validate *)` for qa)

#### Scenario: an environment-mutating shell builtin is granted as an exact-match Bash entry, never a wildcard

- **GIVEN** trend-scout's and performance-tracker's `.env`-loading step, which always runs the identical literal command `set -a; [ -f .env ] && . ./.env; set +a`
- **WHEN** their `tools:` frontmatter is read
- **THEN** each grants that FULL command as one exact-match `Bash(<exact command>)` entry, with no trailing wildcard
- **AND** neither grants any `Bash(set...*)`-shaped wildcard entry — Claude Code hard-blocks any wildcard `Bash` grant anchored on `set` (verified live: it changes shell option state, defeating static env-var analysis), so a wildcard there can never authorise this step regardless of its suffix

#### Scenario: developer's scoped git/gh grants exclude push and PR/issue authorship

- **GIVEN** `.claude/agents/developer.md`'s `tools:` frontmatter, and its own guardrail that it never pushes or opens a PR itself
- **WHEN** it is read
- **THEN** it grants no `Bash(git push...)` entry and no `Bash(gh pr...)` entry of any kind

#### Scenario: qa's scoped git/gh/npm grants exclude every write-capable command

- **GIVEN** `.claude/agents/qa.md`'s `tools:` frontmatter, and its own contract that it never edits product code
- **WHEN** it is read
- **THEN** it grants no `Bash(git commit...)`, no `Bash(git push...)`, and no `Bash(npm install...)` entry of any kind

#### Scenario: qa's file-write tool is narrowed from Write to a path-scoped Edit

- **GIVEN** `.claude/agents/qa.md`'s `tools:` frontmatter, and its own stated contract that it never edits product code
- **WHEN** it is read
- **THEN** `tools:` lists `Edit(openspec/changes/**/handoff.md)`, not a bare `Edit` and not `Write`
- **AND** the Output section instructs appending the QA Verdict via `Edit` against the Slice Handoff's existing trailing content

#### Scenario: the path-scoped Edit grant genuinely tightens the boundary, verified both ways

- **GIVEN** `Edit(openspec/changes/**/handoff.md)` granted in an isolated Claude Code session
- **WHEN** an Edit is attempted against a real `handoff.md` matching that glob, and separately against an unrelated file that does not match it
- **THEN** the matching-file Edit is allowed and the file is changed
- **AND** the non-matching-file Edit is denied and the file is left unchanged

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

The primary-source discipline, the paywalled-feeds-are-signal-only rule, brand safety, and the anti-rhetoric caption rules SHALL be preserved byte-for-byte across this change — never tidied, compressed, or paraphrased while their surrounding citations are rewritten. Where a protected sentence and a citation share one sentence, the citation half SHALL be rewritten and the rule half left untouched, rather than the whole sentence being paraphrased. Where a protected rule category does not live in any of the six `.claude/agents/*.md` files this change edits, the proposal SHALL state plainly where it does live and that it is confirmed untouched, rather than silently omitting it from the accounting.

#### Scenario: the anti-rhetoric caption rules' real location is stated explicitly, not silently omitted

- **GIVEN** the anti-rhetoric caption rules live in `.claude/skills/write-social-copy/SKILL.md`, not in any of the six `.claude/agents/*.md` files
- **WHEN** `proposal.md`'s "What did NOT change — the protected editorial rules, verbatim" section is read
- **THEN** it names that file as the rules' real location, out of this slice's own scope
- **AND** it states `.claude/skills/` is confirmed untouched (an empty `git diff main --stat -- .claude/skills/`)

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

### Requirement: Doc-conformance checks stay in lockstep through the rewrite, and every invariant this change itself introduces is pinned

Every pre-existing test or docs-test that pins content in one of the six agent files SHALL still pass after this change, with the SAME or a greater number of assertions — never fewer, and never weakened to pass by asserting less. Additionally, every NEW, cheaply-checkable invariant this change itself introduces (a file that must never regain a capability it just lost, a field that must never regain content it was just stripped of) SHALL be pinned by a test added in the SAME change — never left to a future edit to silently undo.

#### Scenario: the eleven pre-existing pinning suites are still fully green, at the same assertion count

- **GIVEN** the eleven pre-existing suites that pin content in these six files (`mcp-schedule.docs-test.ts`, `openly-readable-source-rule.docs-test.ts`, `producer-agent-copy-skill.test.ts`, `idea-strategist-brief-richness.test.ts`, `upload-camera-hub-scripts.docs-test.ts`, `format-docs.test.ts`, `apify-docs.test.ts`, `report.docs-test.ts`, `track-performance.docs-test.ts`, `approval-gate.docs-test.ts`, `producer-agent.docs-test.ts`), together carrying 178 assertions before this change
- **WHEN** they are run against the edited agent files
- **THEN** all 178 assertions still pass, with none removed or rewritten to assert less

#### Scenario: this change's own two Round-1-introduced invariants are pinned, not left silently regressable

- **GIVEN** `src/claude-agents/tool-boundary.docs-test.ts`, added in Round 2 after QA's Round-1 Verdict found neither invariant was pinned by any test
- **WHEN** it is run
- **THEN** it fails if `idea-strategist.md`'s `tools:` frontmatter ever regains a `Bash` entry
- **AND** it fails if any of the six agents' `description:` frontmatter ever regains `mundotip`/`MundoTip`/`Straw Motion`
- **AND** it fails if any `Bash`-retaining agent's `tools:` frontmatter ever widens back to a bare, unscoped `Bash` entry
