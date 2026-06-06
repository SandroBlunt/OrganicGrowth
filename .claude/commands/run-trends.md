---
name: run-trends
description: "Launch the weekly Trend Research Run for a named Brand: scrape peer Pages for trends, then suggest brand-fit Idea briefs with Fit Scores."
---

# /run-trends

Usage: `/run-trends <brand> [<run-id>]`

Kick off one weekly **Run** for the named Brand: discover Trends, then suggest Ideas. `<brand>` is
required — omitting it is an error, never a silent default. Optional: a run id (default = current
ISO week, e.g. `2026-W23`).

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's paths via the resolver:
   - Seeds: `data/brands/<slug>/seeds.yaml`
   - Brand profile: `data/brands/<slug>/brand-profile.yaml`
   - Ideas root: `data/brands/<slug>/ideas/<run>/`
   - Ledger: `data/brands/<slug>/ledger.json`
   State the active Brand in the output: "Running trends for Brand: `<brand>`."
2. **Determine the run id** (e.g. `2026-W23`) and ensure `data/brands/<slug>/ideas/<run>/` exists.
3. **Check parameters.** Read `data/brands/<slug>/seeds.yaml` and `data/brands/<slug>/brand-profile.yaml`.
   If either still has `TODO` placeholders (seed Pages, Channel URL), pause and ask the Operator to fill
   them — don't guess.
4. **Scout trends.** Invoke the **trend-scout** agent with Brand `<brand>`. It scrapes the seed Pages
   via Apify, keeps posts that beat their own page baseline, clusters them into Trends, and writes
   `data/brands/<slug>/ideas/<run>/trends.json` + `trends.md`.
5. **Suggest ideas.** Invoke the **idea-strategist** agent with Brand `<brand>` on the trends file. It
   writes ~`ideas_per_run` briefs to `data/brands/<slug>/ideas/<run>/idea-NN.md`, each appended to
   `data/brands/<slug>/ledger.json` as `status: suggested` with a Fit Score.
6. **Summarize.** Show a ranked table (id · title · fit_score · trend · one-line why) and tell the
   Operator: *"Run `/review-ideas <brand> <run>` to accept or reject."*

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- All file reads and writes are scoped to `data/brands/<slug>/` — never touch another Brand's paths.
- Sequential: trends first, then ideas. Don't suggest Ideas without fresh Trends.
- Never generate finished content — briefs only.
- One Run per week unless the Operator explicitly asks for another.
- If Apify fails or returns nothing, report it and stop; do not invent trends or ideas.
