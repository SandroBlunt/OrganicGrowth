---
name: run-trends
description: >-
  Launch a Trend Research Run, at the named Format's own cadence (weekly or daily — ADR-0022), for a named Brand's Format:
  scrape peer Pages (or, for Formats in curated mode, digest curated newsletters) via trend-scout, then suggest brand-fit Idea briefs with Fit Scores.
---

# Run Trends Workflow

Usage: `/run-trends <brand> <format> [<run-id>]`

Kick off one **Run**, at the named Format's own **cadence** (ADR-0022), for one of the named Brand's
**Formats**: discover Trends, then suggest Ideas. `<brand>` and `<format>` are BOTH required —
omitting either is an error, never a silent default. Optional: a run id — when omitted, it DEFAULTS from the Format's own
`cadence` field (`src/format/store.ts`): the current ISO week for `cadence: weekly` (the default,
e.g. `2026-W23`), or the current ISO date for `cadence: daily` (e.g. `2026-08-11`), computed by
`defaultRunId` (`src/format/run-id.ts`). To run the whole Brand, invoke this once per Format.

## Steps

1. **Resolve the Brand and the Format.** Slugify `<brand>` and `<format>` and derive paths:
   - Brand profile: `data/brands/<slug>/brand-profile.yaml` (Brand-wide hard rules only)
   - Format file: `data/brands/<slug>/formats/<format>.yaml` (this Run's voice, sources, mode,
     `ideas_per_run`, `cadence` — see FormatStore, `src/format/store.ts`)
   - Ideas root (Format-namespaced): `data/brands/<slug>/ideas/<format>/<run>/` for a weekly Format;
     for a `cadence: daily` Format this actually resolves to a NESTED directory —
     `data/brands/<slug>/ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/` (ADR-0023,
     `docs/adr/0023-daily-runs-nest-under-their-iso-week-weekday-named.md`) — computed by the ONE deep
     function `runIdeasDirFor(brand, format, run, cadence)` (`src/format/run-id.ts`), never
     hand-reconstructed. The Run's own id stays the plain `<run>` (an ISO date for a daily Format) —
     only the folder it's written under nests.
   - Ledger: `data/brands/<slug>/ledger.json`
   If `data/brands/<slug>/formats/<format>.yaml` does not exist, STOP and list the Brand's actually
   available Formats (the `.yaml` files under `data/brands/<slug>/formats/`) — never guess or fall
   back to a different Format. State the active Brand + Format in the output: "Running trends for
   Brand: `<brand>` · Format: `<format>`."
2. **Determine the run id.** If `<run-id>` was supplied, use it verbatim. Otherwise default it from
   the Format's `cadence` (`defaultRunId(cadence, today)`, `src/format/run-id.ts`): the current ISO
   week for a weekly Format, the current ISO date for a daily Format. Either way, VALIDATE the run id
   (`assertValidRunId`, same module) BEFORE creating any directory.
3. **Check parameters.** Read the Format file. If neither its `sources.seed_pages` nor
   `sources.curated_sources` has any usable entries, pause and ask the Operator to fill them in the
   Format file — don't guess.
4. **Scout trends.** Invoke the **`trend-scout`** subagent with Brand `<brand>` and Format `<format>`. It
   reads the Format file itself and uses its `sources.mode`: `curated` pulls the latest issues from
   `sources.curated_sources`; `peer` scrapes `sources.seed_pages` via Apify and keeps posts that beat
   their own Page's baseline. Either way it clusters the result into Trends and writes
   `data/brands/<slug>/ideas/<format>/<run>/trends.json` + `trends.md` in the same shape.
5. **Suggest ideas.** Invoke the **`idea-strategist`** subagent with Brand `<brand>` and Format `<format>`
   on the trends file. It writes ~`ideas_per_run` (read from the Format file) briefs to
   `data/brands/<slug>/ideas/<format>/<run>/idea-NN.md`, each appended to
   `data/brands/<slug>/ledger.json` as `status: suggested` with a Fit Score AND its Format slug
   (`format: <format>`).
6. **Summarize.** Show a ranked table (id · title · fit_score · trend · one-line why · **source(s)**
   — each Brief's outlet name(s) as clickable links, single-source stories flagged) and prompt the
   Operator: *"Run review-ideas for `<brand>` to accept or reject."*

## Guardrails
- **Brand AND Format are explicit** — both are required; never fall back to a default Brand or a default/"primary" Format.
- All file reads and writes are scoped to `data/brands/<slug>/` — never touch another Brand's paths.
- Sequential: trends first, then ideas. Don't suggest Ideas without fresh Trends.
- Never generate finished content — briefs only.
- If Apify or a curated source fails or returns nothing, report it and stop; do not invent trends or ideas.
