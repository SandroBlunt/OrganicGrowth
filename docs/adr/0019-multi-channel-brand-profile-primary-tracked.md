# Brand Profile's Channel becomes a list, one entry primary; tracking stays 1:1 for now

**Status:** accepted — resolves issue #124 (epic #120). Captured in the 2026-07 grilling.

Epic #120 asked for captions "optimized in tone, content, and length for each social media channel."
Today `brand-profile.yaml`'s `channel` is a single object (`{ name, platform, url }`) and `CONTEXT.md`
states "Exactly one [Channel] per Brand." Grilling surfaced that the Operator does publish the same
Asset natively to several platforms already (manually — publishing stays 100% human per ADR-0002) and
wants each platform's caption tailored to that platform's own tone/length/content rules, not one shared
caption reused everywhere.

## Decision

- **`channel` becomes a list** of Channel entries, each `{ platform, url?, primary? }`. A Brand may
  publish to several platforms; OrganicGrowth composes a Copy variant per platform it's told to target
  (`#128`, `#129`).
- **Exactly one entry per Brand carries `primary: true`** — the Channel performance-tracker, the
  baseline, readiness checks, and ledger attribution still key off of (unchanged machinery). `url` is
  required on the primary entry (today's behavior); optional/blank on the others until the Operator
  supplies it.
- **No `handle` field.** Nothing reads a Channel's own handle today. LinkedIn `@mention` tagging of
  *other* companies/products (`#130`) is resolved through a separate, dedicated lookup (`#126`) — not
  through this list.
- **Concrete platform lists at migration time:**
  - Straw Motion: `facebook` (primary), `instagram`, `linkedin`, `x`, `tiktok`
  - MundoTip: `facebook` (primary), `instagram`, `x`, `tiktok`
- **Scope this round (deferred: per-Channel performance tracking).** Only the data model (`#127`) and
  per-platform Copy (`#128`, `#129`, `#130`) ship against this decision. `performance-tracker`, the
  baseline, and ledger attribution are **not** made per-Channel now — they keep reading the one
  `primary` entry exactly as they read the single `channel` object today. Scoring Posts per platform is
  a deliberate future epic, filed once the Operator is actually ready to track more than one platform.

## Why

The Operator's real ask was better captions per platform, not simultaneous native publishing (that
stays manual) and not performance tracking on new platforms (Apify scraping + a baseline per platform is
materially more machinery than this epic asked for). Making `channel` an honest list — rather than
smuggling multiple platforms into the existing singular field, or inventing a separate "caption
platforms" concept parallel to Channel — keeps one Brand-wide place that names every platform a Brand
publishes to, while the explicit `primary` flag keeps today's tracked-Channel code paths (which only
ever read one Channel) working unchanged, with no positional ("first item wins") fragility.

## Consequences

- `CONTEXT.md`'s **Brand** and **Channel** glossary entries update: a Brand now has **one or more**
  Channels, exactly one `primary` (§ below).
- `#127` migrates Straw Motion's and MundoTip's `brand-profile.yaml` to the list shape above and extends
  the typed Brand Profile store to read it; every existing caller of the old singular `channel.platform`/
  `channel.url` (readiness checks, `src/apify/platform.ts`) reads the `primary` entry instead.
- `#128`/`#129` consume the non-primary entries too, to know which platforms need a Copy variant.
- `#130`'s LinkedIn `@mention` resolution is unaffected by this list shape — it depends on `#126`'s
  separate lookup, not on anything added here.
- A future epic (not scoped now) would extend `performance-tracker`/baseline/ledger to score Posts per
  Channel instead of only the `primary` one.
