---
name: run-trends
description: "Launch a Trend Research Run, at the named Format's own cadence (weekly or daily — ADR-0022), for a named Brand's Format: scrape peer Pages (or, for Formats in curated mode, digest curated newsletters) via trend-scout, then suggest brand-fit Idea briefs with Fit Scores. A Run is scoped to ONE Format (ADR-0013) — its own sources, voice, idea count, and cadence come from that Format's file, never the Brand. Running the whole Brand is a loop over its Formats."
---

# /run-trends

Usage: `/run-trends <brand> <format> [<run-id>]`

Kick off one **Run**, at the named Format's own **cadence** (ADR-0022), for one of the named Brand's
**Formats**: discover Trends, then suggest Ideas. `<brand>` and `<format>` are BOTH required —
omitting either is an error, never a silent default (there is no "the Brand's default Format"; a
Brand may run several). Optional: a run id — when omitted, it DEFAULTS from the Format's own
`cadence` field (`src/format/store.ts`): the current ISO week for `cadence: weekly` (the default,
e.g. `2026-W23`), or the current ISO date for `cadence: daily` (e.g. `2026-08-11`), computed by
`defaultRunId` (`src/format/run-id.ts`). To run the whole Brand, invoke this once per Format.

## Steps

1. **Resolve the Brand and the Format.** Slugify `<brand>` and `<format>` and resolve every input
   through its own typed accessor, never a hand-built path:
   - Brand profile: the Brand's hard rules, read via `src/production-spec/brand-profile.ts`'s
     `loadBannedWords`/`loadCopyRules`.
   - Format file: this Run's voice, sources, mode, `ideas_per_run`, `cadence` — FormatStore's
     `loadFormat(brand, format)` (`src/format/store.ts`, backed by the Brand's `formats/<format>.yaml`).
   - Ideas root (Format-namespaced): `ideas/<format>/<run>/` for a weekly Format; for a
     `cadence: daily` Format this actually resolves to a NESTED directory —
     `ideas/<format>/<ISO-week>/<weekday>-<DD>-<month>/` (ADR-0023,
     `docs/adr/0023-daily-runs-nest-under-their-iso-week-weekday-named.md`) — computed by the ONE deep
     function `runIdeasDirFor(brand, format, run, cadence)` (`src/format/run-id.ts`), never
     hand-reconstructed. The Run's own id stays the plain `<run>` (an ISO date for a daily Format) —
     only the folder it's written under nests.
   - Ledger: the Brand's own ledger, read/written via `src/ledger/ledger.ts`.
   If `loadFormat(brand, format)` reports the Format unknown, STOP and list the Brand's actually
   available Formats (`loadFormat`'s own error names them) — never guess or fall back to a different
   Format. State the active Brand + Format in the output: "Running trends for Brand: `<brand>` ·
   Format: `<format>`."
2. **Determine the run id.** If `<run-id>` was supplied, use it verbatim. Otherwise default it from
   the Format's `cadence` (`defaultRunId(cadence, today)`, `src/format/run-id.ts`): the current ISO
   week for a weekly Format, the current ISO date for a daily Format. Either way, VALIDATE the run id
   (`assertValidRunId`, same module) BEFORE creating any directory — it must be a safe path segment
   (letters, digits, `_`/`-` only); a path-traversal value is rejected loudly, before touching disk.
   Then ensure `runIdeasDirFor(brand, format, run, cadence)` exists (create it if not) — this is the
   Format's flat `<run>/` folder for a weekly Format, or the nested week+weekday folder for a daily
   one (ADR-0023).
3. **Check parameters.** Read the Format file. If neither its `sources.seed_pages` nor
   `sources.curated_sources` has any usable entries, pause and ask the Operator to fill them in the
   Format file — don't guess.
4. **Scout trends.** Invoke the **trend-scout** agent with Brand `<brand>` and Format `<format>`. It
   reads the Format file itself and uses its `sources.mode`: `curated` pulls the latest issues from
   `sources.curated_sources`; `peer` scrapes `sources.seed_pages` via Apify and keeps posts that beat
   their own Page's baseline. Either way it clusters the result into Trends and writes `trends.json` +
   `trends.md` under `runIdeasDirFor(brand, format, run, cadence)` (step 1 above) — shaped the way
   command-surface's `createTrend` (`src/command-surface/trends.ts`) validates a Trend, the sanctioned
   target once Trends move onto the SQL-backed pipeline; today's operative write is the `trends.json`
   file itself (rule 7, `.claude/rules/always/organicgrowth-rules.md`).
5. **Suggest ideas.** Invoke the **idea-strategist** agent with Brand `<brand>` and Format `<format>`
   on the trends file. It writes ~`ideas_per_run` (read from the Format file) briefs to
   `idea-NN.md` (again, under `runIdeasDirFor`'s resolved directory), each appended to the Brand's
   ledger (`src/ledger/ledger.ts`) as `status: suggested` with a Fit Score AND its Format slug
   (`format: <format>`) — every Idea is tagged with the Format it belongs to. Shaped the same way
   command-surface's `createIdea` (`src/command-surface/ideas.ts`) validates an Idea — see
   `idea-strategist.md` for the full detail on today's operative ledger write vs. that command's future
   cutover.
6. **Summarize.** Show a ranked table (id · title · fit_score · trend · one-line why · **source(s)**
   — each Brief's outlet name(s) as clickable links, single-source stories flagged; Operator rule,
   2026-08-11: Ideas are never presented for review without their sources) and tell the
   Operator: *"Run `/review-ideas <brand> <run>` to accept or reject."*

## Guardrails
- **Brand AND Format are explicit** — both are required; never fall back to a default Brand or a
  default/"primary" Format.
- All file reads and writes are scoped to the Brand's own directory (`resolveBrand(brand)`,
  `src/brand/resolver.ts`) — never touch another Brand's paths, and never touch another Format's Ideas
  directory.
- Sequential: trends first, then ideas. Don't suggest Ideas without fresh Trends.
- Never generate finished content — briefs only.
- One Run per cadence period per Format (weekly or daily, per that Format's own `cadence` — ADR-0022)
  unless the Operator explicitly asks for another.
- If Apify or a curated source fails or returns nothing, report it and stop; do not invent trends or
  ideas.
