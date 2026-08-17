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

---

## QA Verdict — Round 1: FAIL

### Suite result

- `openspec validate issue-246-agents-typed-commands --strict` → `Change 'issue-246-agents-typed-commands' is valid`. Green.
- `openspec validate --all --strict` → `Totals: 63 passed, 0 failed (63 items)`, including `change/issue-246-agents-typed-commands`. Green.
- `npm test` → `# tests 3373 / # suites 890 / # pass 3373 / # fail 0`. Green, and **exactly** matches
  `main`'s (93f9736) baseline — confirming, mechanically, that this slice added zero tests (see "Zero new
  tests," below) and dropped none.
- The 11 named docs-tests run directly together: `# tests 178 / # suites 40 / # pass 178 / # fail 0`.
  Green. Note: several of these suites pin OTHER documents (`templates/brand-skeleton/*.yaml`,
  `CONTEXT.md`, `CLAUDE.md`, `.claude/commands/*.md`, `docs/adr/*`, `docs/zoho-mcp-server-setup.md`) —
  not just the six `.claude/agents/*.md` files — so 178 is not directly comparable to the handoff's own
  "176 assertions pinning these six files" sub-count. I did not hand-verify that exact 43+16+117=176
  breakdown line by line (it requires manually attributing each `it()` to one of the six files vs. a
  sibling doc in the same test file). The stronger, mechanical guarantee stands regardless: none of these
  11 test files was modified by this branch (confirmed: `git diff main --stat -- .claude/` touches only
  the six `agents/*.md` files), and `npm test`'s grand total is identical to `main`'s — so nothing pinning
  any of these six files was silently dropped or weakened, whatever the precise sub-count is.

