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
