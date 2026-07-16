---
name: run-trends
description: "Launch the weekly Trend Research Run for a named Brand's Format: scrape peer Pages (or, for Formats in curated mode, digest curated newsletters) via trend-scout, then suggest brand-fit Idea briefs with Fit Scores. A Run is scoped to ONE Format (ADR-0013) — its own sources, voice, and idea count come from that Format's file, never the Brand. Running the whole Brand is a loop over its Formats."
---

# /run-trends

Usage: `/run-trends <brand> <format> [<run-id>]`

Kick off one weekly **Run** for one of the named Brand's **Formats**: discover Trends, then suggest
Ideas. `<brand>` and `<format>` are BOTH required — omitting either is an error, never a silent
default (there is no "the Brand's default Format"; a Brand may run several). Optional: a run id
(default = current ISO week, e.g. `2026-W23`). To run the whole Brand, invoke this once per Format.

## Steps

1. **Resolve the Brand and the Format.** Slugify `<brand>` and `<format>` and derive paths:
   - Brand profile: `data/brands/<slug>/brand-profile.yaml` (Brand-wide hard rules only)
   - Format file: `data/brands/<slug>/formats/<format>.yaml` (this Run's voice, sources, mode,
     `ideas_per_run` — see FormatStore, `src/format/store.ts`)
   - Ideas root (Format-namespaced): `data/brands/<slug>/ideas/<format>/<run>/`
   - Ledger: `data/brands/<slug>/ledger.json`
   If `data/brands/<slug>/formats/<format>.yaml` does not exist, STOP and list the Brand's actually
   available Formats (the `.yaml` files under `data/brands/<slug>/formats/`) — never guess or fall
   back to a different Format. State the active Brand + Format in the output: "Running trends for
   Brand: `<brand>` · Format: `<format>`."
2. **Determine the run id** (e.g. `2026-W23`) and ensure `data/brands/<slug>/ideas/<format>/<run>/`
   exists.
3. **Check parameters.** Read the Format file. If neither its `sources.seed_pages` nor
   `sources.curated_sources` has any usable entries, pause and ask the Operator to fill them in the
   Format file — don't guess.
4. **Scout trends.** Invoke the **trend-scout** agent with Brand `<brand>` and Format `<format>`. It
   reads the Format file itself and uses its `sources.mode`: `curated` pulls the latest issues from
   `sources.curated_sources`; `peer` scrapes `sources.seed_pages` via Apify and keeps posts that beat
   their own Page's baseline. Either way it clusters the result into Trends and writes
   `data/brands/<slug>/ideas/<format>/<run>/trends.json` + `trends.md` in the same shape.
5. **Suggest ideas.** Invoke the **idea-strategist** agent with Brand `<brand>` and Format `<format>`
   on the trends file. It writes ~`ideas_per_run` (read from the Format file) briefs to
   `data/brands/<slug>/ideas/<format>/<run>/idea-NN.md`, each appended to
   `data/brands/<slug>/ledger.json` as `status: suggested` with a Fit Score AND its Format slug
   (`format: <format>`) — every Idea is tagged with the Format it belongs to.
6. **Summarize.** Show a ranked table (id · title · fit_score · trend · one-line why) and tell the
   Operator: *"Run `/review-ideas <brand> <run>` to accept or reject."*

## Guardrails
- **Brand AND Format are explicit** — both are required; never fall back to a default Brand or a
  default/"primary" Format.
- All file reads and writes are scoped to `data/brands/<slug>/` — never touch another Brand's paths,
  and never touch another Format's Ideas directory.
- Sequential: trends first, then ideas. Don't suggest Ideas without fresh Trends.
- Never generate finished content — briefs only.
- One Run per Format per week unless the Operator explicitly asks for another.
- If Apify or a curated source fails or returns nothing, report it and stop; do not invent trends or
  ideas.
