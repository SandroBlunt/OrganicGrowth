## 1. Ground the slice before touching any file

- [x] 1.1 Read issue #247 and #211's comments in full (the re-measurement, #246's own regression, and
  the Operator's Option A decision). Confirm #246 (blocker) is merged.
- [x] 1.2 Re-derive the measured scope from scratch (`git grep` the three reproduce commands) rather than
  trust #211's stale pre-#213 numbers or the ticket's own #246-era numbers — confirmed 22 files / 96
  distinct paths / 227 mentions on `main` at `4d023e9`, matching the ticket body exactly.
- [x] 1.3 Read all 12 `.claude/commands/*.md` files, all 16 `.claude/skills/*/SKILL.md` files, both
  `.claude/rules/always/*.md` files, and `CLAUDE.md` end-to-end.
- [x] 1.4 Read the six `.claude/agents/*.md` files end-to-end and cross-check every citation against the
  eight `src/command-surface/` categories, to find (or rule out) the "one correction from #246" the
  build brief calls for.
- [x] 1.5 Enumerate every existing docs-test/`.test.ts` that pins content in any file this change might
  touch, so no protected sentence (a craft rule, a pinned regex) is edited blind.

## 2. Rewrite the Recipe Skills — plumbing only, every craft rule untouched

- [x] 2.1 `produce-character-explainer/SKILL.md`: convert the `brand-profile.yaml` path, the Idea-brief
  path (now `resolveBriefPathCandidates`, `src/format/brief-path.ts`), and the Spec-save path echo
  (already led by `specPathFor` — the raw path echo dropped).
- [x] 2.2 `produce-news-carousel/SKILL.md`: the same three conversions.
- [x] 2.3 `produce-news-short-script/SKILL.md`: the same three conversions.
- [x] 2.4 `write-social-copy/SKILL.md`: convert the one `brand-profile.yaml` mention; confirm every
  writing rule (fresh-CTA, the banned canned closer, grounded companies, the dash-tell ban, the LinkedIn
  mention mechanics) is untouched by diffing against `main`.
- [x] 2.5 `fetch-curated-source/SKILL.md`: convert the `seeds.yaml` mention to `resolveBrand(brand).seeds`
  (`src/brand/resolver.ts`).
- [x] 2.6 Confirm the 11 model-prompting Skill files carry no citation needing conversion and are
  untouched (`git diff main --stat -- .claude/skills/`).

## 3. Rewrite the commands (`.claude/commands/`)

- [x] 3.1 `run-trends.md`: convert the Brand-profile/Format-file/Ideas-root/ledger citations in step 1;
  name `createTrend`/`createIdea` (command-surface) alongside the trends.json/ledger-append writes in
  steps 4-5, mirroring `idea-strategist.md`'s own established pattern; convert the Guardrails scope
  bullet.
- [x] 3.2 `review-ideas.md`: convert the Gate-1 ledger mention, the Brief-path fallback's raw-path
  illustration, and the accept/reject writes (naming `recordReviewDecision`); convert the Guardrails
  bullet.
- [x] 3.3 `pick.md` / `pick-cast.md`: name `resolveGate` (gates) alongside the existing, deliberate
  file-queue-vs-SQL-job-table distinction; convert the cast-candidate path to `castCandidatesDirFor`;
  convert the Guardrails ledger mention.
- [x] 3.4 `log-post.md`: name `logPost` (Posts) for the `post_url` write; convert the ledger-read and
  Guardrails mentions.
- [x] 3.5 `queue.md`: name `enqueueJob`/`claimJob`/`releaseJob` (Jobs) as the SQL job table's own
  operations, stated as a genuinely separate store from the file queue this command reads.
- [x] 3.6 `report.md`: convert both ledger mentions to `src/ledger/ledger.ts`/`resolveBrand`.
- [x] 3.7 `track-performance.md`: name `recordPerformanceSnapshot`/`recordPerformanceScore` (Performance)
  for the metrics write; convert the ledger-read, your-data, and Guardrails mentions.
