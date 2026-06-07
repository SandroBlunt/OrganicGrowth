# run-pipeline-conductor Specification

## Purpose
TBD - created by archiving change issue-24-run-pipeline-conductor. Update Purpose after archive.
## Requirements
### Requirement: The conductor resolves an existing Brand and threads it through the entire run

The system SHALL expose a `/run-pipeline <brand>` conductor command that accepts a Brand slug,
resolves the Brand via `resolveBrand`, and threads the Brand identity through every step of the
weekly loop. The Brand slug SHALL be restated in every gate prompt so the Operator is never in doubt
about which Brand the loop is running for. An unresolvable or missing Brand SHALL produce an
identifiable error message naming the Brand slug and SHALL NOT fall back to a default Brand.

#### Scenario: Brand is resolved and threaded through the loop

- **GIVEN** a Brand slug `"mundotip"` that exists on disk
- **WHEN** `/run-pipeline mundotip` is invoked
- **THEN** the conductor output identifies the Brand as `"mundotip"`
- **AND** every gate prompt restates the Brand slug

#### Scenario: Unknown Brand produces an identifiable error

- **GIVEN** a Brand slug `"no-such-brand"` that does NOT exist on disk
- **WHEN** `/run-pipeline no-such-brand` is invoked
- **THEN** the conductor outputs an error naming `"no-such-brand"`
- **AND** the loop does not proceed past Brand resolution

---

### Requirement: Readiness runs every launch, is silent when healthy, and surfaces gaps with phase-scoped blocking

The conductor SHALL run a readiness check at every launch. The check SHALL NEVER be cached. It SHALL:
- Live-probe the Magnific Space for accessibility and credit balance.
- Live-ping the Apify token for validity.
- Sanity-check the Brand config (via `checkConfig`).
- Feed all probe results to `classify` and combine the findings.

When all findings are advisory-only or there are no findings, the readiness output SHALL be silent
(no output to the Operator). When blocking findings exist, the conductor SHALL surface them and apply
phase-scoped blocking: a `block` on `research` stops the launch; a `block` on `production` allows
research to proceed but stops production; a `block` on `publish` allows research and production to
proceed but stops publication. The conductor SHALL list only the blocking/advisory findings for the
current and upcoming phases — it SHALL NOT surface findings for phases already complete.

The live probes SHALL be modelled behind injectable port interfaces (`MagniticReadinessPort` and
`ApifyReadinessPort`) so that tests can inject fakes and the build remains hermetic (no live
`spaces_*`/`creations_*` calls, no credits, no board mutation).

#### Scenario: Healthy readiness produces no output

- **GIVEN** a Brand with valid config, accessible Space, sufficient credits, and a valid Apify token
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** no readiness output is shown to the Operator
- **AND** the conductor proceeds to the rename hint

#### Scenario: Research block stops the launch

- **GIVEN** a Brand whose Apify token is invalid (probe returns false)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** a finding with `severity: 'block'` and `phase: 'research'` is surfaced
- **AND** the conductor stops and does not proceed to the loop

#### Scenario: Production block allows research but stops production

- **GIVEN** a Brand whose Magnific Space is inaccessible (`accessible: false`)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** a finding with `severity: 'block'` and `phase: 'production'` is surfaced
- **AND** the conductor proceeds through research and review but stops before production

#### Scenario: Advisory-only findings do not stop the loop

- **GIVEN** a Brand with `banned_words` empty (advisory finding only)
- **WHEN** `/run-pipeline <brand>` performs the readiness check
- **THEN** the advisory finding MAY be surfaced as a warning
- **AND** the conductor proceeds to the loop (the advisory does NOT block any phase)

---

### Requirement: The conductor prints a rename hint but does not rename the session itself

The conductor SHALL print exactly one line formatted as `/rename <brand> · <ISO-week>` (e.g.
`/rename mundotip · 2026-W23`). This line is a hint for the Operator to paste into their terminal.
The conductor SHALL NOT attempt to rename the session or call any system rename function.

#### Scenario: Rename hint appears in the conductor output

- **GIVEN** a valid Brand `"mundotip"` and a weekly Run in ISO week `2026-W23`
- **WHEN** `/run-pipeline mundotip` runs (healthy readiness)
- **THEN** the output contains a line matching `/rename mundotip · 2026-W\d+`
- **AND** no session rename is performed by the conductor

---

### Requirement: When in-flight work exists, the conductor shows it and asks resume-vs-fresh with no default

