# Cadence is a Format property; a daily Run is named by its date

**Status:** accepted — revises the weekly-only cadence rule (always-rule 10's "one Run per week")
into a per-Format default; extends ADR-0013 (what a Format owns). Captured in the 2026-08 Unhypped
Daily grilling.

News goes stale in a week. Straw Motion's new **Unhypped Daily** Format needs one Run per day — and
the week-shaped Run id (`2026-W32`) was only ever convention: no code parses week semantics out of a
Run id (it is an opaque label used for paths and exact-match filters).

## Decision

- A **Format owns its cadence**: `weekly` (the default — every existing Format is unchanged) or
  `daily`. "One Run per week" becomes "one Run per cadence period per Format".
- A daily Run is **named by its ISO date** (`2026-08-11`); a weekly Run stays week-named
  (`2026-W32`). The Run id remains an opaque label everywhere else.
- A daily Format looks back **1 day**, not 7 (its own `lookback_days`).

## Why

The Operator explicitly chose the daily commitment — six ~50-second scripts recorded each morning,
under an hour, as the first task of the day — over weekly-only freshness. The trade-off (a Review
gate and an attended production pass every day, in exchange for same-day news) was weighed and
accepted. The volume consequence lands on the Schedule Batch, which must place several posts per day
(its own slice).