- [x] 3.8 `backup-media.md`: convert the produced-media-tree and `listBrands` mentions; convert the
  hermetic-build Guardrails mention.
- [x] 3.9 `cleanup-schedule-media.md`: convert the manifest-scan mention to `resolveBrand`.
- [x] 3.10 `export-schedule.md`: name `saveAsset` (Assets) for the `scheduled_at` stamp; convert the
  Idea-load mention.
- [x] 3.11 `run-pipeline.md`: convert the "Resumable" Guardrails mention.
- [x] 3.12 Confirm `build-issue.md` carries no citation needing conversion (untouched).

## 4. Rewrite the always-rules and `CLAUDE.md`

- [x] 4.1 `data-handling.md`: convert the Apify-actor, Meta-export, and ledger-canonical rules to name
  `resolveBrand`/`src/brand/resolver.ts`/`src/ledger/ledger.ts`.
- [x] 4.2 `organicgrowth-rules.md` rule 7: convert its one `data/brands/<slug>/` lead-in to
  `resolveBrand(slug)`. Leave its three existing `src/*.ts` illustrative citations, and the pinned "no
  production caller is wired onto it yet either" clause (`src/db/adr.docs-test.ts`), untouched.
- [x] 4.3 `CLAUDE.md`: convert the `/run-trends`, `/track-performance`, and Meta-export pipeline-narrative
  mentions. Deliberately keep the `## State` section's one lead-in `data/brands/<slug>/` mention (the
  reference table's own scaffold) — recorded with reasoning in `proposal.md`.

## 5. The "one correction from #246" check

- [x] 5.1 Cross-check every citation in the six `.claude/agents/*.md` files against the eight
  command-surface categories (Trends/Ideas/Jobs/Assets/Posts/Performance/gates/Copy). Found: no
  incorrect citation — `idea-strategist.md` already names `createIdea`; `qa.md` already states the exact
  Option A pattern; every other citation names a genuinely separate file-backed store with no SQL
  command-surface equivalent wired to the same data. No agent file edited.

## 6. Verify nothing regressed, and doc-conformance stays in lockstep

- [x] 6.1 `npm run test:docs`: found one line-wrap regression (`export-schedule.docs-test.ts`'s
  `status stays "produced"` regex, split across two lines by an edit) — fixed by rewrapping, not by
  weakening the assertion.
- [x] 6.2 `npm test`: found two failures from literal-path regexes this change legitimately changes the
  underlying prose of (`format-docs.test.ts`'s `formats/<format>.yaml` and Brief-fallback-path checks) —
  fixed one by restoring a light illustrative `formats/<format>.yaml` mention (mirroring the six agents'
  own established convention: name the accessor, then note what file it's backed by); re-pinned the
  other to the SAME substantive claim (`ideas/<Idea.format>/<run>/idea-NN.md`, dropping only the
  `data/brands/<slug>/` prefix the underlying doc no longer states) — never removed, never weakened.
- [x] 6.3 Confirmed `npm run test:docs` at 327/84, 0 fail (same as `main`) and `npm test` at 3401/893,
  0 fail (same totals as `main` at `4d023e9`) — no check dropped, none weakened to assert less.
- [x] 6.4 Re-measured scope: `data/brands/<slug>/` citations 22 files -> 3 (the two out-of-scope agent
  files plus `CLAUDE.md`'s one deliberate reference-table line); module-path mentions rose (96 -> 103
  distinct, 227 -> 277 total) — expected and accepted, the same trade-off #246 made, since naming a
  command-surface function is itself a `src/*.ts` citation.

## 7. OpenSpec + self-review + Build Report

- [x] 7.1 Author `proposal.md` + this `tasks.md` + the `skill-command-surface` spec delta (ADDED
  Requirements only — a new capability, no existing capability spec touched). Run
  `openspec validate --strict` until green.
- [x] 7.2 Self-review: re-diff every touched file against `main`, confirm every changed line is either a
  plumbing citation or (in `format-docs.test.ts`) a re-pinned assertion of the same substantive claim —
  no craft-rule sentence altered.
- [x] 7.3 Write the Build Report into `handoff.md`.