The conductor SHALL call `resolvePhase` with the Brand's ledger and its slice of the global Production
Queue. If the resolved `phase` is neither `"research"` nor `"done"`, in-flight work exists. In that
case the conductor SHALL:
1. Display the pending gates and the count of stranded Ideas.
2. Ask the Operator: `"resume or fresh? (type 'resume' or 'fresh')"` with NO default value — the
   Operator MUST type their choice explicitly.
3. If the Operator types `"resume"`: re-enqueue each stranded `accepted` Idea via `enqueueOnAccept`,
   then resume the loop from the current phase.
4. If the Operator types `"fresh"`: start a new weekly Run (proceed to research from scratch, ignoring
   the in-flight state for this session).

Any response that is neither `"resume"` nor `"fresh"` SHALL prompt the Operator again (re-ask with
the same no-default prompt). The conductor SHALL never proceed without an explicit choice.

#### Scenario: No in-flight work proceeds directly to the loop

- **GIVEN** a Brand whose ledger is empty (phase = `"research"`)
- **WHEN** `/run-pipeline <brand>` resolves the phase
- **THEN** the conductor does NOT ask resume-or-fresh
- **AND** it proceeds directly to starting a new Run

#### Scenario: In-flight work triggers the resume-or-fresh prompt with no default

- **GIVEN** a Brand with `casting` Ideas in the ledger (phase = `"production"`)
- **WHEN** `/run-pipeline <brand>` resolves the phase
- **THEN** the conductor shows the pending gates and asks `"resume or fresh?"`
- **AND** the prompt has no default — no choice is made without explicit Operator input

#### Scenario: Resume re-enqueues stranded Ideas and walks the loop from the current phase

- **GIVEN** a Brand with `accepted` Ideas in the ledger and no queue jobs (stranded)
- **AND** the Operator types `"resume"`
- **WHEN** the conductor processes the resume choice
- **THEN** each stranded Idea is re-enqueued (a new `cast`-phase `queued` job appears in the queue)
- **AND** the loop resumes from the `"production"` phase

#### Scenario: Fresh starts a new weekly Run regardless of in-flight state

- **GIVEN** a Brand with `casting` Ideas in the ledger (in-flight work)
- **AND** the Operator types `"fresh"`
- **WHEN** the conductor processes the fresh choice
- **THEN** the loop starts from research (as if the phase were `"research"`)

---

### Requirement: The loop pauses only at the three human gates and never renders past a gate

The conductor SHALL pause the loop exclusively at the three human gates: Review (Gate 1), Cast pick
(Gate 2), and Publish (Gate 3). It SHALL NOT render an Asset before the Operator picks a Character,
and it SHALL NOT auto-publish. Between gates, it SHALL drive the loop autonomously. The loop STATE
(current phase, pending gates, queue) SHALL be recoverable from `ledger.json` + `queue.json` across
turns and days — the Operator can re-invoke `/run-pipeline <brand>` and it will resume from the
correct gate.

#### Scenario: Loop pauses at Gate 1 (Review) and waits for the Operator

- **GIVEN** a Brand in the `"review"` phase (suggested Ideas exist)
- **WHEN** the conductor reaches Gate 1
- **THEN** it invokes review-ideas and pauses for the Operator's accept/reject decisions
- **AND** it does NOT auto-drain production before the Operator acts

#### Scenario: Loop pauses at Gate 2 (Cast pick) and waits for the Operator

- **GIVEN** a Brand with `casting` Ideas (Cast generated, Character not yet picked)
- **WHEN** the conductor reaches Gate 2
- **THEN** it presents the Cast and pauses for the Operator's Character pick
- **AND** it does NOT render the Asset before the pick

#### Scenario: Loop pauses at Gate 3 (Publish) and waits for the Operator

- **GIVEN** a Brand with `produced` Ideas (Asset generated, not yet published)
- **WHEN** the conductor reaches Gate 3
- **THEN** it displays the Asset for review and pauses for the Operator to publish and `/log-post`
- **AND** it does NOT publish automatically

#### Scenario: Loop resumes correctly from ledger+queue state across invocations

- **GIVEN** a Brand that previously reached Gate 2 (phase = `"production"`, gate = `"cast-pick"`)
- **WHEN** `/run-pipeline <brand>` is invoked in a new session
- **THEN** the conductor detects the in-flight work, offers resume, and resumes at Gate 2
- **AND** does NOT restart from research

---

### Requirement: Auto-drain and gate-progression rules are enforced

After Review (Gate 1), the conductor SHALL auto-drain the Production Queue to the Cast gate:
- Invoke the producer to drain all accepted Ideas from `queued` through the cast run-point, stopping
  each at `awaiting_cast` (`casting` in the ledger).
