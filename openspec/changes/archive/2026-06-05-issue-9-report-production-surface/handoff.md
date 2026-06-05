# Slice Handoff — issue #9: /report production state + finalize the Producer command surface

## Build Report (developer)

### What changed

`/report` now surfaces production and the documented Operator command surface is finalized.

- **`/report` surfaces production.** A pure renderer `renderReport(data)` lists the Ideas currently in
  production — every Idea in `casting` and every Idea in `produced` (the two states the Producer
  introduced) — in a dedicated "In production now" section, plus an "All Ideas this Run" table. The table
  keeps **Fit Score (predicted)** and **Performance Score (measured)** in **separate, labelled columns**;
  an untracked Idea's Performance cell is a placeholder (`—`), never `0` and never the Fit Score's value.
  The **Channel baseline** (and its `updated_at`, or "not yet measured") is shown so a measured score is
  read relative to it, never as an absolute count. A Post is shown linked to its Idea **only** via the
  logged `post_url`. An empty ledger renders a clear note instead of crashing.
- **`reportCommand(ledgerPath)`** is a thin orchestration shell: `loadReport` → `renderReport` → return
  string. It READS the ledger and writes nothing (read-only; ledger-as-source-of-truth).
- **Command surface finalized.** Confirmed there is **no `/produce` command**; added the missing
  `.claude/commands/pick-cast.md` (slice #7 shipped the `/pick-cast` code but never its doc), so the
  documented surface now matches the shipped feature: `/queue`, `/pick-cast`, `/log-post` all present,
  the four touches accept → pick-cast → publish → log-post. Removed the stale "written by `/produce`"
  phrase from CLAUDE.md. Confirmed CONTEXT.md already describes the correct surface (no edit needed).
- **Reuses** the `loadReport` / `ReportData` projection already added to `src/ledger/ledger.ts` (the
  predicted `fit_score` and measured `performance_score` are kept as separate fields there too).

### Files touched

- `src/ledger/ledger.ts` — `loadReport` / `ReportData` / `ReportIdea` / `ReportBaseline` read-only
  projection (added in the prior session; reused, not duplicated).
- `src/commands/report.ts` — NEW: pure `renderReport` deep module + thin `reportCommand` shell.
- `src/commands/report.test.ts` — NEW: tests for the renderer, the shell, attribution, empty-ledger, and
  the docs-surface assertions.
- `.claude/commands/report.md` — describes the production surface + predicted-vs-measured + baseline.
- `.claude/commands/pick-cast.md` — NEW: the missing `/pick-cast` command doc.
- `CLAUDE.md` — removed the stale "written by `/produce`" phrase; lifecycle line already final.
- `openspec/changes/issue-9-report-production-surface/` — proposal.md, tasks.md, specs/report-surface/spec.md.

### How to run

- Tests (typecheck + full suite): `npm test`  → `tests 190 / pass 190 / fail 0`.
- Build: `npm run build`  → exit 0.
- Spec validation: `npx openspec validate issue-9-report-production-surface --strict`  → valid.
- Try it: `npx tsx src/commands/report.ts` (prints the report for `data/ledger.json`; writes nothing).

### Acceptance-criteria self-assessment (each → the test that proves it)

1. **`/report` lists Ideas currently `casting` and `produced`, alongside Fit Score vs Performance Score,
   without conflating predicted and measured.**
   - "renderReport — surfaces production (casting + produced) at a glance › lists each casting Idea and
     each produced Idea in a Production section, identified by id/title".
   - "renderReport — keeps Fit Score (predicted) and Performance Score (measured) distinct › renders Fit
     Score and Performance Score under separate, clearly-labelled columns/headers" AND "… never shows a
     Fit Score in the Performance column: an untracked Idea's Performance cell is a placeholder, not 0 and
     not the Fit Score".
   - "renderReport — a measured score is shown relative to the Channel baseline › shows the baseline and
     its updated_at …" (+ the `null` baseline "not yet measured" variant).

2. **The command surface matches the shipped feature (no `/produce`; `/queue`, `/pick-cast`, `/log-post`
   present) and the docs describe accept → pick-cast → publish → log-post.**
   - "command surface — final and matches the shipped Producer feature › ships /queue, /pick-cast,
     /log-post and NO /produce command".
   - "… › report.md describes the production states (casting/produced) and keeps Fit vs Performance
     distinct".

3. **The documented lifecycle matches what the ledger actually records.**
   - "command surface … › CLAUDE.md documents the final lifecycle and carries no stale '/produce' wiring"
     (asserts the exact lifecycle string `suggested → accepted → casting → produced → posted → tracking →
     scored` and the absence of "written by `/produce`"). The statuses asserted are the ones the ledger
     records (`casting` / `produced` come from the writers in `src/ledger/ledger.ts` and the queue
     reflection; `posted`/`tracking`/`scored` from `/log-post` + `/track-performance`).

Supporting (always-rules) tests: "reportCommand — … leaves the ledger file byte-for-byte unchanged"
(read-only / ledger-as-source-of-truth), "renderReport — explicit attribution …" (Post linked only via
the logged `post_url`), "renderReport — empty ledger renders a note, not a crash" (never fabricate),
"renderReport — pure" (deterministic, input not mutated).

### Fakes / fixtures used

- **No Magnific fake, and no Magnific touchpoint at all.** `/report` runs no production — there are no
  `spaces_*` / `creations_*` calls, no credits, no board mutation, no network (verified by grep on the
  new files). Tests use a temp-file ledger (`mkdtemp` + JSON fixtures) only; the renderer tests use
  in-memory `ReportData` fixtures.

### Self-review notes

- `renderReport` is pure (no I/O, input not mutated); `reportCommand` is a thin shell over `loadReport` →
  `renderReport`. The placeholder is a single `NONE` constant reused by `fmtScore` so the
  "never 0 / never borrowed" rule lives in one place. No dead code; no duplicated ledger logic
  (`loadReport` is reused). The `main()` guard prints only when invoked directly and never writes.
- Reflected the newly-added `pick-cast.md` in the proposal Impact + "What Changes".

### Known limits

- `renderReport` emits plain pipe-delimited rows (skimmable text), not aligned/markdown tables — matches
  the existing `/queue` renderer style; column alignment is cosmetic and out of scope.
- The renderer does not compute pipeline counts or a "where prediction diverged" highlight; those are
  presentation niceties the command doc mentions but the issue's acceptance criteria do not require, and
  no ledger field is invented for them.
- This slice does not change any state-file shape; `loadReport` is a read-only projection over the
  existing ledger fields.

---

## QA Verdict — Round 1: PASS

Verified by `qa` (read/run/report only; no product code, tests, specs, or the OpenSpec change were
edited). Branch `issue-9-report-production-surface`, issue #9.

### Suite result — all green (re-run by QA, not taken on faith)

- `npm test` → **tests 190 / pass 190 / fail 0** (suites 83). Includes the typecheck step and the new
  `src/commands/report.test.ts` suites.
- `npx openspec validate issue-9-report-production-surface --strict` → **`Change 'issue-9-...' is valid`** (exit 0).
- `npm run build` (`tsc -p tsconfig.build.json`) → **exit 0**.

### Per-criterion results

1. **`/report` lists `casting` + `produced` Ideas alongside Fit Score vs Performance Score, without
   conflating predicted and measured — PASS.**
   - Production section listing both states: `renderReport` filters on `PRODUCTION_STATES = ["casting","produced"]`
     (`src/commands/report.ts`); proven by *"renderReport — surfaces production … › lists each casting
     Idea and each produced Idea …"* (asserts idea-02/Casting and idea-03/Produced by id + title).
   - Predicted/measured kept distinct: separate labelled columns (`Fit Score (predicted)` /
     `Performance Score (measured)`); proven by *"… keeps Fit Score (predicted) and Performance Score
     (measured) distinct › renders … under separate, clearly-labelled columns"*.
   - **Scrutinized: untracked Performance is neither `0` nor the Fit Score.** `fmtScore(null)` returns the
     `NONE = "—"` placeholder (never `0`, never another column's value), used for both columns via the
     same function. Proven by *"… never shows a Fit Score in the Performance column …"*, which isolates
     the idea-77 row and asserts the Fit value `0.42` appears **exactly once** on the row and that the
     row does **not** match `\b0\.00\b`. Confirmed in code: `performance_score: null` flows through
     `fmtScore` → `—`, independent of `fit_score`.
   - Relative-not-absolute: the Channel baseline (and its `updated_at`, or "not yet measured") is rendered;
     proven by *"a measured score is shown relative to the Channel baseline"* (+ the null-baseline variant).

2. **Command surface matches the shipped feature; docs describe accept → pick-cast → publish → log-post — PASS.**
   - `ls .claude/commands/` shows `queue.md`, `pick-cast.md`, `log-post.md` present and **no `produce.md`**.
     Proven by *"command surface … › ships /queue, /pick-cast, /log-post and NO /produce command"*
     (`assert.rejects` on reading `produce.md`).
   - `pick-cast.md` is the newly added doc for the already-shipped `/pick-cast` code (Gate 2 — Cast pick).
   - report.md describes the production states + predicted-vs-measured; proven by *"report.md describes the
     production states (casting/produced) and keeps Fit vs Performance distinct"*.

3. **Documented lifecycle matches what the ledger actually records — PASS.**
   - CLAUDE.md documents `suggested → accepted → casting → produced → posted → tracking → scored` (line 126),
     and the stale `written by `/produce`` wiring is **gone**; proven by *"CLAUDE.md documents the final
     lifecycle and carries no stale '/produce' wiring"*.
   - QA cross-checked the docs against the **ledger code**: `IdeaStatus` (`src/ledger/ledger.ts:16-24`) is
     the union `suggested | accepted | casting | produced | posted | tracking | scored | rejected` —
     exactly the documented lifecycle, no documented status the type cannot record. The Producer writers
     derive `casting` (cast → `awaiting_cast`) and `produced` (render → `done`) via
     `ledgerStatusForTransition` (`ledger.ts:164-168`); `posted`/`tracking`/`scored` are valid recorded
     statuses owned by `/log-post` + `/track-performance` (downstream, not this slice's code).

### Per-scenario results (spec deltas, `specs/report-surface/spec.md`)

- *Ideas in casting and produced are listed in a production section* — **PASS** (production-section test).
- *Fit Score and Performance Score are kept distinct* — **PASS** (separate-columns + placeholder-not-0/Fit tests).
- *A measured score is shown relative to the Channel baseline* — **PASS** (baseline + null-baseline tests).
- *Rendering the report changes no state* — **PASS** (*"leaves the ledger file byte-for-byte unchanged"*).
- *A Post is linked only via the logged URL* — **PASS** (*"explicit attribution …"*: idea-04 shows its
  logged URL; idea-01 with null `post_url` matches no `https?://`; `ideaRow` uses `idea.post_url ?? ""`).
- *An empty ledger renders a note, not a crash* — **PASS** (*"empty ledger renders a note"*).
- *No /produce command exists in the surface* — **PASS** (surface test).
- *The documented lifecycle matches the ledger* — **PASS** (CLAUDE.md test + `IdeaStatus` cross-check).

### Always-rules + Magnific-fake checks

- **Magnific fake / no live Space — PASS (n/a touchpoint, hermetic).** `/report` runs no production.
  `grep -rniE "spaces_|creations_|apify|fetch\(|http" src/commands/report.ts src/commands/report.test.ts`
  returned only (a) a doc comment asserting "No Magnific, no Apify, no network", and (b) static fixture
  `post_url` strings (`https://facebook.com/post/4`) — no network call, no `spaces_*`/`creations_*`, no
  credits, no board mutation. No Magnific fake needed (no Space touchpoint).
- **Generate-never-publish — PASS.** No publish path; `/report` reads and renders only.
- **Public-metrics-only — PASS (n/a).** No metrics fetched by this slice; renders existing ledger fields.
- **Relative-not-absolute — PASS.** Performance Score is rendered with the Channel baseline it is relative
  to; baseline line states it is "never an absolute count".
- **Explicit-attribution — PASS.** A Post is shown only via the logged `post_url` (`ideaRow`: `idea.post_url ?? ""`);
  never inferred. Verified by the attribution test.
- **Ledger-as-source-of-truth / read-only — PASS.** `reportCommand` = `loadReport` → `renderReport` → return;
  no write of any file. Verified by the byte-for-byte-unchanged test.

### Defect list

None. All acceptance criteria, all spec scenarios, all always-rules, and the Magnific-fake/hermetic check pass.
