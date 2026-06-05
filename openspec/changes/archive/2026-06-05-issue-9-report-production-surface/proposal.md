## Why

Every prior Producer slice built a *piece* of background production — the Production Spec (#3/#4), the
scheduler (#5), the Space driver's two phases (#6/#7), and the unattended worker (#8). The Operator can
now accept an Idea, watch it move through the Production Queue, pick a Cast, and have the Asset rendered.
But there is **no single surface that shows the whole pipeline at a glance**. `/report` predates the
Producer: it lists Ideas by status and Posts' Fit-vs-Performance, but it knows nothing about the two new
mid-pipeline states the Producer introduced — `casting` (an Idea paused at the Cast gate) and `produced`
(an Asset rendered, awaiting publish). An Operator reading `/report` today cannot see what is currently
in production.

This slice closes that gap and **locks in the final Operator command surface**. Two things must be true
before the Producer feature is "done" end-to-end:

1. **`/report` surfaces production.** It must list the Ideas currently `casting` and `produced` alongside
   this Run's **Fit Scores** (predicted) and measured **Performance Scores**, keeping the two **distinct**
   — never presenting a prediction as a measurement or vice-versa (always-rules #3 "predicted vs measured"
   and #4 "relative, not absolute"). A Performance Score is measured **relative to the Channel baseline**,
   so `/report` shows the baseline too. The render is **read-only** — `/report` never mutates the ledger.

2. **The command surface matches the shipped feature.** Auto-enqueue-on-accept (ADR-0004) replaced the
   old explicit `/produce` kickoff, so there must be **no `/produce`** anywhere in the documented surface.
   The Operator's four touches are **accept → `/pick-cast` → publish → `/log-post`**, with **`/queue`**
   for backlog visibility. Publishing stays the existing **`/log-post`** act — explicit attribution, a
   Post linked to its Idea only via the logged URL, never inferred (always-rules #5). The documented
   **lifecycle** must match what the ledger actually records:
   `suggested → accepted → casting → produced → posted → tracking → scored` (or `rejected`).

This is a **ledger-read + render + docs** slice. It reuses the `loadReport` projection already added to
`src/ledger/ledger.ts` — a read-only view that keeps the **predicted** `fit_score` and the **measured**
`performance_score` as *separate fields* so the renderer can never conflate them. It touches **no Magnific
Space** at all (no production is run by `/report`), so **no fake is needed and no live `spaces_*` /
`creations_*` call is made** — the build stays hermetic.

## What Changes

- **Add a pure report renderer** (`src/commands/report.ts` deep module `renderReport(data, opts?)`) that
  formats the `ReportData` projection for the Operator. It groups Ideas by lifecycle status and, critically:
  - lists a **Production** section showing every Idea in `casting` and in `produced` (the two states the
    Producer introduced), so the Operator sees what is mid-pipeline at a glance;
  - shows each Idea's **Fit Score** and **Performance Score** in **separate, clearly-labelled columns** —
    a Fit Score is rendered as the *predicted* number, a Performance Score as the *measured* number; an
    untracked Idea shows its Performance Score as a placeholder (e.g. `—`), never as `0` and never borrowed
    from the Fit Score;
  - shows the **Channel baseline** (what a Performance Score is relative to), including when it was last
    updated, so a measured score is never read as an absolute count.
- **Reuse `loadReport`** (already in `src/ledger/ledger.ts`) as the read-only projection; wire the thin
  `/report` orchestration shell (`reportCommand(ledgerPath)`) to `loadReport` → `renderReport`. The shell
  prints; it **never writes** any file.
- **Update the `/report` command doc** (`.claude/commands/report.md`) to describe the production surface
  (the `casting` / `produced` Ideas) and to state explicitly that predicted (Fit Score) and measured
  (Performance Score) are kept distinct, with the baseline shown.
- **Finalize the command-surface docs:**
  - `CLAUDE.md` — remove the stale "Production Spec … written by `/produce`" reference (the spec is
    written when an accepted Idea is produced by the background Producer, not by a `/produce` command). The
    pipeline narrative and the lifecycle line already read
    `suggested → accepted → casting → produced → posted → tracking → scored`; confirm and keep them.
  - `CONTEXT.md` — confirm the relationships describe **accept → pick-cast → publish → log-post** with the
    two human gates and auto-enqueue, and that no `/produce` command is implied.
  - Confirm `/queue`, `/pick-cast`, and `/log-post` command docs exist and describe the shipped surface;
    confirm there is **no `/produce` command file**. (Slice #7 shipped the `/pick-cast` *code* but never
    authored its command doc — this slice adds the missing `.claude/commands/pick-cast.md` so the
    documented surface matches the shipped feature.)
- **Tests** (`src/commands/report.test.ts`) — `renderReport` lists `casting` and `produced` Ideas; keeps
  Fit Score (predicted) and Performance Score (measured) in separate columns and never shows a Fit Score
  in the Performance column (or vice-versa); shows an untracked Idea's Performance Score as a placeholder,
  not `0`; shows the baseline; is pure (no I/O, deterministic); and the orchestration shell `reportCommand`
  reads a fixture ledger via `loadReport` and writes nothing. A docs-surface test asserts the documented
  command surface (no `/produce`; `/queue` + `/pick-cast` + `/log-post` present) and the lifecycle string
  match the shipped feature.

## Capabilities

### Added Capabilities

- `report-surface`: the read-only `/report` pipeline view. It surfaces production (`casting` and
  `produced` Ideas) alongside this Run's predicted **Fit Scores** and measured **Performance Scores**,
  kept strictly distinct (predicted never presented as measured), with a measured score shown relative to
  the Channel baseline. `/report` reads the ledger (the source of truth) and **never mutates** it. The
  capability also pins the **final Operator command surface** — no `/produce`; the four touches are
  **accept → `/pick-cast` → publish → `/log-post`**, with `/queue` for backlog — and the documented
  **lifecycle** `suggested → accepted → casting → produced → posted → tracking → scored` (or `rejected`),
  which SHALL match the statuses the ledger records.

## Impact

- **New code:** `src/commands/report.ts` (pure `renderReport` deep module + thin `reportCommand` shell)
  and `src/commands/report.test.ts`. Reuses the already-added `loadReport` / `ReportData` projection in
  `src/ledger/ledger.ts` (kept; not duplicated).
- **Docs touched:** `.claude/commands/report.md` (production surface + predicted-vs-measured), a NEW
  `.claude/commands/pick-cast.md` (the missing command doc for the already-shipped `/pick-cast` code),
  `CLAUDE.md`
  (remove the stale `/produce` reference; confirm lifecycle), `CONTEXT.md` (confirm the accept →
  pick-cast → publish → log-post surface). The lifecycle line and ADR-0003 already carry the final
  lifecycle; this slice makes `/report` and the docs consistent with it.
- **Reuses, does not duplicate:** `loadReport` / `ReportData` / `ReportIdea` / `ReportBaseline` in
  `src/ledger/ledger.ts`; the ledger's on-disk shape (`fit_score`, `performance_score`, `status`,
  `post_url`, `baseline.updated_at`) is **unchanged** — `/report` is a read-only projection over it.
- **No new dependencies.** No state-file shape changes.
- **Hermetic / no live Space:** `/report` runs no production and touches no Magnific Space — there are
  **no** `spaces_*` / `creations_*` calls, no credits, no board mutation, no network, and **no Magnific
  fake is needed** (no Space touchpoint in this slice). Tests read a fixture/temp-file ledger only.
- **Always-rules upheld:** **predicted-vs-measured / relative-not-absolute** — `renderReport` keeps
  `fit_score` (predicted) and `performance_score` (measured) in separate labelled columns, never showing
  one as the other, and shows the Channel baseline a measured score is relative to; an untracked Idea's
  Performance Score is a placeholder, never `0` and never the Fit Score. **Ledger-as-source-of-truth /
  read-only** — `/report` reads `data/ledger.json` and writes nothing. **Explicit-attribution** — a
  Post is shown linked to its Idea only via the logged `post_url`, never inferred. **Generate-never-
  publish / public-metrics-only** are n/a here (no production is run, no metrics are fetched).