- After draining, the conductor pauses at Gate 2 for each `casting` Idea.

After Cast pick (Gate 2), the conductor SHALL render the Asset unattended:
- Invoke the producer to render the picked Character to a finished Asset (`produced` in the ledger).
- After rendering, the conductor pauses at Gate 3 (Publish).

After `/log-post` (Gate 3), the conductor SHALL offer (not auto-invoke) `/track-performance <brand>`
and `/report <brand>` to the Operator.

#### Scenario: After Review, production auto-drains to the Cast gate

- **GIVEN** the Operator accepted Ideas at Gate 1 (Review)
- **WHEN** the conductor processes the accepted Ideas
- **THEN** it invokes the producer to drain the queue to the Cast gate
- **AND** it pauses at Gate 2 once Ideas are at `casting` status

#### Scenario: After Cast pick, the Asset renders unattended and the conductor pauses for Publish

- **GIVEN** the Operator picked a Character at Gate 2
- **WHEN** the conductor processes the cast pick
- **THEN** it invokes the producer to render the Asset
- **AND** it pauses at Gate 3 once the Asset is `produced`
- **AND** it does NOT pause between picking the Character and completing the render

#### Scenario: After log-post, the conductor offers track-performance and report

- **GIVEN** the Operator logged a Post URL at Gate 3
- **WHEN** the conductor processes the post log
- **THEN** it outputs a message offering `/track-performance <brand>` and `/report <brand>`
- **AND** it does NOT auto-invoke either command

---

### Requirement: The readiness gate exists only in the conductor; granular commands are unguarded

The readiness check (`classify` + `checkConfig` + live probes) SHALL be invoked ONLY by
`/run-pipeline`. The granular commands (`/run-trends`, `/review-ideas`, `/pick-cast`, `/log-post`,
`/queue`, `/report`, `/track-performance`) SHALL NOT call readiness logic. They are power-tools for
Operators who know what they are doing.

#### Scenario: Granular commands do not invoke readiness

- **GIVEN** the `run-pipeline-readiness.ts` module
- **WHEN** the source of any granular command file is inspected
- **THEN** none of them import or call the readiness module

---

### Requirement: The conductor reuses existing granular logic with no duplicated pipeline logic

The conductor SHALL delegate all substantive computation to existing modules:
- Brand resolution → `resolveBrand` (from `src/brand/resolver.ts`)
- Phase resolution → `resolvePhase` (from `src/phase-resolver/resolve.ts`)
- Readiness classification → `classify` (from `src/readiness/classify.ts`)
- Config sanity → `checkConfig` (from `src/readiness/check-config.ts`)
- Re-enqueue → `enqueueOnAccept` (from `src/production-queue/enqueue-on-accept.ts`)
- Review → `/review-ideas` command logic
- Cast/render → production queue worker
- Report → `reportCommand` (from `src/commands/report.ts`)

The conductor SHALL NOT re-implement any of the above logic inline. Its role is orchestration only.

#### Scenario: Conductor delegates to existing modules

- **GIVEN** the `run-pipeline.ts` source file
- **WHEN** it is inspected
- **THEN** brand resolution uses `resolveBrand` (not a reimplementation)
- **AND** phase resolution uses `resolvePhase` (not a reimplementation)
- **AND** readiness uses `classify` and `checkConfig` (not inline logic)
- **AND** re-enqueue uses `enqueueOnAccept` (not a reimplementation)

### Requirement: The conductor SHALL offer to create a Brand when given an unknown slug

The conductor SHALL offer to create that Brand when `/run-pipeline <brand>` is invoked with a slug
that does not exist on disk, rather than stopping with a hard error. The offer message SHALL name
the slug. If the Operator accepts, the conductor starts the staged new-Brand interview. If the
Operator declines, the conductor stops with a clear message and sets `done: true`.

#### Scenario: Unknown slug triggers an offer-to-create prompt

- **GIVEN** a Brand slug `"newbrand"` that does NOT exist in the brands root
- **WHEN** `/run-pipeline newbrand` is invoked
- **THEN** the conductor outputs a message offering to create the Brand, naming `"newbrand"`
- **AND** the conductor prompts the Operator to accept or decline

#### Scenario: Operator accepts — interview runs and Brand is scaffolded

- **GIVEN** the offer-to-create prompt has been shown for slug `"newbrand"`
- **AND** the Operator types `"yes"` (or equivalent)
- **WHEN** the conductor processes the acceptance
- **THEN** the staged interview begins (asking niche, voice, language/region, platform, seed pages)
- **AND** after the interview, the Brand is scaffolded (`data/brands/newbrand/` is created)
- **AND** the pipeline proceeds normally for the new Brand

