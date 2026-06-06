## 0. OpenSpec authoring

- [ ] 0.1 Write the full OpenSpec change: `proposal.md`, `tasks.md`,
  `specs/brand-commands/spec.md`.
- [ ] 0.2 `npx openspec validate issue-20-brand-scoped-granular-commands --strict` → green.

## 1. TS commands — test-first

- [ ] 1.1 Write failing tests in `src/commands/report.test.ts` — brand-routing:
  - `reportCommand("mundotip", ledgerPath)` reads the mundotip ledger and returns the correct report.
  - `reportCommand("acme", ledgerPath)` reads the acme ledger (a different temp fixture) and returns
    the correct report for acme.
  - Brand A's report does NOT show data from Brand B's ledger.
  - The CLI `main()` without a brand argument emits a usage message and sets a non-zero exit code
    (tested via the public `reportCommand` signature change, not by spawning the CLI).

- [ ] 1.2 Update `src/commands/report.ts`:
  - Add `brand` parameter to `reportCommand(brand: string, ledgerPath?: string)`.
  - When `ledgerPath` is not provided, derive it via `resolveBrand(brand).ledger`.
  - CLI `main()`: read `brand` from `process.argv[2]`; if absent, write usage to stderr and set
    `process.exitCode = 1` (no MundoTip fallback).

- [ ] 1.3 Write failing tests in `src/commands/pick-cast.test.ts` — brand-routing:
  - `pickCastCommand("mundotip", "idea-A", 2, {...})` reads the mundotip ledger.
  - `pickCastCommand("acme", "idea-A", 2, {...})` reads the acme ledger (different temp fixture).
  - Brand A's pick does NOT read Brand B's ledger.

- [ ] 1.4 Update `src/commands/pick-cast.ts`:
  - Add `brand` parameter to `pickCastCommand(brand: string, ideaId: string, n: number, options?)`.
  - When `ledgerPath` / `queuePath` not in options, derive via `resolveBrand(brand)`.
  - CLI `main()`: read `brand` from `process.argv[2]`, `ideaId` from `argv[3]`, `n` from `argv[4]`;
    if `brand` is absent, write usage to stderr and set `process.exitCode = 1`.

- [ ] 1.5 `npm test` → green (all existing tests + new brand-routing tests pass).

## 2. Command markdown files

- [ ] 2.1 Update `.claude/commands/run-trends.md` — add `<brand>` as required first arg; thread
  Brand through all paths; restate Brand in output header.
- [ ] 2.2 Update `.claude/commands/review-ideas.md` — add `<brand>` as required first arg; thread
  Brand; restate Brand at Gate 1 (Review).
- [ ] 2.3 Update `.claude/commands/queue.md` — add `<brand>` as required first arg; note that
  brand-filtering of queue jobs is a future slice.
- [ ] 2.4 Update `.claude/commands/pick-cast.md` — add `<brand>` as required first arg (before
  `<idea-id>`); restate Brand at Gate 2 (Cast pick).
- [ ] 2.5 Update `.claude/commands/log-post.md` — add `<brand>` as required first arg; restate
  Brand at Gate 3 (Publish).
- [ ] 2.6 Update `.claude/commands/track-performance.md` — add `<brand>` as required first arg;
  restate Brand in output.
- [ ] 2.7 Update `.claude/commands/report.md` — add `<brand>` as required first arg; note
  Brand-scoped ledger path.

## 3. Agent markdown files

- [ ] 3.1 Update `.claude/agents/trend-scout.md` — thread Brand slug through all path reads/writes;
  restate Brand in output header.
- [ ] 3.2 Update `.claude/agents/idea-strategist.md` — thread Brand; restate Brand in the ranked
  summary.
- [ ] 3.3 Update `.claude/agents/producer.md` — thread Brand through spec paths and ledger writes;
  restate Brand at Gate 2 (Cast pick).
- [ ] 3.4 Update `.claude/agents/performance-tracker.md` — thread Brand; restate Brand in the
  performance table header.

## 4. Interim default removal

- [ ] 4.1 The `DEFAULT_LEDGER_PATH` in `src/ledger/ledger.ts` and `DEFAULT_BRAND_PROFILE_PATH` in
  `src/production-spec/brand-profile.ts` are currently `mundotip`-scoped transitional defaults (set
  in slice #19). Verify that no CLI entry point falls back to these constants when `<brand>` is
  absent — the CLI must error, not default. The constants themselves may remain for callers that
  already inject their own paths (deep module tests), but must not be silently used by CLI entry
  points.

## 5. Self-review

- [ ] 5.1 `npx openspec validate issue-20-brand-scoped-granular-commands --strict` → green.
- [ ] 5.2 `npm test` → green (typecheck + full suite).
- [ ] 5.3 `npm run build` → exit 0.
- [ ] 5.4 Simplify / dead-code pass; confirm each acceptance criterion maps to a specific named test.
- [ ] 5.5 Write the Build Report into `handoff.md`.
