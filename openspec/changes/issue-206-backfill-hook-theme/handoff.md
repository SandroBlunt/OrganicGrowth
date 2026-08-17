# Slice Handoff — issue-206-backfill-hook-theme

## Build Report (developer, Round 1)

### What changed

Built the Hook Type / Theme classification job for issue #206 — the classifier issue #219 always
deferred to. Concretely:

1. **Migration 4** (`src/db/schema.ts`): additive-only. `ALTER TABLE idea ADD COLUMN` for two new,
   nullable, `CHECK`-constrained columns — `hook_type_source`, `theme_source` — each accepting `NULL`,
   `'heading'`, or `'inferred'`. Migrations 1–3 are untouched byte-for-byte. `CURRENT_SCHEMA_VERSION`
   is now `4`.
2. **`IdeaStore` gains three functions** (`src/idea/store.ts`): `classifyIdea` (the ONE write this whole
   ticket makes — updates an existing Idea's `hook_type`/`theme`/provenance, validated against the closed
   vocabularies and the two-value provenance set before any write), `listAllIdeas` (every Idea across
   every Run — the backfill needs the whole table), `listIdeasByHookType` (the concrete query the issue
   names: "a query for a single hook type returns the expected Ideas").
3. **The typed command surface gains `classifyIdea`** (`src/command-surface/ideas.ts`, re-exported from
   `index.ts`), wrapping `IdeaStore.classifyIdea` exactly like every other command-surface write. Added to
   `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS` so a future direct import outside the
   command surface fails the existing guard.
4. **A new `src/hook-theme-backfill/` module**:
   - `classifications.ts` — the 51 hand-read Brief classifications (all 51 Briefs that carry a hook
     heading — none of the 10 headingless MundoTip Briefs are in this list). Each entry is keyed by the
     SHA-256 of its Brief's exact content (never a file path or title — content is the one thing both the
     classification data and a committed `idea.brief` agree on unambiguously), carries `hookTypeSource`/
     `themeSource` (`"heading"` when the Brief's own Hook concept heading names the technique/subject
     near-verbatim, `"inferred"` when it does not and the classification rests on reading the Brief as a
     whole), and a plain-English `rationale`.
   - `backfill.ts` — the pure `planBackfill` decision core: for each committed Idea, match its brief's
     content hash against the classification data and decide `toUpdate` / `alreadyCorrect` (re-run
     no-op) / `reported` (a genuine vocabulary mismatch — never forced) / `noEntry` (nothing matches,
     e.g. one of the 10 headingless Briefs).
   - `report.ts` — `countClassifications` (per-hook-type/per-theme tallies over the FINAL state) and
     `formatBackfillReport` (a Markdown report: bucket counts, every update's before → after, every
     reported reason, the count tables).
5. **`src/commands/backfill-hook-theme.ts`** — the orchestration shell (`npm run backfill-hook-theme`):
   reads every Idea, plans, applies every planned update through the command surface's `classifyIdea`,
   prints the report. Re-runnable by construction (a second run reports zero updated).

### Files touched

- `src/db/schema.ts`, `src/db/schema.test.ts`, `src/db/migrate.test.ts`
- `src/idea/store.ts`, `src/idea/store.test.ts`
- `src/command-surface/ideas.ts`, `src/command-surface/ideas.test.ts`, `src/command-surface/index.ts`
- `src/store-write-boundary/scan.ts`, `src/store-write-boundary/scan.test.ts`
- `src/hook-theme-backfill/classifications.ts` (+`.test.ts`)
- `src/hook-theme-backfill/backfill.ts` (+`.test.ts`)
- `src/hook-theme-backfill/report.ts` (+`.test.ts`)
- `src/commands/backfill-hook-theme.ts` (+`.test.ts`)
- `package.json` (new `backfill-hook-theme` script)
- `openspec/changes/issue-206-backfill-hook-theme/{proposal.md,tasks.md,handoff.md,specs/**}`

### How to run

```
npm test                                   # tsc --noEmit + the full suite (this slice's new/changed tests included)
node --import tsx --test src/hook-theme-backfill/*.test.ts src/commands/backfill-hook-theme.test.ts
npx openspec validate issue-206-backfill-hook-theme --strict
npx openspec validate --all --strict
```