### Per-criterion results (issue #246)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Typed commands from `src/command-surface/`; no filesystem path as interface | **PASS (with the judgment call noted)** | `grep -c 'data/brands/<slug>'` verified independently against `main` and against this branch for all six files: 13→0, 8→0, 9→0, 3→2, 2→2, 1→0 — exact match to the handoff's own claim. Remaining hits (producer.md ×2, developer.md ×2) independently confirmed illustrative, each paired with its named resolver (`castCandidatesDirFor`, `outputDirFor`, the `src/command-surface/` architecture sentence). |
| 2 | No agent holds a blanket `Bash` grant | **FAIL — see "The Bash criterion" below** | `grep '^tools:' .claude/agents/*.md` confirms `idea-strategist` alone dropped `Bash`; the other five retain a bare, unscoped `Bash` with prose only. This was achievable and was not done — see ruling below. |
| 3 | Every `data/brands/<slug>/` citation names a command | **PASS** | Same evidence as row 1. |
| 4 | Every module-path mention names a command | **PASS** | Spot-checked all six diffs against `main`; every module-path mention used as an interface now names a function (`loadFormat`, `resolveApifyActor`, `loadBannedWords`/`loadCopyRules`, `loadIdeas`/`loadReport`, `AssetStore.writeAsset`, `runIdeasDirFor`, `createIdea`). Bare-file citations that remain (e.g. `src/idea/store.ts` in idea-strategist.md's openly-readable-source paragraph) are proof-citations for an enforcement fact, not read/write interfaces — consistent with the spec delta's own carve-out. |
| 5 | Operator's brand removed from descriptions | **PASS** | `grep -n '^description:' .claude/agents/*.md \| grep -io 'mundotip\|straw motion'` → zero matches, all six files. Remaining "Straw Motion" mentions (producer.md:272, trend-scout.md:23) are illustrative examples in BODY prose, out of scope per the issue's own text ("that is the field a catalogue indexes"). |
| 6 | Doc-conformance checks stay in lockstep, count doesn't silently fall | **PASS (see Suite result nuance above)** | All 11 named files green, 178/178. No test file touched by this branch. `openspec validate --all --strict` also green — only an ADDED capability, no existing spec's Requirement modified. |

### Per-scenario results (spec delta: `agent-command-surface`)

| Scenario | Result | Covering evidence |
|---|---|---|
| idea-strategist reads via `loadFormat`, not a raw path | PASS | Diff-verified; `idea-strategist-brief-richness.test.ts` green. |
| trend-scout resolves the actor via `resolveApifyActor` | PASS | Diff-verified; `apify-docs.test.ts` green. |
| performance-tracker's primary action is the sanctioned command | PASS | Diff-verified restructure; Process step 2 now calls `npm run track-performance <brand>` first. |
| The one genuine gap (`createIdea`) named honestly, ledger append stated as operative | PASS | Confirmed `src/command-surface/ideas.ts`'s `createIdea` is genuinely SQL-backed (`db: DatabaseSync` param) — a real, distinct surface, not a relabeling of the file-backed write; idea-strategist.md states the ledger append is still the operative write, citing rule 7. |
| The queue-job schema citation is left unchanged, not rewritten onto the SQL surface | PASS | Confirmed `producer.md:514` still cites `src/production-queue/queue.ts` verbatim; confirmed the pinned docs-conformance Scenario is real (`openspec/specs/docs-conformance/spec.md:37`) and is checked by `producer-agent.docs-test.ts` (`recipe`/`awaiting_pick` assertions), which is green. Confirmed `src/command-surface/jobs.ts` is genuinely SQL-backed with a different vocabulary — rewriting the citation there would have broken a real, currently-correct test. |
| idea-strategist's tools: carries no `Bash` | PASS | `grep '^tools:' .claude/agents/idea-strategist.md` → `Read, Write, Edit`. |
| Every other agent's retained `Bash` is accompanied by an enumerated rationale | PASS (documentation exists) / **but see Bash ruling** — the rationale exists but the underlying premise (no narrower mechanism exists) is false | Guardrails bullets/paragraphs present and enumerated in all five files (diff-verified). |
| qa's file-write tool narrowed `Write`→`Edit` | PASS | `grep '^tools:' .claude/agents/qa.md` → `Read, Bash, Grep, Edit`; Output section instructs `Edit`-based appending. |
| descriptions carry no Operator brand name | PASS | See criterion 5 above. |
| protected editorial rules move through verbatim | PASS (with one documentation gap, see below) | See "Editorial rules" section below. |
| doc-conformance stays in lockstep | PASS | See criterion 6 above. |

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS. No product code touched; no change to any publish path.
- **Public-metrics-only** — PASS. No metrics code touched; performance-tracker.md's Apify-only sourcing language is unchanged in substance.
- **Relative-not-absolute** — PASS. The Performance Score formula (baseline-relative `norm(metric)`) is byte-for-byte unchanged in performance-tracker.md (diff-verified — only the surrounding step numbering/citations moved).
- **Explicit-attribution** — PASS. producer.md's `/log-post`-style attribution language and the per-Recipe Asset framing are untouched.
- **Ledger-as-source-of-truth** — PASS. Verified independently (see "Judgment call" ruling below): the six agents' real, operative writes still target the file-backed ledger/queue exactly as before; the one new `src/command-surface/` citation is honestly scoped as "sanctioned once wired," not a claim that the SQL path is live today.
- **Magnific fake / hermetic check** — PASS. `git diff main --stat -- .claude/` touches only the six `agents/*.md` files (no `.claude/skills/`, no `.claude/commands/`). `producer.md`'s `mcp__magnific__*` tool grants and `spaces_*`/`creations_*` mentions are byte-identical to `main` (diff-verified, zero lines changed in that frontmatter line or those references). No live-Space call was made by me during this verification.

### The Bash criterion — ruling: NOT achieved, and it was achievable

**Verdict: the criterion is achievable, and it was dodged. This is the deciding defect for this round.**

The build's claim (proposal.md "What Changes — the Bash boundary"; repeated in `qa.md`, `developer.md`,
and the handoff's own AC2 row): *"Claude Code cannot scope a tool grant to specific commands or specific
files: there is no argument-scoped `Bash`... confirmed against this repo's own
`docs/producer-worker-permissions.md`."*

I read `docs/producer-worker-permissions.md` directly. It says exactly one relevant thing: *"an
`mcp__magnific__*` allow rule grants the tool regardless of its arguments — it cannot be scoped to a
single Space id."* That is a real, true, narrow fact about **MCP tool grants** (there is no
argument-scoping concept for an arbitrary MCP tool call's parameters in Claude Code's permission system).
**It says nothing about `Bash`, and does not generalize to it.** The build cited a fact about one tool
class (MCP) to support a claim about a different tool class (Bash) that the cited document never
addresses.

