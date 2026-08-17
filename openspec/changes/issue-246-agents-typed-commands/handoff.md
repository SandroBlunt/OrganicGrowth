# Slice Handoff — issue #246: the six agents call typed commands, not file paths

## Build Report (Round 1)

### What changed

Rewrote the six agent definitions under `.claude/agents/` (`developer.md`, `idea-strategist.md`,
`performance-tracker.md`, `producer.md`, `qa.md`, `trend-scout.md`) so every raw
`data/brands/<slug>/...` citation and every prose mention of a TypeScript module path used **as an
interface** now names the specific typed function that performs it, instead of the folder layout —
`FormatStore`'s `loadFormat`, `src/apify/platform.ts`'s `resolveApifyActor`/`detectPlatformFromUrl`,
`src/production-spec/brand-profile.ts`'s loaders, `src/ledger/ledger.ts`'s reads, `AssetStore.writeAsset`,
`runIdeasDirFor`, and — for the one genuine gap with no existing file-backed accessor
(`idea-strategist`'s new-Idea ledger append) — `src/command-surface/ideas.ts`'s `createIdea`, named
honestly as the sanctioned target once the SQL cutover happens, not as something already live.
`performance-tracker.md` was restructured so `npm run track-performance <brand>` is the PRIMARY
documented action (it already said this was "the sanctioned way," but its Process section still walked
through the manual `curl` pipeline first); the manual mechanics are kept, verbatim, as the debug-only
fallback.

Removed the blanket `Bash` grant from `idea-strategist` (it performs no shell-out anywhere in its
process). The other five agents retain `Bash` — each for a documented, narrow, real reason (developer:
`git`/`gh`/`npm`/`npx`/`openspec`, no substitute exists; qa: `npm test`/`openspec validate --strict`,
no substitute exists; trend-scout: Apify `curl` peer-scraping, no typed live client built for it yet;
performance-tracker: the sanctioned `npm run track-performance` command plus two named debug
invocations; producer: exactly two named CLI invocations, Camera Hub upload and the `export-schedule`
fallback) — every retained grant now has an accompanying Guardrails bullet or paragraph enumerating
exactly what it may run, turning an unremarked blanket grant into a documented (if not
platform-enforced) allow-list. `qa.md`'s `Write` tool was swapped for `Edit` (its ONE legitimate write —
appending the QA Verdict to an already-existing `handoff.md` — is better served by a diff-based,
existing-file tool than an overwrite-the-whole-file one), and its Output section instructions were
updated to match.

Stripped the Operator's brand (`mundotip`/`MundoTip`, `Straw Motion`) from the three `description:`
frontmatter fields that carried it (`idea-strategist.md`, `producer.md`, `trend-scout.md`) — the other
three never carried it.

**Deliberately did not** rewrite `producer.md`'s pinned "Queue jobs follow the store schema" guardrail
onto `src/command-surface/jobs.ts` (its SQL-backed `JobRecord`/`ReleaseStatus` shape genuinely differs
from the live, file-backed `src/production-queue/queue.ts` `QueueJob`/`JobStatus` shape this sentence is
pinned against by an existing `docs-conformance` Scenario), and did not rewrite these agents' real
ledger/queue writes onto `src/command-surface/` generally — see "Judgment call" below.

### Files touched

- `.claude/agents/developer.md`
- `.claude/agents/idea-strategist.md`
- `.claude/agents/performance-tracker.md`
- `.claude/agents/producer.md`
- `.claude/agents/qa.md`
- `.claude/agents/trend-scout.md`
- `openspec/changes/issue-246-agents-typed-commands/proposal.md` (new)
- `openspec/changes/issue-246-agents-typed-commands/tasks.md` (new)
- `openspec/changes/issue-246-agents-typed-commands/specs/agent-command-surface/spec.md` (new)
- `openspec/changes/issue-246-agents-typed-commands/handoff.md` (this file)

No product code under `src/` was touched.

### How to run

