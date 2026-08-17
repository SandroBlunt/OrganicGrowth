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

## What Changes — the Bash boundary (revised in Round 2)

**Round 1 got this wrong and Round 2 fixes it.** Round 1 claimed Claude Code has no way to scope `Bash`
to specific commands, citing `docs/producer-worker-permissions.md`. That document only documents a
limitation of MCP tool grants (`mcp__magnific__*` cannot be scoped to one Space id) — it says nothing
about `Bash` and does not generalize to it. QA's Round-1 Verdict independently verified, three ways,
that Claude Code's permission system genuinely supports `Bash(<pattern>)` scoping — an exact-match form
(`Bash(npm test)`) and a prefix-wildcard form (`Bash(git *)`) — via the CLI's own `--allowedTools` help
text, Anthropic's own skill-authoring guidance ("use patterns like `Bash(gh *)` not `Bash`"), and real,
live `Bash(...)`-scoped rules already present in the Operator's own `~/.claude/settings.json`. Round 1's
prose-only narrowing was a real improvement over silence, but it was not what AC2 asked for, and AC2 was
achievable — this is the deciding defect QA's Round-1 Verdict failed the slice over.

Round 2 replaces every bare `Bash` grant with the SAME enumerated command list Round 1 already wrote in
prose, now expressed as individual `Bash(<pattern>)` entries in each agent's own `tools:` frontmatter —
a real, tool-enforced boundary, not a documented-discipline one:

- **`idea-strategist`** does no shell-out anywhere in its process (pure Read/Write/Edit of files and
  LLM authoring) — **`Bash` is removed from its tool list entirely** (unchanged from Round 1).
