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
