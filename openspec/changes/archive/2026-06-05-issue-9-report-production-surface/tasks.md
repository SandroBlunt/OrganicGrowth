## 1. Report renderer — surface production, keep predicted vs measured distinct (test-first)

- [x] 1.1 Write failing tests (`src/commands/report.test.ts`) for the pure `renderReport(data)`:
  - lists a **Production** section containing every Idea whose status is `casting` and every Idea whose
    status is `produced` (the two states the Producer introduced), identified by id/title;
  - renders each Idea's **Fit Score** (predicted) and **Performance Score** (measured) in **separate,
    clearly-labelled columns** — the labels make clear which is the prediction and which is the
    measurement;
  - **never** shows a Fit Score value in the Performance column or a Performance Score in the Fit column
    (no conflation): for an Idea with a `fit_score` and a `null` `performance_score`, the Performance cell
    is a placeholder (e.g. `—`), NOT the Fit Score and NOT `0`;
  - shows the **Channel baseline** (and its `updated_at`, or a "not yet measured" note when `null`) so a
    measured score is read relative to the baseline, never as an absolute count;
  - is **pure**: same input → same output, no I/O, input not mutated.
- [x] 1.2 Implement the pure `renderReport(data: ReportData): string` deep module in
  `src/commands/report.ts`: group Ideas by lifecycle status, emit a Production section for `casting` +
  `produced`, a predicted-vs-measured table (Fit Score column vs Performance Score column, the latter a
  placeholder when `null`), and a baseline line. No I/O.

## 2. /report orchestration shell — read-only, reuse loadReport (test-first)

- [x] 2.1 Write a failing test: `reportCommand(ledgerPath)` reads a temp-file ledger via `loadReport` and
  returns the rendered string; assert the on-disk ledger file is **byte-for-byte unchanged** after the
  call (read-only — `/report` never mutates the ledger; ledger-as-source-of-truth).
- [x] 2.2 Implement the thin `reportCommand(ledgerPath = DEFAULT_LEDGER_PATH)` shell in
  `src/commands/report.ts`: `loadReport` → `renderReport` → return string. Add a guarded `main()` that
  prints (only when invoked directly). No writes anywhere.

## 3. Explicit attribution + empty-ledger handling (test-first)

- [x] 3.1 Write failing tests: a posted Idea is shown linked to its Post **only via the logged
  `post_url`** (never inferred); an Idea with `post_url: null` shows no Post link. An empty ledger renders
  a clear "empty" note rather than crashing.
- [x] 3.2 Implement: render the `post_url` as the attribution link when present; handle the empty-ideas
  case with an explicit note (reuse the defensive `loadReport`, which already degrades garbled records).

## 4. Finalize the command surface + lifecycle docs (test-first on the docs)

- [x] 4.1 Write a failing docs-surface test (`src/commands/report.test.ts` or a small `docs.test.ts`):
  - `.claude/commands/` contains `queue.md`, `pick-cast.md`, `log-post.md` and **does not** contain a
    `produce.md` command file;
  - `CLAUDE.md` contains no stale "written by `/produce`" reference and contains the lifecycle string
    `suggested → accepted → casting → produced → posted → tracking → scored`;
  - the `report.md` command doc mentions the production states (`casting` / `produced`) and keeps Fit
    Score (predicted) vs Performance Score (measured) distinct.
- [x] 4.2 Update `.claude/commands/report.md` to describe the production surface and the
  predicted-vs-measured separation with the baseline shown.
- [x] 4.3 Update `CLAUDE.md`: remove the stale "Production Spec … written by `/produce`" phrase (the spec
  is written by the background Producer when an accepted Idea is produced); confirm the
  accept → pick-cast → publish → log-post narrative and the lifecycle line are present and final.
- [x] 4.4 Confirm `CONTEXT.md` describes accept → pick-cast → publish → log-post with the two gates and
  auto-enqueue, and implies no `/produce` command (adjust only if a stale `/produce` reference exists).

## 5. Self-review

- [x] 5.1 `npx openspec validate issue-9-report-production-surface --strict` green.
- [x] 5.2 `npm test` green (typecheck + full suite); `npm run build` exit 0.
- [x] 5.3 Simplify / dead-code pass; confirm each of the 3 acceptance criteria maps to a specific named
  test.
- [x] 5.4 Write the Build Report into `handoff.md`.
