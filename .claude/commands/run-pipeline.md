---
name: run-pipeline
description: "Start and conduct the whole weekly loop for a Brand (named, picked from a menu, or created on the fly): readiness check, trends, ideas, review, production, publish, and performance offers — pausing only at the three human gates."
---

# /run-pipeline

Usage: `/run-pipeline [<brand>]`

Start and conduct the **full weekly loop** for a Brand. This is the single-entry-point conductor for
the weekly content pipeline. It drives every phase automatically and pauses only at the three human
gates. `<brand>` is **optional** — the conductor never falls back to a silent default Brand; instead,
how you invoke it selects the Brand:

- **`/run-pipeline mundotip`** (known slug) → runs the loop for that Brand.
- **`/run-pipeline newname`** (unknown slug) → offers to **create** that Brand. Accept and a short
  staged interview runs (name, niche, voice, language/region, platform, seed pages), then the Brand is
  scaffolded and the loop proceeds; decline and it stops cleanly (no directory created).
- **`/run-pipeline`** (no argument) → asks **new or existing**, listing the existing Brand slugs. Pick
  one to run it, or choose to create a new Brand (same staged interview). With no Brands yet, it goes
  straight to the new-Brand interview.

## What it does

1. **Resolves (or onboards) the Brand.** Per the invocation above. Once resolved, it identifies the
   Brand's ledger, profile, seeds, and queue paths via `resolveBrand(brand)`. Every gate prompt
   restates the Brand so the Operator is always in context.

2. **Runs the readiness check (every launch, never cached).** Live-probes:
   - The Magnific Space (accessible? credits cover at least one cast+render cycle?).
   - The Apify token (valid?).
   - The Brand config (niche, voice, seeds, channel URL, banned words).
   Silent when everything is healthy. Only surfaces issues when there are blocking gaps.
   Phase-scoped: a Space problem doesn't block trend research; a bad Apify token stops research.

3. **Prints a `/rename` hint.** Outputs a line like `/rename mundotip · 2026-W23` — paste it in
   your terminal to rename the session. The conductor does NOT rename the session itself.

4. **Detects in-flight work.** Reads the ledger and queue to determine the current phase. Only genuine
   production work counts as in-flight — Ideas in `casting`, `produced`, or `posted`/`tracking` state
   (phases `production`, `publish`, `tracking`). Un-reviewed `suggested` Ideas (phase `review`) are
   **not** in-flight — you just haven't started. When in-flight work exists, it shows the pending gates
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

> **Not yet wired — production runtime.** Where this doc says the conductor "auto-drains the
> Production Queue … unattended" and "renders the Asset unattended", that flow is not yet operational.
> There is no live Magnific Space adapter and no running worker host, so accepted Ideas do not move to
> `casting` or `produced` on their own today. The gates, queue, and ledger wiring are in place; the
> unattended production runtime that would drain them is still pending (see the audit's C2). Treat the
> production phases as manual/blocked until that runtime ships.

## Guardrails

- **Brand is explicit, but optional to pass.** `<brand>` may be omitted — the conductor then asks
  new-vs-existing (or offers to create an unknown slug). It never falls back to a silent default Brand.
- **Readiness gate is HERE only.** The granular commands (`/run-trends`, `/review-ideas`,
  `/pick-cast`, `/log-post`, `/queue`, `/report`, `/track-performance`) are unguarded power-tools.
- **Generate, never publish.** The conductor pauses for Publish — it never posts to Facebook itself.
- **Resumable.** Loop state is in `data/brands/<slug>/ledger.json` + `data/queue.json`. Re-invoking
  `/run-pipeline <brand>` at any time picks up from the correct gate.
- **No duplicated logic.** The conductor delegates to existing modules: `resolveBrand`, `resolvePhase`,
  `classify`, `checkConfig`, `enqueueOnAccept`, and the granular commands.
- **One week at a time.** The default run is the current ISO week. Running again within the same week
  continues where you left off unless you pick `fresh`.