#### Scenario: Operator declines — conductor stops cleanly

- **GIVEN** the offer-to-create prompt has been shown
- **AND** the Operator types `"no"` (or equivalent)
- **WHEN** the conductor processes the decline
- **THEN** the conductor outputs a message acknowledging the decline
- **AND** it stops with `done: true`
- **AND** no Brand directory is created

---

### Requirement: The conductor SHALL ask new-vs-existing and list existing Brands when given no argument

The conductor SHALL ask the Operator whether they are starting a new Brand or working an existing
one when `/run-pipeline` is invoked with no argument. The prompt SHALL list the existing Brand slugs
(from `listBrands()`). If the Operator picks an existing Brand, the conductor continues with that
slug as if it had been passed as an argument. If the Operator chooses to create a new Brand, the
staged interview begins.

#### Scenario: No argument triggers the new-vs-existing prompt with existing Brands listed

- **GIVEN** at least one Brand exists (e.g. `"mundotip"`)
- **AND** `/run-pipeline` is invoked with no argument
- **WHEN** the conductor starts
- **THEN** it outputs a message listing the existing Brand slugs
- **AND** it asks whether to start a new Brand or work an existing one

#### Scenario: No argument with no existing Brands goes directly to new-Brand interview

- **GIVEN** no Brands exist in the brands root
- **AND** `/run-pipeline` is invoked with no argument
- **WHEN** the conductor starts
- **THEN** it notes there are no existing Brands
- **AND** it begins the new-Brand interview directly

#### Scenario: Operator picks an existing Brand — pipeline continues normally

- **GIVEN** Brands `"mundotip"` and `"acme"` exist
- **AND** the Operator types `"mundotip"` in response to the new-vs-existing prompt
- **WHEN** the conductor processes the choice
- **THEN** it continues with `"mundotip"` as the Brand slug
- **AND** proceeds through the normal pipeline flow (readiness, rename hint, phase resolution, etc.)

---

### Requirement: The new-Brand interview SHALL be staged with pre-scout fields only before scouting

The staged interview SHALL ask ONLY the fields required before Trend Research can proceed:
- Brand name (from which the slug is derived and validated)
- Niche
- Voice
- Language and region
- Platform (facebook | instagram | linkedin)
- At least one seed Page URL

The following fields are DEFERRED — they SHALL NOT be asked before scouting:
- Channel URL
- Banned words
- Required CTA
- Required hashtags

The conductor SHALL NOT invent values for any field. Every field in the scaffolded Brand Profile
SHALL reflect only what the Operator supplied in the interview.

**Language collection**: if the Operator's answer is empty or blank, the conductor SHALL re-ask
rather than substituting a default language code. The re-ask loop SHALL be bounded by an attempt
cap of 3 (matching the Brand-name loop). If the cap is exceeded, the conductor SHALL stop cleanly
with a clear message and `done: true`, and SHALL NOT call `scaffoldBrand` — no Brand directory is
created.

**Platform collection**: if the Operator's answer is empty, OR is not one of `"facebook"`,
`"instagram"`, or `"linkedin"` (case-insensitive), the conductor SHALL re-ask with a message that
names the accepted values and notes that Facebook is the only fully wired platform today. The
re-ask loop SHALL be bounded by an attempt cap of 3. If the cap is exceeded, the conductor SHALL
stop cleanly with a clear message and `done: true`, and SHALL NOT call `scaffoldBrand` — no Brand
directory is created. A valid answer is accepted on the first attempt that produces a recognised
value.

Region is unchanged — it is already captured verbatim and may legitimately be empty.

#### Scenario: Pre-scout interview asks exactly the required fields

- **GIVEN** the staged interview has begun
- **WHEN** the conductor runs the pre-scout interview
- **THEN** it asks for: brand name, niche, voice, language/region, platform, and seed pages
- **AND** it does NOT ask for: Channel URL, banned words, required CTA, or required hashtags

#### Scenario: The scaffolded brand-profile contains exactly the Operator's answers

- **GIVEN** the Operator supplied specific values for niche, voice, language, region, platform,
  and seed pages
- **WHEN** the interview completes and `scaffoldBrand` is called
- **THEN** the written `brand-profile.yaml` contains exactly those values
- **AND** no other brand facts are present (no invented niche, voice, seeds, or URLs)

#### Scenario: Empty Language triggers a re-ask rather than a silent default

- **GIVEN** the interview has reached the Language question
- **WHEN** the Operator submits an empty answer
- **THEN** the conductor re-asks for the language code (does NOT use `"en"` as a default)
- **AND** the Brand Profile's `language` field reflects the Operator's eventual non-empty answer