- **`developer`** keeps `Bash`, now as `Bash(git status *)`, `Bash(git diff *)`, `Bash(git log *)`,
  `Bash(git show *)`, `Bash(git add *)`, `Bash(git commit *)`, `Bash(git branch *)` (deliberately no
  `git push`, mirroring its own "never open the PR yourself" guardrail), `Bash(gh issue view *)`
  (deliberately no other `gh` subcommand — issue/PR authorship stays `/build-issue`'s job),
  `Bash(npm test)`, `Bash(npm run build)`, `Bash(npm run test:docs)`, `Bash(npx tsx *)`, and
  `Bash(node --import tsx --test *)` (this repo's own documented single-file test-run convention), plus
  `Bash(openspec validate *)`.
- **`qa`** keeps `Bash`, now as `Bash(npm test)`, `Bash(npm run test:docs)`,
  `Bash(openspec validate *)`, and read-only `Bash(git status *)`/`Bash(git diff *)`/`Bash(git log *)`/
  `Bash(git show *)`/`Bash(gh issue view *)` — no write-capable git/gh/npm command is granted at all.
  Its tool list also still drops `Write` for `Edit` (unchanged from Round 1).
- **`trend-scout`** keeps `Bash`, now as `Bash(set -a *)` (the `.env` load) and `Bash(curl *)` (the
  Apify scrape calls) — `curl *` is scoped to the `curl` binary, not further to the Apify domain
  specifically, since Claude Code's own pattern matching works on command text, not a URL allowlist; this
  residual breadth is disclosed, not silently assumed away.
- **`performance-tracker`** keeps `Bash`, now as `Bash(npm run track-performance *)`,
  `Bash(npm run apify-smoke *)`, `Bash(npx tsx src/apify/live/smoke.ts *)`, `Bash(set -a *)`, and
  `Bash(curl *)` for the manual-debug fallback.
- **`producer`** keeps `Bash`, now as exactly `Bash(npx tsx src/commands/upload-camera-hub-scripts.ts *)`
  and `Bash(npm run export-schedule *)` — no other command is granted.

Every agent's Guardrails prose was updated to match: each now states its `Bash` grant is
**tool-enforced**, not merely documented, and names the still-genuine platform limitation that remains
true (no path-scoped `Write`/`Edit` — that half of Round 1's claim was correct and is unchanged).

A new docs-test, `src/claude-agents/tool-boundary.docs-test.ts`, pins this Round-2 fix mechanically: no
`tools:` line contains a bare `Bash` entry, every `Bash`-retaining agent's own documented need is
matched by a specific `Bash(<pattern>)` entry actually present in its `tools:` line, developer is never
granted `git push` or any `gh pr` subcommand, and qa is never granted a write-capable git/npm command.
It also pins the two invariants Round 1 shipped with no test at all (see "Doc-conformance," below).

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

**The anti-rhetoric caption rules are not in any of the six `.claude/agents/*.md` files at all.** They
live in `.claude/skills/write-social-copy/SKILL.md` (confirmed: `grep -n "canned\|Swipe through"
.claude/skills/write-social-copy/SKILL.md` finds the rule — "Close on a FRESH engagement CTA every
time — never a canned, repeated line" and the banned boilerplate example, `"Swipe through the 7-slide
..."` — right there), which this change does not touch — confirmed by an empty
`git diff main --stat -- .claude/skills/`. Stated explicitly here (QA Round-1 defect 4) so the second
half of #211, the Recipe Skill prose sweep (#247), knows that file, and this rule's protection, is its
own responsibility, not something already covered by this slice.

No rule's phrasing was tidied, compressed, or modernized while moving it; where a rule and a citation
shared one sentence, the sentence was split rather than paraphrased (e.g. idea-strategist's Guardrails
"Voice comes from the Format, not the Brand" bullet: the citation half was replaced with `loadFormat`,
the rule half — "never from `brand-profile.yaml`'s legacy copy" — is untouched).

## Doc-conformance stays in lockstep, and Round 2 closes its own coverage gap

All 11 pre-existing tests/docs-tests that pin content in these six files (178 assertions total —
`mcp-schedule.docs-test.ts`, `openly-readable-source-rule.docs-test.ts`,
`producer-agent-copy-skill.test.ts`, `idea-strategist-brief-richness.test.ts`,
`upload-camera-hub-scripts.docs-test.ts`, `format-docs.test.ts`, `apify-docs.test.ts`,
`report.docs-test.ts`, `track-performance.docs-test.ts`, `approval-gate.docs-test.ts`,
`producer-agent.docs-test.ts`) remain green, at their original assertion counts, through both rounds.

Round 1 shipped with **zero new tests of its own**, leaving two brand-new invariants it introduced
completely unguarded (QA Round-1 defect 2): that `idea-strategist.md` never regains a `Bash` grant, and
that no agent `description:` ever regains the Operator's brand name. Round 2 adds
`src/claude-agents/tool-boundary.docs-test.ts` (22 assertions), which pins both of those PLUS Round 2's
own fix: every `Bash`-retaining agent grants only scoped `Bash(<pattern>)` entries (never a bare `Bash`),
each matching that agent's own documented need, with `developer` explicitly proven to never hold `git
push` or any `gh pr` subcommand and `qa` explicitly proven to hold no write-capable git/npm command. This
pushes the floor from 178 to 200 assertions pinning these six files — a genuine increase, not a
reshuffle.

## Capabilities

### Added Capabilities

- `agent-command-surface`: the six content/engineering agent definitions under `.claude/agents/` cite
  typed commands/store accessors instead of raw filesystem paths for their pipeline operations, hold no
  unscoped `Bash` grant (every retained `Bash` grant is a scoped `Bash(<pattern>)` entry in `tools:`,
  tool-enforced), and carry no Operator brand name in their indexed `description:` field.

## Impact

- **Modified:** `.claude/agents/developer.md`, `.claude/agents/idea-strategist.md`,
  `.claude/agents/performance-tracker.md`, `.claude/agents/producer.md`, `.claude/agents/qa.md`,
  `.claude/agents/trend-scout.md`.
- **New:** `openspec/changes/issue-246-agents-typed-commands/` (this change);
  `src/claude-agents/tool-boundary.docs-test.ts` (Round 2 — the only file this slice adds under `src/`).
- **Untouched:** every other `.claude/` file (including the Recipe Skill files #211's second half
  covers — `.claude/skills/write-social-copy/SKILL.md` among them), `CONTEXT.md`, every ADR,
  `.claude/rules/always/organicgrowth-rules.md`, and every production module under `src/` (the one new
  `src/` file is a test, exempt from the `node:fs`/store-write boundary guards the same way every sibling
  `*.docs-test.ts` already is).
- **Hermetic.** This slice touches no production code and makes no live Magnific/Apify/Zoho call; its
  proof is the 11 pre-existing pinning suites re-run against the edited files, the new
  `tool-boundary.docs-test.ts`, and the full `npm test` suite for regression.
- **Always-rules upheld, deliberately not extended onto SQL.** Ledger-as-source-of-truth is honored by
  *not* rewiring these agents' real writes onto `src/command-surface/` ahead of the actual cutover — see
  "The one genuine gap" and "What did NOT change" above (QA Round-1 independently verified this judgment
  call sound).
