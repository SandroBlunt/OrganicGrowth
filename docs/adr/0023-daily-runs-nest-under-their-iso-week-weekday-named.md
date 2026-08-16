# Daily Run folders nest under their ISO week; the leaf is weekday-named

**Status:** accepted — refines ADR-0022 (a daily Run is named by its ISO date). Independently raised
twice: as Operator instruction on launch day (issue #185) and again in the 2026-08-12 Unhypped Daily
grilling; this ADR records the shared decision and issue #185 is the ticket that builds it.

ADR-0022 gave a daily Run the plain ISO date as its id (`2026-08-11`), sitting flat under the Format
(`ideas/unhypped-daily/2026-08-11/`). In practice, a folder of many single-date siblings is hard for the
Operator to browse and doesn't read as "a week of the daily show" the way the weekly Format's
`2026-W32/` folder does.

## Decision

- A daily Run's folder now **nests under its ISO week**, then a **weekday-named leaf**:
  `ideas/unhypped-daily/2026-W33/tuesday-11-august/` — weekday and month spelled out in lowercase
  English, day zero-padded, computed from the date, never hardcoded (issue #185's exact convention).
- The Run's **canonical id is unchanged**: still the plain ISO date (`2026-08-11`), still what the
  Production Queue and the ledger key on (`run:` in the ledger, queue job keys, `defaultRunId`). Only
  the folder people actually browse changes.
- This is a **display-path change, not an id change** — consistent with the existing rule that a
  recorded `brief_path`/`spec_path` is canonical and always wins over a path reconstructed from the Run
  id (see legacy-layout note in `CLAUDE.md`'s State section). Legacy flat runs (the 2026-08-11 launch
  run) are left in place, untouched, and keep resolving via their recorded paths.
- One deep function (`runIdeasDirFor` in `src/format/`) is the single place this nesting is computed;
  every module that currently reconstructs `ideas/<format>/<run>/…` routes through it. Weekly Formats
  stay byte-identical — this only changes daily-cadence path derivation.

## Why

Browsability for the Operator, who reviews and records against these folders daily, outweighs the
minor cost of the folder name and the Run id no longer matching character-for-character. Nothing
downstream reads week or weekday semantics out of the folder name — it stays exactly as opaque as
ADR-0022 already established the Run id to be. This also consciously relaxes ADR-0022's "no code parses
date semantics out of a Run id" for this one path-derivation function, daily cadence only.