I then verified Claude Code's actual `Bash` scoping capability directly, three independent ways, inside
this very environment:

1. **The CLI's own `--allowedTools` help text** (extracted from the installed
   `@anthropic-ai/claude-code` binary): *"Comma or space-separated list of tool names to allow (e.g.
   `"Bash(git *) Edit"`)"* — with exact-match (`Bash(npm run test)`) and prefix-wildcard (`Bash(git *)`)
   forms both documented in the binary's own embedded permission-rule reference.
2. **Anthropic's own built-in skill-authoring wizard** (also embedded in the shipped binary, the prompt
   used by the `/skill` creation flow) instructs, verbatim: *"`allowed-tools`: Minimum permissions needed
   (use patterns like `Bash(gh *)` not `Bash`)."* This is Anthropic's own first-party guidance,
   recommending exactly the "narrow the Bash grant with a pattern" move this ticket asks for, inside a
   tool-list frontmatter field structurally identical to `.claude/agents/*.md`'s own `tools:` field.
3. **The Operator's own live global `~/.claude/settings.json`** (loaded in this very session) already
   contains real, in-production `Bash(...)`-scoped permission rules (e.g.
   `"Bash(gh issue create --title '...' --body ' *)"`) — conclusive, first-party proof this mechanism is
   real and actively used, not merely a theoretical CLI flag.

`grep '^tools:' .claude/agents/*.md` on this branch shows all five Bash-retaining agents keep a bare,
unscoped `Bash` — none use `Bash(<pattern>)` anywhere. Given developer's own stated per-agent
rationale (e.g. qa: "`npm test`, `npm run test:docs`, `openspec validate --strict`, and read-only
`git`/`gh`"; developer: "`git`/`gh`/`npm`/`npx`/`openspec`"), each of these was directly expressible as a
short list of `Bash(<pattern>)` entries in the SAME `tools:` field this slice already edits (e.g.
`Bash(npm test)`, `Bash(npm run test:docs)`, `Bash(openspec validate *)`, `Bash(git status)`,
`Bash(git diff *)`, `Bash(git log *)`, `Bash(git show *)`, `Bash(gh issue view *)` for `qa`).

This is precisely what issue #211 (this ticket's own parent) criticized: *"A tool list containing `Bash`
is not a boundary... Authorisation moves to the command surface."* The build's own prose narrowing is a
genuine, real improvement over silence, but it is not what AC2 asked for, and AC2 was achievable. Per the
brief's own instruction — *"If achievable and dodged, fail the slice"* — **this fails the slice.**

**What would achieve it:** replace the bare `Bash` entry in each of the five agents' `tools:` frontmatter
with the enumerated `Bash(<pattern>)` list already implied by that agent's own existing prose rationale
(one pattern per named command/prefix). This converts the "documented, not platform-enforced" boundary
this build settled for into an actual, tool-enforced one — which is the literal wording of the AC
("...so a declared tool list is an actual boundary").

### The judgment call (routing ledger/queue writes) — ruling: sound

Independently verified, not just re-read:

- `src/command-surface/ideas.ts`'s `createIdea`, `src/command-surface/jobs.ts`'s
  `enqueueJob`/`claimJob`/`releaseJob`, and `src/command-surface/assets.ts`'s `saveAsset` all take a
  `db: DatabaseSync` first argument — genuinely SQL-backed, not a relabeling of the file-backed write.
- `openspec/specs/docs-conformance/spec.md:37`'s "producer.md's queue-job schema description matches the
  live schema, not the retired one" Scenario is real, and is enforced by
  `producer-agent.docs-test.ts`'s `recipe`/`awaiting_pick` assertions (confirmed green) against
  `src/production-queue/queue.ts` — a different status vocabulary than
  `src/command-surface/jobs.ts`'s `JobRecord`/`ReleaseStatus`. Rewriting producer.md's citation onto the
  SQL surface would have broken this real, currently-correct test, exactly as claimed.
- Rule 7 and the cited archived proposal (`2026-08-17-issue-235-guard-residual-holes`) do currently state
  `ledger.json`/`data/queue.json` remain canonical; #205/#208's own history (no production caller on SQL
  yet, the file queue and SQL `job` table unsynchronized) is accurately represented.