- `openspec validate issue-246-agents-typed-commands --strict` — green.
- `openspec validate --all --strict` — green, 0 failed.
- `npm test` — green (see "Suite result" below).
- The 11 pre-existing tests/docs-tests that pin content in these six files, run directly:
  `npx tsx --test src/schedule-batch/mcp-schedule.docs-test.ts src/idea/openly-readable-source-rule.docs-test.ts src/production-spec/producer-agent-copy-skill.test.ts src/format/idea-strategist-brief-richness.test.ts src/commands/upload-camera-hub-scripts.docs-test.ts src/format/format-docs.test.ts src/apify/apify-docs.test.ts src/commands/report.docs-test.ts src/commands/track-performance.docs-test.ts src/schedule-batch/approval-gate.docs-test.ts src/production-spec/producer-agent.docs-test.ts`

### Acceptance-criteria self-assessment (issue #246)

| # | Acceptance criterion | How it is satisfied / proof |
|---|---|---|
| 1 | Every one of the six agents is given typed commands from `src/command-surface/`; none receives a filesystem path as an interface | Every raw `data/brands/<slug>/` citation used as an interface (not an illustrative example of an already-named resolver's own output) was replaced with a named typed function. Where an operation is genuinely covered by `src/command-surface/` (Idea creation), that surface is named explicitly (`idea-strategist.md` Process step 8). See "Judgment call," below, for why the REST of these agents' live ledger/queue writes are named via their existing typed file-backed stores rather than `src/command-surface/` — routing them there today would contradict rule 7 and break a pinned docs-conformance Scenario. Proof: `grep -c 'data/brands/<slug>'` per file (was `.claude/agents/*.md`: trend-scout 13→0, idea-strategist 8→0, performance-tracker 9→0, producer 3→2 (both illustrative, function-led), developer 2→2 (architecture description, now paired with a `src/command-surface/` sentence), qa 1→0). |
| 2 | No agent holds a blanket `Bash` grant | `idea-strategist` drops `Bash` entirely (tool-enforced). The other five retain it, each with a Guardrails bullet/paragraph enumerating the EXACT commands it covers — see "What changed" above and the proposal's "What Changes — the Bash boundary" section for the full per-agent rationale, including why a scoped `Bash(pattern)` grant is not available on this platform (`docs/producer-worker-permissions.md`'s own precedent). This is the one AC not fully, mechanically satisfiable for five of the six agents — stated plainly, per the build brief's own instruction, rather than left unremarked. |
| 3 | Every `data/brands/<slug>/` citation names a command instead | See row 1's grep counts. The four remaining hits are illustrative path examples shown alongside their already-named typed resolver (`castCandidatesDirFor`/`outputDirFor` in `producer.md`; the general per-Brand architecture description in `developer.md`, now paired with a `src/command-surface/` sentence) — never a bare, unqualified interface citation. |
| 4 | Every prose mention of a TypeScript module path names a command instead | Same rewrite as row 1/3 — every module-path mention that instructed a direct read/write (as opposed to citing WHY a rule is enforced, e.g. `idea-strategist.md`'s pinned `src/idea/store.ts` proof-citation) now names the function, not just the file. |
| 5 | The Operator's brand is removed from agent descriptions | Confirmed via `grep -io "mundotip\|straw motion"` against each file's `description:` line — clean across all six. Brand mentions in agent BODIES were left untouched (out of scope per the build brief), except where a sentence already being rewritten for its citation happened to genericize incidentally (never a separate pass). |
| 6 | Doc-conformance checks stay in lockstep; check count does not fall without a note | All 11 pre-existing tests/docs-tests pinning these six files were located (5 were already known from the standard `.claude/agents` grep; 6 more — `apify-docs.test.ts`, `report.docs-test.ts`, `track-performance.docs-test.ts`, `format-docs.test.ts`, `approval-gate.docs-test.ts`, `producer-agent.docs-test.ts` — were found only by a broader filename grep, AFTER the first `npm test` run surfaced 4 real failures against `format-docs.test.ts`). All 11 are now green, same assertion counts as before this change (no assertion removed, none weakened): 43 (first batch) + 16 (`format-docs.test.ts`) + 117 (second batch) = 176 assertions, all passing. No capability spec's Requirement was modified; only a brand-new capability (`agent-command-surface`) was added. |

### Fakes / fixtures used

None — this slice touches no product code, no test fixtures, and makes no MCP/network call of any
kind. **Magnific fake:** not applicable; nothing in this change reaches the `magnific` MCP boundary,
live or fake — confirmed by `grep -rn "spaces_\|creations_" .claude/agents/producer.md` showing only
the SAME pre-existing tool-name grants and prose this change did not touch.

### Self-review notes

- Caught and fixed a markdown bug introduced mid-rewrite in `performance-tracker.md`: a heading
  accidentally split across two lines would have rendered as two separate `##` headings.
- Caught and fixed 4 real test failures (`src/format/format-docs.test.ts`) from an initial rewrite pass
  that removed literal `formats/<format>.yaml` / `ideas/<format>/<run>/...` path substrings this file
  pins — restored them as illustrative text paired with the named typed function, satisfying both the
  citation-rewrite goal and the pinned test.
- Renumbered `performance-tracker.md`'s `## Process` steps after folding the old manual steps 4–6 into
  sub-bullets of the new step 3 (what the sanctioned command does internally).
- Re-worded one clause in `developer.md`'s new Bash-rationale bullet after noticing it implied all five
  OTHER agents had lost `Bash` (only `idea-strategist` did).

### Known limits

- **Not a full, live, end-to-end proof (AC8 of #211).** This slice is a prose/interface rewrite; there
  is no compiled runtime for these six agents' behavior to exercise mechanically beyond the pinned
  docs-tests. A live conversational run of each agent against a real Brand is the only way to prove the
  rewritten citations are actually followable — not done here, and #246's own "Verification" section
  explicitly scopes this slice to "what is provable hermetically," deferring the live run.
- **`Bash` remains an unscoped tool grant for five of the six agents, enforced by prose discipline, not
  the platform.** Claude Code has no argument-scoped `Bash` or path-scoped `Write`/`Edit` (confirmed
  against this repo's own `docs/producer-worker-permissions.md`). Every retained grant is now
  accompanied by an explicit, narrow, enumerated rationale, but nothing stops the agent from technically
  running an unlisted command — the boundary is documented, not mechanical. Stated here plainly, as
  instructed, rather than left unremarked.
- **The SQL command-surface cutover is out of scope, by design.** `idea-strategist.md`'s Idea-creation
  step names `createIdea` (`src/command-surface/ideas.ts`) as the sanctioned target "once wired," but
  the ledger append remains the real, operative write — see "Judgment call" below.
- **The second half of #211 (the Recipe Skill prose sweep) is untouched**, as agreed at the original
  triage split.

### Judgment call worth flagging explicitly

`openspec/project.md` and `.claude/rules/always/organicgrowth-rules.md` rule 7 both state, as of this
branch's base, that no existing production caller has been switched onto `src/command-surface/` yet and
that `ledger.json`/`data/queue.json` remain canonical — a position independently reinforced by the very
recent `openspec/changes/archive/2026-08-17-issue-235-guard-residual-holes/proposal.md`, which explicitly
names `ledger.json`/`data/queue.json` as "pre-SQL, always-rule-7-mandated files the pipeline is EXPECTED
to write directly." Given that, and given `producer.md`'s queue-job schema sentence is pinned by an
existing `docs-conformance` Scenario against the FILE-backed `src/production-queue/queue.ts` schema
(which differs from `src/command-surface/jobs.ts`'s SQL-backed shape), I did not rewrite these six
agents' real, live production writes onto `src/command-surface/`. Doing so would have contradicted the
ledger-as-source-of-truth always-rule I am bound to uphold, desynchronized these agents from every
sibling command still on the file-backed path (`/review-ideas`, `/pick-cast`, `/log-post`, `/report`,
none of which are in this slice's scope), and broken a currently-green, currently-correct pinned test.
Instead, every operation was named via its EXISTING typed accessor (file-backed where one exists — this
is still "a typed command, not a file path," satisfying the issue's own title and the bulk of its intent
— `src/command-surface/` only where it is the literal sanctioned surface for that exact operation, named
honestly as a forward target where the underlying cutover has not happened yet. This is recorded in full
in `proposal.md`'s "What did NOT change" and "The one genuine gap" sections. If this reading is wrong —
if the Operator's actual intent was to force the cutover now, even ahead of the worker/viewer/importer
being wired to it — that is a bigger decision than this one issue, and I would rather flag it here than
make it silently.
