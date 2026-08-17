## 1. Ground the slice before touching any file

- [x] 1.1 Read issue #246 and issue #211 in full; confirm #246's own scope (the six agent files only)
  and its explicit "if it will not fit, stop and report" escape hatch.
- [x] 1.2 Read `CONTEXT.md`, `.claude/rules/always/organicgrowth-rules.md`, ADRs 0002/0003/0004, and
  `openspec/project.md` to ground vocabulary and confirm the live production/state-of-migration facts.
- [x] 1.3 Read all six existing agent files end-to-end.
- [x] 1.4 Enumerate every `data/brands/<slug>/` and TypeScript-module-path citation per file (`grep -c`),
  and cross-reference against every existing docs-test/`.test.ts` that pins any of the six files'
  content, so no protected sentence is edited blind.
- [x] 1.5 Read `src/command-surface/**` (all 8 modules) to know exactly which pipeline operations it
  covers today, and confirm (via its own doc comments plus `openspec/project.md` plus
  `openspec/changes/archive/2026-08-17-issue-235-guard-residual-holes/proposal.md`'s own precedent) that
  `ledger.json`/`data/queue.json` remain the live, EXPECTED write target — the design decision that
  shapes every citation rewrite below.
- [x] 1.6 Read every existing typed accessor these files should cite instead of a raw path
  (`FormatStore.loadFormat`, `resolveApifyActor`/`detectPlatformFromUrl`, `brand-profile.ts`'s loaders,
  `ledger.ts`'s reads, `AssetStore.writeAsset`, `runIdeasDirFor`) to confirm their real signatures.

## 2. Rewrite `trend-scout.md`

- [x] 2.1 Frontmatter: remove `MundoTip`/`Straw Motion` from `description:`; replace the raw Format-path
  mention with `loadFormat`.
- [x] 2.2 Body: replace every raw `data/brands/<slug>/formats|seeds|brand-profile` citation with
  `loadFormat`/`resolveApifyActor`/`loadBannedWords`/`loadCopyRules`, in both Process sections
  (peer-scrape and curated).
- [x] 2.3 Tighten the Output section's raw-path restatements down to filenames relative to the already-
  named `runIdeasDirFor` resolution.
- [x] 2.4 Add a Guardrails bullet scoping `Bash` to the Apify `curl` calls only.
- [x] 2.5 Leave every editorial rule (primary-source discipline, paywalled-feeds-signal-only) untouched —
  this file carries the SOURCE of those rules that `idea-strategist.md` restates; verify byte-for-byte
  against the pre-edit version.

## 3. Rewrite `idea-strategist.md`

- [x] 3.1 Frontmatter: remove `MundoTip` from `description:`; drop `Bash` from `tools:` (no shell-out
  anywhere in this agent's process).
- [x] 3.2 Body: replace raw Format/brand-profile/ledger citations with `loadFormat`/
  `loadBannedWords`/`loadCopyRules`/`loadIdeas`/`loadReport`.
- [x] 3.3 Leave the Hard Boundary section and the Process step 6 openly-readable-source paragraph
  **completely untouched** — confirmed by re-running `src/idea/openly-readable-source-rule.docs-test.ts`
  and `src/format/idea-strategist-brief-richness.test.ts` after editing (both green, 15 assertions).
- [x] 3.4 Process step 8 (ledger append): name `src/command-surface/ideas.ts`'s `createIdea` as the
  sanctioned command for this operation "once wired," while stating plainly the ledger append is the
  operative write today (rule 7) — the one genuine gap this change closes honestly rather than silently.

## 4. Rewrite `performance-tracker.md`

- [x] 4.1 Restructure `## Process` to lead with `npm run track-performance <brand>` as step 2 (call it,
  report its output verbatim); relabel the manual `curl` mechanics as "what the command does internally
  / manual-debug fallback," preserving every word of the field-mapping table, the score formula, and the
  maturity rule.
- [x] 4.2 Replace the description's/body's raw `data/brands/<slug>/your-data` mentions with "the Brand's
  `your-data/` directory."
- [x] 4.3 Fix the accidental double-`##` heading introduced mid-rewrite (Inputs section).
- [x] 4.4 Add a Guardrails bullet scoping `Bash` to the sanctioned command + the two named debug
  invocations.

## 5. Light-touch `producer.md`, `developer.md`, `qa.md`

- [x] 5.1 `producer.md`: remove `mundotip` from `description:`'s example; soften the "Brand is always
  explicit" paragraph's raw path into a typed-store list; add a Guardrails bullet naming the two CLI
  invocations `Bash` is reserved for. Leave the two illustrative `data/brands/<slug>/...cast/`/
  `...output/` path mentions (already led by the named resolver functions) and the pinned queue-job
  schema guardrail untouched.
- [x] 5.2 `developer.md`: name `src/command-surface/` alongside the existing file-state description as
  the sanctioned write layer above the stores; add a Guardrails bullet stating `Bash`'s scope (git/gh/
  npm/npx/openspec, never live Brand/Space/Zoho data) and why it is not removable for this agent.
- [x] 5.3 `qa.md`: swap `Write` for `Edit` in `tools:`; add a paragraph enumerating the exact commands
  its retained `Bash` grant may run, and update the Output section's instructions from "use the Write
  tool" to "use the Edit tool" for appending the Verdict; update the ledger-as-source-of-truth
  always-rule bullet to name the typed stores instead of a raw path.

## 6. Verify nothing protected regressed

- [x] 6.1 Re-run all five pre-existing docs-tests/tests that pin these six files' content
  (`mcp-schedule.docs-test.ts`, `openly-readable-source-rule.docs-test.ts`,
  `producer-agent-copy-skill.test.ts`, `idea-strategist-brief-richness.test.ts`,
  `upload-camera-hub-scripts.docs-test.ts`) — 43/43 assertions green, same count as before this change
  (no check dropped, none weakened).
- [x] 6.2 `grep` every one of the six files for `data/brands/<slug>` and `mundotip`/`MundoTip`/
  `Straw Motion` post-edit; confirm every remaining hit is either (a) inside an already-protected,
  untouched editorial-rule paragraph, or (b) an illustrative path shown alongside its already-named
  typed resolver — never a bare, unqualified interface citation.
- [x] 6.3 Confirm `producer.md`'s queue-job schema guardrail still cites `src/production-queue/queue.ts`
  verbatim (the pinned `docs-conformance` Scenario) — deliberately NOT rewritten onto the command
  surface; recorded in `proposal.md` with the reasoning.

## 7. OpenSpec + full-suite green + self-review + Build Report

- [x] 7.1 Author `proposal.md` + this `tasks.md` + the `agent-command-surface` spec delta (ADDED
  Requirements only — a brand-new capability, no existing capability spec touched). Run
  `openspec validate --strict` until green.
- [x] 7.2 Run `npm test` — at/above the 3373/890/0-fail baseline measured on `main` before this branch's
  changes.
- [x] 7.3 Self-review pass: re-read all six files end-to-end for coherence (renumbered Process steps,
  no stray markdown heading breaks), confirm every #246 acceptance criterion maps to a concrete,
  checkable proof.
- [x] 7.4 Write the Build Report into `handoff.md`.

## 8. Round 2 — fix QA's Round-1 defects

- [x] 8.1 Read the full QA Round-1 Verdict in `handoff.md`. Verify, don't assume: read
  `docs/producer-worker-permissions.md` directly and confirm it only documents an `mcp__magnific__*`
  limitation, never addressing `Bash` at all — Round 1's citation was a real defect, not a disagreement
  in judgment.
- [x] 8.2 Design a `Bash(<pattern>)` scope per Bash-retaining agent from its OWN already-written prose
  rationale (developer, qa, trend-scout, performance-tracker, producer) — one exact-match or
  prefix-wildcard entry per named command, deliberately excluding `git push`/any `gh pr` subcommand for
  developer and every write-capable command for qa.
- [x] 8.3 Replace every bare `Bash` entry in the five agents' `tools:` frontmatter with its own scoped
  entries; update each file's Bash-rationale prose to state the boundary is now tool-enforced, keeping
  the claimed platform limitation (no path-scoped `Write`/`Edit`) — **this claim was itself later found
  wrong in Round 3, see section 9 below; it is left here as the historical record of what Round 2
  actually believed and shipped, not as a currently-true statement.**
- [x] 8.4 Fix `developer.md`'s dangling "the OpenSpec change's `handoff.md`" reference — replace with a
  self-contained statement of the same rationale, inline, that resolves correctly on any future slice.
- [x] 8.5 Add `.claude/skills/write-social-copy/SKILL.md` as the anti-rhetoric caption rules' real,
  explicitly-named location to `proposal.md`'s protected-rules accounting, confirming it untouched.
- [x] 8.6 Write `src/claude-agents/tool-boundary.docs-test.ts` (test-first for the two invariants QA
  found unpinned): idea-strategist carries no Bash entry; no `Bash`-retaining agent carries a bare
  `Bash`; each carries its own documented scoped entries; developer never holds `git push`/`gh pr`; qa
  never holds a write-capable command; no agent description carries the Operator's brand.
- [x] 8.7 Update the OpenSpec change itself: rewrite `proposal.md`'s Bash section to describe the real
  fix (not the disproven platform-limitation claim); correct its stale "five suites / 43 assertions"
  doc-conformance accounting to the real 11-suite/178-assertion count found during Round 1's own build;
  update the spec delta's Bash Requirement + Scenarios to require tool-enforced scoping and pin the two
  new invariants; update the protected-editorial-rules Requirement with the anti-rhetoric-rules-location
  Scenario. Run `openspec validate --strict` until green.
- [x] 8.8 Re-run all 11 pre-existing pinning suites (178 assertions) plus the new
  `tool-boundary.docs-test.ts` (22 assertions) — all green, floor now 200.
- [x] 8.9 Run `npm test`, `npm run test:docs`, and `openspec validate --all --strict` to green; confirm
  `npm test`'s totals are at/above `main`'s real 3373/890/0-fail floor (the Round-1 number was measured
  against a stale fork point — the Operator's own correction, not a defect of this build).
- [x] 8.10 Append a `Round-2 Build` block to `handoff.md`, never overwriting Round 1 or the QA Verdict.

## 9. Round 3 — fix QA's Round-2 defects

- [x] 9.1 Read the full QA Round-2 Verdict in `handoff.md`. Verify, don't assume — independently
  reproduce, live, rather than trust the report: in an isolated scratch directory outside this repo, use
  the `claude` CLI's own `-p`/`--allowedTools`/`--output-format json` flags to grant exactly
  `Bash(set -a *)` and ask a nested session to run the real `.env`-loading one-liner verbatim — confirmed
  `permission_denials` non-empty, `SET_O_SAFE_LETTERS` reason, matching QA's finding exactly.
- [x] 9.2 Independently verify the proposed fix, live, in the same isolated session: grant the exact
  literal `Bash(set -a; [ -f .env ] && . ./.env; set +a)` (no wildcard) and run the same command —
  confirmed `permission_denials: []`, runs clean.
- [x] 9.3 Apply the exact-match fix to both `trend-scout.md` and `performance-tracker.md`'s `tools:`
  frontmatter and their accompanying Bash-rationale Guardrails prose.
- [x] 9.4 Re-check every OTHER granted `Bash(<pattern>)` pattern across all five Bash-retaining agents
  against the same standard ("does this authorise the literal command the file instructs") — confirmed
  none anchors on a shell builtin that mutates state (`set`, `export`, `cd`, `source`/`.`, `alias`,
  `eval`, `exec`); every other pattern invokes an external binary (`git`, `gh`, `npm`, `npx`, `node`,
  `openspec`, `curl`), which this classifier does not block. `set -a` was the only occurrence, in exactly
  the two files QA named — no other file needed a change.
- [x] 9.5 Independently verify the Round-2 "no path-scoped Write/Edit" claim the same way QA verified the
  Round-1 Bash claim: `grep` the installed Claude Code binary for the CLI's own embedded permission-rule
  reference — confirmed it lists `Edit(docs/**)` as a real example, contradicting the claim.
- [x] 9.6 Live-verify a genuinely tighter `qa.md` grant works both ways, in the same isolated session:
  grant `Edit(openspec/changes/**/handoff.md)`, exercise an Edit against a matching `handoff.md` (allowed,
  file changed) and against a non-matching file (denied, file unchanged) — both confirmed.
- [x] 9.7 Apply the path-scoped `Edit` grant to `qa.md`'s `tools:` frontmatter; correct its prose (and
  `proposal.md`'s/`tasks.md`'s) to state the real, verified capability instead of the disproven claim.
- [x] 9.8 Update the OpenSpec change: `proposal.md`'s Bash section gains a Round-3 correction describing
  both fixes and states plainly that a non-functional-but-present grant is NOT catchable by `npm test` —
  proving a `Bash(<pattern>)`/`Edit(<pattern>)` grant actually authorises its command requires a live
  permission call, outside what a hermetic suite can exercise. Run `openspec validate --strict` until
  green.
- [x] 9.9 Re-run `npm test`, `npm run test:docs`, `openspec validate --all --strict`, and the 12-file
  docs-test set — confirm the 3395/893, 321, and 200 floors all hold or exceed (none regressed).
- [x] 9.10 Append a `Round-3 Build` block to `handoff.md`, never overwriting earlier rounds or either QA
  Verdict.