- Reading all six files together, the result is a **coherent** interface, not a mixture: every OPERATIVE
  write is named via a file-backed typed accessor throughout; the one command-surface citation
  (`createIdea`) is explicitly and honestly scoped as "sanctioned once wired, not operative today";
  `developer.md`'s and `qa.md`'s two general command-surface mentions are architectural guidance for
  future/engineering code, not claims about these six agents' own current runtime behavior.

**Ruling: the judgment call is well-reasoned, grounded in verified current fact, and correct. Not a
defect.**

### Editorial rules — literal verification

Diffed all six files against `main` (`93f9736`) directly, line by line, not just re-reading the build's
own claim:

- **idea-strategist.md** — Process step 6 (primary-source discipline + "paywalled feeds are
  signal-only," the 2026-08-11/idea-03 citation, the `IdeaValidationError` language) sits entirely
  outside every diff hunk: **byte-for-byte unchanged**. Hard Boundary + brief-richness rules: also
  outside every hunk, unchanged.
- **trend-scout.md** — the primary-source/paywalled-feed rule block (the "chase to the original source"
  / "paywalled feed items ... are fitness signals, but the brief MUST carry at least one openly readable
  link" language) sits entirely outside every diff hunk: **unchanged**.
- **producer.md** — brand-safety line ("Banned words never survive...") and the Zoho/Camera-Hub/
  Copy-skill sections: outside every diff hunk except one citation-only line swap
  (`loadBannedWords`/`loadCopyRules` replacing the raw path; the rule clause itself, "are hard filters,"
  untouched). Confirmed by `mcp-schedule.docs-test.ts`, `upload-camera-hub-scripts.docs-test.ts`,
  `producer-agent-copy-skill.test.ts` — all green.
- **Brand safety**, generally: every occurrence I found is either untouched or has only its citation half
  rewritten (`loadBannedWords`/`loadCopyRules` in place of a raw `brand-profile.yaml` mention) — the rule
  half ("hard filters," "applied across every Format") is untouched wording in every instance I checked.
- **No rule text was reworded, compressed, merged, reordered, or "improved" anywhere I checked.**

**One documentation-completeness gap (not a functional defect):** the issue names four protected
categories, including the **anti-rhetoric caption rules**. Those rules do not live in any of the six
`.claude/agents/*.md` files at all — they live in `.claude/skills/write-social-copy/SKILL.md` (confirmed:
`grep -rln "rhetoric\|canned\|Swipe through" .claude/` finds them only there). I confirmed
`git diff main --stat -- .claude/skills/` is empty — that file is genuinely untouched, so the rule is
safe. But `proposal.md`'s "What did NOT change — the protected editorial rules, verbatim" section never
states this explicitly; it enumerates the other three categories with citations and silently omits the
fourth's real location. This should have been named plainly, the same way the build named everything
else. **Low severity — flagging for the record, not failing the slice over it.**

### Also verified

- **Regression-fix claim (4 failures against `format-docs.test.ts`):** plausible and consistent with the
  current all-green state; not independently re-derivable without replaying the build's own edit history,
  which I did not attempt. Not a basis for failure either way.
- **Zero new tests — ruling: this was a real, missed opportunity, medium severity.** This slice
  introduces two brand-new, cheaply-checkable invariants of its own: (a) `idea-strategist.md`'s `tools:`
  frontmatter must never regain `Bash`, and (b) no agent's `description:` field may ever regain the
  Operator's brand name. I confirmed by grep (`grep -rn "tools:" \| grep -l agents` and
  `grep -rn "Bash\b"` across every `*.test.ts`/`*.docs-test.ts`) that **no test anywhere checks either
  invariant.** A future edit that silently re-adds `Bash` to `idea-strategist.md` or reintroduces
  `mundotip`/`Straw Motion` into a `description:` field would pass the entire suite undetected. Given
  AC6's own explicit "the check count does not fall without an explicit note" framing is about exactly
  this kind of silent regression risk, and given these two checks are trivial one-line `assert.doesNotMatch`
  additions to an existing or new docs-test, they should have been added. This compounds the Bash-criterion
  defect above: not only is the Bash boundary not tool-enforced, it is not test-enforced either.

### Additional defect found (not previously called out by the build)

- **`developer.md` (new Bash-rationale bullet, line ~140) points a durable, reusable agent file at a
  transient, single-slice artifact.** It reads: *"...this grant stays; see the OpenSpec change's
  `handoff.md` for the full per-agent Bash rationale."* `developer.md` is read on every future
  `/build-issue` invocation, each with its OWN distinct `openspec/changes/<issue-N-slug>/handoff.md` —
  "the OpenSpec change's `handoff.md`" does not resolve to anything durable or even nameable outside this
  one slice's own build. A future developer agent working on a different issue reading this line has
  nothing to follow. **Medium severity — self-referential pointer to ephemeral content baked into a
  permanent agent file. Repro: read `.claude/agents/developer.md` around the new Bash Guardrails bullet
  (last bullet in the file) on any branch/issue other than this one and note the dangling reference.**

### Defect list

| # | Severity | Defect | Repro |
|---|---|---|---|
| 1 | **High** | AC2 ("no agent holds a blanket `Bash` grant") is not met for 5 of 6 agents, and was achievable via `Bash(<pattern>)` scoping in each `tools:` frontmatter list — a real, documented, actively-used Claude Code mechanism (see "The Bash criterion" above for the three independent proofs). The build's platform-impossibility claim rests on a citation (`docs/producer-worker-permissions.md`) that only documents an unrelated MCP-tool limitation and does not address `Bash` at all. | `grep '^tools:' .claude/agents/*.md` — `developer`, `performance-tracker`, `producer`, `qa`, `trend-scout` all still carry a bare `Bash`. Compare against `~/.claude/settings.json`'s own live `Bash(...)`-scoped rules, or the CLI's `--allowedTools` help text, for proof the syntax exists and works. |
| 2 | Medium | Zero new tests pin the two brand-new invariants this slice itself introduces (`idea-strategist.md` must never regain `Bash`; no `description:` may regain the Operator's brand name) — a silent future regression on either would pass `npm test` undetected. | `grep -rln "tools:" src/**/*.test.ts src/**/*.docs-test.ts` → no results; `grep -rn "Bash\\b" src/**/*.docs-test.ts` → no results. |
| 3 | Medium | `.claude/agents/developer.md`'s new Bash-rationale bullet references "the OpenSpec change's `handoff.md`" as if there were one durable, canonical handoff document — there isn't; every slice has its own, and this one will eventually be superseded/archived. | Read the last Guardrails bullet in `.claude/agents/developer.md`; note it names no specific issue or path, so it cannot resolve for any future `/build-issue` run other than this one. |
| 4 | Low | `proposal.md`'s "protected editorial rules, verbatim" accounting names three of the issue's four protected rule categories with citations, and silently omits the fourth (the anti-rhetoric caption rules) rather than stating plainly that it lives in `.claude/skills/write-social-copy/SKILL.md`, out of this slice's scope, and is confirmed untouched. The underlying fact is fine (verified: `.claude/skills/` has zero diff against `main`) — only the accounting is incomplete. | Read `proposal.md`'s "What did NOT change — the protected editorial rules, verbatim" section; compare against issue #246's four named categories. |

### Note for #247 (the Recipe Skill prose sweep)

- The citation-rewrite mechanics here (typed accessor over raw path, illustrative-path-paired-with-
  resolver carve-out, "split the sentence rather than paraphrase the rule" discipline) are sound and
  worth reusing as-is — verified correct by direct diff inspection across all six files.
- **Do not repeat the Bash-boundary shortcut.** If `#247`'s Skill files carry any tool-permission
  narrowing work at all, use real `Bash(<pattern>)` scoping (verified working in this environment — see
  defect 1) rather than prose-only rationale, and add a docs-test pinning each new, mechanically-checkable
  invariant the slice itself introduces (defect 2's lesson).
- The anti-rhetoric caption rules live in `.claude/skills/write-social-copy/SKILL.md` — #247 will very
  likely touch this exact file. Treat it with the same "verbatim, split don't paraphrase" discipline
  applied here to `idea-strategist.md`'s paywalled-feeds rule, and this time state its handling
  explicitly in the proposal's protected-rules accounting (defect 4's lesson).

---

## Build Report (Round 2)

### Note on the stale test-count baseline (not a defect, per the coordinator)

Round 1 reported `npm test` at 3335/868/0-fail because the branch's actual fork point at the time
differed from the intended `main`@`93f9736`. The coordinator has since rebased this branch onto the real
`93f9736` and confirmed this was an error in the brief, not in the Round-1 build. Post-rebase,
`openspec validate --all --strict` now reports 63 items (was 62 — the rebase brought in `spec/worker`'s
archived capability), and `npm test`'s pre-Round-2 floor is the real 3373/890/0-fail. This section exists
so the discrepancy between Round 1's and Round 2's reported numbers is understood as an environment
correction, not a regression.

### What changed (defects 1–4, all four addressed)

**Defect 1 (High) — the Bash criterion, actually fixed this time.** QA's Round-1 Verdict independently
verified, three ways, that Claude Code genuinely supports `Bash(<pattern>)` scoping (the CLI's own
`--allowedTools` help text; Anthropic's own skill-authoring guidance; live `Bash(...)`-scoped rules
already in the Operator's own `~/.claude/settings.json`) — and that Round 1's citation
(`docs/producer-worker-permissions.md`) never addressed `Bash` at all, only an unrelated MCP-tool
limitation. Every bare `Bash` entry in the five Bash-retaining agents' `tools:` frontmatter is now
replaced with the SAME enumerated command list Round 1 already wrote in prose, expressed as real,
tool-enforced `Bash(<pattern>)` entries:

- `developer.md`: `Bash(git status *)`, `Bash(git diff *)`, `Bash(git log *)`, `Bash(git show *)`,
  `Bash(git add *)`, `Bash(git commit *)`, `Bash(git branch *)` (no `push`), `Bash(gh issue view *)` (no
  other `gh` subcommand), `Bash(npm test)`, `Bash(npm run build)`, `Bash(npm run test:docs)`,
  `Bash(npx tsx *)`, `Bash(node --import tsx --test *)`, `Bash(openspec validate *)`.
- `qa.md`: `Bash(npm test)`, `Bash(npm run test:docs)`, `Bash(openspec validate *)`,
  `Bash(git status *)`, `Bash(git diff *)`, `Bash(git log *)`, `Bash(git show *)`,
  `Bash(gh issue view *)` — no write-capable command granted at all.
- `trend-scout.md`: `Bash(set -a *)`, `Bash(curl *)`.
- `performance-tracker.md`: `Bash(npm run track-performance *)`, `Bash(npm run apify-smoke *)`,
  `Bash(npx tsx src/apify/live/smoke.ts *)`, `Bash(set -a *)`, `Bash(curl *)`.
- `producer.md`: `Bash(npx tsx src/commands/upload-camera-hub-scripts.ts *)`,
  `Bash(npm run export-schedule *)` — exactly these two, nothing else.

Each agent's Bash-rationale prose was rewritten to state the boundary is now **tool-enforced**, and to
keep only the part of the original platform-limitation claim that is actually true: Claude Code still has
no PATH-scoped `Write`/`Edit` (unrelated to Bash, and not disputed by QA). `idea-strategist.md` is
unchanged — it already carried zero `Bash` entries and needed no fix.

**Defect 2 (Medium) — the two Round-1 invariants, and the Round-2 fix itself, are now pinned.** New file
`src/claude-agents/tool-boundary.docs-test.ts` (22 assertions, 3 `describe` suites) proves: (a)
`idea-strategist.md` carries zero `Bash` entries; (b) none of the five other agents carries a bare `Bash`
entry; (c) each of those five carries the SPECIFIC `Bash(<pattern>)` entries its own documented need
requires (checked one command at a time, not just "some pattern exists"); (d) `developer.md` is never
granted `git push` or any `gh pr` subcommand; (e) `qa.md` is never granted `git commit` or `npm install`;
(f) none of the six agents' `description:` field ever names `mundotip`/`MundoTip`/`Straw Motion`.

**Defect 3 (Medium) — the dangling reference, fixed.** `developer.md`'s Bash-rationale Guardrails bullet
no longer points at "the OpenSpec change's `handoff.md`" (which resolves to nothing durable outside this
one slice). It now states the same rationale inline, self-contained, so it reads correctly on any future
`/build-issue` run.

**Defect 4 (Low) — the anti-rhetoric rules' location, stated explicitly.** `proposal.md`'s "What did NOT
change — the protected editorial rules, verbatim" section now names `.claude/skills/write-social-copy/SKILL.md`
as the anti-rhetoric caption rules' real location (quoting the actual rule text found there), states it
is out of this slice's scope, and confirms it untouched (`git diff main --stat -- .claude/skills/` is
empty).

### Files touched (Round 2, in addition to Round 1's)

- `.claude/agents/developer.md` (further edit)
- `.claude/agents/performance-tracker.md` (further edit)
- `.claude/agents/producer.md` (further edit)
- `.claude/agents/qa.md` (further edit)
- `.claude/agents/trend-scout.md` (further edit)
- `.claude/agents/idea-strategist.md` — **unchanged this round** (already correct)
- `src/claude-agents/tool-boundary.docs-test.ts` (new — the one file this change adds under `src/`)
- `openspec/changes/issue-246-agents-typed-commands/proposal.md` (further edit)
- `openspec/changes/issue-246-agents-typed-commands/tasks.md` (further edit — new section 8)
- `openspec/changes/issue-246-agents-typed-commands/specs/agent-command-surface/spec.md` (further edit)
- `openspec/changes/issue-246-agents-typed-commands/handoff.md` (this Round-2 block)

### How to run

- `openspec validate issue-246-agents-typed-commands --strict` — green.
- `openspec validate --all --strict` — green, `Totals: 63 passed, 0 failed (63 items)`.
- `npm test` — green, `# tests 3395 / # suites 893 / # pass 3395 / # fail 0` (main's real floor,
  3373/890, plus this round's 22 new assertions across 3 new suites).
- `npm run test:docs` — green, `# tests 321 / # suites 84 / # pass 321 / # fail 0`.
- The 12 tests/docs-tests pinning these six files (11 pre-existing + the new one), run directly:
  `npx tsx --test src/schedule-batch/mcp-schedule.docs-test.ts src/idea/openly-readable-source-rule.docs-test.ts src/production-spec/producer-agent-copy-skill.test.ts src/format/idea-strategist-brief-richness.test.ts src/commands/upload-camera-hub-scripts.docs-test.ts src/format/format-docs.test.ts src/apify/apify-docs.test.ts src/commands/report.docs-test.ts src/commands/track-performance.docs-test.ts src/schedule-batch/approval-gate.docs-test.ts src/production-spec/producer-agent.docs-test.ts src/claude-agents/tool-boundary.docs-test.ts`
  → `# tests 200 / # suites 43 / # pass 200 / # fail 0` (was 178 before this round; +22, exactly the new
  file's own count — no pre-existing assertion regressed).

### Defect-to-proof mapping (issue #246 Round 2)

| Defect | Fix | Proof |
|---|---|---|
| 1 (High) — Bash not actually scoped | Every bare `Bash` replaced with real `Bash(<pattern>)` entries in `tools:` | `grep '^tools:' .claude/agents/*.md` shows zero bare `Bash` tokens across all six files; `tool-boundary.docs-test.ts`'s first two `describe` blocks (12 assertions) prove it mechanically, including the negative checks (no `git push`, no `gh pr`, no `git commit` for qa) |
| 2 (Medium) — no test pinned the new invariants | `src/claude-agents/tool-boundary.docs-test.ts` added | 22/22 green, part of `npm test`'s always-on gate |
| 3 (Medium) — dangling handoff.md reference | `developer.md`'s Bash-rationale bullet rewritten self-contained | Read `.claude/agents/developer.md`'s Guardrails section — no reference to "the OpenSpec change's `handoff.md`" remains anywhere in the six files (`grep -rn "OpenSpec change's .handoff" .claude/agents/` → no results) |
| 4 (Low) — anti-rhetoric rules' location unstated | `proposal.md` now names `.claude/skills/write-social-copy/SKILL.md` explicitly, with the real rule text quoted | Read `proposal.md`'s "What did NOT change" section |

### Self-review notes (Round 2)

- Deliberately did NOT grant `Bash(git *)` or `Bash(gh *)` broadly to `developer.md` even though QA's own
  cited CLI example uses that exact broad shape — `developer.md`'s own contract explicitly forbids
  `git push` and opening a PR, so the broad form would have been a real, avoidable widening of what it
  can do; enumerated the specific safe subcommands instead, at the cost of a longer `tools:` line.
- Caught my own imprecise citation while writing the defect-4 fix: my first draft of the anti-rhetoric
  rules' location used a `grep` pattern (`"canned"`) that also false-positive-matches the substring inside
  "s-canned" elsewhere in `.claude/`. Re-verified with a tighter pattern before committing the citation
  to `proposal.md`, rather than repeating Round 1's exact failure mode (citing evidence without checking
  it says what I need it to say).
- Re-verified `Bash(curl *)`'s residual breadth (scoped to the `curl` binary, not further to the Apify
  domain — Claude Code's pattern matching has no URL-level concept) is disclosed explicitly in both
  `trend-scout.md`'s guardrail and `proposal.md`, rather than left implicit, given this exact "cited a
  narrower guarantee than what's actually true" failure mode is what Round 1 was failed over.

### Known limits (Round 2, in addition to Round 1's)

- **`Bash(curl *)` (trend-scout, performance-tracker) and `Bash(npx tsx *)`/`Bash(node --import tsx --test *)`
  (developer) are scoped to a binary/invocation shape, not to a narrower target** (a specific domain for
  curl; a specific script for the two run-code patterns) — Claude Code's pattern matching works on command
  text, not semantic scoping. This is a real, disclosed residual breadth, the same class of limitation
  `docs/producer-worker-permissions.md` already accepts for the `mcp__magnific__*` grant it cannot scope
  to one Space id.
- **Exact prefix-vs-exact-match tokenization at the boundary (e.g. whether `Bash(git status *)` matches a
  bare `git status` with no trailing arguments) was not independently verified against a live Claude Code
  session** — the patterns follow the two documented shapes (exact-match with no trailing space+`*`;
  prefix-wildcard with one) as closely as the available evidence supports, but this specific edge case
  was not re-derived from a live tool call the way QA re-derived the CLI's own help text. Flagged here
  rather than silently assumed correct.
- All Round-1 known limits not superseded by the above (the SQL command-surface cutover remains
  deliberately out of scope; #247 remains untouched) still stand.