The real run against the Operator's `data/organicgrowth.db` is `npm run backfill-hook-theme` (optionally
`-- --db <path>`) — **deliberately not run as part of this build**; see "Known limits" below.

### Acceptance-criteria self-assessment

| # | Acceptance criterion (issue #206) | Proven by |
| --- | --- | --- |
| 1 | All 61 existing Briefs are read and assigned a `hook_type`/`theme` from the closed vocabularies | `classifications.test.ts` ("carries exactly 51 entries", "every classified entry's hookType/theme is a real, closed-vocabulary member"); the 10 headingless Briefs deliberately keep the importer's own `unclassified` — proven not-reclassified by `classifications.test.ts`'s "none of the 10 known-headingless MundoTip Briefs are classified here" |
| 2 | Both heading spellings (`Hook concept` / `Hook Concept`) are handled | All 51 real files carrying EITHER spelling were read by hand (verified against the repo: 39 `Hook concept` + 12 `Hook Concept` = 51, matching the issue's own stated split) and each has a `classifications.ts` entry; `classifications.test.ts`'s hash-match test proves every entry's content really was read from the real file |
| 3 | A Brief that doesn't fit the closed vocabulary is **reported**, never forced | `backfill.test.ts`'s "an Idea whose brief matches a REPORTED entry is surfaced as reported — never forced into the nearest term" (synthetic data — no real Brief triggered this; see Known limits); `classifications.ts`'s `ReportedBrief` type is real, exercised code, not a stub |
| 4 | Classifications are written through `IdeaStore`, never direct SQL | `src/idea/store.ts`'s `classifyIdea` is the only function that sets `hook_type`/`theme` after creation; `store-write-boundary` guard (`scan.ts`'s `STORE_WRITE_FUNCTIONS`) fails the build on any future direct import outside `src/command-surface/`; `backfill-hook-theme.test.ts` calls `backfillHookTheme`, which calls only `command-surface.classifyIdea` |
| 5 | The job is re-runnable and reports what changed | `backfill.test.ts`'s "an Idea already carrying the desired values ... is alreadyCorrect, not toUpdate — idempotent"; `backfill-hook-theme.test.ts`'s "is re-runnable: a second call against an already-backfilled database updates nothing"; `report.test.ts` proves the report lists every update's before → after |
| 6 | A query for a single hook type returns the expected Ideas | `idea/store.test.ts`'s `listIdeasByHookType` describe block (returns only the matching Ideas; `[]` for a hook type none carry); also specified in `openspec/changes/issue-206-backfill-hook-theme/specs/idea-store/spec.md` |
| 7 | Counts per hook type and per theme are posted on this issue | See "Counts to post on issue #206" below — computed directly from `BRIEF_CLASSIFICATIONS` (the 51 real classifications) plus the 10 known `unclassified` Briefs, and proven consistent by `classifications.test.ts`'s "counts every hook_type and theme used" (sums to 51) |

### The review sample (Operator sanity-check — before treating any classification as final)

Ten classifications, spread across **all ten real Hook Types**, biased toward the lowest-confidence
ones — `hookTypeSource: "inferred"` (the heading named no literal technique, so the call rests on
reading the Brief as a whole). Nine of the ten below are `"inferred"`; the tenth (`irony`) is included
because it is the RAREST hook type in this batch (used exactly once) and has no `"inferred"` alternative
to show instead.