#### Scenario: Language cap exceeded stops the conductor with no Brand directory created

- **GIVEN** the interview has reached the Language question
- **WHEN** the Operator submits an empty answer on each of the 3 attempts
- **THEN** the conductor stops with a clear message and `done: true`
- **AND** no Brand directory is created under the brands root

#### Scenario: Empty Platform triggers a re-ask rather than a silent default

- **GIVEN** the interview has reached the Platform question
- **WHEN** the Operator submits an empty answer
- **THEN** the conductor re-asks for the platform (does NOT use `"facebook"` as a default)

#### Scenario: Unrecognised Platform triggers a re-ask naming the accepted values

- **GIVEN** the interview has reached the Platform question
- **WHEN** the Operator submits a non-empty but unrecognised value (e.g. `"fb"` or `"tiktok"`)
- **THEN** the conductor re-asks with a message that names the accepted values
  (`facebook`, `instagram`, `linkedin`) and notes Facebook is the only fully wired platform today
- **AND** the unrecognised value is NOT silently mapped to `"facebook"`

#### Scenario: Valid Platform answer (case-insensitive) is accepted on the first valid entry

- **GIVEN** the interview has reached the Platform question
- **AND** one or more empty/unrecognised answers precede a valid one
- **WHEN** the Operator supplies `"Facebook"` (or any case variant of a recognised value)
- **THEN** the conductor accepts it and advances to the next question
- **AND** the Brand Profile's `platform` field holds the lowercase canonical value

#### Scenario: Platform cap exceeded stops the conductor with no Brand directory created

- **GIVEN** the interview has reached the Platform question
- **WHEN** the Operator submits an unrecognised value on each of the 3 attempts
- **THEN** the conductor stops with a clear message and `done: true`
- **AND** no Brand directory is created under the brands root

---

### Requirement: Slug derivation and validation SHALL be applied before scaffolding

The conductor SHALL derive a filesystem-safe slug from the Operator-supplied Brand name using
`slugify`, then validate it with `validateSlug`. If the derived slug is empty (all-non-alphanumeric
name), the conductor SHALL reject the name with a clear message and re-ask for the name. No Brand
directory SHALL be created for an invalid name.

#### Scenario: A normal Brand name yields a valid slug and proceeds

- **GIVEN** the Operator supplies a Brand name like `"Acme Corp"`
- **WHEN** the conductor derives and validates the slug (`"acme-corp"`)
- **THEN** `validateSlug` returns `{ ok: true }`
- **AND** scaffolding proceeds with slug `"acme-corp"`

#### Scenario: An all-non-alphanumeric name is rejected with a clear message

- **GIVEN** the Operator supplies a Brand name like `"???"`
- **WHEN** the conductor derives and validates the slug (empty string)
- **THEN** `validateSlug` returns `{ ok: false, reason: <message> }`
- **AND** the conductor outputs a clear error message naming the invalid input
- **AND** no Brand directory is created

---

### Requirement: The conductor SHALL never invent brand facts

The conductor SHALL strictly relay the Operator's answers through the pure builders to the write
shell. It SHALL NOT supply default niche text, invented seed pages, placeholder voice copy, or
any other brand fact that the Operator did not explicitly provide. Only the Apify actor slugs (a
technical default, not a brand fact) and the standard seeds default fields (lookback_days,
format_focus, ideas_per_run, overperformance_only) are set by the builder without Operator input.

In particular, the conductor SHALL NOT fabricate a Language code (e.g. `"en"`) or a Platform
value (e.g. `"facebook"`) when the Operator's answer is absent or unrecognised — it SHALL re-ask
instead.

#### Scenario: Scaffolded brand-profile reflects only Operator answers

- **GIVEN** the Operator provided niche `"Home tips"`, voice `"Friendly and direct"`, language
  `"en"`, region `"US"`, platform `"facebook"`, and seed page `"https://fb.com/peer1"`
- **WHEN** the interview completes and the Brand is scaffolded
- **THEN** `brand-profile.yaml` contains exactly those values
- **AND** `channel.url` is `""` (the Operator did not provide it)
- **AND** `banned_words` is `[]` (the Operator did not provide it)

#### Scenario: Brand Profile language reflects the Operator's supplied language, not a fabricated default

- **GIVEN** the Operator eventually supplies language code `"pt"` (after one or more re-asks)
- **WHEN** the interview completes and the Brand is scaffolded
- **THEN** `brand-profile.yaml` has `language: "pt"`
- **AND** it does NOT have `language: "en"` (the fabricated default that was removed)

