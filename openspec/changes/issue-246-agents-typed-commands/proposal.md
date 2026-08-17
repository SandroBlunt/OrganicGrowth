## Why

Issue #211 ("Agents call typed commands, not file paths") was flagged at triage as too large for one
build context and split in advance into two halves. Re-measured after PR #213 restored `.claude/`, it
came in ~30% over its ticket estimate (25 files citing `data/brands/<slug>/`, 76 distinct module paths,
173 mentions). This change (#246) is the **first half**: the **six agent definitions** under
`.claude/agents/` — `developer`, `idea-strategist`, `performance-tracker`, `producer`, `qa`,
`trend-scout`. The second half (the Recipe Skill prose sweep) is a separate ticket.

Two problems motivate the rewrite:

1. **A filesystem path is a leaky interface.** Several of the six agents' prose told the agent to `Read`
   a raw `data/brands/<slug>/formats/<format>.yaml`, `.../seeds.yaml`, or `.../brand-profile.yaml` path
   directly — making the agent's behavior depend on the Operator's folder layout rather than on a typed,
   tested accessor. `trend-scout.md` alone carried 13 such citations, `idea-strategist.md` 8,
   `performance-tracker.md` 9.
2. **A tool list containing `Bash` is not a boundary when the agent's own prose forbids what `Bash`
   permits.** `qa.md`'s stated contract is "never edits product code," yet its tool list held both
   `Write` (unscoped — can silently recreate any file wholesale) and `Bash` (unscoped — can edit any
   file via shell redirection, bypassing `Write` entirely). A declared tool list that permits what the
   prose forbids is a comment, not a boundary.

## What Changes — the citation rewrite

Every one of the six agent files was audited for raw `data/brands/<slug>/...` citations and raw
TypeScript-module-path mentions used **as an interface** (as opposed to a citation proving an editorial
rule's real enforcement — see "What did NOT change," below). Each was replaced with the specific typed
accessor that already exists for that exact read/write, so the agent is told a *function*, never a
*folder shape*:

- **Format config** (`sources.mode`, `voice`, `ideas_per_run`, `default_recipes`, …) — now cited via
  `FormatStore`'s `loadFormat(brand, format)` (`src/format/store.ts`), not a raw
  `data/brands/<slug>/formats/<format>.yaml` path.
- **Apify actor resolution** — now cited via `src/apify/platform.ts`'s `resolveApifyActor(apifyConfig,
  platform, purpose)` (paired with the pre-existing `detectPlatformFromUrl`), not a bare
  `data/brands/<slug>/seeds.yaml` mention.
- **Brand-wide hard rules** (banned words, copy rules) — now cited via
  `src/production-spec/brand-profile.ts`'s `loadBannedWords`/`loadCopyRules`, not a raw
  `brand-profile.yaml` path.
- **Ledger reads** (Your Data, scored history) — now cited via `src/ledger/ledger.ts`'s
  `loadIdeas`/`loadReport`, already the pattern `producer.md` used; `idea-strategist.md` and
  `trend-scout.md` now match it.
- **Run output paths** (Trends, Briefs) — already resolved via the typed `runIdeasDirFor`
  (`src/format/run-id.ts`, ADR-0023) before this change; tightened further by removing the redundant
  raw-path restatements that sat alongside it.
- **`performance-tracker.md` is restructured to lead with the sanctioned command.** It already stated
  `npm run track-performance <brand>` was "now the sanctioned way to pull REAL metrics," but its
  `## Process` section still walked through the manual `curl` pipeline as the PRIMARY documented flow.
  The command is now Process step 2 (call it, report its output verbatim); the manual `curl`
  mechanics — the field-mapping table, the score formula, the maturity rule, all preserved verbatim —
  are relabeled as what the command does internally, kept only for one-off debugging of a single post's
  raw Apify response.

### The one genuine gap, and how it is handled honestly

Two operations (`idea-strategist`'s new-Idea creation, `trend-scout`'s new-Trend creation) have **no
existing file-backed typed write function at all** — both agents write a brand-new JSON record via the
`Write` tool because no `saveIdea`/`saveTrend` accessor was ever built for the file-backed ledger. For
`idea-strategist.md` (the only one where this matters — trend-scout's `trends.json` write is a fresh
Run artifact, not a ledger append), the ledger-append step now names `src/command-surface/ideas.ts`'s
`createIdea` (which wraps `src/idea/store.ts`'s SAME-named function, including its
`IdeaValidationError`s) as **the sanctioned command for this operation once the Brand's data is on the
SQL-backed pipeline (issue #205)** — while stating plainly that, until that cutover, the ledger append
is the operative write. This is not a cosmetic hedge: `openspec/project.md` and
`.claude/rules/always/organicgrowth-rules.md` rule 7 both currently state, as of this branch's base
commit, that **no existing production caller has been switched onto `src/command-surface/` yet** and
that `ledger.json`/`data/queue.json` remain canonical. Silently rewriting these six agents' real,
live-production writes onto the SQL surface would contradict the ledger-as-source-of-truth always-rule
and desynchronize them from every other still-file-backed command (`/review-ideas`, `/pick-cast`,
`/log-post`, `/report`) — none of which are in scope for this change. Naming the command as the
sanctioned target, honestly scoped to "once wired," is the faithful reading of issue #246's own ask
without breaking a currently-correct, currently-tested, currently-live behavior.

### What did NOT change — the pinned queue-job schema

`producer.md`'s "Queue jobs follow the store schema" guardrail still cites `src/production-queue/queue.ts`
verbatim, unchanged. `openspec/specs/docs-conformance/spec.md`'s own Scenario
("producer.md's queue-job schema description matches the live schema, not the retired one") pins this
sentence against that file's REAL, file-backed `QueueJob`/`JobStatus` types — which differ from
`src/command-surface/jobs.ts`'s SQL-backed `JobRecord`/`ReleaseStatus` shape (different status vocabulary
entirely). Renaming this citation onto the command surface would have broken a passing, pinned
docs-conformance scenario to chase a citation rewrite the underlying system is not yet wired to honor.
This is the same class of judgment call `.claude/agents/developer.md`'s "Respect the canon" guardrail
already demands: never invent a fact the code does not yet support.

## What Changes — the Bash boundary

Claude Code cannot scope a tool grant to specific commands or specific files: there is no
argument-scoped `Bash` and no path-scoped `Write`/`Edit` (confirmed against this repo's own
`docs/producer-worker-permissions.md`, which records the identical limitation for the
`mcp__magnific__*` grant — "an allow rule grants the tool regardless of its arguments"). Given that
constraint, each of the six agents was re-examined for what it genuinely needs:

- **`idea-strategist`** does no shell-out anywhere in its process (pure Read/Write/Edit of files and
  LLM authoring) — **`Bash` is removed from its tool list entirely.** This is the one agent where the
  boundary is now a real, tool-enforced one, not merely a documented one.
- **`developer`** keeps `Bash` — it is the engineering agent; its whole job is `git`/`gh`/`npm test`/
  `npx tsx`/`openspec`, for which there is no narrower tool. A new guardrail bullet states this
  explicitly and bounds its scope (engineering tooling only, never a live Brand/Space/Zoho).
- **`qa`** keeps `Bash` — job (a) of its own contract ("run the full suite and confirm green") is not
  achievable without executing `npm test`/`openspec validate --strict`, and no narrower tool exists. Its
  tool list drops `Write` for `Edit` (an existing-file, diff-based tool, closer to "append" semantics
  than "recreate the whole file"), and a new paragraph enumerates the EXACT commands it may run
  (`npm test`, `npm run test:docs`, `openspec validate --strict`, read-only `git`/`gh`), stating plainly
  that this is a documented-discipline boundary, not a tool-enforced one, given the platform limitation
  above.
- **`trend-scout`** keeps `Bash` — Apify peer-scraping is raw `curl` with no typed live-client wrapper
  built for it yet (unlike performance-tracker's post-scrape, issue #200). A new guardrail bounds it to
  the Apify calls only.
- **`performance-tracker`** keeps `Bash` — needed to invoke `npm run track-performance`/
  `npm run apify-smoke` and the manual-debug `curl` fallback. A new guardrail bounds it to those two
  uses.
- **`producer`** keeps `Bash` — needed for exactly two named CLI invocations
  (`uploadCameraHubScriptsCommand`, `npm run export-schedule`). A new guardrail names both and forbids
  any other use.

Every retained `Bash` grant is now accompanied by prose stating exactly what it may run — turning an
unscoped grant into a **documented allow-list**, even though the platform cannot enforce it
mechanically. This is stated plainly, per the build brief's own instruction, rather than left unremarked.

## What Changes — descriptions and other light edits

- The Operator's brand (`mundotip`/`MundoTip`, `Straw Motion`) is removed from all three `description:`
  frontmatter fields that carried it (`idea-strategist.md`, `producer.md`, `trend-scout.md`), replaced
  with generic `<brand>`/"a Brand" phrasing. `developer.md`, `performance-tracker.md`, and `qa.md`
  carried no brand name in their `description:` field already. Brand-specific content in agent BODIES
  (not the indexed `description:` field) is out of scope per the build brief and was left untouched,
  except where it sat inside a sentence already being rewritten for its citation (in which case it was
  genericized incidentally, never as a separate pass).

## What did NOT change — the protected editorial rules, verbatim

The following were read, confirmed, and left **byte-for-byte unchanged**:

- `idea-strategist.md`'s primary-source-discipline and paywalled-feeds-are-signal-only paragraphs
  (Process step 6) — independently proven unchanged by `src/idea/openly-readable-source-rule.docs-test.ts`
  (5 assertions, still green).
- `idea-strategist.md`'s Hard Boundary + brief-richness rules (angle/hook/talking-point concreteness) —
  independently proven unchanged by `src/format/idea-strategist-brief-richness.test.ts` (10 assertions,
  still green).
- `producer.md`'s Zoho MCP scheduling sequence, Camera Hub upload offer, and Copy-phase Skill-resolution
  sections — independently proven unchanged by `src/schedule-batch/mcp-schedule.docs-test.ts` (14
  assertions), `src/commands/upload-camera-hub-scripts.docs-test.ts` (8 assertions), and
  `src/production-spec/producer-agent-copy-skill.test.ts` (4 assertions), all still green.
- Every agent's brand-safety / never-fabricate / relative-not-absolute / explicit-attribution language.

No rule's phrasing was tidied, compressed, or modernized while moving it; where a rule and a citation
shared one sentence, the sentence was split rather than paraphrased (e.g. idea-strategist's Guardrails
"Voice comes from the Format, not the Brand" bullet: the citation half was replaced with `loadFormat`,
the rule half — "never from `brand-profile.yaml`'s legacy copy" — is untouched).

## Capabilities

### Added Capabilities

- `agent-command-surface`: the six content/engineering agent definitions under `.claude/agents/` cite
  typed commands/store accessors instead of raw filesystem paths for their pipeline operations, hold no
  unscoped `Bash` grant without a documented, narrow rationale, and carry no Operator brand name in their
  indexed `description:` field.

## Impact

- **Modified:** `.claude/agents/developer.md`, `.claude/agents/idea-strategist.md`,
  `.claude/agents/performance-tracker.md`, `.claude/agents/producer.md`, `.claude/agents/qa.md`,
  `.claude/agents/trend-scout.md`.
- **New:** `openspec/changes/issue-246-agents-typed-commands/` (this change).
- **Untouched:** every other `.claude/` file (including the Recipe Skill files #211's second half
  covers), `CONTEXT.md`, every ADR, `.claude/rules/always/organicgrowth-rules.md`, and all product code
  under `src/`.
- **Hermetic.** This slice touches no product code and makes no live Magnific/Apify/Zoho call; its own
  proof is five pre-existing docs-tests (43 assertions across 14 suites) re-run against the edited files,
  plus the full `npm test` suite for regression.
- **Always-rules upheld, deliberately not extended onto SQL.** Ledger-as-source-of-truth is honored by
  *not* rewiring these agents' real writes onto `src/command-surface/` ahead of the actual cutover — see
  "The one genuine gap" and "What did NOT change" above.