| Brief | Hook text I read | Type assigned | Why |
| --- | --- | --- | --- |
| Nvidia is becoming the bank of AI: Apollo, Blackstone and Goldman are lining up $500 billion | "Open on the role swap, not the number: the world's most valuable chipmaker is turning into a lender to its own customers." | `reframe` (inferred) | No literal "reframe." Nvidia is recast from chipmaker to lender — a familiar thing recast as categorically different. |
| The gap between viral CGI robot demos and manufacturing reality | "Address the gap between viral CGI robot demos and the actual engineering reality of manufacturing washing machines and refrigerators." | `skeptics_question` (inferred) | "Address the gap" promises an honest verdict over the hype-vs-reality gap — no literal doubt-word used, but the shape matches. |
| The best coding model this week is free to download — and it's from China | "the surprise is 'free AND top-tier AND not who you'd guess.'... ships from a Chinese lab (Kimi K3), not a Silicon Valley one" | `underdog_upset` (inferred) | A lesser-known challenger (a Chinese lab) beats the established name (Silicon Valley) at its own game — no literal "underdog" word. |
| OpenAI investigated one sandbox escape and found more | "Most incident counts shrink as the story ages. This one grew once OpenAI started auditing months of its own records." | `counter_intuitive` (inferred) | The outcome (counts GREW under audit) runs against the normal pattern (counts shrink over time) — no literal "counter-intuitive." |
| Anthropic found the spot in Claude that thinks like you | "Open on the eerie-but-fascinating find — a spot in the AI's 'mind' that lights up like a human's" | `oddity` (inferred) | My own lowest-confidence pick in this batch: no literal technique named, and "eerie-but-fascinating find" is a looser match to `oddity`'s "one specific strange detail, out of pattern" than most other entries. Flagging this one specifically for a second look. |
| Google shipped Gemini 3.7 Flash three weeks after 3.6 — and cut the price in half | "Name the exact 21-day gap between 3.6 and 3.7 Flash, highlighting that the model you integrated earlier this month is already last-generation." | `surprising_number` (inferred) | The hook centers one specific figure (21 days) carrying the open, but never uses the word "number" — could arguably also read as `reversal` (yesterday's model made obsolete); flagging as a genuine judgment call. |
| Meta open-weighted a 30B model that runs on one gaming GPU, then wrote 6,000 words about why | "Open on the split screen inside one day: sixty uses of the word 'superintelligence' versus one 30B model that fits on the graphics card in a gaming PC." | `collision` (inferred) | Two things (a word count, a model's size) placed in the same moment for comparison — "split screen" is my own paraphrase of `collision`'s definition, not the Brief's literal word. |
| Hollywood sent legal letters over 15-second AI clips. The new version makes 3 minutes. | "Open on the jump in scale against the legal backdrop: studios objected to a tool that made 15-second clips, and the next release makes 3 minutes" | `contradiction` (inferred) | A capability jump set directly against ongoing legal objection — two facts placed side by side, though the Brief never uses "contradiction" or "contrast." |
| Every hour on Twitch was silently converted into training data for Amazon's models | "Open with the realization that every hour of gaming or talking on Twitch was silently converted into training data" | `reversal` (inferred) | An assumed-private/casual activity is revealed to have been repurposed — reads as an assumption undone, but this is a looser match than most; flagging for a second look. |
| The irony of Microsoft funding OpenAI while building rivals that beat it | "Note the irony of Microsoft funding OpenAI while quietly building models that beat Google, Meta, and xAI" | `irony` (heading) | The ONLY `irony`-typed Brief in this batch — included despite being a literal-heading (high-confidence) match specifically because it's the rarest type, so the Operator can confirm the one example fits their own sense of "irony" before it becomes the sole precedent for that category. |

If the Operator's own reading of "reframe", "collision", "oddity", "reversal", or any of the above
diverges from what's shown here, say so — these are exactly the entries `classifications.ts` (and
`handoff.md`, this doc) can be corrected in before anything is treated as final. The two rows explicitly
flagged above (`Anthropic found the spot in Claude...` / `oddity`, and `Every hour on Twitch...` /
`reversal`) are this classifier's own lowest-confidence calls in the whole batch of 51.

### Counts to post on issue #206

Computed directly from `BRIEF_CLASSIFICATIONS` (the 51 real classifications) plus the 10 Briefs that stay
`unclassified` (no hook heading to read) — this is the state a real `npm run backfill-hook-theme` run
against the Operator's database will produce.

**Per hook_type (61 total):**

| hook_type | count |
| --- | --- |
| `reframe` | 11 |
| `surprising_number` | 10 |
| `unclassified` | 10 |
| `counter_intuitive` | 7 |
| `oddity` | 4 |
| `collision` | 4 |
| `contradiction` | 4 |
| `reversal` | 4 |
| `skeptics_question` | 3 |
| `underdog_upset` | 3 |
| `irony` | 1 |

**Per theme (61 total):**

| theme | count |
| --- | --- |
| `product_or_tool` | 22 |
| `unclassified` | 10 |
| `safety_or_risk` | 9 |
| `pricing_or_cost` | 7 |
| `industry_or_business` | 7 |
| `policy_or_regulation` | 3 |
| `comparison_or_benchmark` | 2 |
| `culture_or_reaction` | 1 |
| `how_to_or_technique` | 0 |
| `lifestyle_or_wellbeing` | 0 |

Two Themes (`how_to_or_technique`, `lifestyle_or_wellbeing`) never appear in this batch — expected: all
51 readable Briefs are Straw Motion's AI-news coverage; MundoTip's household-tips Briefs (the ones that
WOULD plausibly use those two Themes) are exactly the 10 that stay `unclassified`.

### Fakes / fixtures used

- **`withTempDb`** (`src/db/test-support.ts`) — a real, throwaway SQLite file per test, never `:memory:`,
  per this repo's own testing convention.
- **No Magnific fake needed and none used.** This slice never touches a Magnific Space, a Zoho MCP tool,
  or Apify — it is pure SQLite + static classification data. Confirmed: no `spaces_*`/`creations_*`
  import anywhere in the files this slice touches; `magnific`/Zoho MCP tools are not imported.
- **The real Brief files under `data/brands/**`** — read ONLY by `classifications.test.ts` (a test path,
  exempt from the `node:fs` boundary guard) to prove the classification data's `briefSha256` values have
  not drifted from the real, current content. No production code in this slice reads a file off disk.

### Self-review notes

- Considered adding `listIdeasByTheme` alongside `listIdeasByHookType` for symmetry; left it out — the
  issue's own acceptance criterion asks specifically for a hook-type query, and the report's per-theme
  counts are already served by `countClassifications` grouping `listAllIdeas`'s own output, so a second
  dedicated query function would be unused surface, not a proven need.
- Considered writing the real backfill report to a file (mirroring the importer's `--reconciliation-out`
  flag) — dropped it to avoid pulling `node:fs` into `src/commands/backfill-hook-theme.ts` at all
  (keeping it off the `node:fs`-boundary allow-list entirely); the CLI prints to stdout, which is
  sufficient for posting on the issue by hand.
- Confirmed the classification data's own doc comment and the spec deltas both explain the `"heading"` vs
  `"inferred"` provenance distinction consistently, so a future reader of either lands on the same
  understanding.
- Re-read all 51 rationale strings once more end-to-end for internal consistency (hook type name actually
  matches the vocabulary's own stated definition) before finalizing `classifications.ts`.

### Known limits

- **The real run against `data/organicgrowth.db` has not been executed** — per this build's own
  instructions, that is a separate, Operator-gated step handled after QA (mirroring issue #204's own "the
  real run stays Operator-gated" precedent). The counts posted above are computed directly from the
  classification data and are what that real run will produce, assuming the imported `idea.brief` values
  still match (they should — `data/` is unchanged since the reconciled #204 import).
- **The `"reported"` (vocabulary-mismatch) path is proven only with synthetic data.** None of the 51 real
  Briefs needed it — every one fit one of the 10 closed Hook Types. This is consistent with (not
  contradicted by) the Theme vocabulary's own doc comment recording it was calibrated against a sample of
  these same real Briefs.
- Two of my own 51 classifications are flagged above as the lowest-confidence in the batch (the `oddity`
  and `reversal` picks in the sample table) — worth the Operator's particular attention.

## QA Verdict — Round 1: PASS

Verified inside `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-206-backfill-hook-theme`, HEAD
`134fa68` (rebased onto `4d023e9`), working tree clean. No writes made outside this file; the shared
checkout `/Users/CaxtonTaylor/Developer/OrganicGrowth` and its `data/` were never touched.

### Suite result

| Command | Result |
| --- | --- |
| `npm test` (tsc --noEmit + full suite) | **green** — `tests 3449`, `suites 903`, `pass 3449`, `fail 0` — matches the expected post-rebase figure exactly |
| `npm run test:docs` | **green** — `tests 327`, `suites 84`, `pass 327`, `fail 0` |
| `npx openspec validate --all --strict` | **green** — `Totals: 64 passed, 0 failed (64 items)`, including `change/issue-206-backfill-hook-theme` |
| `npx openspec validate issue-206-backfill-hook-theme --strict` | **green** — `Change 'issue-206-backfill-hook-theme' is valid` |

All four commands were actually executed in this session, not assumed.

### Per-criterion results (issue #206)

| # | Acceptance criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | All 61 Briefs read and assigned `hook_type`/`theme` from the closed vocabularies | **PASS** | Independently re-verified outside the test suite: `find data/brands -regex '.*/idea-[0-9]+\.md$'` finds exactly 61 real Brief files; `BRIEF_CLASSIFICATIONS.length === 51`; a byte-diff of the 51 real straw-motion file paths against every `briefPath` in `classifications.ts` is empty (exact 1:1 match, no missing/no duplicate); the 10 remaining are the MundoTip Briefs, confirmed headingless and confirmed absent from `BRIEF_CLASSIFICATIONS` by hash (see below) |
| 2 | Both heading spellings handled | **PASS** | Independently counted: `grep -rl "## Hook concept"` = 39, `grep -rl "## Hook Concept"` = 12, sum 51 — matches the claimed split and `classifications.test.ts`'s "carries exactly 51 entries" |
| 3 | A Brief that doesn't fit the closed vocabulary is reported, never forced | **PASS, mechanism genuinely wired — see "Report-don't-force" ruling below** | `backfill.test.ts`'s `"an Idea whose brief matches a REPORTED entry is surfaced as reported — never forced into the nearest term"` (line 127) |
| 4 | Classifications written through `IdeaStore`, never direct SQL/DB edit | **PASS** | `classifyIdea` is the only function in `src/idea/store.ts` that sets `hook_type`/`theme` post-creation; `grep -rn "classifyIdea"` across `src/` shows the only direct importer of `../idea/store.ts`'s `classifyIdea` is `src/command-surface/ideas.ts`, and `src/commands/backfill-hook-theme.ts` imports it only from `../command-surface/index.ts`; `store-write-guard.test.ts` (real-repo scan, not a fixture) is green, confirming no other un-audited direct import exists |
| 5 | Job is re-runnable and reports what changed | **PASS** | `backfill.test.ts`'s `alreadyCorrect` idempotency test + `backfill-hook-theme.test.ts`'s `"is re-runnable: a second call ... updates nothing"` (second call: `toUpdate.length === 0`, `alreadyCorrect.length === 1`); `report.ts`'s `formatBackfillReport` prints every update's before→after plus the four bucket counts |
| 6 | Query for a single hook type returns expected Ideas | **PASS** | `listIdeasByHookType`'s own describe block in `idea/store.test.ts`: returns exactly the matching Ideas, `[]` for none |
| 7 | Counts posted on the issue | **PASS, and independently recomputed — see "My own counts" below** | Recomputed directly from the real `BRIEF_CLASSIFICATIONS` array (not merely trusted from the Build Report) plus the known 10 `unclassified`; matches the handoff's table exactly, hookType and theme both sum to 61 |

### Per-scenario results (spec deltas)

**`specs/sqlite-foundation`** (ADDED — Migration 4, all new, no collision with the live spec's existing requirement titles, confirmed by listing):
- "A freshly migrated database reaches schema version 4" — PASS (`migrate.test.ts`'s baseline assertion, `CURRENT_SCHEMA_VERSION === 4`)
- "hook_type_source and theme_source exist, default to NULL, independent" — PASS (`schema.test.ts`)
- "A value outside NULL/'heading'/'inferred' is rejected by CHECK" — PASS (`schema.test.ts`)
- "A pre-#206 database migrates forward touching nothing else" — PASS (`migrate.test.ts`'s new test, lines 219–253: manually applies migrations 1–3 only, asserts columns absent, runs migration 4, asserts the two new columns present and `tablesAfter deepEqual tablesBefore`)

**`specs/idea-store`** (ADDED — `classifyIdea`/`listAllIdeas`/`listIdeasByHookType`, all new titles, no collision):
- "classifyIdea updates hook_type/theme/both provenance, readable back" — PASS (`idea/store.test.ts`)
- "a freshly created Idea carries no provenance until classifyIdea is called" — PASS (`idea/store.test.ts`: `"hookTypeSource" in idea` is `false`)
- "calling classifyIdea again overwrites in place, never a second row" — PASS (`idea/store.test.ts`: `listAllIdeas(db).length === 1` after two calls)
- "an out-of-vocabulary value is rejected before any write" — PASS (4 separate throw tests: hookType, theme, hookTypeSource, themeSource, each confirming the pre-existing value is untouched)
- "classifyIdea throws naming an unknown ideaId" — PASS
- "listAllIdeas returns every Idea across multiple Runs, in creation order" — PASS
- "listIdeasByHookType returns only the matching Ideas" / "[] for none" — PASS

**`specs/command-surface`** (MODIFIED — header verified byte-identical to the live spec's requirement header, see Magnific/archive section below):
- "classifyIdea wraps IdeaStore.classifyIdea, including its validation" — PASS (`command-surface/ideas.test.ts`)
- All five pre-existing scenarios (listTrends/createIdea/enqueueJob/saveAsset/logPost/readPerformance) untouched and still present — confirmed by diff, nothing dropped

**`specs/hook-theme-backfill`** (ADDED — new capability):
- "BRIEF_CLASSIFICATIONS carries exactly 51 entries" — PASS
- "every classified entry's briefSha256 matches the real Brief file on disk" — PASS, and independently re-verified outside the test suite (see "Content hashes" below)
- "no entry classifies a headingless Brief" — PASS, independently re-verified
- "an unclassified Idea whose brief matches a classified entry is planned as toUpdate" — PASS
- "an Idea already carrying the desired values is alreadyCorrect, not toUpdate" — PASS
- "an Idea whose brief matches a reported entry is surfaced as reported, never forced" — PASS
- "an Idea whose brief matches nothing is noEntry, left untouched" — PASS
- "a real backfill run classifies through classifyIdea, never a direct store write" — PASS (`backfill-hook-theme.test.ts`)
- "a second run against an already-backfilled database updates nothing" — PASS
- "the report states final per-hook-type/per-theme counts across every Idea" — PASS (`report.test.ts`, `countClassifications` takes the full patched final-state list, not just this run's writes — confirmed in `backfillHookTheme`'s own `finalIdeas` construction, `backfill-hook-theme.ts` lines 84–88)

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
| --- | --- | --- |
| Generate-never-publish | PASS (N/A — untouched) | This slice touches only `idea.hook_type`/`idea.theme`/provenance; no Asset/publish path is touched |
| Public-metrics-only | PASS (N/A — untouched) | No metrics/Apify code touched |
| Relative-not-absolute | PASS (N/A — untouched) | No scoring/comparison code touched |
| Explicit-attribution | PASS (N/A — untouched) | No Post/attribution code touched |
| Ledger-as-source-of-truth | PASS | `classifyIdea` is the sole write path added; it is routed through `src/command-surface/ideas.ts`; `src/store-write-boundary/scan.ts`'s `STORE_WRITE_FUNCTIONS["src/idea/store.ts"]` now names `classifyIdea` (confirmed by direct read of `scan.ts` line 79); the real-repo `store-write-guard.test.ts` passes, meaning no other module imports `classifyIdea` directly from the store — the guard genuinely covers this new write |
| Magnific fake / hermetic | PASS | `grep -rl "spaces_\|creations_\|magnific"` across every file this slice touches returns nothing (grep exit 1); no `node:fs` import in any non-test file this slice added (`classifications.test.ts`'s real-file read is the one, documented, test-only exception, exempt from the fs-boundary guard by the repo's own `isTestPath` convention); `withTempDb` (real, throwaway SQLite file) is used throughout, never `:memory:` — matches repo convention |

### Report-don't-force mechanism — ruling

**The mechanism is genuinely wired, not a dead path.** Traced end to end:

1. `classifications.ts` defines `BriefClassificationEntry` as a real discriminated union (`"classified"` | `"reported"`) — a `"reported"` entry carries no `hookType`/`theme` at all, so there is no way to accidentally treat it as classifiable data.
2. `backfill.ts`'s `planBackfill` checks `entry.kind === "reported"` BEFORE building any `before`/`after` snapshot, and pushes straight to the `reported` bucket with a `continue` — structurally, a `"reported"` entry can never reach the `toUpdate` branch; there is no code path that could force it into the nearest term even by accident.
3. `backfill-hook-theme.ts`'s `backfillHookTheme` only ever calls `classifyIdea` for `plan.toUpdate` items (line 70's `for (const update of plan.toUpdate)`) — `plan.reported` is never iterated for a write, only carried through to `formatBackfillReport`.
4. `report.ts`'s `formatBackfillReport` prints every `reported` item under `## Reported (N) — genuinely does not fit the closed vocabulary`, with its `reason` — so a real mismatch would be visible in the printed report, not silently dropped.
5. `backfill.test.ts` proves this with synthetic data end-to-end (a synthetic `"reported"` entry, matched by hash, ends up in `plan.reported`, never `plan.toUpdate`).

The honest caveat the Build Report states is correct: none of the 51 real Briefs actually exercises this path, because — as independently confirmed above — every one of the 51 real Briefs was hand-classified as fitting a real vocabulary member. That is a fact about this batch's data, not a weakness in the mechanism. The type system, the planner's branch order, and the orchestration shell's write loop all make forcing structurally impossible, not merely avoided by convention — a developer would have to actively rewrite `planBackfill` to break this. Verdict: the mechanism would really fire if a future Brief were reported.

### The 10 unclassified Briefs — confirmed no value inferred

Independently re-verified (not merely re-reading the test): computed the real SHA-256 of all 10 MundoTip Brief files on disk and confirmed none of the 10 hashes appears anywhere in `BRIEF_CLASSIFICATIONS`. Since `planBackfill` only ever writes for a hash that matches a `"classified"` entry, and these 10 hashes match nothing, `backfillHookTheme` will leave all 10 at whatever the importer already wrote (`unclassified`) — no guess is possible by construction, not merely by the current data being complete.

### The content hashes — confirmed live

Independently recomputed the SHA-256 of the exact Brief content `src/importer/load-brief.ts` reads for all 51 `briefPath` entries in `classifications.ts`, right now, against the files on disk in this worktree: **51/51 match**, 0 mismatches. This genuinely detects a post-classification edit: `planBackfill` matches by content hash only (`backfill.ts` line 150, `entryByHash.get(sha256(idea.brief))`), so any Brief edited after import would produce a different hash, fall through to `noEntry`, and never receive a stale classification — confirmed by the code path (there is no fallback matcher by title/id/path).

### Provenance — confirmed genuinely queryable

`idea.hook_type_source`/`idea.theme_source` are real, `CHECK`-constrained columns (Migration 4), written by `classifyIdea`'s `UPDATE` statement, and returned by `getIdea`/`listAllIdeas`/`listIdeasByHookType` via `toIdeaRecord`'s existing `SELECT *` (they are ordinary columns, not a side-channel log) — `idea/store.test.ts` proves the round-trip (`getIdea` returns `hookTypeSource`/`themeSource` after `classifyIdea`, and the fields are ABSENT, never fabricated, before it is called). Nothing in this build stops a future SQL query filtering `WHERE hook_type_source = 'heading'` — the Operator's stated condition ("show me only the ones actually written down") is answerable today, by a plain `SELECT`, not merely a planned future capability.

### My own counts (independently recomputed from `BRIEF_CLASSIFICATIONS`, not copied from the Build Report)

hook_type (61 total): `reframe` 11, `surprising_number` 10, `unclassified` 10, `counter_intuitive` 7, `oddity` 4, `collision` 4, `contradiction` 4, `reversal` 4, `skeptics_question` 3, `underdog_upset` 3, `irony` 1 — sums to 61.
theme (61 total): `product_or_tool` 22, `unclassified` 10, `safety_or_risk` 9, `pricing_or_cost` 7, `industry_or_business` 7, `policy_or_regulation` 3, `comparison_or_benchmark` 2, `culture_or_reaction` 1, `how_to_or_technique` 0, `lifestyle_or_wellbeing` 0 — sums to 61.

Both match the handoff's posted tables exactly. 51 classified + 10 unclassified = 61, confirmed no Brief is counted twice (51 unique `briefSha256` values, proven by `classifications.test.ts`'s uniqueness test and independently by `new Set(hashes).size === hashes.length`) and none missed (the 51-path diff against the real filesystem listing above is empty).

### Migrations 1–3 frozen, migration 4 additive — confirmed

`git diff main -- src/db/schema.ts` shows migrations 1–3's own SQL strings are byte-for-byte untouched; the only changes are a new `MIGRATION_4` constant, its append to `MIGRATIONS`, and an updated doc comment. `migrate.test.ts`'s new test independently simulates a pre-#206 database (migrations 1–3 applied only), asserts the two new columns are absent beforehand, runs migration 4, and asserts `tablesAfter deepEqual tablesBefore` (no table created/dropped) alongside the two new columns appearing.

### OpenSpec archive-safety check (per the standing MODIFIED-header trap)

Only one spec delta in this change is MODIFIED (`command-surface`); `idea-store`, `sqlite-foundation`, and `hook-theme-backfill` are all ADDED, and their Requirement titles do not collide with anything already in the live specs (checked by listing every existing Requirement heading in both live specs). For the MODIFIED delta: the header `### Requirement: A typed command surface exposes the pipeline's write operations as plain functions over the stores` is **byte-identical** between `openspec/changes/issue-206-backfill-hook-theme/specs/command-surface/spec.md` and the live `openspec/specs/command-surface/spec.md` (confirmed by `grep -n` on both files). The delta's body is a full replacement (adds one clause to the intro sentence and inserts one new Scenario between the existing `createIdea` and `enqueueJob` scenarios); all five pre-existing scenarios are preserved verbatim. `openspec validate --all --strict` is green including this change. I did not run `openspec archive` (out of my tool grant and explicitly out of scope) — based on the header match and the strict validation passing, archiving this change should succeed cleanly, but this is an inference from static inspection, not a live-tested guarantee.

### Defect list

None. No defect found at any severity.

### What to check when the real run happens against the live database

1. **Row count before/after.** `SELECT COUNT(*) FROM idea` should be unchanged (61) — `classifyIdea` only `UPDATE`s, never `INSERT`s.
2. **The 10 MundoTip Ideas stay `unclassified`/`unclassified` with `hook_type_source`/`theme_source` both `NULL`** after the run — confirms `noEntry` really was the outcome for all 10, not a partial/accidental match.
3. **Re-run the command a second time** (`npm run backfill-hook-theme`) and confirm the printed report says `Updated: 0` and every previously-classified Idea appears in the `alreadyCorrect` bucket, not `toUpdate` — this is the re-runnability guarantee actually holding against real, not synthetic, data.
4. **Spot-check a handful of `idea.brief` values in the live database against the corresponding real Brief files on disk** before trusting the run — the classification data's hashes are proven to match the files in THIS worktree right now, but the live `data/organicgrowth.db`'s imported `idea.brief` values are a separate copy (from the #204 import); if that import predates any later hand-edit to a Brief file, the hashes could diverge and the affected Idea(s) would silently land in `noEntry` rather than being updated. Compare `SELECT title, hook_type, theme, hook_type_source, theme_source FROM idea` counts against the posted tables above — if fewer than 51 Ideas get updated, that is the signal something drifted, and the printed `noEntry` list will name exactly which Ideas.
5. **`SELECT COUNT(*) FROM idea WHERE hook_type_source IS NOT NULL`** should read `51` after the run — the concrete "show me only the ones actually written down" query the Operator asked to be answerable.
6. **Run the full test suite once more against `main` post-merge** before considering the slice fully closed, per this repo's usual discipline — not something this Round found a problem with, just standard care given this run writes to the Operator's live database.
