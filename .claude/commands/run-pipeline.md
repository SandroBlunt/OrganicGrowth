---
name: run-pipeline
description: "Start and conduct the whole weekly loop for a named Brand: readiness check, trends, ideas, review, production, publish, and performance offers — pausing only at the three human gates."
---

# /run-pipeline

Usage: `/run-pipeline <brand>`

Start and conduct the **full weekly loop** for an existing Brand. `<brand>` is required — omitting it
is an error, never a silent default. This is the single-entry-point conductor for the weekly content
pipeline. It drives every phase automatically and pauses only at the three human gates.

## What it does

1. **Resolves the Brand.** Identifies the Brand's ledger, profile, seeds, and queue paths via
   `resolveBrand(brand)`. Every gate prompt restates the Brand so the Operator is always in context.

2. **Runs the readiness check (every launch, never cached).** Live-probes:
   - The Magnific Space (accessible? credits cover at least one cast+render cycle?).
   - The Apify token (valid?).
   - The Brand config (niche, voice, seeds, channel URL, banned words).
   Silent when everything is healthy. Only surfaces issues when there are blocking gaps.
   Phase-scoped: a Space problem doesn't block trend research; a bad Apify token stops research.

3. **Prints a `/rename` hint.** Outputs a line like `/rename mundotip · 2026-W23` — paste it in
   your terminal to rename the session. The conductor does NOT rename the session itself.

4. **Detects in-flight work.** Reads the ledger and queue to determine the current phase. If prior
   work is in progress (Ideas in `casting`, `produced`, or `posted` state), it shows the pending gates
   and asks you to choose:
   - `resume` — re-enqueues any stranded `accepted` Ideas and picks up where you left off.
   - `fresh` — starts a brand-new weekly Run (trend research from scratch).
   **There is no default — you must type your choice.**

5. **Drives the loop, pausing at three human gates:**

   - **Gate 1 — Review.** Invokes trend research + idea review for Brand `<brand>`. After you accept
     Ideas, the conductor auto-drains the Production Queue to the Cast gate (generating character
     images unattended). Run `/run-pipeline <brand>` again once Ideas reach `casting` status.

   - **Gate 2 — Cast pick.** Presents the Ideas waiting at the Cast gate and tells you which
     `/pick-cast <brand> <idea-id> <n>` command to run. After you pick a Character, the producer
     renders the Asset unattended. Run `/run-pipeline <brand>` again once production finishes
     (`produced` status).

   - **Gate 3 — Publish.** Presents the produced Assets and waits for you to publish and log the Post
     URL with `/log-post <brand> <idea-id> <facebook-url>`. After logging, the conductor offers
     `/track-performance <brand>` and `/report <brand>`.

## Guardrails

- **Brand is explicit** — `<brand>` is required; never falls back to a default Brand.
- **Readiness gate is HERE only.** The granular commands (`/run-trends`, `/review-ideas`,
  `/pick-cast`, `/log-post`, `/queue`, `/report`, `/track-performance`) are unguarded power-tools.
- **Generate, never publish.** The conductor pauses for Publish — it never posts to Facebook itself.
- **Resumable.** Loop state is in `data/brands/<slug>/ledger.json` + `data/queue.json`. Re-invoking
  `/run-pipeline <brand>` at any time picks up from the correct gate.
- **No duplicated logic.** The conductor delegates to existing modules: `resolveBrand`, `resolvePhase`,
  `classify`, `checkConfig`, `enqueueOnAccept`, and the granular commands.
- **One week at a time.** The default run is the current ISO week. Running again within the same week
  continues where you left off unless you pick `fresh`.
